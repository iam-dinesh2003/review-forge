package com.reviewforge.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "audit_logs",
       indexes = {
           @Index(name = "idx_audit_candidate", columnList = "candidateId"),
           @Index(name = "idx_audit_created",   columnList = "createdAt")
       })
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class AuditLog {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Nullable — some events are not candidate-specific (e.g. batch started). */
    private Long candidateId;

    /** ANALYZED | STATUS_CHANGED | JD_MATCHED | NOTE_ADDED | NOTE_DELETED | BATCH_STARTED | BATCH_DONE */
    @Column(nullable = false, length = 30)
    private String eventType;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false)
    private LocalDateTime createdAt;
}
