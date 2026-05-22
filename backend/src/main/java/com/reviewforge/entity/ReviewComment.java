package com.reviewforge.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * A single inline AI comment on a specific file + line in a PR diff.
 */
@Entity
@Table(
    name = "review_comments",
    indexes = {
        @Index(name = "idx_comment_session", columnList = "session_id"),
        @Index(name = "idx_comment_severity", columnList = "severity")
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ReviewComment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private ReviewSession session;

    /** Relative file path in the repository (e.g. src/main/java/com/App.java) */
    @Column(nullable = false, length = 512)
    private String filePath;

    /** Line number in the NEW version of the file */
    @Column(nullable = false)
    private Integer lineNumber;

    /**
     * CRITICAL — must be fixed before merge
     * WARNING  — should be fixed
     * INFO     — suggestion / style
     */
    @Column(nullable = false, length = 16)
    private String severity;

    /**
     * SECURITY | PERFORMANCE | BUG | CODE_QUALITY | BEST_PRACTICE
     */
    @Column(nullable = false, length = 32)
    private String category;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String message;

    /** Optional code snippet showing the fix */
    @Column(columnDefinition = "TEXT")
    private String suggestion;
}
