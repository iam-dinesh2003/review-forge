package com.reviewforge.dto.candidate;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.reviewforge.entity.CandidateProfile;
import lombok.Builder;
import lombok.Data;

import java.util.Collections;
import java.util.List;

@Data
@Builder
public class CandidateProfileDTO {

    private String id;
    private String githubLogin;
    private String githubUrl;
    private String avatarUrl;
    private String name;
    private String bio;
    private String location;
    private int publicRepos;
    private int followers;
    private String analyzedAt;
    private int overallScore;
    private String summary;

    private List<LanguageShare> topLanguages;
    private List<SkillSignal> skills;
    private AIDetection aiDetection;
    private CodeMetrics metrics;
    private List<String> strengths;
    private List<String> concerns;
    private List<PRAnalysis> prAnalysis;
    private ScoreBreakdown scoreBreakdown;
    private CommitConsistency commitConsistency;
    private List<InterviewQuestion> interviewQuestions;
    private int percentileRank;
    private String pipelineStatus;
    private JDMatchResult jdMatch;
    private List<CandidateNote> notes;

    // ── Nested types matching frontend TypeScript interfaces ───────────────────

    @Data @Builder public static class LanguageShare {
        private String name;
        private double percentage;
    }

    @Data @Builder public static class SkillSignal {
        private String name;
        private String level; // EXPERT | PROFICIENT | FAMILIAR
        private int evidenceCount;
    }

    @Data @Builder public static class AIDetection {
        private int score;
        private String level;   // LOW | MEDIUM | HIGH | VERY_HIGH
        private List<String> indicators;
        private double commitBurstRatio;
        private double boilerplateRatio;
        private double docUniformity;
    }

    @Data @Builder public static class CodeMetrics {
        private double avgComplexity;
        private double testRatio;
        private double commentRatio;
        private double avgFileLoc;
        private double duplicateRatio;
    }

    @Data @Builder public static class PRAnalysis {
        private int prNumber;
        private String title;
        private String repo;
        private String url;
        private int additions;
        private int deletions;
        private int filesChanged;
        private String mergedAt;
        private int overallScore;
        private String summary;
        private List<PRComment> comments;
    }

    @Data @Builder public static class ScoreBreakdown {
        private int totalPublicRepos;
        private int qualityReposFound;
        private List<String> reposAnalyzed;
        private List<SkippedRepo> reposSkipped;
        private List<ScoreFactor> scoreFactors;
        private List<String> whatIsHoldingBack;
        private List<ImprovementStep> improvementPlan;
        private boolean hasTests;
    }

    @Data @Builder public static class SkippedRepo {
        private String name;
        private String reason;
    }

    @Data @Builder public static class ScoreFactor {
        private String factor;
        private int score;
        private int maxScore;
        private String notes;
    }

    @Data @Builder public static class ImprovementStep {
        private int priority;
        private String action;
        private String impact;
        private String timeframe;
        private String why;
    }

    @Data @Builder public static class PRComment {
        private String file;
        private int line;
        private String severity;
        private String category;
        private String message;
        private String suggestion;
    }

    @Data @Builder public static class JDMatchResult {
        private int score;
        private String verdict;     // STRONG_FIT | MAYBE | POOR_FIT
        private List<String> matchedSkills;
        private List<String> missingSkills;
        private List<String> bonusSkills;
        private String summary;
    }

    @Data @Builder public static class CandidateNote {
        private String id;
        private String text;
        private String createdAt;
    }

    @Data @Builder public static class CommitConsistency {
        private int totalCommits;
        private int activeWeeks;
        private double consistencyScore;    // 0-1: fraction of past 26 weeks with at least one commit
        private double recentBurstRatio;    // fraction of commits in last 14 days vs total
        private boolean likelySurgedBeforeApplying;
        private String longestStreakWeeks;  // e.g. "4 weeks"
    }

    @Data @Builder public static class InterviewQuestion {
        private String question;
        private String category;     // TECHNICAL | BEHAVIORAL | CODE_REVIEW
        private String targetedAt;   // which weakness this is probing
        private String difficulty;   // EASY | MEDIUM | HARD
    }

    // ── Factory from entity ────────────────────────────────────────────────────

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static CandidateProfileDTO from(CandidateProfile e) {
        return CandidateProfileDTO.builder()
                .id(String.valueOf(e.getId()))
                .githubLogin(e.getGithubLogin())
                .githubUrl("https://github.com/" + e.getGithubLogin())
                .avatarUrl(e.getAvatarUrl())
                .name(e.getName())
                .bio(e.getBio())
                .location(e.getLocation())
                .publicRepos(e.getPublicRepos())
                .followers(e.getFollowers())
                .analyzedAt(e.getAnalyzedAt() != null ? e.getAnalyzedAt().toString() : null)
                .overallScore(e.getOverallScore())
                .summary(e.getSummary())
                .topLanguages(parseList(e.getTopLanguagesJson(), new TypeReference<>() {}))
                .skills(parseList(e.getSkillsJson(), new TypeReference<>() {}))
                .aiDetection(parseObject(e.getAiDetectionJson(), AIDetection.class))
                .metrics(parseObject(e.getMetricsJson(), CodeMetrics.class))
                .strengths(parseList(e.getStrengthsJson(), new TypeReference<>() {}))
                .concerns(parseList(e.getConcernsJson(), new TypeReference<>() {}))
                .prAnalysis(parseList(e.getPrAnalysisJson(), new TypeReference<>() {}))
                .scoreBreakdown(parseObject(e.getScoreBreakdownJson(), ScoreBreakdown.class))
                .commitConsistency(parseObject(e.getCommitConsistencyJson(), CommitConsistency.class))
                .interviewQuestions(parseList(e.getInterviewQuestionsJson(), new TypeReference<>() {}))
                .percentileRank(e.getPercentileRank())
                .pipelineStatus(e.getPipelineStatus() != null ? e.getPipelineStatus() : "REVIEWING")
                .jdMatch(parseObject(e.getJdMatchJson(), JDMatchResult.class))
                .notes(parseList(e.getNotesJson(), new TypeReference<>() {}))
                .build();
    }

    private static <T> List<T> parseList(String json, TypeReference<List<T>> ref) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try { return MAPPER.readValue(json, ref); }
        catch (Exception e) { return Collections.emptyList(); }
    }

    private static <T> T parseObject(String json, Class<T> cls) {
        if (json == null || json.isBlank()) return null;
        try { return MAPPER.readValue(json, cls); }
        catch (Exception e) { return null; }
    }
}
