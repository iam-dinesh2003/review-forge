import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ExternalLink, GitBranch, GitCommit, Clock, User } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import PageTransition from '../components/ui/PageTransition'
import ScoreBadge from '../components/ui/ScoreBadge'
import SeverityBadge from '../components/ui/SeverityBadge'
import { useReview } from '../hooks/useReviews'
import { timeAgo, shortenPath, shortSha, getScoreColor, getScoreLabel } from '../utils'
import type { ReviewComment, CodeDiff } from '../types'

// ── Category tag ───────────────────────────────────────────────────────────────
const CATEGORY_STYLE: Record<string, { text: string; border: string }> = {
  SECURITY: { text: '#f87171', border: 'rgba(248,113,113,0.2)' },
  PERFORMANCE: { text: '#fb923c', border: 'rgba(251,146,60,0.2)' },
  BUG: { text: '#f472b6', border: 'rgba(244,114,182,0.2)' },
  CODE_QUALITY: { text: '#a78bfa', border: 'rgba(167,139,250,0.2)' },
  BEST_PRACTICE: { text: '#67e8f9', border: 'rgba(103,232,249,0.2)' },
}

function CategoryTag({ category }: { category: string }) {
  const s = CATEGORY_STYLE[category] ?? { text: '#a1a1aa', border: 'rgba(161,161,170,0.2)' }
  return (
    <span
      className="text-2xs uppercase tracking-wider px-1.5 py-0.5 rounded border font-medium"
      style={{ color: s.text, borderColor: s.border, backgroundColor: s.border.replace('0.2', '0.08') }}
    >
      {category.replace('_', ' ')}
    </span>
  )
}

