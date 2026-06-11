'use client'
// Уведомления переехали в профиль единого экрана «Сотрудники» (/manage/staff).
// Роут сохранён как редирект для старых ссылок/закладок.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NotificationsRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/manage/staff') }, [router])
  return null
}
