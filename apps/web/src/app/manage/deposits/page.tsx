'use client'
// Депозиты переехали во вкладку единого экрана «Депозиты и долги».
// Роут сохранён как редирект для старых ссылок/закладок.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DepositsRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/manage/balances?tab=deposits') }, [router])
  return null
}
