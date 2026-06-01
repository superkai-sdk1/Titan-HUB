'use client'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'

export interface ChatMessage {
  id: string
  sender: string // 'guest' | 'staff'
  text: string
  readAt?: string | null
  createdAt: string
}

// Быстрые ответы персонала.
const STAFF_TEMPLATES = ['Уже идём 🙌', 'Одну минуту', 'Готовим ваш заказ', 'Сейчас подойдём со счётом', 'Спасибо!']

function timeOf(s: string): string {
  try {
    const d = new Date(s)
    return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

/**
 * Полноэкранный чат гость↔персонал в рамках чека.
 * as='guest' — открыт на планшете; as='staff' — в кассе.
 * Свои сообщения (sender===as) справа, чужие — слева.
 */
export function CheckChat({ checkId, as, onClose }: { checkId: string; as: 'guest' | 'staff'; onClose: () => void }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const { data } = useQuery({
    queryKey: ['chat', checkId],
    queryFn: () => api.get<{ messages: ChatMessage[] }>(`/pos/checks/${checkId}/chat`).then((r) => r.messages),
    refetchInterval: 4000,
  })
  const messages = data ?? []

  const send = useMutation({
    mutationFn: (t: string) => api.post(`/pos/checks/${checkId}/chat`, { text: t, from: as }),
    onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: ['chat', checkId] }) },
  })

  // Отметка «прочитано»: пока чат открыт, помечаем прочитанными сообщения другой
  // стороны. Срабатывает один раз на каждую «пачку» новых входящих.
  const markRead = useMutation({
    mutationFn: () => api.post(`/pos/checks/${checkId}/chat/read`, { as }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat', checkId] }),
  })
  const hasIncomingUnread = messages.some((m) => m.sender !== as && !m.readAt)
  useEffect(() => {
    if (hasIncomingUnread) markRead.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasIncomingUnread])

  // id последнего МОЕГО сообщения, которое уже прочитано — под ним покажем «Прочитано».
  const lastReadMineId = [...messages].reverse().find((m) => m.sender === as && m.readAt)?.id

  // Автопрокрутка вниз при новых сообщениях.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  function submit() {
    const t = text.trim()
    if (t && !send.isPending) send.mutate(t)
  }

  const otherLabel = as === 'guest' ? 'персоналом' : 'гостем'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(10,8,14,0.96)', backdropFilter: 'blur(16px)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ width: 42, height: 42, borderRadius: 13, background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="chat" size={22} color="#A78BFA" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 17, fontWeight: 800, margin: 0, color: 'var(--on-surface)' }}>Чат с {otherLabel}</p>
          <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>Обычно отвечаем за пару минут</p>
        </div>
        <button onClick={onClose} aria-label="Закрыть" style={{ width: 42, height: 42, borderRadius: 13, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="close" size={20} />
        </button>
      </div>

      {/* Messages */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--on-surface-variant)', padding: 32 }}>
            <Icon name="forum" size={48} style={{ opacity: 0.3, display: 'block', margin: '0 auto 14px' }} />
            <p style={{ fontSize: 15, margin: 0 }}>Сообщений пока нет</p>
            <p style={{ fontSize: 13, margin: '6px 0 0', opacity: 0.6 }}>Напишите — мы на связи</p>
          </div>
        )}
        {messages.map((m) => {
          const mine = m.sender === as
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '78%', padding: '10px 14px', borderRadius: 18,
                borderBottomRightRadius: mine ? 4 : 18, borderBottomLeftRadius: mine ? 18 : 4,
                background: mine ? 'linear-gradient(135deg,#8B5CF6,#6D28D9)' : 'rgba(255,255,255,0.07)',
                color: mine ? '#fff' : 'var(--on-surface)',
              }}>
                <p style={{ fontSize: 15, margin: 0, lineHeight: 1.35, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</p>
                <p style={{ fontSize: 10.5, margin: '4px 0 0', textAlign: 'right', color: mine ? 'rgba(255,255,255,0.7)' : 'var(--on-surface-variant)' }}>{timeOf(m.createdAt)}</p>
              </div>
              {m.id === lastReadMineId && (
                <span style={{ fontSize: 10.5, color: 'var(--on-surface-variant)', margin: '3px 4px 0', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Icon name="done_all" size={13} color="#4cd7f6" /> Прочитано
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Быстрые ответы (только персонал) */}
      {as === 'staff' && (
        <div style={{ display: 'flex', gap: 8, padding: '0 14px 6px', overflowX: 'auto', flexShrink: 0 }}>
          {STAFF_TEMPLATES.map((t) => (
            <button key={t} onClick={() => send.mutate(t)} disabled={send.isPending} style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 9999, border: '1px solid rgba(139,92,246,0.35)', background: 'rgba(139,92,246,0.1)', color: '#A78BFA', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 10, alignItems: 'flex-end', flexShrink: 0 }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
          placeholder="Сообщение…"
          rows={1}
          style={{
            flex: 1, resize: 'none', maxHeight: 120, padding: '12px 16px', borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
            color: 'var(--on-surface)', fontSize: 15, outline: 'none', fontFamily: 'inherit', lineHeight: 1.35,
          }}
        />
        <button
          onClick={submit}
          disabled={!text.trim() || send.isPending}
          aria-label="Отправить"
          style={{
            width: 50, height: 50, borderRadius: 16, border: 'none', flexShrink: 0,
            cursor: !text.trim() || send.isPending ? 'default' : 'pointer',
            background: !text.trim() ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,#8B5CF6,#4cd7f6)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: send.isPending ? 0.6 : 1,
          }}
        >
          <Icon name="send" size={22} />
        </button>
      </div>
    </div>
  )
}
