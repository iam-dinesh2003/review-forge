import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, ExternalLink, AlertTriangle, CheckCircle2, GitCommit, Users, Code2, FileCode2, TestTube2, Zap, GitPullRequest, ChevronDown, ChevronUp, TrendingUp, XCircle, BookOpen, MessageSquare, Activity, Award, StickyNote, Clock, Printer, Send, Trash2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import PageTransition from '../components/ui/PageTransition'
import { useCandidate, useNotes } from '../hooks/useCandidates'
import { getScoreColor, getScoreLabel, timeAgo } from '../utils'
import type { AIRiskLevel, SkillSignal, CandidatePRAnalysis, ScoreBreakdown, CommitConsistency, InterviewQuestion, AuditEvent } from '../types'

// ── Score arc (reused pattern) ────────────────────────────────────────────────
function ScoreArc({ score, label, size = 96 }: { score: number; label?: string; size?: number }) {
  const r = (size / 2) - 6
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - score / 100)
  const color = getScoreColor(score)
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative inline-flex items-center justify-center">
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
          <motion.circle
            cx={size/2} cy={size/2} r={r}
            fill="none" stroke={color} strokeWidth={5}
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.1, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.1 }}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-light tabular-nums" style={{ color }}>{score}</span>
          <span className="text-2xs text-zinc-600 uppercase tracking-wider">{getScoreLabel(score)}</span>
        </div>
      </div>
      {label && <span className="text-xs text-zinc-500">{label}</span>}
    </div>
  )
}

// ── AI Risk colors ────────────────────────────────────────────────────────────
const RISK_COLOR: Record<AIRiskLevel, string> = {
  LOW: '#34d399',
  MEDIUM: '#fbbf24',
  HIGH: '#f87171',
  VERY_HIGH: '#ef4444',
}

// ── Metric bar ────────────────────────────────────────────────────────────────
function MetricBar({ label, value, max = 1, format = (v: number) => (v * 100).toFixed(0) + '%', color = '#7c6aff' }: {
  label: string; value: number; max?: number; format?: (v: number) => string; color?: string
}) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">{label}</span>
        <span className="text-xs font-mono text-zinc-300">{format(value)}</span>
      </div>
      <div className="h-1.5 bg-surface-raised rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

// ── Skill level pill ──────────────────────────────────────────────────────────
const LEVEL_COLOR: Record<SkillSignal['level'], { text: string; bg: string; border: string }> = {
  EXPERT:     { text: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.25)' },
  PROFICIENT: { text: '#67e8f9', bg: 'rgba(103,232,249,0.08)', border: 'rgba(103,232,249,0.25)' },
  FAMILIAR:   { text: '#71717a', bg: 'rgba(113,113,122,0.08)', border: 'rgba(113,113,122,0.2)'  },
}

// ── PR Analysis section ───────────────────────────────────────────────────────

const SEV_STYLE = {
  CRITICAL: { bg: 'rgba(239,68,68,0.1)', text: '#f87171', border: 'rgba(248,113,113,0.35)' },
  WARNING:  { bg: 'rgba(245,158,11,0.1)', text: '#fbbf24', border: 'rgba(251,191,36,0.35)' },
  INFO:     { bg: 'rgba(99,102,241,0.1)', text: '#818cf8', border: 'rgba(129,140,248,0.35)' },
} as const

const CAT_LABEL: Record<string, string> = {
  BUG: '🐛 Bug',
  SECURITY: '🔒 Security',
  PERFORMANCE: '⚡ Performance',
  CODE_QUALITY: '✨ Quality',
  BEST_PRACTICE: '📋 Best Practice',
}

