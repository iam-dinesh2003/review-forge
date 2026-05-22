import { useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Upload, FileText, CheckCircle2, Loader2, AlertTriangle, Trophy, Play, X, BarChart2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import PageTransition from '../components/ui/PageTransition'
import ScoreBadge from '../components/ui/ScoreBadge'
import { useBatchJobs, useCandidates } from '../hooks/useCandidates'
import { timeAgo, getScoreColor } from '../utils'
import type { BatchJob, CandidateProfile, AIRiskLevel } from '../types'

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<BatchJob['status'], { text: string; bg: string; icon: React.ElementType }> = {
  QUEUED:  { text: '#a1a1aa', bg: 'rgba(161,161,170,0.1)', icon: Loader2 },
  RUNNING: { text: '#fbbf24', bg: 'rgba(251,191,36,0.1)', icon: Loader2 },
  DONE:    { text: '#34d399', bg: 'rgba(52,211,153,0.1)', icon: CheckCircle2 },
  FAILED:  { text: '#f87171', bg: 'rgba(248,113,113,0.1)', icon: AlertTriangle },
}

function StatusBadge({ status }: { status: BatchJob['status'] }) {
  const s = STATUS_STYLE[status]
  const Icon = s.icon
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
      style={{ color: s.text, background: s.bg }}
    >
      <Icon size={10} className={status === 'RUNNING' ? 'animate-spin' : ''} />
      {status}
    </span>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? (done / total) * 100 : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-zinc-600">
        <span>{done}/{total} analyzed</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1 bg-surface-raised rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, #7c6aff, #a855f7)' }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8 }}
        />
      </div>
    </div>
  )
}

