import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#0a0a0a',
        surface: '#111111',
        'surface-raised': '#161616',
        'surface-overlay': '#1c1c1c',
        accent: '#7c6aff',
        'accent-dim': 'rgba(124,106,255,0.12)',
        critical: '#ef4444',
        'critical-dim': 'rgba(239,68,68,0.10)',
        warning: '#f59e0b',
        'warning-dim': 'rgba(245,158,11,0.10)',
        info: '#3b82f6',
        'info-dim': 'rgba(59,130,246,0.10)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['12px', { lineHeight: '16px' }],
      },
      borderColor: {
        DEFAULT: 'rgba(255,255,255,0.06)',
      },
    },
  },
  plugins: [],
}

export default config
