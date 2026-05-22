package com.reviewforge.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.reviewforge.dto.candidate.CandidateProfileDTO;
import com.reviewforge.entity.CandidateProfile;
import com.reviewforge.exception.ReviewForgeException;
import com.reviewforge.repository.CandidateProfileRepository;
import com.reviewforge.service.AuditService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
public class CandidateAnalysisService {

    private static final int MAX_CANDIDATE_REPOS = 9;   // fetch more, filter down
    private static final int MAX_ANALYZED_REPOS  = 3;   // only best repos sent to Gemini
    private static final int MAX_PRS_PER_REPO    = 2;
    private static final int MAX_TOTAL_PRS       = 5;
    private static final int MAX_DIFF_CHARS      = 14_000;
    private static final String GEMINI_BASE      = "https://generativelanguage.googleapis.com/v1beta/models/";

    // Keywords that flag a repo as beginner/tutorial quality
    private static final List<String> BEGINNER_NAME_SIGNALS = List.of(
        "hello-world", "helloworld", "todo", "to-do", "calculator",
        "portfolio", "learning", "practice", "tutorial", "demo",
        "test", "sample", "example", "playground", "scratch",
        "study", "course", "bootcamp", "assignment", "homework",
        "first", "beginner", "basic", "simple", "mini", "temp",
        "clone", "copy", "follow-along", "my-first"
    );

    private static final List<String> BEGINNER_DESC_SIGNALS = List.of(
        "following along", "tutorial", "learning", "practice project",
        "my first", "beginner", "homework", "assignment", "course project"
    );

    @Value("${gemini.api.key}")
    private String geminiApiKey;

    @Value("${gemini.model:gemini-2.5-flash-preview-05-20}")
    private String geminiModel;

    private final GitHubProfileService gitHubProfileService;
    private final CandidateProfileRepository repository;
    private final AuditService auditService;
    private final ObjectMapper objectMapper;

    // ── Public API ─────────────────────────────────────────────────────────────

