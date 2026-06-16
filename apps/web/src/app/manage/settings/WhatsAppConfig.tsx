'use client'
/**
 * Блок «WhatsApp» (вкладка «Поведение»).
 *
 * Ключи (Phone Number ID / токен) вводятся в «Интеграциях». Здесь — поведение:
 * автопоздравление с ДР одобренным шаблоном Meta + тест-отправка для проверки связки.
 * Показывается только когда WhatsApp подключён.
 */
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'

interface WaCfg {
  configured: boolean
  birthdayEnabled: boolean
  birthdayTemplate: string
  lang: string
}

const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }
const INP: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 11, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'var(--on-surface)', fontSize: 13.5 }
const toggleRow: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 0' }
const divider: React.CSSProperties = { height: 1, background: 'rgba(255,255,255,0.07)' }

export function WhatsAppConfig() {
  const qc = useQueryClient()
  const { show } = useToast()
  const [testPhone, setTestPhone] = useState('')
  const { data } = useQuery<WaCfg>({ queryKey: ['whatsapp-config'], queryFn: () => api.get('/system/whatsapp-config') })

  const save = useMutation({
    mutationFn: (patch: Partial<WaCfg>) => api.put('/system/whatsapp-config', patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['whatsapp-config'] }); show('Сохранено', 'success') },
    onError: () => show('Не удалось сохранить', 'error'),
  })
  const test = useMutation({
    mutationFn: (to: string) => api.post<{ ok: boolean; error?: string }>('/system/whatsapp/test', { to }),
    onSuccess: (r) => show(r.ok ? 'Тестовое сообщение отправлено' : `Ошибка: ${r.error ?? '—'}`, r.ok ? 'success' : 'error'),
    onError: (e: any) => show(e?.message || 'Не удалось отправить', 'error'),
  })

  if (!data) return null

  return (
    <div className="glass-l2" style={{ borderRadius: 18, padding: 16, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="chat" size={18} color="#25D366" />
        <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>WhatsApp</p>
      </div>

      {!data.configured ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.28)' }}>
          <Icon name="info" size={18} color="#F59E0B" />
          <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Подключите WhatsApp во вкладке «Интеграции» (Phone Number ID + токен).</span>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', margin: '0 0 4px', lineHeight: 1.5 }}>
            Проактивные сообщения идут только одобренным шаблоном Meta. Создайте шаблон с одним параметром тела ({'{{1}}'} — имя клиента) и впишите его имя ниже.
          </p>

          <label style={toggleRow}>
            <span style={{ fontSize: 13.5 }}>Поздравлять с днём рождения <span style={{ color: 'var(--on-surface-variant)', fontSize: 12 }}>— авто в день рождения клиента (если есть телефон)</span></span>
            <input type="checkbox" checked={data.birthdayEnabled} disabled={save.isPending} onChange={(e) => save.mutate({ birthdayEnabled: e.target.checked })} style={{ width: 18, height: 18, accentColor: '#25D366' }} />
          </label>

          <div style={divider} />
          <span style={{ ...LBL, margin: '8px 0 2px' }}>Имя шаблона поздравления</span>
          <input type="text" defaultValue={data.birthdayTemplate} key={`tpl-${data.birthdayTemplate}`} maxLength={120}
            placeholder="напр. birthday_greeting"
            onBlur={(e) => { if (e.target.value !== data.birthdayTemplate) save.mutate({ birthdayTemplate: e.target.value.trim() }) }}
            style={INP} />

          <span style={{ ...LBL, margin: '10px 0 2px' }}>Язык шаблона</span>
          <input type="text" defaultValue={data.lang} key={`lang-${data.lang}`} maxLength={10}
            placeholder="ru"
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== data.lang) save.mutate({ lang: v }) }}
            style={{ ...INP, maxWidth: 120 }} />
          <p style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', margin: '4px 0 0', lineHeight: 1.5 }}>
            Код языка шаблона как в Meta (ru, en, ru_RU…). Должен совпадать с языком одобренного шаблона.
          </p>

          <div style={{ ...divider, margin: '12px 0 0' }} />
          <span style={{ ...LBL, margin: '8px 0 2px' }}>Тест-отправка</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="tel" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+7 999 123-45-67" style={{ ...INP, flex: 1 }} />
            <button disabled={test.isPending || testPhone.replace(/\D/g, '').length < 10}
              onClick={() => test.mutate(testPhone)}
              style={{ padding: '0 16px', borderRadius: 11, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'rgba(37,211,102,0.18)', color: '#25D366', whiteSpace: 'nowrap' }}>
              {test.isPending ? '…' : 'Отправить'}
            </button>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', margin: '4px 0 0', lineHeight: 1.5 }}>
            Отправит шаблон поздравления на номер для проверки связки (ключи + шаблон одобрены).
          </p>
        </>
      )}
    </div>
  )
}
