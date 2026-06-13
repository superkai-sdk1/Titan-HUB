'use client'
// ─── /superadmin/new — ПОШАГОВЫЙ МАСТЕР создания заведения ─────────────────────
//
// 5 шагов: Основное → Профиль → Владелец → Подписка → Финал. clubId получаем
// на шаге 1 (POST /clubs) и переиспользуем формы из clubParts на шагах 2-4.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { saApi, SaApiError } from '@/lib/superadminApi'
import type { CreateClubResult } from '../types'
import { useSaUnauthorized } from '../layout'
import { VenueProfileForm, OwnerSection, SubscriptionForm } from '../clubParts'
import {
  SaPageHeader,
  SaField,
  SaInput,
  SaPrimaryButton,
  SaButton,
  SaErrorBanner,
  ACCENT,
} from '../ui'

const SLUG_RE = /^[a-z][a-z0-9-]{1,30}$/

// Подписи шагов степпера (1..4 — реальные шаги ввода; 5 — финал, без кружка).
const STEPS = [
  { n: 1, label: 'Основное' },
  { n: 2, label: 'Профиль' },
  { n: 3, label: 'Владелец' },
  { n: 4, label: 'Подписка' },
]

export default function NewClubWizard() {
  const router = useRouter()
  const signalUnauthorized = useSaUnauthorized()

  const [step, setStep] = useState(1)
  const [clubId, setClubId] = useState('')

  // Шаг 1.
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [subdomainTouched, setSubdomainTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Авто-поддомен из slug, пока поле не переопределили вручную.
  const effectiveSubdomain = subdomainTouched ? subdomain : slug ? `${slug}.titanpos.ru` : ''

  function onSlugChange(v: string) {
    setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ''))
  }

  async function createClub() {
    setError('')
    if (!SLUG_RE.test(slug)) {
      setError('Slug: латиница, начинается с буквы, 2–31 символ (a-z, 0-9, дефис).')
      return
    }
    if (name.trim().length < 2) {
      setError('Название — минимум 2 символа.')
      return
    }
    setLoading(true)
    try {
      const sub = (subdomainTouched ? subdomain : effectiveSubdomain).trim()
      const res = await saApi.post<CreateClubResult>('/clubs', {
        slug,
        name: name.trim(),
        ...(sub ? { subdomain: sub } : {}),
      })
      setClubId(res.club.id)
      setStep(2)
    } catch (e) {
      if (e instanceof SaApiError && e.status === 401) {
        signalUnauthorized()
        return
      }
      setError(e instanceof SaApiError ? e.message : 'Не удалось создать заведение')
    } finally {
      setLoading(false)
    }
  }

  const finalSubdomain = subdomainTouched ? subdomain.trim() : effectiveSubdomain

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <SaPageHeader onBack={() => router.push('/superadmin')} title="Новое заведение" />

      {/* Степпер */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
        {STEPS.map((s, i) => {
          const done = step > s.n
          const active = step === s.n
          return (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 64 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 700,
                    flexShrink: 0,
                    background: active
                      ? `linear-gradient(135deg, ${ACCENT}, #6366f1)`
                      : done
                        ? 'rgba(52,211,153,0.15)'
                        : 'rgba(255,255,255,0.05)',
                    color: active ? '#fff' : done ? '#34D399' : 'rgba(255,255,255,0.4)',
                    border: active ? 'none' : done ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(255,255,255,0.1)',
                    boxShadow: active ? '0 0 16px rgba(139,92,246,0.4)' : 'none',
                  }}
                >
                  {done ? <Icon name="check_circle" size={18} color="#34D399" /> : s.n}
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: active ? '#A78BFA' : 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap' }}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ width: 24, height: 2, borderRadius: 2, background: step > s.n ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.1)', marginBottom: 18 }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Контент шага */}
      <div className="glass-l2" style={{ borderRadius: 18, padding: '22px' }}>
        {/* Шаг 1 — Основное */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SaField label="Slug (идентификатор)" hint="Латиница, начинается с буквы. Используется в имени БД. Изменить позже сложно.">
              <SaInput value={slug} onChange={(e) => onSlugChange(e.target.value)} placeholder="titan-club" autoComplete="off" />
            </SaField>
            <SaField label="Название заведения">
              <SaInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Titan Club" autoComplete="off" />
            </SaField>
            <SaField label="Поддомен" hint="По умолчанию формируется из slug. Можно переопределить.">
              <SaInput
                value={effectiveSubdomain}
                onChange={(e) => {
                  setSubdomainTouched(true)
                  setSubdomain(e.target.value.trim())
                }}
                placeholder="titan-club.titanpos.ru"
                autoComplete="off"
              />
            </SaField>
            {error && <SaErrorBanner message={error} />}
            <SaPrimaryButton icon="add" loading={loading} onClick={createClub}>
              {loading ? 'Создаю заведение и базу данных…' : 'Создать заведение'}
            </SaPrimaryButton>
          </div>
        )}

        {/* Шаг 2 — Профиль */}
        {step === 2 && clubId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <VenueProfileForm clubId={clubId} profile={null} onSaved={() => setStep(3)} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <SaButton icon="chevron_left" onClick={() => setStep(1)}>
                Назад
              </SaButton>
              <SaButton variant="ghost" onClick={() => setStep(3)}>
                Пропустить
              </SaButton>
            </div>
          </div>
        )}

        {/* Шаг 3 — Владелец */}
        {step === 3 && clubId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                background: 'rgba(251,191,36,0.1)',
                border: '1px solid rgba(251,191,36,0.28)',
                color: '#FBBF24',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Icon name="warning" size={16} color="#FBBF24" />
              Без владельца в заведение нельзя войти.
            </div>
            <OwnerSection clubId={clubId} owners={[]} onChanged={() => { /* владелец создан — продолжаем кнопкой «Далее» */ }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <SaButton icon="chevron_left" onClick={() => setStep(2)}>
                Назад
              </SaButton>
              <SaButton variant="secondary" icon="chevron_right" onClick={() => setStep(4)}>
                Далее
              </SaButton>
            </div>
          </div>
        )}

        {/* Шаг 4 — Подписка */}
        {step === 4 && clubId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SubscriptionForm clubId={clubId} onSaved={() => setStep(5)} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <SaButton icon="chevron_left" onClick={() => setStep(3)}>
                Назад
              </SaButton>
              <SaButton variant="ghost" onClick={() => setStep(5)}>
                Пропустить (триал активен)
              </SaButton>
            </div>
          </div>
        )}

        {/* Шаг 5 — Финал */}
        {step === 5 && clubId && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center', padding: '12px 0' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'rgba(52,211,153,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="check_circle" size={32} color="#34D399" />
            </div>
            <div>
              <p style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'rgba(255,255,255,0.95)' }}>Заведение готово</p>
              {finalSubdomain && (
                <a
                  href={`https://${finalSubdomain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 13, color: '#A78BFA', textDecoration: 'none', marginTop: 6, display: 'inline-block' }}
                >
                  {finalSubdomain}
                </a>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
              <SaButton variant="secondary" icon="store" onClick={() => router.push(`/superadmin/clubs/${clubId}`)}>
                Открыть заведение
              </SaButton>
              <SaButton variant="ghost" onClick={() => router.push('/superadmin')}>
                На дашборд
              </SaButton>
            </div>
          </div>
        )}

        {/* Защита: шаги 2-5 требуют clubId. */}
        {step >= 2 && !clubId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SaErrorBanner message="Заведение ещё не создано. Вернитесь к первому шагу." />
            <SaButton icon="chevron_left" onClick={() => setStep(1)} style={{ width: 'auto' }}>
              К началу
            </SaButton>
          </div>
        )}
      </div>
    </div>
  )
}
