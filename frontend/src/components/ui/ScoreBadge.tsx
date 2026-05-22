interface ScoreBadgeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
}

function colors(score: number) {
  if (score >= 90) return { bg: 'rgba(16,185,129,0.10)', text: '#6ee7b7', border: 'rgba(16,185,129,0.20)' }
  if (score >= 75) return { bg: 'rgba(34,197,94,0.10)', text: '#86efac', border: 'rgba(34,197,94,0.20)' }
  if (score >= 50) return { bg: 'rgba(245,158,11,0.10)', text: '#fcd34d', border: 'rgba(245,158,11,0.20)' }
  return { bg: 'rgba(239,68,68,0.10)', text: '#fca5a5', border: 'rgba(239,68,68,0.20)' }
}

export default function ScoreBadge({ score, size = 'sm' }: ScoreBadgeProps) {
  const c = colors(score)
  const sizeClass = size === 'sm' ? 'text-xs px-1.5 py-0.5' : size === 'md' ? 'text-sm px-2 py-1' : 'text-base px-2.5 py-1'
  return (
    <span
      className={`inline-flex items-center font-mono font-medium rounded border ${sizeClass} tabular-nums`}
      style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
    >
      {score}
    </span>
  )
}
