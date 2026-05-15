'use client'
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader, Sheet, INP, SEL, LBL } from '@/components/manage/DesignSystem'

interface StaffMember {
  id: string
  nickname: string
  role: 'owner' | 'staff'
  phone?: string
}

const ROLE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  owner: { label: 'Владелец', color: '#F59E0B', icon: 'crown' },
  staff: { label: 'Персонал', color: '#8B5CF6', icon: 'badge' },
}

const AVATAR_COLORS = ['#8B5CF6', '#4cd7f6', '#10B981', '#F59E0B', '#F43F5E', '#3B82F6']

function getAvatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function pluralStaff(n: number) {
  if (n === 1) return 'сотрудник'
  if (n >= 2 && n <= 4) return 'сотрудника'
  return 'сотрудников'
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
    mutationFn: ({ id, pin }: { id: string; pin: string }) => api.post(`/staff/${id}/reset-pin`, { pin }),
    onSuccess: () => {
      setPinSuccess('PIN успешно изменён')
      setTimeout(() => { setShowPin(false); setPinSuccess('') }, 1500)
    },
  })

  function openCreate() {
    setEditTarget(null)
    setFormNickname(''); setFormPhone(''); setFormRole('staff'); setFormPassword('')
    setShowForm(true)
  }

  function openEdit(s: StaffMember) {
    setEditTarget(s)
    setFormNickname(s.nickname); setFormPhone(s.phone ?? ''); setFormRole(s.role); setFormPassword('')
    setShowForm(true)
    setSelected(null)
  }

  function closeForm() { setShowForm(false); setEditTarget(null) }

  function openPinReset(s: StaffMember) {
    setPinTarget(s); setPinNew(''); setPinConfirm(''); setPinError(''); setPinSuccess('')
    setShowPin(true); setSelected(null)
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

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--background)', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Персонал"
        subtitle={`${staff.length} ${pluralStaff(staff.length)}`}
        action={{ label: 'Добавить', icon: 'person_add', onClick: openCreate }}
      />

      <div style={{ padding: '16px 16px 100px', maxWidth: 680, margin: '0 auto', width: '100%' }}>
        {staff.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80, gap: 16, color: 'var(--on-surface-variant)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 64, opacity: 0.4 }}>group</span>
            <p style={{ margin: 0, fontSize: 16 }}>Нет сотрудников</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {staff.map(s => {
              const roleInfo = ROLE_LABELS[s.role] ?? ROLE_LABELS.staff
              const avatarColor = getAvatarColor(s.nickname)
              return (
                <div key={s.id} className="glass-l2" onClick={() => setSelected(s)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 16, cursor: 'pointer', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = `${roleInfo.color}44` }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0, background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}88)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: '#fff', boxShadow: `0 4px 12px ${avatarColor}44` }}>
                    {s.nickname[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--on-surface)', marginBottom: 4 }}>{s.nickname}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: `${roleInfo.color}22`, color: roleInfo.color, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 10, fontVariationSettings: "'FILL' 1" }}>{roleInfo.icon}</span>
                        {roleInfo.label}
                      </span>
                      {s.phone && <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{s.phone}</span>}
                    </div>
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--on-surface-variant)' }}>chevron_right</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Detail sheet */}
      <Sheet open={!!selected} onClose={() => setSelected(null)}>
        {selected && (() => {
          const avatarColor = getAvatarColor(selected.nickname)
          const roleInfo = ROLE_LABELS[selected.role] ?? ROLE_LABELS.staff
          return (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}88)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 32, color: '#fff', boxShadow: `0 8px 24px ${avatarColor}55` }}>
                  {selected.nickname[0]?.toUpperCase()}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 22, color: 'var(--on-surface)' }}>{selected.nickname}</div>
                  <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: `${roleInfo.color}22`, color: roleInfo.color }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14, fontVariationSettings: "'FILL' 1" }}>{roleInfo.icon}</span>
                    {roleInfo.label}
                  </div>
                  {selected.phone && <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '8px 0 0' }}>{selected.phone}</p>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <button onClick={() => openEdit(selected)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', borderRadius: 14, border: '1px solid #8B5CF6', background: 'rgba(139,92,246,0.1)', color: '#8B5CF6', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>Изменить
                </button>
                <button onClick={() => openPinReset(selected)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', borderRadius: 14, border: '1px solid #4cd7f6', background: 'rgba(76,215,246,0.1)', color: '#4cd7f6', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>pin</span>PIN
                </button>
              </div>
              <button onClick={() => deleteMutation.mutate(selected.id)} disabled={deleteMutation.isPending} style={{ width: '100%', padding: '13px', borderRadius: 14, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)', color: '#EF4444', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                {deleteMutation.isPending ? 'Удаление...' : 'Удалить сотрудника'}
              </button>
            </div>
          )
        })()}
      </Sheet>

      {/* Create/Edit sheet */}
      <Sheet open={showForm} onClose={closeForm} title={editTarget ? 'Редактировать' : 'Новый сотрудник'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={LBL}>Никнейм *</label><input style={INP} placeholder="Введите никнейм" value={formNickname} onChange={e => setFormNickname(e.target.value)} /></div>
          <div><label style={LBL}>Телефон</label><input style={INP} placeholder="+7 999 000 00 00" value={formPhone} onChange={e => setFormPhone(e.target.value)} /></div>
          <div><label style={LBL}>Роль</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['staff', 'owner'] as const).map(r => (
                <button key={r} onClick={() => setFormRole(r)} style={{ flex: 1, padding: '12px', borderRadius: 12, border: `1px solid ${formRole === r ? (r === 'owner' ? '#F59E0B' : '#8B5CF6') : 'rgba(255,255,255,0.1)'}`, background: formRole === r ? (r === 'owner' ? 'rgba(245,158,11,0.12)' : 'rgba(139,92,246,0.12)') : 'rgba(255,255,255,0.04)', color: formRole === r ? (r === 'owner' ? '#F59E0B' : '#8B5CF6') : 'var(--on-surface-variant)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  {ROLE_LABELS[r].label}
                </button>
              ))}
            </div>
          </div>
          <div><label style={LBL}>{editTarget ? 'Новый пароль (необязательно)' : 'Пароль *'}</label><input style={INP} type="password" placeholder={editTarget ? 'Оставьте пустым без изменений' : 'Введите пароль'} value={formPassword} onChange={e => setFormPassword(e.target.value)} /></div>
          <button onClick={submitForm} disabled={createMutation.isPending || updateMutation.isPending} style={{ padding: '14px', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#8B5CF6,#4cd7f6)', color: '#fff', fontWeight: 700, fontSize: 15, marginTop: 4 }}>
            {createMutation.isPending || updateMutation.isPending ? 'Сохранение...' : editTarget ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </Sheet>

      {/* PIN reset sheet */}
      <Sheet open={showPin} onClose={() => setShowPin(false)} title={`PIN: ${pinTarget?.nickname ?? ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={LBL}>Новый PIN (6 цифр)</label><input style={INP} type="password" inputMode="numeric" maxLength={6} placeholder="••••••" value={pinNew} onChange={e => setPinNew(e.target.value.replace(/\D/g, ''))} /></div>
          <div><label style={LBL}>Подтвердить PIN</label><input style={INP} type="password" inputMode="numeric" maxLength={6} placeholder="••••••" value={pinConfirm} onChange={e => setPinConfirm(e.target.value.replace(/\D/g, ''))} /></div>
          {pinError && <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', fontSize: 13 }}>{pinError}</div>}
          {pinSuccess && <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10B981', fontSize: 13 }}>{pinSuccess}</div>}
          <button onClick={submitPin} disabled={resetPinMutation.isPending} style={{ padding: '14px', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#4cd7f6,#8B5CF6)', color: '#fff', fontWeight: 700, fontSize: 15, marginTop: 4 }}>
            {resetPinMutation.isPending ? 'Сохранение...' : 'Установить PIN'}
          </button>
        </div>
      </Sheet>
    </div>
  )
}
