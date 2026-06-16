'use client'
/**
 * Управление бронированиями. Заявки с публичного виджета /book падают сюда со
 * статусом «новая»: владелец/сотрудник подтверждает (→ создаётся planned-мероприятие)
 * или отменяет. Сегмент-фильтр Новые/Подтверждённые/Все.
 */
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'
import { Icon } from '@/components/Icon'

interface Booking {
  id: string; space_id: string | null; zone_name: string | null
  name: string; phone: string; guests: number | null
  starts_at: string; duration_hours: string | null; tariff_hours: number | null
  location: string | null; address: string | null; comment: string | null
  status: 'new' | 'confirmed' | 'cancelled' | 'done'; source: string; event_id: string | null
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  new: { label: 'Новая', color: '#F59E0B' },
  confirmed: { label: 'Подтверждена', color: '#10B981' },
  cancelled: { label: 'Отменена', color: '#94A3B8' },
  done: { label: 'Завершена', color: '#8B5CF6' },
}

const TABS = [{ key: 'new', label: 'Новые' }, { key: 'confirmed', label: 'Подтверждённые' }, { key: '', label: 'Все' }] as const

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

export default function BookingsPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const { show } = useToast()
  const [tab, setTab] = useState<'new' | 'confirmed' | ''>('new')

  const { data, isLoading, error } = useQuery<{ bookings: Booking[] }>({
    queryKey: ['bookings', tab],
    queryFn: () => api.get(`/bookings${tab ? `?status=${tab}` : ''}`),
    refetchInterval: 60_000,
  })

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/bookings/${id}`, { status }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      show(v.status === 'confirmed' ? 'Бронь подтверждена — создано мероприятие' : v.status === 'cancelled' ? 'Бронь отменена' : 'Обновлено', 'success')
    },
    onError: (e: any) => show(e?.message || 'Не удалось обновить', 'error'),
  })

  const bookings = data?.bookings ?? []

  return (
    <div>
      <PageHeader title="Бронирования" subtitle="Заявки с онлайн-виджета" onBack={() => router.push('/manage')} />

      <div style={{ display: 'flex', gap: 8, padding: '0 4px 14px' }}>
        {TABS.map((t) => {
          const active = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ flex: 1, padding: '9px 8px', borderRadius: 11, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: active ? 'var(--primary-violet)' : 'rgba(255,255,255,0.05)', color: active ? '#fff' : 'var(--on-surface-variant)' }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {isLoading ? <StateView state="loading" />
        : error ? <StateView state="error" description="Не удалось загрузить брони" />
        : bookings.length === 0 ? <StateView state="empty" icon="event" title="Броней нет" description="Здесь появятся заявки с публичной формы /book." />
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 'var(--bottom-nav-clear)' }}>
            {bookings.map((b) => {
              const st = STATUS_META[b.status] ?? { label: b.status, color: '#94A3B8' }
              return (
                <div key={b.id} className="glass-l2" style={{ borderRadius: 16, padding: 14, border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 800 }}>{b.name}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: b.location === 'exit' ? '#F59E0B' : '#a78bfa', background: b.location === 'exit' ? 'rgba(245,158,11,0.15)' : 'rgba(139,92,246,0.15)', borderRadius: 7, padding: '2px 7px' }}>{b.location === 'exit' ? 'Выезд' : 'Штаб'}</span>
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: `${st.color}22`, border: `1px solid ${st.color}55`, borderRadius: 8, padding: '2px 8px' }}>{st.label}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 8, fontSize: 13, color: 'var(--on-surface-variant)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="schedule" size={14} /> {fmtWhen(b.starts_at)}{(b.tariff_hours ?? b.duration_hours) ? ` · ${Number(b.tariff_hours ?? b.duration_hours)} ч` : ''}</span>
                    {b.guests != null && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="group" size={14} /> {b.guests}</span>}
                    {b.zone_name && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="location_on" size={14} /> {b.zone_name}</span>}
                    {b.location === 'exit' && b.address && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="location_on" size={14} /> {b.address}</span>}
                    <a href={`tel:${b.phone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#a78bfa', textDecoration: 'none' }}><Icon name="call" size={14} color="#a78bfa" /> {b.phone}</a>
                  </div>
                  {b.comment && <p style={{ fontSize: 13, color: 'var(--on-surface)', margin: '8px 0 0', lineHeight: 1.45 }}>{b.comment}</p>}

                  {b.status === 'new' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: b.id, status: 'confirmed' })}
                        style={{ flex: 1, padding: '10px 0', borderRadius: 11, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'rgba(16,185,129,0.16)', color: '#10B981' }}>
                        Подтвердить
                      </button>
                      <button disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: b.id, status: 'cancelled' })}
                        style={{ flex: 1, padding: '10px 0', borderRadius: 11, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'rgba(148,163,184,0.16)', color: 'var(--on-surface-variant)' }}>
                        Отклонить
                      </button>
                    </div>
                  )}
                  {b.status === 'confirmed' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                      {b.event_id && (
                        <button onClick={() => router.push('/manage/events')}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '9px 13px', borderRadius: 11, border: '1px solid rgba(139,92,246,0.4)', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'transparent', color: '#a78bfa' }}>
                          <Icon name="event" size={14} color="#a78bfa" /> Мероприятие
                        </button>
                      )}
                      <button disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: b.id, status: 'cancelled' })}
                        style={{ padding: '9px 13px', borderRadius: 11, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'rgba(148,163,184,0.16)', color: 'var(--on-surface-variant)' }}>
                        Отменить
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}
