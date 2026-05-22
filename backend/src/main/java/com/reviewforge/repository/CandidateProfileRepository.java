package com.reviewforge.repository;

import com.reviewforge.entity.CandidateProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface CandidateProfileRepository extends JpaRepository<CandidateProfile, Long> {

    Optional<CandidateProfile> findByGithubLogin(String githubLogin);

    boolean existsByGithubLoginAndAnalyzedAtAfter(String githubLogin, LocalDateTime after);

    List<CandidateProfile> findAllByOrderByAnalyzedAtDesc();

    /** Count of profiles with a score strictly below the given score — used for percentile rank. */
    @Query("SELECT COUNT(c) FROM CandidateProfile c WHERE c.overallScore < :score")
    long countBelowScore(@Param("score") int score);

    /** Profiles currently in a given pipeline stage. */
    List<CandidateProfile> findByPipelineStatusOrderByOverallScoreDesc(String pipelineStatus);
}
