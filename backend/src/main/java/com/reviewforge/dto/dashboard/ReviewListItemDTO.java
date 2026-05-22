package com.reviewforge.dto.dashboard;

import com.reviewforge.entity.ReviewSession;

import java.time.format.DateTimeFormatter;

/**
 * Lightweight row for the reviews table (no comments list).
 */
public record ReviewListItemDTO(
        Long id,
        int prNumber,
        String prTitle,
        String authorLogin,
        String authorAvatarUrl,
        String repoFullName,
        String branch,
        String headSha,
        int overallScore,
        int criticalCount,
        int warningCount,
        int infoCount,
        String reviewedAt,
        String githubUrl
) {
    private static final DateTimeFormatter FMT = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    public static ReviewListItemDTO from(ReviewSession s) {
        return new ReviewListItemDTO(
                s.getId(),
                s.getPrNumber(),
                s.getPrTitle(),
                s.getAuthorLogin(),
                s.getAuthorAvatarUrl(),
                s.getRepoFullName(),
                s.getBranch(),
                s.getHeadSha(),
                s.getOverallScore(),
                s.getCriticalCount(),
                s.getWarningCount(),
                s.getInfoCount(),
                s.getReviewedAt().format(FMT),
                s.getGithubUrl()
        );
    }
}
