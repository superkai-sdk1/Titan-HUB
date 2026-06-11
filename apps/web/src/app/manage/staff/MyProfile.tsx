'use client'
import React, { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { LBL, INP } from '@/components/manage/DesignSystem'
import { useToast } from '@/components/Toast'
import { useAuthStore } from '@/store/auth.store'
import { Icon } from '@/components/Icon'
import { NotificationsSettings } from './NotificationsSettings'
import { PasskeySettings } from './PasskeySettings'

// Свой профиль (GET /auth/me) — включает permissions/role/nickname/fullName/phone/tgId/tgUsername.
interface MeProfile {
  id: string
  nickname: string
  role: 'owner' | 'staff' | string
  fullName?: string | null
  phone?: string | null
  tgId?: string | null
  tgUsername?: string | null
  permissions?: Record<string, boolean> | null
}

const AVATAR_COLORS = ['#8B5CF6', '#4cd7f6', '#10B981', '#F59E0B', '#F43F5E', '#3B82F6']
function getAvatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

// ─── 4-digit PIN keypad (общий — используется и в управлении чужими PIN) ──────

export function PinKeypad({
  value,
  onChange,
  error,
  label,
}: {
  value: string
  onChange: (v: string) => void
  error?: boolean
  label?: string
}) {
  const PAD = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  function press(key: string) {
    if (key === '⌫') { onChange(value.slice(0, -1)); return }
    if (value.length >= 4) return
    onChange(value + key)
  }

  return (
    <div>
      {label && <label style={LBL}>{label}</label>}

      {/* Dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 20 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: '50%',
            background: i < value.length ? (error ? '#F43F5E' : '#8B5CF6') : 'rgba(255,255,255,0.15)',
            border: `2px solid ${i < value.length ? (error ? '#F43F5E' : '#8B5CF6') : 'rgba(255,255,255,0.2)'}`,
            boxShadow: (i < value.length && !error) ? '0 0 10px rgba(139,92,246,0.6)' : 'none',
            transition: 'all 0.15s',
            transform: i < value.length ? 'scale(1.15)' : 'scale(1)',
          }} />
        ))}
      </div>

      {/* Keypad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {PAD.map((key, idx) => {
          if (key === '') return <div key={idx} />
          const isDel = key === '⌫'
          return (
            <button
              key={idx}
              onClick={() => press(key)}
              aria-label={isDel ? 'Стереть' : key}
              className="glass-l2"
              style={{
                padding: '14px 0', borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.08)',
                background: isDel ? 'transparent' : 'rgba(255,255,255,0.04)',
                color: 'var(--on-surface)', fontSize: isDel ? 18 : 22, fontWeight: 600,
                cursor: 'pointer', transition: 'background 0.12s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseDown={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.15)' }}
              onMouseUp={e => { e.currentTarget.style.background = isDel ? 'transparent' : 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { e.currentTarget.style.background = isDel ? 'transparent' : 'rgba(255,255,255,0.04)' }}
            >
              {key}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Разделитель-заголовок секции ────────────────────────────────────────────

function SectionTitle({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div style={{ margin: '8px 4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={18} color="#A78BFA" />
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--on-surface)' }}>{title}</h2>
      </div>
      {hint && <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '4px 0 0' }}>{hint}</p>}
    </div>
  )
}

// ─── Мой профиль ──────────────────────────────────────────────────────────────

export function MyProfile() {
  const qc = useQueryClient()
  const { show } = useToast()
  const storeUser = useAuthStore(s => s.user)

  const { data: me } = useQuery<MeProfile>({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get('/auth/me'),
  })

  const nickname = me?.nickname ?? storeUser?.nickname ?? '—'
  const role = me?.role ?? storeUser?.role ?? 'staff'
  const roleLabel = role === 'owner' ? 'Владелец' : 'Персонал'

  // ── Форма «Данные» ───────────────────────────────────────────────────────
  const [formNickname, setFormNickname] = useState('')
  const [formFullName, setFormFullName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  useEffect(() => {
    if (!me) return
    setFormNickname(me.nickname ?? '')
    setFormFullName(me.fullName ?? '')
    setFormPhone(me.phone ?? '')
  }, [me])

  const saveData = useMutation({
    mutationFn: (body: { nickname?: string; fullName?: string; phone?: string }) => api.patch('/auth/me', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'me'] })
      show('Данные сохранены', 'success')
    },
    onError: (e: any) => show(e?.message || 'Не удалось сохранить данные', 'error'),
  })

  function submitData() {
    const body: { nickname?: string; fullName?: string; phone?: string } = {}
    if (formNickname.trim() && formNickname.trim() !== (me?.nickname ?? '')) body.nickname = formNickname.trim()
    body.fullName = formFullName.trim()
    body.phone = formPhone.trim()
    saveData.mutate(body)
  }

  // ── Смена своего PIN ─────────────────────────────────────────────────────
  const [pinValue, setPinValue] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinStep, setPinStep] = useState<'enter' | 'confirm'>('enter')
  const [pinError, setPinError] = useState(false)
  const [pinSuccess, setPinSuccess] = useState(false)

  const setPin = useMutation({
    mutationFn: (pin: string) => api.post('/auth/pin/set', { pin }),
    onSuccess: () => {
      setPinSuccess(true)
      setTimeout(() => {
        setPinSuccess(false)
        setPinValue('')
        setPinConfirm('')
        setPinStep('enter')
      }, 1500)
    },
    onError: () => {
      show('Не удалось сменить PIN', 'error')
      setPinValue('')
      setPinConfirm('')
      setPinStep('enter')
    },
  })

  function handlePinInput(v: string) {
    if (pinStep === 'enter') {
      setPinValue(v)
      if (v.length === 4) setTimeout(() => setPinStep('confirm'), 200)
    } else {
      setPinConfirm(v)
      if (v.length === 4) {
        setTimeout(() => {
          if (v === pinValue) {
            setPin.mutate(pinValue)
          } else {
            setPinError(true)
            setTimeout(() => {
              setPinValue('')
              setPinConfirm('')
              setPinStep('enter')
              setPinError(false)
            }, 800)
          }
        }, 200)
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* ─── Шапка-карточка ─────────────────────────────────────────────── */}
      <div className="glass-l2" style={{ borderRadius: 18, padding: '18px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 60, height: 60, borderRadius: '50%', flexShrink: 0,
          background: getAvatarColor(nickname),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 24, color: '#fff',
        }}>
          {nickname[0]?.toUpperCase() ?? '?'}
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--on-surface)' }}>{nickname}</p>
          <span style={{
            display: 'inline-block', marginTop: 5,
            fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 999,
            background: role === 'owner' ? 'rgba(245,158,11,0.15)' : 'rgba(139,92,246,0.15)',
            color: role === 'owner' ? '#F59E0B' : '#A78BFA',
          }}>{roleLabel}</span>
        </div>
      </div>

      {/* ─── Данные ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SectionTitle icon="badge" title="Данные" />
        <div className="glass-l2" style={{ borderRadius: 18, padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={LBL}>Никнейм</label>
            <input style={INP} placeholder="Никнейм" value={formNickname} onChange={e => setFormNickname(e.target.value)} />
          </div>
          <div>
            <label style={LBL}>Имя</label>
            <input style={INP} placeholder="Полное имя" value={formFullName} onChange={e => setFormFullName(e.target.value)} />
          </div>
          <div>
            <label style={LBL}>Телефон</label>
            <input style={INP} placeholder="+7 999 000 00 00" value={formPhone} onChange={e => setFormPhone(e.target.value)} />
          </div>
          <button
            onClick={submitData}
            disabled={saveData.isPending}
            style={{
              width: '100%', padding: '13px', borderRadius: 14, border: 'none', cursor: saveData.isPending ? 'default' : 'pointer',
              background: 'linear-gradient(135deg,#8B5CF6,#4cd7f6)', color: '#fff', fontWeight: 700, fontSize: 14,
              opacity: saveData.isPending ? 0.6 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Icon name="save" size={18} />
            {saveData.isPending ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>

      {/* ─── Свой PIN ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SectionTitle icon="pin" title="PIN-код" hint="4 цифры для быстрого входа на этом устройстве." />
        <div className="glass-l2" style={{ borderRadius: 18, padding: '18px 16px' }}>
          {pinSuccess ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '8px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', border: '2px solid #10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check_circle" size={34} color="#10B981" />
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#10B981', margin: 0 }}>PIN обновлён!</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0, textAlign: 'center' }}>
                {pinStep === 'enter' ? 'Введите новый 4-значный PIN' : 'Введите PIN ещё раз для подтверждения'}
              </p>
              <PinKeypad
                value={pinStep === 'enter' ? pinValue : pinConfirm}
                onChange={handlePinInput}
                error={pinError}
              />
              {pinError && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', fontSize: 13, textAlign: 'center' }}>
                  PIN-коды не совпадают — попробуйте снова
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Уведомления ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SectionTitle icon="notifications" title="Уведомления" hint="Какие уведомления получать и куда." />
        <NotificationsSettings />
      </div>

      {/* ─── Passkey ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SectionTitle icon="fingerprint" title="Passkey / биометрия" hint="Вход по Face ID / Touch ID / ключу безопасности." />
        <PasskeySettings />
      </div>
    </div>
  )
}