    @Transactional
    public CandidateProfileDTO analyze(String githubLogin) {
        String login = githubLogin.toLowerCase().trim();

        if (repository.existsByGithubLoginAndAnalyzedAtAfter(login, LocalDateTime.now().minusHours(1))) {
            return repository.findByGithubLogin(login).map(CandidateProfileDTO::from).orElseThrow();
        }

        log.info("Starting candidate analysis for: {}", login);

        // ── 1. GitHub profile ──────────────────────────────────────────────────
        Map<String, Object> profile = gitHubProfileService.getUserProfile(login);
        String name      = str(profile, "name", login);
        String avatarUrl = str(profile, "avatar_url", "");
        String bio       = str(profile, "bio", "");
        String location  = str(profile, "location", "");
        int publicRepos  = num(profile, "public_repos");
        int followers    = num(profile, "followers");

        // ── 2. Fetch repos and classify quality ────────────────────────────────
        List<Map<String, Object>> allRepos = gitHubProfileService.getPublicRepos(login, MAX_CANDIDATE_REPOS);
        List<RepoEntry> qualityRepos   = new ArrayList<>();
        List<SkippedRepo> skippedRepos = new ArrayList<>();

        for (Map<String, Object> repo : allRepos) {
            String repoName = str(repo, "name", "");
            if (repoName.isBlank()) continue;

            // Skip explicit GitHub forks
            if (Boolean.TRUE.equals(repo.get("fork"))) {
                skippedRepos.add(new SkippedRepo(repoName, "Forked repository — not original work"));
                continue;
            }

            // Beginner/tutorial keyword filter
            String reason = detectBeginnerRepo(repo);
            if (reason != null) {
                skippedRepos.add(new SkippedRepo(repoName, reason));
                continue;
            }

            // Ownership verification: if < 15% of recent commits are by this author,
            // the repo was likely cloned/copied and re-uploaded rather than authored.
            double authorRatio = gitHubProfileService.getAuthorCommitRatio(login, repoName, login);
            if (authorRatio < 0.15) {
                skippedRepos.add(new SkippedRepo(repoName,
                    String.format("Low original authorship (%.0f%% of commits by candidate) — may be copied/cloned", authorRatio * 100)));
                continue;
            }

            qualityRepos.add(new RepoEntry(repoName, num(repo, "stargazers_count"),
                    num(repo, "size"), str(repo, "description", "")));
        }

        // Sort quality repos by stars + size descending — analyze the strongest first
        qualityRepos.sort(Comparator.comparingInt((RepoEntry r) -> r.stars() * 10 + Math.min(r.sizeKb() / 100, 5)).reversed());
        List<RepoEntry> analyzedRepos = qualityRepos.stream().limit(MAX_ANALYZED_REPOS).toList();

        log.info("login={} totalRepos={} qualityRepos={} skipped={}", login,
                allRepos.size(), qualityRepos.size(), skippedRepos.size());

        // ── 3. Collect diffs from quality repos only ───────────────────────────
        Map<String, Long> langTotals = new LinkedHashMap<>();
        List<PREntry> prEntries = new ArrayList<>();

        for (RepoEntry repo : analyzedRepos) {
            if (prEntries.size() >= MAX_TOTAL_PRS) break;
            Map<String, Long> langs = gitHubProfileService.getLanguageStats(login, repo.name());
            langs.forEach((lang, bytes) -> langTotals.merge(lang, bytes, Long::sum));

            List<Map<String, Object>> prs = gitHubProfileService.getRecentMergedPRs(login, repo.name(), MAX_PRS_PER_REPO);
            for (Map<String, Object> pr : prs) {
                if (prEntries.size() >= MAX_TOTAL_PRS) break;
                String diff = gitHubProfileService.getPRDiff(login, repo.name(), num(pr, "number"));
                prEntries.add(new PREntry(num(pr, "number"), str(pr, "title", ""),
                        login + "/" + repo.name(), str(pr, "html_url", ""),
                        num(pr, "additions"), num(pr, "deletions"),
                        num(pr, "changed_files"), str(pr, "merged_at", ""), diff));
            }
        }

        // ── 4a. Commit consistency (fetched from top quality repo) ─────────────
        List<String> commitDates = Collections.emptyList();
        if (!analyzedRepos.isEmpty()) {
            commitDates = gitHubProfileService.getCommitDates(login, analyzedRepos.get(0).name(), login);
        }
        CommitConsistencyData consistencyData = analyzeCommitConsistency(commitDates);
        CandidateProfileDTO.CommitConsistency commitConsistency = toCommitConsistencyDTO(consistencyData);

        // ── 4b. Local metrics ──────────────────────────────────────────────────
        LocalMetrics localMetrics = computeLocalMetrics(prEntries);
        List<CandidateProfileDTO.LanguageShare> topLanguages = computeLanguageShares(langTotals);

        // ── 5. Gemini analysis (strict scoring) ────────────────────────────────
        GeminiResult aiResult = callGemini(login, name, prEntries, analyzedRepos, skippedRepos,
                publicRepos, qualityRepos.size());

        // ── 6. Build DTOs ──────────────────────────────────────────────────────
        CandidateProfileDTO.CodeMetrics metrics = CandidateProfileDTO.CodeMetrics.builder()
                .avgComplexity(aiResult.avgComplexity > 0 ? aiResult.avgComplexity : localMetrics.estimatedComplexity)
                .testRatio(localMetrics.testRatio)
                .commentRatio(localMetrics.commentRatio)
                .avgFileLoc(localMetrics.avgFileLoc)
                .duplicateRatio(aiResult.aiDetection != null ? aiResult.aiDetection.boilerplateRatio : 0.1)
                .build();

        double commitBurstRatio = computeCommitBurstRatio(prEntries);
        CandidateProfileDTO.AIDetection aiDetectionDTO = toAIDetectionDTO(aiResult.aiDetection, commitBurstRatio);
        List<CandidateProfileDTO.PRAnalysis> prAnalysis = buildPRAnalysis(prEntries, aiResult.prComments);
        List<CandidateProfileDTO.InterviewQuestion> interviewQuestions = buildInterviewQuestions(aiResult.interviewQuestions);

        // Build score breakdown DTO
        CandidateProfileDTO.ScoreBreakdown scoreBreakdown = buildScoreBreakdown(
                aiResult, analyzedRepos, skippedRepos, localMetrics, publicRepos, qualityRepos.size());

        // ── 7. Persist ─────────────────────────────────────────────────────────
        CandidateProfile entity = repository.findByGithubLogin(login).orElse(new CandidateProfile());
        entity.setGithubLogin(login);
        entity.setName(name);
        entity.setAvatarUrl(avatarUrl);
        entity.setBio(bio);
        entity.setLocation(location);
        entity.setPublicRepos(publicRepos);
        entity.setFollowers(followers);
        entity.setAnalyzedAt(LocalDateTime.now());
        entity.setOverallScore(aiResult.overallScore);
        entity.setSummary(aiResult.summary);
        entity.setTopLanguagesJson(toJson(topLanguages));
        entity.setSkillsJson(toJson(aiResult.skills));
        entity.setAiDetectionJson(toJson(aiDetectionDTO));
        entity.setMetricsJson(toJson(metrics));
        entity.setStrengthsJson(toJson(aiResult.strengths));
        entity.setConcernsJson(toJson(aiResult.concerns));
        entity.setPrAnalysisJson(toJson(prAnalysis));
        entity.setScoreBreakdownJson(toJson(scoreBreakdown));
        entity.setCommitConsistencyJson(toJson(commitConsistency));
        entity.setInterviewQuestionsJson(toJson(interviewQuestions));

        entity = repository.save(entity);

        // Compute percentile rank after saving (needs total count in DB)
        long total = repository.count();
        long below = repository.countBelowScore(entity.getOverallScore());
        int percentile = total > 1 ? (int) Math.round((below * 100.0) / (total - 1)) : 99;
        entity.setPercentileRank(percentile);
        entity = repository.save(entity);
        log.info("Analysis complete: login={} score={} qualityRepos={}/{}", login,
                aiResult.overallScore, analyzedRepos.size(), publicRepos);

        auditService.log("ANALYZED", entity.getId(),
                String.format("Analyzed @%s — score %d, %d repos analyzed, %d skipped",
                        login, aiResult.overallScore, analyzedRepos.size(), skippedRepos.size()));

        return CandidateProfileDTO.from(entity);
    }

