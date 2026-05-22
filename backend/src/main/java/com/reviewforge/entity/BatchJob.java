package com.reviewforge.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "batch_jobs",
       indexes = @Index(name = "idx_batch_created", columnList = "createdAt"))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class BatchJob {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;
    private int totalCandidates;
    private int processed;
    private int failedCount;

    /** QUEUED | RUNNING | DONE | FAILED */
    @Column(nullable = false, length = 10)
    private String status;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    private LocalDateTime completedAt;

    /** JSON array of GitHub login strings submitted to this job. */
    @Column(columnDefinition = "TEXT")
    private String candidateLoginsJson;

    /** JSON array of successfully analyzed candidate IDs (Long). */
    @Column(columnDefinition = "TEXT")
    private String candidateIdsJson;

    /** Human-readable summary built after completion. */
    @Column(columnDefinition = "TEXT")
    private String resultSummaryJson;
}
