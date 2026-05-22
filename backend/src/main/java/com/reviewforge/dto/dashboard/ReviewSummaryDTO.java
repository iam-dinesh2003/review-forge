package com.reviewforge.dto.dashboard;

import com.reviewforge.dto.ai.AIReviewComment;
import com.reviewforge.entity.ReviewComment;
import com.reviewforge.entity.ReviewSession;

import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * Full review detail including all inline comments.
 * Used by GET /api/dashboard/reviews/{id}
 */
public record ReviewSummaryDTO(
        Long id,
        int prNumber,
        String prTitle,
        String authorLogin,
        String authorAvatarUrl,
        String repoFullName,
        String branch,
        String headSha,
        int overallScore,
        String summary,
        int criticalCount,
        int warningCount,
        int infoCount,
        String reviewedAt,
        String githubUrl,
        List<CommentDTO> comments
) {

    private static final DateTimeFormatter FMT = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    public static ReviewSummaryDTO from(ReviewSession s) {
        List<CommentDTO> commentDTOs = s.getComments().stream()
                .map(CommentDTO::from)
                .toList();

        return new ReviewSummaryDTO(
                s.getId(),
                s.getPrNumber(),
                s.getPrTitle(),
                s.getAuthorLogin(),
                s.getAuthorAvatarUrl(),
                s.getRepoFullName(),
                s.getBranch(),
                s.getHeadSha(),
                s.getOverallScore(),
                s.getSummary(),
                s.getCriticalCount(),
                s.getWarningCount(),
                s.getInfoCount(),
                s.getReviewedAt().format(FMT),
                s.getGithubUrl(),
                commentDTOs
        );
    }

    public record CommentDTO(
            Long id,
            String file,
            int line,
            String severity,
            String category,
            String message,
            String suggestion
    ) {
        public static CommentDTO from(ReviewComment c) {
            return new CommentDTO(
                    c.getId(),
                    c.getFilePath(),
                    c.getLineNumber(),
                    c.getSeverity(),
                    c.getCategory(),
                    c.getMessage(),
                    c.getSuggestion()
            );
        }
    }
}
