package com.reviewforge.repository;

import com.reviewforge.entity.ReviewComment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ReviewCommentRepository extends JpaRepository<ReviewComment, Long> {

    List<ReviewComment> findBySessionId(Long sessionId);

    /** Top files with most CRITICAL issues across all reviews */
    @Query("""
        SELECT c.filePath, COUNT(c)
        FROM ReviewComment c
        WHERE c.severity = 'CRITICAL'
        GROUP BY c.filePath
        ORDER BY COUNT(c) DESC
    """)
    List<Object[]> topCriticalFiles(org.springframework.data.domain.Pageable pageable);

    /** Issues grouped by category */
    @Query("SELECT c.category, COUNT(c) FROM ReviewComment c GROUP BY c.category ORDER BY COUNT(c) DESC")
    List<Object[]> countByCategory();

    /** Issues for a specific review session */
    @Query("SELECT c FROM ReviewComment c WHERE c.session.id = :sessionId ORDER BY c.severity, c.filePath")
    List<ReviewComment> findBySessionIdOrdered(@Param("sessionId") Long sessionId);
}
