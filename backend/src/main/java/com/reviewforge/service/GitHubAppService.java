package com.reviewforge.service;

import com.reviewforge.config.GitHubAppProperties;
import com.reviewforge.exception.ReviewForgeException;
import io.jsonwebtoken.Jwts;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.*;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages GitHub App authentication:
 * 1. Generates a short-lived App JWT (RS256) from the private key
 * 2. Exchanges it for an installation access token (per-repo, 1hr TTL)
 * 3. Caches installation tokens in Redis (if available) or in-memory map
 */
@Service
@Slf4j
public class GitHubAppService {

    private static final String GITHUB_API = "https://api.github.com";
    private static final String TOKEN_PREFIX = "rf:gh:token:";
    private static final Duration TOKEN_TTL = Duration.ofMinutes(55);

    private final GitHubAppProperties props;

    @Nullable
    private final RedisTemplate<String, String> redisTemplate;

    // Fallback in-memory cache when Redis is not available
    private final ConcurrentHashMap<String, String> localCache = new ConcurrentHashMap<>();

    @Autowired
    public GitHubAppService(GitHubAppProperties props,
                            @Autowired(required = false) RedisTemplate<String, String> redisTemplate) {
        this.props = props;
        this.redisTemplate = redisTemplate;
        if (redisTemplate == null) {
            log.info("Redis not available — using in-memory token cache");
        }
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    public String getInstallationToken(long installationId) {
        String cacheKey = TOKEN_PREFIX + installationId;

        if (redisTemplate != null) {
            String cached = redisTemplate.opsForValue().get(cacheKey);
            if (cached != null) {
                log.debug("Installation token cache hit for {}", installationId);
                return cached;
            }
        } else {
            String cached = localCache.get(cacheKey);
            if (cached != null) return cached;
        }

        log.info("Fetching new installation token for installationId={}", installationId);
        String token = fetchInstallationToken(installationId);

        if (redisTemplate != null) {
            redisTemplate.opsForValue().set(cacheKey, token, TOKEN_TTL);
        } else {
            localCache.put(cacheKey, token);
        }
        return token;
    }

    /**
     * Fetches raw PR diff text from GitHub.
     * Uses Accept: application/vnd.github.diff to get plain diff format.
     */
    public String fetchPrDiff(String token, String repoFullName, int prNumber) {
        RestTemplate rt = new RestTemplate();
        HttpHeaders headers = githubHeaders(token);
        headers.set("Accept", "application/vnd.github.diff");

        try {
            ResponseEntity<String> response = rt.exchange(
                    GITHUB_API + "/repos/" + repoFullName + "/pulls/" + prNumber,
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    String.class
            );
            return response.getBody();
        } catch (Exception e) {
            throw new ReviewForgeException("Failed to fetch PR diff for " + repoFullName + "#" + prNumber, e);
        }
    }

    /**
     * Fetches PR metadata (title, user, head SHA, etc.) as a JSON map.
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> fetchPrMetadata(String token, String repoFullName, int prNumber) {
        RestTemplate rt = new RestTemplate();
        try {
            ResponseEntity<Map> response = rt.exchange(
                    GITHUB_API + "/repos/" + repoFullName + "/pulls/" + prNumber,
                    HttpMethod.GET,
                    new HttpEntity<>(githubHeaders(token)),
                    Map.class
            );
            return response.getBody();
        } catch (Exception e) {
            throw new ReviewForgeException("Failed to fetch PR metadata for " + repoFullName + "#" + prNumber, e);
        }
    }

    /**
     * Posts all AI review comments to the PR as a single GitHub Review.
     * A single review call is preferred over multiple comment calls —
     * it appears atomically and does not spam GitHub notifications.
     *
     * @param comments list of maps with keys: path, line, side, body
     */
    public void postReview(String token, String repoFullName, int prNumber,
                           String headSha, String summaryBody,
                           java.util.List<Map<String, Object>> comments) {
        RestTemplate rt = new RestTemplate();
        HttpHeaders headers = githubHeaders(token);
        headers.set("Accept", "application/vnd.github+json");

        Map<String, Object> body = Map.of(
                "commit_id", headSha,
                "body", summaryBody,
                "event", "COMMENT",      // COMMENT = non-blocking review
                "comments", comments
        );

        try {
            rt.exchange(
                    GITHUB_API + "/repos/" + repoFullName + "/pulls/" + prNumber + "/reviews",
                    HttpMethod.POST,
                    new HttpEntity<>(body, headers),
                    String.class
            );
            log.info("Posted review to {}/{} with {} comments", repoFullName, prNumber, comments.size());
        } catch (Exception e) {
            // Non-fatal: log but don't fail the entire review pipeline
            log.error("Failed to post review to GitHub for {}/{}: {}", repoFullName, prNumber, e.getMessage());
        }
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private String fetchInstallationToken(long installationId) {
        try {
            String jwt = generateAppJwt();
            RestTemplate rt = new RestTemplate();

            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "Bearer " + jwt);
            headers.set("Accept", "application/vnd.github+json");
            headers.set("X-GitHub-Api-Version", "2022-11-28");

            ResponseEntity<Map> response = rt.exchange(
                    GITHUB_API + "/app/installations/" + installationId + "/access_tokens",
                    HttpMethod.POST,
                    new HttpEntity<>(headers),
                    Map.class
            );

            return (String) response.getBody().get("token");
        } catch (Exception e) {
            throw new ReviewForgeException("Failed to fetch installation token for " + installationId, e);
        }
    }

    /**
     * Generates a GitHub App JWT valid for 10 minutes.
     * GitHub requires:
     *   iat = now - 60s  (clock skew tolerance)
     *   exp = now + 600s (max 10 minutes)
     *   iss = app ID
     */
    private String generateAppJwt() throws Exception {
        PrivateKey privateKey = loadPrivateKey();
        long now = System.currentTimeMillis() / 1000;

        return Jwts.builder()
                .claim("iat", now - 60)
                .claim("exp", now + 600)
                .claim("iss", String.valueOf(props.getId()))
                .signWith(privateKey, Jwts.SIG.RS256)
                .compact();
    }

    /**
     * Loads RSA private key from the PEM string in application properties.
     * Supports PKCS#8 format (the default GitHub App key format after
     * running: openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in orig.pem -out key.pem)
     */
    private PrivateKey loadPrivateKey() throws Exception {
        String pem = props.getPrivateKey();
        if (pem == null || pem.isBlank()) {
            throw new IllegalStateException("github.app.private-key is not configured");
        }

        String cleaned = pem
                .replace("-----BEGIN RSA PRIVATE KEY-----", "")
                .replace("-----END RSA PRIVATE KEY-----", "")
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replaceAll("\\s+", "");

        byte[] decoded = Base64.getDecoder().decode(cleaned);

        try {
            return KeyFactory.getInstance("RSA")
                    .generatePrivate(new PKCS8EncodedKeySpec(decoded));
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Could not parse GitHub App private key. " +
                    "Ensure it is PKCS#8 PEM format. " +
                    "Convert with: openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in orig.pem -out key.pem",
                    e
            );
        }
    }

    private HttpHeaders githubHeaders(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "token " + token);
        headers.set("X-GitHub-Api-Version", "2022-11-28");
        return headers;
    }
}
