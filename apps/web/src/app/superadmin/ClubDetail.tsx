'use client'
// ─── Детали клуба: модули (тогглы), подписка, удаление ─────────────────────────
import { useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'
import { Toggle, ConfirmDialog } from '@/components/manage/DesignSystem'
import { saApi, SaApiError } from '@/lib/superadminApi'
import type {
  ClubDetailResponse,
  ClubModule,
  ModulePatchResult,
  SubscriptionResult,
  SubPeriod,
} from './types'
import { SUB_PERIODS } from './types'
import {
  SaField,
  SaInput,
  saSelectStyle,
  SaPrimaryButton,
  SaButton,
  SaErrorBanner,
  SaBadge,
  SaSpinner,
  subStatusView,
  fmtDate,
} from './ui'

// Человекочитаемые названия модулей (fallback — сам ключ).
const MODULE_LABELS: Record<string, string> = {
  pos: 'Касса (POS)',
  menu: 'Меню',
  inventory: 'Склад',
  pricing: 'Тарифы и зоны',
  loyalty: 'Лояльность',
  customers: 'Клиенты',
  balances: 'Депозиты и долги',
  shifts: 'Смены',
  salary: 'Зарплата',
  analytics: 'Аналитика',
  expenses: 'Расходы',
  ai: 'TITAN AI',
  events: 'Мероприятия',
  returns: 'Возвраты',
}

function moduleLabel(key: string): string {
  return MODULE_LABELS[key] ?? key
}

export function ClubDetail({
  clubId,
  onChanged,
  onDeleted,
}: {
  clubId: string
  onChanged: () => void
  onDeleted: () => void
}) {
  const [data, setData] = useState<ClubDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await saApi.get<ClubDetailResponse>(`/clubs/${clubId}`)
      setData(res)
    } catch (e) {
      setError(e instanceof SaApiError ? e.message : 'Не удалось загрузить клуб')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId])

  if (loading && !data) return <SaSpinner label="Загрузка клуба…" />
  if (error && !data)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
        <SaErrorBanner message={error} />
        <SaButton onClick={load}>Повторить</SaButton>
      </div>
    )
  if (!data) return null

  const { club, modules, subscription } = data
  const sv = subStatusView(subscription?.status ?? club.subStatus)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Шапка клуба */}
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 6px', color: 'rgba(255,255,255,0.95)' }}>{club.name}</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <SaBadge tone={sv.tone}>{sv.label}</SaBadge>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: "'JetBrains Mono',monospace" }}>{club.slug}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12 }}>
          <MetaItem icon="link" label="Поддомен" value={club.subdomain ?? '—'} />
          <MetaItem icon="schedule" label="Оплачено до" value={fmtDate(subscription?.paidUntil ?? club.subPaidUntil)} />
        </div>
      </div>

      {/* Модули */}
      <Section title="Модули">
        {modules.length === 0 ? (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>Модули не настроены</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {modules.map((m) => (
              <ModuleRow key={m.moduleKey} clubId={clubId} module={m} onChanged={onChanged} />
            ))}
          </div>
        )}
      </Section>

      {/* Подписка */}
      <Section title="Подписка">
        <SubscriptionForm
          clubId={clubId}
          onSaved={() => {
            load()
            onChanged()
          }}
        />
      </Section>

      {/* Удаление */}
      <Section title="Опасная зона">
        <DeleteClub clubName={club.name} clubId={clubId} onDeleted={onDeleted} />
      </Section>
    </div>
  )
}

// ─── Строка модуля (оптимистичный тоггл с откатом при ошибке) ──────────────────

