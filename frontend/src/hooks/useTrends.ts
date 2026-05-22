import { useState, useEffect } from 'react'
import { fetchTrends } from '../api/dashboard'
import { qualityTrendData } from '../data/mockData'
import type { TrendPoint } from '../types'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true' || !import.meta.env.VITE_API_BASE_URL

interface UseTrendsResult {
  trendData: TrendPoint[]
  loading: boolean
  error: string | null
}

export function useTrends(days = 30): UseTrendsResult {
  const [trendData, setTrendData] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (USE_MOCK) {
      setTrendData(qualityTrendData)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetchTrends(days)
      .then((data) => { if (!cancelled) setTrendData(data) })
      .catch((err: Error) => {
        if (cancelled) return
        setTrendData(qualityTrendData)
        setError(err.message)
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [days])

  return { trendData, loading, error }
}
