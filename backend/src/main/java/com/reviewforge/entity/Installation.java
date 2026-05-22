package com.reviewforge.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Represents a GitHub App installation on a user/org account.
 * Created when GitHub sends the "installation" webhook event (action=created).
 */
@Entity
@Table(name = "installations")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Installation {

    /** GitHub installation ID — used to fetch installation tokens */
    @Id
    private Long id;

    /** GitHub account login (user or org) that installed the app */
    @Column(nullable = false)
    private String accountLogin;

    /** "Organization" or "User" */
    @Column(nullable = false)
    private String accountType;

    @Column(nullable = false)
    private LocalDateTime installedAt;

    /** False when the app is uninstalled (soft-delete) */
    @Column(nullable = false)
    private boolean active;

    @PrePersist
    void prePersist() {
        if (installedAt == null) installedAt = LocalDateTime.now();
        active = true;
    }
}
