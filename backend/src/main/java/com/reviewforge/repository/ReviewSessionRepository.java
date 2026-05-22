package com.reviewforge.repository;

import com.reviewforge.entity.ReviewSession;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface ReviewSessionRepository extends JpaRepository<ReviewSession, Long> {

    /** Idempotency check — skip if exact commit already reviewed */
    boolean existsByRepoFullNameAndPrNumberAndHeadSha(String repoFullName, int prNumber, String headSha);

    /** Paginated list of all reviews, newest first */
    Page<ReviewSession> findAllByOrderByReviewedAtDesc(Pageable pageable);

    /** All reviews for a specific repo */
    List<ReviewSession> findByRepoFullNameOrderByReviewedAtDesc(String repoFullName);

    /** Recent N reviews across all repos */
    List<ReviewSession> findTop10ByOrderByReviewedAtDesc();

    /** Count reviews per repo */
    @Query("SELECT r.repoFullName, COUNT(r) FROM ReviewSession r GROUP BY r.repoFullName")
    List<Object[]> countByRepo();

    /** Average score per repo */
    @Query("SELECT r.repoFullName, AVG(r.overallScore) FROM ReviewSession r GROUP BY r.repoFullName")
    List<Object[]> avgScoreByRepo();

    /** Daily average scores for trend chart */
    @Query("""
        SELECT CAST(r.reviewedAt AS date), AVG(r.overallScore)
        FROM ReviewSession r
        WHERE r.reviewedAt >= :since
        GROUP BY CAST(r.reviewedAt AS date)
        ORDER BY CAST(r.reviewedAt AS date)
    """)
    List<Object[]> dailyAvgScoreSince(@Param("since") LocalDateTime since);

    /** Total count of critical/warning/info issues */
    @Query("""
        SELECT SUM(r.criticalCount), SUM(r.warningCount), SUM(r.infoCount)
        FROM ReviewSession r
    """)
    Object[] totalIssueCounts();
}
