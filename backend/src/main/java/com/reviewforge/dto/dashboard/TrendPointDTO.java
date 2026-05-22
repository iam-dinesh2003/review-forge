package com.reviewforge.dto.dashboard;

/**
 * Single data point for the 30-day quality trend line chart.
 */
public record TrendPointDTO(
        String date,       // "Apr 12" — formatted for Recharts
        double score       // daily average score
) {}
