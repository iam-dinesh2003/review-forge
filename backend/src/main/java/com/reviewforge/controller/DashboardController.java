package com.reviewforge.controller;

import com.reviewforge.dto.dashboard.*;
import com.reviewforge.service.DashboardService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST API for the ReviewForge dashboard frontend.
 *
 * All endpoints are read-only (GET).
 * CORS is handled globally via WebConfig.
 *
 * Base path: /api/dashboard
 */
@RestController
@RequestMapping("/api/dashboard")
@Slf4j
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService dashboardService;

    // ── Stats card ─────────────────────────────────────────────────────────────

    /**
     * GET /api/dashboard/stats
     * Returns aggregate counts for the top-of-page stat cards.
     */
    @GetMapping("/stats")
    public ResponseEntity<DashboardStatsDTO> getStats() {
        return ResponseEntity.ok(dashboardService.getStats());
    }

    // ── Review list ────────────────────────────────────────────────────────────

    /**
     * GET /api/dashboard/reviews?page=0&size=20
     * Paginated list of reviews, most recent first.
     */
    @GetMapping("/reviews")
    public ResponseEntity<Page<ReviewListItemDTO>> getReviews(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        // Cap page size to prevent abuse
        int cappedSize = Math.min(size, 100);
        return ResponseEntity.ok(dashboardService.getReviews(page, cappedSize));
    }

    /**
     * GET /api/dashboard/reviews/{id}
     * Full review detail including all AI comments.
     */
    @GetMapping("/reviews/{id}")
    public ResponseEntity<ReviewSummaryDTO> getReview(@PathVariable Long id) {
        return dashboardService.getReview(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    // ── Repository stats ───────────────────────────────────────────────────────

    /**
     * GET /api/dashboard/repositories
     * Per-repo PR counts, avg scores, issue breakdown, and last reviewed time.
     */
    @GetMapping("/repositories")
    public ResponseEntity<List<RepoStatsDTO>> getRepositories() {
        return ResponseEntity.ok(dashboardService.getRepositoryStats());
    }

    // ── Quality trend chart ────────────────────────────────────────────────────

    /**
     * GET /api/dashboard/trends?days=30
     * Daily average score for the past N days (default 30, max 90).
     */
    @GetMapping("/trends")
    public ResponseEntity<List<TrendPointDTO>> getTrends(
            @RequestParam(defaultValue = "30") int days
    ) {
        int cappedDays = Math.min(days, 90);
        return ResponseEntity.ok(dashboardService.getQualityTrend(cappedDays));
    }

    // ── Health / ping ──────────────────────────────────────────────────────────

    /**
     * GET /api/dashboard/ping
     * Lightweight liveness probe for the frontend to check API connectivity.
     */
    @GetMapping("/ping")
    public ResponseEntity<Map<String, String>> ping() {
        return ResponseEntity.ok(Map.of("status", "ok", "service", "ReviewForge"));
    }
}
