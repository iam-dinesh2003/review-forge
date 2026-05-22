/**
 * Type-safe API functions that map backend DTOs → frontend types.
 *
 * Field-name differences between backend and frontend are reconciled here
 * so the rest of the codebase never has to worry about snake_case or
 * backend-specific naming.
 */

import { api } from './client'
import type { ReviewSession, ReviewComment, Repository, TrendPoint, DashboardStats } from '../types'

// ── Backend DTO shapes (mirrors the Java records) ──────────────────────────

interface ApiStats {
  totalPRs: number
  avgScore: number
  totalCritical: number
  totalWarning: number
  totalInfo: number
  reposConnected: number
}

interface ApiReviewListItem {
  id: number
  prNumber: number
  prTitle: string
  authorLogin: string
  authorAvatarUrl: string | null
  repoFullName: string
  branch: string
  headSha: string
  overallScore: number
  criticalCount: number
  warningCount: number
  infoCount: number
  reviewedAt: string
  githubUrl: string | null
}

interface ApiReviewSummary extends ApiReviewListItem {
  summary: string
  comments: ApiComment[]
}

interface ApiComment {
  id: number
  file: string
  line: number
  severity: string
  category: string
  message: string
  suggestion: string | null
}

interface ApiRepoStats {
  repoFullName: string
  owner: string
  name: string
  prCount: number
  avgScore: number
  totalCritical: number
  totalWarning: number
  totalInfo: number
  lastReviewedAt: string | null
}

interface ApiTrendPoint {
  label: string
  score: number
}

interface ApiPage<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

// ── Mappers ────────────────────────────────────────────────────────────────

function mapComment(c: ApiComment): ReviewComment {
  return {
    id: String(c.id),
    file: c.file ?? '',
    line: c.line,
    severity: c.severity as ReviewComment['severity'],
    category: c.category as ReviewComment['category'],
    message: c.message,
    suggestion: c.suggestion ?? undefined,
  }
}

function mapReviewItem(r: ApiReviewListItem): ReviewSession {
  return {
    id: String(r.id),
    prNumber: r.prNumber,
    prTitle: r.prTitle,
    authorLogin: r.authorLogin,
    authorAvatar: r.authorAvatarUrl ?? `https://github.com/${r.authorLogin}.png`,
    repoFullName: r.repoFullName,
    branch: r.branch,
    headSha: r.headSha,
    overallScore: r.overallScore,
    summary: '',
    criticalCount: r.criticalCount,
    warningCount: r.warningCount,
    infoCount: r.infoCount,
    reviewedAt: r.reviewedAt,
    githubUrl: r.githubUrl ?? '',
    comments: [],
  }
}

function mapReviewSummary(r: ApiReviewSummary): ReviewSession {
  return {
    ...mapReviewItem(r),
    summary: r.summary,
    comments: (r.comments ?? []).map(mapComment),
  }
}

function mapRepo(r: ApiRepoStats): Repository {
  return {
    id: r.repoFullName,
    fullName: r.repoFullName,
    owner: r.owner,
    name: r.name,
    avgScore: r.avgScore,
    prCount: r.prCount,
    lastReviewedAt: r.lastReviewedAt ?? '',
    isConnected: true,
    trendData: [], // trend data loaded separately via /trends if needed
  }
}

// ── Public API functions ───────────────────────────────────────────────────

export async function fetchStats(): Promise<DashboardStats> {
  const data = await api.get<ApiStats>('/api/dashboard/stats')
  return {
    totalPRs: data.totalPRs,
    avgScore: data.avgScore,
    totalCritical: data.totalCritical,
    reposConnected: data.reposConnected,
  }
}

export async function fetchReviews(page = 0, size = 20): Promise<{
  items: ReviewSession[]
  totalElements: number
  totalPages: number
}> {
  const data = await api.get<ApiPage<ApiReviewListItem>>(
    `/api/dashboard/reviews?page=${page}&size=${size}`,
  )
  return {
    items: data.content.map(mapReviewItem),
    totalElements: data.totalElements,
    totalPages: data.totalPages,
  }
}

export async function fetchReview(id: string): Promise<ReviewSession> {
  const data = await api.get<ApiReviewSummary>(`/api/dashboard/reviews/${id}`)
  return mapReviewSummary(data)
}

export async function fetchRepositories(): Promise<Repository[]> {
  const data = await api.get<ApiRepoStats[]>('/api/dashboard/repositories')
  return data.map(mapRepo)
}

export async function fetchTrends(days = 30): Promise<TrendPoint[]> {
  const data = await api.get<ApiTrendPoint[]>(`/api/dashboard/trends?days=${days}`)
  return data.map((p) => ({ date: p.label, score: p.score }))
}

export async function pingApi(): Promise<boolean> {
  try {
    await api.get<unknown>('/api/dashboard/ping')
    return true
  } catch {
    return false
  }
}
