'use client'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export function ManageLayout({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  const router = useRouter()
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 bg-background/95 backdrop-blur border-b border-border z-30 px-4 py-3 safe-top flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-muted-foreground">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-bold text-lg flex-1">{title}</h1>
        {action}
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  )
}
