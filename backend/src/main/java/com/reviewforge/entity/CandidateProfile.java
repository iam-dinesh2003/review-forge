package com.reviewforge.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(
    name = "candidate_profiles",
    indexes = {
        @Index(name = "idx_candidate_login",    columnList = "githubLogin", unique = true),
        @Index(name = "idx_candidate_analyzed", columnList = "analyzedAt"),
        @Index(name = "idx_candidate_score",    columnList = "overallScore")
    }
)
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class CandidateProfile {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String githubLogin;

    private String name;
    private String avatarUrl;

    @Column(columnDefinition = "TEXT") private String bio;
    private String location;
    private int publicRepos;
    private int followers;

    @Column(nullable = false)
    private LocalDateTime analyzedAt;

    private int overallScore;

    /** Percentile rank among all stored profiles: 90 means top 10%. Updated after each save. */
    private int percentileRank;

    /** REVIEWING | SHORTLISTED | INTERVIEW | OFFER | REJECTED */
    @Column(length = 20)
    private String pipelineStatus;

    @Column(columnDefinition = "TEXT") private String summary;

    // JSON blobs — stored as TEXT, serialized/deserialized by ObjectMapper
    @Column(columnDefinition = "TEXT") private String topLanguagesJson;
    @Column(columnDefinition = "TEXT") private String skillsJson;
    @Column(columnDefinition = "TEXT") private String aiDetectionJson;
    @Column(columnDefinition = "TEXT") private String metricsJson;
    @Column(columnDefinition = "TEXT") private String strengthsJson;
    @Column(columnDefinition = "TEXT") private String concernsJson;
    @Column(columnDefinition = "TEXT") private String prAnalysisJson;
    @Column(columnDefinition = "TEXT") private String scoreBreakdownJson;
    @Column(columnDefinition = "TEXT") private String commitConsistencyJson;
    @Column(columnDefinition = "TEXT") private String interviewQuestionsJson;
    @Column(columnDefinition = "TEXT") private String jdMatchJson;
    @Column(columnDefinition = "TEXT") private String notesJson;   // List<CandidateNote>
}
