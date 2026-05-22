import { useState, useEffect, useCallback } from 'react'
import { mockCandidates, mockBatchJobs, mockJobDescriptions } from '../data/mockData'
import type { CandidateProfile, BatchJob, JobDescription, JDMatchResult, CandidatePRAnalysis } from '../types'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true' || !import.meta.env.VITE_API_BASE_URL

// ── Module-level stores: persist across page navigations ─────────────────────
const candidateStore = new Map<string, CandidateProfile>()
const storeListeners = new Set<() => void>()

let batchJobCache: BatchJob[] = []
const batchJobListeners = new Set<() => void>()

function setBatchJobCache(jobs: BatchJob[]) {
  batchJobCache = jobs
  batchJobListeners.forEach(fn => fn())
}

export function registerCandidate(c: CandidateProfile) {
  candidateStore.set(c.id, c)
  storeListeners.forEach(fn => fn())
}

export function lookupCandidate(id: string): CandidateProfile | undefined {
  return candidateStore.get(id)
}

// ── Simulate AI-detection + JD matching for the mock ─────────────────────────

function computeJDMatch(candidate: CandidateProfile, jd: JobDescription): JDMatchResult {
  const candidateSkillNames = candidate.skills.map(s => s.name.toLowerCase())
  const candidateLangs = candidate.topLanguages.map(l => l.name.toLowerCase())
  const allCandidateTokens = [...candidateSkillNames, ...candidateLangs]

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

  const matched = jd.requiredSkills.filter(req =>
    allCandidateTokens.some(t => normalize(t).includes(normalize(req)) || normalize(req).includes(normalize(t)))
  )
  const missing = jd.requiredSkills.filter(req => !matched.includes(req))
  const bonus = jd.niceToHaveSkills.filter(nice =>
    allCandidateTokens.some(t => normalize(t).includes(normalize(nice)) || normalize(nice).includes(normalize(t)))
  )

  const score = Math.round(
    (matched.length / jd.requiredSkills.length) * 80 +
    (bonus.length / Math.max(jd.niceToHaveSkills.length, 1)) * 20
  )

  const summaries: string[] = []
  if (matched.length === jd.requiredSkills.length) summaries.push('Meets all required skills.')
  else summaries.push(`Covers ${matched.length}/${jd.requiredSkills.length} required skills.`)
  if (bonus.length > 0) summaries.push(`Bonus: ${bonus.join(', ')}.`)
  if (missing.length > 0) summaries.push(`Missing: ${missing.join(', ')}.`)

  return { score, matchedSkills: matched, missingSkills: missing, bonusSkills: bonus, summary: summaries.join(' ') }
}

// ── useCandidates ─────────────────────────────────────────────────────────────

export function useCandidates() {
  const [candidates, setCandidates] = useState<CandidateProfile[]>([...candidateStore.values()])
  const [loading, setLoading] = useState(candidateStore.size === 0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Always subscribe to store updates (new candidates arriving via registerCandidate)
    const refresh = () => setCandidates([...candidateStore.values()])
    storeListeners.add(refresh)

    if (USE_MOCK) {
      return () => { storeListeners.delete(refresh) }
    }

    // If store already has data, show it immediately — no spinner on tab switch
    if (candidateStore.size > 0) {
      setLoading(false)
      // Silent background refresh to pick up any new candidates since last load
      fetch('/api/candidates')
        .then(r => r.json())
        .then((data: CandidateProfile[]) => {
          candidateStore.clear()
          data.forEach(c => candidateStore.set(c.id, c))
          setCandidates(data)
        })
        .catch(() => {}) // keep showing cached data on failure
      return () => { storeListeners.delete(refresh) }
    }

    // First load: show spinner, populate store
    setLoading(true)
    fetch('/api/candidates')
      .then(r => r.json())
      .then((data: CandidateProfile[]) => {
        candidateStore.clear()
        data.forEach(c => candidateStore.set(c.id, c))
        setCandidates(data)
        setLoading(false)
      })
      .catch(() => {
        setCandidates([...candidateStore.values()])
        setLoading(false)
        setError('API unavailable')
      })

    return () => { storeListeners.delete(refresh) }
  }, [])

  return { candidates, loading, error }
}

