package com.reviewforge.service;

import com.reviewforge.exception.ReviewForgeException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.time.ZonedDateTime;
import java.util.*;
import java.util.concurrent.Semaphore;

/**
 * Reads public GitHub data for candidate analysis.
 *
 * Rate limiting strategy:
 *  - A Semaphore(5) caps concurrent in-flight requests so burst analysis jobs
 *    don't exhaust the connection pool.
 *  - Every response updates rateLimitRemaining / rateLimitResetEpoch from
 *    X-RateLimit-* headers. When remaining drops to ≤ 3 the next caller
 *    sleeps until the reset window, preventing 403s.
 *  - A GitHub PAT (GITHUB_PAT env var) raises the limit from 60 → 5,000 req/hr.
 */
@Service
@Slf4j
public class GitHubProfileService {

    private static final String GITHUB_API = "https://api.github.com";

    // Cap concurrent outbound calls — protects connection pool during batch runs
    private static final Semaphore CALL_GATE = new Semaphore(5, true);

    @Value("${github.pat:}")
    private String githubPat;

    // Shared rate-limit state updated from every GitHub response
    private volatile int  rateLimitRemaining = 60;
    private volatile long rateLimitResetEpoch = 0;

    // ── Public API ─────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public Map<String, Object> getUserProfile(String login) {
        try {
            ResponseEntity<Map> res = get("/users/" + login, Map.class);
            if (res.getBody() == null) throw new ReviewForgeException("Empty profile response for " + login);
            return res.getBody();
        } catch (HttpClientErrorException.NotFound e) {
            throw new ReviewForgeException("GitHub user not found: " + login);
        } catch (HttpClientErrorException.Forbidden | HttpClientErrorException.TooManyRequests e) {
            throw new ReviewForgeException("GitHub API rate limit exceeded. Add GITHUB_PAT env var to increase to 5,000 req/hr.");
        }
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getPublicRepos(String login, int limit) {
        try {
            ResponseEntity<List> res = get(
                "/users/" + login + "/repos?type=public&sort=pushed&per_page=" + limit, List.class);
            return res.getBody() != null ? res.getBody() : Collections.emptyList();
        } catch (Exception e) {
            log.warn("Could not fetch repos for {}: {}", login, e.getMessage());
            return Collections.emptyList();
        }
    }

