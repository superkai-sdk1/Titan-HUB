'use client'
// ─── Форма создания нового клуба ───────────────────────────────────────────────
import { useState, useRef, useEffect } from 'react'
import { saApi, SaApiError } from '@/lib/superadminApi'
import type { CreateClubResult } from './types'
import { SaField, SaInput, SaPrimaryButton, SaErrorBanner } from './ui'

// Slug: a-z0-9-, начинается с буквы. Валидация на клиенте — для мгновенной
// подсказки; источник истины всё равно бэкенд (вернёт ошибку при дубле и т.п.).
const SLUG_RE = /^[a-z][a-z0-9-]*$/

export function CreateClubForm({ onCreated }: { onCreated: () => void }) {
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const slugRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    slugRef.current?.focus()
  }, [])

  const slugValid = slug === '' || SLUG_RE.test(slug)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!slug || !name) return
    if (!SLUG_RE.test(slug)) {
      setError('Slug: только строчные латинские буквы, цифры и дефис; начинается с буквы')
      return
    }
    setLoading(true)
    setError('')
    try {
      await saApi.post<CreateClubResult>('/clubs', {
        slug,
        name,
        ...(subdomain.trim() ? { subdomain: subdomain.trim() } : {}),
      })
      onCreated()
    } catch (e) {
      // Бэкенд вернёт читаемую ошибку при невалидном slug / дубле.
      setError(e instanceof SaApiError ? e.message : 'Не удалось создать клуб')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SaField label="Slug" hint="Латиница, цифры, дефис; начинается с буквы. Например: night-club">
        <SaInput
          ref={slugRef}
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
          placeholder="my-club"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={!slugValid ? { borderColor: 'rgba(244,63,94,0.6)' } : undefined}
        />
      </SaField>

      <SaField label="Название">
        <SaInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Мой клуб" />
      </SaField>

      <SaField label="Поддомен (опционально)" hint="Если задан — клуб откроется на этом поддомене.">
        <SaInput
          value={subdomain}
          onChange={(e) => setSubdomain(e.target.value.toLowerCase().trim())}
          placeholder="my-club"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </SaField>

      {error && <SaErrorBanner message={error} />}

      <SaPrimaryButton type="submit" loading={loading} disabled={!slug || !name || !slugValid} icon="add">
        {loading ? 'Создание…' : 'Создать клуб'}
      </SaPrimaryButton>
    </form>
  )
}
