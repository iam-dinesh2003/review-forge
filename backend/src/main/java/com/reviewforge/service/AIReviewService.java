package com.reviewforge.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.reviewforge.dto.ai.AIReviewResult;
import com.reviewforge.exception.ReviewForgeException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Sends PR diffs to Google Gemini and parses the structured JSON review.
 *
 * Design decisions:
 * - Filter diff to .java files only (max 5 files, max 200 lines each)
 *   to stay within Gemini's reliable structured-output context window.
 * - Use responseMimeType=application/json to force JSON output and
 *   minimize markdown-wrapping issues.
 * - Exponential backoff with jitter on retries (1s → 2s → 4s).
 * - Always strip ```json fences before parsing as a defensive measure.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AIReviewService {

    @Value("${gemini.api.key}")
    private String geminiApiKey;

    @Value("${gemini.model:gemini-2.5-flash-preview-05-20}")
    private String geminiModel;

    @Value("${gemini.max-diff-chars:12000}")
    private int maxDiffChars;

    private static final String GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

    private static final String SYSTEM_PROMPT = """
            You are a senior Java/Spring Boot engineer reviewing a GitHub Pull Request diff.
            Analyze ONLY the changed lines (lines starting with + in the diff).

            Respond ONLY with a valid JSON object in exactly this structure:
            {
              "summary": "2-3 sentence overall assessment of the PR quality",
              "score": 85,
              "comments": [
                {
                  "file": "src/main/java/com/example/Service.java",
                  "line": 42,
                  "severity": "CRITICAL",
                  "category": "SECURITY",
                  "message": "Clear explanation of the issue and why it is a problem",
                  "suggestion": "corrected_code_snippet_here"
                }
              ]
            }

            Rules:
            - severity must be exactly one of: CRITICAL, WARNING, INFO
            - category must be exactly one of: SECURITY, PERFORMANCE, BUG, CODE_QUALITY, BEST_PRACTICE
            - score must be an integer 0-100 (100 = perfect, production-ready code)
            - suggestion is optional — only include when there is a concrete fix
            - Only report real issues — do not invent problems in unchanged code

            Focus on Java/Spring Boot specific issues:
            - SQL injection via string concatenation (not using PreparedStatement or JPA)
            - Missing @Transactional on methods doing multiple DB writes
            - N+1 query patterns (Lazy loading in a loop, missing JOIN FETCH)
            - Null pointer risks — calling methods on potentially null references
            - Unclosed streams, connections, or file handles (use try-with-resources)
            - Thread safety issues (shared mutable state without synchronization)
            - Missing error handling on external API calls (RestTemplate, WebClient)
            - Hardcoded secrets, API keys, or passwords in source code
            - Memory leaks (unbounded caches, event listeners not removed)
            - Missing @Transactional rollbackFor on checked exceptions
            """;

    private final ObjectMapper objectMapper;

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Reviews the PR diff and returns structured AI feedback.
     * Retries up to 3 times with exponential backoff on failure.
     */
    public AIReviewResult review(String rawDiff) {
        String filteredDiff = filterAndTruncateDiff(rawDiff);

        if (filteredDiff == null || filteredDiff.isBlank()) {
            log.warn("No Java diff content to review — returning empty result");
            return emptyResult();
        }

        String prompt = SYSTEM_PROMPT + "\n\nHere is the PR diff to review:\n```diff\n" + filteredDiff + "\n```";

        Exception lastException = null;
        for (int attempt = 0; attempt < 3; attempt++) {
            try {
                String raw = callGemini(prompt);
                AIReviewResult result = parseResult(raw);
                log.info("AI review complete: score={}, critical={}, warning={}, info={}",
                        result.getScore(), result.criticalCount(), result.warningCount(), result.infoCount());
                return result;
            } catch (Exception e) {
                lastException = e;
                long delay = (long) (Math.pow(2, attempt) * 1000 + Math.random() * 500);
                log.warn("Gemini attempt {} failed: {} — retrying in {}ms", attempt + 1, e.getMessage(), delay);
                try {
                    Thread.sleep(delay);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new ReviewForgeException("AI review interrupted", ie);
                }
            }
        }

        throw new ReviewForgeException("AI review failed after 3 attempts", lastException);
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    /**
     * Filters diff to Java files only, limits to 5 files, and caps total chars.
     * This keeps Gemini in reliable structured-output territory.
     */
    private String filterAndTruncateDiff(String rawDiff) {
        if (rawDiff == null) return null;

        String filtered = Arrays.stream(rawDiff.split("diff --git"))
                .filter(chunk -> chunk.contains(".java"))
                .limit(5)
                .map(chunk -> limitLines(chunk, 200))
                .collect(Collectors.joining("\ndiff --git"));

        if (filtered.length() > maxDiffChars) {
            log.debug("Diff truncated from {} to {} chars", filtered.length(), maxDiffChars);
            filtered = filtered.substring(0, maxDiffChars) + "\n[DIFF TRUNCATED — showing first " + maxDiffChars + " chars]";
        }

        return filtered;
    }

    private String limitLines(String chunk, int maxLines) {
        String[] lines = chunk.split("\n");
        if (lines.length <= maxLines) return chunk;
        return String.join("\n", Arrays.copyOf(lines, maxLines)) + "\n[FILE TRUNCATED]";
    }

    @SuppressWarnings("unchecked")
    private String callGemini(String prompt) {
        RestTemplate rt = new RestTemplate();

        Map<String, Object> requestBody = Map.of(
                "contents", List.of(Map.of(
                        "parts", List.of(Map.of("text", prompt))
                )),
                "generationConfig", Map.of(
                        "responseMimeType", "application/json",
                        "temperature", 0.1,
                        "maxOutputTokens", 4096
                )
        );

        String url = GEMINI_BASE + geminiModel + ":generateContent?key=" + geminiApiKey;

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        try {
            ResponseEntity<Map> response = rt.exchange(
                    url, HttpMethod.POST, new HttpEntity<>(requestBody, headers), Map.class
            );

            List<Map<String, Object>> candidates = (List<Map<String, Object>>) response.getBody().get("candidates");
            Map<String, Object> candidate = candidates.get(0);
            Map<String, Object> content = (Map<String, Object>) candidate.get("content");
            List<Map<String, Object>> parts = (List<Map<String, Object>>) content.get("parts");
            return (String) parts.get(0).get("text");

        } catch (Exception e) {
            throw new ReviewForgeException("Gemini API call failed: " + e.getMessage(), e);
        }
    }

    private AIReviewResult parseResult(String raw) {
        // Strip markdown code fences (Gemini occasionally wraps even with responseMimeType set)
        String clean = raw
                .replaceAll("(?s)```json\\s*", "")
                .replaceAll("```", "")
                .trim();

        try {
            AIReviewResult result = objectMapper.readValue(clean, AIReviewResult.class);

            // Clamp score to valid range
            result.setScore(Math.max(0, Math.min(100, result.getScore())));

            // Sanitize severity/category to prevent DB constraint violations
            if (result.getComments() != null) {
                result.getComments().removeIf(c ->
                        !List.of("CRITICAL", "WARNING", "INFO").contains(c.getSeverity()) ||
                        !List.of("SECURITY", "PERFORMANCE", "BUG", "CODE_QUALITY", "BEST_PRACTICE").contains(c.getCategory())
                );
            }

            return result;
        } catch (Exception e) {
            log.error("Failed to parse Gemini response. Raw (first 500 chars): {}",
                    clean.substring(0, Math.min(500, clean.length())));
            throw new ReviewForgeException("JSON parse failed for AI response", e);
        }
    }

    private AIReviewResult emptyResult() {
        AIReviewResult result = new AIReviewResult();
        result.setSummary("No Java files changed in this PR — nothing to review.");
        result.setScore(100);
        return result;
    }
}