    @Transactional(readOnly = true)
    public List<CandidateProfileDTO> listAll() {
        return repository.findAllByOrderByAnalyzedAtDesc().stream()
                .map(CandidateProfileDTO::from).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public Optional<CandidateProfileDTO> getById(Long id) {
        return repository.findById(id).map(CandidateProfileDTO::from);
    }

    // ── Repo quality classification ────────────────────────────────────────────

    /**
     * Returns a skip reason if the repo is detected as beginner/tutorial quality,
     * or null if it should be analyzed.
     */
    private String detectBeginnerRepo(Map<String, Object> repo) {
        String name = str(repo, "name", "").toLowerCase();
        String desc = str(repo, "description", "").toLowerCase();
        int size    = num(repo, "size");       // KB
        int stars   = num(repo, "stargazers_count");

        // Keyword match on name
        for (String signal : BEGINNER_NAME_SIGNALS) {
            if (name.contains(signal)) {
                return "Name suggests beginner/tutorial project (" + signal + ")";
            }
        }

        // Keyword match on description
        for (String signal : BEGINNER_DESC_SIGNALS) {
            if (desc.contains(signal)) {
                return "Description indicates tutorial or learning project";
            }
        }

        // Very small repos with no stars are almost certainly scratch projects
        if (size < 50 && stars == 0) {
            return "Repo is very small (" + size + " KB) with no stars — likely a scratch project";
        }

        return null; // passes quality filter
    }

    // ── Gemini ─────────────────────────────────────────────────────────────────

    private GeminiResult callGemini(String login, String name, List<PREntry> prEntries,
                                     List<RepoEntry> analyzedRepos, List<SkippedRepo> skippedRepos,
                                     int totalPublicRepos, int qualityRepoCount) {
        StringBuilder diffBlock = new StringBuilder();
        int charsPerPR = prEntries.isEmpty() ? 0 : MAX_DIFF_CHARS / Math.max(prEntries.size(), 1);

        for (int i = 0; i < prEntries.size(); i++) {
            PREntry e = prEntries.get(i);
            if (e.diff() == null || e.diff().isBlank()) continue;
            String truncated = e.diff().length() > charsPerPR
                    ? e.diff().substring(0, charsPerPR) + "\n[TRUNCATED]"
                    : e.diff();
            diffBlock.append("=== PR ").append(i).append(" | ").append(e.repo())
                     .append(" | ").append(e.title()).append(" ===\n")
                     .append(truncated).append("\n\n");
        }

        if (diffBlock.isEmpty()) return minimalResult(login, name, totalPublicRepos, qualityRepoCount);

        String repoContext = "Quality repos analyzed: " +
                analyzedRepos.stream().map(RepoEntry::name).collect(Collectors.joining(", ")) +
                "\nSkipped repos (" + skippedRepos.size() + " beginner/fork repos filtered out): " +
                skippedRepos.stream().map(SkippedRepo::name).collect(Collectors.joining(", "));

        String prompt = buildStrictPrompt(login, name, prEntries.size(), repoContext, diffBlock.toString());

        String raw = null;
        Exception lastEx = null;
        for (int attempt = 0; attempt < 3; attempt++) {
            try { raw = callGeminiApi(prompt); break; }
            catch (Exception e) {
                lastEx = e;
                long delay = (long) (Math.pow(2, attempt) * 1000 + Math.random() * 500);
                log.warn("Gemini attempt {} failed: {}", attempt + 1, e.getMessage());
                try { Thread.sleep(delay); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
            }
        }

        if (raw == null) {
            log.error("Gemini failed after 3 attempts", lastEx);
            return minimalResult(login, name, totalPublicRepos, qualityRepoCount);
        }

        return parseGeminiResult(raw);
    }

    private String buildStrictPrompt(String login, String name, int prCount,
                                      String repoContext, String diffs) {
        return """
                You are a strict senior engineering interviewer evaluating %s (%s) for a software role.
                You are reviewing %d Pull Requests from their QUALITY repositories only.

                %s

                ## SCORING SCALE — be brutally honest:
                0–30   : Only tutorial/hello-world repos. Nothing production-worthy.
                31–45  : Beginner. Some original code but basic CRUD, no tests, no error handling, copy-paste patterns.
                46–55  : Developing. One real attempt but critical gaps: missing tests, poor error handling, no security awareness.
                56–65  : Intermediate foundation. Real projects with effort but missing production concerns.
                66–75  : Solid intermediate. Genuine projects, some tests, reasonable structure. Ready for junior/mid roles.
                76–85  : Strong. Production-quality code, comprehensive tests, error handling, security-conscious. Mid/senior level.
                86–95  : Expert. Exceptional architecture, deep expertise, comprehensive testing. Senior/staff level.
                96–100 : Reserved for world-class contributors (Linus Torvalds tier). Almost never give this.

                ## AUTOMATIC SCORE CAPS:
                - No tests at all anywhere → hard cap at 62
                - All repos are CRUD with no real business logic → hard cap at 55
                - Copy-pasted boilerplate with zero customization → hard cap at 50
                - Hardcoded credentials or secrets found → deduct 15 points
                - Missing error handling on every external call → deduct 10 points

                ## CRITICAL RULE:
                Quality beats quantity. A developer with 2 genuinely strong repos MUST score higher
                than one with 8 mediocre repos. Do NOT reward repo count.

                Respond ONLY with valid JSON in exactly this structure:
                {
                  "overallScore": 68,
                  "summary": "Honest 2-3 sentence assessment referencing specific things you saw in the code",
                  "skills": [
                    {"name": "Java", "level": "PROFICIENT", "evidenceCount": 12}
                  ],
                  "strengths": ["Specific strength with code evidence", "..."],
                  "concerns": ["Specific concern referencing actual code issue found", "..."],
                  "avgComplexity": 7.5,
                  "scoreFactors": [
                    {"factor": "Code Quality", "score": 70, "maxScore": 100, "notes": "Specific observation from the code"},
                    {"factor": "Testing", "score": 0, "maxScore": 100, "notes": "No test files found in any analyzed PR"},
                    {"factor": "Error Handling", "score": 40, "maxScore": 100, "notes": "Specific gaps found"},
                    {"factor": "Architecture & Design", "score": 65, "maxScore": 100, "notes": "Specific observation"},
                    {"factor": "Security Awareness", "score": 50, "maxScore": 100, "notes": "Specific observation"}
                  ],
                  "whatIsHoldingBack": [
                    "No tests found — this is the single biggest gap. Adds a hard ceiling on your score.",
                    "Specific second reason with the code location"
                  ],
                  "improvementPlan": [
                    {
                      "priority": 1,
                      "action": "Write unit tests for your Spring Boot service layer using JUnit 5 + Mockito",
                      "impact": "Removes the test ceiling — potential +12 points",
                      "timeframe": "2 weeks",
                      "why": "Exact reason tied to what was missing in their code"
                    }
                  ],
                  "aiDetection": {
                    "score": 20,
                    "indicators": ["Specific pattern that triggered this"],
                    "boilerplateRatio": 0.15,
                    "docUniformity": 0.25
                  },
                  "prComments": [
                    {
                      "prIndex": 0,
                      "prScore": 72,
                      "prSummary": "2 sentence honest summary of this PR",
                      "comments": [
                        {
                          "file": "src/...",
                          "line": 42,
                          "severity": "CRITICAL",
                          "category": "BUG",
                          "message": "Clear explanation of the issue",
                          "suggestion": "corrected_code"
                        }
                      ]
                    }
                  ],
                  "interviewQuestions": [
                    {
                      "question": "Your PR showed no error handling on the external API call in UserService.java line 83. Walk me through what you would do if that API returns a 503 under load.",
                      "category": "TECHNICAL",
                      "targetedAt": "Missing error handling",
                      "difficulty": "MEDIUM"
                    },
                    {
                      "question": "I don't see any unit tests in your repositories. How do you verify your code works before shipping?",
                      "category": "BEHAVIORAL",
                      "targetedAt": "No test coverage",
                      "difficulty": "EASY"
                    }
                  ]
                }

                Rules:
                - Be specific — reference actual file names, patterns, or code from the diff
                - strengths and concerns: 2-4 each, specific not generic
                - improvementPlan: 3-5 items ordered by impact, each tied to what you actually saw
                - interviewQuestions: 4-6 questions targeting actual weaknesses found in the code.
                  Make them specific (reference file names, line numbers, patterns seen).
                  Mix categories: TECHNICAL (digs into code gaps), BEHAVIORAL (how they work), CODE_REVIEW (ask them to review a snippet).
                  difficulty: EASY | MEDIUM | HARD
                - skills level: EXPERT (deep production evidence), PROFICIENT (solid use), FAMILIAR (basic use only)
                - severity: CRITICAL | WARNING | INFO
                - category: SECURITY | PERFORMANCE | BUG | CODE_QUALITY | BEST_PRACTICE

                Here are the PR diffs:

                %s
                """.formatted(login, name, prCount, repoContext, diffs);
    }

    @SuppressWarnings("unchecked")
    private String callGeminiApi(String prompt) {
        RestTemplate rt = new RestTemplate();
        Map<String, Object> body = Map.of(
                "contents", List.of(Map.of("parts", List.of(Map.of("text", prompt)))),
                "generationConfig", Map.of(
                        "responseMimeType", "application/json",
                        "temperature", 0.1,
                        "maxOutputTokens", 8192
                )
        );
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        ResponseEntity<Map> res = rt.exchange(
                GEMINI_BASE + geminiModel + ":generateContent?key=" + geminiApiKey,
                HttpMethod.POST, new HttpEntity<>(body, headers), Map.class);

        List<Map<String, Object>> candidates = (List<Map<String, Object>>) res.getBody().get("candidates");
        Map<String, Object> content = (Map<String, Object>) candidates.get(0).get("content");
        List<Map<String, Object>> parts = (List<Map<String, Object>>) content.get("parts");
        return (String) parts.get(0).get("text");
    }

    private GeminiResult parseGeminiResult(String raw) {
        String clean = raw.replaceAll("(?s)```json\\s*", "").replaceAll("```", "").trim();
        try {
            Map<String, Object> map = objectMapper.readValue(clean, Map.class);
            GeminiResult r = new GeminiResult();
            r.overallScore  = Math.max(0, Math.min(100, getInt(map, "overallScore", 50)));
            r.summary       = getString(map, "summary", "No summary available.");
            r.avgComplexity = getDouble(map, "avgComplexity", 6.0);
            r.strengths     = parseStringList(map.get("strengths"));
            r.concerns      = parseStringList(map.get("concerns"));
            r.skills        = parseSkills(map.get("skills"));
            r.aiDetection   = parseAIDetection(map.get("aiDetection"));
            r.prComments    = parsePRComments(map.get("prComments"));
            r.scoreFactors      = parseScoreFactors(map.get("scoreFactors"));
            r.whatIsHoldingBack = parseStringList(map.get("whatIsHoldingBack"));
            r.improvementPlan   = parseImprovementPlan(map.get("improvementPlan"));
            r.interviewQuestions = parseInterviewQuestions(map.get("interviewQuestions"));
            return r;
        } catch (Exception e) {
            log.error("Failed to parse Gemini result. First 300 chars: {}",
                    clean.substring(0, Math.min(300, clean.length())));
            throw new ReviewForgeException("Failed to parse Gemini candidate response", e);
        }
    }

    private GeminiResult minimalResult(String login, String name, int totalRepos, int qualityCount) {
        GeminiResult r = new GeminiResult();
        r.overallScore = 35;
        r.summary = "No merged PRs found in quality repositories for " + name +
                ". " + (totalRepos - qualityCount) + " of " + totalRepos +
                " repos were filtered as beginner/tutorial projects. Cannot make a reliable technical assessment.";
        r.skills    = Collections.emptyList();
        r.strengths = List.of("Has a public GitHub presence");
        r.concerns  = List.of("No public merged PRs to analyze — cannot verify coding ability",
                              totalRepos + " total repos but " + (totalRepos - qualityCount) +
                              " appear to be beginner/tutorial projects");
        r.whatIsHoldingBack = List.of("No original, non-trivial projects with PR history found",
                "Cannot assess real coding ability without substantive code to review");
        r.improvementPlan = List.of(
                new ImprovementItem(1, "Build one real project that solves a genuine problem",
                        "This is the single highest-impact thing you can do", "1-2 months",
                        "Recruiters need evidence of real problem-solving, not more tutorial repos"));
        AIDetectionData d = new AIDetectionData();
        d.score = 0;
        d.indicators = List.of("Insufficient data for AI detection");
        r.aiDetection = d;
        r.prComments = Collections.emptyList();
        r.scoreFactors = Collections.emptyList();
        return r;
    }

    // ── Score breakdown builder ────────────────────────────────────────────────

    private CandidateProfileDTO.ScoreBreakdown buildScoreBreakdown(
            GeminiResult aiResult, List<RepoEntry> analyzed, List<SkippedRepo> skipped,
            LocalMetrics localMetrics, int totalRepos, int qualityCount) {

        List<CandidateProfileDTO.ScoreFactor> factors = (aiResult.scoreFactors != null)
                ? aiResult.scoreFactors.stream().map(f -> CandidateProfileDTO.ScoreFactor.builder()
                        .factor(f.factor).score(f.score).maxScore(f.maxScore).notes(f.notes).build())
                        .collect(Collectors.toList())
                : Collections.emptyList();

        List<CandidateProfileDTO.ImprovementStep> steps = (aiResult.improvementPlan != null)
                ? aiResult.improvementPlan.stream().map(i -> CandidateProfileDTO.ImprovementStep.builder()
                        .priority(i.priority).action(i.action).impact(i.impact)
                        .timeframe(i.timeframe).why(i.why).build())
                        .collect(Collectors.toList())
                : Collections.emptyList();

        return CandidateProfileDTO.ScoreBreakdown.builder()
                .totalPublicRepos(totalRepos)
                .qualityReposFound(qualityCount)
                .reposAnalyzed(analyzed.stream().map(RepoEntry::name).collect(Collectors.toList()))
                .reposSkipped(skipped.stream().map(s ->
                        CandidateProfileDTO.SkippedRepo.builder()
                                .name(s.name()).reason(s.reason()).build())
                        .collect(Collectors.toList()))
                .scoreFactors(factors)
                .whatIsHoldingBack(aiResult.whatIsHoldingBack != null ? aiResult.whatIsHoldingBack : Collections.emptyList())
                .improvementPlan(steps)
                .hasTests(localMetrics.testRatio > 0.05)
                .build();
    }

    // ── Local metric computation ───────────────────────────────────────────────

    private LocalMetrics computeLocalMetrics(List<PREntry> entries) {
        int addedLines = 0, testLines = 0, commentLines = 0, fileCount = 0;

        for (PREntry e : entries) {
            if (e.diff() == null) continue;
            for (String line : e.diff().split("\n")) {
                if (line.startsWith("+") && !line.startsWith("+++")) {
                    addedLines++;
                    String t = line.substring(1).trim();
                    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("#")) commentLines++;
                }
            }
            fileCount += (int) Arrays.stream(e.diff().split("\n"))
                    .filter(l -> l.startsWith("diff --git")).count();

            if (e.diff().contains("Test.java") || e.diff().contains("Spec.java")
                    || e.diff().contains("test/") || e.diff().contains("_test.py")
                    || e.diff().contains(".test.ts") || e.diff().contains(".spec.ts")) {
                testLines += addedLines / 4;
            }
        }

        double testRatio    = addedLines > 0 ? Math.min((double) testLines / addedLines, 0.6) : 0.0;
        double commentRatio = addedLines > 0 ? Math.min((double) commentLines / addedLines, 0.4) : 0.0;
        double avgFileLoc   = fileCount > 0  ? Math.min((double) addedLines / fileCount, 500) : 80;
        double complexity   = Math.max(3.0, Math.min(avgFileLoc / 25, 15.0));

        return new LocalMetrics(testRatio, commentRatio, avgFileLoc, complexity);
    }

    private List<CandidateProfileDTO.LanguageShare> computeLanguageShares(Map<String, Long> langTotals) {
        long total = langTotals.values().stream().mapToLong(Long::longValue).sum();
        if (total == 0) return Collections.emptyList();
        return langTotals.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .limit(5)
                .map(e -> CandidateProfileDTO.LanguageShare.builder()
                        .name(e.getKey())
                        .percentage(Math.round((e.getValue() * 1000.0) / total) / 10.0)
                        .build())
                .collect(Collectors.toList());
    }

    private double computeCommitBurstRatio(List<PREntry> entries) {
        if (entries.isEmpty()) return 0.0;
        long burst = entries.stream().filter(e -> e.additions() > 300).count();
        return Math.min((double) burst / entries.size(), 1.0);
    }

    private List<CandidateProfileDTO.PRAnalysis> buildPRAnalysis(List<PREntry> entries, List<AIPRComment> aiComments) {
        List<CandidateProfileDTO.PRAnalysis> result = new ArrayList<>();
        for (int i = 0; i < entries.size(); i++) {
            PREntry e = entries.get(i);
            final int idx = i;
            AIPRComment aiPR = aiComments != null
                    ? aiComments.stream().filter(c -> c.prIndex == idx).findFirst().orElse(null)
                    : null;

            List<CandidateProfileDTO.PRComment> comments = (aiPR != null && aiPR.comments != null)
                    ? aiPR.comments.stream().map(c -> CandidateProfileDTO.PRComment.builder()
                            .file(c.file).line(c.line).severity(c.severity)
                            .category(c.category).message(c.message).suggestion(c.suggestion)
                            .build()).collect(Collectors.toList())
                    : Collections.emptyList();

            result.add(CandidateProfileDTO.PRAnalysis.builder()
                    .prNumber(e.prNumber()).title(e.title()).repo(e.repo()).url(e.url())
                    .additions(e.additions()).deletions(e.deletions()).filesChanged(e.filesChanged())
                    .mergedAt(e.mergedAt())
                    .overallScore(aiPR != null ? aiPR.prScore : 60)
                    .summary(aiPR != null ? aiPR.prSummary : "")
                    .comments(comments).build());
        }
        return result;
    }

    private CandidateProfileDTO.AIDetection toAIDetectionDTO(AIDetectionData d, double commitBurstRatio) {
        if (d == null) return CandidateProfileDTO.AIDetection.builder()
                .score(0).level("LOW").indicators(Collections.emptyList())
                .commitBurstRatio(commitBurstRatio).boilerplateRatio(0).docUniformity(0).build();
        return CandidateProfileDTO.AIDetection.builder()
                .score(d.score).level(aiRiskLevel(d.score))
                .indicators(d.indicators != null ? d.indicators : Collections.emptyList())
                .commitBurstRatio(commitBurstRatio)
                .boilerplateRatio(d.boilerplateRatio)
                .docUniformity(d.docUniformity)
                .build();
    }

    // ── Parsing helpers ────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private List<CandidateProfileDTO.SkillSignal> parseSkills(Object raw) {
        if (!(raw instanceof List)) return Collections.emptyList();
        return ((List<Map<String, Object>>) raw).stream().map(m -> {
            String level = getString(m, "level", "FAMILIAR");
            if (!List.of("EXPERT", "PROFICIENT", "FAMILIAR").contains(level)) level = "FAMILIAR";
            return CandidateProfileDTO.SkillSignal.builder()
                    .name(getString(m, "name", "Unknown"))
                    .level(level).evidenceCount(getInt(m, "evidenceCount", 1)).build();
        }).collect(Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private AIDetectionData parseAIDetection(Object raw) {
        AIDetectionData d = new AIDetectionData();
        if (!(raw instanceof Map)) return d;
        Map<String, Object> m = (Map<String, Object>) raw;
        d.score = Math.max(0, Math.min(100, getInt(m, "score", 0)));
        d.indicators = parseStringList(m.get("indicators"));
        d.boilerplateRatio = getDouble(m, "boilerplateRatio", 0.1);
        d.docUniformity    = getDouble(m, "docUniformity", 0.1);
        return d;
    }

    @SuppressWarnings("unchecked")
    private List<AIPRComment> parsePRComments(Object raw) {
        if (!(raw instanceof List)) return Collections.emptyList();
        return ((List<Map<String, Object>>) raw).stream().map(m -> {
            AIPRComment c = new AIPRComment();
            c.prIndex   = getInt(m, "prIndex", 0);
            c.prScore   = getInt(m, "prScore", 60);
            c.prSummary = getString(m, "prSummary", "");
            c.comments  = parseInlineComments(m.get("comments"));
            return c;
        }).collect(Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private List<InlineComment> parseInlineComments(Object raw) {
        if (!(raw instanceof List)) return Collections.emptyList();
        List<String> validSev = List.of("CRITICAL", "WARNING", "INFO");
        List<String> validCat = List.of("SECURITY", "PERFORMANCE", "BUG", "CODE_QUALITY", "BEST_PRACTICE");
        return ((List<Map<String, Object>>) raw).stream()
                .filter(m -> validSev.contains(getString(m, "severity", ""))
                          && validCat.contains(getString(m, "category", "")))
                .map(m -> {
                    InlineComment ic = new InlineComment();
                    ic.file       = getString(m, "file", "");
                    ic.line       = getInt(m, "line", 1);
                    ic.severity   = getString(m, "severity", "INFO");
                    ic.category   = getString(m, "category", "CODE_QUALITY");
                    ic.message    = getString(m, "message", "");
                    ic.suggestion = getString(m, "suggestion", null);
                    return ic;
                }).collect(Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private List<ScoreFactor> parseScoreFactors(Object raw) {
        if (!(raw instanceof List)) return Collections.emptyList();
        return ((List<Map<String, Object>>) raw).stream().map(m -> {
            ScoreFactor f = new ScoreFactor();
            f.factor   = getString(m, "factor", "");
            f.score    = getInt(m, "score", 0);
            f.maxScore = getInt(m, "maxScore", 100);
            f.notes    = getString(m, "notes", "");
            return f;
        }).collect(Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private List<ImprovementItem> parseImprovementPlan(Object raw) {
        if (!(raw instanceof List)) return Collections.emptyList();
        return ((List<Map<String, Object>>) raw).stream().map(m -> new ImprovementItem(
                getInt(m, "priority", 1),
                getString(m, "action", ""),
                getString(m, "impact", ""),
                getString(m, "timeframe", ""),
                getString(m, "why", "")
        )).collect(Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private List<RawInterviewQ> parseInterviewQuestions(Object raw) {
        if (!(raw instanceof List)) return Collections.emptyList();
        List<String> validCats  = List.of("TECHNICAL", "BEHAVIORAL", "CODE_REVIEW");
        List<String> validDiffs = List.of("EASY", "MEDIUM", "HARD");
        return ((List<Map<String, Object>>) raw).stream().map(m -> {
            RawInterviewQ q = new RawInterviewQ();
            q.question   = getString(m, "question", "");
            q.category   = validCats.contains(getString(m, "category", ""))
                           ? getString(m, "category", "TECHNICAL") : "TECHNICAL";
            q.targetedAt = getString(m, "targetedAt", "");
            q.difficulty = validDiffs.contains(getString(m, "difficulty", ""))
                           ? getString(m, "difficulty", "MEDIUM") : "MEDIUM";
            return q;
        }).filter(q -> !q.question.isBlank()).collect(Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private List<String> parseStringList(Object raw) {
        if (!(raw instanceof List)) return Collections.emptyList();
        return ((List<?>) raw).stream().map(Object::toString).collect(Collectors.toList());
    }

    private String aiRiskLevel(int score) {
        if (score >= 70) return "VERY_HIGH";
        if (score >= 45) return "HIGH";
        if (score >= 20) return "MEDIUM";
        return "LOW";
    }

    // ── Internal data classes ──────────────────────────────────────────────────

    private record PREntry(int prNumber, String title, String repo, String url,
                           int additions, int deletions, int filesChanged,
                           String mergedAt, String diff) {}

    private record RepoEntry(String name, int stars, int sizeKb, String description) {}

    private record SkippedRepo(String name, String reason) {}

    private record LocalMetrics(double testRatio, double commentRatio,
                                 double avgFileLoc, double estimatedComplexity) {}

    // ── Commit consistency ─────────────────────────────────────────────────────

    private CommitConsistencyData analyzeCommitConsistency(List<String> commitDates) {
        if (commitDates.isEmpty()) return new CommitConsistencyData(0, 0, 0, 0, false, "0 weeks");

        long now = System.currentTimeMillis();
        long fourteenDaysAgo = now - 14L * 24 * 3600 * 1000;
        long sixMonthsAgo   = now - 182L * 24 * 3600 * 1000;

        Set<String> activeWeeks = new LinkedHashSet<>();
        int recentCommits = 0;
        int withinSixMonths = 0;

        for (String dateStr : commitDates) {
            try {
                java.time.ZonedDateTime zdt = java.time.ZonedDateTime.parse(dateStr);
                long epochMs = zdt.toInstant().toEpochMilli();
                if (epochMs < sixMonthsAgo) continue;
                withinSixMonths++;
                // ISO week key e.g. "2024-W03"
                java.time.temporal.WeekFields wf = java.time.temporal.WeekFields.ISO;
                int week = zdt.get(wf.weekOfWeekBasedYear());
                int year = zdt.get(wf.weekBasedYear());
                activeWeeks.add(year + "-W" + week);
                if (epochMs >= fourteenDaysAgo) recentCommits++;
            } catch (Exception ignored) {}
        }

        int possibleWeeks = 26;
        double consistencyScore = Math.min((double) activeWeeks.size() / possibleWeeks, 1.0);
        double burstRatio = withinSixMonths > 0 ? (double) recentCommits / withinSixMonths : 0;
        boolean surged = burstRatio > 0.35 && recentCommits >= 5;

        // Compute longest consecutive active week streak
        int streak = 1, maxStreak = activeWeeks.isEmpty() ? 0 : 1;
        String[] weeks = activeWeeks.toArray(new String[0]);
        for (int i = 1; i < weeks.length; i++) {
            // Weeks are ordered newest-first from GitHub API — skip streak calc if unordered
            streak = 1; // simplified: just report count of active weeks
        }
        maxStreak = activeWeeks.size(); // report total active weeks as streak proxy

        return new CommitConsistencyData(
            commitDates.size(), activeWeeks.size(), consistencyScore,
            burstRatio, surged, maxStreak + " weeks"
        );
    }

    private CandidateProfileDTO.CommitConsistency toCommitConsistencyDTO(CommitConsistencyData d) {
        return CandidateProfileDTO.CommitConsistency.builder()
                .totalCommits(d.totalCommits)
                .activeWeeks(d.activeWeeks)
                .consistencyScore(d.consistencyScore)
                .recentBurstRatio(d.recentBurstRatio)
                .likelySurgedBeforeApplying(d.likelySurgedBeforeApplying)
                .longestStreakWeeks(d.longestStreakWeeks)
                .build();
    }

    @SuppressWarnings("unchecked")
    private List<CandidateProfileDTO.InterviewQuestion> buildInterviewQuestions(List<RawInterviewQ> raw) {
        if (raw == null) return Collections.emptyList();
        return raw.stream().map(q -> CandidateProfileDTO.InterviewQuestion.builder()
                .question(q.question)
                .category(q.category)
                .targetedAt(q.targetedAt)
                .difficulty(q.difficulty)
                .build()).collect(Collectors.toList());
    }

    // ── Internal data classes ──────────────────────────────────────────────────

    private static class GeminiResult {
        int overallScore;
        String summary;
        double avgComplexity;
        List<CandidateProfileDTO.SkillSignal> skills;
        List<String> strengths;
        List<String> concerns;
        List<String> whatIsHoldingBack;
        List<ScoreFactor> scoreFactors;
        List<ImprovementItem> improvementPlan;
        AIDetectionData aiDetection;
        List<AIPRComment> prComments;
        List<RawInterviewQ> interviewQuestions;
    }

    private static class AIDetectionData {
        int score;
        List<String> indicators = new ArrayList<>();
        double boilerplateRatio;
        double docUniformity;
    }

    private static class AIPRComment {
        int prIndex, prScore;
        String prSummary;
        List<InlineComment> comments;
    }

    private static class InlineComment {
        String file, severity, category, message, suggestion;
        int line;
    }

    private static class ScoreFactor {
        String factor, notes;
        int score, maxScore;
    }

    private record ImprovementItem(int priority, String action, String impact,
                                    String timeframe, String why) {}

    private record CommitConsistencyData(int totalCommits, int activeWeeks, double consistencyScore,
                                          double recentBurstRatio, boolean likelySurgedBeforeApplying,
                                          String longestStreakWeeks) {}

    private static class RawInterviewQ {
        String question, category, targetedAt, difficulty;
    }

    // ── Map helpers ────────────────────────────────────────────────────────────

    private int getInt(Map<String, Object> m, String key, int def) {
        Object v = m.get(key);
        return v instanceof Number n ? n.intValue() : def;
    }

    private double getDouble(Map<String, Object> m, String key, double def) {
        Object v = m.get(key);
        return v instanceof Number n ? Math.max(0, Math.min(1.0, n.doubleValue())) : def;
    }

    private String getString(Map<String, Object> m, String key, String def) {
        Object v = m.get(key);
        return v != null ? v.toString() : def;
    }

    private String str(Map<String, Object> m, String key, String def) {
        Object v = m.get(key);
        return (v != null && !"null".equals(v.toString())) ? v.toString() : def;
    }

    private int num(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v instanceof Number n ? n.intValue() : 0;
    }

    private String toJson(Object obj) {
        try { return objectMapper.writeValueAsString(obj); }
        catch (Exception e) { return "[]"; }
    }
}
