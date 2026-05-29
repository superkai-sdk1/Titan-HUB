'use client'
import React, { useState } from 'react'
import { Icon } from '@/components/Icon'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Sheet, INP, LBL } from '@/components/manage/DesignSystem'
import { TimeInput24 } from '@/components/TimeInput24'

const STATUS: Record<string, [string, string, string]> = {
  planned:   ['Запланировано', '#3B82F6', 'schedule'],
  active:    ['Активно',       '#10B981', 'play_circle'],
  completed: ['Завершено',     '#94A3B8', 'check_circle'],
  cancelled: ['Отменено',      '#F43F5E', 'cancel'],
}

const TYPES: Record<string, [string, string, string]> = {
  titan: ['Titan клуб', 'home',            '#8B5CF6'],
  exit:  ['Выезд',      'directions_car',  '#F59E0B'],
}

const PAY_TYPES: Record<string, string> = {
  fixed:    'Фиксированная',
  per_head: 'С головы',
  free:     'Бесплатно',
}

const BLANK = {
  type: 'titan',
  title: '',
  spaceId: '',
  date: new Date().toISOString().split('T')[0],
  startTime: '18:00',
  endTime: '',
  paymentType: 'fixed' as 'fixed' | 'per_head' | 'free',
  fixedAmount: '',
  perHeadAmount: '',
  maxGuests: '',
  comment: '',
}

