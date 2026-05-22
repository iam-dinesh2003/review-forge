import type { ReactNode } from 'react'
import Sidebar from './Sidebar'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 lg:ml-52 overflow-auto min-h-screen pt-14 lg:pt-0">
        {children}
      </main>
    </div>
  )
}