// ── Score gauge (SVG arc) ──────────────────────────────────────────────────────
function ScoreGauge({ score }: { score: number }) {
  const r = 46
  const sw = 5
  const circ = 2 * Math.PI * r
  const targetOffset = circ * (1 - score / 100)
  const color = getScoreColor(score)

  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <div className="relative inline-flex items-center justify-center">
        <svg width="108" height="108" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={54} cy={54} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={sw} />
          <motion.circle
            cx={54} cy={54} r={r}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: targetOffset }}
            transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.15 }}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-light tabular-nums" style={{ color }}>{score}</span>
          <span className="text-2xs text-zinc-600 uppercase tracking-widest mt-0.5">{getScoreLabel(score)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Code diff block ────────────────────────────────────────────────────────────
function DiffBlock({ diff }: { diff: CodeDiff }) {
  return (
    <div>
      <p className="label-xs mb-1.5">Code context</p>
      <div className="rounded overflow-hidden border border-white/[0.06] text-xs font-mono">
        {/* Before context lines */}
        {diff.beforeLines.map(l => (
          <div key={l.num} className="flex items-start gap-0 bg-[#0d0d0d]">
            <span className="w-10 shrink-0 text-zinc-700 text-right pr-3 py-1.5 select-none border-r border-white/[0.04]">
              {l.num}
            </span>
            <span className="pl-3 py-1.5 text-zinc-500 flex-1 overflow-x-auto whitespace-pre">{l.code}</span>
          </div>
        ))}
        {/* Problem line */}
        <div className="flex items-start gap-0 bg-red-950/40 border-l-2 border-red-500">
          <span className="w-10 shrink-0 text-red-400/70 text-right pr-3 py-1.5 select-none border-r border-red-500/20">
            {diff.problemLine.num}
          </span>
          <span className="pl-3 py-1.5 text-red-300 flex-1 overflow-x-auto whitespace-pre">{diff.problemLine.code}</span>
        </div>
        {/* After context lines */}
        {diff.afterLines.map(l => (
          <div key={l.num} className="flex items-start gap-0 bg-[#0d0d0d]">
            <span className="w-10 shrink-0 text-zinc-700 text-right pr-3 py-1.5 select-none border-r border-white/[0.04]">
              {l.num}
            </span>
            <span className="pl-3 py-1.5 text-zinc-500 flex-1 overflow-x-auto whitespace-pre">{l.code}</span>
          </div>
        ))}
        {/* Fix preview — first line of suggestion becomes a green "after" line */}
      </div>
    </div>
  )
}

// ── Comment card ───────────────────────────────────────────────────────────────
function CommentCard({ comment, index }: { comment: ReviewComment; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
      className="border border-white/[0.06] rounded bg-[#111] overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04] bg-[#141414]">
        <SeverityBadge severity={comment.severity} dot />
        <CategoryTag category={comment.category} />
        <span className="ml-auto text-2xs text-zinc-600 font-mono">L{comment.line}</span>
      </div>
      <div className="px-3 py-2.5 space-y-3">
        <p className="text-xs text-zinc-300 leading-relaxed">{comment.message}</p>
        {comment.codeDiff && <DiffBlock diff={comment.codeDiff} />}
        {comment.suggestion && (
          <div>
            <p className="label-xs mb-1.5">Suggested fix</p>
            <pre className="bg-[#0d0d0d] border border-white/[0.06] rounded p-3 text-xs font-mono text-emerald-300/80 overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {comment.suggestion}
            </pre>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── File section ───────────────────────────────────────────────────────────────
function FileSection({ file, comments }: { file: string; comments: ReviewComment[] }) {
  const [open, setOpen] = useState(true)
  const hasCritical = comments.some(c => c.severity === 'CRITICAL')

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-white/[0.02] transition-colors text-left border-b border-white/[0.04]"
      >
        <ChevronRight
          size={12}
          className="text-zinc-600 transition-transform shrink-0"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
        <span className="text-xs font-mono text-zinc-400 flex-1 min-w-0 truncate">{shortenPath(file)}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-2xs text-zinc-600">{comments.length} issue{comments.length !== 1 ? 's' : ''}</span>
          {hasCritical && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="p-3 space-y-2.5">
              {comments.map((c, i) => <CommentCard key={c.id} comment={c} index={i} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Metadata row ───────────────────────────────────────────────────────────────
function MetaRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-white/[0.04] last:border-0">
      <Icon size={12} className="text-zinc-600 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-2xs text-zinc-600 mb-0.5">{label}</p>
        <p className="text-xs text-zinc-400 font-mono truncate">{value}</p>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function PRDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { review, loading } = useReview(id ?? '')

  if (loading) {
    return (
      <PageTransition>
        <div className="page-container flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-sm text-zinc-500">Loading review…</p>
          </div>
        </div>
      </PageTransition>
    )
  }

  if (!review) {
    return (
      <PageTransition>
        <div className="page-container flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-sm text-zinc-500">Review not found.</p>
            <button onClick={() => navigate('/reviews')} className="mt-3 text-xs text-accent hover:underline">
              ← Back to reviews
            </button>
          </div>
        </div>
      </PageTransition>
    )
  }

  // Group comments by file
  const commentsByFile = review.comments.reduce<Record<string, ReviewComment[]>>((acc, c) => {
    if (!acc[c.file]) acc[c.file] = []
    acc[c.file].push(c)
    return acc
  }, {})

  const fileEntries = Object.entries(commentsByFile)

  return (
    <PageTransition>
      <div className="page-container">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div className="flex-1 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1 text-2xs text-zinc-600 hover:text-zinc-400 transition-colors mb-3"
            >
              <ChevronLeft size={12} />
              Reviews
            </button>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-zinc-600 font-mono text-sm">#{review.prNumber}</span>
              <h1 className="text-sm font-medium text-zinc-100 truncate">{review.prTitle}</h1>
            </div>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="flex items-center gap-1.5 text-2xs text-zinc-500">
                <GitBranch size={11} />
                <span className="font-mono">{review.branch}</span>
              </span>
              <span className="flex items-center gap-1.5 text-2xs text-zinc-500">
                <GitCommit size={11} />
                <span className="font-mono">{review.headSha}</span>
              </span>
              <span className="flex items-center gap-1.5 text-2xs text-zinc-500">
                <User size={11} />
                {review.authorLogin}
              </span>
              <span className="flex items-center gap-1.5 text-2xs text-zinc-500">
                <Clock size={11} />
                {timeAgo(review.reviewedAt)}
              </span>
            </div>
          </div>
          <a
            href={review.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-zinc-500 border border-white/[0.08] rounded px-3 py-1.5 hover:text-zinc-300 hover:border-white/[0.16] transition-colors shrink-0"
          >
            <ExternalLink size={12} />
            View on GitHub
          </a>
        </div>

        {/* Body: 65% left + 35% right */}
        <div className="flex gap-5 items-start">
          {/* Left: comments */}
          <div className="flex-1 min-w-0 space-y-3">
            {fileEntries.length === 0 ? (
              <div className="card p-8 text-center">
                <p className="text-xs text-zinc-600">No inline comments on this review.</p>
                <p className="text-2xs text-zinc-700 mt-1">{review.summary.split('.')[0]}.</p>
              </div>
            ) : (
              fileEntries.map(([file, comments]) => (
                <FileSection key={file} file={file} comments={comments} />
              ))
            )}
          </div>

          {/* Right: sticky summary panel */}
          <div className="w-72 shrink-0 sticky top-6 space-y-3">
            {/* Score */}
            <div className="card">
              <div className="px-4 pt-3 pb-0 border-b border-white/[0.04]">
                <span className="label-xs">Quality Score</span>
              </div>
              <ScoreGauge score={review.overallScore} />
            </div>

            {/* Summary */}
            <div className="card p-4">
              <p className="label-xs mb-2">AI Summary</p>
              <p className="text-xs text-zinc-400 leading-relaxed">{review.summary}</p>
            </div>

            {/* Issue breakdown */}
            <div className="card p-4 space-y-2.5">
              <p className="label-xs mb-1">Issue Breakdown</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  <span className="text-xs text-zinc-400">Critical</span>
                </div>
                <span className="text-xs font-mono text-red-400">{review.criticalCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span className="text-xs text-zinc-400">Warning</span>
                </div>
                <span className="text-xs font-mono text-amber-400">{review.warningCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  <span className="text-xs text-zinc-400">Info</span>
                </div>
                <span className="text-xs font-mono text-blue-400">{review.infoCount}</span>
              </div>
              <div className="mt-3 h-1.5 bg-surface-raised rounded-full overflow-hidden flex">
                {review.criticalCount > 0 && (
                  <div
                    className="h-full bg-red-500 rounded-l-full"
                    style={{ width: `${(review.criticalCount / (review.criticalCount + review.warningCount + review.infoCount)) * 100}%` }}
                  />
                )}
                {review.warningCount > 0 && (
                  <div
                    className="h-full bg-amber-500"
                    style={{ width: `${(review.warningCount / (review.criticalCount + review.warningCount + review.infoCount)) * 100}%` }}
                  />
                )}
                {review.infoCount > 0 && (
                  <div
                    className="h-full bg-blue-500 rounded-r-full"
                    style={{ width: `${(review.infoCount / (review.criticalCount + review.warningCount + review.infoCount)) * 100}%` }}
                  />
                )}
              </div>
            </div>

            {/* Metadata */}
            <div className="card px-4 py-2">
              <MetaRow icon={GitBranch} label="Repository" value={review.repoFullName} />
              <MetaRow icon={GitCommit} label="Commit" value={shortSha(review.headSha)} />
              <MetaRow icon={User} label="Author" value={review.authorLogin} />
              <MetaRow icon={Clock} label="Reviewed" value={timeAgo(review.reviewedAt)} />
            </div>

            {/* CTA */}
            <a
              href={review.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 w-full text-xs text-zinc-400 border border-white/[0.08] rounded py-2.5 hover:text-zinc-200 hover:border-white/[0.16] transition-colors"
            >
              <ExternalLink size={12} />
              Open Pull Request
            </a>
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
