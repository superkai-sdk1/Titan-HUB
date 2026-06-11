'use client'
// AI-помощник переехал во вкладку экрана «Аналитика». Роут сохранён как редирект
// для старых ссылок/закладок.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AiRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/dashboard?tab=ai') }, [router])
  return null
}
