import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, TrendingDown, AlertCircle, GitPullRequest, Database, BarChart2, Users, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, Legend,
} from 'recharts'
import PageTransition from '../components/ui/PageTransition'
import ScoreBadge from '../components/ui/ScoreBadge'
import { useReviews, useReviewStats } from '../hooks/useReviews'
import { useRepositories } from '../hooks/useRepositories'
import { useTrends } from '../hooks/useTrends'
import { useCandidates } from '../hooks/useCandidates'
import { getScoreColor, timeAgo } from '../utils'

// ── animated counter ──────────────────────────────────────────────────────────
function CountUp({ target, decimals = 0, duration = 900 }: { target: number; decimals?: number; duration?: number }) {
  const [val, setVal] = useState(0)
  const frame = useRef<number>(0)
  useEffect(() => {
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(parseFloat((target * eased).toFixed(decimals)))
      if (p < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [target, decimals, duration])
  return <>{val.toFixed(decimals)}</>
}

// ── custom tooltip ─────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1c1c1c] border border-white/[0.08] rounded px-3 py-2 text-xs shadow-xl">
      <p className="text-zinc-500 mb-1">{label}</p>
      <p className="text-zinc-100 font-mono font-medium">{payload[0].value.toFixed(1)}</p>
    </div>
  )
}

function SeverityTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; fill: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1c1c1c] border border-white/[0.08] rounded px-3 py-2 text-xs shadow-xl space-y-1">
      <p className="text-zinc-500 mb-1.5 font-medium">{label}</p>
      {payload.map(entry => (
        <div key={entry.name} className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: entry.fill }} />
          <span className="text-zinc-400">{entry.name}</span>
          <span className="text-zinc-200 font-mono ml-auto pl-4">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── stat card ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string
  value: number
  decimals?: number
  delta: number
  deltaLabel: string
  icon: React.ElementType
  delay?: number
}

function StatCard({ label, value, decimals = 0, delta, deltaLabel, icon: Icon, delay = 0 }: StatCardProps) {
  const isPositive = delta > 0
  const isNeutral = delta === 0
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
      className="card p-4 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="label-xs">{label}</span>
        <Icon size={13} className="text-zinc-600" />
      </div>
      <div>
        <span className="text-3xl font-light text-zinc-100 tabular-nums tracking-tight">
          <CountUp target={value} decimals={decimals} />
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {!isNeutral && (
          isPositive
            ? <TrendingUp size={12} className={label.includes('Critical') ? 'text-red-400' : 'text-emerald-400'} />
            : <TrendingDown size={12} className={label.includes('Critical') ? 'text-emerald-400' : 'text-red-400'} />
        )}
        <span className={`text-xs font-medium ${isNeutral ? 'text-zinc-600' : isPositive ? (label.includes('Critical') ? 'text-red-400' : 'text-emerald-400') : (label.includes('Critical') ? 'text-emerald-400' : 'text-red-400')}`}>
          {isNeutral ? 'No change' : `${isPositive ? '+' : ''}${delta} ${deltaLabel}`}
        </span>
      </div>
    </motion.div>
  )
}

