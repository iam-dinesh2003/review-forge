package com.reviewforge.repository;

import com.reviewforge.entity.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {
    List<AuditLog> findByCandidateIdOrderByCreatedAtDesc(Long candidateId);
    List<AuditLog> findAllByOrderByCreatedAtDesc();
}
