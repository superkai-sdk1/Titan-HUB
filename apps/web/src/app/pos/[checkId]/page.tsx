'use client'
import { use } from 'react'
import { useRouter } from 'next/navigation'
import { CheckDetailView } from '@/components/CheckDetailView'

export default function CheckDetailPage({ params }: { params: Promise<{ checkId: string }> }) {
  const { checkId } = use(params)
  const router = useRouter()

  return (
    <CheckDetailView
      checkId={checkId}
      onBack={() => router.back()}
    />
  )
}
