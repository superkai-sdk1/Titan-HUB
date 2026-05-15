'use client'
// Редирект на /manage/events
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function EventsRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/manage/events') }, [router])
  return null
}
