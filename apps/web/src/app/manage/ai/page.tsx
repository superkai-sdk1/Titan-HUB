'use client'
import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'

const INP: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const SEL: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(29,26,36,0.8)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }
const LBL: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 6px', display: 'block' }

type ActionKey =
  | 'revenue_summary' | 'shift_report' | 'product_analysis' | 'client_analysis'
  | 'expense_analysis' | 'low_stock_alert' | 'popular_hours' | 'avg_check_trend'
  | 'refund_analysis' | 'salary_report' | 'event_summary' | 'certificate_usage'
  | 'bonus_usage' | 'daily_summary' | 'custom_query'

const ACTION_LABELS: Record<ActionKey, string> = {
  revenue_summary: 'Выручка',
  shift_report: 'Смены',
  product_analysis: 'Товары',
  client_analysis: 'Игроки',
  expense_analysis: 'Расходы',
  low_stock_alert: 'Остатки',
  popular_hours: 'Часы пик',
  avg_check_trend: 'Средний чек',
  refund_analysis: 'Возвраты',
  salary_report: 'Зарплаты',
  event_summary: 'События',
  certificate_usage: 'Сертификаты',
  bonus_usage: 'Бонусы',
  daily_summary: 'День',
  custom_query: 'Свой запрос',
}

const ALL_ACTIONS = Object.keys(ACTION_LABELS) as ActionKey[]

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
  const [selectedAction, setSelectedAction] = useState<ActionKey | null>(null)
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
  })

  function sendAction(action: ActionKey, customText?: string) {
    const label = customText ?? ACTION_LABELS[action]
    setMessages(m => [...m, { role: 'user', content: label, ts: Date.now() }])
    const payload = customText ? { query: customText } : undefined
    chatMutation.mutate({ action, payload })
    setCustomInput('')
  }

  function handleChipClick(action: ActionKey) {
    if (action === 'custom_query') {
      setSelectedAction(action)
    } else {
      setSelectedAction(action)
      sendAction(action)
    }
  }

  function handleSend() {
    if (!customInput.trim()) return
    sendAction('custom_query', customInput.trim())
  }

  const isLoading = chatMutation.isPending

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 0 }}>
      {/* Header */}
      <div style={{ padding: '24px 20px 12px', flexShrink: 0 }}>
        <h1 style={{
          margin: 0,
          fontSize: 28,
          fontWeight: 800,
          background: 'linear-gradient(135deg, #a78bfa, #60a5fa)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          lineHeight: 1.2,
        }}>
          AI Ассистент
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--on-surface-variant)' }}>
          Аналитика на основе данных
        </p>
      </div>

      {/* Quick action chips */}
      <div style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        padding: '4px 20px 12px',
        flexShrink: 0,
        scrollbarWidth: 'none',
      }}>
        <style>{`div::-webkit-scrollbar { display: none; }`}</style>
        {ALL_ACTIONS.map(action => {
          const isActive = selectedAction === action
          return (
            <button
              key={action}
              onClick={() => handleChipClick(action)}
              style={{
                flexShrink: 0,
                padding: '8px 14px',
                borderRadius: 20,
                border: isActive
                  ? '1px solid transparent'
                  : '1px solid rgba(255,255,255,0.12)',
                background: isActive
                  ? 'linear-gradient(135deg, #7c3aed, #2563eb)'
                  : 'rgba(255,255,255,0.06)',
                color: isActive ? '#fff' : 'var(--on-surface)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {ACTION_LABELS[action]}
            </button>
          )
        })}
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px', minHeight: 0 }}>
        {messages.length === 0 && !isLoading ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: 240,
            gap: 12,
            color: 'var(--on-surface-variant)',
          }}>
            <Icon name="psychology" size={64} style={{ opacity: 0.4 }} />
            <p style={{ margin: 0, fontSize: 15, textAlign: 'center', opacity: 0.6 }}>
              Спросите AI о вашем бизнесе
            </p>
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
        {selectedAction === 'custom_query' && (
          <p style={{ ...LBL, marginBottom: 8 }}>Свой запрос</p>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <input
            style={{ ...INP, flex: 1 }}
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder={
              selectedAction === 'custom_query'
                ? 'Введите ваш вопрос...'
                : 'Выберите действие выше или введите запрос...'
            }
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
