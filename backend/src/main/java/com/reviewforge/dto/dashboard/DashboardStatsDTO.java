package com.reviewforge.dto.dashboard;

/**
 * Top-level aggregate stats for the Dashboard overview cards.
 */
public record DashboardStatsDTO(
        int totalPRs,
        double avgScore,
        int totalCritical,
        int totalWarning,
        int totalInfo,
        int reposConnected
) {}
