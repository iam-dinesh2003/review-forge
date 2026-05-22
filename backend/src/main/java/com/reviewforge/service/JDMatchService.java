package com.reviewforge.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.reviewforge.dto.candidate.CandidateProfileDTO;
import com.reviewforge.entity.CandidateProfile;
import com.reviewforge.exception.ReviewForgeException;
import com.reviewforge.repository.CandidateProfileRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
public class JDMatchService {

    private static final String GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
    private static final String ML_SCORER_URL = "http://localhost:8091/score";

    @Value("${gemini.api.key}")
    private String geminiApiKey;

    @Value("${gemini.model:gemini-2.5-flash-preview-05-20}")
    private String geminiModel;

    private final CandidateProfileRepository repository;
    private final ObjectMapper objectMapper;

    // ── Single candidate ───────────────────────────────────────────────────────

    public CandidateProfileDTO.JDMatchResult matchCandidate(Long candidateId, String jdTitle,
                                                             String jdCompany, String jdRawText) {
        CandidateProfile profile = repository.findById(candidateId)
                .orElseThrow(() -> new ReviewForgeException("Candidate not found: " + candidateId));

        CandidateProfileDTO dto = CandidateProfileDTO.from(profile);

        // Try ML scorer; fall back to Gemini
        CandidateProfileDTO.JDMatchResult result;
        try {
            List<BulkMatchResult> mlResults = callMLBulk(List.of(dto), jdRawText);
            result = mlResults.isEmpty() ? callGeminiMatch(dto, jdTitle, jdCompany, jdRawText)
                                         : mlResults.get(0).jdMatch();
        } catch (Exception e) {
            log.warn("ML scorer unavailable, falling back to Gemini: {}", e.getMessage());
            result = callGeminiMatch(dto, jdTitle, jdCompany, jdRawText);
        }

        profile.setJdMatchJson(toJson(result));
        repository.save(profile);
        return result;
    }

    // ── Bulk match — all candidates against one JD ────────────────────────────

    public List<BulkMatchResult> matchBulk(List<Long> candidateIds, String jdTitle,
                                            String jdCompany, String jdRawText) {
        List<CandidateProfile> profiles = repository.findAllById(candidateIds);
        List<CandidateProfileDTO> dtos = profiles.stream()
                .map(CandidateProfileDTO::from).collect(Collectors.toList());

        // Attempt single batch ML call (no rate limits, globally ranked)
        try {
            List<BulkMatchResult> mlResults = callMLBulk(dtos, jdRawText);
            if (!mlResults.isEmpty()) {
                persistBulkResults(profiles, mlResults);
                return mlResults;
            }
        } catch (Exception e) {
            log.warn("ML scorer bulk failed, falling back to Gemini per-candidate: {}", e.getMessage());
        }

        // Gemini fallback (per-candidate, sequential)
        List<BulkMatchResult> results = new ArrayList<>();
        for (CandidateProfile p : profiles) {
            try {
                CandidateProfileDTO dto = CandidateProfileDTO.from(p);
                CandidateProfileDTO.JDMatchResult match = callGeminiMatch(dto, jdTitle, jdCompany, jdRawText);
                p.setJdMatchJson(toJson(match));
                repository.save(p);
                results.add(new BulkMatchResult(String.valueOf(p.getId()), p.getGithubLogin(), match));
            } catch (Exception e) {
                log.warn("JD match failed for candidate {}: {}", p.getId(), e.getMessage());
            }
        }
        return results;
    }

    // ── ML scorer ─────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private List<BulkMatchResult> callMLBulk(List<CandidateProfileDTO> candidates, String jdText) {
        RestTemplate rt = new RestTemplate();

