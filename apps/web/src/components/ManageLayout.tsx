'use client'
import { useRouter } from 'next/navigation'

export function ManageLayout({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  const router = useRouter()
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--background)' }}>
      <div style={{ position: 'sticky', top: 0, background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.06)', zIndex: 30, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ padding: 8, marginLeft: -8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)', display: 'flex' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
        </button>
        <h1 style={{ fontWeight: 700, fontSize: 18, flex: 1, margin: 0, color: 'var(--on-surface)' }}>{title}</h1>
        {action}
      </div>
      <div style={{ padding: '16px' }}>{children}</div>
    </div>
  )
}