function PRAnalysisSection({ prs }: { prs?: CandidatePRAnalysis[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set([prs?.[0]?.prNumber ?? -1]))

  if (!prs || prs.length === 0) return null

  const toggle = (n: number) =>
    setExpanded(prev => { const s = new Set(prev); s.has(n) ? s.delete(n) : s.add(n); return s })

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-4">
        <GitPullRequest size={13} className="text-zinc-500" />
        <p className="label-xs">PR Analysis</p>
        <span className="text-xs text-zinc-600">{prs.length} pull request{prs.length > 1 ? 's' : ''} analyzed</span>
      </div>
      <div className="space-y-3">
        {prs.map((pr, idx) => {
          const isOpen = expanded.has(pr.prNumber)
          const critCount = pr.comments.filter(c => c.severity === 'CRITICAL').length
          const warnCount = pr.comments.filter(c => c.severity === 'WARNING').length
          const infoCount = pr.comments.filter(c => c.severity === 'INFO').length
          const color = getScoreColor(pr.overallScore)

          return (
            <motion.div
              key={pr.prNumber}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
              className="border border-white/[0.07] rounded-lg overflow-hidden"
            >
              {/* PR header */}
              <button
                onClick={() => toggle(pr.prNumber)}
                className="w-full flex items-start gap-3 p-3.5 hover:bg-surface-raised transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-xs font-mono text-zinc-600">#{pr.prNumber}</span>
                    <span className="text-xs text-zinc-500 font-mono">{pr.repo}</span>
                    <span className="text-xs text-emerald-500 font-mono">+{pr.additions}</span>
                    <span className="text-xs text-red-400 font-mono">-{pr.deletions}</span>
                    <span className="text-xs text-zinc-700">{pr.filesChanged} files</span>
                  </div>
                  <p className="text-sm text-zinc-200 leading-snug mb-2 font-medium">{pr.title}</p>
                  <p className="text-xs text-zinc-500 leading-relaxed">{pr.summary}</p>
                  <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                    {critCount > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full border bg-red-500/10 text-red-400 border-red-400/30 font-medium">
                        {critCount} critical
                      </span>
                    )}
                    {warnCount > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-400/30 font-medium">
                        {warnCount} warning{warnCount > 1 ? 's' : ''}
                      </span>
                    )}
                    {infoCount > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full border bg-indigo-500/10 text-indigo-400 border-indigo-400/30 font-medium">
                        {infoCount} suggestion{infoCount > 1 ? 's' : ''}
                      </span>
                    )}
                    {pr.comments.length === 0 && (
                      <span className="text-xs text-zinc-600">No issues found</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0 ml-2">
                  <span className="text-xl font-light tabular-nums" style={{ color }}>{pr.overallScore}</span>
                  <span className="text-2xs text-zinc-600 uppercase tracking-wider">{getScoreLabel(pr.overallScore)}</span>
                  {isOpen
                    ? <ChevronUp size={14} className="text-zinc-600 mt-1" />
                    : <ChevronDown size={14} className="text-zinc-600 mt-1" />}
                </div>
              </button>

              {/* Expanded: inline comments */}
              <AnimatePresence>
                {isOpen && pr.comments.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-white/[0.06] p-3 space-y-3">
                      {pr.comments.map((comment, ci) => {
                        const sev = SEV_STYLE[comment.severity]
                        const shortFile = comment.file.split('/').slice(-2).join('/')
                        return (
                          <motion.div
                            key={ci}
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: ci * 0.05 }}
                            className="rounded-lg border border-white/[0.06] overflow-hidden"
                          >
                            {/* Comment header row */}
                            <div className="flex items-center gap-2 px-3 py-2 bg-[#0e0e0e] border-b border-white/[0.05] flex-wrap">
                              <span
                                className="text-xs px-2 py-0.5 rounded border font-semibold uppercase tracking-wide"
                                style={{ background: sev.bg, color: sev.text, borderColor: sev.border }}
                              >
                                {comment.severity}
                              </span>
                              <span className="text-xs text-zinc-500">{CAT_LABEL[comment.category]}</span>
                              <span className="ml-auto text-xs font-mono text-zinc-600">
                                {shortFile}:{comment.line}
                              </span>
                            </div>
                            {/* Comment body */}
                            <div className="p-3 space-y-2.5">
                              <p className="text-xs text-zinc-300 leading-relaxed">{comment.message}</p>
                              {comment.suggestion && (
                                <div>
                                  <p className="text-2xs text-zinc-600 uppercase tracking-wider mb-1.5">Suggested Fix</p>
                                  <pre
                                    className="text-xs font-mono bg-[#080808] border border-white/[0.06] rounded-md p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed"
                                    style={{ color: '#86efac' }}
                                  >{comment.suggestion}</pre>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ── Score Breakdown section ───────────────────────────────────────────────────
const FACTOR_COLOR: Record<string, string> = {
  'Code Quality':        '#7c6aff',
  'Testing':             '#34d399',
  'Error Handling':      '#fbbf24',
  'Architecture & Design': '#67e8f9',
  'Security Awareness':  '#f87171',
}

function ScoreBreakdownSection({ breakdown }: { breakdown?: ScoreBreakdown }) {
  if (!breakdown) return null

  const skipped = breakdown.reposSkipped ?? []
  const factors = breakdown.scoreFactors ?? []
  const steps   = breakdown.improvementPlan ?? []
  const blocked = breakdown.whatIsHoldingBack ?? []

  return (
    <div className="space-y-3">

      {/* Score Factors */}
      {factors.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={13} className="text-zinc-500" />
            <p className="label-xs">Score Breakdown</p>
            <span className="ml-auto text-xs text-zinc-600">
              {breakdown.reposAnalyzed?.length ?? 0} repo{breakdown.reposAnalyzed?.length !== 1 ? 's' : ''} analyzed
              {skipped.length > 0 && `, ${skipped.length} filtered`}
            </span>
          </div>
          <div className="space-y-3.5">
            {factors.map((f, i) => {
              const color = FACTOR_COLOR[f.factor] ?? '#71717a'
              const pct = Math.round((f.score / f.maxScore) * 100)
              return (
                <motion.div
                  key={f.factor}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-zinc-300">{f.factor}</span>
                    <span className="text-xs font-mono" style={{ color }}>{f.score}<span className="text-zinc-600">/{f.maxScore}</span></span>
                  </div>
                  <div className="h-1.5 bg-surface-raised rounded-full overflow-hidden mb-1.5">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, delay: i * 0.07 + 0.1, ease: 'easeOut' }}
                    />
                  </div>
                  <p className="text-xs text-zinc-600 leading-relaxed">{f.notes}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}

      {/* What's holding back */}
      {blocked.length > 0 && (
        <div className="card p-4 border border-amber-500/20">
          <div className="flex items-center gap-2 mb-3">
            <XCircle size={13} className="text-amber-400" />
            <p className="label-xs text-amber-400">What's Holding This Score Back</p>
          </div>
          <ul className="space-y-2.5">
            {blocked.map((b, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className="flex items-start gap-2.5 text-xs text-zinc-300 leading-relaxed"
              >
                <span className="w-4 h-4 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-2xs flex items-center justify-center shrink-0 mt-0.5 font-mono">
                  {i + 1}
                </span>
                {b}
              </motion.li>
            ))}
          </ul>
        </div>
      )}

      {/* Improvement plan */}
      {steps.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen size={13} className="text-zinc-500" />
            <p className="label-xs">Improvement Roadmap</p>
            <span className="ml-auto text-xs text-zinc-600">{steps.length} steps</span>
          </div>
          <div className="space-y-3">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="flex gap-3 p-3 rounded-lg bg-[#0e0e0e] border border-white/[0.06]"
              >
                <div className="w-6 h-6 rounded-full bg-[#7c6aff]/15 border border-[#7c6aff]/30 text-[#7c6aff] text-xs flex items-center justify-center shrink-0 font-mono font-medium">
                  {step.priority}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-200 leading-relaxed font-medium mb-1">{step.action}</p>
                  <p className="text-xs text-zinc-500 leading-relaxed mb-2">{step.why}</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-emerald-400 font-medium">{step.impact}</span>
                    <span className="text-xs text-zinc-600 flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-zinc-600" />
                      {step.timeframe}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Skipped repos */}
      {skipped.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <XCircle size={13} className="text-zinc-600" />
            <p className="label-xs">Filtered Repos ({skipped.length})</p>
            <span className="ml-auto text-xs text-zinc-600">not counted toward score</span>
          </div>
          <div className="space-y-2">
            {skipped.map((r, i) => (
              <div key={i} className="flex items-start gap-2.5 py-1.5 border-b border-white/[0.04] last:border-0">
                <span className="text-xs font-mono text-zinc-500 shrink-0">{r.name}</span>
                <span className="text-xs text-zinc-700 leading-relaxed">{r.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Commit consistency section ────────────────────────────────────────────────
function CommitConsistencySection({ data }: { data?: CommitConsistency }) {
  if (!data || data.totalCommits === 0) return null
  const burstPct = Math.round(data.recentBurstRatio * 100)
  const consistPct = Math.round(data.consistencyScore * 100)

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={13} className="text-zinc-500" />
        <p className="label-xs">Commit Consistency</p>
        {data.likelySurgedBeforeApplying && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full border border-amber-500/30 text-amber-400 bg-amber-500/10 flex items-center gap-1">
            <AlertTriangle size={10} /> Surge detected
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-[#111] rounded p-3 border border-white/[0.06] text-center">
          <p className="text-2xs text-zinc-600 mb-1">Total Commits</p>
          <p className="text-sm font-mono text-zinc-300">{data.totalCommits}</p>
          <p className="text-2xs text-zinc-700 mt-0.5">last 6 months</p>
        </div>
        <div className="bg-[#111] rounded p-3 border border-white/[0.06] text-center">
          <p className="text-2xs text-zinc-600 mb-1">Active Weeks</p>
          <p className="text-sm font-mono text-zinc-300">{data.activeWeeks}<span className="text-zinc-600">/26</span></p>
          <p className="text-2xs text-zinc-700 mt-0.5">of 6 months</p>
        </div>
        <div className="bg-[#111] rounded p-3 border border-white/[0.06] text-center">
          <p className="text-2xs text-zinc-600 mb-1">Recent Burst</p>
          <p className="text-sm font-mono" style={{ color: burstPct > 35 ? '#f87171' : '#a1a1aa' }}>{burstPct}%</p>
          <p className="text-2xs text-zinc-700 mt-0.5">in last 14 days</p>
        </div>
      </div>

      <div className="space-y-2.5">
        <div>
          <div className="flex justify-between text-xs text-zinc-600 mb-1">
            <span>Consistency score</span>
            <span className="font-mono">{consistPct}%</span>
          </div>
          <div className="h-1.5 bg-surface-raised rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: consistPct >= 60 ? '#34d399' : consistPct >= 35 ? '#fbbf24' : '#f87171' }}
              initial={{ width: 0 }}
              animate={{ width: `${consistPct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </div>
        {data.likelySurgedBeforeApplying && (
          <p className="text-xs text-amber-400 leading-relaxed">
            {burstPct}% of commits happened in the last 14 days — pattern suggests coding activity surged near application date.
            Ask about their typical development cadence in the interview.
          </p>
        )}
        {!data.likelySurgedBeforeApplying && consistPct >= 60 && (
          <p className="text-xs text-emerald-400 leading-relaxed">
            Active {data.activeWeeks} of the last 26 weeks — consistent long-term coding habit.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Interview questions section ────────────────────────────────────────────────
const DIFF_STYLE: Record<InterviewQuestion['difficulty'], { bg: string; text: string; border: string }> = {
  EASY:   { bg: 'rgba(52,211,153,0.08)',  text: '#34d399', border: 'rgba(52,211,153,0.25)'  },
  MEDIUM: { bg: 'rgba(251,191,36,0.08)',  text: '#fbbf24', border: 'rgba(251,191,36,0.25)'  },
  HARD:   { bg: 'rgba(248,113,113,0.08)', text: '#f87171', border: 'rgba(248,113,113,0.25)' },
}
const CAT_ICON: Record<InterviewQuestion['category'], string> = {
  TECHNICAL:   '⚙️',
  BEHAVIORAL:  '🧠',
  CODE_REVIEW: '🔍',
}

function InterviewQuestionsSection({ questions }: { questions?: InterviewQuestion[] }) {
  const [copied, setCopied] = useState<number | null>(null)
  if (!questions || questions.length === 0) return null

  const handleCopy = (q: string, i: number) => {
    navigator.clipboard.writeText(q)
    setCopied(i)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare size={13} className="text-zinc-500" />
        <p className="label-xs">Targeted Interview Questions</p>
        <span className="ml-auto text-xs text-zinc-600">{questions.length} questions • based on code gaps</span>
      </div>
      <div className="space-y-3">
        {questions.map((q, i) => {
          const d = DIFF_STYLE[q.difficulty]
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className="p-3 rounded-lg bg-[#0e0e0e] border border-white/[0.06] group"
            >
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs">{CAT_ICON[q.category]}</span>
                <span className="text-2xs text-zinc-600 uppercase tracking-wider">{q.category.replace('_', ' ')}</span>
                <span
                  className="text-2xs px-1.5 py-0.5 rounded border"
                  style={{ background: d.bg, color: d.text, borderColor: d.border }}
                >
                  {q.difficulty}
                </span>
                <span className="text-2xs text-zinc-700 ml-auto truncate max-w-[180px]">targets: {q.targetedAt}</span>
              </div>
              <p className="text-xs text-zinc-200 leading-relaxed mb-2">{q.question}</p>
              <button
                onClick={() => handleCopy(q.question, i)}
                className="text-2xs text-zinc-600 hover:text-zinc-400 transition-colors opacity-0 group-hover:opacity-100"
              >
                {copied === i ? '✓ Copied' : 'Copy question'}
              </button>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ── Notes section ─────────────────────────────────────────────────────────────
function NotesSection({ candidateId }: { candidateId: string }) {
  const { notes, saving, addNote, deleteNote } = useNotes(candidateId)
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    await addNote(text.trim())
    setText('')
    textareaRef.current?.focus()
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-4">
        <StickyNote size={13} className="text-zinc-500" />
        <p className="label-xs">Team Notes</p>
        <span className="ml-auto text-xs text-zinc-600">{notes.length} note{notes.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Add note form */}
      <form onSubmit={handleSubmit} className="mb-4">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e as any) }}
            rows={2}
            placeholder="Add a private note… (⌘↵ to submit)"
            className="flex-1 bg-[#111] border border-white/[0.08] rounded px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#7c6aff]/60 transition-colors resize-none"
          />
          <button
            type="submit"
            disabled={saving || !text.trim()}
            className="flex items-center gap-1 px-3 py-2 rounded text-xs font-medium transition-all disabled:opacity-40 shrink-0"
            style={{ background: 'linear-gradient(135deg, #7c6aff 0%, #a855f7 100%)', color: '#fff' }}
          >
            <Send size={11} />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      {/* Notes list */}
      {notes.length === 0 ? (
        <p className="text-xs text-zinc-700 text-center py-4">No notes yet. Add one above.</p>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {notes.map(note => (
              <motion.div
                key={note.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="group flex items-start gap-2.5 p-3 rounded-lg bg-[#0e0e0e] border border-white/[0.06]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-300 leading-relaxed">{note.text}</p>
                  <p className="text-2xs text-zinc-700 mt-1">{timeAgo(note.createdAt)}</p>
                </div>
                <button
                  onClick={() => deleteNote(note.id)}
                  className="shrink-0 text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 mt-0.5"
                >
                  <Trash2 size={11} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

// ── Audit trail section ───────────────────────────────────────────────────────
const AUDIT_ICON: Record<string, string> = {
  ANALYZED:       '🔍',
  STATUS_CHANGED: '🔄',
  JD_MATCHED:     '📋',
  NOTE_ADDED:     '📝',
  NOTE_DELETED:   '🗑️',
  BATCH_STARTED:  '⚙️',
  BATCH_DONE:     '✅',
}

function AuditTrailSection({ candidateId }: { candidateId: string }) {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/candidates/${candidateId}/audit`)
      .then(r => r.json())
      .then(data => { setEvents(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [candidateId])

  if (loading || events.length === 0) return null

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={13} className="text-zinc-500" />
        <p className="label-xs">Audit Trail</p>
        <span className="ml-auto text-xs text-zinc-600">{events.length} events</span>
      </div>
      <div className="relative pl-4">
        {/* Vertical line */}
        <div className="absolute left-1.5 top-1 bottom-1 w-px bg-white/[0.06]" />
        <div className="space-y-3">
          {events.map((ev, i) => (
            <motion.div
              key={ev.id}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-start gap-2.5"
            >
              {/* Dot */}
              <div className="w-2 h-2 rounded-full bg-[#7c6aff]/40 border border-[#7c6aff]/60 shrink-0 mt-1 -ml-4" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs">{AUDIT_ICON[ev.eventType] ?? '•'}</span>
                  <span className="text-xs text-zinc-300">{ev.description}</span>
                </div>
                <p className="text-2xs text-zinc-700 mt-0.5">{timeAgo(ev.createdAt)}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { candidate, loading } = useCandidate(id ?? '')

  if (loading) {
    return (
      <PageTransition>
        <div className="page-container flex items-center justify-center min-h-screen">
          <p className="text-sm text-zinc-500">Loading candidate profile…</p>
        </div>
      </PageTransition>
    )
  }

  if (!candidate) {
    return (
      <PageTransition>
        <div className="page-container flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-sm text-zinc-500">Candidate not found.</p>
            <button onClick={() => navigate('/candidates')} className="mt-3 text-xs text-accent hover:underline">← Candidates</button>
          </div>
        </div>
      </PageTransition>
    )
  }

  const ai = candidate.aiDetection
  const riskColor = RISK_COLOR[ai.level]

  return (
    <PageTransition>
      <div className="page-container">
        {/* Back */}
        <button
          onClick={() => navigate('/candidates')}
          className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors mb-5"
        >
          <ChevronLeft size={12} /> Candidates
        </button>

        {/* Header */}
        <div className="flex flex-wrap items-start gap-4 mb-6">
          <img src={candidate.avatarUrl} alt="" className="w-14 h-14 rounded-full shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-semibold text-zinc-100">{candidate.name}</h1>
              <span className="text-sm text-zinc-600 font-mono">@{candidate.githubLogin}</span>
              {candidate.location && <span className="text-xs text-zinc-600">{candidate.location}</span>}
            </div>
            <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">{candidate.bio}</p>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-600 flex-wrap">
              <span className="flex items-center gap-1"><FileCode2 size={11} />{candidate.publicRepos} repos</span>
              <span className="flex items-center gap-1"><Users size={11} />{candidate.followers} followers</span>
              <span>Analyzed {timeAgo(candidate.analyzedAt)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 text-xs text-zinc-500 border border-white/[0.08] rounded px-3 py-1.5 hover:text-zinc-300 hover:border-white/[0.16] transition-colors print:hidden"
              title="Export as PDF"
            >
              <Printer size={12} /> PDF
            </button>
            <a
              href={candidate.githubUrl}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-zinc-500 border border-white/[0.08] rounded px-3 py-1.5 hover:text-zinc-300 hover:border-white/[0.16] transition-colors"
            >
              <ExternalLink size={12} /> GitHub
            </a>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          {/* Left: main content */}
          <div className="flex-1 min-w-0 space-y-4 w-full">
            {/* AI Summary */}
            <div className="card p-4">
              <p className="label-xs mb-2">AI Analysis Summary</p>
              <p className="text-sm text-zinc-300 leading-relaxed">{candidate.summary}</p>
            </div>

            {/* Score Breakdown */}
            <ScoreBreakdownSection breakdown={candidate.scoreBreakdown} />

            {/* Strengths & Concerns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="card p-4">
                <p className="label-xs mb-2.5 flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-emerald-500" /> Strengths
                </p>
                <ul className="space-y-2">
                  {candidate.strengths.map((s, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.07 }}
                      className="flex items-start gap-2 text-xs text-zinc-400 leading-relaxed"
                    >
                      <span className="w-1 h-1 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                      {s}
                    </motion.li>
                  ))}
                </ul>
              </div>
              <div className="card p-4">
                <p className="label-xs mb-2.5 flex items-center gap-1.5">
                  <AlertTriangle size={12} className="text-amber-500" /> Concerns
                </p>
                <ul className="space-y-2">
                  {candidate.concerns.map((c, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.07 }}
                      className="flex items-start gap-2 text-xs text-zinc-400 leading-relaxed"
                    >
                      <span className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                      {c}
                    </motion.li>
                  ))}
                </ul>
              </div>
            </div>

            {/* AI Detection deep dive */}
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-4">
                <Zap size={13} className="text-zinc-500" />
                <p className="label-xs">AI-Generation Detection</p>
                <span
                  className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full border"
                  style={{ color: riskColor, borderColor: riskColor + '44', background: riskColor + '14' }}
                >
                  {ai.level.replace('_', ' ')} RISK · {ai.score}% confidence
                </span>
              </div>

              {/* Score bar */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-zinc-600 mb-1">
                  <span>Human ← → AI-generated</span>
                  <span className="font-mono">{ai.score}%</span>
                </div>
                <div className="h-2 bg-surface-raised rounded-full overflow-hidden relative">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: `linear-gradient(90deg, #34d399, #fbbf24 50%, #ef4444)`, opacity: 0.9 }}
                    initial={{ clipPath: 'inset(0 100% 0 0)' }}
                    animate={{ clipPath: `inset(0 ${100 - ai.score}% 0 0)` }}
                    transition={{ duration: 1, delay: 0.2 }}
                  />
                  {/* Marker */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white/80 rounded-full"
                    style={{ left: `${ai.score}%` }}
                  />
                </div>
              </div>

              {/* Signals */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-[#111] rounded p-3 border border-white/[0.06]">
                  <p className="text-2xs text-zinc-600 mb-1">Burst Commits</p>
                  <p className="text-sm font-mono" style={{ color: ai.commitBurstRatio > 0.3 ? '#f87171' : '#a1a1aa' }}>
                    {(ai.commitBurstRatio * 100).toFixed(0)}%
                  </p>
                  <p className="text-2xs text-zinc-700 mt-0.5">of commits ({'>'} 500 lines)</p>
                </div>
                <div className="bg-[#111] rounded p-3 border border-white/[0.06]">
                  <p className="text-2xs text-zinc-600 mb-1">Boilerplate</p>
                  <p className="text-sm font-mono" style={{ color: ai.boilerplateRatio > 0.3 ? '#f87171' : '#a1a1aa' }}>
                    {(ai.boilerplateRatio * 100).toFixed(0)}%
                  </p>
                  <p className="text-2xs text-zinc-700 mt-0.5">matches AI templates</p>
                </div>
                <div className="bg-[#111] rounded p-3 border border-white/[0.06]">
                  <p className="text-2xs text-zinc-600 mb-1">Doc Uniformity</p>
                  <p className="text-sm font-mono" style={{ color: ai.docUniformity > 0.6 ? '#f87171' : '#a1a1aa' }}>
                    {(ai.docUniformity * 100).toFixed(0)}%
                  </p>
                  <p className="text-2xs text-zinc-700 mt-0.5">across all projects</p>
                </div>
              </div>

              {/* Indicators */}
              <div className="space-y-1.5">
                <p className="text-2xs text-zinc-600 uppercase tracking-wider">Evidence</p>
                {ai.indicators.map((ind, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                    <span className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: riskColor }} />
                    {ind}
                  </div>
                ))}
              </div>
            </div>

            {/* Skills */}
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Code2 size={13} className="text-zinc-500" />
                <p className="label-xs">Detected Skills</p>
              </div>
              <div className="space-y-2">
                {candidate.skills.map((s, i) => {
                  const lc = LEVEL_COLOR[s.level]
                  return (
                    <motion.div
                      key={s.name}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-3"
                    >
                      <span className="w-28 text-xs text-zinc-300 shrink-0">{s.name}</span>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded border shrink-0"
                        style={{ color: lc.text, background: lc.bg, borderColor: lc.border }}
                      >
                        {s.level}
                      </span>
                      <div className="flex-1 h-1 bg-surface-raised rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: lc.text }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(s.evidenceCount / 1.5, 100)}%` }}
                          transition={{ duration: 0.7, delay: i * 0.05 + 0.2 }}
                        />
                      </div>
                      <span className="text-2xs text-zinc-600 font-mono w-12 text-right shrink-0">{s.evidenceCount} files</span>
                    </motion.div>
                  )
                })}
              </div>
            </div>

            {/* Commit Consistency */}
            <CommitConsistencySection data={candidate.commitConsistency} />

            {/* Interview Questions */}
            <InterviewQuestionsSection questions={candidate.interviewQuestions} />

            {/* PR Analysis */}
            <PRAnalysisSection prs={candidate.prAnalysis} />

            {/* Team Notes */}
            <NotesSection candidateId={candidate.id} />

            {/* Audit Trail */}
            <AuditTrailSection candidateId={candidate.id} />
          </div>

          {/* Right sidebar */}
          <div className="w-full lg:w-64 shrink-0 lg:sticky top-6 space-y-3">
            {/* Score + percentile */}
            <div className="card p-4 flex flex-col items-center gap-3">
              <p className="label-xs self-start">Code Quality</p>
              <ScoreArc score={candidate.overallScore} />
              {candidate.percentileRank > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <Award size={11} className="text-[#7c6aff]" />
                  Top <span className="text-zinc-300 font-medium">{100 - candidate.percentileRank}%</span> of all analyzed
                </div>
              )}
            </div>

            {/* Languages */}
            <div className="card p-4 space-y-3">
              <p className="label-xs">Languages</p>
              {candidate.topLanguages.map(l => (
                <MetricBar
                  key={l.name}
                  label={l.name}
                  value={l.percentage}
                  max={100}
                  format={v => `${v}%`}
                  color="#7c6aff"
                />
              ))}
            </div>

            {/* Code metrics */}
            <div className="card p-4 space-y-3">
              <p className="label-xs flex items-center gap-1.5"><TestTube2 size={12} />Code Metrics</p>
              <MetricBar
                label="Test Coverage"
                value={candidate.metrics.testRatio}
                max={1}
                format={v => (v * 100).toFixed(0) + '%'}
                color={candidate.metrics.testRatio > 0.6 ? '#34d399' : candidate.metrics.testRatio > 0.4 ? '#fbbf24' : '#f87171'}
              />
              <MetricBar
                label="Comment Ratio"
                value={candidate.metrics.commentRatio}
                max={1}
                format={v => (v * 100).toFixed(0) + '%'}
                color="#67e8f9"
              />
              <MetricBar
                label="Duplication"
                value={candidate.metrics.duplicateRatio}
                max={0.4}
                format={v => (v * 100).toFixed(0) + '%'}
                color={candidate.metrics.duplicateRatio < 0.1 ? '#34d399' : '#fbbf24'}
              />
              <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                <span className="text-xs text-zinc-500">Avg Complexity</span>
                <span className="text-xs font-mono text-zinc-300">{candidate.metrics.avgComplexity.toFixed(1)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Avg File Size</span>
                <span className="text-xs font-mono text-zinc-300">{candidate.metrics.avgFileLoc} LOC</span>
              </div>
            </div>

            {/* JD match (if available) */}
            {candidate.jdMatch && (
              <div className="card p-4 space-y-2.5">
                <p className="label-xs">JD Match</p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-light tabular-nums" style={{ color: getScoreColor(candidate.jdMatch.score) }}>
                    {candidate.jdMatch.score}%
                  </span>
                  <span className="text-xs text-zinc-500">match</span>
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">{candidate.jdMatch.summary}</p>
                {candidate.jdMatch.missingSkills.length > 0 && (
                  <div>
                    <p className="text-2xs text-zinc-600 mb-1">Missing</p>
                    <div className="flex flex-wrap gap-1">
                      {candidate.jdMatch.missingSkills.map(s => (
                        <span key={s} className="text-xs px-1.5 py-0.5 rounded border border-red-500/30 text-red-400 bg-red-500/08">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* GitHub stats */}
            <div className="card px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500 flex items-center gap-1.5"><GitCommit size={11} />Repositories</span>
                <span className="text-xs font-mono text-zinc-300">{candidate.publicRepos}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500 flex items-center gap-1.5"><Users size={11} />Followers</span>
                <span className="text-xs font-mono text-zinc-300">{candidate.followers}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
