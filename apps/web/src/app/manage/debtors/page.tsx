'use client'
// Должники переехали во вкладку единого экрана «Депозиты и долги».
// Роут сохранён как редирект для старых ссылок/закладок.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DebtorsRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/manage/balances?tab=debts') }, [router])
  return null
}
