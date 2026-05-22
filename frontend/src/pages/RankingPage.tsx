import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, AlertTriangle, CheckCircle2, Briefcase, X, Plus, SortAsc, Layers, GitCompare } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend, ResponsiveContainer, Tooltip } from 'recharts'
import PageTransition from '../components/ui/PageTransition'
import ScoreBadge from '../components/ui/ScoreBadge'
import { useCandidates, useJDMatch, useBatchJobs } from '../hooks/useCandidates'
import type { CandidateProfile, AIRiskLevel, JobDescription } from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────
type SortKey = 'rank' | 'score' | 'aiRisk' | 'jdMatch' | 'testCoverage'
type SortDir = 'asc' | 'desc'

// ── Verdict badge ─────────────────────────────────────────────────────────────
type Verdict = 'STRONG_FIT' | 'MAYBE' | 'POOR_FIT'

const VERDICT_STYLE: Record<Verdict, { bg: string; text: string; label: string }> = {
  STRONG_FIT: { bg: 'rgba(52,211,153,0.12)', text: '#34d399', label: 'Strong Fit' },
  MAYBE:      { bg: 'rgba(251,191,36,0.12)',  text: '#fbbf24', label: 'Maybe'      },
  POOR_FIT:   { bg: 'rgba(248,113,113,0.12)', text: '#f87171', label: 'Poor Fit'   },
}

function VerdictChip({ verdict }: { verdict: Verdict }) {
  const s = VERDICT_STYLE[verdict]
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: s.bg, color: s.text }}>
      {s.label}
    </span>
  )
}

function scoreToVerdict(score: number): Verdict {
  if (score >= 70) return 'STRONG_FIT'
  if (score >= 40) return 'MAYBE'
  return 'POOR_FIT'
}

