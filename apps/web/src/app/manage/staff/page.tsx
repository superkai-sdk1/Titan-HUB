'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Sheet, LBL, INP, SEL } from '@/components/manage/DesignSystem'

interface StaffMember {
  id: string
  nickname: string
  role: 'owner' | 'staff'
  phone?: string
  permissions?: Record<string, boolean>
}

const DEFAULT_PERMISSIONS: Record<string, boolean> = {
  menu: true, inventory: true, supplies: true, clients: true,
  discounts: true, bonus: true, expenses: false, debtors: false,
  staff: false, salary: false, about: true,
}

const PERMISSION_LABELS = [
  { key: 'menu',      label: 'Меню',          icon: 'restaurant_menu' },
  { key: 'inventory', label: 'Инвентарь',     icon: 'inventory_2' },
  { key: 'supplies',  label: 'Снабжение',     icon: 'local_shipping' },
  { key: 'clients',   label: 'Клиенты',       icon: 'group' },
  { key: 'discounts', label: 'Скидки',        icon: 'discount' },
  { key: 'bonus',     label: 'Бонусы',        icon: 'loyalty' },
  { key: 'expenses',  label: 'Расходы',       icon: 'payments' },
  { key: 'debtors',   label: 'Должники',      icon: 'account_balance_wallet' },
  { key: 'staff',     label: 'Персонал',      icon: 'badge' },
  { key: 'salary',    label: 'Зарплата',      icon: 'savings' },
  { key: 'about',     label: 'О заведении',   icon: 'info' },
]

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  owner: { label: 'Владелец', color: '#F59E0B' },
  staff: { label: 'Персонал', color: '#8B5CF6' },
}

const AVATAR_COLORS = ['#8B5CF6', '#4cd7f6', '#10B981', '#F59E0B', '#F43F5E', '#3B82F6']
function getAvatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

// ─── Mini helpers ──────────────────────────────────────────────────────────

function MiniToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: value ? 'linear-gradient(135deg,#8B5CF6,#4cd7f6)' : 'rgba(255,255,255,0.1)',
        position: 'relative', transition: 'background 0.2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: value ? 21 : 3, width: 16, height: 16, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }} />
    </button>
  )
}

function PermissionRow({ label, icon, value, onChange }: { label: string; icon: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--on-surface-variant)', width: 18, flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13, color: 'var(--on-surface)', fontWeight: 500 }}>{label}</span>
      <MiniToggle value={value} onChange={onChange} />
    </div>
  )
}

// ─── 4-digit PIN keypad ────────────────────────────────────────────────────

