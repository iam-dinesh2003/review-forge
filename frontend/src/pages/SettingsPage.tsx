import { useState } from 'react'
import { Github, CheckCircle2, Key, Bell, Shield, ChevronRight, AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'
import PageTransition from '../components/ui/PageTransition'

function Section({ title, children, delay = 0 }: { title: string; children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <h2 className="label-xs mb-3">{title}</h2>
      <div className="card divide-y divide-white/[0.04]">{children}</div>
    </motion.div>
  )
}

function SettingRow({
  icon: Icon,
  label,
  description,
  children,
  status,
}: {
  icon: React.ElementType
  label: string
  description?: string
  children?: React.ReactNode
  status?: 'connected' | 'warning' | 'disconnected'
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-7 h-7 rounded bg-surface-raised flex items-center justify-center shrink-0">
        <Icon size={13} className="text-zinc-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-xs text-zinc-300">{label}</p>
          {status === 'connected' && (
            <span className="flex items-center gap-1 text-2xs text-emerald-400">
              <CheckCircle2 size={10} />
              Connected
            </span>
          )}
          {status === 'warning' && (
            <span className="flex items-center gap-1 text-2xs text-amber-400">
              <AlertTriangle size={10} />
              Action needed
            </span>
          )}
        </div>
        {description && <p className="text-2xs text-zinc-600 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function Toggle({ defaultOn = false }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn)
  return (
    <button
      onClick={() => setOn(o => !o)}
      className="relative w-8 h-4 rounded-full transition-colors shrink-0"
      style={{ backgroundColor: on ? '#7c6aff' : 'rgba(255,255,255,0.08)' }}
    >
      <motion.span
        className="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow"
        animate={{ left: on ? '18px' : '2px' }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  )
}

export default function SettingsPage() {
  const [apiKeyVisible, setApiKeyVisible] = useState(false)

  return (
    <PageTransition>
      <div className="page-container max-w-[700px]">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-sm font-medium text-zinc-100">Settings</h1>
          <p className="text-xs text-zinc-500 mt-0.5">GitHub App configuration and preferences</p>
        </div>

        <div className="space-y-6">
          {/* GitHub App */}
          <Section title="GitHub App" delay={0}>
            <SettingRow
              icon={Github}
              label="GitHub App Installation"
              description="ai-pr-reviewer-reviewforge · installed on 4 repositories"
              status="connected"
            >
              <button className="text-2xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1">
                Manage <ChevronRight size={10} />
              </button>
            </SettingRow>
            <SettingRow
              icon={Shield}
              label="Webhook Secret"
              description="HMAC-SHA256 signature verification is active"
              status="connected"
            >
              <span className="text-2xs font-mono text-zinc-600 bg-surface-raised border border-white/[0.06] rounded px-2 py-1">
                ••••••••
              </span>
            </SettingRow>
          </Section>

          {/* API Keys */}
          <Section title="API Keys" delay={0.08}>
            <SettingRow
              icon={Key}
              label="Gemini API Key"
              description="Google Gemini 2.5 Flash · 500 free requests/day"
              status="connected"
            >
              <button
                onClick={() => setApiKeyVisible(v => !v)}
                className="text-2xs text-zinc-500 hover:text-zinc-300 transition-colors font-mono bg-surface-raised border border-white/[0.06] rounded px-2 py-1"
              >
                {apiKeyVisible ? 'AIza•••••••••••••••••' : '•••••••••••••'}
              </button>
            </SettingRow>
            <SettingRow
              icon={Key}
              label="GitHub App Private Key"
              description="RSA key for generating installation access tokens"
              status="connected"
            >
              <button className="text-2xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1">
                Rotate <ChevronRight size={10} />
              </button>
            </SettingRow>
          </Section>

          {/* Review Behavior */}
          <Section title="Review Behavior" delay={0.16}>
            <SettingRow
              icon={Github}
              label="Auto-review on PR open"
              description="Trigger a review whenever a pull request is opened"
            >
              <Toggle defaultOn={true} />
            </SettingRow>
            <SettingRow
              icon={Github}
              label="Auto-review on push"
              description="Re-trigger review when new commits are pushed to an open PR"
            >
              <Toggle defaultOn={true} />
            </SettingRow>
            <SettingRow
              icon={Github}
              label="Post summary comment"
              description="Add an overall summary comment after inline review comments"
            >
              <Toggle defaultOn={true} />
            </SettingRow>
            <SettingRow
              icon={Github}
              label="Java-specific rules only"
              description="Filter AI focus to Spring Boot / JPA / security patterns"
            >
              <Toggle defaultOn={false} />
            </SettingRow>
          </Section>

          {/* Notifications */}
          <Section title="Notifications" delay={0.24}>
            <SettingRow
              icon={Bell}
              label="Critical issue alerts"
              description="Notify when a CRITICAL severity issue is detected"
            >
              <Toggle defaultOn={true} />
            </SettingRow>
            <SettingRow
              icon={Bell}
              label="Low score alerts"
              description="Notify when overall PR score falls below 60"
            >
              <Toggle defaultOn={false} />
            </SettingRow>
          </Section>

          {/* Danger zone */}
          <Section title="Danger Zone" delay={0.32}>
            <SettingRow
              icon={AlertTriangle}
              label="Uninstall GitHub App"
              description="Removes ReviewForge from all repositories. This cannot be undone."
            >
              <button className="text-2xs text-red-400 border border-red-500/20 bg-red-500/5 rounded px-2.5 py-1 hover:bg-red-500/10 transition-colors">
                Uninstall
              </button>
            </SettingRow>
          </Section>
        </div>
      </div>
    </PageTransition>
  )
}