// ── useCandidate (single) ─────────────────────────────────────────────────────

export function useCandidate(id: string) {
  const [candidate, setCandidate] = useState<CandidateProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    if (USE_MOCK) {
      setTimeout(() => {
        // Check module-level store first (includes freshly analyzed candidates)
        setCandidate(lookupCandidate(id) ?? null)
        setLoading(false)
      }, 150)
    } else {
      // Try API first, fall back to store
      fetch(`/api/candidates/${id}`)
        .then(r => r.json())
        .then(data => { setCandidate(data); setLoading(false) })
        .catch(() => { setCandidate(lookupCandidate(id) ?? null); setLoading(false) })
    }
  }, [id])

  return { candidate, loading }
}

// ── Synthetic PR analysis for searched profiles ───────────────────────────────

function generateSyntheticPRs(login: string, skills: CandidateProfile['skills']): CandidatePRAnalysis[] {
  const topSkill = skills[0]?.name ?? 'JavaScript'
  const isJava = topSkill === 'Java' || topSkill === 'Spring Boot'
  const isPython = topSkill === 'Python'
  const isGo = topSkill === 'Go'

  if (isJava) {
    return [
      {
        prNumber: Math.floor(Math.random() * 80) + 40,
        title: 'feat: add JWT-based authentication with refresh token rotation',
        repo: `${login}/spring-api`,
        url: `https://github.com/${login}/spring-api`,
        additions: 284,
        deletions: 31,
        filesChanged: 8,
        mergedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
        overallScore: 71,
        summary: 'JWT implementation is functional but has a critical refresh token reuse vulnerability and access tokens stored without expiry validation on the server side. The filter chain ordering is also incorrect.',
        comments: [
          {
            file: `src/main/java/com/${login}/security/JwtAuthFilter.java`,
            line: 54,
            severity: 'CRITICAL',
            category: 'SECURITY',
            message: 'Refresh token is not invalidated after use. An attacker who intercepts a refresh token can use it indefinitely — this is a refresh token reuse vulnerability. Each refresh token must be single-use with immediate rotation.',
            suggestion: '// Invalidate old token atomically with issuing new one\ntokenRepository.invalidate(oldRefreshToken);\nString newRefreshToken = tokenService.issue(userId);\ntokenRepository.save(newRefreshToken, userId, REFRESH_TTL);',
          },
          {
            file: `src/main/java/com/${login}/security/JwtService.java`,
            line: 87,
            severity: 'WARNING',
            category: 'SECURITY',
            message: 'JWT signature is verified but expiry (exp claim) is never checked server-side. A client that manually removes the exp claim from the payload can present an expired token that still passes validation.',
            suggestion: 'Jwts.parserBuilder()\n  .setSigningKey(secretKey)\n  .requireExpiration() // enforce exp claim\n  .build()\n  .parseClaimsJws(token);',
          },
          {
            file: `src/main/java/com/${login}/config/SecurityConfig.java`,
            line: 34,
            severity: 'WARNING',
            category: 'BUG',
            message: 'JwtAuthFilter is added before UsernamePasswordAuthenticationFilter in the chain. This means unauthenticated requests hit the JWT filter first — any exception in the JWT filter (malformed token) bypasses the login endpoint.',
            suggestion: 'http.addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);',
          },
        ],
      },
      {
        prNumber: Math.floor(Math.random() * 30) + 20,
        title: 'fix: N+1 query in user profile endpoint',
        repo: `${login}/spring-api`,
        url: `https://github.com/${login}/spring-api`,
        additions: 67,
        deletions: 22,
        filesChanged: 3,
        mergedAt: new Date(Date.now() - 21 * 86400000).toISOString(),
        overallScore: 84,
        summary: 'Good fix using JOIN FETCH. The N+1 is resolved but the query now produces a Cartesian product on the OneToMany side without DISTINCT. Add DISTINCT to the JPQL and paginate large result sets.',
        comments: [
          {
            file: `src/main/java/com/${login}/repository/UserRepository.java`,
            line: 28,
            severity: 'WARNING',
            category: 'PERFORMANCE',
            message: 'JOIN FETCH on a @OneToMany without DISTINCT returns duplicate parent rows — one per child. Hibernate deduplicates in memory but the JDBC layer still fetches every duplicate row from the database.',
            suggestion: '@Query("SELECT DISTINCT u FROM User u JOIN FETCH u.posts WHERE u.id = :id")\nOptional<User> findByIdWithPosts(@Param("id") Long id);',
          },
          {
            file: `src/main/java/com/${login}/service/UserService.java`,
            line: 63,
            severity: 'INFO',
            category: 'BEST_PRACTICE',
            message: 'Consider using @EntityGraph instead of JPQL JOIN FETCH for simple eager-load cases. It is type-safe and composes with Spring Data method-name queries.',
            suggestion: '@EntityGraph(attributePaths = {"posts", "profile"})\nOptional<User> findById(Long id);',
          },
        ],
      },
    ]
  }

  if (isPython) {
    return [
      {
        prNumber: Math.floor(Math.random() * 60) + 30,
        title: 'feat: async FastAPI endpoint with SQLAlchemy 2.0 ORM',
        repo: `${login}/fastapi-service`,
        url: `https://github.com/${login}/fastapi-service`,
        additions: 198,
        deletions: 44,
        filesChanged: 6,
        mergedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
        overallScore: 76,
        summary: 'FastAPI async patterns are mostly correct but the SQLAlchemy session is shared across concurrent requests — a critical bug under load. Pydantic v2 migration is also incomplete in two models.',
        comments: [
          {
            file: `app/database.py`,
            line: 18,
            severity: 'CRITICAL',
            category: 'BUG',
            message: 'A single AsyncSession is created at module level and reused across requests. SQLAlchemy sessions are not thread-safe or concurrent-safe — concurrent requests will corrupt each other\'s transaction state.',
            suggestion: '# Use a dependency-injected session per request\nasync def get_db():\n    async with AsyncSessionLocal() as session:\n        yield session\n\n# In route: db: AsyncSession = Depends(get_db)',
          },
          {
            file: `app/models/user.py`,
            line: 34,
            severity: 'WARNING',
            category: 'CODE_QUALITY',
            message: 'Pydantic v1 validator syntax (@validator) is used while requirements.txt specifies pydantic>=2.0. The v1 compatibility shim will be removed in Pydantic 2.1.',
            suggestion: '# Migrate to v2 field_validator\n@field_validator("email")\n@classmethod\ndef validate_email(cls, v: str) -> str:\n    return v.lower()',
          },
        ],
      },
    ]
  }

  if (isGo) {
    return [
      {
        prNumber: Math.floor(Math.random() * 50) + 25,
        title: 'feat: HTTP middleware with context propagation and tracing',
        repo: `${login}/go-service`,
        url: `https://github.com/${login}/go-service`,
        additions: 156,
        deletions: 28,
        filesChanged: 5,
        mergedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
        overallScore: 82,
        summary: 'Clean middleware implementation. Context propagation is correct. The goroutine leak in the timeout handler and missing error wrapping in service calls need fixing before production use.',
        comments: [
          {
            file: `internal/middleware/timeout.go`,
            line: 44,
            severity: 'WARNING',
            category: 'BUG',
            message: 'The timeout goroutine spawned for context cancellation is never cleaned up if the request completes before the timeout. Over time this leaks goroutines that hold references to the response writer.',
            suggestion: 'ctx, cancel := context.WithTimeout(r.Context(), d)\ndefer cancel() // always cancel — cleans up the timeout goroutine\nr = r.WithContext(ctx)',
          },
          {
            file: `internal/service/user.go`,
            line: 67,
            severity: 'WARNING',
            category: 'CODE_QUALITY',
            message: 'Errors are returned bare without wrapping. Callers cannot distinguish a "user not found" from a database connection error without string-matching the error message.',
            suggestion: 'if errors.Is(err, sql.ErrNoRows) {\n    return nil, fmt.Errorf("user %d not found: %w", id, ErrNotFound)\n}\nreturn nil, fmt.Errorf("querying user %d: %w", id, err)',
          },
        ],
      },
    ]
  }

  // Default: JavaScript/React
  return [
    {
      prNumber: Math.floor(Math.random() * 50) + 20,
      title: 'feat: custom React hook for async data fetching with cache',
      repo: `${login}/react-app`,
      url: `https://github.com/${login}/react-app`,
      additions: 143,
      deletions: 27,
      filesChanged: 5,
      mergedAt: new Date(Date.now() - 12 * 86400000).toISOString(),
      overallScore: 74,
      summary: 'Good custom hook pattern but the cache is a module-level Map that never expires, causing a memory leak in long-lived SPAs. The useEffect cleanup is also missing, leading to state updates on unmounted components.',
      comments: [
        {
          file: `src/hooks/useFetch.js`,
          line: 8,
          severity: 'WARNING',
          category: 'BUG',
          message: 'Module-level cache Map grows indefinitely — every unique URL key is stored forever. In a SPA with many routes, this will exhaust memory over a long session.',
          suggestion: '// Use a simple TTL cache or React Query instead\nconst cache = new Map() // max 100 entries with LRU eviction\nfunction getCache(key) {\n  const entry = cache.get(key)\n  if (!entry || Date.now() - entry.ts > 60_000) return null\n  return entry.data\n}',
        },
        {
          file: `src/hooks/useFetch.js`,
          line: 34,
          severity: 'WARNING',
          category: 'BUG',
          message: 'The async fetch inside useEffect does not handle the unmount case. If the component unmounts before the fetch resolves, setState() is called on an unmounted component, causing a React warning and a potential memory leak.',
          suggestion: 'useEffect(() => {\n  let cancelled = false\n  fetchData().then(data => {\n    if (!cancelled) setData(data)\n  })\n  return () => { cancelled = true }\n}, [url])',
        },
        {
          file: `src/hooks/useFetch.js`,
          line: 52,
          severity: 'INFO',
          category: 'BEST_PRACTICE',
          message: 'Consider using React Query or SWR instead of a hand-rolled fetch hook. They handle caching, deduplication, background refetching, and stale-while-revalidate out of the box.',
          suggestion: '// With React Query:\nconst { data, isLoading } = useQuery({ queryKey: [url], queryFn: () => fetch(url).then(r => r.json()) })',
        },
      ],
    },
  ]
}

