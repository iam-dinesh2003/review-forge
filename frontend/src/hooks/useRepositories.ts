import { useState, useEffect } from 'react'
import { fetchRepositories } from '../api/dashboard'
import { mockRepositories } from '../data/mockData'
import type { Repository } from '../types'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true' || !import.meta.env.VITE_API_BASE_URL

interface UseRepositoriesResult {
  repositories: Repository[]
  loading: boolean
  error: string | null
}

export function useRepositories(): UseRepositoriesResult {
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (USE_MOCK) {
      setRepositories(mockRepositories)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetchRepositories()
      .then((data) => { if (!cancelled) setRepositories(data) })
      .catch((err: Error) => {
        if (cancelled) return
        setRepositories(mockRepositories) // graceful fallback
        setError(err.message)
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [])

  return { repositories, loading, error }
}

export function useRepository(id: string): Repository | undefined {
  const { repositories } = useRepositories()
  return repositories.find((r) => r.id === id || r.fullName === id)
}
