'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Экран «Расходы» переехал во вкладку аналитики (/dashboard?tab=expenses).
export default function ExpensesRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/dashboard?tab=expenses') }, [router])
  return null
}