// ── Shared synthetic profile builder (used by single analyze + batch) ─────────

function buildSyntheticProfile(login: string): CandidateProfile {
  const javaHints = ['java', 'spring', 'boot', 'jvm']
  const pythonHints = ['python', 'py', 'ml', 'data', 'ai']
  const goHints = ['go', 'golang', 'gopher']
  const lc = login.toLowerCase()
  const isJava = javaHints.some(h => lc.includes(h))
  const isPython = pythonHints.some(h => lc.includes(h))
  const isGo = goHints.some(h => lc.includes(h))

  const repos = Math.floor(Math.random() * 22) + 2
  const followers = Math.floor(repos * (Math.random() * 6 + 2))
  const evidenceMultiplier = Math.max(0.1, Math.min(repos / 25, 1.0))
  const ev = (base: number) => Math.max(1, Math.round(base * evidenceMultiplier))

  type SkillLevel = 'EXPERT' | 'PROFICIENT' | 'FAMILIAR'
  const midLevel: SkillLevel = repos >= 15 ? 'PROFICIENT' : 'FAMILIAR'
  const synthSkills = isJava
    ? [
        { name: 'Java', level: midLevel, evidenceCount: ev(54) },
        { name: 'Spring Boot', level: 'FAMILIAR' as SkillLevel, evidenceCount: ev(38) },
        { name: 'MySQL', level: 'FAMILIAR' as SkillLevel, evidenceCount: ev(19) },
      ]
    : isPython
    ? [
        { name: 'Python', level: midLevel, evidenceCount: ev(61) },
        { name: 'FastAPI', level: 'FAMILIAR' as SkillLevel, evidenceCount: ev(22) },
        { name: 'Pandas', level: 'FAMILIAR' as SkillLevel, evidenceCount: ev(34) },
      ]
    : isGo
    ? [
        { name: 'Go', level: midLevel, evidenceCount: ev(47) },
        { name: 'gRPC', level: 'FAMILIAR' as SkillLevel, evidenceCount: ev(18) },
        { name: 'Docker', level: 'FAMILIAR' as SkillLevel, evidenceCount: ev(14) },
      ]
    : [
        { name: 'JavaScript', level: midLevel, evidenceCount: ev(40) },
        { name: 'React', level: 'FAMILIAR' as SkillLevel, evidenceCount: ev(28) },
        { name: 'TypeScript', level: 'FAMILIAR' as SkillLevel, evidenceCount: ev(17) },
      ]

  const synthLangs = isJava
    ? [{ name: 'Java', percentage: 75 }, { name: 'SQL', percentage: 15 }, { name: 'XML', percentage: 10 }]
    : isPython
    ? [{ name: 'Python', percentage: 70 }, { name: 'Jupyter', percentage: 20 }, { name: 'SQL', percentage: 10 }]
    : isGo
    ? [{ name: 'Go', percentage: 80 }, { name: 'Shell', percentage: 12 }, { name: 'Dockerfile', percentage: 8 }]
    : [{ name: 'JavaScript', percentage: 55 }, { name: 'TypeScript', percentage: 30 }, { name: 'CSS', percentage: 15 }]

  const repoPoints     = Math.min(repos * 1.0, 20)
  const followerPoints = Math.min(Math.log10(Math.max(followers, 1)) / Math.log10(200) * 12, 12)
  const totalEvidence  = synthSkills.reduce((s, sk) => s + sk.evidenceCount, 0)
  const evidencePoints = Math.min(totalEvidence / 8, 12)
  const noise          = Math.floor(Math.random() * 7) - 3
  const overallScore   = Math.round(Math.max(35, Math.min(75, 38 + repoPoints + followerPoints + evidencePoints + noise)))
  const testRatio      = Math.max(0.05, Math.min(repos / 60 + Math.random() * 0.15, 0.45))
  const duplicateRatio = Math.max(0.08, 0.30 - repos / 120)
  const activityLabel  = repos <= 5 ? 'very early-stage' : repos <= 12 ? 'limited' : 'moderate'

  const concerns: string[] = []
  if (repos <= 5)  concerns.push(`Only ${repos} public repos — very limited data for assessment`)
  if (repos <= 12) concerns.push('Insufficient public work history for confident scoring')
  concerns.push('Score is based solely on public commit signals — private work not analyzed')
  concerns.push('Technical interview strongly recommended before advancing')

  const strengths: string[] = []
  if (repos >= 8)  strengths.push(`${repos} public repositories show consistent coding activity`)
  if (followers >= 30) strengths.push(`${followers} followers indicates community engagement`)
  strengths.push('Public GitHub presence enables code quality verification')

  return {
    id: `synth-${login}-${Date.now()}`,
    githubLogin: login,
    githubUrl: `https://github.com/${login}`,
    avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${login}&backgroundColor=6d28d9`,
    name: login.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    bio: 'GitHub profile analyzed by ReviewForge AI.',
    location: 'Unknown',
    publicRepos: repos,
    followers,
    analyzedAt: new Date().toISOString(),
    overallScore,
    topLanguages: synthLangs,
    skills: synthSkills,
    aiDetection: {
      score: Math.floor(Math.random() * 30) + 10,
      level: 'LOW',
      indicators: [
        `Analysis based on ${repos} public repositories`,
        'Limited commit history available for pattern analysis',
        'Insufficient data for high-confidence AI detection',
      ],
      commitBurstRatio: 0.15,
      boilerplateRatio: 0.20,
      docUniformity: 0.35,
    },
    metrics: {
      avgComplexity: 5.5 + Math.random() * 2,
      testRatio,
      commentRatio: 0.10 + Math.random() * 0.12,
      avgFileLoc: 100 + Math.floor(Math.random() * 80),
      duplicateRatio,
    },
    summary: `Analyzed ${login}'s public GitHub profile. ${repos <= 5 ? `Only ${repos} public repositories found — insufficient data for a reliable technical assessment.` : `${repos} public repositories with ${activityLabel} activity.`} Score reflects observable signals only.`,
    strengths,
    concerns,
    prAnalysis: generateSyntheticPRs(login, synthSkills),
    percentileRank: Math.floor(Math.random() * 60) + 20,
    pipelineStatus: 'REVIEWING' as const,
  }
}

