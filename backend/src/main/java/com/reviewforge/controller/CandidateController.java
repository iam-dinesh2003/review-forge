package com.reviewforge.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.reviewforge.dto.candidate.AnalyzeRequest;
import com.reviewforge.dto.candidate.BatchJobDTO;
import com.reviewforge.dto.candidate.CandidateProfileDTO;
import com.reviewforge.entity.AuditLog;
import com.reviewforge.entity.BatchJob;
import com.reviewforge.entity.CandidateProfile;
import com.reviewforge.exception.ReviewForgeException;
import com.reviewforge.repository.BatchJobRepository;
import com.reviewforge.repository.CandidateProfileRepository;
import com.reviewforge.service.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/candidates")
@Slf4j
@RequiredArgsConstructor
public class CandidateController {

    private static final List<String> VALID_STATUSES =
        List.of("REVIEWING", "SHORTLISTED", "INTERVIEW", "OFFER", "REJECTED");

    private final CandidateAnalysisService   candidateAnalysisService;
    private final BatchProcessingService     batchProcessingService;
    private final JDMatchService             jdMatchService;
    private final AuditService               auditService;
    private final BatchJobRepository         batchJobRepository;
    private final CandidateProfileRepository profileRepository;
    private final GitHubProfileService       gitHubProfileService;
    private final ObjectMapper               objectMapper;

    // ── Single candidate analysis ──────────────────────────────────────────────