        List<Map<String, Object>> candidateMaps = candidates.stream().map(c -> {
            List<Map<String, Object>> skills = c.getSkills().stream()
                    .map(s -> Map.<String, Object>of("name", s.getName(), "level", s.getLevel()))
                    .collect(Collectors.toList());
            List<Map<String, Object>> langs = c.getTopLanguages().stream()
                    .map(l -> Map.<String, Object>of("name", l.getName(), "percentage", l.getPercentage()))
                    .collect(Collectors.toList());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("username", c.getGithubLogin());
            m.put("bio", c.getBio() != null ? c.getBio() : "");
            m.put("skills", skills);
            m.put("languages", langs);
            return m;
        }).collect(Collectors.toList());

        Map<String, Object> body = Map.of("jd_text", jdText, "candidates", candidateMaps);
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);

        ResponseEntity<Map> res = rt.exchange(
                ML_SCORER_URL, HttpMethod.POST, new HttpEntity<>(body, h), Map.class);

        if (res.getBody() == null) return Collections.emptyList();

        List<Map<String, Object>> mlResults = (List<Map<String, Object>>) res.getBody().get("results");
        if (mlResults == null) return Collections.emptyList();

        // Build lookup by username for result mapping
        Map<String, CandidateProfileDTO> byUsername = candidates.stream()
                .collect(Collectors.toMap(CandidateProfileDTO::getGithubLogin, c -> c));

        return mlResults.stream().map(r -> {
            String username = (String) r.get("username");
            int score = (int) Math.round(((Number) r.get("score")).doubleValue());
            String verdict = (String) r.get("verdict");
            List<String> matched = parseStringList(r.get("matched_skills"));
            List<String> missing = parseStringList(r.get("missing_skills"));
            String summary = (String) r.getOrDefault("summary", "");

            CandidateProfileDTO dto = byUsername.get(username);
            String candidateId = dto != null ? dto.getId() : username;

            CandidateProfileDTO.JDMatchResult match = CandidateProfileDTO.JDMatchResult.builder()
                    .score(score)
                    .verdict(verdict)
                    .matchedSkills(matched)
                    .missingSkills(missing)
                    .bonusSkills(Collections.emptyList())
                    .summary(summary)
                    .build();

            return new BulkMatchResult(candidateId, username, match);
        }).collect(Collectors.toList());
    }

    private void persistBulkResults(List<CandidateProfile> profiles, List<BulkMatchResult> results) {
        Map<String, BulkMatchResult> byLogin = results.stream()
                .collect(Collectors.toMap(BulkMatchResult::githubLogin, r -> r));
        for (CandidateProfile p : profiles) {
            BulkMatchResult r = byLogin.get(p.getGithubLogin());
            if (r != null) {
                p.setJdMatchJson(toJson(r.jdMatch()));
                repository.save(p);
            }
        }
    }

    // ── Gemini fallback ────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private CandidateProfileDTO.JDMatchResult callGeminiMatch(CandidateProfileDTO candidate,
                                                               String jdTitle, String jdCompany,
                                                               String jdRawText) {
        String skillsStr = candidate.getSkills().stream()
                .map(s -> s.getName() + " (" + s.getLevel() + ", " + s.getEvidenceCount() + " files evidence)")
                .collect(Collectors.joining(", "));
        String langsStr = candidate.getTopLanguages().stream()
                .map(l -> l.getName() + " " + l.getPercentage() + "%")
                .collect(Collectors.joining(", "));

        String prompt = """
                You are a senior technical recruiter. Match this candidate against a job description.

                ## Candidate: %s (@%s)
                Score: %d/100
                Skills: %s
                Languages: %s
                Summary: %s

                ## Job Description
                Title: %s at %s
                ---
                %s
                ---

                Respond ONLY with valid JSON:
                {
                  "score": 78,
                  "verdict": "STRONG_FIT",
                  "matchedSkills": ["Java", "Spring Boot"],
                  "missingSkills": ["Kubernetes", "Kafka"],
                  "bonusSkills": ["gRPC"],
                  "summary": "2-3 honest sentences about the fit"
                }

                verdict must be exactly one of: STRONG_FIT (score>=70), MAYBE (score 40-69), POOR_FIT (score<40)
                """.formatted(
                        candidate.getName(), candidate.getGithubLogin(),
                        candidate.getOverallScore(), skillsStr, langsStr,
                        candidate.getSummary() != null ? candidate.getSummary().substring(0, Math.min(200, candidate.getSummary().length())) : "",
                        jdTitle, jdCompany, jdRawText.substring(0, Math.min(2000, jdRawText.length()))
                );

        String raw = null;
        for (int attempt = 0; attempt < 3; attempt++) {
            try { raw = callGeminiApi(prompt); break; }
            catch (Exception e) {
                long delay = (long)(Math.pow(2, attempt) * 1000 + Math.random() * 500);
                log.warn("JD match Gemini attempt {} failed: {}", attempt + 1, e.getMessage());
                try { Thread.sleep(delay); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
            }
        }
        if (raw == null) throw new ReviewForgeException("JD match Gemini call failed after 3 attempts");

        return parseGeminiResult(raw);
    }

    @SuppressWarnings("unchecked")
    private String callGeminiApi(String prompt) {
        RestTemplate rt = new RestTemplate();
        Map<String, Object> body = Map.of(
                "contents", List.of(Map.of("parts", List.of(Map.of("text", prompt)))),
                "generationConfig", Map.of("responseMimeType", "application/json", "temperature", 0.1, "maxOutputTokens", 1024)
        );
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<Map> res = rt.exchange(
                GEMINI_BASE + geminiModel + ":generateContent?key=" + geminiApiKey,
                HttpMethod.POST, new HttpEntity<>(body, h), Map.class);
        List<Map<String, Object>> candidates = (List<Map<String, Object>>) res.getBody().get("candidates");
        Map<String, Object> content = (Map<String, Object>) candidates.get(0).get("content");
        List<Map<String, Object>> parts = (List<Map<String, Object>>) content.get("parts");
        return (String) parts.get(0).get("text");
    }

    @SuppressWarnings("unchecked")
    private CandidateProfileDTO.JDMatchResult parseGeminiResult(String raw) {
        String clean = raw.replaceAll("(?s)```json\\s*", "").replaceAll("```", "").trim();
        try {
            Map<String, Object> m = objectMapper.readValue(clean, Map.class);
            int score = Math.max(0, Math.min(100, getInt(m, "score")));
            String verdict = (String) m.getOrDefault("verdict", scoreToVerdict(score));
            return CandidateProfileDTO.JDMatchResult.builder()
                    .score(score)
                    .verdict(verdict)
                    .matchedSkills(parseStringList(m.get("matchedSkills")))
                    .missingSkills(parseStringList(m.get("missingSkills")))
                    .bonusSkills(parseStringList(m.get("bonusSkills")))
                    .summary(getStr(m, "summary"))
                    .build();
        } catch (Exception e) {
            throw new ReviewForgeException("Failed to parse JD match response", e);
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private String scoreToVerdict(int score) {
        if (score >= 70) return "STRONG_FIT";
        if (score >= 40) return "MAYBE";
        return "POOR_FIT";
    }

    @SuppressWarnings("unchecked")
    private List<String> parseStringList(Object raw) {
        if (!(raw instanceof List)) return Collections.emptyList();
        return ((List<?>) raw).stream().map(Object::toString).collect(Collectors.toList());
    }

    private int getInt(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v instanceof Number n ? n.intValue() : 0;
    }

    private String getStr(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v != null ? v.toString() : "";
    }

    private String toJson(Object obj) {
        try { return objectMapper.writeValueAsString(obj); }
        catch (Exception e) { return "{}"; }
    }

    public record BulkMatchResult(String candidateId, String githubLogin,
                                   CandidateProfileDTO.JDMatchResult jdMatch) {}
}
