'use client'
// «Смена и касса» переехала под /manage/shifts (открывается в split-режиме на
// десктопе). Роут сохранён как редирект для старых ссылок/уведомлений.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ShiftsRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/manage/shifts') }, [router])
  return null
}
