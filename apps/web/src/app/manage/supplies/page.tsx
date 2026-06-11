'use client'
// Поставки переехали во вкладку единого экрана «Склад». Роут сохранён как редирект
// для старых ссылок/закладок.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SuppliesRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/manage/inventory?tab=supplies') }, [router])
  return null
}
