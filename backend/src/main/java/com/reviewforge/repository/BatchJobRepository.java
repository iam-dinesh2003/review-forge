package com.reviewforge.repository;

import com.reviewforge.entity.BatchJob;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface BatchJobRepository extends JpaRepository<BatchJob, Long> {
    List<BatchJob> findAllByOrderByCreatedAtDesc();
}
