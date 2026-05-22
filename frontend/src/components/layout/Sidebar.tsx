import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, GitPullRequest, BookOpen, Settings, Users, Bell, X, AlertTriangle, Code2, Trophy, Upload, GitCompareArrows, Menu, ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { mockReviews, mockCandidates } from '../../data/mockData'
import { timeAgo } from '../../utils'

// ── Nav structure ──────────────────────────────────────────────────────────────
interface SubNavItem { to: string; icon: React.ElementType; label: string }
interface NavDef { to: string; icon: React.ElementType; label: string; exact?: boolean; sub?: SubNavItem[] }

const NAV: NavDef[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/reviews', icon: GitPullRequest, label: 'Reviews' },
  {
    to: '/candidates',
    icon: Users,
    label: 'Candidates',
    sub: [
      { to: '/candidates/ranking', icon: Trophy, label: 'Rankings' },
      { to: '/candidates/batch', icon: Upload, label: 'Batch Upload' },
      { to: '/candidates/compare', icon: GitCompareArrows, label: 'Compare' },
    ],
  },
  { to: '/repositories', icon: BookOpen, label: 'Repositories' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

// ── Notifications ─────────────────────────────────────────────────────────────
interface NotifItem {
  id: string; type: 'review' | 'candidate'; title: string; sub: string
  time: string; hasCritical?: boolean; score?: number
}

function buildNotifications(): NotifItem[] {
  const items: NotifItem[] = []
  mockReviews.slice(0, 5).forEach(r => {
    items.push({
      id: `r-${r.id}`, type: 'review',
      title: `PR #${r.prNumber} reviewed`,
      sub: r.prTitle.length > 44 ? r.prTitle.slice(0, 41) + '…' : r.prTitle,
      time: r.reviewedAt, hasCritical: r.criticalCount > 0, score: r.overallScore,
    })
  })
  mockCandidates.slice(0, 4).forEach(c => {
    items.push({
      id: `c-${c.id}`, type: 'candidate',
      title: `${c.name} analyzed`,
      sub: `@${c.githubLogin} · ${c.aiDetection.level === 'LOW' ? 'Human' : 'AI Risk'} · ${c.publicRepos} repos`,
      time: c.analyzedAt, score: c.overallScore,
    })
  })
  items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
  return items.slice(0, 8)
}

const NOTIFS = buildNotifications()
const UNREAD_COUNT = NOTIFS.filter(n => n.hasCritical).length + 2

function NotificationsPanel({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="absolute left-full top-0 ml-2 w-80 bg-[#111] border border-white/[0.08] rounded-lg shadow-2xl overflow-hidden z-50"
      style={{ bottom: 0, maxHeight: '100vh', overflowY: 'auto' }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#141414] sticky top-0">
        <div className="flex items-center gap-2">
          <Bell size={13} className="text-zinc-400" />
          <span className="text-sm font-medium text-zinc-200">Activity</span>
          {UNREAD_COUNT > 0 && (
            <span className="text-2xs bg-[#7c6aff] text-white rounded-full px-1.5 py-0.5 font-medium">{UNREAD_COUNT}</span>
          )}
        </div>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors"><X size={14} /></button>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {NOTIFS.map((n, i) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.15 }}
            className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors cursor-pointer"
          >
            <div className={['mt-0.5 w-7 h-7 rounded flex items-center justify-center shrink-0', n.type === 'review' ? 'bg-[#7c6aff]/10' : 'bg-emerald-500/10'].join(' ')}>
              {n.type === 'review' ? <Code2 size={13} className="text-[#a78bfa]" /> : <Users size={13} className="text-emerald-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <p className="text-xs font-medium text-zinc-200 truncate">{n.title}</p>
                {n.hasCritical && <AlertTriangle size={10} className="text-red-400 shrink-0" />}
              </div>
              <p className="text-2xs text-zinc-600 leading-relaxed truncate">{n.sub}</p>
              <div className="flex items-center gap-2 mt-1">
                {n.score !== undefined && (
                  <span className={['text-2xs font-mono font-medium', n.score >= 85 ? 'text-emerald-400' : n.score >= 70 ? 'text-amber-400' : 'text-red-400'].join(' ')}>{n.score}</span>
                )}
                <span className="text-2xs text-zinc-700">{timeAgo(n.time)}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      <div className="px-4 py-3 border-t border-white/[0.06] bg-[#141414] sticky bottom-0">
        <p className="text-2xs text-zinc-600 text-center">Showing last {NOTIFS.length} activities</p>
      </div>
    </motion.div>
  )
}

// ── Single nav item (with optional sub-nav) ───────────────────────────────────
function NavItem({ item, onClose }: { item: NavDef; onClose?: () => void }) {
  const location = useLocation()
  const isParentActive = item.exact
    ? location.pathname === item.to
    : location.pathname === item.to ||
      (item.sub?.some(s => location.pathname.startsWith(s.to)) ?? false) ||
      location.pathname.startsWith(item.to + '/')

  const [subOpen, setSubOpen] = useState(isParentActive)
  const hasSub = !!item.sub?.length

  return (
    <div>
      <NavLink
        to={item.to}
        end={item.exact}
        onClick={e => {
          if (hasSub) { e.preventDefault(); setSubOpen(o => !o) }
          else onClose?.()
        }}
        className={({ isActive }) =>
          ['group relative flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors duration-100',
            (isActive || isParentActive)
              ? 'text-zinc-100 bg-white/[0.08]'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]',
          ].join(' ')
        }
      >
        {({ isActive }) => (
          <>
            {(isActive || isParentActive) && (
              <motion.span
                layoutId="sidebar-indicator"
                className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                style={{ backgroundColor: '#7c6aff' }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <item.icon size={17} strokeWidth={(isActive || isParentActive) ? 2 : 1.5} className="shrink-0" />
            <span className="flex-1">{item.label}</span>
            {hasSub && (
              <ChevronDown size={13} className={['text-zinc-600 transition-transform duration-200', subOpen ? 'rotate-180' : ''].join(' ')} />
            )}
          </>
        )}
      </NavLink>

      <AnimatePresence initial={false}>
        {hasSub && subOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="ml-6 mt-0.5 space-y-0.5 pb-1">
              {item.sub!.map(s => (
                <NavLink
                  key={s.to}
                  to={s.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    ['flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium transition-colors',
                      isActive
                        ? 'text-[#a78bfa] bg-[#7c6aff]/10'
                        : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.04]',
                    ].join(' ')
                  }
                >
                  <s.icon size={13} strokeWidth={1.5} className="shrink-0" />
                  {s.label}
                </NavLink>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Shared sidebar body ───────────────────────────────────────────────────────
function SidebarContent({ onClose }: { onClose?: () => void }) {
  const [showNotifs, setShowNotifs] = useState(false)

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-white/[0.06] shrink-0">
        <div className="w-8 h-8 rounded flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #7c6aff 0%, #a855f7 100%)' }}>
          <span className="text-xs font-bold tracking-wider text-white select-none">RF</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-100 leading-tight">ReviewForge</p>
          <p className="text-xs text-zinc-600 leading-tight">AI Code Reviewer</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="ml-auto text-zinc-600 hover:text-zinc-400 transition-colors">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 flex flex-col gap-1 px-3 overflow-y-auto">
        {NAV.map(item => <NavItem key={item.to} item={item} onClose={onClose} />)}
      </nav>

      {/* Notifications */}
      <div className="relative px-3 pb-2">
        <button
          onClick={() => setShowNotifs(o => !o)}
          className={['relative w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors',
            showNotifs ? 'text-zinc-200 bg-white/[0.08]' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]',
          ].join(' ')}
        >
          <Bell size={17} strokeWidth={1.5} className="shrink-0" />
          <span>Activity</span>
          {UNREAD_COUNT > 0 && (
            <span className="ml-auto text-2xs bg-[#7c6aff] text-white rounded-full w-4 h-4 flex items-center justify-center font-medium shrink-0">
              {UNREAD_COUNT}
            </span>
          )}
        </button>
        <AnimatePresence>
          {showNotifs && <NotificationsPanel onClose={() => setShowNotifs(false)} />}
        </AnimatePresence>
      </div>

      {/* User */}
      <div className="h-16 flex items-center gap-3 px-5 border-t border-white/[0.06] shrink-0">
        <div className="relative shrink-0">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-white select-none"
            style={{ background: 'linear-gradient(135deg, #7c6aff 0%, #a855f7 100%)' }}>
            D
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#0d0d0d]" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-300 truncate">dinesh-dev</p>
          <p className="text-xs text-zinc-600 truncate">Connected</p>
        </div>
      </div>
    </div>
  )
}

// ── Exported sidebar ───────────────────────────────────────────────────────────
export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-52 flex-col z-50 bg-[#0d0d0d] border-r border-white/[0.06]">
        <SidebarContent />
      </aside>

      {/* Mobile: hamburger trigger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 w-9 h-9 flex items-center justify-center rounded-lg bg-[#111] border border-white/[0.1] text-zinc-400 hover:text-zinc-200 transition-colors shadow-lg"
      >
        <Menu size={18} />
      </button>

      {/* Mobile: drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -208 }}
              animate={{ x: 0 }}
              exit={{ x: -208 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="lg:hidden fixed left-0 top-0 h-screen w-52 z-50 bg-[#0d0d0d] border-r border-white/[0.06]"
            >
              <SidebarContent onClose={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
