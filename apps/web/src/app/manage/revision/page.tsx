'use client'
// Ревизия переехала во вкладку единого экрана «Склад». Роут сохранён как редирект
// для старых ссылок/закладок.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RevisionRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/manage/inventory?tab=revision') }, [router])
  return null
}
