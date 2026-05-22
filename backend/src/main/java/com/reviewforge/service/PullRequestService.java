package com.reviewforge.service;

import com.reviewforge.dto.ai.AIReviewComment;
import com.reviewforge.dto.ai.AIReviewResult;
import com.reviewforge.dto.webhook.PullRequestEventPayload;
import com.reviewforge.entity.Installation;
import com.reviewforge.entity.ReviewComment;
import com.reviewforge.entity.ReviewSession;
import com.reviewforge.repository.InstallationRepository;
import com.reviewforge.repository.ReviewSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Orchestrates the full PR review pipeline:
 *
 *   Webhook → PullRequestService.reviewAsync()
 *     ├─ Idempotency check (skip if headSha already reviewed)
 *     ├─ Fetch installation token (Redis-cached)
 *     ├─ Fetch PR diff from GitHub
 *     ├─ Send diff to Gemini AI
 *     ├─ Post review comments back to GitHub
 *     └─ Persist ReviewSession + ReviewComment to PostgreSQL
 *
 * This method is @Async so the webhook endpoint can return 200 to GitHub
 * within the required 10-second window.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class PullRequestService {

    private final GitHubAppService gitHubAppService;
    private final AIReviewService aiReviewService;
    private final ReviewSessionRepository reviewSessionRepo;
    private final InstallationRepository installationRepo;

    /**
     * Async entry point called from WebhookController.
     * Must not throw — all exceptions are caught and logged.
     */
    @Async
    public void reviewAsync(PullRequestEventPayload payload) {
        String repo = payload.getRepository().getFullName();
        int prNumber = payload.getPullRequest().getNumber();
        String headSha = payload.getPullRequest().getHead().getSha();
        long installationId = payload.getInstallation().getId();

        log.info("Starting async review: repo={} pr=#{} sha={}", repo, prNumber, headSha.substring(0, 7));

        try {
            // ── 1. Idempotency check ───────────────────────────────────────────
            if (reviewSessionRepo.existsByRepoFullNameAndPrNumberAndHeadSha(repo, prNumber, headSha)) {
                log.info("Skipping duplicate review for {}/{}/{}", repo, prNumber, headSha.substring(0, 7));
                return;
            }

            // ── 2. Ensure installation is tracked ─────────────────────────────
            upsertInstallation(installationId, payload);

            // ── 3. Fetch installation token ────────────────────────────────────
            String token = gitHubAppService.getInstallationToken(installationId);

            // ── 4. Fetch PR diff ───────────────────────────────────────────────
            String diff = gitHubAppService.fetchPrDiff(token, repo, prNumber);
            log.debug("Fetched diff for {}/{}: {} chars", repo, prNumber, diff != null ? diff.length() : 0);

            // ── 5. Run AI review ───────────────────────────────────────────────
            AIReviewResult aiResult = aiReviewService.review(diff);

            // ── 6. Post review to GitHub ───────────────────────────────────────
            List<Map<String, Object>> githubComments = buildGitHubComments(aiResult);
            String summaryBody = buildSummaryComment(aiResult);
            gitHubAppService.postReview(token, repo, prNumber, headSha, summaryBody, githubComments);

            // ── 7. Persist to database ─────────────────────────────────────────
            persistReview(payload, aiResult, headSha);

            log.info("Review complete: repo={} pr=#{} score={}", repo, prNumber, aiResult.getScore());

        } catch (Exception e) {
            log.error("Review pipeline failed for repo={} pr=#{}: {}", repo, prNumber, e.getMessage(), e);
        }
    }

    // ── Private: GitHub comment formatting ────────────────────────────────────

    private List<Map<String, Object>> buildGitHubComments(AIReviewResult result) {
        List<Map<String, Object>> comments = new ArrayList<>();

        for (AIReviewComment c : result.getComments()) {
            if (c.getFile() == null || c.getLine() <= 0) continue;

            Map<String, Object> comment = new HashMap<>();
            comment.put("path", c.getFile());
            comment.put("line", c.getLine());
            comment.put("side", "RIGHT");   // RIGHT = new version of file
            comment.put("body", formatCommentBody(c));
            comments.add(comment);
        }

        return comments;
    }

    private String formatCommentBody(AIReviewComment c) {
        String emoji = switch (c.getSeverity()) {
            case "CRITICAL" -> "🔴";
            case "WARNING"  -> "🟡";
            default          -> "🔵";
        };

        StringBuilder sb = new StringBuilder();
        sb.append(emoji).append(" **").append(c.getSeverity()).append(" — ").append(c.getCategory()).append("**\n\n");
        sb.append(c.getMessage()).append("\n");

        if (c.getSuggestion() != null && !c.getSuggestion().isBlank()) {
            sb.append("\n**Suggested fix:**\n```java\n").append(c.getSuggestion().trim()).append("\n```");
        }

        return sb.toString();
    }

    private String buildSummaryComment(AIReviewResult result) {
        int total = result.criticalCount() + result.warningCount() + result.infoCount();
        return """
                ## 🤖 ReviewForge AI Analysis

                **Score: %d/100** | 🔴 %d Critical · 🟡 %d Warning · 🔵 %d Info | %d total issues

                %s

                ---
                *Powered by ReviewForge + Gemini 2.5 Flash*
                """.formatted(
                result.getScore(),
                result.criticalCount(), result.warningCount(), result.infoCount(),
                total,
                result.getSummary()
        );
    }

    // ── Private: Persistence ──────────────────────────────────────────────────

    @Transactional
    protected void persistReview(PullRequestEventPayload payload, AIReviewResult aiResult, String headSha) {
        var pr = payload.getPullRequest();
        var user = pr.getUser();

        ReviewSession session = ReviewSession.builder()
                .repoFullName(payload.getRepository().getFullName())
                .installationId(payload.getInstallation().getId())
                .prNumber(pr.getNumber())
                .prTitle(pr.getTitle())
                .authorLogin(user != null ? user.getLogin() : "unknown")
                .authorAvatarUrl(user != null ? user.getAvatarUrl() : null)
                .headSha(headSha)
                .branch(pr.getHead().getRef())
                .overallScore(aiResult.getScore())
                .summary(aiResult.getSummary())
                .criticalCount(aiResult.criticalCount())
                .warningCount(aiResult.warningCount())
                .infoCount(aiResult.infoCount())
                .reviewedAt(LocalDateTime.now())
                .githubUrl(pr.getHtmlUrl())
                .build();

        // Attach comments
        if (aiResult.getComments() != null) {
            for (AIReviewComment c : aiResult.getComments()) {
                ReviewComment entity = ReviewComment.builder()
                        .session(session)
                        .filePath(c.getFile())
                        .lineNumber(c.getLine())
                        .severity(c.getSeverity())
                        .category(c.getCategory())
                        .message(c.getMessage())
                        .suggestion(c.getSuggestion())
                        .build();
                session.getComments().add(entity);
            }
        }

        reviewSessionRepo.save(session);
        log.debug("Persisted ReviewSession id={} with {} comments", session.getId(), session.getComments().size());
    }

    @Transactional
    protected void upsertInstallation(long installationId, PullRequestEventPayload payload) {
        if (!installationRepo.existsById(installationId)) {
            Installation installation = Installation.builder()
                    .id(installationId)
                    .accountLogin(payload.getRepository().getFullName().split("/")[0])
                    .accountType("User")
                    .installedAt(LocalDateTime.now())
                    .active(true)
                    .build();
            installationRepo.save(installation);
        }
    }
}
