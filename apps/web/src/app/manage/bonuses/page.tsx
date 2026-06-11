'use client'
// Бонусы переехали во вкладку единого экрана «Лояльность». Роут сохранён как редирект
// для старых ссылок/закладок.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function BonusesRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/manage/loyalty?tab=bonuses') }, [router])
  return null
}
