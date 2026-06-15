'use client'
import { use } from 'react'
import { useRouter } from 'next/navigation'
import { CheckDetailView } from '@/components/CheckDetailView'

export default function CheckDetailPage({ params }: { params: Promise<{ checkId: string }> }) {
  const { checkId } = use(params)
  const router = useRouter()

  // Анимация открытия чека на телефоне: всплытие снизу (как лист), своя для мобилы.
  return (
    <div style={{ height: '100%', animation: 'pos-check-in-mobile 300ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
      <CheckDetailView
        checkId={checkId}
        onBack={() => router.back()}
      />
      <style>{`
        @keyframes pos-check-in-mobile {
          from { opacity: 0; transform: translateY(26px) scale(0.985); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          div[style*="pos-check-in-mobile"] { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
