package com.reviewforge.service;

import com.reviewforge.entity.BatchJob;
import com.reviewforge.repository.BatchJobRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Runs batch candidate analysis asynchronously.
 *
 * Uses a 5-thread pool for concurrent GitHub fetches — fast enough to not hammer
 * the API, slow enough to stay inside rate limits (5000 req/hr with a token).
 * Progress is flushed to DB every 5 candidates so the frontend poll stays live.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class BatchProcessingService {

    private static final int CONCURRENCY = 5;
    private static final int PROGRESS_FLUSH_EVERY = 5;

    private final CandidateAnalysisService candidateAnalysisService;
    private final BatchJobRepository batchJobRepository;

    @Async
    public void processAsync(Long jobId, List<String> logins) {
        BatchJob job = batchJobRepository.findById(jobId).orElse(null);
        if (job == null) {
            log.error("Batch job {} not found", jobId);
            return;
        }

        job.setStatus("RUNNING");
        batchJobRepository.save(job);
        log.info("Batch job {} started — {} candidates (concurrency={})", jobId, logins.size(), CONCURRENCY);

        ExecutorService pool = Executors.newFixedThreadPool(CONCURRENCY);
        List<Future<String>> futures = new ArrayList<>();

        AtomicInteger processed = new AtomicInteger(0);
        AtomicInteger failed    = new AtomicInteger(0);
        List<String> successIds = new CopyOnWriteArrayList<>();

        for (String login : logins) {
            futures.add(pool.submit(() -> {
                try {
                    var profile = candidateAnalysisService.analyze(login.trim().toLowerCase());
                    successIds.add(profile.getId());
                    return profile.getId();
                } catch (Exception e) {
                    log.warn("Batch job {} failed for login '{}': {}", jobId, login, e.getMessage());
                    failed.incrementAndGet();
                    return null;
                } finally {
                    int done = processed.incrementAndGet();
                    // Flush progress periodically to DB
                    if (done % PROGRESS_FLUSH_EVERY == 0 || done == logins.size()) {
                        flushProgress(jobId, done, failed.get());
                    }
                }
            }));
        }

        pool.shutdown();
        try {
            pool.awaitTermination(4, TimeUnit.HOURS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Batch job {} interrupted", jobId);
        }

        // Final DB update
        BatchJob done = batchJobRepository.findById(jobId).orElse(job);
        done.setStatus("DONE");
        done.setCompletedAt(LocalDateTime.now());
        done.setProcessed(logins.size());
        done.setFailedCount(failed.get());
        done.setCandidateIdsJson(toJsonArray(successIds));
        batchJobRepository.save(done);

        log.info("Batch job {} complete — {}/{} success, {} failed",
                jobId, successIds.size(), logins.size(), failed.get());
    }

    private void flushProgress(Long jobId, int processed, int failedCount) {
        try {
            batchJobRepository.findById(jobId).ifPresent(j -> {
                j.setProcessed(processed);
                j.setFailedCount(failedCount);
                batchJobRepository.save(j);
            });
        } catch (Exception e) {
            log.debug("Progress flush failed for job {}: {}", jobId, e.getMessage());
        }
    }

    private String toJsonArray(List<String> ids) {
        if (ids.isEmpty()) return "[]";
        return "[\"" + String.join("\",\"", ids) + "\"]";
    }
}
