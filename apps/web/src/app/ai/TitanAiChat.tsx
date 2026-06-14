'use client'
/**
 * TITAN AI — чат-интерфейс. Правильная chat-раскладка для любого экрана:
 *   [сообщения: внутренний скролл, flex:1]
 *   [композер: прикреплён снизу, не уезжает]
 * Шапку даёт страница (app/ai/page.tsx). Колонка центрируется (max 760px) на
 * широких экранах для читаемой длины строки. Композер сам не резервирует место под
 * нижнюю навигацию — это делает глобальное правило padding-bottom на корне страницы.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { TaiLogo } from '@/components/TaiLogo'

type ActionKey =
  | 'revenue_summary' | 'shift_report' | 'product_analysis' | 'client_analysis'
  | 'expense_analysis' | 'low_stock_alert' | 'popular_hours' | 'avg_check_trend'
  | 'refund_analysis' | 'salary_report' | 'event_summary' | 'certificate_usage'
  | 'bonus_usage' | 'daily_summary' | 'custom_query'

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
// Подсказки для пустого экрана — 6 самых частых.
const STARTERS = QUICK_ACTIONS.slice(0, 6)

interface Message { role: 'user' | 'assistant'; content: string; ts: number }

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

// Аватарка ассистента в сообщениях — статичная искра (без нагрузки на десятках
// сообщений). Фирменный знак Tai.
function AssistantAvatar() {
  return <TaiLogo size={30} animated={false} />
}

export function TitanAiChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [])

  const chat = useMutation({
    mutationFn: (body: { action: string; payload?: object }) => api.post<{ result: string }>('/ai/chat', body),
    onSuccess: (res) => setMessages(m => [...m, { role: 'assistant', content: res.result, ts: Date.now() }]),
    onError: () => setMessages(m => [...m, { role: 'assistant', content: 'Не удалось получить ответ. Попробуйте ещё раз.', ts: Date.now() }]),
  })
  const isLoading = chat.isPending

  useEffect(() => { scrollToBottom() }, [messages, isLoading, scrollToBottom])

  // Авто-рост textarea (1–5 строк).
  function autosize() {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 132) + 'px'
  }
  useEffect(() => { autosize() }, [input])

  function sendAction(action: ActionKey, customText?: string) {
    if (isLoading) return
    const label = customText ?? QUICK_LABELS[action] ?? action
    setMessages(m => [...m, { role: 'user', content: label, ts: Date.now() }])
    chat.mutate({ action, payload: customText ? { query: customText } : undefined })
    setInput('')
    requestAnimationFrame(() => taRef.current?.focus())
  }
  function handleSend() {
    const text = input.trim()
    if (!text || isLoading) return
    sendAction('custom_query', text)
  }

  const empty = messages.length === 0

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* ── Сообщения (внутренний скролл) ── */}
      <div ref={scrollRef} className="tai-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', width: '100%', padding: '16px 16px 8px', boxSizing: 'border-box' }}>
          {empty ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 18, padding: '24px 8px 8px' }}>
              <TaiLogo size={84} />
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>Чем помочь?</h2>
                <p style={{ fontSize: 14, color: 'var(--on-surface-variant)', margin: '6px 0 0', lineHeight: 1.45, maxWidth: 360 }}>
                  Спросите что угодно о клубе — выручка, остатки, смены, игроки — или начните с подсказки.
                </p>
              </div>
              <div className="tai-starters" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, width: '100%', maxWidth: 520 }}>
                {STARTERS.map(a => (
                  <button key={a.key} onClick={() => sendAction(a.key)} disabled={isLoading} className="tai-card"
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', cursor: isLoading ? 'not-allowed' : 'pointer', textAlign: 'left', color: 'var(--on-surface)', transition: 'border-color .15s, transform .12s, background .15s' }}>
                    <span style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(139,92,246,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name={a.icon} size={17} color="#a78bfa" />
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {messages.map((m, i) => {
                const mine = m.role === 'user'
                return (
                  <div key={i} className="tai-msg" style={{ display: 'flex', gap: 9, flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end' }}>
                    {!mine && <AssistantAvatar />}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', maxWidth: mine ? '84%' : 'calc(84% + 0px)', minWidth: 0 }}>
                      <div className={mine ? undefined : 'glass-l2'}
                        style={{ padding: '11px 14px', borderRadius: mine ? '18px 18px 6px 18px' : '18px 18px 18px 6px', background: mine ? 'linear-gradient(135deg, #7c3aed, #2563eb)' : undefined, fontSize: 14, lineHeight: 1.55, color: mine ? '#fff' : 'var(--on-surface)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {m.content}
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--on-surface-variant)', opacity: 0.5, marginTop: 3, padding: mine ? '0 4px 0 0' : '0 0 0 4px' }}>{formatTime(m.ts)}</span>
                    </div>
                  </div>
                )
              })}
              {isLoading && (
                <div className="tai-msg" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '2px 0' }}>
                  <TaiLogo size={34} thinking float={false} />
                  <span style={{ fontSize: 13, fontWeight: 700, background: 'linear-gradient(90deg,#a78bfa,#e0c3fc,#4cd7f6,#a78bfa)', backgroundSize: '200% 100%', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', animation: 'tai-shimmer 2s linear infinite' }}>Tai думает…</span>
                  <style>{`@keyframes tai-shimmer { to { background-position: 200% center } }`}</style>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Композер (прикреплён снизу) ── */}
      <div style={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.07)', background: 'rgba(21,18,27,0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', width: '100%', padding: '10px 12px', boxSizing: 'border-box' }}>
          {/* Быстрые чипы в активном диалоге — горизонтальный скролл */}
          {!empty && (
            <div className="tai-chips" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none' }}>
              {QUICK_ACTIONS.map(a => (
                <button key={a.key} onClick={() => sendAction(a.key)} disabled={isLoading}
                  style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'var(--on-surface)', fontSize: 12, fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                  <Icon name={a.icon} size={14} color="#a78bfa" /> {a.label}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={taRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              rows={1}
              aria-label="Сообщение для Tai"
              placeholder="Спросите что угодно о клубе…"
              disabled={isLoading}
              style={{ flex: 1, resize: 'none', maxHeight: 132, minHeight: 46, padding: '12px 14px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 16, lineHeight: 1.4, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              aria-label="Отправить"
              style={{ flexShrink: 0, width: 46, height: 46, borderRadius: 14, border: 'none', background: input.trim() && !isLoading ? 'linear-gradient(135deg, #8B5CF6, #4cd7f6)' : 'rgba(255,255,255,0.08)', color: input.trim() && !isLoading ? '#fff' : 'var(--on-surface-variant)', cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .18s, transform .12s', boxShadow: input.trim() && !isLoading ? '0 4px 14px rgba(139,92,246,0.4)' : 'none' }}
            >
              {isLoading
                ? <span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.25)', borderTopColor: 'rgba(255,255,255,0.85)', animation: 'tai-spin .6s linear infinite' }} />
                : <Icon name="send" size={20} />}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .tai-scroll::-webkit-scrollbar { width: 0; height: 0; }
        .tai-chips::-webkit-scrollbar { display: none; }
        @keyframes tai-dot { 0%,80%,100% { opacity:.25; transform:scale(.8);} 40% { opacity:1; transform:scale(1.1);} }
        @keyframes tai-spin { to { transform: rotate(360deg);} }
        @keyframes tai-in { from { opacity:0; transform: translateY(6px);} to { opacity:1; transform:none;} }
        .tai-msg { animation: tai-in .22s ease-out both; }
        .tai-card:hover { border-color: rgba(139,92,246,0.5) !important; background: rgba(139,92,246,0.08) !important; transform: translateY(-1px); }
        .tai-card:active { transform: scale(0.98); }
        @media (min-width: 560px) { .tai-starters { grid-template-columns: repeat(3, 1fr) !important; } }
        @media (prefers-reduced-motion: reduce) {
          .tai-msg { animation: none; }
          .tai-scroll { scroll-behavior: auto; }
        }
      `}</style>
    </div>
  )
}
