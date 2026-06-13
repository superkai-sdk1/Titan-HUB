'use client'
// ─── Переиспользуемые формы/блоки клуба (извлечены из старого ClubDetail) ──────
//
// Эти компоненты используются и на странице клуба (clubs/[id]), и в мастере
// создания (new). Логика/стили перенесены verbatim из ClubDetail.tsx.
import { useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'
import { Toggle, ConfirmDialog } from '@/components/manage/DesignSystem'
import { saApi, SaApiError } from '@/lib/superadminApi'
import type {
  ClubModule,
  ModulePatchResult,
  SubscriptionResult,
  SubPeriod,
  ClubProfileResponse,
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
} from './ui'

// Алиас на канонический тип (ClubDetail исторически объявлял локальный).
export type ClubProfileResp = ClubProfileResponse

// Человекочитаемые названия модулей (ключи совпадают с DEFAULT_ENABLED/DISABLED
// из provisioning.ts). Fallback — сам ключ.
export const MODULE_LABELS: Record<string, string> = {
  pos: 'Касса (POS)',
  menu: 'Меню',
  pricing: 'Тарифы и зоны',
  spaces: 'Зоны и столы',
  inventory: 'Склад',
  supplies: 'Поставки',
  clients: 'Клиенты',
  customers: 'Заказчики',
  discounts: 'Скидки',
  certificates: 'Сертификаты',
  staff: 'Сотрудники',
  shifts: 'Смены',
  salary: 'Зарплата',
  cashops: 'Касса и инкассация',
  expenses: 'Расходы',
  refunds: 'Возвраты',
  analytics: 'Аналитика',
  events: 'Мероприятия',
  notifications: 'Уведомления',
  ai: 'TITAN AI',
  platega: 'Оплата СБП (Platega)',
  // Инфраструктурные — в тогглах не показываем.
  system: 'Система',
  upload: 'Загрузка файлов',
  auth: 'Авторизация',
}

// Группы модулей (каталоги) для аккуратного вида вместо плоского списка.
export const MODULE_GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Продажи и POS', keys: ['pos', 'menu', 'pricing', 'spaces'] },
  { title: 'Склад', keys: ['inventory', 'supplies'] },
  { title: 'Клиенты и лояльность', keys: ['clients', 'customers', 'discounts', 'certificates'] },
  { title: 'Персонал и смены', keys: ['staff', 'shifts', 'salary'] },
  { title: 'Финансы', keys: ['cashops', 'expenses', 'refunds', 'analytics'] },
  { title: 'Дополнительно', keys: ['events', 'notifications', 'ai', 'platega'] },
]

// Инфраструктурные модули — скрываем из тогглов (выключать нельзя/незачем).
export const HIDDEN_MODULES = new Set(['system', 'upload', 'auth'])

export function moduleLabel(key: string): string {
  return MODULE_LABELS[key] ?? key
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

// ─── Модули по каталогам ───────────────────────────────────────────────────────

export function GroupedModules({ clubId, modules, onChanged }: { clubId: string; modules: ClubModule[]; onChanged: () => void }) {
  const byKey = new Map(modules.map((m) => [m.moduleKey, m]))
  const used = new Set<string>()
  const groups = MODULE_GROUPS.map((g) => ({
    title: g.title,
    items: g.keys
      .map((k) => byKey.get(k))
      .filter((m): m is ClubModule => {
        if (m) { used.add(m.moduleKey); return true }
        return false
      }),
  })).filter((g) => g.items.length > 0)

  // Прочие модули из БД, не попавшие в группы и не инфраструктурные.
  const others = modules.filter((m) => !used.has(m.moduleKey) && !HIDDEN_MODULES.has(m.moduleKey))
  if (others.length) groups.push({ title: 'Прочее', items: others })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {groups.map((g) => (
        <div key={g.title}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(167,139,250,0.75)', letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 8px' }}>{g.title}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {g.items.map((m) => (
              <ModuleRow key={m.moduleKey} clubId={clubId} module={m} onChanged={onChanged} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Профиль заведения ─────────────────────────────────────────────────────────

export function VenueProfileForm({
  clubId,
  profile,
  onSaved,
}: {
  clubId: string
  profile: ClubProfileResp['profile'] | null
  onSaved: () => void
}) {
  const [name, setName] = useState(profile?.venue_name ?? '')
  const [address, setAddress] = useState(profile?.venue_address ?? '')
  const [bizHour, setBizHour] = useState(profile?.business_day_start_hour ?? '9')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (profile) {
      setName(profile.venue_name)
      setAddress(profile.venue_address)
      setBizHour(profile.business_day_start_hour || '9')
    }
  }, [profile])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSaved(false)
    try {
      await saApi.patch(`/clubs/${clubId}/profile`, {
        venue_name: name.trim(),
        venue_address: address.trim(),
        business_day_start_hour: String(parseInt(bizHour, 10) || 9),
      })
      setSaved(true)
      onSaved()
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof SaApiError ? e.message : 'Не удалось сохранить профиль')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SaField label="Название заведения">
        <SaInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Titan Club" />
      </SaField>
      <SaField label="Адрес">
        <SaInput value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Город, улица, дом" />
      </SaField>
      <SaField label="Начало бизнес-дня (час)" hint="Граница операционных суток для смен и отчётов (по умолчанию 9 = 09:00).">
        <select value={bizHour} onChange={(e) => setBizHour(e.target.value)} style={saSelectStyle}>
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={String(h)} style={{ background: '#1d1a24' }}>
              {String(h).padStart(2, '0')}:00
            </option>
          ))}
        </select>
      </SaField>
      {error && <SaErrorBanner message={error} />}
      <SaPrimaryButton
        type="submit"
        loading={loading}
        icon={saved ? 'check_circle' : 'store'}
        style={saved ? { background: '#34D399' } : undefined}
      >
        {loading ? 'Сохранение…' : saved ? 'Сохранено!' : 'Сохранить профиль'}
      </SaPrimaryButton>
    </form>
  )
}

