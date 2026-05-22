package com.reviewforge.dto.ai;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * Full structured response returned by Gemini for a PR diff.
 * Maps directly from the JSON schema enforced in the system prompt.
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class AIReviewResult {

    /** 2-3 sentence overall assessment of the PR */
    private String summary;

    /** Overall quality score 0-100 (100 = perfect code) */
    private int score;

    /** List of inline code comments with severity + category */
    private List<AIReviewComment> comments = new ArrayList<>();

    // ── Computed helpers ──────────────────────────────────────────────────────

    public int criticalCount() {
        return (int) comments.stream().filter(c -> "CRITICAL".equals(c.getSeverity())).count();
    }

    public int warningCount() {
        return (int) comments.stream().filter(c -> "WARNING".equals(c.getSeverity())).count();
    }

    public int infoCount() {
        return (int) comments.stream().filter(c -> "INFO".equals(c.getSeverity())).count();
    }
}
