package com.reviewforge.dto.dashboard;

/**
 * Per-repository stats for the Repositories page.
 */
public record RepoStatsDTO(
        String fullName,
        String owner,
        String name,
        int prCount,
        double avgScore,
        int totalCritical,
        int totalWarning,
        int totalInfo,
        String lastReviewedAt
) {}
