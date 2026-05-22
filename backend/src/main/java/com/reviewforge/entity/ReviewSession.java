package com.reviewforge.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * One AI review run for a specific PR commit.
 * Uniqueness: (repoFullName, prNumber, headSha) — used for idempotency.
 */
@Entity
@Table(
    name = "review_sessions",
    indexes = {
        @Index(name = "idx_review_repo_pr_sha", columnList = "repoFullName, prNumber, headSha", unique = true),
        @Index(name = "idx_review_repo",        columnList = "repoFullName"),
        @Index(name = "idx_review_at",           columnList = "reviewedAt")
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ReviewSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String repoFullName;        // "owner/repo"

    @Column(nullable = false)
    private Long installationId;

    @Column(nullable = false)
    private Integer prNumber;

    @Column(nullable = false, length = 512)
    private String prTitle;

    private String authorLogin;
    private String authorAvatarUrl;

    /** Full 40-char commit SHA */
    @Column(nullable = false, length = 40)
    private String headSha;

    private String branch;

    /** AI-generated score 0-100 */
    @Column(nullable = false)
    private Integer overallScore;

    /** AI-generated summary paragraph */
    @Column(columnDefinition = "TEXT")
    private String summary;

    @Column(nullable = false)
    private Integer criticalCount;

    @Column(nullable = false)
    private Integer warningCount;

    @Column(nullable = false)
    private Integer infoCount;

    @Column(nullable = false)
    private LocalDateTime reviewedAt;

    private String githubUrl;

    @OneToMany(mappedBy = "session", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @Builder.Default
    private List<ReviewComment> comments = new ArrayList<>();

    @PrePersist
    void prePersist() {
        if (reviewedAt == null) reviewedAt = LocalDateTime.now();
    }
}