function PinKeypad({
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

// ─── Main page ─────────────────────────────────────────────────────────────

export default function StaffPage() {
  const qc = useQueryClient()

  // Sheets
  const [selected, setSelected] = useState<StaffMember | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<StaffMember | null>(null)
  const [showPin, setShowPin] = useState(false)
  const [pinTarget, setPinTarget] = useState<StaffMember | null>(null)

  // Create / Edit form
  const [formNickname, setFormNickname] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formRole, setFormRole] = useState<'staff' | 'owner'>('staff')
  const [formPassword, setFormPassword] = useState('')
  const [formPinStep, setFormPinStep] = useState(false) // show PIN keypad after filling main fields
  const [formPin, setFormPin] = useState('')

  // PIN reset
  const [pinValue, setPinValue] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinStep, setPinStep] = useState<'enter' | 'confirm'>('enter')
  const [pinError, setPinError] = useState(false)
  const [pinSuccess, setPinSuccess] = useState(false)

  // Permissions
  const [perms, setPerms] = useState<Record<string, boolean>>(DEFAULT_PERMISSIONS)
  const [permsSaved, setPermsSaved] = useState(false)

  const { data } = useQuery<{ staff: StaffMember[] }>({
    queryKey: ['staff'],
    queryFn: () => api.get('/staff'),
  })
  const staff = data?.staff ?? []
  const invalidate = () => qc.invalidateQueries({ queryKey: ['staff'] })

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post('/staff', body),
    onSuccess: () => { invalidate(); closeForm() },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.patch(`/staff/${id}`, body),
    onSuccess: () => { invalidate(); closeForm() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/staff/${id}`),
    onSuccess: () => { invalidate(); setSelected(null) },
  })

  const resetPinMutation = useMutation({
    mutationFn: ({ id, pin }: { id: string; pin: string }) =>
      api.post(`/staff/${id}/reset-pin`, { pin }),
    onSuccess: () => {
      setPinSuccess(true)
      setTimeout(() => { setShowPin(false); setPinSuccess(false) }, 1500)
    },
  })

  const updatePermsMutation = useMutation({
    mutationFn: ({ id, permissions }: { id: string; permissions: Record<string, boolean> }) =>
      api.patch(`/staff/${id}`, { permissions }),
    onSuccess: () => {
      invalidate()
      setPermsSaved(true)
      setTimeout(() => setPermsSaved(false), 1800)
    },
  })

  // ── Form helpers ─────────────────────────────────────────────────────────

  function openCreate() {
    setEditTarget(null)
    setFormNickname('')
    setFormPhone('')
    setFormRole('staff')
    setFormPassword('')
    setFormPin('')
    setFormPinStep(false)
    setShowForm(true)
  }

  function openEdit(s: StaffMember) {
    setEditTarget(s)
    setFormNickname(s.nickname)
    setFormPhone(s.phone ?? '')
    setFormRole(s.role)
    setFormPassword('')
    setFormPin('')
    setFormPinStep(false)
    setShowForm(true)
    setSelected(null)
  }

  function closeForm() {
    setShowForm(false)
    setEditTarget(null)
    setFormPinStep(false)
  }

  function openPinReset(s: StaffMember) {
    setPinTarget(s)
    setPinValue('')
    setPinConfirm('')
    setPinStep('enter')
    setPinError(false)
    setPinSuccess(false)
    setShowPin(true)
    setSelected(null)
  }

  function openDetail(s: StaffMember) {
    setSelected(s)
    setPerms({ ...DEFAULT_PERMISSIONS, ...(s.permissions ?? {}) })
    setPermsSaved(false)
  }

  // Проверяем что основные поля заполнены
  const mainFieldsOk = formNickname.trim().length >= 2 && (!editTarget ? formPassword.length >= 4 : true)

  function handleNextToPin() {
    if (!mainFieldsOk) return
    setFormPinStep(true)
  }

  function submitForm() {
    if (editTarget) {
      const body: Record<string, unknown> = { nickname: formNickname, role: formRole }
      if (formPhone) body.phone = formPhone
      if (formPassword) body.password = formPassword
      if (formPin.length === 4) body.pin = formPin
      updateMutation.mutate({ id: editTarget.id, body })
    } else {
      const body: Record<string, unknown> = {
        nickname: formNickname,
        role: formRole,
        password: formPassword,
      }
      if (formPhone) body.phone = formPhone
      if (formPin.length === 4) body.pin = formPin
      createMutation.mutate(body)
    }
  }

  // ── PIN reset helpers ────────────────────────────────────────────────────

  function handlePinInput(v: string) {
    if (pinStep === 'enter') {
      setPinValue(v)
      if (v.length === 4) {
        // авто-переход к подтверждению
        setTimeout(() => { setPinStep('confirm') }, 200)
      }
    } else {
      setPinConfirm(v)
      if (v.length === 4) {
        // авто-сабмит
        setTimeout(() => {
          if (v === pinValue) {
            resetPinMutation.mutate({ id: pinTarget!.id, pin: pinValue })
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

  const isPending = createMutation.isPending || updateMutation.isPending

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px 20px', maxWidth: 600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: 'var(--on-surface)' }}>Персонал</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--on-surface-variant)' }}>
            {staff.length} {staff.length === 1 ? 'сотрудник' : staff.length <= 4 ? 'сотрудника' : 'сотрудников'}
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: 14, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg,#8B5CF6,#4cd7f6)',
            color: '#fff', fontWeight: 600, fontSize: 14,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>person_add</span>
          Добавить
        </button>
      </div>

      {/* List */}
      {staff.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80, gap: 12, color: 'var(--on-surface-variant)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 64, opacity: 0.3 }}>group</span>
          <p style={{ margin: 0, fontSize: 15 }}>Нет сотрудников</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {staff.map(s => {
            const roleInfo = ROLE_LABELS[s.role] ?? ROLE_LABELS.staff
            return (
              <div
                key={s.id}
                className="glass-l2"
                onClick={() => openDetail(s)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 16, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: getAvatarColor(s.nickname),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 18, color: '#fff',
                }}>
                  {s.nickname[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--on-surface)', marginBottom: 3 }}>{s.nickname}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
                      background: `${roleInfo.color}22`, color: roleInfo.color,
                    }}>{roleInfo.label}</span>
                    {s.phone && <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{s.phone}</span>}
                  </div>
                </div>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--on-surface-variant)' }}>chevron_right</span>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Detail Sheet ──────────────────────────────────────────────────── */}
      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected?.nickname}>
        {selected && (
          <div>
            {/* Avatar + role */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: getAvatarColor(selected.nickname),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 30, color: '#fff',
              }}>
                {selected.nickname[0]?.toUpperCase()}
              </div>
              <span style={{
                fontSize: 12, fontWeight: 600, padding: '3px 12px', borderRadius: 999,
                background: `${(ROLE_LABELS[selected.role]?.color ?? '#8B5CF6')}22`,
                color: ROLE_LABELS[selected.role]?.color ?? '#8B5CF6',
              }}>
                {ROLE_LABELS[selected.role]?.label}
              </span>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <button
                onClick={() => openEdit(selected)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '12px', borderRadius: 14,
                  border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.1)',
                  color: '#A78BFA', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
                Изменить
              </button>
              <button
                onClick={() => openPinReset(selected)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '12px', borderRadius: 14,
                  border: '1px solid rgba(76,215,246,0.4)', background: 'rgba(76,215,246,0.1)',
                  color: '#4cd7f6', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>pin</span>
                Задать PIN
              </button>
            </div>

            {/* Permissions (staff only) */}
            {selected.role === 'staff' && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ ...LBL, marginBottom: 6 }}>Права доступа</p>
                <div style={{ marginBottom: 12 }}>
                  {PERMISSION_LABELS.map(({ key, label, icon }) => (
                    <PermissionRow
                      key={key}
                      label={label}
                      icon={icon}
                      value={perms[key] ?? DEFAULT_PERMISSIONS[key] ?? true}
                      onChange={v => setPerms(p => ({ ...p, [key]: v }))}
                    />
                  ))}
                </div>
                <button
                  onClick={() => updatePermsMutation.mutate({ id: selected.id, permissions: perms })}
                  disabled={updatePermsMutation.isPending}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: permsSaved ? 'rgba(16,185,129,0.15)' : 'linear-gradient(135deg,#8B5CF6,#4cd7f6)',
                    color: permsSaved ? '#10B981' : '#fff', fontWeight: 700, fontSize: 14, transition: 'background 0.3s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {permsSaved
                    ? <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>Сохранено</>
                    : updatePermsMutation.isPending ? 'Сохранение...' : 'Сохранить права'}
                </button>
              </div>
            )}

            {/* Delete */}
            <button
              onClick={() => deleteMutation.mutate(selected.id)}
              disabled={deleteMutation.isPending}
              style={{
                width: '100%', padding: '13px', borderRadius: 14,
                border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)',
                color: '#EF4444', fontWeight: 600, fontSize: 14, cursor: 'pointer',
              }}
            >
              {deleteMutation.isPending ? 'Удаление...' : 'Удалить сотрудника'}
            </button>
          </div>
        )}
      </Sheet>

      {/* ─── Create / Edit Sheet ────────────────────────────────────────────── */}
      <Sheet
        open={showForm}
        onClose={closeForm}
        title={formPinStep ? 'PIN сотрудника' : editTarget ? 'Редактировать' : 'Новый сотрудник'}
      >
        {!formPinStep ? (
          // Step 1: main fields
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={LBL}>Никнейм *</label>
              <input style={INP} placeholder="Например: Алекс" value={formNickname} onChange={e => setFormNickname(e.target.value)} />
            </div>
            <div>
              <label style={LBL}>Телефон</label>
              <input style={INP} placeholder="+7 999 000 00 00" value={formPhone} onChange={e => setFormPhone(e.target.value)} />
            </div>
            <div>
              <label style={LBL}>Роль</label>
              <select style={{ ...INP, background: 'rgba(29,26,36,0.8)', cursor: 'pointer' }} value={formRole} onChange={e => setFormRole(e.target.value as 'staff' | 'owner')}>
                <option value="staff">Персонал</option>
                <option value="owner">Владелец</option>
              </select>
            </div>
            <div>
              <label style={LBL}>{editTarget ? 'Новый пароль (необязательно)' : 'Пароль для входа *'}</label>
              <input
                style={INP} type="password"
                placeholder={editTarget ? 'Оставьте пустым, чтобы не менять' : 'Минимум 4 символа'}
                value={formPassword}
                onChange={e => setFormPassword(e.target.value)}
              />
            </div>

            {/* Hint about PIN step */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#A78BFA', flexShrink: 0 }}>pin</span>
              <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0 }}>
                На следующем шаге можно сразу задать 4-значный PIN для быстрого входа
              </p>
            </div>

            <button
              onClick={handleNextToPin}
              disabled={!mainFieldsOk || isPending}
              style={{
                padding: '14px', borderRadius: 14, border: 'none', cursor: mainFieldsOk ? 'pointer' : 'not-allowed',
                background: mainFieldsOk ? 'linear-gradient(135deg,#8B5CF6,#4cd7f6)' : 'rgba(255,255,255,0.08)',
                color: mainFieldsOk ? '#fff' : 'var(--on-surface-variant)', fontWeight: 700, fontSize: 15,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              Далее — задать PIN
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
            </button>
          </div>
        ) : (
          // Step 2: PIN keypad (optional)
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0, textAlign: 'center' }}>
              Введите 4-значный PIN для сотрудника <strong style={{ color: 'var(--on-surface)' }}>{formNickname}</strong>.
              Это необязательно — без PIN сотрудник войдёт по паролю и установит PIN сам.
            </p>

            <PinKeypad
              value={formPin}
              onChange={setFormPin}
              label="4-значный PIN (необязательно)"
            />

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setFormPinStep(false)}
                style={{
                  flex: 1, padding: '13px', borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
                  color: 'var(--on-surface-variant)', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                }}
              >
                Назад
              </button>
              <button
                onClick={submitForm}
                disabled={isPending || (formPin.length > 0 && formPin.length < 4)}
                style={{
                  flex: 2, padding: '13px', borderRadius: 14, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg,#8B5CF6,#4cd7f6)',
                  color: '#fff', fontWeight: 700, fontSize: 15,
                  opacity: (isPending || (formPin.length > 0 && formPin.length < 4)) ? 0.6 : 1,
                }}
              >
                {isPending ? 'Сохранение...' : editTarget ? 'Сохранить' : 'Создать'}
              </button>
            </div>

            {(createMutation.isError || updateMutation.isError) && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', fontSize: 13 }}>
                Ошибка сохранения. Проверьте данные.
              </div>
            )}
          </div>
        )}
      </Sheet>

      {/* ─── PIN Reset Sheet ────────────────────────────────────────────────── */}
      <Sheet
        open={showPin}
        onClose={() => setShowPin(false)}
        title={pinStep === 'enter' ? `PIN — ${pinTarget?.nickname}` : 'Подтвердите PIN'}
      >
        {pinSuccess ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '20px 0' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', border: '2px solid #10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 38, color: '#10B981', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#10B981', margin: 0 }}>PIN установлен!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0, textAlign: 'center' }}>
              {pinStep === 'enter'
                ? 'Введите новый 4-значный PIN'
                : 'Введите PIN ещё раз для подтверждения'}
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

            {resetPinMutation.isError && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', fontSize: 13 }}>
                Ошибка сохранения PIN
              </div>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}
