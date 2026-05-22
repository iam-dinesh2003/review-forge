package com.reviewforge.dto.ai;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

/**
 * A single inline comment returned by Gemini inside the AIReviewResult JSON.
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class AIReviewComment {

    /** Relative file path: "src/main/java/com/example/Service.java" */
    private String file;

    /** Line number in the new file (right side of diff) */
    private int line;

    /** CRITICAL | WARNING | INFO */
    private String severity;

    /** SECURITY | PERFORMANCE | BUG | CODE_QUALITY | BEST_PRACTICE */
    private String category;

    /** Human-readable explanation of the issue */
    private String message;

    /** Optional code snippet showing the corrected version */
    private String suggestion;
}