    @PostMapping("/analyze")
    public ResponseEntity<?> analyze(@Valid @RequestBody AnalyzeRequest request) {
        try {
            return ResponseEntity.ok(candidateAnalysisService.analyze(request.getGithubLogin()));
        } catch (ReviewForgeException e) {
            log.warn("Candidate analysis failed for {}: {}", request.getGithubLogin(), e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Unexpected error analyzing {}", request.getGithubLogin(), e);
            return ResponseEntity.internalServerError().body(Map.of("error", "Analysis failed — please try again."));
        }
    }

    @GetMapping
    public ResponseEntity<List<CandidateProfileDTO>> listCandidates() {
        return ResponseEntity.ok(candidateAnalysisService.listAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<CandidateProfileDTO> getCandidate(@PathVariable Long id) {
        return candidateAnalysisService.getById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    // ── Pipeline status ────────────────────────────────────────────────────────

    @PutMapping("/{id}/status")
    public ResponseEntity<?> updatePipelineStatus(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {

        String status = body.getOrDefault("status", "").toUpperCase();
        if (!VALID_STATUSES.contains(status))
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Invalid status. Must be one of: " + VALID_STATUSES));

        return profileRepository.findById(id).map(p -> {
            String prev = p.getPipelineStatus() != null ? p.getPipelineStatus() : "REVIEWING";
            p.setPipelineStatus(status);
            profileRepository.save(p);
            auditService.log("STATUS_CHANGED", id, prev + " → " + status + " for @" + p.getGithubLogin());
            return ResponseEntity.ok(Map.of("id", id, "status", status));
        }).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/pipeline/{status}")
    public ResponseEntity<List<CandidateProfileDTO>> getByPipelineStatus(@PathVariable String status) {
        String upper = status.toUpperCase();
        if (!VALID_STATUSES.contains(upper))
            return ResponseEntity.badRequest().build();
        List<CandidateProfile> profiles =
                profileRepository.findByPipelineStatusOrderByOverallScoreDesc(upper);
        return ResponseEntity.ok(profiles.stream()
                .map(CandidateProfileDTO::from).collect(Collectors.toList()));
    }

    // ── Batch ──────────────────────────────────────────────────────────────────

    @PostMapping("/batch")
    public ResponseEntity<?> startBatch(@RequestBody Map<String, Object> body) {
        String name  = String.valueOf(body.getOrDefault("name", "Batch " + LocalDateTime.now().toLocalDate()));
        Object loginsRaw = body.get("githubLogins");
        if (!(loginsRaw instanceof List<?>))
            return ResponseEntity.badRequest().body(Map.of("error", "githubLogins must be a list"));

        @SuppressWarnings("unchecked")
        List<String> logins = ((List<Object>) loginsRaw).stream()
                .map(Object::toString)
                .filter(s -> !s.isBlank())
                .limit(1000)
                .collect(Collectors.toList());

        if (logins.isEmpty())
            return ResponseEntity.badRequest().body(Map.of("error", "No valid GitHub logins provided"));

        BatchJob job = BatchJob.builder()
                .name(name)
                .totalCandidates(logins.size())
                .processed(0)
                .failedCount(0)
                .status("QUEUED")
                .createdAt(LocalDateTime.now())
                .candidateLoginsJson(toJson(logins))
                .build();
        job = batchJobRepository.save(job);

        batchProcessingService.processAsync(job.getId(), logins);
        log.info("Batch job {} queued with {} candidates", job.getId(), logins.size());

        return ResponseEntity.ok(BatchJobDTO.from(job));
    }

    @GetMapping("/batch")
    public ResponseEntity<List<BatchJobDTO>> listBatchJobs() {
        return ResponseEntity.ok(
                batchJobRepository.findAllByOrderByCreatedAtDesc().stream()
                        .map(BatchJobDTO::from).collect(Collectors.toList()));
    }

    @GetMapping("/batch/{id}")
    public ResponseEntity<BatchJobDTO> getBatchJob(@PathVariable Long id) {
        return batchJobRepository.findById(id)
                .map(BatchJobDTO::from)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    // ── JD Matching ───────────────────────────────────────────────────────────

    @PostMapping("/{id}/jd-match")
    public ResponseEntity<?> matchJD(@PathVariable Long id, @RequestBody Map<String, String> body) {
        String rawText = body.getOrDefault("rawText", "");
        if (rawText.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "rawText is required"));
        try {
            CandidateProfileDTO.JDMatchResult result = jdMatchService.matchCandidate(
                    id, body.getOrDefault("title", "Role"),
                    body.getOrDefault("company", "Company"), rawText);
            auditService.log("JD_MATCHED", id, "JD matched: " + body.getOrDefault("title", "Role"));
            return ResponseEntity.ok(result);
        } catch (ReviewForgeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/jd-match/bulk")
    public ResponseEntity<?> matchJDBulk(@RequestBody Map<String, Object> body) {
        String rawText = String.valueOf(body.getOrDefault("rawText", ""));
        if (rawText.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "rawText is required"));

        @SuppressWarnings("unchecked")
        List<String> idStrs = (List<String>) body.getOrDefault("candidateIds", List.of());
        List<Long> ids = idStrs.stream().map(Long::parseLong).collect(Collectors.toList());
        if (ids.isEmpty())
            return ResponseEntity.badRequest().body(Map.of("error", "candidateIds is required"));

        List<JDMatchService.BulkMatchResult> results = jdMatchService.matchBulk(ids,
                String.valueOf(body.getOrDefault("title", "Role")),
                String.valueOf(body.getOrDefault("company", "Company")), rawText);
        return ResponseEntity.ok(results);
    }

    // ── Notes ─────────────────────────────────────────────────────────────────

    @GetMapping("/{id}/notes")
    public ResponseEntity<?> getNotes(@PathVariable Long id) {
        return profileRepository.findById(id).map(p -> {
            List<CandidateProfileDTO.CandidateNote> notes = parseNotes(p.getNotesJson());
            return ResponseEntity.ok(notes);
        }).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/notes")
    public ResponseEntity<?> addNote(@PathVariable Long id, @RequestBody Map<String, String> body) {
        String text = body.getOrDefault("text", "").trim();
        if (text.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "Note text is required"));

        return profileRepository.findById(id).map(p -> {
            List<CandidateProfileDTO.CandidateNote> notes = new ArrayList<>(parseNotes(p.getNotesJson()));
            CandidateProfileDTO.CandidateNote note = CandidateProfileDTO.CandidateNote.builder()
                    .id(UUID.randomUUID().toString())
                    .text(text)
                    .createdAt(LocalDateTime.now().toString())
                    .build();
            notes.add(0, note);
            p.setNotesJson(toJson(notes));
            profileRepository.save(p);
            auditService.log("NOTE_ADDED", id, "Note added: " + text.substring(0, Math.min(60, text.length())));
            return ResponseEntity.ok(note);
        }).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}/notes/{noteId}")
    public ResponseEntity<?> deleteNote(@PathVariable Long id, @PathVariable String noteId) {
        return profileRepository.findById(id).map(p -> {
            List<CandidateProfileDTO.CandidateNote> notes = new ArrayList<>(parseNotes(p.getNotesJson()));
            notes.removeIf(n -> noteId.equals(n.getId()));
            p.setNotesJson(toJson(notes));
            profileRepository.save(p);
            auditService.log("NOTE_DELETED", id, "Note " + noteId + " deleted");
            return ResponseEntity.ok().build();
        }).orElse(ResponseEntity.notFound().build());
    }

    // ── Audit trail ───────────────────────────────────────────────────────────

    @GetMapping("/{id}/audit")
    public ResponseEntity<List<Map<String, Object>>> getCandidateAudit(@PathVariable Long id) {
        return ResponseEntity.ok(auditService.getForCandidate(id).stream()
                .map(this::auditToMap).collect(Collectors.toList()));
    }

    @GetMapping("/audit")
    public ResponseEntity<List<Map<String, Object>>> getAllAudit() {
        return ResponseEntity.ok(auditService.getAll().stream()
                .map(this::auditToMap).collect(Collectors.toList()));
    }

    // ── Plagiarism check ──────────────────────────────────────────────────────

    @GetMapping("/batch/{id}/plagiarism")
    public ResponseEntity<?> checkPlagiarism(@PathVariable Long id) {
        BatchJob job = batchJobRepository.findById(id).orElse(null);
        if (job == null) return ResponseEntity.notFound().build();

        List<String> ids = parseIdList(job.getCandidateIdsJson());
        if (ids.isEmpty()) return ResponseEntity.ok(List.of());

        List<CandidateProfile> profiles = profileRepository.findAllById(
                ids.stream().map(Long::parseLong).collect(Collectors.toList()));

        // Detect same-repo-name across candidates
        Map<String, List<String>> repoToLogins = new LinkedHashMap<>();
        for (CandidateProfile p : profiles) {
            List<CandidateProfileDTO.SkippedRepo> skipped = parseSkippedRepos(p.getScoreBreakdownJson());
            // Pull repo names from scoreBreakdown.reposAnalyzed
            List<String> analyzed = parseReposAnalyzed(p.getScoreBreakdownJson());
            for (String repo : analyzed) {
                repoToLogins.computeIfAbsent(repo, k -> new ArrayList<>()).add(p.getGithubLogin());
            }
        }

        List<Map<String, Object>> flags = repoToLogins.entrySet().stream()
                .filter(e -> e.getValue().size() > 1)
                .map(e -> Map.<String, Object>of(
                        "repoName", e.getKey(),
                        "sharedBy", e.getValue(),
                        "severity", "HIGH",
                        "message", "Repo '" + e.getKey() + "' appears in " + e.getValue().size() + " candidate profiles — possible code sharing"))
                .collect(Collectors.toList());

        return ResponseEntity.ok(Map.of("batchId", id, "flags", flags, "clean", flags.isEmpty()));
    }

    // ── GitHub rate limit status ───────────────────────────────────────────────

    @GetMapping("/github/rate-limit")
    public ResponseEntity<Map<String, Object>> githubRateLimit() {
        return ResponseEntity.ok(gitHubProfileService.getRateLimitStatus());
    }

    // ── Util ───────────────────────────────────────────────────────────────────

    private String toJson(Object obj) {
        try { return objectMapper.writeValueAsString(obj); }
        catch (Exception e) { return "[]"; }
    }

    @SuppressWarnings("unchecked")
    private List<CandidateProfileDTO.CandidateNote> parseNotes(String json) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try { return objectMapper.readValue(json, new TypeReference<>() {}); }
        catch (Exception e) { return Collections.emptyList(); }
    }

    @SuppressWarnings("unchecked")
    private List<String> parseIdList(String json) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try { return objectMapper.readValue(json, new TypeReference<>() {}); }
        catch (Exception e) { return Collections.emptyList(); }
    }

    @SuppressWarnings("unchecked")
    private List<CandidateProfileDTO.SkippedRepo> parseSkippedRepos(String breakdownJson) {
        if (breakdownJson == null || breakdownJson.isBlank()) return Collections.emptyList();
        try {
            Map<String, Object> m = objectMapper.readValue(breakdownJson, Map.class);
            Object raw = m.get("reposSkipped");
            if (!(raw instanceof List)) return Collections.emptyList();
            return objectMapper.convertValue(raw, new TypeReference<>() {});
        } catch (Exception e) { return Collections.emptyList(); }
    }

    @SuppressWarnings("unchecked")
    private List<String> parseReposAnalyzed(String breakdownJson) {
        if (breakdownJson == null || breakdownJson.isBlank()) return Collections.emptyList();
        try {
            Map<String, Object> m = objectMapper.readValue(breakdownJson, Map.class);
            Object raw = m.get("reposAnalyzed");
            if (!(raw instanceof List)) return Collections.emptyList();
            return ((List<?>) raw).stream().map(Object::toString).collect(Collectors.toList());
        } catch (Exception e) { return Collections.emptyList(); }
    }

    private Map<String, Object> auditToMap(AuditLog log) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", log.getId());
        m.put("eventType", log.getEventType());
        m.put("candidateId", log.getCandidateId());
        m.put("description", log.getDescription());
        m.put("createdAt", log.getCreatedAt().toString());
        return m;
    }
}