    @SuppressWarnings("unchecked")
    public Map<String, Long> getLanguageStats(String owner, String repo) {
        try {
            ResponseEntity<Map> res = get("/repos/" + owner + "/" + repo + "/languages", Map.class);
            Map<String, Long> result = new LinkedHashMap<>();
            if (res.getBody() != null)
                res.getBody().forEach((k, v) -> result.put(k.toString(), ((Number) v).longValue()));
            return result;
        } catch (Exception e) {
            log.debug("Language stats unavailable for {}/{}: {}", owner, repo, e.getMessage());
            return Collections.emptyMap();
        }
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getRecentMergedPRs(String owner, String repo, int limit) {
        try {
            ResponseEntity<List> res = get(
                "/repos/" + owner + "/" + repo + "/pulls?state=closed&sort=updated&direction=desc&per_page=10",
                List.class);
            if (res.getBody() == null) return Collections.emptyList();
            return ((List<Map<String, Object>>) res.getBody()).stream()
                    .filter(pr -> pr.get("merged_at") != null)
                    .limit(limit)
                    .toList();
        } catch (Exception e) {
            log.debug("Could not fetch PRs for {}/{}: {}", owner, repo, e.getMessage());
            return Collections.emptyList();
        }
    }

    public String getPRDiff(String owner, String repo, int prNumber) {
        try {
            HttpHeaders headers = buildHeaders();
            headers.set("Accept", "application/vnd.github.diff");
            waitIfRateLimited();
            CALL_GATE.acquire();
            try {
                ResponseEntity<String> res = new RestTemplate().exchange(
                    GITHUB_API + "/repos/" + owner + "/" + repo + "/pulls/" + prNumber,
                    HttpMethod.GET, new HttpEntity<>(headers), String.class);
                updateRateLimitFromHeaders(res.getHeaders());
                return res.getBody();
            } finally {
                CALL_GATE.release();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        } catch (Exception e) {
            log.debug("Could not fetch diff for {}/{}/#{}: {}", owner, repo, prNumber, e.getMessage());
            return null;
        }
    }

    /**
     * Returns up to 100 commit dates (ISO-8601) for the given author in the given repo.
     * Used to compute commit consistency and burst-before-applying patterns.
     */
    @SuppressWarnings("unchecked")
    public List<String> getCommitDates(String owner, String repo, String authorLogin) {
        try {
            ResponseEntity<List> res = get(
                "/repos/" + owner + "/" + repo + "/commits?author=" + authorLogin + "&per_page=100",
                List.class);
            if (res.getBody() == null) return Collections.emptyList();

            List<String> dates = new ArrayList<>();
            for (Object obj : res.getBody()) {
                if (!(obj instanceof Map)) continue;
                Map<String, Object> commit = (Map<String, Object>) obj;
                Map<String, Object> inner  = (Map<String, Object>) commit.get("commit");
                if (inner == null) continue;
                Map<String, Object> author = (Map<String, Object>) inner.get("author");
                if (author != null && author.get("date") != null)
                    dates.add(author.get("date").toString());
            }
            return dates;
        } catch (Exception e) {
            log.debug("Could not fetch commit dates for {}/{}: {}", owner, repo, e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * Returns the fraction of commits in the repo that were authored by login.
     * A ratio < 0.15 on a non-fork repo suggests the candidate barely contributed
     * to what they're presenting as their own work.
     */
    @SuppressWarnings("unchecked")
    public double getAuthorCommitRatio(String owner, String repo, String authorLogin) {
        try {
            // Fetch last 30 commits regardless of author
            ResponseEntity<List> allRes = get(
                "/repos/" + owner + "/" + repo + "/commits?per_page=30", List.class);
            if (allRes.getBody() == null || allRes.getBody().isEmpty()) return 1.0;

            int total = allRes.getBody().size();
            int byAuthor = 0;
            for (Object obj : allRes.getBody()) {
                if (!(obj instanceof Map)) continue;
                Map<String, Object> commit = (Map<String, Object>) obj;
                // author can be null for unlinked committers
                Map<String, Object> authorObj = (Map<String, Object>) commit.get("author");
                if (authorObj != null) {
                    String login = String.valueOf(authorObj.getOrDefault("login", ""));
                    if (authorLogin.equalsIgnoreCase(login)) byAuthor++;
                }
            }
            return total > 0 ? (double) byAuthor / total : 1.0;
        } catch (Exception e) {
            log.debug("Could not verify author ratio for {}/{}: {}", owner, repo, e.getMessage());
            return 1.0; // assume owned if we can't check
        }
    }

    /** Returns current rate limit status for health/debug endpoint. */
    public Map<String, Object> getRateLimitStatus() {
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("remaining", rateLimitRemaining);
        status.put("resetAt", rateLimitResetEpoch > 0
            ? Instant.ofEpochSecond(rateLimitResetEpoch).toString() : "unknown");
        status.put("authenticated", githubPat != null && !githubPat.isBlank());
        return status;
    }

    // ── Rate-limit helpers ─────────────────────────────────────────────────────

    private void updateRateLimitFromHeaders(HttpHeaders headers) {
        String remaining = headers.getFirst("X-RateLimit-Remaining");
        String reset     = headers.getFirst("X-RateLimit-Reset");
        if (remaining != null) {
            try { rateLimitRemaining = Integer.parseInt(remaining); } catch (NumberFormatException ignored) {}
        }
        if (reset != null) {
            try { rateLimitResetEpoch = Long.parseLong(reset); } catch (NumberFormatException ignored) {}
        }
        if (rateLimitRemaining <= 10)
            log.warn("GitHub rate limit low: {} remaining (resets {})", rateLimitRemaining,
                     rateLimitResetEpoch > 0 ? Instant.ofEpochSecond(rateLimitResetEpoch) : "?");
    }

    private void waitIfRateLimited() {
        if (rateLimitRemaining > 3) return;
        if (rateLimitResetEpoch <= 0) return;
        long waitMs = (rateLimitResetEpoch * 1000L - System.currentTimeMillis()) + 2_000;
        if (waitMs > 0 && waitMs < 65_000) {
            log.warn("GitHub rate limit exhausted ({} remaining) — sleeping {}ms until reset", rateLimitRemaining, waitMs);
            try { Thread.sleep(waitMs); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        }
    }

    // ── HTTP helpers ───────────────────────────────────────────────────────────

    private <T> ResponseEntity<T> get(String path, Class<T> responseType) {
        waitIfRateLimited();
        try {
            CALL_GATE.acquire();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ReviewForgeException("Interrupted waiting for GitHub call slot");
        }
        try {
            ResponseEntity<T> res = new RestTemplate().exchange(
                GITHUB_API + path, HttpMethod.GET,
                new HttpEntity<>(buildHeaders()), responseType);
            updateRateLimitFromHeaders(res.getHeaders());
            return res;
        } finally {
            CALL_GATE.release();
        }
    }

    private HttpHeaders buildHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Accept", "application/vnd.github+json");
        headers.set("X-GitHub-Api-Version", "2022-11-28");
        if (githubPat != null && !githubPat.isBlank())
            headers.set("Authorization", "Bearer " + githubPat);
        return headers;
    }
}
