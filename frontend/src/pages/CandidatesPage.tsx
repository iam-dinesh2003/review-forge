import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Users, Upload, Trophy, Loader2, AlertTriangle, CheckCircle2, Github, ChevronRight, SlidersHorizontal, X, GitCompareArrows } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import PageTransition from '../components/ui/PageTransition'
import ScoreBadge from '../components/ui/ScoreBadge'
import { useCandidates, useCandidateAnalyze, usePipelineStatus } from '../hooks/useCandidates'
import { timeAgo, getScoreColor } from '../utils'
import type { CandidateProfile, AIRiskLevel, PipelineStatus } from '../types'

// ── Pipeline status badge + inline updater ────────────────────────────────────
const PIPELINE_STYLE: Record<PipelineStatus, { bg: string; text: string; border: string }> = {
  REVIEWING:   { bg: 'rgba(113,113,122,0.1)',  text: '#71717a', border: 'rgba(113,113,122,0.3)' },
  SHORTLISTED: { bg: 'rgba(99,102,241,0.1)',   text: '#818cf8', border: 'rgba(129,140,248,0.3)' },
  INTERVIEW:   { bg: 'rgba(251,191,36,0.1)',   text: '#fbbf24', border: 'rgba(251,191,36,0.3)'  },
  OFFER:       { bg: 'rgba(52,211,153,0.1)',   text: '#34d399', border: 'rgba(52,211,153,0.3)'  },
  REJECTED:    { bg: 'rgba(239,68,68,0.08)',   text: '#f87171', border: 'rgba(248,113,113,0.3)' },
}
const PIPELINE_STAGES: PipelineStatus[] = ['REVIEWING', 'SHORTLISTED', 'INTERVIEW', 'OFFER', 'REJECTED']

