export type Severity = 'CRITICAL' | 'WARNING' | 'INFO'
export type Category = 'SECURITY' | 'PERFORMANCE' | 'BUG' | 'CODE_QUALITY' | 'BEST_PRACTICE'

export interface CodeDiffLine {
  num: number
  code: string
}

export interface CodeDiff {
  beforeLines: CodeDiffLine[]
  problemLine: CodeDiffLine
  afterLines: CodeDiffLine[]
}

export interface ReviewComment {
  id: string
  file: string
  line: number
  severity: Severity
  category: Category
  message: string
  suggestion?: string
  codeDiff?: CodeDiff
}

export interface ReviewSession {
  id: string
  prNumber: number
  prTitle: string
  authorLogin: string
  authorAvatar: string
  repoFullName: string
  branch: string
  headSha: string
  overallScore: number
  summary: string
  criticalCount: number
  warningCount: number
  infoCount: number
  reviewedAt: string
  githubUrl: string
  comments: ReviewComment[]
}

export interface Repository {
  id: string
  fullName: string
  owner: string
  name: string
  avgScore: number
  prCount: number
  lastReviewedAt: string
  isConnected: boolean
  trendData: TrendPoint[]
}

export interface TrendPoint {
  date: string
  score: number
}

export interface DashboardStats {
  totalPRs: number
  avgScore: number
  totalCritical: number
  reposConnected: number
}

// ── Candidate Analysis ─────────────────────────────────────────────────────────

export type AIRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH'

export interface SkillSignal {
  name: string
  level: 'EXPERT' | 'PROFICIENT' | 'FAMILIAR'
  evidenceCount: number
}

export interface AIDetectionResult {
  score: number
  level: AIRiskLevel
  indicators: string[]
  commitBurstRatio: number
  boilerplateRatio: number
  docUniformity: number
}

export interface CodeMetrics {
  avgComplexity: number
  testRatio: number
  commentRatio: number
  avgFileLoc: number
  duplicateRatio: number
}

export interface JDMatchResult {
  score: number
  verdict?: 'STRONG_FIT' | 'MAYBE' | 'POOR_FIT'
  matchedSkills: string[]
  missingSkills: string[]
  bonusSkills: string[]
  summary: string
}

export interface CandidateNote {
  id: string
  text: string
  createdAt: string
}

export interface AuditEvent {
  id: string
  eventType: string
  candidateId: string | null
  description: string
  createdAt: string
}

export interface PlagiarismFlag {
  repoName: string
  sharedBy: string[]
  severity: 'HIGH' | 'MEDIUM'
  message: string
}

export interface CandidateCodeComment {
  file: string
  line: number
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  category: 'BUG' | 'SECURITY' | 'PERFORMANCE' | 'CODE_QUALITY' | 'BEST_PRACTICE'
  message: string
  suggestion?: string
}

export interface CandidatePRAnalysis {
  prNumber: number
  title: string
  repo: string
  url: string
  additions: number
  deletions: number
  filesChanged: number
  mergedAt: string
  overallScore: number
  summary: string
  comments: CandidateCodeComment[]
}

export interface ScoreFactor {
  factor: string
  score: number
  maxScore: number
  notes: string
}

export interface ImprovementStep {
  priority: number
  action: string
  impact: string
  timeframe: string
  why: string
}

export interface SkippedRepo {
  name: string
  reason: string
}

export interface ScoreBreakdown {
  totalPublicRepos: number
  qualityReposFound: number
  reposAnalyzed: string[]
  reposSkipped: SkippedRepo[]
  scoreFactors: ScoreFactor[]
  whatIsHoldingBack: string[]
  improvementPlan: ImprovementStep[]
  hasTests: boolean
}

export type PipelineStatus = 'REVIEWING' | 'SHORTLISTED' | 'INTERVIEW' | 'OFFER' | 'REJECTED'

export interface CommitConsistency {
  totalCommits: number
  activeWeeks: number
  consistencyScore: number       // 0-1
  recentBurstRatio: number       // fraction of commits in last 14 days
  likelySurgedBeforeApplying: boolean
  longestStreakWeeks: string     // e.g. "8 weeks"
}

export interface InterviewQuestion {
  question: string
  category: 'TECHNICAL' | 'BEHAVIORAL' | 'CODE_REVIEW'
  targetedAt: string
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
}

export interface CandidateProfile {
  id: string
  githubLogin: string
  githubUrl: string
  avatarUrl: string
  name: string
  bio: string
  location: string
  publicRepos: number
  followers: number
  analyzedAt: string
  overallScore: number
  percentileRank: number
  pipelineStatus: PipelineStatus
  topLanguages: { name: string; percentage: number }[]
  skills: SkillSignal[]
  aiDetection: AIDetectionResult
  metrics: CodeMetrics
  summary: string
  strengths: string[]
  concerns: string[]
  prAnalysis?: CandidatePRAnalysis[]
  jdMatch?: JDMatchResult
  batchJobId?: string
  scoreBreakdown?: ScoreBreakdown
  commitConsistency?: CommitConsistency
  interviewQuestions?: InterviewQuestion[]
  notes?: CandidateNote[]
}

export interface BatchJob {
  id: string
  name: string
  totalCandidates: number
  processed: number
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED'
  createdAt: string
  completedAt?: string
  candidateIds: string[]
}

export interface JobDescription {
  id: string
  title: string
  company: string
  requiredSkills: string[]
  niceToHaveSkills: string[]
  rawText: string
  createdAt: string
}
