'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Экран «Расходы» переехал во вкладку раздела «Склад» (/manage/inventory?tab=expenses).
export default function ExpensesRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/manage/inventory?tab=expenses') }, [router])
  return null
}
