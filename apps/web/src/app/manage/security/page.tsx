'use client'
// «Мой Passkey» переехал в профиль единого экрана «Сотрудники» (/manage/staff).
// Роут сохранён как редирект для старых ссылок/закладок.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SecurityRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/manage/staff') }, [router])
  return null
}