// ── useCandidateAnalyze (paste GitHub URL → analyze) ─────────────────────────

export function useCandidateAnalyze() {
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<CandidateProfile | null>(null)
  const [error, setError] = useState<string | null>(null)

  const analyze = useCallback((githubInput: string) => {
    setAnalyzing(true)
    setResult(null)
    setError(null)

    const login = githubInput
      .replace('https://github.com/', '')
      .replace('http://github.com/', '')
      .replace('@', '')
      .split('/')[0]
      .trim()
      .toLowerCase()

    if (USE_MOCK) {
      setTimeout(() => {
        const found = mockCandidates.find(c => c.githubLogin.toLowerCase() === login)
        const profile = found ?? buildSyntheticProfile(login)
        registerCandidate(profile)
        setResult(profile)
        setAnalyzing(false)
      }, 2200)
    } else {
      fetch('/api/candidates/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubLogin: login }),
      })
        .then(r => r.json())
        .then(data => { registerCandidate(data); setResult(data); setAnalyzing(false) })
        .catch(() => {
          setError('Analysis failed — check the GitHub username and try again.')
          setAnalyzing(false)
        })
    }
  }, [])

  return { analyze, analyzing, result, error }
}

// ── useBatchJobs ──────────────────────────────────────────────────────────────