// ── Drop zone ─────────────────────────────────────────────────────────────────
function DropZone({ onUpload }: { onUpload: (names: string[]) => void }) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [names, setNames] = useState<string[]>([])
  const [error, setError] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  const processFile = (f: File) => {
    setFile(f)
    setError('')
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const parsed = text
        .split('\n')
        .map(l => l.trim().replace(/^"(.*)"$/, '$1')) // strip quotes
        .filter(l => l && !l.toLowerCase().startsWith('github') && !l.toLowerCase().startsWith('url'))
        .map(l => l.replace('https://github.com/', '').replace('@', '').split('/')[0].split(',')[0].trim())
        .filter(Boolean)
        .slice(0, 1000)
      if (parsed.length === 0) {
        setError('No GitHub usernames found. Make sure your CSV has one username per row.')
        setFile(null)
        return
      }
      setNames(parsed)
    }
    reader.readAsText(f)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && f.name.endsWith('.csv')) processFile(f)
    else setError('Please upload a .csv file.')
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => ref.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center gap-3 cursor-pointer transition-all ${
          dragging
            ? 'border-[#7c6aff] bg-[#7c6aff]/[0.06]'
            : 'border-white/[0.1] hover:border-white/[0.2] hover:bg-white/[0.01]'
        }`}
      >
        <Upload size={24} className={dragging ? 'text-[#7c6aff]' : 'text-zinc-600'} />
        <div className="text-center">
          <p className="text-sm text-zinc-300 font-medium">Drop your CSV file here</p>
          <p className="text-xs text-zinc-600 mt-0.5">or click to browse · up to 1000 candidates</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <FileText size={11} />
          <span>One GitHub URL or username per row</span>
        </div>
        <input ref={ref} type="file" accept=".csv" className="hidden" onChange={e => e.target.files?.[0] && processFile(e.target.files[0])} />
      </div>

      {error && <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertTriangle size={11} />{error}</p>}

      {names.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-200 flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-400" />
              {names.length} candidates parsed
            </span>
            <button onClick={() => { setFile(null); setNames([]) }} className="text-zinc-600 hover:text-zinc-400">
              <X size={14} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
            {names.map(n => (
              <span key={n} className="text-xs text-zinc-400 bg-white/[0.05] px-2 py-0.5 rounded font-mono">@{n}</span>
            ))}
          </div>
          <button
            onClick={() => onUpload(names)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded text-sm font-medium transition-all"
            style={{ background: 'linear-gradient(135deg, #7c6aff, #a855f7)', color: '#fff' }}
          >
            <Play size={14} />
            Start Analysis ({names.length} candidates)
          </button>
        </motion.div>
      )}

      {/* Sample CSV download hint */}
      <p className="text-xs text-zinc-600">
        CSV format: one GitHub username or URL per line.{' '}
        <button
          onClick={() => {
            const blob = new Blob([
              'github_username\nalex-zhang-dev\npriya-sharma-fs\nhttps://github.com/sara-h-eng\n@kiran-dev22'
            ], { type: 'text/csv' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = 'reviewforge_sample.csv'
            a.click()
          }}
          className="text-[#7c6aff] hover:text-[#a78bfa] transition-colors"
        >
          Download sample CSV
        </button>
      </p>
    </div>
  )
}

// ── AI Risk mini badge ────────────────────────────────────────────────────────
const RISK_COLOR: Record<AIRiskLevel, string> = {
  LOW: '#34d399', MEDIUM: '#fbbf24', HIGH: '#f87171', VERY_HIGH: '#ef4444',
}

// ── Batch results mini table ───────────────────────────────────────────────────
function BatchResults({ candidates }: { candidates: CandidateProfile[] }) {
  const navigate = useNavigate()
  const sorted = [...candidates].sort((a, b) => b.overallScore - a.overallScore)

  return (
    <div className="card overflow-hidden mt-4">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <span className="label-xs">Results — {sorted.length} analyzed</span>
        <button
          onClick={() => navigate('/candidates/ranking')}
          className="text-xs text-[#7c6aff] hover:text-[#a78bfa] transition-colors flex items-center gap-1"
        >
          Full ranking <Trophy size={10} />
        </button>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/[0.04]">
            <th className="text-left px-4 py-2 label-xs font-medium">Rank</th>
            <th className="text-left px-4 py-2 label-xs font-medium">Candidate</th>
            <th className="text-left px-4 py-2 label-xs font-medium">Score</th>
            <th className="text-left px-4 py-2 label-xs font-medium">AI Risk</th>
            <th className="text-left px-4 py-2 label-xs font-medium">Top Languages</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c, i) => (
            <motion.tr
              key={c.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => navigate(`/candidate/${c.id}`)}
              className="border-b border-white/[0.03] last:border-0 cursor-pointer hover:bg-white/[0.02] transition-colors"
            >
              <td className="px-4 py-2.5">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-xs text-zinc-600 font-mono">#{i + 1}</span>}
              </td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <img src={c.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                  <span className="text-sm text-zinc-300">{c.name}</span>
                </div>
              </td>
              <td className="px-4 py-2.5">
                <ScoreBadge score={c.overallScore} />
              </td>
              <td className="px-4 py-2.5">
                <span className="text-xs font-mono" style={{ color: RISK_COLOR[c.aiDetection.level] }}>
                  {c.aiDetection.score}%
                </span>
              </td>
              <td className="px-4 py-2.5">
                <span className="text-xs text-zinc-500">{c.topLanguages[0]?.name}, {c.topLanguages[1]?.name}</span>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Cross-batch leaderboard bar chart ─────────────────────────────────────────
function GlobalLeaderboard({ candidates, topN = 15 }: { candidates: CandidateProfile[]; topN?: number }) {
  const navigate = useNavigate()
  const top = useMemo(
    () => [...candidates].sort((a, b) => (b.jdMatch?.score ?? b.overallScore) - (a.jdMatch?.score ?? a.overallScore)).slice(0, topN),
    [candidates, topN]
  )
  if (top.length === 0) return null

  const chartData = top.map(c => ({
    name: c.name.split(' ')[0],
    score: c.jdMatch?.score ?? c.overallScore,
    fill: (c.jdMatch?.score ?? c.overallScore) >= 70 ? '#34d399'
         : (c.jdMatch?.score ?? c.overallScore) >= 40 ? '#fbbf24' : '#f87171',
    id: c.id,
  }))

  const handleBarClick = (data: { activePayload?: { payload: { id: string } }[] }) => {
    const id = data?.activePayload?.[0]?.payload?.id
    if (id) navigate(`/candidates/compare?ids=${id}`)
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 size={14} className="text-[#7c6aff]" />
          <span className="label-xs">Global Top {top.length} — All Batches Combined</span>
        </div>
        <button
          onClick={() => navigate('/candidates/ranking')}
          className="text-xs text-[#7c6aff] hover:text-[#a78bfa] transition-colors flex items-center gap-1"
        >
          Full ranking <Trophy size={10} />
        </button>
      </div>

      <p className="text-[10px] text-zinc-600 mb-1">Click any bar to open that candidate in Compare view</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 32, top: 4, bottom: 4 }}
          onClick={handleBarClick} style={{ cursor: 'pointer' }}>
          <XAxis type="number" domain={[0, 100]} tick={{ fill: '#52525b', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            contentStyle={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
            formatter={(val: number) => [`${val}`, 'Score']}
          />
          <Bar dataKey="score" radius={[0, 4, 4, 0]} maxBarSize={16}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-4 text-[10px] text-zinc-600">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" /> Strong Fit (≥70)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" /> Maybe (40–69)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-400 inline-block" /> Poor Fit (&lt;40)</span>
        <span className="ml-auto">Score = JD match if set, otherwise quality score</span>
      </div>
    </div>
  )
}

// ── Active job progress card ──────────────────────────────────────────────────
function ActiveJobCard({ job }: { job: BatchJob }) {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Loader2 size={14} className="animate-spin text-[#7c6aff]" />
        <span className="text-sm font-medium text-zinc-300">{job.name}</span>
        <StatusBadge status={job.status} />
      </div>
      <ProgressBar done={job.processed} total={job.totalCandidates} />
      <p className="text-xs text-zinc-600">
        Analyzing candidates one by one — scores appear in the Candidates list as each finishes
      </p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BatchCandidatePage() {
  const navigate = useNavigate()
  const { jobs, submitting, submitBatch } = useBatchJobs()
  const { candidates } = useCandidates()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const activeJob  = jobs.find(j => j.status === 'RUNNING' || j.status === 'QUEUED')
  const pastJobs   = jobs.filter(j => j.status === 'DONE' || j.status === 'FAILED')
  const doneBatches = jobs.filter(j => j.status === 'DONE').length

  const handleUpload = async (names: string[]) => {
    setSubmitError(null)
    const batchName = `Batch ${new Date().toLocaleDateString()} (${names.length} candidates)`
    const job = await submitBatch(batchName, names)
    if (!job) setSubmitError('Failed to start batch. Check your connection and try again.')
  }

  return (
    <PageTransition>
      <div className="page-container">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => navigate('/candidates')} className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                <ChevronLeft size={12} /> Candidates
              </button>
              <ChevronRight size={12} className="text-zinc-700" />
              <span className="text-xs text-zinc-400">Batch Upload</span>
            </div>
            <h1 className="text-base font-medium text-zinc-100 flex items-center gap-2">
              <Upload size={16} className="text-zinc-400" />
              Batch Candidate Analysis
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">Upload a CSV of GitHub usernames — up to 1000 per batch, all ranked globally</p>
          </div>
        </div>

        <div className="flex gap-5 items-start">
          {/* Left: upload + results */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Upload zone — always visible */}
            <div className="card p-4">
              <p className="label-xs mb-4">Upload CSV</p>
              {submitting
                ? <div className="flex items-center gap-2 py-6 justify-center text-xs text-zinc-500">
                    <Loader2 size={14} className="animate-spin" /> Submitting batch…
                  </div>
                : <DropZone onUpload={handleUpload} />
              }
              {submitError && (
                <p className="text-xs text-red-400 flex items-center gap-1.5 mt-2">
                  <AlertTriangle size={11} />{submitError}
                </p>
              )}
            </div>

            {/* Active job progress */}
            {activeJob && <ActiveJobCard job={activeJob} />}

            {/* Completed active job success banner */}
            {!activeJob && jobs[0]?.status === 'DONE' && jobs[0]?.candidateIds.length > 0 && (
              <div className="card p-4 flex items-center gap-3">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-200">Last batch complete</p>
                  <p className="text-xs text-zinc-500">{jobs[0].totalCandidates} candidates analyzed and added to your list</p>
                </div>
                <button
                  onClick={() => navigate('/candidates/ranking')}
                  className="text-xs text-[#7c6aff] hover:text-[#a78bfa] transition-colors flex items-center gap-1"
                >
                  View rankings <Trophy size={10} />
                </button>
              </div>
            )}

            {/* Cross-batch global chart — shown when 2+ batches done */}
            {doneBatches >= 1 && candidates.length > 0 && (
              <GlobalLeaderboard candidates={candidates} topN={15} />
            )}

            {/* Past jobs */}
            {pastJobs.length > 0 && (
              <div className="space-y-2">
                <p className="label-xs px-1">Previous Batches</p>
                {pastJobs.map(job => (
                  <div key={job.id} className="card p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-200 truncate">{job.name}</p>
                        <p className="text-xs text-zinc-600 mt-0.5">
                          Created {timeAgo(job.createdAt)}
                          {job.completedAt && ` · Completed ${timeAgo(job.completedAt)}`}
                        </p>
                      </div>
                      <StatusBadge status={job.status} />
                    </div>
                    <ProgressBar done={job.processed} total={job.totalCandidates} />
                    {job.status === 'DONE' && (
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-zinc-600">{job.totalCandidates} candidates analyzed</span>
                        <button
                          onClick={() => navigate('/candidates/ranking')}
                          className="text-xs text-[#7c6aff] hover:text-[#a78bfa] transition-colors flex items-center gap-1"
                        >
                          View rankings <Trophy size={10} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: info panel */}
          <div className="w-64 shrink-0 space-y-3">
            <div className="card p-4 space-y-3">
              <p className="label-xs">What gets analyzed</p>
              {[
                { icon: '🔍', label: 'Code quality score', desc: 'Cyclomatic complexity, test coverage, duplication' },
                { icon: '🤖', label: 'AI-generation risk', desc: 'Burst commits, boilerplate patterns, doc uniformity' },
                { icon: '🧰', label: 'Skill detection', desc: 'Languages, frameworks, libraries from source analysis' },
                { icon: '📋', label: 'JD matching', desc: 'Match % against your job description requirements' },
              ].map(item => (
                <div key={item.label} className="flex items-start gap-2.5">
                  <span className="text-sm mt-0.5">{item.icon}</span>
                  <div>
                    <p className="text-xs font-medium text-zinc-300">{item.label}</p>
                    <p className="text-xs text-zinc-600 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="card p-4 space-y-2">
              <p className="label-xs">Rate limits</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Batch size</span>
                <span className="text-xs font-mono text-zinc-300">up to 1000</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Est. time (50)</span>
                <span className="text-xs font-mono text-zinc-300">~1 min</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Est. time (500)</span>
                <span className="text-xs font-mono text-zinc-300">~10 min</span>
              </div>
            </div>

            <div className="card p-4">
              <p className="label-xs mb-2">CSV format</p>
              <pre className="text-xs text-zinc-500 font-mono leading-relaxed bg-[#0d0d0d] rounded p-2.5">
{`github_username
alex-zhang-dev
priya-sharma-fs
https://github.com/
  sara-h-eng`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
