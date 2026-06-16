'use client'
/**
 * Блок «Tai в чате» (вкладка «Поведение»).
 *
 * Включает дерзкие ответы Tai на сообщения в Telegram-чате (через бота опросов).
 * Стиль агрессивно-юморной с рамками (без хейта/угроз/запрещёнки). Нужен бот опросов
 * (токен) + ИИ-ключ Tai. Сообщение адресуется боту: «тай …» или реплаем на его ответ.
 */
import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'

interface Cfg { enabled: boolean; botReady: boolean; aiReady: boolean }
const toggleRow: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 0' }

export function TaiChatConfig() {
  const qc = useQueryClient()
  const { show } = useToast()
  const { data } = useQuery<Cfg>({ queryKey: ['tai-chat-config'], queryFn: () => api.get('/system/tai-chat-config') })
  const save = useMutation({
    mutationFn: (enabled: boolean) => api.put('/system/tai-chat-config', { enabled }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tai-chat-config'] }); show('Сохранено', 'success') },
    onError: () => show('Не удалось сохранить', 'error'),
  })
  if (!data) return null
  const blocked = !data.botReady || !data.aiReady

  return (
    <div className="glass-l2" style={{ borderRadius: 18, padding: 16, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="auto_awesome" size={18} color="#a78bfa" />
        <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Tai в чате</p>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', margin: '0 0 4px', lineHeight: 1.5 }}>
        Дерзкие ответы Tai на сообщения в Telegram-чате (через бота опросов). Адресуйте боту: напишите «тай …» или ответьте реплаем на его сообщение.
      </p>

      <label style={{ ...toggleRow, opacity: blocked ? 0.5 : 1 }}>
        <span style={{ fontSize: 13.5 }}>Отвечать в чате <span style={{ color: 'var(--on-surface-variant)', fontSize: 12 }}>— чёрный юмор, мат и жёсткие подколы (без хейта/угроз)</span></span>
        <input type="checkbox" checked={data.enabled} disabled={blocked || save.isPending} onChange={(e) => save.mutate(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#8B5CF6' }} />
      </label>

      {blocked && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 12, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.28)' }}>
          <Icon name="info" size={16} color="#F59E0B" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12.5, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
            {!data.botReady && 'Подключите «Бот опросов» во вкладке «Интеграции». '}
            {!data.aiReady && 'Нужен ключ Tai (модуль «Tai — ИИ-ассистент»).'}
          </span>
        </div>
      )}

      {data.enabled && !blocked && (
        <p style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', margin: '4px 0 0', lineHeight: 1.5 }}>
          Острый чёрный юмор включён. Без оскорблений по нац-ти/религии/полу/ориентации, без угроз и запрещёнки — только комедийные панчлайны. Если занесёт — просто выключите тумблер.
        </p>
      )}
    </div>
  )
}
