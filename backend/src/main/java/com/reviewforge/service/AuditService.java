package com.reviewforge.service;

import com.reviewforge.entity.AuditLog;
import com.reviewforge.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AuditService {

    private final AuditLogRepository repository;

    @Async
    public void log(String eventType, Long candidateId, String description) {
        repository.save(AuditLog.builder()
                .eventType(eventType)
                .candidateId(candidateId)
                .description(description)
                .createdAt(LocalDateTime.now())
                .build());
    }

    public List<AuditLog> getForCandidate(Long candidateId) {
        return repository.findByCandidateIdOrderByCreatedAtDesc(candidateId);
    }

    public List<AuditLog> getAll() {
        return repository.findAllByOrderByCreatedAtDesc();
    }
}
