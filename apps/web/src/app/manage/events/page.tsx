'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

const INP: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const SEL: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(29,26,36,0.8)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }
const LBL: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 6px', display: 'block' }

const STATUS: Record<string, [string, string]> = { planned: ['Запланировано', '#3B82F6'], active: ['Активно', '#10B981'], completed: ['Завершено', 'rgba(204,195,216,0.4)'], cancelled: ['Отменено', '#F43F5E'] }
const TYPES: Record<string, string> = { titan: 'Titan клуб', away: 'Выезд' }
const PAY_TYPES: Record<string, string> = { fixed: 'Фиксированная', per_head: 'С головы', free: 'Бесплатно' }
const BLANK = { type: 'titan', date: new Date().toISOString().split('T')[0], startTime: '18:00', endTime: '', paymentType: 'fixed', fixedAmount: '', comment: '' }

export default function EventsPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [form, setForm] = useState<any>(BLANK)

  const { data } = useQuery({ queryKey: ['events'], queryFn: () => api.get<any>('/events') })
  const events: any[] = (data?.events ?? []).sort((a: any, b: any) => b.date.localeCompare(a.date))

  const create = useMutation({ mutationFn: (b: any) => api.post('/events', b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); setShowForm(false); setForm(BLANK) } })
  const update = useMutation({ mutationFn: ({ id, ...b }: any) => api.patch(`/events/${id}`, b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); setSelected(null) } })
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/events/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); setSelected(null) } })

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, position: 'sticky', top: 0, zIndex: 10, background: 'rgba(21,18,27,0.9)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>События</h1>
          <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>{events.length} событий</p>
        </div>
        <button onClick={() => { setForm(BLANK); setShowForm(true) }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 13, fontWeight: 700, boxShadow: '0 4px 20px rgba(139,92,246,0.3)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>Добавить
        </button>
      </div>

      <div style={{ padding: '16px 32px 80px', flex: 1 }}>
        {events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'rgba(204,195,216,0.2)', display: 'block', marginBottom: 12 }}>event</span>
            <p style={{ fontSize: 14, color: 'rgba(204,195,216,0.4)', margin: 0 }}>Событий нет</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {events.map((ev: any) => {
              const [statusLabel, statusColor] = STATUS[ev.status] ?? ['—', 'rgba(204,195,216,0.4)']
              let dateStr = ev.date
              try { dateStr = format(new Date(ev.date), 'd MMMM', { locale: ru }) } catch {}
              return (
                <div key={ev.id} className="glass-l2" onClick={() => setSelected(ev)} style={{ borderRadius: 14, padding: '16px 18px', cursor: 'pointer', display: 'flex', gap: 16, alignItems: 'flex-start', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.35)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: `${statusColor}22`, border: `1px solid ${statusColor}44`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 18, fontWeight: 900, fontStyle: 'italic', color: statusColor, lineHeight: 1 }}>{ev.date.split('-')[2]}</span>
                    <span style={{ fontSize: 10, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{ev.date.split('-')[1] ? ['', 'янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][Number(ev.date.split('-')[1])] : ''}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{TYPES[ev.type] ?? ev.type}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", padding: '2px 7px', borderRadius: 6, background: `${statusColor}22`, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{statusLabel}</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '0 0 4px' }}>
                      {ev.startTime}{ev.endTime ? ` — ${ev.endTime}` : ''} · {PAY_TYPES[ev.paymentType] ?? ev.paymentType}
                      {ev.fixedAmount ? ` · ${parseFloat(ev.fixedAmount).toLocaleString('ru')} ₽` : ''}
                    </p>
                    {ev.comment && <p style={{ fontSize: 12, color: 'rgba(204,195,216,0.5)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.comment}</p>}
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'rgba(204,195,216,0.3)', flexShrink: 0 }}>chevron_right</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(10,8,14,0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div className="glass-l1" style={{ width: '100%', maxWidth: 480, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Новое событие</h2>
              <button onClick={() => setShowForm(false)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={LBL}>Тип события</label><select value={form.type} onChange={e => setForm((p: any) => ({ ...p, type: e.target.value }))} style={SEL}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label style={LBL}>Дата</label><input type="date" value={form.date} onChange={e => setForm((p: any) => ({ ...p, date: e.target.value }))} style={INP} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={LBL}>Начало</label><input type="time" value={form.startTime} onChange={e => setForm((p: any) => ({ ...p, startTime: e.target.value }))} style={INP} /></div>
                <div><label style={LBL}>Конец</label><input type="time" value={form.endTime} onChange={e => setForm((p: any) => ({ ...p, endTime: e.target.value }))} style={INP} /></div>
              </div>
              <div><label style={LBL}>Оплата</label><select value={form.paymentType} onChange={e => setForm((p: any) => ({ ...p, paymentType: e.target.value }))} style={SEL}>{Object.entries(PAY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              {form.paymentType !== 'free' && <div><label style={LBL}>Сумма (₽)</label><input type="number" value={form.fixedAmount} onChange={e => setForm((p: any) => ({ ...p, fixedAmount: e.target.value }))} style={INP} /></div>}
              <div><label style={LBL}>Комментарий</label><input value={form.comment} onChange={e => setForm((p: any) => ({ ...p, comment: e.target.value }))} placeholder="Необязательно" style={INP} /></div>
              <button onClick={() => create.mutate(form)} disabled={create.isPending} style={{ width: '100%', padding: '13px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}>
                {create.isPending ? 'Создаём…' : 'Создать событие'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(10,8,14,0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
          <div className="glass-l1" style={{ width: '100%', maxWidth: 480, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{TYPES[selected.type] ?? selected.type}</h2>
                <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>{selected.date} · {selected.startTime}{selected.endTime ? ` — ${selected.endTime}` : ''}</p>
              </div>
              <button onClick={() => setSelected(null)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[['Тип оплаты', PAY_TYPES[selected.paymentType] ?? selected.paymentType], ['Сумма', selected.fixedAmount ? `${parseFloat(selected.fixedAmount).toLocaleString('ru')} ₽` : '—'], ['Комментарий', selected.comment || '—']].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
                  <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{k}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface)' }}>{v}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16, marginTop: 4 }}>
                <p style={{ ...LBL, marginBottom: 10 }}>ИЗМЕНИТЬ СТАТУС</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Object.entries(STATUS).filter(([k]) => k !== selected.status).map(([k, [l, c]]) => (
                    <button key={k} onClick={() => update.mutate({ id: selected.id, status: k })} style={{ padding: '8px 14px', borderRadius: 10, border: `1px solid ${c}44`, background: `${c}11`, color: c, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
                  ))}
                </div>
              </div>
              <button onClick={() => del.mutate(selected.id)} style={{ width: '100%', padding: '12px 0', borderRadius: 14, border: '1px solid rgba(244,63,94,0.3)', background: 'rgba(244,63,94,0.08)', color: '#F87171', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 6 }}>delete</span>Удалить событие
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
