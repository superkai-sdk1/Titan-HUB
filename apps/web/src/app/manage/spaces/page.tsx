'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Раздел «Зоны» переехал во вкладку «Аренда» экрана «Тарифы и аренда».
export default function SpacesRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/manage/pricing?tab=rental')
  }, [router])
  return null
}