export function useBatchJobs() {
  const [jobs, setJobs] = useState<BatchJob[]>(batchJobCache)
  const [loading, setLoading] = useState(batchJobCache.length === 0)
  const [submitting, setSubmitting] = useState(false)

  // Subscribe to module-level cache updates
  useEffect(() => {
    const refresh = () => setJobs([...batchJobCache])
    batchJobListeners.add(refresh)
    return () => { batchJobListeners.delete(refresh) }
  }, [])

  const fetchJobs = useCallback(() => {
    if (USE_MOCK) {
      setTimeout(() => { setLoading(false) }, 250)
      return
    }
    // Show cached immediately, refresh in background
    if (batchJobCache.length > 0) setLoading(false)
    fetch('/api/candidates/batch')
      .then(r => r.json())
      .then((data: BatchJob[]) => { setBatchJobCache(data); setLoading(false) })
      .catch(() => { if (batchJobCache.length === 0) { setJobs(mockBatchJobs); setLoading(false) } })
  }, [])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  const submitBatch = useCallback(async (name: string, githubLogins: string[]): Promise<BatchJob | null> => {
    if (USE_MOCK) {
      const mockJob: BatchJob = {
        id: `mock-${Date.now()}`,
        name,
        totalCandidates: githubLogins.length,
        processed: 0,
        status: 'RUNNING',
        createdAt: new Date().toISOString(),
        candidateIds: [],
      }
      setBatchJobCache([mockJob, ...batchJobCache])
      let done = 0
      const interval = setInterval(() => {
        const login = githubLogins[done]
        if (login) {
          const profile = buildSyntheticProfile(login.toLowerCase().replace('@', ''))
          registerCandidate(profile)
        }
        done++
        setBatchJobCache(batchJobCache.map(j => j.id === mockJob.id
          ? { ...j, processed: done, status: done >= githubLogins.length ? 'DONE' : 'RUNNING', candidateIds: done >= githubLogins.length ? githubLogins.map((_, i) => `mock-c-${i}`) : [] }
          : j))
        if (done >= githubLogins.length) clearInterval(interval)
      }, 300)
      return mockJob
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/candidates/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, githubLogins }),
      })
      const job = await res.json()
      setBatchJobCache([job, ...batchJobCache])
      return job
    } catch {
      return null
    } finally {
      setSubmitting(false)
    }
  }, [])

  // Poll running jobs every 3 seconds
  useEffect(() => {
    const running = jobs.some(j => j.status === 'RUNNING' || j.status === 'QUEUED')
    if (!running || USE_MOCK) return
    const interval = setInterval(() => {
      fetch('/api/candidates/batch')
        .then(r => r.json())
        .then((data: BatchJob[]) => setBatchJobCache(data))
        .catch(() => {})
    }, 3000)
    return () => clearInterval(interval)
  }, [jobs])

  return { jobs, loading, submitting, submitBatch, refetch: fetchJobs }
}

