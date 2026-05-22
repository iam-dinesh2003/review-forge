import { useNavigate } from 'react-router-dom'
import { GitBranch, Plus, Clock } from 'lucide-react'
import { motion } from 'framer-motion'
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'
import PageTransition from '../components/ui/PageTransition'
import ScoreBadge from '../components/ui/ScoreBadge'
import { useRepositories } from '../hooks/useRepositories'
import { useReviews } from '../hooks/useReviews'
import { timeAgo, getScoreColor } from '../utils'
import type { Repository } from '../types'

function SparklineTooltip({ active, payload }: { active?: boolean; payload?: { value: number }[] }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1c1c1c] border border-white/[0.08] rounded px-2 py-1 text-xs font-mono text-zinc-300">
      {payload[0].value.toFixed(0)}
    </div>
  )
}

function RepoCard({ repo, reviewCount, delay }: { repo: Repository; reviewCount: number; delay: number }) {
  const navigate = useNavigate()
  const color = getScoreColor(repo.avgScore)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
      onClick={() => navigate('/reviews')}
      className="card p-4 cursor-pointer hover:bg-surface-raised transition-colors group"
    >
      {/* Top: name + status */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-sm font-medium text-zinc-200 group-hover:text-zinc-100 transition-colors truncate">
              {repo.name}
            </span>
          </div>
          <span className="text-xs text-zinc-600 font-mono">{repo.owner}</span>
        </div>
        <ScoreBadge score={repo.avgScore} />
      </div>

      {/* Sparkline */}
      <div className="mb-4 -mx-1">
        <ResponsiveContainer width="100%" height={44}>
          <LineChart data={repo.trendData.slice(-14)} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
            <Tooltip content={<SparklineTooltip />} cursor={false} />
            <Line
              type="monotone"
              dataKey="score"
              stroke={color}
              strokeWidth={1.5}
              dot={false}
              strokeOpacity={0.7}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/[0.04]">
        <div>
          <p className="label-xs mb-1">PRs Reviewed</p>
          <p className="text-sm font-light text-zinc-200 tabular-nums">{repo.prCount}</p>
        </div>
        <div>
          <p className="label-xs mb-1">Avg Score</p>
          <p className="text-sm font-light tabular-nums" style={{ color }}>{repo.avgScore}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-white/[0.04]">
        <Clock size={11} className="text-zinc-700" />
        <span className="text-xs text-zinc-600">Last reviewed {timeAgo(repo.lastReviewedAt)}</span>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-zinc-600">
          <GitBranch size={10} />
          <span className="font-mono">{repo.fullName}</span>
        </div>
      </div>
    </motion.div>
  )
}

export default function RepositoriesPage() {
  const { repositories: repos } = useRepositories()
  const { reviews } = useReviews()

  const reviewCountByRepo = repos.reduce<Record<string, number>>((acc, repo) => {
    acc[repo.fullName] = reviews.filter(r => r.repoFullName === repo.fullName).length
    return acc
  }, {})

  return (
    <PageTransition>
      <div className="page-container">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-base font-medium text-zinc-100">Repositories</h1>
            <p className="text-xs text-zinc-500 mt-0.5">{repos.length} connected</p>
          </div>
          <button className="flex items-center gap-1.5 text-xs text-zinc-400 border border-white/[0.08] rounded px-3 py-1.5 hover:text-zinc-200 hover:border-white/[0.16] transition-colors">
            <Plus size={12} />
            Connect repo
          </button>
        </div>

        {/* Summary strip */}
        <div className="card p-3 mb-5 flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-zinc-500">{repos.filter(r => r.isConnected).length} active</span>
          </div>
          <div className="w-px h-4 bg-white/[0.06]" />
          <span className="text-xs text-zinc-500">
            <span className="text-zinc-300 font-mono">{reviews.length}</span> total reviews
          </span>
          <div className="w-px h-4 bg-white/[0.06]" />
          <span className="text-xs text-zinc-500">
            Avg score{' '}
            <span className="text-zinc-300 font-mono">
              {(repos.reduce((s, r) => s + r.avgScore, 0) / repos.length).toFixed(1)}
            </span>
          </span>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {repos.map((repo, i) => (
            <RepoCard
              key={repo.id}
              repo={repo}
              reviewCount={reviewCountByRepo[repo.fullName] ?? 0}
              delay={i * 0.07}
            />
          ))}

          {/* Add new card */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: repos.length * 0.07 + 0.1 }}
            className="border border-dashed border-white/[0.08] rounded p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-white/[0.16] hover:bg-white/[0.01] transition-colors min-h-[200px] group"
          >
            <Plus size={16} className="text-zinc-700 group-hover:text-zinc-500 transition-colors" />
            <span className="text-xs text-zinc-600 group-hover:text-zinc-500 transition-colors">Connect repository</span>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  )
}
