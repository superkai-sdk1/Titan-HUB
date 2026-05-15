'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

const INP: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const SEL: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(29,26,36,0.8)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }
const LBL: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 6px', display: 'block' }

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
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--on-surface-variant)', width: 18, flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13, color: 'var(--on-surface)', fontWeight: 500 }}>{label}</span>
      <MiniToggle value={value} onChange={onChange} />
    </div>
  )
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  owner: { label: 'Владелец', color: '#F59E0B' },
  staff: { label: 'Персонал', color: '#8B5CF6' },
}

const AVATAR_COLORS = ['#8B5CF6', '#4cd7f6', '#10B981', '#F59E0B', '#F43F5E', '#3B82F6']

function getAvatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export default function StaffPage() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<StaffMember | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<StaffMember | null>(null)
  const [showPin, setShowPin] = useState(false)
  const [pinTarget, setPinTarget] = useState<StaffMember | null>(null)

  const [formNickname, setFormNickname] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formRole, setFormRole] = useState<'staff' | 'owner'>('staff')
  const [formPassword, setFormPassword] = useState('')

  const [pinNew, setPinNew] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinSuccess, setPinSuccess] = useState('')

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
      setPinSuccess('PIN успешно изменён')
      setTimeout(() => { setShowPin(false); setPinSuccess('') }, 1500)
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

  function openCreate() {
    setEditTarget(null)
    setFormNickname('')
    setFormPhone('')
    setFormRole('staff')
    setFormPassword('')
    setShowForm(true)
  }

  function openEdit(s: StaffMember) {
    setEditTarget(s)
    setFormNickname(s.nickname)
    setFormPhone(s.phone ?? '')
    setFormRole(s.role)
    setFormPassword('')
    setShowForm(true)
    setSelected(null)
  }

  function closeForm() {
    setShowForm(false)
    setEditTarget(null)
  }

  function openPinReset(s: StaffMember) {
    setPinTarget(s)
    setPinNew('')
    setPinConfirm('')
    setPinError('')
    setPinSuccess('')
    setShowPin(true)
    setSelected(null)
  }

  function openDetail(s: StaffMember) {
    setSelected(s)
    setPerms({ ...DEFAULT_PERMISSIONS, ...(s.permissions ?? {}) })
    setPermsSaved(false)
  }

  function submitForm() {
    if (!formNickname.trim()) return
    if (editTarget) {
      const body: Record<string, string> = { nickname: formNickname, role: formRole }
      if (formPhone) body.phone = formPhone
      if (formPassword) body.password = formPassword
      updateMutation.mutate({ id: editTarget.id, body })
    } else {
      if (!formPassword) return
      createMutation.mutate({ nickname: formNickname, phone: formPhone, role: formRole, password: formPassword })
    }
  }

  function submitPin() {
    setPinError('')
    if (!/^\d{6}$/.test(pinNew)) { setPinError('PIN должен быть 6 цифр'); return }
    if (pinNew !== pinConfirm) { setPinError('PIN-коды не совпадают'); return }
    if (pinTarget) resetPinMutation.mutate({ id: pinTarget.id, pin: pinNew })
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  }

  const sheetStyle: React.CSSProperties = {
    width: '100%', maxWidth: 480,
    borderRadius: '24px 24px 0 0',
    padding: 24, paddingBottom: 40,
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: 'var(--on-surface)' }}>Персонал</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--on-surface-variant)' }}>
            {staff.length}{' '}
            {staff.length === 1 ? 'сотрудник' : staff.length >= 2 && staff.length <= 4 ? 'сотрудника' : 'сотрудников'}
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

      {/* Staff list */}
      {staff.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 16, color: 'var(--on-surface-variant)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 64, opacity: 0.4 }}>group</span>
          <p style={{ margin: 0, fontSize: 16 }}>Нет сотрудников</p>
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
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 16, cursor: 'pointer' }}
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

      {/* Detail bottom sheet */}
      {selected && (
        <div style={overlayStyle} onClick={() => setSelected(null)}>
          <div className="glass-l1" style={sheetStyle} onClick={e => e.stopPropagation()}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)', margin: '0 auto 20px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 28 }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: getAvatarColor(selected.nickname),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 30, color: '#fff',
              }}>
                {selected.nickname[0]?.toUpperCase()}
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--on-surface)' }}>{selected.nickname}</div>
                <div style={{ fontSize: 13, color: ROLE_LABELS[selected.role]?.color ?? '#8B5CF6', marginTop: 4, fontWeight: 600 }}>
                  {ROLE_LABELS[selected.role]?.label}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <button
                onClick={() => openEdit(selected)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px', borderRadius: 14,
                  border: '1px solid #8B5CF6', background: 'rgba(139,92,246,0.1)',
                  color: '#8B5CF6', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
                Редактировать
              </button>
              <button
                onClick={() => openPinReset(selected)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px', borderRadius: 14,
                  border: '1px solid #4cd7f6', background: 'rgba(76,215,246,0.1)',
                  color: '#4cd7f6', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>pin</span>
                Сменить PIN
              </button>
            </div>
            {/* Permissions section — only for staff role */}
            {selected.role === 'staff' && (
              <div style={{ marginTop: 16, marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--on-surface-variant)', fontFamily: "'JetBrains Mono',monospace", margin: '0 0 4px' }}>
                  ПРАВА ДОСТУПА
                </p>
                <div style={{ marginBottom: 10 }}>
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
                    color: permsSaved ? '#10B981' : '#fff', fontWeight: 700, fontSize: 14,
                    transition: 'background 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {permsSaved
                    ? <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>Сохранено</>
                    : updatePermsMutation.isPending ? 'Сохранение...' : 'Сохранить права'
                  }
                </button>
              </div>
            )}
            <button
              onClick={() => deleteMutation.mutate(selected.id)}
              disabled={deleteMutation.isPending}
              style={{
                width: '100%', padding: '13px', borderRadius: 14,
                border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)',
                color: '#EF4444', fontWeight: 600, fontSize: 14, cursor: 'pointer',
              }}
            >
              {deleteMutation.isPending ? 'Удаление...' : 'Удалить сотрудника'}
            </button>
          </div>
        </div>
      )}

      {/* Edit / Create form bottom sheet */}
      {showForm && (
        <div style={{ ...overlayStyle, zIndex: 110 }} onClick={closeForm}>
          <div className="glass-l1" style={sheetStyle} onClick={e => e.stopPropagation()}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)', margin: '0 auto 20px' }} />
            <h2 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 700, color: 'var(--on-surface)' }}>
              {editTarget ? 'Редактировать' : 'Новый сотрудник'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={LBL}>Никнейм *</label>
                <input style={INP} placeholder="Введите никнейм" value={formNickname} onChange={e => setFormNickname(e.target.value)} />
              </div>
              <div>
                <label style={LBL}>Телефон</label>
                <input style={INP} placeholder="+7 999 000 00 00" value={formPhone} onChange={e => setFormPhone(e.target.value)} />
              </div>
              <div>
                <label style={LBL}>Роль</label>
                <select style={SEL} value={formRole} onChange={e => setFormRole(e.target.value as 'staff' | 'owner')}>
                  <option value="staff">Персонал</option>
                  <option value="owner">Владелец</option>
                </select>
              </div>
              <div>
                <label style={LBL}>{editTarget ? 'Новый пароль (необязательно)' : 'Пароль *'}</label>
                <input
                  style={INP}
                  type="password"
                  placeholder={editTarget ? 'Оставьте пустым, чтобы не менять' : 'Введите пароль'}
                  value={formPassword}
                  onChange={e => setFormPassword(e.target.value)}
                />
              </div>
              <button
                onClick={submitForm}
                disabled={createMutation.isPending || updateMutation.isPending}
                style={{
                  padding: '13px', borderRadius: 14, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg,#8B5CF6,#4cd7f6)',
                  color: '#fff', fontWeight: 700, fontSize: 15, marginTop: 4,
                }}
              >
                {createMutation.isPending || updateMutation.isPending ? 'Сохранение...' : editTarget ? 'Сохранить' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PIN reset modal */}
      {showPin && pinTarget && (
        <div style={{ ...overlayStyle, zIndex: 120 }} onClick={() => setShowPin(false)}>
          <div className="glass-l1" style={sheetStyle} onClick={e => e.stopPropagation()}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)', margin: '0 auto 20px' }} />
            <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: 'var(--on-surface)' }}>Сменить PIN</h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--on-surface-variant)' }}>{pinTarget.nickname}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={LBL}>Новый PIN (6 цифр)</label>
                <input
                  style={INP}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  value={pinNew}
                  onChange={e => setPinNew(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <div>
                <label style={LBL}>Подтвердить PIN</label>
                <input
                  style={INP}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  value={pinConfirm}
                  onChange={e => setPinConfirm(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              {pinError && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', fontSize: 13 }}>
                  {pinError}
                </div>
              )}
              {pinSuccess && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10B981', fontSize: 13 }}>
                  {pinSuccess}
                </div>
              )}
              <button
                onClick={submitPin}
                disabled={resetPinMutation.isPending}
                style={{
                  padding: '13px', borderRadius: 14, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg,#4cd7f6,#8B5CF6)',
                  color: '#fff', fontWeight: 700, fontSize: 15, marginTop: 4,
                }}
              >
                {resetPinMutation.isPending ? 'Сохранение...' : 'Установить PIN'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
