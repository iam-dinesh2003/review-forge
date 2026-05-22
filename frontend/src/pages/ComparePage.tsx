import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, GitBranch, AlertTriangle, CheckCircle2, X, Plus, ExternalLink } from 'lucide-react'
import { motion } from 'framer-motion'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip, ResponsiveContainer } from 'recharts'
import PageTransition from '../components/ui/PageTransition'
import { useCandidates } from '../hooks/useCandidates'
import { getScoreColor, getScoreLabel } from '../utils'
import type { CandidateProfile, AIRiskLevel, PipelineStatus } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const RISK_COLOR: Record<AIRiskLevel, string> = {
  LOW: '#34d399', MEDIUM: '#fbbf24', HIGH: '#f87171', VERY_HIGH: '#ef4444',
}

const PIPELINE_COLOR: Record<PipelineStatus, string> = {
  REVIEWING: '#71717a', SHORTLISTED: '#818cf8', INTERVIEW: '#fbbf24',
  OFFER: '#34d399', REJECTED: '#f87171',
}

function best(values: number[], idx: number, higherIsBetter = true) {
  const sorted = [...values].sort((a, b) => higherIsBetter ? b - a : a - b)
  return values[idx] === sorted[0]
}

// ── Score arc (compact) ───────────────────────────────────────────────────────
function MiniArc({ score }: { score: number }) {
  const r = 28, size = 68
  const circ = 2 * Math.PI * r
  const color = getScoreColor(score)
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative inline-flex items-center justify-center">
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={4} />
          <motion.circle
            cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={4}
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ * (1 - score / 100) }}
            transition={{ duration: 1, ease: 'easeOut' }}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-light tabular-nums" style={{ color }}>{score}</span>
        </div>
      </div>
      <span className="text-2xs text-zinc-600 uppercase tracking-wider">{getScoreLabel(score)}</span>
    </div>
  )
}

// ── Metric row ────────────────────────────────────────────────────────────────
function MetricRow({ label, values, format, higherIsBetter = true }: {
  label: string
  values: (string | number | null)[]
  format?: (v: number) => string
  higherIsBetter?: boolean
}) {
  const nums = values.map(v => typeof v === 'number' ? v : null)
  return (
    <tr className="border-b border-white/[0.04] hover:bg-white/[0.01] transition-colors">
      <td className="py-2.5 px-4 text-xs text-zinc-500 font-medium w-32 shrink-0">{label}</td>
      {values.map((v, i) => {
        const numVals = nums.filter((n): n is number => n !== null)
        const isBest = typeof v === 'number' && numVals.length > 1 && best(numVals, numVals.indexOf(v), higherIsBetter)
        const display = typeof v === 'number' && format ? format(v) : v ?? '—'
        return (
          <td key={i} className="py-2.5 px-4 text-center">
            <span
              className={`text-xs font-mono ${isBest ? 'font-bold' : 'text-zinc-400'}`}
              style={isBest ? { color: '#34d399' } : undefined}
            >
              {isBest && <span className="mr-1">★</span>}
              {display}
            </span>
          </td>
        )
      })}
    </tr>
  )
}

// ── Skill row ─────────────────────────────────────────────────────────────────
function SkillRow({ label, candidates }: { label: string; candidates: CandidateProfile[] }) {
  return (
    <tr className="border-b border-white/[0.04] hover:bg-white/[0.01]">
      <td className="py-2 px-4 text-xs text-zinc-500 font-medium">{label}</td>
      {candidates.map((c, i) => {
        const top = c.topLanguages.slice(0, 3).map(l => l.name).join(', ')
        return (
          <td key={i} className="py-2 px-4 text-center text-xs text-zinc-400">{top || '—'}</td>
        )
      })}
    </tr>
  )
}

// ── Radar overview chart ──────────────────────────────────────────────────────
const RADAR_COLORS = ['#7c6aff', '#34d399', '#fbbf24', '#f87171']