// ─── Владелец заведения (первый вход) ───────────────────────────────────────────

export function OwnerSection({
  clubId,
  owners,
  onChanged,
}: {
  clubId: string
  owners: { id: string; nickname: string }[]
  onChanged: () => void
}) {
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (nickname.trim().length < 2) { setError('Имя — минимум 2 символа'); return }
    if (password.length < 4) { setError('Пароль — минимум 4 символа'); return }
    if (pin && !/^\d{4}$/.test(pin)) { setError('PIN — ровно 4 цифры'); return }
    setLoading(true)
    setCreated('')
    try {
      await saApi.post(`/clubs/${clubId}/owner`, {
        nickname: nickname.trim(),
        password,
        ...(pin ? { pin } : {}),
      })
      setCreated(nickname.trim())
      setNickname('')
      setPassword('')
      setPin('')
      onChanged()
    } catch (e) {
      setError(e instanceof SaApiError ? e.message : 'Не удалось создать владельца')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {owners.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {owners.map((o) => (
            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Icon name="person" size={18} color="#A78BFA" />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>{o.nickname}</span>
              <SaBadge tone="ok">владелец</SaBadge>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: 'rgba(251,191,36,0.9)', margin: 0 }}>
          ⚠️ У заведения ещё нет владельца — без него никто не сможет войти. Создайте первого:
        </p>
      )}

      {created && (
        <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', color: '#34D399', fontSize: 13 }}>
          ✅ Владелец «{created}» создан. Передайте ему логин и пароль для входа.
        </div>
      )}

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SaField label={owners.length > 0 ? 'Добавить ещё владельца — имя (логин)' : 'Имя владельца (логин)'}>
          <SaInput value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Например: Иван" autoComplete="off" />
        </SaField>
        <SaField label="Пароль" hint="Минимум 4 символа. Владелец войдёт по имени и паролю.">
          <SaInput type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль для входа" autoComplete="off" />
        </SaField>
        <SaField label="PIN (необязательно)" hint="4 цифры для быстрого входа на кассе.">
          <SaInput value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="1234" autoComplete="off" />
        </SaField>
        {error && <SaErrorBanner message={error} />}
        <SaPrimaryButton type="submit" loading={loading} icon="person_add">
          {loading ? 'Создание…' : 'Создать владельца'}
        </SaPrimaryButton>
      </form>
    </div>
  )
}

// ─── Форма подписки ────────────────────────────────────────────────────────────

export function SubscriptionForm({ clubId, onSaved }: { clubId: string; onSaved: () => void }) {
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

// ─── Платёжная ссылка Platega (для отправки клубу) ─────────────────────────────

const PAID_PERIODS = SUB_PERIODS.filter((p) => p.value !== 'trial_7d')

export function PaymentLinkForm({ clubId }: { clubId: string }) {
  const [period, setPeriod] = useState<Exclude<SubPeriod, 'trial_7d'>>('1m')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setLink('')
    try {
      const amt = parseFloat(amount.replace(',', '.'))
      if (!Number.isFinite(amt) || amt <= 0) {
        setError('Укажите сумму больше 0')
        return
      }
      const res = await saApi.post<{ redirect: string | null }>(
        `/clubs/${clubId}/subscription/payment-link`,
        { period, amount: amt },
      )
      if (!res.redirect) {
        setError('Platega не вернула ссылку')
        return
      }
      setLink(res.redirect)
    } catch (e) {
      setError(e instanceof SaApiError ? e.message : 'Не удалось создать ссылку')
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard недоступен — пользователь скопирует вручную */
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SaField label="Период">
        <select value={period} onChange={(e) => setPeriod(e.target.value as Exclude<SubPeriod, 'trial_7d'>)} style={saSelectStyle}>
          {PAID_PERIODS.map((p) => (
            <option key={p.value} value={p.value} style={{ background: '#1d1a24' }}>
              {p.label}
            </option>
          ))}
        </select>
      </SaField>
      <SaField label="Сумма, ₽" hint="Оплата уйдёт на ваш аккаунт Platega. После оплаты продлите подписку кнопкой выше.">
        <SaInput type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Например: 3000" />
      </SaField>
      {error && <SaErrorBanner message={error} />}
      <SaButton type="submit" icon="link" disabled={loading} style={{ width: '100%' }}>
        {loading ? 'Создание ссылки…' : 'Создать ссылку на оплату'}
      </SaButton>
      {link && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 12, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)' }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ссылка для клуба</p>
          <p style={{ fontSize: 12.5, color: '#34D399', margin: 0, wordBreak: 'break-all', fontFamily: "'JetBrains Mono',monospace" }}>{link}</p>
          <SaButton type="button" icon={copied ? 'check_circle' : 'content_copy'} onClick={copy} style={{ width: '100%', marginTop: 2 }}>
            {copied ? 'Скопировано' : 'Копировать ссылку'}
          </SaButton>
        </div>
      )}
    </form>
  )
}

// ─── Удаление клуба ────────────────────────────────────────────────────────────

export function DeleteClub({ clubId, clubName, onDeleted }: { clubId: string; clubName: string; onDeleted: () => void }) {
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

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
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

export function MetaItem({ icon, label, value }: { icon: string; label: string; value: string }) {
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