function RoleFitCell({ jdMatch, requiredSkills }: { jdMatch: { score: number; verdict?: Verdict; matchedSkills: string[]; missingSkills: string[] }; requiredSkills: string[] }) {
  const score = jdMatch.score
  const verdict = jdMatch.verdict ?? scoreToVerdict(score)
  const barColor = score >= 70 ? '#34d399' : score >= 40 ? '#fbbf24' : '#f87171'
  const top5 = requiredSkills.slice(0, 5)

  return (
    <div className="space-y-1.5 min-w-[160px]">
      {/* Score bar + number */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, background: barColor }} />
        </div>
        <span className="text-xs font-bold font-mono tabular-nums w-6 text-right" style={{ color: barColor }}>{score}</span>
      </div>
      {/* Verdict badge */}
      <VerdictChip verdict={verdict} />
      {/* Skill checklist — top 5 JD skills */}
      {top5.length > 0 && (
        <div className="flex gap-0.5 flex-wrap">
          {top5.map(skill => {
            const present = jdMatch.matchedSkills.map(s => s.toLowerCase()).includes(skill.toLowerCase())
            return (
              <span
                key={skill}
                title={`${skill}: ${present ? 'matched' : 'missing'}`}
                className="text-[9px] font-bold px-1 py-px rounded font-mono"
                style={{
                  background: present ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
                  color: present ? '#34d399' : '#f87171',
                }}
              >
                {present ? '✓' : '✗'}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── AI Risk badge (compact) ───────────────────────────────────────────────────
const RISK: Record<AIRiskLevel, { color: string; label: string }> = {
  LOW:       { color: '#34d399', label: 'Human' },
  MEDIUM:    { color: '#fbbf24', label: 'Mixed' },
  HIGH:      { color: '#f87171', label: 'AI Risk' },
  VERY_HIGH: { color: '#ef4444', label: '⚠ High' },
}

function RiskChip({ level, score }: { level: AIRiskLevel; score: number }) {
  const r = RISK[level]
  return (
    <span className="inline-flex items-center gap-1 text-xs font-mono" style={{ color: r.color }}>
      {level === 'LOW' ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
      {score}%
    </span>
  )
}

// ── JD input modal ────────────────────────────────────────────────────────────
function JDModal({ onSave, onClose }: { onSave: (jd: JobDescription) => void; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [rawText, setRawText] = useState('')

  const handleSave = () => {
    if (!rawText.trim()) return
    // Parse skills from JD text (naive but effective for demo)
    const commonSkills = [
      'Java', 'Python', 'Go', 'TypeScript', 'JavaScript', 'Rust', 'C++', 'C#', 'Ruby',
      'Spring Boot', 'React', 'Node.js', 'Django', 'FastAPI', 'Express',
      'Kafka', 'Redis', 'PostgreSQL', 'MySQL', 'MongoDB', 'Elasticsearch',
      'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure',
      'gRPC', 'GraphQL', 'REST', 'Terraform', 'Prometheus', 'Grafana',
      'JUnit', 'Jest', 'PyTest', 'OpenTelemetry',
    ]
    const lower = rawText.toLowerCase()
    const required = commonSkills.filter(s => lower.includes(s.toLowerCase()))
    const niceToHave: string[] = []

    // Split: things after "nice to have" or "bonus" go to niceToHave
    const bonusIdx = Math.max(lower.indexOf('nice to have'), lower.indexOf('bonus'), lower.indexOf('plus'))
    if (bonusIdx !== -1) {
      const bonusText = rawText.slice(bonusIdx).toLowerCase()
      commonSkills.forEach(s => {
        if (bonusText.includes(s.toLowerCase()) && required.includes(s)) {
          const idx = required.indexOf(s)
          required.splice(idx, 1)
          niceToHave.push(s)
        }
      })
    }

    onSave({
      id: `jd-${Date.now()}`,
      title: title || 'Custom Role',
      company: company || 'Company',
      requiredSkills: required.length ? required : ['JavaScript', 'React', 'Node.js'],
      niceToHaveSkills: niceToHave,
      rawText,
      createdAt: new Date().toISOString(),
    })
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="bg-[#141414] border border-white/[0.1] rounded-lg p-5 w-full max-w-lg shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Briefcase size={14} className="text-[#7c6aff]" />
            <span className="text-sm font-medium text-zinc-200">Paste Job Description</span>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors"><X size={14} /></button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Job title (e.g. Senior Backend Engineer)"
              className="bg-[#111] border border-white/[0.08] rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#7c6aff]/60"
            />
            <input
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="Company name"
              className="bg-[#111] border border-white/[0.08] rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#7c6aff]/60"
            />
          </div>
          <textarea
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            placeholder="Paste the full job description here. ReviewForge will automatically extract required skills and compute a match % for each candidate…"
            rows={8}
            className="w-full bg-[#111] border border-white/[0.08] rounded px-3 py-2.5 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-[#7c6aff]/60 resize-none leading-relaxed"
          />
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-300 px-4 py-2 transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!rawText.trim()}
            className="text-xs font-medium px-4 py-2 rounded disabled:opacity-40 transition-all"
            style={{ background: 'linear-gradient(135deg, #7c6aff, #a855f7)', color: '#fff' }}
          >
            Compute Match Scores
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Sort helper ───────────────────────────────────────────────────────────────
function sortCandidates(candidates: CandidateProfile[], key: SortKey, dir: SortDir) {
  return [...candidates].sort((a, b) => {
    let va = 0, vb = 0
    if (key === 'score' || key === 'rank') { va = a.overallScore; vb = b.overallScore }
    else if (key === 'aiRisk') { va = a.aiDetection.score; vb = b.aiDetection.score }
    else if (key === 'jdMatch') { va = a.jdMatch?.score ?? 0; vb = b.jdMatch?.score ?? 0 }
    else if (key === 'testCoverage') { va = a.metrics.testRatio; vb = b.metrics.testRatio }
    return dir === 'desc' ? vb - va : va - vb
  })
}

// ── Rank medal ────────────────────────────────────────────────────────────────
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-sm">🥇</span>
  if (rank === 2) return <span className="text-sm">🥈</span>
  if (rank === 3) return <span className="text-sm">🥉</span>
  return <span className="text-sm text-zinc-600 font-mono tabular-nums">#{rank}</span>
}

// ── Radar chart comparison ────────────────────────────────────────────────────
const CANDIDATE_COLORS = ['#7c6aff', '#34d399']

function ComparePanel({ candidates, onClose }: { candidates: CandidateProfile[]; onClose: () => void }) {
  if (candidates.length < 2) return null
  const [a, b] = candidates.slice(0, 2)

  const radarData = [
    {
      metric: 'Quality',
      [a.name]: a.overallScore,
      [b.name]: b.overallScore,
    },
    {
      metric: 'JD Match',
      [a.name]: a.jdMatch?.score ?? 0,
      [b.name]: b.jdMatch?.score ?? 0,
    },
    {
      metric: 'Tests',
      [a.name]: Math.round(a.metrics.testRatio * 100),
      [b.name]: Math.round(b.metrics.testRatio * 100),
    },
    {
      metric: 'AI Safety',
      [a.name]: 100 - a.aiDetection.score,
      [b.name]: 100 - b.aiDetection.score,
    },
    {
      metric: 'Activity',
      [a.name]: Math.min(Math.round((a.publicRepos / 50) * 100), 100),
      [b.name]: Math.min(Math.round((b.publicRepos / 50) * 100), 100),
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="card p-5 mb-4"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="label-xs">Candidate Comparison</span>
          <div className="flex items-center gap-3">
            {[a, b].map((c, i) => (
              <div key={c.id} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: CANDIDATE_COLORS[i] }} />
                <img src={c.avatarUrl} alt="" className="w-5 h-5 rounded-full" />
                <span className="text-xs text-zinc-300 font-medium">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors">
          <X size={12} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Radar chart */}
        <ResponsiveContainer width="100%" height={260}>
          <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
            <PolarGrid stroke="rgba(255,255,255,0.06)" />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fill: '#71717a', fontSize: 11 }}
            />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar name={a.name} dataKey={a.name} stroke={CANDIDATE_COLORS[0]}
              fill={CANDIDATE_COLORS[0]} fillOpacity={0.15} strokeWidth={2} />
            <Radar name={b.name} dataKey={b.name} stroke={CANDIDATE_COLORS[1]}
              fill={CANDIDATE_COLORS[1]} fillOpacity={0.15} strokeWidth={2} />
            <Tooltip
              contentStyle={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#a1a1aa' }}
            />
          </RadarChart>
        </ResponsiveContainer>

        {/* Stat table alongside */}
        <div className="flex flex-col justify-center space-y-2">
          {[
            { label: 'Quality Score', va: a.overallScore, vb: b.overallScore, unit: '' },
            { label: 'JD Match',      va: a.jdMatch?.score ?? 0, vb: b.jdMatch?.score ?? 0, unit: '' },
            { label: 'Test Coverage', va: Math.round(a.metrics.testRatio * 100), vb: Math.round(b.metrics.testRatio * 100), unit: '%' },
            { label: 'AI Safety',     va: 100 - a.aiDetection.score, vb: 100 - b.aiDetection.score, unit: '' },
            { label: 'Public Repos',  va: a.publicRepos, vb: b.publicRepos, unit: '' },
          ].map(({ label, va, vb, unit }) => {
            const aWins = va > vb, bWins = vb > va
            return (
              <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                <span className={`text-right font-mono tabular-nums font-bold ${aWins ? 'text-[#7c6aff]' : 'text-zinc-500'}`}>
                  {va}{unit}
                </span>
                <span className="text-zinc-600 text-[10px] text-center w-24">{label}</span>
                <span className={`text-left font-mono tabular-nums font-bold ${bWins ? 'text-emerald-400' : 'text-zinc-500'}`}>
                  {vb}{unit}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RankingPage() {
  const navigate = useNavigate()
  const { candidates: raw, loading } = useCandidates()
  const { activeJD, applyJD, enrichWithJD } = useJDMatch()
  const { jobs } = useBatchJobs()
  const [showJDModal, setShowJDModal] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selected, setSelected] = useState<string[]>([])
  const [showCompare, setShowCompare] = useState(false)
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null)

  const enriched = useMemo(() => enrichWithJD(raw), [raw, enrichWithJD])

  const doneBatches = useMemo(() => jobs.filter(j => j.status === 'DONE'), [jobs])

  const filtered = useMemo(() => {
    if (!activeBatchId) return enriched
    const batchIds = new Set(doneBatches.find(j => j.id === activeBatchId)?.candidateIds ?? [])
    return enriched.filter(c => batchIds.has(c.id))
  }, [enriched, activeBatchId, doneBatches])

  const sorted = useMemo(() => sortCandidates(filtered, sortKey, sortDir), [filtered, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 2 ? [...prev, id] : [prev[1], id])
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <SortAsc size={10} className="text-zinc-700" />
    return sortDir === 'desc' ? <ChevronDown size={10} className="text-[#7c6aff]" /> : <ChevronUp size={10} className="text-[#7c6aff]" />
  }

  const compareCandidates = sorted.filter(c => selected.includes(c.id))

  const TH = ({ label, k }: { label: string; k: SortKey }) => (
    <th
      className="text-left px-4 py-2.5 cursor-pointer group select-none"
      onClick={() => handleSort(k)}
    >
      <span className="flex items-center gap-1 label-xs font-medium group-hover:text-zinc-300 transition-colors">
        {label} <SortIcon k={k} />
      </span>
    </th>
  )

  return (
    <PageTransition>
      <div className="page-container">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={() => navigate('/candidates')}
                className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                <ChevronLeft size={12} /> Candidates
              </button>
              <ChevronRight size={12} className="text-zinc-700" />
              <span className="text-xs text-zinc-400">Rankings</span>
            </div>
            <h1 className="text-base font-medium text-zinc-100 flex items-center gap-2">
              <Trophy size={16} className="text-[#7c6aff]" />
              Candidate Rankings
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">{sorted.length} candidates · sortable by score, AI risk, and JD match</p>
          </div>
          <div className="flex items-center gap-2">
            {selected.length === 2 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setShowCompare(v => !v)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded border transition-colors"
                style={{
                  background: showCompare ? 'rgba(124,106,255,0.15)' : 'transparent',
                  borderColor: '#7c6aff55',
                  color: '#a78bfa',
                }}
              >
                Compare 2 candidates
              </motion.button>
            )}
            <button
              onClick={() => setShowJDModal(true)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded transition-all"
              style={{ background: 'linear-gradient(135deg, #7c6aff, #a855f7)', color: '#fff' }}
            >
              <Plus size={12} />
              {activeJD ? 'Change JD' : 'Add Job Description'}
            </button>
          </div>
        </div>

        {/* Active JD banner */}
        {activeJD && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-3 mb-4 flex items-center gap-3"
          >
            <Briefcase size={12} className="text-[#7c6aff] shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-zinc-300">{activeJD.title}</span>
              <span className="text-xs text-zinc-600 ml-2">at {activeJD.company}</span>
              <span className="text-xs text-zinc-600 ml-2">
                · Required: {activeJD.requiredSkills.join(', ')}
              </span>
            </div>
            <button onClick={() => applyJD(null)} className="text-zinc-600 hover:text-zinc-400 transition-colors shrink-0">
              <X size={12} />
            </button>
          </motion.div>
        )}

        {/* Compare panel */}
        <AnimatePresence>
          {showCompare && compareCandidates.length === 2 && (
            <ComparePanel candidates={compareCandidates} onClose={() => setShowCompare(false)} />
          )}
        </AnimatePresence>

        {/* Batch filter tabs */}
        {doneBatches.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Layers size={12} className="text-zinc-600 shrink-0" />
            <button
              onClick={() => setActiveBatchId(null)}
              className="text-xs px-3 py-1 rounded-full border transition-colors"
              style={{
                background: !activeBatchId ? 'rgba(124,106,255,0.15)' : 'transparent',
                borderColor: !activeBatchId ? '#7c6aff55' : 'rgba(255,255,255,0.08)',
                color: !activeBatchId ? '#a78bfa' : '#71717a',
              }}
            >
              All batches ({enriched.length})
            </button>
            {doneBatches.map(j => (
              <button
                key={j.id}
                onClick={() => setActiveBatchId(prev => prev === j.id ? null : j.id)}
                className="text-xs px-3 py-1 rounded-full border transition-colors"
                style={{
                  background: activeBatchId === j.id ? 'rgba(124,106,255,0.15)' : 'transparent',
                  borderColor: activeBatchId === j.id ? '#7c6aff55' : 'rgba(255,255,255,0.08)',
                  color: activeBatchId === j.id ? '#a78bfa' : '#71717a',
                }}
              >
                {j.name} ({j.candidateIds.length})
              </button>
            ))}
          </div>
        )}

        {/* Selection hint */}
        {selected.length > 0 && selected.length < 2 && (
          <p className="text-xs text-zinc-600 mb-3">Select one more candidate to compare side-by-side.</p>
        )}

        {/* Table */}
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="px-4 py-2.5 w-10" />
                <TH label="Rank" k="rank" />
                <th className="text-left px-4 py-2.5 label-xs font-medium">Candidate</th>
                <TH label="Quality Score" k="score" />
                <TH label="AI Risk" k="aiRisk" />
                {activeJD && <TH label="Role Fit" k="jdMatch" />}
                <TH label="Tests" k="testCoverage" />
                <th className="text-left px-4 py-2.5 label-xs font-medium">Top Skills</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => {
                const isSelected = selected.includes(c.id)
                return (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.04 }}
                    className={`border-b border-white/[0.03] last:border-0 cursor-pointer transition-colors ${isSelected ? 'bg-[#7c6aff]/[0.06]' : 'hover:bg-white/[0.02]'}`}
                  >
                    {/* Select checkbox */}
                    <td className="px-4 py-3" onClick={() => toggleSelect(c.id)}>
                      <div
                        className="w-4 h-4 rounded border transition-colors flex items-center justify-center"
                        style={{
                          borderColor: isSelected ? '#7c6aff' : 'rgba(255,255,255,0.12)',
                          background: isSelected ? '#7c6aff' : 'transparent',
                        }}
                      >
                        {isSelected && <span className="text-white text-xs leading-none">✓</span>}
                      </div>
                    </td>

                    {/* Rank */}
                    <td className="px-4 py-3" onClick={() => navigate(`/candidate/${c.id}`)}>
                      <RankBadge rank={i + 1} />
                    </td>

                    {/* Candidate */}
                    <td className="px-4 py-3" onClick={() => navigate(`/candidate/${c.id}`)}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img src={c.avatarUrl} alt="" className="w-7 h-7 rounded-full shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-zinc-200 font-medium truncate">{c.name}</p>
                          <p className="text-xs text-zinc-600 font-mono truncate">@{c.githubLogin}</p>
                        </div>
                      </div>
                    </td>

                    {/* Score */}
                    <td className="px-4 py-3" onClick={() => navigate(`/candidate/${c.id}`)}>
                      <ScoreBadge score={c.overallScore} />
                    </td>

                    {/* AI Risk */}
                    <td className="px-4 py-3" onClick={() => navigate(`/candidate/${c.id}`)}>
                      <RiskChip level={c.aiDetection.level} score={c.aiDetection.score} />
                    </td>

                    {/* Role Fit */}
                    {activeJD && (
                      <td className="px-4 py-3" onClick={() => navigate(`/candidate/${c.id}`)}>
                        {c.jdMatch
                          ? <RoleFitCell jdMatch={c.jdMatch} requiredSkills={activeJD.requiredSkills} />
                          : <span className="text-xs text-zinc-700">—</span>
                        }
                      </td>
                    )}

                    {/* Tests */}
                    <td className="px-4 py-3" onClick={() => navigate(`/candidate/${c.id}`)}>
                      <span
                        className="text-xs font-mono"
                        style={{ color: c.metrics.testRatio > 0.6 ? '#34d399' : c.metrics.testRatio > 0.4 ? '#fbbf24' : '#f87171' }}
                      >
                        {(c.metrics.testRatio * 100).toFixed(0)}%
                      </span>
                    </td>

                    {/* Skills */}
                    <td className="px-4 py-3" onClick={() => navigate(`/candidate/${c.id}`)}>
                      <div className="flex flex-wrap gap-1">
                        {c.skills.slice(0, 3).map(s => (
                          <span key={s.name} className="text-xs text-zinc-500 bg-white/[0.04] px-1.5 py-0.5 rounded">{s.name}</span>
                        ))}
                      </div>
                    </td>

                    {/* Compare + Arrow */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          title="Open in Compare"
                          onClick={e => { e.stopPropagation(); navigate(`/candidates/compare?ids=${c.id}`) }}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 transition-all text-zinc-600 hover:text-[#7c6aff] hover:bg-[#7c6aff]/10"
                        >
                          <GitCompare size={13} />
                        </button>
                        <ChevronRight
                          size={14}
                          className="text-zinc-700 group-hover:text-zinc-500 transition-colors cursor-pointer"
                          onClick={() => navigate(`/candidate/${c.id}`)}
                        />
                      </div>
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 text-xs text-zinc-600 flex-wrap">
          <span className="flex items-center gap-1.5"><CheckCircle2 size={11} className="text-emerald-400" /> Low AI risk — likely human-written</span>
          <span className="flex items-center gap-1.5"><AlertTriangle size={11} className="text-amber-400" /> Medium risk — verify in interview</span>
          <span className="flex items-center gap-1.5"><AlertTriangle size={11} className="text-red-400" /> High risk — portfolio may be AI-generated</span>
        </div>
      </div>

      {/* JD Modal */}
      <AnimatePresence>
        {showJDModal && (
          <JDModal
            onSave={(jd) => applyJD(jd)}
            onClose={() => setShowJDModal(false)}
          />
        )}
      </AnimatePresence>
    </PageTransition>
  )
}
