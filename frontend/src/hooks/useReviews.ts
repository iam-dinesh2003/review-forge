import { useState, useEffect, useCallback } from 'react'
import { fetchReviews, fetchReview, fetchStats } from '../api/dashboard'
import { mockReviews } from '../data/mockData'
import type { ReviewSession, DashboardStats } from '../types'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true' || !import.meta.env.VITE_API_BASE_URL

// ── useReviews ─────────────────────────────────────────────────────────────

interface UseReviewsResult {
  reviews: ReviewSession[]
  loading: boolean
  error: string | null
  totalPages: number
  currentPage: number
  setPage: (p: number) => void
  refresh: () => void
}

export function useReviews(pageSize = 20): UseReviewsResult {
  const [reviews, setReviews] = useState<ReviewSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (USE_MOCK) {
      setReviews(mockReviews)
      setTotalPages(1)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetchReviews(currentPage, pageSize)
      .then(({ items, totalPages: tp }) => {
        if (cancelled) return
        setReviews(items)
        setTotalPages(tp)
      })
      .catch((err: Error) => {
        if (cancelled) return
        // Fall back to mock data on network error so the UI is never empty
        setReviews(mockReviews)
        setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [currentPage, pageSize, tick])

  return {
    reviews,
    loading,
    error,
    totalPages,
    currentPage,
    setPage: setCurrentPage,
    refresh: () => setTick((t) => t + 1),
  }
}

// ── useReview (single PR detail) ───────────────────────────────────────────

interface UseReviewResult {
  review: ReviewSession | undefined
  loading: boolean
  error: string | null
}

export function useReview(id: string): UseReviewResult {
  const [review, setReview] = useState<ReviewSession | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (USE_MOCK) {
      setReview(mockReviews.find((r) => r.id === id))
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetchReview(id)
      .then((data) => { if (!cancelled) setReview(data) })
      .catch((err: Error) => {
        if (cancelled) return
        setReview(mockReviews.find((r) => r.id === id))
        setError(err.message)
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [id])

  return { review, loading, error }
}

// ── useReviewStats ─────────────────────────────────────────────────────────

interface UseStatsResult {
  stats: DashboardStats | null
  loading: boolean
  error: string | null
}

export function useReviewStats(): UseStatsResult {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (USE_MOCK) {
      const totalPRs = mockReviews.length
      const avgScore = parseFloat(
        (mockReviews.reduce((s, r) => s + r.overallScore, 0) / totalPRs).toFixed(1),
      )
      const totalCritical = mockReviews.reduce((s, r) => s + r.criticalCount, 0)
      setStats({ totalPRs, avgScore, totalCritical, reposConnected: 4 })
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    fetchStats()
      .then((data) => { if (!cancelled) setStats(data) })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message)
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [])

  return { stats, loading, error }
}
