import type { Severity } from '../../types'

interface SeverityBadgeProps {
  severity: Severity
  dot?: boolean
}

const CONFIG: Record<Severity, { label: string; bg: string; text: string; border: string; dot: string }> = {
  CRITICAL: {
    label: 'Critical',
    bg: 'rgba(239,68,68,0.10)',
    text: '#fca5a5',
    border: 'rgba(239,68,68,0.20)',
    dot: '#ef4444',
  },
  WARNING: {
    label: 'Warning',
    bg: 'rgba(245,158,11,0.10)',
    text: '#fcd34d',
    border: 'rgba(245,158,11,0.20)',
    dot: '#f59e0b',
  },
  INFO: {
    label: 'Info',
    bg: 'rgba(59,130,246,0.10)',
    text: '#93c5fd',
    border: 'rgba(59,130,246,0.20)',
    dot: '#3b82f6',
  },
}

export default function SeverityBadge({ severity, dot = false }: SeverityBadgeProps) {
  const c = CONFIG[severity]
  return (
    <span
      className="inline-flex items-center gap-1 text-2xs font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border"
      style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
    >
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.dot }} />
      )}
      {c.label}
    </span>
  )
}