function RadarOverview({ candidates }: { candidates: CandidateProfile[] }) {
  if (candidates.length < 2) return null

  const radarData = [
    { metric: 'Quality',   ...Object.fromEntries(candidates.map(c => [c.name, c.overallScore])) },
    { metric: 'JD Match',  ...Object.fromEntries(candidates.map(c => [c.name, c.jdMatch?.score ?? 0])) },
    { metric: 'Tests',     ...Object.fromEntries(candidates.map(c => [c.name, Math.round(c.metrics.testRatio * 100)])) },
    { metric: 'AI Safety', ...Object.fromEntries(candidates.map(c => [c.name, 100 - c.aiDetection.score])) },
    { metric: 'Activity',  ...Object.fromEntries(candidates.map(c => [c.name, Math.min(Math.round(c.publicRepos * 2), 100)])) },
  ]

  return (
    <div className="card p-4 mb-4">
      <p className="label-xs mb-3">Skill Radar — Visual Overview</p>
      <div className="flex gap-3 flex-wrap mb-3">
        {candidates.map((c, i) => (
          <div key={c.id} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: RADAR_COLORS[i] }} />
            <img src={c.avatarUrl} alt="" className="w-4 h-4 rounded-full" />
            <span className="text-xs text-zinc-300">{c.name}</span>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={radarData} margin={{ top: 8, right: 40, bottom: 8, left: 40 }}>
          <PolarGrid stroke="rgba(255,255,255,0.06)" />
          <PolarAngleAxis dataKey="metric" tick={{ fill: '#71717a', fontSize: 11 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          {candidates.map((c, i) => (
            <Radar
              key={c.id}
              name={c.name}
              dataKey={c.name}
              stroke={RADAR_COLORS[i]}
              fill={RADAR_COLORS[i]}
              fillOpacity={0.12}
              strokeWidth={2}
            />
          ))}
          <Tooltip
            contentStyle={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#a1a1aa' }}
          />
        </RadarChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-zinc-600 text-center mt-1">AI Safety = 100 − AI risk score · Activity = repos × 2 (capped at 100)</p>
    </div>
  )
}

// ── Candidate selector ────────────────────────────────────────────────────────
function CandidateSelector({ all, selected, onSelect, onRemove }: {
  all: CandidateProfile[]
  selected: string[]
  onSelect: (id: string) => void
  onRemove: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const available = all.filter(c => !selected.includes(c.id))
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs border border-dashed border-white/[0.15] rounded-lg px-3 py-2 text-zinc-500 hover:text-zinc-300 hover:border-white/[0.3] transition-all w-44"
      >
        <Plus size={12} /> Add candidate
      </button>
      {open && available.length > 0 && (
        <div className="absolute top-10 left-0 z-20 bg-[#111] border border-white/[0.1] rounded-lg overflow-hidden shadow-xl w-56 max-h-60 overflow-y-auto">
          {available.map(c => (
            <button
              key={c.id}
              onClick={() => { onSelect(c.id); setOpen(false) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.05] transition-colors text-left"
            >
              <img src={c.avatarUrl} alt="" className="w-5 h-5 rounded-full shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-zinc-200 truncate">{c.name}</p>
                <p className="text-2xs text-zinc-600 font-mono">@{c.githubLogin}</p>
              </div>
              <span className="ml-auto text-xs font-mono shrink-0" style={{ color: getScoreColor(c.overallScore) }}>
                {c.overallScore}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ComparePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { candidates: all } = useCandidates()

  // Seed from URL ?ids=1,2,3
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const param = searchParams.get('ids')
    return param ? param.split(',').slice(0, 4) : []
  })

  const candidates = useMemo(
    () => selectedIds.map(id => all.find(c => c.id === id)).filter((c): c is CandidateProfile => !!c),
    [selectedIds, all]
  )

  const addCandidate = (id: string) => {
    if (selectedIds.length < 4) setSelectedIds(prev => [...prev, id])
  }
  const removeCandidate = (id: string) => setSelectedIds(prev => prev.filter(x => x !== id))

  const scores     = candidates.map(c => c.overallScore)
  const aiRisks    = candidates.map(c => c.aiDetection.score)
  const testRatios = candidates.map(c => Math.round(c.metrics.testRatio * 100))
  const percRanks  = candidates.map(c => c.percentileRank)
  const jdScores   = candidates.map(c => c.jdMatch?.score ?? null)

  return (
    <PageTransition>
      <div className="page-container">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/candidates')} className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
            <ChevronLeft size={12} /> Candidates
          </button>
          <span className="text-zinc-700">›</span>
          <h1 className="text-base font-medium text-zinc-100 flex items-center gap-2">
            <GitBranch size={15} className="text-zinc-500" /> Compare Candidates
          </h1>
        </div>

        {/* Empty state */}
        {candidates.length === 0 && (
          <div className="card p-10 text-center space-y-3">
            <GitBranch size={28} className="text-zinc-700 mx-auto" />
            <p className="text-sm text-zinc-400">Add up to 4 candidates to compare side by side</p>
            <p className="text-xs text-zinc-600">Select candidates from the list below</p>
            <div className="flex justify-center mt-4">
              <CandidateSelector all={all} selected={selectedIds} onSelect={addCandidate} onRemove={removeCandidate} />
            </div>
          </div>
        )}

        {candidates.length > 0 && (
          <RadarOverview candidates={candidates} />
        )}

        {candidates.length > 0 && (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[600px]">
              {/* Candidate header row */}
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="py-3 px-4 text-left">
                    {selectedIds.length < 4 && (
                      <CandidateSelector all={all} selected={selectedIds} onSelect={addCandidate} onRemove={removeCandidate} />
                    )}
                  </th>
                  {candidates.map(c => (
                    <th key={c.id} className="py-3 px-4 min-w-[160px]">
                      <div className="flex flex-col items-center gap-2">
                        <div className="relative">
                          <img src={c.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
                          <button
                            onClick={() => removeCandidate(c.id)}
                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#111] border border-white/[0.15] flex items-center justify-center text-zinc-500 hover:text-zinc-200 transition-colors"
                          >
                            <X size={9} />
                          </button>
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-medium text-zinc-200">{c.name}</p>
                          <p className="text-2xs text-zinc-600 font-mono">@{c.githubLogin}</p>
                        </div>
                        <MiniArc score={c.overallScore} />
                        <button
                          onClick={() => navigate(`/candidate/${c.id}`)}
                          className="text-2xs text-zinc-600 hover:text-zinc-400 flex items-center gap-0.5 transition-colors"
                        >
                          View full profile <ExternalLink size={9} />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {/* Pipeline status */}
                <tr className="border-b border-white/[0.04] bg-white/[0.01]">
                  <td className="py-2 px-4 text-2xs text-zinc-700 uppercase tracking-wider font-semibold" colSpan={candidates.length + 1}>
                    Status & Score
                  </td>
                </tr>
                <MetricRow label="Overall Score"  values={scores}    higherIsBetter />
                <MetricRow label="Percentile"     values={percRanks} format={v => `Top ${100 - v}%`} higherIsBetter />
                <tr className="border-b border-white/[0.04]">
                  <td className="py-2.5 px-4 text-xs text-zinc-500 font-medium">Pipeline</td>
                  {candidates.map((c, i) => (
                    <td key={i} className="py-2.5 px-4 text-center">
                      <span className="text-xs font-medium" style={{ color: PIPELINE_COLOR[c.pipelineStatus ?? 'REVIEWING'] }}>
                        {c.pipelineStatus ?? 'REVIEWING'}
                      </span>
                    </td>
                  ))}
                </tr>

                {/* Code quality */}
                <tr className="border-b border-white/[0.04] bg-white/[0.01]">
                  <td className="py-2 px-4 text-2xs text-zinc-700 uppercase tracking-wider font-semibold" colSpan={candidates.length + 1}>
                    Code Quality
                  </td>
                </tr>
                <MetricRow label="Test Coverage" values={testRatios} format={v => `${v}%`} higherIsBetter />
                <MetricRow label="Avg Complexity" values={candidates.map(c => +c.metrics.avgComplexity.toFixed(1))} higherIsBetter={false} />
                <MetricRow label="Duplication"    values={candidates.map(c => Math.round(c.metrics.duplicateRatio * 100))} format={v => `${v}%`} higherIsBetter={false} />
                <MetricRow label="Comment Ratio"  values={candidates.map(c => Math.round(c.metrics.commentRatio * 100))} format={v => `${v}%`} higherIsBetter />
                <SkillRow  label="Top Languages"  candidates={candidates} />

                {/* AI detection */}
                <tr className="border-b border-white/[0.04] bg-white/[0.01]">
                  <td className="py-2 px-4 text-2xs text-zinc-700 uppercase tracking-wider font-semibold" colSpan={candidates.length + 1}>
                    AI Detection
                  </td>
                </tr>
                <tr className="border-b border-white/[0.04]">
                  <td className="py-2.5 px-4 text-xs text-zinc-500 font-medium">AI Risk Level</td>
                  {candidates.map((c, i) => (
                    <td key={i} className="py-2.5 px-4 text-center">
                      <span className="text-xs font-medium flex items-center justify-center gap-1" style={{ color: RISK_COLOR[c.aiDetection.level] }}>
                        {c.aiDetection.level === 'LOW' ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                        {c.aiDetection.level.replace('_', ' ')}
                      </span>
                    </td>
                  ))}
                </tr>
                <MetricRow label="AI Score" values={aiRisks} format={v => `${v}%`} higherIsBetter={false} />
                <MetricRow label="Burst Commits" values={candidates.map(c => Math.round(c.aiDetection.commitBurstRatio * 100))} format={v => `${v}%`} higherIsBetter={false} />

                {/* Commit consistency */}
                {candidates.some(c => c.commitConsistency) && (
                  <>
                    <tr className="border-b border-white/[0.04] bg-white/[0.01]">
                      <td className="py-2 px-4 text-2xs text-zinc-700 uppercase tracking-wider font-semibold" colSpan={candidates.length + 1}>
                        Commit Consistency
                      </td>
                    </tr>
                    <MetricRow label="Active Weeks" values={candidates.map(c => c.commitConsistency?.activeWeeks ?? 0)} format={v => `${v}/26`} higherIsBetter />
                    <MetricRow label="Recent Burst"  values={candidates.map(c => Math.round((c.commitConsistency?.recentBurstRatio ?? 0) * 100))} format={v => `${v}%`} higherIsBetter={false} />
                    <tr className="border-b border-white/[0.04]">
                      <td className="py-2.5 px-4 text-xs text-zinc-500 font-medium">Surge Flag</td>
                      {candidates.map((c, i) => (
                        <td key={i} className="py-2.5 px-4 text-center text-xs">
                          {c.commitConsistency?.likelySurgedBeforeApplying
                            ? <span className="text-amber-400 flex items-center justify-center gap-1"><AlertTriangle size={10} />Yes</span>
                            : <span className="text-emerald-400 flex items-center justify-center gap-1"><CheckCircle2 size={10} />No</span>}
                        </td>
                      ))}
                    </tr>
                  </>
                )}

                {/* JD match */}
                {jdScores.some(s => s !== null) && (
                  <>
                    <tr className="border-b border-white/[0.04] bg-white/[0.01]">
                      <td className="py-2 px-4 text-2xs text-zinc-700 uppercase tracking-wider font-semibold" colSpan={candidates.length + 1}>
                        JD Match
                      </td>
                    </tr>
                    <MetricRow label="JD Score" values={jdScores.map(s => s ?? 0)} format={v => `${v}%`} higherIsBetter />
                  </>
                )}

                {/* GitHub */}
                <tr className="border-b border-white/[0.04] bg-white/[0.01]">
                  <td className="py-2 px-4 text-2xs text-zinc-700 uppercase tracking-wider font-semibold" colSpan={candidates.length + 1}>
                    GitHub Profile
                  </td>
                </tr>
                <MetricRow label="Public Repos" values={candidates.map(c => c.publicRepos)} higherIsBetter />
                <MetricRow label="Followers"    values={candidates.map(c => c.followers)}   higherIsBetter />
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageTransition>
  )
}