const MONTHS_SHORT = ['', 'янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

export default function EventsPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [form, setForm] = useState<any>(BLANK)
  const [analyticsId, setAnalyticsId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const { data } = useQuery({ queryKey: ['events'], queryFn: () => api.get<any>('/events') })
  const events: any[] = (data?.events ?? []).sort((a: any, b: any) => b.date.localeCompare(a.date))
  const upcomingCount = events.filter(e => e.status === 'planned' || e.status === 'active').length

  const { data: spacesData } = useQuery({
    queryKey: ['pos', 'spaces'],
    queryFn: () => api.get<{ spaces: any[] }>('/pos/spaces'),
    enabled: showForm,
  })
  const spacesList: any[] = spacesData?.spaces ?? []

  const { data: analytics } = useQuery({
    queryKey: ['events', 'analytics', analyticsId],
    queryFn: () => api.get<any>(`/events/${analyticsId}/analytics`),
    enabled: !!analyticsId,
  })

  const create = useMutation({
    mutationFn: (b: any) => api.post('/events', b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
      setShowForm(false)
      setForm(BLANK)
      setFormError(null)
    },
    onError: (err: any) => {
      setFormError(err?.message ?? 'Ошибка сохранения')
    },
  })
  const update = useMutation({ mutationFn: ({ id, ...b }: any) => api.patch(`/events/${id}`, b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); setSelected(null) } })
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/events/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); setSelected(null) } })

  function submitForm() {
    setFormError(null)
    const payload: any = {
      type: form.type,
      title: form.title || undefined,
      spaceId: form.spaceId || undefined,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime || undefined,
      paymentType: form.paymentType,
      comment: form.comment || undefined,
    }
    if (form.paymentType === 'fixed' && form.fixedAmount) payload.fixedAmount = parseFloat(form.fixedAmount)
    if (form.paymentType === 'per_head' && form.perHeadAmount) payload.perHeadAmount = parseFloat(form.perHeadAmount)
    if (form.maxGuests) payload.maxGuests = parseInt(form.maxGuests)
    create.mutate(payload)
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', overflowX: 'hidden', width: '100%' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 680, margin: '0 auto', width: '100%' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Мероприятия</h1>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>
              {events.length} событий{upcomingCount > 0 ? ` · ${upcomingCount} предстоящих` : ''}
            </p>
          </div>
          <button
            onClick={() => { setForm(BLANK); setFormError(null); setShowForm(true) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 14, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
              color: '#fff', fontSize: 13, fontWeight: 700,
              boxShadow: '0 4px 20px rgba(139,92,246,0.3)',
            }}
          >
            <Icon name="add" size={18} />
            Добавить
          </button>
        </div>
      </div>

      <div style={{ padding: '16px 16px var(--bottom-nav-clear)', flex: 1, maxWidth: 680, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <Icon name="event" size={56} color="rgba(204,195,216,0.2)" style={{ display: 'block', marginBottom: 12 }} />
            <p style={{ fontSize: 15, color: 'rgba(204,195,216,0.4)', margin: 0 }}>Мероприятий нет</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {events.map((ev: any) => {
              const [statusLabel, statusColor, statusIcon] = STATUS[ev.status] ?? ['—', '#94A3B8', 'help']
              const [typeLabel, typeIcon, typeColor] = TYPES[ev.type] ?? ['—', 'event', '#94A3B8']
              const day = ev.date.split('-')[2]
              const month = MONTHS_SHORT[Number(ev.date.split('-')[1])] ?? ''
              const guestsLabel = ev.maxGuests
                ? `${ev.attendeesCount ?? 0} / ${ev.maxGuests}`
                : ev.attendeesCount > 0 ? `${ev.attendeesCount} гостей` : null
              return (
                <div key={ev.id} className="glass-l2" onClick={() => setSelected(ev)}
                  style={{ borderRadius: 16, padding: '16px', cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'flex-start', transition: 'border-color 0.2s, transform 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = `${statusColor}44`; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)' }}>
                  {/* Calendar date block */}
                  <div style={{ width: 54, height: 54, borderRadius: 14, background: `${statusColor}18`, border: `1px solid ${statusColor}33`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 20, fontWeight: 900, fontStyle: 'italic', color: statusColor, lineHeight: 1 }}>{day}</span>
                    <span style={{ fontSize: 10, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: "'JetBrains Mono',monospace" }}>{month}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name={typeIcon} size={14} color={typeColor} />
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{ev.title || typeLabel}</span>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", padding: '2px 7px', borderRadius: 6, background: `${statusColor}20`, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name={statusIcon} size={10} />{statusLabel}
                      </span>
                      {guestsLabel && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.07)', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Icon name="groups" size={11} />{guestsLabel}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '0 0 3px' }}>
                      {ev.startTime}{ev.endTime ? ` — ${ev.endTime}` : ''} · {PAY_TYPES[ev.paymentType] ?? ev.paymentType}
                      {ev.paymentType === 'fixed' && ev.fixedAmount ? ` · ${parseFloat(ev.fixedAmount).toLocaleString('ru')} ₽` : ''}
                      {ev.paymentType === 'per_head' && ev.perHeadAmount ? ` · ${parseFloat(ev.perHeadAmount).toLocaleString('ru')} ₽/чел` : ''}
                    </p>
                    {ev.comment && <p style={{ fontSize: 12, color: 'rgba(204,195,216,0.5)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.comment}</p>}
                  </div>
                  <Icon name="chevron_right" size={18} color="rgba(204,195,216,0.3)" />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create sheet */}
      <Sheet open={showForm} onClose={() => setShowForm(false)} title="Новое мероприятие">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={LBL}>Тип</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.entries(TYPES).map(([k, [l, icon, c]]) => (
                <button key={k} onClick={() => setForm((p: any) => ({ ...p, type: k }))}
                  style={{ flex: 1, padding: '12px', borderRadius: 12, border: `1px solid ${form.type === k ? c : 'rgba(255,255,255,0.1)'}`, background: form.type === k ? `${c}22` : 'rgba(255,255,255,0.04)', color: form.type === k ? c : 'var(--on-surface-variant)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Icon name={icon} size={16} />{l}
                </button>
              ))}
            </div>
          </div>
          <div><label style={LBL}>Название</label><input value={form.title} onChange={e => setForm((p: any) => ({ ...p, title: e.target.value }))} placeholder="Например: Турнир по покеру" style={INP} /></div>
          {form.type === 'titan' && spacesList.length > 0 && (
            <div>
              <label style={LBL}>Пространство</label>
              <select value={form.spaceId} onChange={e => setForm((p: any) => ({ ...p, spaceId: e.target.value }))} style={INP}>
                <option value="">Без привязки</option>
                {spacesList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          <div><label style={LBL}>Дата</label><input type="date" value={form.date} onChange={e => setForm((p: any) => ({ ...p, date: e.target.value }))} style={INP} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={LBL}>Начало</label><TimeInput24 value={form.startTime} onChange={v => setForm((p: any) => ({ ...p, startTime: v }))} /></div>
            <div><label style={LBL}>Конец</label><TimeInput24 value={form.endTime} onChange={v => setForm((p: any) => ({ ...p, endTime: v }))} /></div>
          </div>
          <div>
            <label style={LBL}>Оплата</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {Object.entries(PAY_TYPES).map(([k, v]) => (
                <button key={k} onClick={() => setForm((p: any) => ({ ...p, paymentType: k }))}
                  style={{ flex: 1, padding: '10px 4px', borderRadius: 10, border: `1px solid ${form.paymentType === k ? '#8B5CF6' : 'rgba(255,255,255,0.1)'}`, background: form.paymentType === k ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)', color: form.paymentType === k ? '#a78bfa' : 'var(--on-surface-variant)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          {form.paymentType === 'fixed' && (
            <div><label style={LBL}>Сумма (₽)</label><input type="number" value={form.fixedAmount} onChange={e => setForm((p: any) => ({ ...p, fixedAmount: e.target.value }))} style={INP} /></div>
          )}
          {form.paymentType === 'per_head' && (
            <div><label style={LBL}>Сумма с гостя (₽)</label><input type="number" value={form.perHeadAmount} onChange={e => setForm((p: any) => ({ ...p, perHeadAmount: e.target.value }))} style={INP} /></div>
          )}
          <div><label style={LBL}>Максимум гостей (опционально)</label><input type="number" value={form.maxGuests} onChange={e => setForm((p: any) => ({ ...p, maxGuests: e.target.value }))} placeholder="Без ограничения" style={INP} /></div>
          <div><label style={LBL}>Комментарий</label><input value={form.comment} onChange={e => setForm((p: any) => ({ ...p, comment: e.target.value }))} placeholder="Необязательно" style={INP} /></div>
          {formError && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: '#F87171', fontSize: 12 }}>
              {formError}
            </div>
          )}
          <button onClick={submitForm} disabled={create.isPending}
            style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
            {create.isPending ? 'Создаём…' : 'Создать мероприятие'}
          </button>
        </div>
      </Sheet>

      {/* Detail sheet */}
      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected ? (selected.title || TYPES[selected.type]?.[0] || selected.type) : ''}>
        {selected && (() => {
          const [, statusColor, statusIcon] = STATUS[selected.status] ?? ['—', '#94A3B8', 'help']
          return (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px', borderRadius: 12, background: `${statusColor}15`, border: `1px solid ${statusColor}33` }}>
                <Icon name={statusIcon} size={18} color={statusColor} />
                <span style={{ fontSize: 13, fontWeight: 600, color: statusColor }}>{STATUS[selected.status]?.[0]}</span>
                <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginLeft: 'auto' }}>{selected.date}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {[
                  ['Время', `${selected.startTime}${selected.endTime ? ` — ${selected.endTime}` : ''}`],
                  ['Тип оплаты', PAY_TYPES[selected.paymentType] ?? selected.paymentType],
                  ['Сумма', selected.paymentType === 'fixed' && selected.fixedAmount
                    ? `${parseFloat(selected.fixedAmount).toLocaleString('ru')} ₽`
                    : selected.paymentType === 'per_head' && selected.perHeadAmount
                    ? `${parseFloat(selected.perHeadAmount).toLocaleString('ru')} ₽/чел`
                    : '—'],
                  ['Гостей', selected.maxGuests
                    ? `${selected.attendeesCount ?? 0} / ${selected.maxGuests}`
                    : selected.attendeesCount ? String(selected.attendeesCount) : '—'],
                  ['Комментарий', selected.comment || '—'],
                ].map(([k, v]) => v && v !== '—' ? (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{k}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface)' }}>{v}</span>
                  </div>
                ) : null)}
              </div>
              <div style={{ marginBottom: 16 }}>
                <button onClick={() => setAnalyticsId(selected.id)}
                  style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.08)', color: '#a78bfa', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Icon name="analytics" size={16} />Аналитика
                </button>
              </div>
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Изменить статус</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  {Object.entries(STATUS).filter(([k]) => k !== selected.status).map(([k, [l, c]]) => (
                    <button key={k} onClick={() => update.mutate({ id: selected.id, status: k })}
                      style={{ padding: '8px 14px', borderRadius: 10, border: `1px solid ${c}44`, background: `${c}11`, color: c, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
                  ))}
                </div>
              </div>
              <button onClick={() => del.mutate(selected.id)}
                style={{ width: '100%', padding: '13px 0', borderRadius: 14, border: '1px solid rgba(244,63,94,0.3)', background: 'rgba(244,63,94,0.08)', color: '#F87171', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Icon name="delete" size={16} />Удалить мероприятие
              </button>
            </div>
          )
        })()}
      </Sheet>

      {/* Analytics sheet */}
      <Sheet open={!!analyticsId} onClose={() => setAnalyticsId(null)} title="Аналитика мероприятия">
        {analytics && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ padding: '14px', borderRadius: 12, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Выручка</p>
                <p style={{ fontSize: 20, fontWeight: 900, margin: 0, color: '#10B981' }}>{Number(analytics.totalRevenue ?? 0).toLocaleString('ru')} ₽</p>
              </div>
              <div style={{ padding: '14px', borderRadius: 12, background: 'rgba(76,215,246,0.08)', border: '1px solid rgba(76,215,246,0.2)' }}>
                <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Гостей</p>
                <p style={{ fontSize: 20, fontWeight: 900, margin: 0, color: '#4cd7f6' }}>{analytics.attendeesCount ?? 0}{analytics.maxGuests ? ` / ${analytics.maxGuests}` : ''}</p>
              </div>
              <div style={{ padding: '14px', borderRadius: 12, background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)' }}>
                <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Средний чек</p>
                <p style={{ fontSize: 16, fontWeight: 900, margin: 0, color: '#a78bfa' }}>{Math.round(analytics.avgCheckAmount ?? 0).toLocaleString('ru')} ₽</p>
              </div>
              <div style={{ padding: '14px', borderRadius: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Длительность</p>
                <p style={{ fontSize: 16, fontWeight: 900, margin: 0, color: '#F59E0B' }}>{analytics.durationMinutes != null ? `${Math.floor(analytics.durationMinutes / 60)}ч ${analytics.durationMinutes % 60}м` : '—'}</p>
              </div>
            </div>
            {analytics.topItems?.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Топ-5 позиций</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {analytics.topItems.map((it: any) => (
                    <div key={it.itemId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{it.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{it.qty} шт · {Number(it.revenue).toLocaleString('ru')} ₽</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {analytics.paymentBreakdown && Object.keys(analytics.paymentBreakdown).length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Методы оплаты</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.entries(analytics.paymentBreakdown).map(([method, total]) => (
                    <div key={method} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{method}</span>
                      <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{Number(total).toLocaleString('ru')} ₽</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}
