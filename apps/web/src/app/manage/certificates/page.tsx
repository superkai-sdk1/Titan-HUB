'use client'
// Сертификаты переехали во вкладку единого экрана «Лояльность». Роут сохранён как
// редирект для старых ссылок/закладок.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function CertificatesRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/manage/loyalty?tab=certificates') }, [router])
  return null
}