// ── usePipelineStatus ─────────────────────────────────────────────────────────

export function usePipelineStatus() {
  const updateStatus = useCallback(async (candidateId: string, status: string): Promise<boolean> => {
    if (USE_MOCK) {
      // Update in the local store
      const c = candidateStore.get(candidateId)
      if (c) candidateStore.set(candidateId, { ...c, pipelineStatus: status as any })
      return true
    }
    try {
      const res = await fetch(`/api/candidates/${candidateId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      return res.ok
    } catch {
      return false
    }
  }, [])

  return { updateStatus }
}

// ── useJDMatch ────────────────────────────────────────────────────────────────

export function useJDMatch() {
  const [activeJD, setActiveJD] = useState<JobDescription | null>(null)
  const [savedJDs] = useState<JobDescription[]>(mockJobDescriptions)
  const [matching, setMatching] = useState(false)

  const applyJD = useCallback((jd: JobDescription | null) => {
    setActiveJD(jd)
  }, [])

  const enrichWithJD = useCallback((candidates: CandidateProfile[]): CandidateProfile[] => {
    if (!activeJD) return candidates
    return candidates.map(c => ({ ...c, jdMatch: c.jdMatch ?? computeJDMatch(c, activeJD) }))
  }, [activeJD])

  // Run real Gemini JD match for all given candidates against the active JD
  const runBulkMatch = useCallback(async (candidates: CandidateProfile[]): Promise<CandidateProfile[]> => {
    if (!activeJD || USE_MOCK) {
      return candidates.map(c => ({ ...c, jdMatch: computeJDMatch(c, activeJD!) }))
    }
    setMatching(true)
    try {
      const res = await fetch('/api/candidates/jd-match/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: activeJD.rawText,
          title: activeJD.title,
          company: activeJD.company,
          candidateIds: candidates.map(c => c.id),
        }),
      })
      if (!res.ok) throw new Error('Bulk JD match failed')
      const results: Array<{ candidateId: string; jdMatch: any }> = await res.json()
      const matchMap = new Map(results.map(r => [r.candidateId, r.jdMatch]))
      return candidates.map(c => ({ ...c, jdMatch: matchMap.get(c.id) ?? c.jdMatch }))
    } catch {
      // Fall back to local computation
      return candidates.map(c => ({ ...c, jdMatch: computeJDMatch(c, activeJD) }))
    } finally {
      setMatching(false)
    }
  }, [activeJD])

  return { activeJD, applyJD, savedJDs, enrichWithJD, runBulkMatch, matching }
}

// ── useNotes ──────────────────────────────────────────────────────────────────

export function useNotes(candidateId: string) {
  const [notes, setNotes] = useState<import('../types').CandidateNote[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!candidateId || USE_MOCK) return
    fetch(`/api/candidates/${candidateId}/notes`)
      .then(r => r.json())
      .then(data => setNotes(data))
      .catch(() => {})
  }, [candidateId])

  const addNote = useCallback(async (text: string) => {
    if (USE_MOCK) {
      const note = { id: `note-${Date.now()}`, text, createdAt: new Date().toISOString() }
      setNotes(prev => [note, ...prev])
      return note
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const note = await res.json()
      setNotes(prev => [note, ...prev])
      return note
    } catch { return null }
    finally { setSaving(false) }
  }, [candidateId])

  const deleteNote = useCallback(async (noteId: string) => {
    if (USE_MOCK) { setNotes(prev => prev.filter(n => n.id !== noteId)); return }
    try {
      await fetch(`/api/candidates/${candidateId}/notes/${noteId}`, { method: 'DELETE' })
      setNotes(prev => prev.filter(n => n.id !== noteId))
    } catch {}
  }, [candidateId])

  return { notes, saving, addNote, deleteNote }
}
