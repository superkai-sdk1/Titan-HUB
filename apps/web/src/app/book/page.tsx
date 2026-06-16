'use client'
/**
 * Публичная страница онлайн-бронирования (без авторизации). Клуб определяется по
 * домену (tenantContext на бэке). Гость оставляет заявку → она падает владельцу
 * со статусом «новая». /book вынесен в PUBLIC (AuthGuard) и без app-хрома.
 */
import React, { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Zone { id: string; name: string; capacity: number | null }
interface Config { enabled: boolean; clubName?: string; hoursOpen?: string; hoursClose?: string; zones?: Zone[] }

const card: React.CSSProperties = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)', borderRadius: 24, padding: 22, width: '100%', maxWidth: 440 }
const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--on-surface-variant)', margin: '12px 0 5px', display: 'block' }
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '12px 13px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 15 }

function todayStr(): string {
  // Дата в МСК (UTC+3) для min у date-инпута.
  const d = new Date(Date.now() + 3 * 3600 * 1000)
  return d.toISOString().slice(0, 10)
}

export default function BookPage() {
  const [cfg, setCfg] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [guests, setGuests] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState('2')
  const [zoneId, setZoneId] = useState('')
  const [comment, setComment] = useState('')

  useEffect(() => {
    api.get<Config>('/bookings/public/config')
      .then(setCfg).catch(() => setCfg({ enabled: false })).finally(() => setLoading(false))
  }, [])

  const submit = async () => {
    setError('')
    if (!name.trim() || phone.replace(/\D/g, '').length < 10 || !date || !time) {
      setError('Заполните имя, телефон, дату и время'); return
    }
    setSubmitting(true)
    try {
      await api.post('/bookings/public', {
        name: name.trim(),
        phone: phone.trim(),
        guests: guests ? Number(guests) : undefined,
        date, time,
        durationHours: duration ? Number(duration) : undefined,
        spaceId: zoneId || undefined,
        comment: comment.trim() || undefined,
      })
      setSent(true)
    } catch (e: any) {
      setError(e?.message || 'Не удалось отправить заявку')
    } finally {
      setSubmitting(false)
    }
  }

  const wrap: React.CSSProperties = { minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }

  if (loading) return <div style={wrap}><div style={{ color: 'var(--on-surface-variant)' }}>Загрузка…</div></div>

  if (!cfg?.enabled) return (
    <div style={wrap}><div style={{ ...card, textAlign: 'center' }}>
      <p style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Онлайн-бронирование недоступно</p>
      <p style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginTop: 8 }}>Свяжитесь с заведением напрямую.</p>
    </div></div>
  )

  if (sent) return (
    <div style={wrap}><div style={{ ...card, textAlign: 'center' }}>
      <div style={{ fontSize: 44 }}>✅</div>
      <p style={{ fontSize: 19, fontWeight: 800, margin: '8px 0 0' }}>Заявка принята!</p>
      <p style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginTop: 8, lineHeight: 1.5 }}>
        Мы свяжемся с вами для подтверждения брони. Спасибо!
      </p>
    </div></div>
  )

  return (
    <div style={wrap}>
      <div style={card}>
        <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0 }}>{cfg.clubName}</p>
        <h1 style={{ fontSize: 23, fontWeight: 800, margin: '2px 0 0' }}>Бронирование</h1>
        {(cfg.hoursOpen && cfg.hoursClose) && (
          <p style={{ fontSize: 12.5, color: 'var(--on-surface-variant)', marginTop: 6 }}>Часы работы: {cfg.hoursOpen}–{cfg.hoursClose}</p>
        )}

        <label style={label}>Имя*</label>
        <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Как к вам обращаться" maxLength={120} />

        <label style={label}>Телефон*</label>
        <input style={input} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 999 123-45-67" maxLength={30} />

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Дата*</label>
            <input style={input} type="date" value={date} min={todayStr()} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Время*</label>
            <input style={input} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Гостей</label>
            <input style={input} type="number" min={1} value={guests} onChange={(e) => setGuests(e.target.value)} placeholder="2" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>На сколько часов</label>
            <select style={input} value={duration} onChange={(e) => setDuration(e.target.value)}>
              {['1', '2', '3', '4', '5', '6', '8'].map((h) => <option key={h} value={h}>{h} ч</option>)}
            </select>
          </div>
        </div>

        {!!cfg.zones?.length && (
          <>
            <label style={label}>Зона</label>
            <select style={input} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
              <option value="">Любая / на усмотрение</option>
              {cfg.zones.map((z) => <option key={z.id} value={z.id}>{z.name}{z.capacity ? ` (до ${z.capacity})` : ''}</option>)}
            </select>
          </>
        )}

        <label style={label}>Комментарий</label>
        <textarea style={{ ...input, minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Повод, пожелания…" maxLength={500} />

        {error && <p style={{ color: '#f87171', fontSize: 13, margin: '12px 0 0' }}>{error}</p>}

        <button onClick={submit} disabled={submitting}
          style={{ width: '100%', marginTop: 18, padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 800, background: 'var(--primary-violet, #8B5CF6)', color: '#fff', opacity: submitting ? 0.7 : 1 }}>
          {submitting ? 'Отправляем…' : 'Отправить заявку'}
        </button>
        <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
          Нажимая кнопку, вы соглашаетесь на обработку контактных данных для связи по брони.
        </p>
      </div>
    </div>
  )
}
