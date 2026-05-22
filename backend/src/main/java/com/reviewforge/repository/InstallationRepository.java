package com.reviewforge.repository;

import com.reviewforge.entity.Installation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface InstallationRepository extends JpaRepository<Installation, Long> {

    Optional<Installation> findByIdAndActiveTrue(Long id);
}