function ModuleRow({ clubId, module, onChanged }: { clubId: string; module: ClubModule; onChanged: () => void }) {
  const [enabled, setEnabled] = useState(module.enabled)
  const [pending, setPending] = useState(false)
  const [err, setErr] = useState('')

  async function toggle(next: boolean) {
    if (pending) return
    setEnabled(next)
    setPending(true)
    setErr('')
    try {
      const res = await saApi.patch<ModulePatchResult>(`/clubs/${clubId}/modules`, {
        moduleKey: module.moduleKey,
        enabled: next,
      })
      setEnabled(res.module.enabled)
      onChanged()
    } catch (e) {
      setEnabled(!next) // откат
      setErr(e instanceof SaApiError ? e.message : 'Ошибка')
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '11px 14px',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        opacity: pending ? 0.7 : 1,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 500, margin: 0, color: 'rgba(255,255,255,0.9)' }}>{moduleLabel(module.moduleKey)}</p>
        {err && <p style={{ fontSize: 11, color: '#FB7185', margin: '2px 0 0' }}>{err}</p>}
      </div>
      <Toggle value={enabled} onChange={toggle} ariaLabel={`Модуль ${moduleLabel(module.moduleKey)}`} />
    </div>
  )
}

// ─── Форма подписки ────────────────────────────────────────────────────────────

function SubscriptionForm({ clubId, onSaved }: { clubId: string; onSaved: () => void }) {
  const [period, setPeriod] = useState<SubPeriod>('1m')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savedAt, setSavedAt] = useState(0)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const amt = parseFloat(amount.replace(',', '.'))
      await saApi.post<SubscriptionResult>(`/clubs/${clubId}/subscription`, {
        period,
        amount: Number.isFinite(amt) ? amt : 0,
      })
      setSavedAt(Date.now())
      setAmount('')
      onSaved()
      setTimeout(() => setSavedAt(0), 2000)
    } catch (e) {
      setError(e instanceof SaApiError ? e.message : 'Не удалось продлить подписку')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SaField label="Период">
        <select value={period} onChange={(e) => setPeriod(e.target.value as SubPeriod)} style={saSelectStyle}>
          {SUB_PERIODS.map((p) => (
            <option key={p.value} value={p.value} style={{ background: '#1d1a24' }}>
              {p.label}
            </option>
          ))}
        </select>
      </SaField>
      <SaField label="Сумма, ₽" hint="0 — для бесплатного / триального периода">
        <SaInput
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
        />
      </SaField>
      {error && <SaErrorBanner message={error} />}
      <SaPrimaryButton
        type="submit"
        loading={loading}
        icon={savedAt ? 'check_circle' : 'payments'}
        style={savedAt ? { background: '#34D399' } : undefined}
      >
        {loading ? 'Сохранение…' : savedAt ? 'Подписка продлена!' : 'Продлить подписку'}
      </SaPrimaryButton>
    </form>
  )
}

// ─── Удаление клуба ────────────────────────────────────────────────────────────

function DeleteClub({ clubId, clubName, onDeleted }: { clubId: string; clubName: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setLoading(true)
    setError('')
    try {
      await saApi.delete(`/clubs/${clubId}`)
      setOpen(false)
      onDeleted()
    } catch (e) {
      setError(e instanceof SaApiError ? e.message : 'Не удалось удалить клуб')
      setLoading(false)
    }
  }

  return (
    <>
      {error && (
        <div style={{ marginBottom: 10 }}>
          <SaErrorBanner message={error} />
        </div>
      )}
      <SaButton variant="danger" icon="delete" onClick={() => setOpen(true)} style={{ width: '100%' }}>
        Удалить клуб
      </SaButton>
      <ConfirmDialog
        open={open}
        onClose={() => !loading && setOpen(false)}
        onConfirm={confirm}
        loading={loading}
        danger
        title="Удалить клуб?"
        message={`Клуб «${clubName}» будет удалён (мягко). Доступ к нему прекратится. Действие можно отменить только через бэкенд.`}
        confirmLabel="Удалить"
        cancelLabel="Отмена"
      />
    </>
  )
}

// ─── Мелкие вспомогательные элементы ───────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'rgba(204,195,216,0.6)',
          margin: '0 0 12px',
        }}
      >
        {title}
      </p>
      {children}
    </div>
  )
}

function MetaItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icon name={icon} size={16} color="rgba(167,139,250,0.7)" />
      <div>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', margin: '1px 0 0', fontWeight: 600 }}>{value}</p>
      </div>
    </div>
  )
}
