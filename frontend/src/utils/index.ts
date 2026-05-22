export function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'just now'
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7)
}

export function formatScore(score: number, decimals = 0): string {
  return score.toFixed(decimals)
}

export function getScoreColor(score: number): string {
  if (score >= 90) return '#10b981'
  if (score >= 75) return '#22c55e'
  if (score >= 50) return '#f59e0b'
  return '#ef4444'
}

export function getScoreLabel(score: number): string {
  if (score >= 90) return 'Excellent'
  if (score >= 75) return 'Good'
  if (score >= 50) return 'Fair'
  return 'Poor'
}

export function shortenPath(path: string, maxLen = 56): string {
  if (path.length <= maxLen) return path
  const parts = path.split('/')
  const filename = parts[parts.length - 1]
  const leading = parts.slice(0, 2).join('/')
  return `${leading}/…/${filename}`
}
