'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Инкассация объединена с экраном смены — редиректим на «Смена и касса».
export default function CashOpsRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/manage/shifts')
  }, [router])
  return null
}
