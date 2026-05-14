import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { Redis } from 'ioredis'
import { db, checks, checkItems, inventory, profiles, expenses, shifts, sum, count, desc, eq, gte, and, sql } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

const POLZA_BASE = process.env['POLZA_BASE_URL'] ?? 'https://polza.ai/api/v1'
const POLZA_KEY = process.env['POLZA_API_KEY'] ?? ''

async function callAI(systemPrompt: string, userMessage: string): Promise<string> {
  const res = await fetch(`${POLZA_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${POLZA_KEY}`,
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Polza AI error: ${res.status}`)
  const data = await res.json() as { choices: { message: { content: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}

function getRedis() {
  return new Redis(process.env['REDIS_URL'] ?? 'redis://redis:6379')
}

const ActionSchema = z.object({
  action: z.enum([
    'revenue_summary', 'shift_report', 'product_analysis', 'client_analysis',
    'expense_analysis', 'low_stock_alert', 'popular_hours', 'avg_check_trend',
    'refund_analysis', 'salary_report', 'event_summary', 'certificate_usage',
    'bonus_usage', 'daily_summary', 'custom_query',
  ]),
  payload: z.record(z.unknown()).optional(),
  question: z.string().optional(),
})

async function buildContext(action: string, payload?: Record<string, unknown>) {
  const thirtyDays = new Date(Date.now() - 30 * 86400000)

  switch (action) {
    case 'revenue_summary':
    case 'daily_summary': {
      const [stats] = await db.select({ rev: sum(checks.totalAmount), cnt: count() }).from(checks)
        .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, thirtyDays)))
      return `За последние 30 дней: выручка ${stats?.rev ?? 0} руб, чеков ${stats?.cnt ?? 0}.`
    }
    case 'product_analysis': {
      const top = await db
        .select({ name: inventory.name, qty: sum(checkItems.quantity), rev: sql<string>`sum(${checkItems.quantity}::numeric * ${checkItems.priceAtTime})` })
        .from(checkItems).leftJoin(inventory, eq(inventory.id, checkItems.itemId))
        .leftJoin(checks, eq(checks.id, checkItems.checkId))
        .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, thirtyDays)))
        .groupBy(inventory.name).orderBy(desc(sql`sum(${checkItems.quantity}::numeric * ${checkItems.priceAtTime})`)).limit(10)
      return `Топ товары за 30 дней: ${top.map(t => `${t.name} (${t.qty} шт, ${t.rev} руб)`).join(', ')}`
    }
    case 'client_analysis': {
      const [total] = await db.select({ count: count() }).from(profiles).where(eq(profiles.role, 'client'))
      return `Всего клиентов: ${total.count}`
    }
    case 'expense_analysis': {
      const rows = await db.select({ cat: expenses.category, total: sum(expenses.amount) })
        .from(expenses).where(gte(expenses.createdAt, thirtyDays)).groupBy(expenses.category)
      return `Расходы за 30 дней: ${rows.map(r => `${r.cat}: ${r.total}`).join(', ')}`
    }
    case 'low_stock_alert': {
      const items = await db.select().from(inventory)
        .where(and(eq(inventory.trackStock, true), sql`${inventory.stockQuantity} <= ${inventory.minThreshold}`))
      return `Товаров с низким стоком: ${items.length}. ${items.map(i => i.name).join(', ')}`
    }
    default:
      return 'Нет данных для этого действия.'
  }
}

export const aiRouter = new Hono<AppEnv>()
aiRouter.use('*', requireAuth, requireRole('owner', 'staff'))

aiRouter.post('/action', zValidator('json', ActionSchema), async (c) => {
  const { action, payload, question } = c.req.valid('json')
  const cacheKey = `ai:${action}:${JSON.stringify(payload ?? {})}`

  const redis = getRedis()
  try {
    const cached = await redis.get(cacheKey)
    if (cached) return c.json({ result: cached, cached: true })
  } catch { /* redis unavailable */ }

  const context = await buildContext(action, payload)
  const userMessage = question
    ? `${context}\n\nВопрос: ${question}`
    : context

  const result = await callAI(
    'Ты помощник менеджера игрового клуба Titan. Отвечай кратко и по делу на русском языке.',
    userMessage,
  )

  try {
    await redis.set(cacheKey, result, 'EX', 60)
  } catch { /* redis unavailable */ }
  finally {
    redis.disconnect()
  }

  return c.json({ result })
})