function PipelineBadge({ status, candidateId, onUpdated }: {
  status: PipelineStatus; candidateId: string; onUpdated: (id: string, s: PipelineStatus) => void
}) {
  const { updateStatus } = usePipelineStatus()
  const [open, setOpen] = useState(false)
  const s = PIPELINE_STYLE[status]

  const handleSelect = useCallback(async (e: React.MouseEvent, next: PipelineStatus) => {
    e.stopPropagation()
    setOpen(false)
    await updateStatus(candidateId, next)
    onUpdated(candidateId, next)
  }, [candidateId, updateStatus, onUpdated])

  return (
    <div className="relative" onClick={e => { e.stopPropagation(); setOpen(o => !o) }}>
      <span
        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border cursor-pointer hover:opacity-80 transition-opacity"
        style={{ background: s.bg, color: s.text, borderColor: s.border }}
      >
        {status}
      </span>
      {open && (
        <div className="absolute top-6 left-0 z-20 bg-[#111] border border-white/[0.1] rounded-lg overflow-hidden shadow-xl w-36">
          {PIPELINE_STAGES.map(stage => {
            const st = PIPELINE_STYLE[stage]
            return (
              <button
                key={stage}
                onClick={e => handleSelect(e, stage)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/[0.05] transition-colors flex items-center gap-2"
                style={{ color: st.text }}
              >
                {stage === status && <CheckCircle2 size={10} />}
                {stage}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── AI Risk Badge ─────────────────────────────────────────────────────────────

const AI_RISK_STYLE: Record<AIRiskLevel, { bg: string; text: string; border: string; label: string }> = {
  LOW:       { bg: 'rgba(16,185,129,0.08)', text: '#34d399', border: 'rgba(52,211,153,0.3)', label: 'Human' },
  MEDIUM:    { bg: 'rgba(245,158,11,0.08)', text: '#fbbf24', border: 'rgba(251,191,36,0.3)', label: 'Mixed' },
  HIGH:      { bg: 'rgba(239,68,68,0.08)', text: '#f87171', border: 'rgba(248,113,113,0.3)', label: 'AI Risk' },
  VERY_HIGH: { bg: 'rgba(239,68,68,0.12)', text: '#ef4444', border: 'rgba(239,68,68,0.5)', label: 'High AI Risk' },
}

function AIRiskBadge({ level, score }: { level: AIRiskLevel; score: number }) {
  const s = AI_RISK_STYLE[level]
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium"
      style={{ background: s.bg, color: s.text, borderColor: s.border }}
    >
      {level === 'LOW' ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
      {s.label} · {score}%
    </span>
  )
}

// ── Skill chips ───────────────────────────────────────────────────────────────

const LEVEL_COLOR = { EXPERT: '#a78bfa', PROFICIENT: '#67e8f9', FAMILIAR: '#71717a' }

function SkillChips({ skills }: { candidate: CandidateProfile; skills: CandidateProfile['skills'] }) {
  const top = skills.slice(0, 4)
  const rest = skills.length - top.length
  return (
    <div className="flex flex-wrap gap-1">
      {top.map(s => (
        <span
          key={s.name}
          className="text-xs px-1.5 py-0.5 rounded border"
          style={{ color: LEVEL_COLOR[s.level], borderColor: LEVEL_COLOR[s.level] + '44', background: LEVEL_COLOR[s.level] + '10' }}
        >
          {s.name}
        </span>
      ))}
      {rest > 0 && <span className="text-xs text-zinc-600 py-0.5">+{rest}</span>}
    </div>
  )
}

// ── Candidate card ─────────────────────────────────────────────────────────────

function CandidateCard({ candidate, index, onClick, onStatusUpdate, selected, onToggleSelect }: {
  candidate: CandidateProfile; index: number; onClick: () => void
  onStatusUpdate: (id: string, s: PipelineStatus) => void
  selected: boolean; onToggleSelect: (id: string) => void
}) {
  const color = getScoreColor(candidate.overallScore)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.06 }}
      onClick={onClick}
      className={[
        'card p-4 cursor-pointer hover:bg-surface-raised transition-colors group relative',
        selected ? 'ring-1 ring-[#7c6aff]/60' : '',
      ].join(' ')}
    >
      {/* Compare checkbox */}
      <button
        onClick={e => { e.stopPropagation(); onToggleSelect(candidate.id) }}
        className={[
          'absolute top-3 right-3 w-5 h-5 rounded border flex items-center justify-center transition-colors z-10',
          selected
            ? 'bg-[#7c6aff] border-[#7c6aff] text-white'
            : 'border-white/[0.12] text-transparent hover:border-[#7c6aff]/50',
        ].join(' ')}
        title={selected ? 'Remove from compare' : 'Add to compare'}
      >
        <CheckCircle2 size={11} />
      </button>

      {/* Avatar + name + score */}
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={candidate.avatarUrl} alt="" className="w-9 h-9 rounded-full shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-200 group-hover:text-zinc-100 transition-colors truncate">{candidate.name}</p>
            <p className="text-xs text-zinc-600 font-mono">@{candidate.githubLogin}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className="text-2xl font-light tabular-nums" style={{ color }}>{candidate.overallScore}</span>
          {candidate.percentileRank > 0 && (
            <p className="text-2xs text-zinc-600 mt-0.5">top {100 - candidate.percentileRank}%</p>
          )}
        </div>
      </div>

      {/* Bio */}
      <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2 mb-3">{candidate.bio}</p>

      {/* AI detection + pipeline status */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <AIRiskBadge level={candidate.aiDetection.level} score={candidate.aiDetection.score} />
        <PipelineBadge
          status={candidate.pipelineStatus ?? 'REVIEWING'}
          candidateId={candidate.id}
          onUpdated={onStatusUpdate}
        />
      </div>

      {/* Skills */}
      <SkillChips candidate={candidate} skills={candidate.skills} />

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.04]">
        <span className="text-xs text-zinc-600">{candidate.publicRepos} repos · {candidate.followers} followers</span>
        <span className="text-xs text-zinc-600">{timeAgo(candidate.analyzedAt)}</span>
      </div>
    </motion.div>
  )
}

// ── Analyze input panel ────────────────────────────────────────────────────────

function AnalyzePanel({ onResult }: { onResult: (c: CandidateProfile) => void }) {
  const [input, setInput] = useState('')
  const { analyze, analyzing, result, error } = useCandidateAnalyze()
  const firedRef = useRef(false)

  // Fire onResult exactly once when analysis completes, then reset
  useEffect(() => {
    if (result && !analyzing && !firedRef.current) {
      firedRef.current = true
      onResult(result)
      setInput('')
    }
  }, [result, analyzing, onResult])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    firedRef.current = false
    analyze(input.trim())
  }

  return (
    <div className="card p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Github size={14} className="text-zinc-500" />
        <span className="text-sm font-medium text-zinc-300">Analyze a Candidate</span>
        <span className="text-xs text-zinc-600">Paste any GitHub URL or username</span>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="github.com/username  or  @username"
          className="flex-1 bg-[#111] border border-white/[0.08] rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#7c6aff]/60 transition-colors"
          disabled={analyzing}
        />
        <button
          type="submit"
          disabled={analyzing || !input.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded text-sm font-medium transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #7c6aff 0%, #a855f7 100%)', color: '#fff' }}
        >
          {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {analyzing ? 'Analyzing…' : 'Analyze'}
        </button>
      </form>
      {analyzing && (
        <div className="mt-3 flex items-center gap-2">
          <div className="flex gap-1">
            {['Fetching repos', 'Running AI analysis', 'Detecting patterns'].map((step, i) => (
              <motion.span
                key={step}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 1.5, delay: i * 0.6, repeat: Infinity }}
                className="text-xs text-zinc-600"
              >
                {step}{i < 2 ? ' ·' : ''}
              </motion.span>
            ))}
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  )
}

// ── Filter types ──────────────────────────────────────────────────────────────
type ScoreFilter = 'ALL' | '85+' | '70-84' | '<70'
type RiskFilter = 'ALL' | 'LOW' | 'MEDIUM+'
type SortKey = 'score-desc' | 'score-asc' | 'ai-risk' | 'recent'

interface FilterState {
  search: string
  scoreFilter: ScoreFilter
  riskFilter: RiskFilter
  sortKey: SortKey
}

// ── Filter bar ────────────────────────────────────────────────────────────────
function FilterBar({ filters, onChange, resultCount, totalCount }: {
  filters: FilterState
  onChange: (f: FilterState) => void
  resultCount: number
  totalCount: number
}) {
  const hasActive = filters.search || filters.scoreFilter !== 'ALL' || filters.riskFilter !== 'ALL' || filters.sortKey !== 'score-desc'

  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) =>
    onChange({ ...filters, [k]: v })

  const reset = () => onChange({ search: '', scoreFilter: 'ALL', riskFilter: 'ALL', sortKey: 'score-desc' })

  return (
    <div className="card p-3 mb-4 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <SlidersHorizontal size={13} className="text-zinc-600 shrink-0" />
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
          <input
            value={filters.search}
            onChange={e => set('search', e.target.value)}
            placeholder="Search by name or @username…"
            className="w-full bg-[#111] border border-white/[0.08] rounded pl-7 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#7c6aff]/60 transition-colors"
          />
          {filters.search && (
            <button onClick={() => set('search', '')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
              <X size={11} />
            </button>
          )}
        </div>
        {hasActive && (
          <button onClick={reset} className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300 transition-colors whitespace-nowrap">
            Clear
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* Score filter */}
        <div className="flex items-center gap-1">
          {(['ALL', '85+', '70-84', '<70'] as ScoreFilter[]).map(v => (
            <button
              key={v}
              onClick={() => set('scoreFilter', v)}
              className={[
                'text-2xs px-2 py-1 rounded border transition-colors',
                filters.scoreFilter === v
                  ? 'border-[#7c6aff]/60 bg-[#7c6aff]/10 text-[#a78bfa]'
                  : 'border-white/[0.06] text-zinc-600 hover:text-zinc-400',
              ].join(' ')}
            >
              {v === 'ALL' ? 'All scores' : `Score ${v}`}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-white/[0.06]" />

        {/* Risk filter */}
        <div className="flex items-center gap-1">
          {(['ALL', 'LOW', 'MEDIUM+'] as RiskFilter[]).map(v => (
            <button
              key={v}
              onClick={() => set('riskFilter', v)}
              className={[
                'text-2xs px-2 py-1 rounded border transition-colors',
                filters.riskFilter === v
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-white/[0.06] text-zinc-600 hover:text-zinc-400',
              ].join(' ')}
            >
              {v === 'ALL' ? 'Any AI risk' : v === 'LOW' ? 'Human only' : 'AI risk'}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-white/[0.06]" />

        {/* Sort */}
        <select
          value={filters.sortKey}
          onChange={e => set('sortKey', e.target.value as SortKey)}
          className="text-2xs bg-[#111] border border-white/[0.06] rounded px-2 py-1 text-zinc-400 focus:outline-none focus:border-[#7c6aff]/40 cursor-pointer"
        >
          <option value="score-desc">Score ↓</option>
          <option value="score-asc">Score ↑</option>
          <option value="ai-risk">AI Risk ↑</option>
          <option value="recent">Most recent</option>
        </select>

        <span className="ml-auto text-2xs text-zinc-600">
          {resultCount === totalCount ? `${totalCount} candidates` : `${resultCount} of ${totalCount}`}
        </span>
      </div>
    </div>
  )
}

// ── Stats strip ───────────────────────────────────────────────────────────────

function StatsStrip({ candidates }: { candidates: CandidateProfile[] }) {
  const avg = candidates.length ? Math.round(candidates.reduce((s, c) => s + c.overallScore, 0) / candidates.length) : 0
  const highRisk = candidates.filter(c => c.aiDetection.level === 'HIGH' || c.aiDetection.level === 'VERY_HIGH').length
  const top = candidates.filter(c => c.overallScore >= 85).length

  return (
    <div className="card p-3 mb-5 flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-1.5">
        <Users size={12} className="text-zinc-600" />
        <span className="text-xs text-zinc-500">
          <span className="text-zinc-200 font-mono">{candidates.length}</span> candidates analyzed
        </span>
      </div>
      <div className="w-px h-4 bg-white/[0.06]" />
      <span className="text-xs text-zinc-500">
        Avg score <span className="text-zinc-200 font-mono">{avg}</span>
      </span>
      <div className="w-px h-4 bg-white/[0.06]" />
      <span className="text-xs text-zinc-500">
        <span className="text-emerald-400 font-mono">{top}</span> candidates scored ≥85
      </span>
      <div className="w-px h-4 bg-white/[0.06]" />
      <span className="text-xs text-zinc-500">
        <span className="text-red-400 font-mono">{highRisk}</span> high AI-risk flags
      </span>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function CandidatesPage() {
  const { candidates: base, loading } = useCandidates()
  const [extra, setExtra] = useState<CandidateProfile[]>([])
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    scoreFilter: 'ALL',
    riskFilter: 'ALL',
    sortKey: 'score-desc',
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const navigate = useNavigate()

  const all = [...extra.filter(e => !base.some(b => b.id === e.id)), ...base]

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < 4) next.add(id)
      return next
    })
  }, [])

  const handleCompare = useCallback(() => {
    if (selectedIds.size < 2) return
    navigate(`/candidates/compare?ids=${[...selectedIds].join(',')}`)
  }, [selectedIds, navigate])

  const filtered = useMemo(() => {
    let result = [...all]

    // Search
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase().replace(/^@/, '')
      result = result.filter(
        c =>
          c.name.toLowerCase().includes(q) ||
          c.githubLogin.toLowerCase().includes(q)
      )
    }

    // Score range
    if (filters.scoreFilter === '85+') result = result.filter(c => c.overallScore >= 85)
    else if (filters.scoreFilter === '70-84') result = result.filter(c => c.overallScore >= 70 && c.overallScore < 85)
    else if (filters.scoreFilter === '<70') result = result.filter(c => c.overallScore < 70)

    // AI risk
    if (filters.riskFilter === 'LOW') result = result.filter(c => c.aiDetection.level === 'LOW')
    else if (filters.riskFilter === 'MEDIUM+')
      result = result.filter(c => c.aiDetection.level === 'MEDIUM' || c.aiDetection.level === 'HIGH' || c.aiDetection.level === 'VERY_HIGH')

    // Sort
    if (filters.sortKey === 'score-desc') result.sort((a, b) => b.overallScore - a.overallScore)
    else if (filters.sortKey === 'score-asc') result.sort((a, b) => a.overallScore - b.overallScore)
    else if (filters.sortKey === 'ai-risk') {
      const order: Record<string, number> = { VERY_HIGH: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
      result.sort((a, b) => (order[a.aiDetection.level] ?? 4) - (order[b.aiDetection.level] ?? 4))
    }
    else if (filters.sortKey === 'recent') result.sort((a, b) => new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime())

    return result
  }, [all, filters])

  const handleNewResult = (c: CandidateProfile) => {
    setExtra(prev => [c, ...prev.filter(x => x.id !== c.id)])
  }

  const handleStatusUpdate = useCallback((id: string, status: PipelineStatus) => {
    setExtra(prev => prev.map(c => c.id === id ? { ...c, pipelineStatus: status } : c))
  }, [])

  return (
    <PageTransition>
      <div className="page-container">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-base font-medium text-zinc-100">Candidates</h1>
            <p className="text-xs text-zinc-500 mt-0.5">AI code quality analysis · AI-generation detection · JD matching</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/candidates/ranking')}
              className="flex items-center gap-1.5 text-xs text-zinc-400 border border-white/[0.08] rounded px-3 py-1.5 hover:text-zinc-200 hover:border-white/[0.16] transition-colors"
            >
              <Trophy size={12} />
              Rankings
            </button>
            <button
              onClick={() => navigate('/candidates/batch')}
              className="flex items-center gap-1.5 text-xs text-zinc-400 border border-white/[0.08] rounded px-3 py-1.5 hover:text-zinc-200 hover:border-white/[0.16] transition-colors"
            >
              <Upload size={12} />
              Batch Upload
            </button>
            <button
              onClick={() => navigate('/candidates/compare')}
              className="flex items-center gap-1.5 text-xs text-zinc-400 border border-white/[0.08] rounded px-3 py-1.5 hover:text-zinc-200 hover:border-white/[0.16] transition-colors"
            >
              <GitCompareArrows size={12} />
              Compare
            </button>
          </div>
        </div>

        {/* Analyze input */}
        <AnalyzePanel onResult={handleNewResult} />

        {/* Stats */}
        {!loading && all.length > 0 && <StatsStrip candidates={all} />}

        {/* Filters */}
        {!loading && all.length > 0 && (
          <FilterBar
            filters={filters}
            onChange={setFilters}
            resultCount={filtered.length}
            totalCount={all.length}
          />
        )}

        {/* Compare floating bar */}
        <AnimatePresence>
          {selectedIds.size >= 2 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border border-[#7c6aff]/40 shadow-xl"
              style={{ background: 'rgba(18,16,28,0.96)', backdropFilter: 'blur(12px)' }}
            >
              <GitCompareArrows size={15} className="text-[#7c6aff]" />
              <span className="text-sm text-zinc-300">
                <span className="text-[#a78bfa] font-medium">{selectedIds.size}</span> candidates selected
              </span>
              <span className="text-zinc-700">·</span>
              <span className="text-xs text-zinc-600">{4 - selectedIds.size} more allowed</span>
              <button
                onClick={handleCompare}
                className="ml-2 px-4 py-1.5 rounded text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #7c6aff 0%, #a855f7 100%)' }}
              >
                Compare →
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={18} className="animate-spin text-zinc-600" />
          </div>
        ) : all.length === 0 ? (
          <div className="card p-12 text-center">
            <Github size={28} className="text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">No candidates analyzed yet.</p>
            <p className="text-xs text-zinc-600 mt-1">Paste a GitHub URL above to get started.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-10 text-center">
            <Search size={22} className="text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">No candidates match your filters.</p>
            <button
              onClick={() => setFilters({ search: '', scoreFilter: 'ALL', riskFilter: 'ALL', sortKey: 'score-desc' })}
              className="mt-2 text-xs text-[#7c6aff] hover:underline"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:grid-cols-3">
              {filtered.map((c, i) => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  index={i}
                  onClick={() => navigate(`/candidate/${c.id}`)}
                  onStatusUpdate={handleStatusUpdate}
                  selected={selectedIds.has(c.id)}
                  onToggleSelect={handleToggleSelect}
                />
              ))}
            </div>
          </AnimatePresence>
        )}

        {/* Quick ranking CTA */}
        {!loading && all.length >= 3 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-4"
          >
            <button
              onClick={() => navigate('/candidates/ranking')}
              className="w-full card p-3 flex items-center justify-center gap-2 hover:bg-surface-raised transition-colors text-sm text-zinc-400 hover:text-zinc-200"
            >
              <Trophy size={14} className="text-[#7c6aff]" />
              View ranked comparison table for all {all.length} candidates
              <ChevronRight size={14} />
            </button>
          </motion.div>
        )}
      </div>
    </PageTransition>
  )
}
