'use client'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Send, Bot, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { ManageLayout } from '@/components/ManageLayout'

const QUICK_ACTIONS = [
  { action: 'daily_summary', label: 'Итог дня' },
  { action: 'revenue_summary', label: 'Выручка' },
  { action: 'product_analysis', label: 'Топ товары' },
  { action: 'low_stock_alert', label: 'Низкий сток' },
  { action: 'client_analysis', label: 'Клиенты' },
  { action: 'expense_analysis', label: 'Расходы' },
]

interface Message { role: 'user' | 'assistant'; text: string }

export default function AiPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')

  const ask = useMutation({
    mutationFn: (body: any) => api.post<any>('/ai/action', body),
    onSuccess: (res, vars) => {
      setMessages(m => [...m, { role: 'assistant', text: res.result }])
    },
  })

  function sendAction(action: string, question?: string) {
    const userText = question ?? QUICK_ACTIONS.find(a => a.action === action)?.label ?? action
    setMessages(m => [...m, { role: 'user', text: userText }])
    ask.mutate({ action, question })
  }

  function sendMessage() {
    if (!input.trim()) return
    sendAction('custom_query', input.trim())
    setInput('')
  }

  return (
    <ManageLayout title="AI Помощник">
      {/* Quick actions */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-4">
        {QUICK_ACTIONS.map(a => (
          <button key={a.action} onClick={() => sendAction(a.action)}
            className="shrink-0 px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-medium border border-primary/20">
            {a.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="space-y-3 mb-4 min-h-[200px]">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Bot size={48} strokeWidth={1} className="mb-3 opacity-30" />
            <p className="text-sm">Задайте вопрос или выберите быстрое действие</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${msg.role === 'user' ? 'bg-primary text-white' : 'bg-surface border border-border'}`}>
              {msg.text}
            </div>
          </div>
        ))}
        {ask.isPending && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-3 bg-surface border border-border">
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="sticky bottom-4 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Задайте вопрос..."
          className="flex-1 px-4 py-3 rounded-xl bg-surface border border-border text-white placeholder-muted-foreground"
        />
        <button onClick={sendMessage} disabled={ask.isPending || !input.trim()}
          className="px-4 py-3 rounded-xl bg-primary text-white disabled:opacity-40">
          <Send size={18} />
        </button>
      </div>
    </ManageLayout>
  )
}