export default function Dashboard() {
  const { reviews } = useReviews()
  const { stats } = useReviewStats()
  const { repositories: repos } = useRepositories()
  const { trendData } = useTrends(30)
  const { candidates } = useCandidates()
  const navigate = useNavigate()
  const recent = reviews.slice(0, 6)

  // ── Severity breakdown per repo (real data) ───────────────────────────────
  const severityData = useMemo(() => {
    const targetRepos = repos.slice(0, 4)
    if (targetRepos.length === 0 && reviews.length > 0) {
      // Fallback: group by repoFullName from reviews
      const byRepo = new Map<string, { Critical: number; Warning: number; Info: number }>()
      reviews.forEach(r => {
        const name = r.repoFullName.split('/')[1] ?? r.repoFullName
        const existing = byRepo.get(name) ?? { Critical: 0, Warning: 0, Info: 0 }
        existing.Critical += r.criticalCount
        existing.Warning += r.warningCount
        existing.Info += r.infoCount
        byRepo.set(name, existing)
      })
      return Array.from(byRepo.entries()).slice(0, 4).map(([name, counts]) => ({ name, ...counts }))
    }
    return targetRepos.map(r => {
      const repoReviews = reviews.filter(rv => rv.repoFullName === r.fullName)
      return {
        name: r.name,
        Critical: repoReviews.reduce((s, rv) => s + rv.criticalCount, 0),
        Warning: repoReviews.reduce((s, rv) => s + rv.warningCount, 0),
        Info: repoReviews.reduce((s, rv) => s + rv.infoCount, 0),
      }
    })
  }, [repos, reviews])

  // ── Week-over-week deltas ────────────────────────────────────────────────
  const weekAgo = Date.now() - 7 * 86400000
  const twoWeeksAgo = Date.now() - 14 * 86400000
  const thisWeekReviews = reviews.filter(r => new Date(r.reviewedAt).getTime() >= weekAgo)
  const lastWeekReviews = reviews.filter(r => {
    const t = new Date(r.reviewedAt).getTime()
    return t >= twoWeeksAgo && t < weekAgo
  })
  const prDelta = thisWeekReviews.length - lastWeekReviews.length
  const avgThisWeek = thisWeekReviews.length
    ? thisWeekReviews.reduce((s, r) => s + r.overallScore, 0) / thisWeekReviews.length : 0
  const avgLastWeek = lastWeekReviews.length
    ? lastWeekReviews.reduce((s, r) => s + r.overallScore, 0) / lastWeekReviews.length : 0
  const scoreDelta = parseFloat((avgThisWeek - avgLastWeek).toFixed(1))
  const critThisWeek = thisWeekReviews.reduce((s, r) => s + r.criticalCount, 0)
  const critLastWeek = lastWeekReviews.reduce((s, r) => s + r.criticalCount, 0)
  const critDelta = critThisWeek - critLastWeek

  // ── Top candidates ───────────────────────────────────────────────────────
  const topCandidates = useMemo(
    () => [...candidates].sort((a, b) => b.overallScore - a.overallScore).slice(0, 5),
    [candidates]
  )

  return (
    <PageTransition>
      <div className="page-container">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-base font-medium text-zinc-100">Overview</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Last 30 days · {repos.length} repositor{repos.length === 1 ? 'y' : 'ies'}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-zinc-500">Live</span>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <StatCard label="PRs Reviewed" value={stats?.totalPRs ?? 0} delta={prDelta} deltaLabel="vs last week" icon={GitPullRequest} delay={0} />
          <StatCard label="Avg Quality Score" value={stats?.avgScore ?? 0} decimals={1} delta={scoreDelta} deltaLabel="vs last week" icon={BarChart2} delay={0.05} />
          <StatCard label="Critical Issues" value={stats?.totalCritical ?? 0} delta={critDelta} deltaLabel="vs last week" icon={AlertCircle} delay={0.1} />
          <StatCard label="Repos Connected" value={repos.length} delta={0} deltaLabel="" icon={Database} delay={0.15} />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          {/* Quality trend */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="col-span-3 card p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="label-xs">Quality Trend</span>
              <span className="text-xs text-zinc-600 font-mono">30d avg score</span>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={trendData} margin={{ top: 2, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="1 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#52525b' }}
                  axisLine={false}
                  tickLine={false}
                  interval={6}
                />
                <YAxis
                  domain={[40, 100]}
                  tick={{ fontSize: 11, fill: '#52525b' }}
                  axisLine={false}
                  tickLine={false}
                  width={26}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1 }} />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#7c6aff"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3, fill: '#7c6aff', strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Severity breakdown */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="col-span-2 card p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="label-xs">Issues by Repo</span>
              <span className="text-xs text-zinc-600">C / W / I</span>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={severityData} barSize={6} margin={{ top: 2, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="1 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#52525b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 11, fill: '#52525b' }} axisLine={false} tickLine={false} width={20} />
                <Tooltip content={<SeverityTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                <Legend
                  iconType="circle"
                  iconSize={7}
                  formatter={(value) => <span style={{ fontSize: 11, color: '#71717a' }}>{value}</span>}
                />
                <Bar dataKey="Critical" fill="#ef4444" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Warning" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Info" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

        {/* Charts row — now 3 columns: trend | severity | top candidates */}
        {/* Top candidates widget */}
        {topCandidates.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.28 }}
            className="card mb-6"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <span className="label-xs flex items-center gap-1.5"><Users size={12} />Top Candidates</span>
              <button onClick={() => navigate('/candidates')} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                View all →
              </button>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {topCandidates.map((c, i) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.05 }}
                  onClick={() => navigate(`/candidate/${c.id}`)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors cursor-pointer group"
                >
                  <span className="text-xs font-mono text-zinc-700 w-4 shrink-0">#{i + 1}</span>
                  <img src={c.avatarUrl} alt="" className="w-7 h-7 rounded-full shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 font-medium truncate group-hover:text-zinc-100 transition-colors">{c.name}</p>
                    <p className="text-xs text-zinc-600 font-mono truncate">@{c.githubLogin}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-light tabular-nums" style={{ color: getScoreColor(c.overallScore) }}>
                      {c.overallScore}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded border font-mono"
                      style={{
                        color: c.aiDetection.level === 'LOW' ? '#34d399' : c.aiDetection.level === 'MEDIUM' ? '#fbbf24' : '#f87171',
                        borderColor: c.aiDetection.level === 'LOW' ? 'rgba(52,211,153,0.3)' : c.aiDetection.level === 'MEDIUM' ? 'rgba(251,191,36,0.3)' : 'rgba(248,113,113,0.3)',
                        background: c.aiDetection.level === 'LOW' ? 'rgba(52,211,153,0.08)' : c.aiDetection.level === 'MEDIUM' ? 'rgba(251,191,36,0.08)' : 'rgba(248,113,113,0.08)',
                      }}
                    >
                      {c.aiDetection.level === 'LOW' ? 'Human' : c.aiDetection.level === 'MEDIUM' ? 'Mixed' : 'AI Risk'}
                    </span>
                    <ChevronRight size={13} className="text-zinc-700 group-hover:text-zinc-500 transition-colors" />
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Recent reviews table */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="card"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <span className="label-xs">Recent Reviews</span>
            <button
              onClick={() => navigate('/reviews')}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              View all →
            </button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.04]">
                <th className="text-left px-4 py-2.5 label-xs font-medium">Pull Request</th>
                <th className="text-left px-4 py-2.5 label-xs font-medium">Repository</th>
                <th className="text-left px-4 py-2.5 label-xs font-medium">Score</th>
                <th className="text-left px-4 py-2.5 label-xs font-medium">Issues</th>
                <th className="text-right px-4 py-2.5 label-xs font-medium">Reviewed</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((review, i) => (
                <motion.tr
                  key={review.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.35 + i * 0.04 }}
                  onClick={() => navigate(`/review/${review.id}`)}
                  className="table-row group"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-zinc-600 font-mono text-sm shrink-0">#{review.prNumber}</span>
                      <span className="text-sm text-zinc-300 truncate max-w-[260px] group-hover:text-zinc-100 transition-colors">
                        {review.prTitle}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-sm text-zinc-500 font-mono">{review.repoFullName.split('/')[1]}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <ScoreBadge score={review.overallScore} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {review.criticalCount > 0 && (
                        <span className="text-xs font-mono text-red-400">{review.criticalCount}C</span>
                      )}
                      {review.warningCount > 0 && (
                        <span className="text-xs font-mono text-amber-400">{review.warningCount}W</span>
                      )}
                      {review.infoCount > 0 && (
                        <span className="text-xs font-mono text-blue-400">{review.infoCount}I</span>
                      )}
                      {review.criticalCount === 0 && review.warningCount === 0 && review.infoCount === 0 && (
                        <span className="text-xs text-zinc-600">—</span>
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
        </motion.div>
      </div>
    </PageTransition>
  )
}
