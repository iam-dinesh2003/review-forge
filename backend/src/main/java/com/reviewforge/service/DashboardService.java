package com.reviewforge.service;

import com.reviewforge.dto.dashboard.*;
import com.reviewforge.entity.ReviewSession;
import com.reviewforge.repository.InstallationRepository;
import com.reviewforge.repository.ReviewSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DashboardService {

    private final ReviewSessionRepository reviewSessionRepo;
    private final InstallationRepository installationRepo;

    private static final DateTimeFormatter TREND_FMT = DateTimeFormatter.ofPattern("MMM d");

    // ── Stats ──────────────────────────────────────────────────────────────────

    public DashboardStatsDTO getStats() {
        long totalPRs = reviewSessionRepo.count();
        if (totalPRs == 0) {
            return new DashboardStatsDTO(0, 0, 0, 0, 0, 0);
        }

        Object[] issueTotals = reviewSessionRepo.totalIssueCounts();
        long critical = toLong(issueTotals[0]);
        long warning  = toLong(issueTotals[1]);
        long info     = toLong(issueTotals[2]);

        // Average score
        List<ReviewSession> all = reviewSessionRepo.findAll();
        double avgScore = all.stream()
                .mapToInt(ReviewSession::getOverallScore)
                .average()
                .orElse(0);

        int reposConnected = (int) reviewSessionRepo.countByRepo().stream()
                .map(r -> r[0].toString())
                .distinct()
                .count();

        return new DashboardStatsDTO(
                (int) totalPRs,
                Math.round(avgScore * 10.0) / 10.0,
                (int) critical,
                (int) warning,
                (int) info,
                reposConnected
        );
    }

    // ── Review list ────────────────────────────────────────────────────────────

    public Page<ReviewListItemDTO> getReviews(int page, int size) {
        Page<ReviewSession> sessions = reviewSessionRepo.findAllByOrderByReviewedAtDesc(
                PageRequest.of(page, size, Sort.by("reviewedAt").descending())
        );
        return sessions.map(ReviewListItemDTO::from);
    }

    public Optional<ReviewSummaryDTO> getReview(Long id) {
        return reviewSessionRepo.findById(id).map(ReviewSummaryDTO::from);
    }

    // ── Repository stats ───────────────────────────────────────────────────────

    public List<RepoStatsDTO> getRepositoryStats() {
        List<Object[]> counts   = reviewSessionRepo.countByRepo();
        List<Object[]> avgScores = reviewSessionRepo.avgScoreByRepo();

        Map<String, Long>   countMap    = toMap(counts,    row -> (Long)   row[1]);
        Map<String, Double> avgScoreMap = toMap(avgScores, row -> (Double) row[1]);

        // Get all repos, merge stats
        Set<String> allRepos = new LinkedHashSet<>();
        counts.forEach(r -> allRepos.add(r[0].toString()));

        return allRepos.stream().map(repo -> {
            List<ReviewSession> sessions = reviewSessionRepo.findByRepoFullNameOrderByReviewedAtDesc(repo);

            int totalCritical = sessions.stream().mapToInt(ReviewSession::getCriticalCount).sum();
            int totalWarning  = sessions.stream().mapToInt(ReviewSession::getWarningCount).sum();
            int totalInfo     = sessions.stream().mapToInt(ReviewSession::getInfoCount).sum();

            String lastReviewed = sessions.isEmpty() ? null :
                    sessions.get(0).getReviewedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);

            String[] parts = repo.split("/", 2);
            String owner = parts.length > 1 ? parts[0] : "";
            String name  = parts.length > 1 ? parts[1] : repo;

            return new RepoStatsDTO(
                    repo,
                    owner,
                    name,
                    countMap.getOrDefault(repo, 0L).intValue(),
                    Math.round(avgScoreMap.getOrDefault(repo, 0.0) * 10.0) / 10.0,
                    totalCritical,
                    totalWarning,
                    totalInfo,
                    lastReviewed
            );
        }).collect(Collectors.toList());
    }

    // ── Trend chart ────────────────────────────────────────────────────────────

    public List<TrendPointDTO> getQualityTrend(int days) {
        LocalDateTime since = LocalDateTime.now().minusDays(days);
        List<Object[]> rows = reviewSessionRepo.dailyAvgScoreSince(since);

        return rows.stream().map(row -> {
            Object dateObj = row[0];
            String label;
            if (dateObj instanceof java.sql.Date sqlDate) {
                label = sqlDate.toLocalDate().format(TREND_FMT);
            } else {
                label = dateObj.toString();
            }
            double score = ((Number) row[1]).doubleValue();
            return new TrendPointDTO(label, Math.round(score * 10.0) / 10.0);
        }).collect(Collectors.toList());
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private <V> Map<String, V> toMap(List<Object[]> rows, java.util.function.Function<Object[], V> valueExtractor) {
        Map<String, V> map = new HashMap<>();
        for (Object[] row : rows) {
            map.put(row[0].toString(), valueExtractor.apply(row));
        }
        return map;
    }

    private long toLong(Object val) {
        if (val == null) return 0L;
        return ((Number) val).longValue();
    }
}
