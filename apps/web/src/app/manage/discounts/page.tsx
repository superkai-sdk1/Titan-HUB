'use client'
// Скидки переехали во вкладку единого экрана «Лояльность». Роут сохранён как редирект
// для старых ссылок/закладок.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DiscountsRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/manage/loyalty?tab=discounts') }, [router])
  return null
}
