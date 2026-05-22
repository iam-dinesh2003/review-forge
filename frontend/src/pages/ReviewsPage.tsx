import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Filter } from 'lucide-react'
import { motion } from 'framer-motion'
import PageTransition from '../components/ui/PageTransition'
import ScoreBadge from '../components/ui/ScoreBadge'
import { useReviews } from '../hooks/useReviews'
import { useRepositories } from '../hooks/useRepositories'
import { timeAgo } from '../utils'

type SeverityFilter = 'all' | 'critical' | 'warning' | 'clean'

export default function ReviewsPage() {
  const navigate = useNavigate()
  const { reviews } = useReviews()
  const { repositories: repos } = useRepositories()

  const [search, setSearch] = useState('')
  const [repoFilter, setRepoFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')

  const filtered = useMemo(() => {
    return reviews.filter(r => {
      if (repoFilter !== 'all' && r.repoFullName !== repoFilter) return false
      if (severityFilter === 'critical' && r.criticalCount === 0) return false
      if (severityFilter === 'warning' && r.warningCount === 0) return false
      if (severityFilter === 'clean' && (r.criticalCount > 0 || r.warningCount > 0)) return false
      if (search && !r.prTitle.toLowerCase().includes(search.toLowerCase()) && !String(r.prNumber).includes(search)) return false
      return true
    })
  }, [reviews, repoFilter, severityFilter, search])

  const severityTabs: { key: SeverityFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'critical', label: 'Has Critical' },
    { key: 'warning', label: 'Has Warning' },
    { key: 'clean', label: 'Clean' },
  ]

  return (
    <PageTransition>
      <div className="page-container">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-base font-medium text-zinc-100">Pull Request Reviews</h1>
            <p className="text-xs text-zinc-500 mt-0.5">{filtered.length} of {reviews.length} reviews</p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="card p-3 mb-4 flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="flex items-center gap-2 bg-surface-raised border border-white/[0.06] rounded px-3 py-1.5 min-w-[200px]">
            <Search size={12} className="text-zinc-600 shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search PRs…"
              className="bg-transparent text-xs text-zinc-300 placeholder:text-zinc-600 outline-none w-full"
            />
          </div>

          {/* Repo filter */}
          <div className="flex items-center gap-1.5">
            <Filter size={12} className="text-zinc-600" />
            <select
              value={repoFilter}
              onChange={e => setRepoFilter(e.target.value)}
              className="bg-surface-raised border border-white/[0.06] rounded text-xs text-zinc-400 px-2 py-1.5 outline-none appearance-none cursor-pointer hover:text-zinc-200 transition-colors"
            >
              <option value="all">All repos</option>
              {repos.map(r => (
                <option key={r.id} value={r.fullName}>{r.name}</option>
              ))}
            </select>
          </div>

          {/* Severity tabs */}
          <div className="flex items-center gap-0.5 bg-surface-raised border border-white/[0.06] rounded p-0.5 ml-auto">
            {severityTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setSeverityFilter(tab.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${severityFilter === tab.key ? 'bg-white/[0.08] text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="card">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 label-xs font-medium">Pull Request</th>
                <th className="text-left px-4 py-3 label-xs font-medium hidden md:table-cell">Author</th>
                <th className="text-left px-4 py-3 label-xs font-medium">Repository</th>
                <th className="text-left px-4 py-3 label-xs font-medium">Score</th>
                <th className="text-left px-4 py-3 label-xs font-medium">Issues</th>
                <th className="text-right px-4 py-3 label-xs font-medium">Reviewed</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-xs text-zinc-600">
                    No reviews match your filters.
                  </td>
                </tr>
              )}
              {filtered.map((review, i) => (
                <motion.tr
                  key={review.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => navigate(`/review/${review.id}`)}
                  className="table-row group"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-600 font-mono text-xs shrink-0">#{review.prNumber}</span>
                        <span className="text-xs text-zinc-300 truncate max-w-[280px] group-hover:text-zinc-100 transition-colors">
                          {review.prTitle}
                        </span>
                      </div>
                      <span className="text-xs text-zinc-600 font-mono">{review.branch}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell">
                    <div className="flex items-center gap-2">
                      <img
                        src={review.authorAvatar}
                        alt=""
                        className="w-5 h-5 rounded-full bg-zinc-800"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                      <span className="text-xs text-zinc-500">{review.authorLogin}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-zinc-500 font-mono">{review.repoFullName.split('/')[1]}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <ScoreBadge score={review.overallScore} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {review.criticalCount > 0 && (
                        <span className="flex items-center gap-1 text-xs font-mono">
                          <span className="w-1 h-1 rounded-full bg-red-500" />
                          <span className="text-red-400">{review.criticalCount}</span>
                        </span>
                      )}
                      {review.warningCount > 0 && (
                        <span className="flex items-center gap-1 text-xs font-mono">
                          <span className="w-1 h-1 rounded-full bg-amber-500" />
                          <span className="text-amber-400">{review.warningCount}</span>
                        </span>
                      )}
                      {review.infoCount > 0 && (
                        <span className="flex items-center gap-1 text-xs font-mono">
                          <span className="w-1 h-1 rounded-full bg-blue-500" />
                          <span className="text-blue-400">{review.infoCount}</span>
                        </span>
                      )}
                      {review.criticalCount === 0 && review.warningCount === 0 && review.infoCount === 0 && (
                        <span className="text-xs text-zinc-700">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-xs text-zinc-600">{timeAgo(review.reviewedAt)}</span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageTransition>
  )
}
