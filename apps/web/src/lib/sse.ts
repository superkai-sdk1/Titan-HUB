import { api } from '@/lib/api'

// Открыть EventSource по одноразовому SSE-тикету вместо полного JWT в URL.
// Берём короткоживущий ticket (TTL 60с) через /auth/sse-ticket по Bearer, затем
// открываем поток с ?ticket=. Так JWT не утекает в логи nginx/историю браузера.
// path — путь потока относительно API, напр. `/notifications/stream` или
// `/pos/checks/${id}/events`. extraParams — доп. query (без ведущего «?»).
export async function openSse(path: string, extraParams?: Record<string, string>): Promise<EventSource> {
  const { ticket } = await api.post<{ ticket: string }>('/auth/sse-ticket')
  const base = process.env.NEXT_PUBLIC_API_URL ?? '/api'
  const qs = new URLSearchParams({ ticket, ...(extraParams ?? {}) }).toString()
  return new EventSource(`${base}${path}?${qs}`)
}
