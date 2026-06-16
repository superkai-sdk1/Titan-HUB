'use client'
/**
 * Блок «Онлайн-бронирование» (вкладка «Заведение»).
 *
 * Тумблер включает публичную форму /book. Когда включено — показываем ссылку на
 * форму + QR (распечатать/разместить), чтобы гости бронировали сами. Заявки —
 * в «Управление → Бронирования».
 */
import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'

const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }
const toggleRow: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 0' }
const divider: React.CSSProperties = { height: 1, background: 'rgba(255,255,255,0.07)' }
const chipBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 11px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: 'var(--on-surface)' }

export function BookingConfig() {
  const qc = useQueryClient()
  const router = useRouter()
  const { show } = useToast()
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const { data } = useQuery<{ enabled: boolean }>({ queryKey: ['booking-config'], queryFn: () => api.get('/system/booking-config') })

  const save = useMutation({
    mutationFn: (enabled: boolean) => api.put('/system/booking-config', { enabled }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['booking-config'] }); show('Сохранено', 'success') },
    onError: () => show('Не удалось сохранить', 'error'),
  })
  if (!data) return null

  const copy = (t: string) => { if (t) navigator.clipboard?.writeText(t).then(() => show('Скопировано', 'success'), () => show('Ошибка', 'error')) }

  return (
    <div className="glass-l2" style={{ borderRadius: 18, padding: 16, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="event" size={18} color="#EC4899" />
        <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Онлайн-бронирование</p>
      </div>

      <label style={toggleRow}>
        <span style={{ fontSize: 13.5 }}>Публичная форма брони <span style={{ color: 'var(--on-surface-variant)', fontSize: 12 }}>— гости бронируют зону по ссылке</span></span>
        <input type="checkbox" checked={data.enabled} disabled={save.isPending} onChange={(e) => save.mutate(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#EC4899' }} />
      </label>

      {data.enabled && (
        <>
          <div style={divider} />
          <p style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', margin: '8px 0 4px', lineHeight: 1.5 }}>
            Две отдельные ссылки для гостей — отправляйте нужную. Заявки приходят в «Мероприятия» и уведомлением; подтверждение создаёт мероприятие.
          </p>
          <LinkRow loc="titan" label="Бронь в Штабе" origin={origin} copy={copy} />
          <LinkRow loc="exit" label="Бронь выезда" origin={origin} copy={copy} />
          <button style={{ ...chipBtn, alignSelf: 'flex-start', marginTop: 6 }} onClick={() => router.push('/manage/events')}><Icon name="event" size={14} /> Открыть мероприятия</button>
        </>
      )}
    </div>
  )
}

function LinkRow({ loc, label, origin, copy }: { loc: 'titan' | 'exit'; label: string; origin: string; copy: (t: string) => void }) {
  const url = origin ? `${origin}/book?loc=${loc}` : ''
  const { data: qr } = useQuery<{ qrDataUrl: string | null }>({
    queryKey: ['booking-qr', loc, origin],
    queryFn: () => api.get(`/system/booking/qr?origin=${encodeURIComponent(origin)}&loc=${loc}`),
    enabled: !!origin,
  })
  return (
    <div style={{ marginTop: 12 }}>
      <span style={{ ...LBL, margin: '0 0 4px', display: 'block' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <Icon name="link" size={15} color="var(--on-surface-variant)" />
        <span style={{ flex: 1, fontSize: 12.5, fontFamily: "'JetBrains Mono',monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url.replace(/^https?:\/\//, '')}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
        {qr?.qrDataUrl && <div style={{ background: '#fff', padding: 7, borderRadius: 10, flexShrink: 0 }}><img src={qr.qrDataUrl} alt="QR" style={{ width: 96, height: 96, display: 'block' }} /></div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button style={chipBtn} onClick={() => copy(url)}><Icon name="link" size={14} /> Скопировать</button>
          {qr?.qrDataUrl && <a href={qr.qrDataUrl} download={`qr-bron-${loc}.svg`} style={{ ...chipBtn, textDecoration: 'none' }}><Icon name="qr_code_2" size={14} /> Скачать QR</a>}
        </div>
      </div>
    </div>
  )
}
