'use client'
/**
 * Блок «Отзывы» (вкладка «Заведение»).
 *
 * У Яндекс.Карт и 2ГИС нет API на постинг отзывов — поэтому это приглашение:
 * заведение хранит ссылку на свою страницу отзыва, система рендерит QR (гость
 * сканирует → попадает на страницу) и даёт скопировать ссылку/текст приглашения.
 */
import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'

interface RvCfg { yandexUrl: string; twogisUrl: string; inviteText: string }

const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }
const INP: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 11, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'var(--on-surface)', fontSize: 13.5 }
const divider: React.CSSProperties = { height: 1, background: 'rgba(255,255,255,0.07)' }
const chipBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 11px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: 'var(--on-surface)' }

function QrBlock({ platform, url, copy }: { platform: 'yandex' | '2gis'; url: string; copy: (t: string) => void }) {
  const { data } = useQuery<{ qrDataUrl: string | null }>({
    queryKey: ['reviews-qr', platform, url],
    queryFn: () => api.get(`/system/reviews/qr?platform=${platform}`),
    enabled: !!url,
  })
  if (!url) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
      {data?.qrDataUrl && (
        <div style={{ background: '#fff', padding: 8, borderRadius: 10, flexShrink: 0 }}>
          <img src={data.qrDataUrl} alt="QR" style={{ width: 110, height: 110, display: 'block' }} />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button style={chipBtn} onClick={() => copy(url)}><Icon name="link" size={14} /> Скопировать ссылку</button>
        {data?.qrDataUrl && (
          <a href={data.qrDataUrl} download={`qr-otzyv-${platform}.svg`} style={{ ...chipBtn, textDecoration: 'none' }}>
            <Icon name="qr_code_2" size={14} /> Скачать QR
          </a>
        )}
      </div>
    </div>
  )
}

export function ReviewsConfig() {
  const qc = useQueryClient()
  const { show } = useToast()
  const { data } = useQuery<RvCfg>({ queryKey: ['reviews-config'], queryFn: () => api.get('/system/reviews-config') })
  const save = useMutation({
    mutationFn: (patch: Partial<RvCfg>) => api.put('/system/reviews-config', patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reviews-config'] }); qc.invalidateQueries({ queryKey: ['reviews-qr'] }); show('Сохранено', 'success') },
    onError: () => show('Не удалось сохранить', 'error'),
  })
  if (!data) return null

  const copy = (t: string) => {
    if (!t) return
    navigator.clipboard?.writeText(t).then(() => show('Скопировано', 'success'), () => show('Не удалось скопировать', 'error'))
  }
  const saveUrl = (key: keyof RvCfg, v: string, prev: string) => { if (v.trim() !== prev) save.mutate({ [key]: v.trim() }) }

  return (
    <div className="glass-l2" style={{ borderRadius: 18, padding: 16, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="star" size={18} color="#FBBF24" />
        <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Отзывы</p>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', margin: '0 0 4px', lineHeight: 1.5 }}>
        Ссылка-приглашение оставить отзыв + QR (гость сканирует и попадает на страницу заведения). Покажите QR на столе/у кассы или отправьте ссылку.
      </p>

      <span style={{ ...LBL, margin: '4px 0 2px' }}>Яндекс.Карты — ссылка на отзывы</span>
      <input type="url" defaultValue={data.yandexUrl} key={`y-${data.yandexUrl}`} maxLength={500}
        placeholder="https://yandex.ru/maps/org/.../reviews/"
        onBlur={(e) => saveUrl('yandexUrl', e.target.value, data.yandexUrl)} style={INP} />
      <QrBlock platform="yandex" url={data.yandexUrl} copy={copy} />

      <div style={{ ...divider, margin: '12px 0 0' }} />
      <span style={{ ...LBL, margin: '8px 0 2px' }}>2ГИС — ссылка на отзывы (необязательно)</span>
      <input type="url" defaultValue={data.twogisUrl} key={`g-${data.twogisUrl}`} maxLength={500}
        placeholder="https://2gis.ru/.../firm/..."
        onBlur={(e) => saveUrl('twogisUrl', e.target.value, data.twogisUrl)} style={INP} />
      <QrBlock platform="2gis" url={data.twogisUrl} copy={copy} />

      <div style={{ ...divider, margin: '12px 0 0' }} />
      <span style={{ ...LBL, margin: '8px 0 2px' }}>Текст приглашения (необязательно)</span>
      <textarea defaultValue={data.inviteText} key={`t-${data.inviteText}`} maxLength={500}
        placeholder="Понравилось у нас? Будем благодарны за отзыв 🙏"
        onBlur={(e) => { if (e.target.value !== data.inviteText) save.mutate({ inviteText: e.target.value }) }}
        style={{ ...INP, minHeight: 60, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
      {(data.inviteText || data.yandexUrl) && (
        <button style={{ ...chipBtn, alignSelf: 'flex-start', marginTop: 8 }}
          onClick={() => copy([data.inviteText, data.yandexUrl].filter(Boolean).join('\n'))}>
          <Icon name="content_copy" size={14} /> Скопировать приглашение
        </button>
      )}
    </div>
  )
}
