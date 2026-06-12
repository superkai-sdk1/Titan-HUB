'use client'
// AI-помощник (TITAN AI) переехал на экран /ai (вызывается из навигации). Роут
// сохранён как редирект для старых ссылок/закладок.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AiRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/ai') }, [router])
  return null
}
