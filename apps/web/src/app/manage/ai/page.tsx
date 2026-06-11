'use client'
import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'

const INP: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }

type ActionKey =
  | 'revenue_summary' | 'shift_report' | 'product_analysis' | 'client_analysis'
  | 'expense_analysis' | 'low_stock_alert' | 'popular_hours' | 'avg_check_trend'
  | 'refund_analysis' | 'salary_report' | 'event_summary' | 'certificate_usage'
  | 'bonus_usage' | 'daily_summary' | 'custom_query'

// Готовые полезные запросы — нажатие сразу присылает ответ (без ввода с клавиатуры).
const QUICK_ACTIONS: { key: ActionKey; label: string; icon: string }[] = [
  { key: 'daily_summary', label: 'Сводка за день', icon: 'today' },
  { key: 'revenue_summary', label: 'Выручка', icon: 'payments' },
  { key: 'low_stock_alert', label: 'Что заканчивается', icon: 'warning' },
  { key: 'product_analysis', label: 'Топ товаров', icon: 'sell' },
  { key: 'client_analysis', label: 'Игроки', icon: 'group' },
  { key: 'shift_report', label: 'Смены', icon: 'schedule' },
  { key: 'avg_check_trend', label: 'Средний чек', icon: 'bar_chart' },
  { key: 'popular_hours', label: 'Часы пик', icon: 'history' },
  { key: 'expense_analysis', label: 'Расходы', icon: 'trending_down' },
  { key: 'refund_analysis', label: 'Возвраты', icon: 'undo' },
  { key: 'salary_report', label: 'Зарплаты', icon: 'account_balance_wallet' },
  { key: 'event_summary', label: 'События', icon: 'event' },
  { key: 'certificate_usage', label: 'Сертификаты', icon: 'card_giftcard' },
  { key: 'bonus_usage', label: 'Бонусы', icon: 'star' },
]
const QUICK_LABELS: Record<string, string> = Object.fromEntries(QUICK_ACTIONS.map(a => [a.key, a.label]))

interface Message {
  role: 'user' | 'assistant'
  content: string
  ts: number
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function LoadingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '4px 0' }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'var(--on-surface-variant)',
            display: 'inline-block',
            animation: 'dot-bounce 1.2s infinite ease-in-out',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes dot-bounce {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  )
}

export default function AiPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [customInput, setCustomInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const chatMutation = useMutation({
    mutationFn: (body: { action: string; payload?: object }) =>
      api.post<{ result: string }>('/ai/chat', body),
    onSuccess: (res) => {
      setMessages(m => [...m, { role: 'assistant', content: res.result, ts: Date.now() }])
    },
    onError: () => {
      setMessages(m => [...m, { role: 'assistant', content: 'Не удалось получить ответ. Попробуйте ещё раз.', ts: Date.now() }])
    },
  })

  function sendAction(action: ActionKey, customText?: string) {
    if (chatMutation.isPending) return
    const label = customText ?? QUICK_LABELS[action] ?? action
    setMessages(m => [...m, { role: 'user', content: label, ts: Date.now() }])
    const payload = customText ? { query: customText } : undefined
    chatMutation.mutate({ action, payload })
    setCustomInput('')
  }

  // Свободный вопрос — отвечаем сразу, без промежуточных шагов.
  function handleSend() {
    if (!customInput.trim() || chatMutation.isPending) return
    sendAction('custom_query', customInput.trim())
  }

  const isLoading = chatMutation.isPending

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 0 }}>
      {/* Header */}
      <div style={{ padding: '24px 20px 12px', flexShrink: 0 }}>
        <h1 style={{
          margin: 0,
          fontSize: 25,
          fontWeight: 700,
          color: 'var(--on-surface)',
          lineHeight: 1.2,
        }}>
          AI Ассистент
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--on-surface-variant)' }}>
          Аналитика на основе данных
        </p>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px', minHeight: 0 }}>
        <style>{`div::-webkit-scrollbar { display: none; }`}</style>
        {messages.length === 0 && !isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8, paddingBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(124,58,237,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="psychology" size={24} color="#a78bfa" />
              </div>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--on-surface-variant)', lineHeight: 1.4 }}>
                Спросите что угодно о клубе или выберите готовый отчёт ниже — отвечу сразу.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {QUICK_ACTIONS.map(a => (
                <button
                  key={a.key}
                  onClick={() => sendAction(a.key)}
                  disabled={isLoading}
                  className="glass-l2"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', cursor: isLoading ? 'not-allowed' : 'pointer', textAlign: 'left', color: 'var(--on-surface)' }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(124,58,237,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={a.icon} size={18} color="#a78bfa" />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 16 }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '82%',
                    padding: '12px 16px',
                    borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    background: msg.role === 'user'
                      ? 'linear-gradient(135deg, #7c3aed, #2563eb)'
                      : undefined,
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: 'var(--on-surface)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                  className={msg.role === 'assistant' ? 'glass-l2' : undefined}
                >
                  {msg.content}
                </div>
                <span style={{
                  fontSize: 10,
                  color: 'var(--on-surface-variant)',
                  opacity: 0.5,
                  marginTop: 4,
                  paddingLeft: msg.role === 'assistant' ? 4 : 0,
                  paddingRight: msg.role === 'user' ? 4 : 0,
                }}>
                  {formatTime(msg.ts)}
                </span>
              </div>
            ))}

            {isLoading && (
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <div
                  className="glass-l2"
                  style={{
                    padding: '12px 16px',
                    borderRadius: '18px 18px 18px 4px',
                  }}
                >
                  <LoadingDots />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div
        className="glass-l1"
        style={{
          flexShrink: 0,
          padding: '12px 20px 20px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Быстрые кнопки в диалоге — всегда под рукой, отвечают сразу по нажатию */}
        {messages.length > 0 && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 10, scrollbarWidth: 'none' }}>
            {QUICK_ACTIONS.map(a => (
              <button
                key={a.key}
                onClick={() => sendAction(a.key)}
                disabled={isLoading}
                style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'var(--on-surface)', fontSize: 12, fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
              >
                <Icon name={a.icon} size={14} color="#a78bfa" /> {a.label}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <input
            style={{ ...INP, flex: 1 }}
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Спросите что угодно о клубе…"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !customInput.trim()}
            style={{
              flexShrink: 0,
              width: 46,
              height: 46,
              borderRadius: 12,
              border: 'none',
              background: customInput.trim() && !isLoading
                ? 'linear-gradient(135deg, #7c3aed, #2563eb)'
                : 'rgba(255,255,255,0.08)',
              color: customInput.trim() && !isLoading ? '#fff' : 'var(--on-surface-variant)',
              cursor: customInput.trim() && !isLoading ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.18s ease',
            }}
          >
            <Icon name="send" size={20} />
          </button>
        </div>
      </div>
    </div>
  )
}
