import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { Redis } from 'ioredis'
import {
  db,
  checks,
  checkItems,
  inventory,
  profiles,
  expenses,
  shifts,
  events,
  certificates,
  transactions,
  bonusHistory,
  salaryPayments,
  refunds,
  sum,
  count,
  avg,
  desc,
  eq,
  gt,
  lt,
  gte,
  lte,
  and,
  sql,
  isNull,
  or,
} from '@titan/database'
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

const SYSTEM_PROMPT = 'Ты аналитик игрового клуба Titan. Отвечай кратко, конкретно, на русском языке. Давай actionable инсайты.'

const ActionSchema = z.object({
  action: z.enum([
    'revenue_summary',
    'daily_summary',
    'shift_report',
    'product_analysis',
    'client_analysis',
    'expense_analysis',
    'low_stock_alert',
    'popular_hours',
    'avg_check_trend',
    'refund_analysis',
    'salary_report',
    'event_summary',
    'certificate_usage',
    'bonus_usage',
    'custom_query',
  ]),
  payload: z.record(z.unknown()).optional(),
  question: z.string().max(1000).optional(),
})

async function buildContext(action: string, payload?: Record<string, unknown>, question?: string): Promise<string> {
  const now = new Date()
  const thirtyDays = new Date(Date.now() - 30 * 86400000)
  const fourteenDays = new Date(Date.now() - 14 * 86400000)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

  switch (action) {
    case 'revenue_summary': {
      try {
        const [stats] = await db
          .select({
            rev: sum(checks.totalAmount),
            cnt: count(),
            avgCheck: avg(checks.totalAmount),
          })
          .from(checks)
          .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, thirtyDays)))
        const rev = Number(stats?.rev ?? 0).toFixed(2)
        const cnt = stats?.cnt ?? 0
        const avgC = Number(stats?.avgCheck ?? 0).toFixed(2)
        return `Выручка за последние 30 дней:\n- Итого: ${rev} руб\n- Чеков: ${cnt}\n- Средний чек: ${avgC} руб`
      } catch (e) {
        return `Не удалось получить данные о выручке: ${String(e)}`
      }
    }

    case 'daily_summary': {
      try {
        const [stats] = await db
          .select({
            rev: sum(checks.totalAmount),
            cnt: count(),
            avgCheck: avg(checks.totalAmount),
          })
          .from(checks)
          .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, todayStart)))
        const rev = Number(stats?.rev ?? 0).toFixed(2)
        const cnt = stats?.cnt ?? 0
        const avgC = Number(stats?.avgCheck ?? 0).toFixed(2)
        return `Сводка за сегодня (${todayStart.toLocaleDateString('ru-RU')}):\n- Выручка: ${rev} руб\n- Чеков: ${cnt}\n- Средний чек: ${avgC} руб`
      } catch (e) {
        return `Не удалось получить дневную сводку: ${String(e)}`
      }
    }

    case 'shift_report': {
      try {
        const [activeShift] = await db
          .select()
          .from(shifts)
          .where(eq(shifts.status, 'open'))
          .orderBy(desc(shifts.openedAt))
          .limit(1)

        const targetShift = activeShift ?? (await db
          .select()
          .from(shifts)
          .orderBy(desc(shifts.openedAt))
          .limit(1))[0]

        if (!targetShift) return 'Смены не найдены.'

        const opener = await db.select({ nickname: profiles.nickname })
          .from(profiles)
          .where(eq(profiles.id, targetShift.openedBy))
          .limit(1)

        const [revenue] = await db
          .select({ rev: sum(checks.totalAmount), cnt: count() })
          .from(checks)
          .where(and(eq(checks.status, 'closed'), eq(checks.shiftId, targetShift.id)))

        const durationMs = targetShift.closedAt
          ? new Date(targetShift.closedAt).getTime() - new Date(targetShift.openedAt).getTime()
          : Date.now() - new Date(targetShift.openedAt).getTime()
        const hours = Math.floor(durationMs / 3600000)
        const minutes = Math.floor((durationMs % 3600000) / 60000)

        const status = targetShift.status === 'open' ? 'Активная' : 'Последняя закрытая'
        return `${status} смена:\n- Открыл: ${opener[0]?.nickname ?? 'неизвестно'}\n- Начало: ${new Date(targetShift.openedAt).toLocaleString('ru-RU')}\n- Длительность: ${hours}ч ${minutes}мин\n- Выручка: ${Number(revenue?.rev ?? 0).toFixed(2)} руб\n- Чеков: ${revenue?.cnt ?? 0}`
      } catch (e) {
        return `Не удалось получить данные смены: ${String(e)}`
      }
    }

    case 'product_analysis': {
      try {
        const top = await db
          .select({
            name: inventory.name,
            qty: sum(checkItems.quantity),
            rev: sql<string>`sum(${checkItems.quantity}::numeric * ${checkItems.priceAtTime})`,
          })
          .from(checkItems)
          .leftJoin(inventory, eq(inventory.id, checkItems.itemId))
          .leftJoin(checks, eq(checks.id, checkItems.checkId))
          .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, thirtyDays)))
          .groupBy(inventory.name)
          .orderBy(desc(sql`sum(${checkItems.quantity}::numeric * ${checkItems.priceAtTime})`))
          .limit(10)
        if (!top.length) return 'Нет данных о продажах за последние 30 дней.'
        const rows = top.map((t, i) => `${i + 1}. ${t.name}: ${t.qty} шт — ${Number(t.rev).toFixed(2)} руб`).join('\n')
        return `Топ-10 товаров по выручке за 30 дней:\n${rows}`
      } catch (e) {
        return `Не удалось получить анализ товаров: ${String(e)}`
      }
    }

    case 'client_analysis': {
      try {
        const [total] = await db.select({ cnt: count() }).from(profiles).where(eq(profiles.role, 'client'))
        const [newThisMonth] = await db
          .select({ cnt: count() })
          .from(profiles)
          .where(and(eq(profiles.role, 'client'), gte(profiles.createdAt, firstOfMonth)))
        const [residents] = await db
          .select({ cnt: count() })
          .from(profiles)
          .where(and(eq(profiles.role, 'client'), eq(profiles.clientTier, 'resident')))

        const topSpenders = await db
          .select({ nickname: profiles.nickname, rev: sum(checks.totalAmount) })
          .from(checks)
          .leftJoin(profiles, eq(profiles.id, checks.playerId))
          .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, thirtyDays)))
          .groupBy(profiles.nickname)
          .orderBy(desc(sum(checks.totalAmount)))
          .limit(5)

        const spendersList = topSpenders.map((s, i) => `${i + 1}. ${s.nickname ?? 'гость'}: ${Number(s.rev ?? 0).toFixed(2)} руб`).join('\n')
        return `Аналитика клиентов:\n- Всего клиентов: ${total?.cnt ?? 0}\n- Новых в этом месяце: ${newThisMonth?.cnt ?? 0}\n- Резидентов: ${residents?.cnt ?? 0}\n\nТоп-5 по тратам за 30 дней:\n${spendersList}`
      } catch (e) {
        return `Не удалось получить анализ клиентов: ${String(e)}`
      }
    }

    case 'expense_analysis': {
      try {
        const rows = await db
          .select({ cat: expenses.category, total: sum(expenses.amount) })
          .from(expenses)
          .where(gte(expenses.createdAt, thirtyDays))
          .groupBy(expenses.category)
          .orderBy(desc(sum(expenses.amount)))
        if (!rows.length) return 'Расходов за последние 30 дней не найдено.'
        const [totalRow] = await db
          .select({ total: sum(expenses.amount) })
          .from(expenses)
          .where(gte(expenses.createdAt, thirtyDays))
        const catLines = rows.map(r => `- ${r.cat}: ${Number(r.total ?? 0).toFixed(2)} руб`).join('\n')
        return `Расходы за последние 30 дней:\n${catLines}\nИтого: ${Number(totalRow?.total ?? 0).toFixed(2)} руб`
      } catch (e) {
        return `Не удалось получить анализ расходов: ${String(e)}`
      }
    }

    case 'low_stock_alert': {
      try {
        const items = await db
          .select({ name: inventory.name, stock: inventory.stockQuantity, threshold: inventory.minThreshold })
          .from(inventory)
          .where(and(
            eq(inventory.trackStock, true),
            sql`${inventory.stockQuantity} <= ${inventory.minThreshold}`,
          ))
        if (!items.length) return 'Все отслеживаемые товары в норме по остаткам.'
        const lines = items.map(i => `- ${i.name}: ${i.stock} шт (порог: ${i.threshold})`).join('\n')
        return `Товары с низким остатком (${items.length} позиций):\n${lines}`
      } catch (e) {
        return `Не удалось проверить остатки: ${String(e)}`
      }
    }

    case 'popular_hours': {
      try {
        const rows = await db
          .select({
            hour: sql<number>`extract(hour from ${checks.closedAt})::int`,
            cnt: count(),
            rev: sum(checks.totalAmount),
          })
          .from(checks)
          .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, thirtyDays)))
          .groupBy(sql`extract(hour from ${checks.closedAt})`)
          .orderBy(desc(count()))
          .limit(8)
        if (!rows.length) return 'Нет данных о закрытых чеках за последние 30 дней.'
        const lines = rows.map(r => `- ${r.hour}:00 — ${r.cnt} чеков, ${Number(r.rev ?? 0).toFixed(0)} руб`).join('\n')
        return `Популярные часы (по закрытым чекам за 30 дней):\n${lines}`
      } catch (e) {
        return `Не удалось проанализировать популярные часы: ${String(e)}`
      }
    }

    case 'avg_check_trend': {
      try {
        const rows = await db
          .select({
            day: sql<string>`date_trunc('day', ${checks.createdAt})::date::text`,
            avgCheck: avg(checks.totalAmount),
            cnt: count(),
          })
          .from(checks)
          .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, fourteenDays)))
          .groupBy(sql`date_trunc('day', ${checks.createdAt})`)
          .orderBy(sql`date_trunc('day', ${checks.createdAt})`)
        if (!rows.length) return 'Нет данных за последние 14 дней.'
        const lines = rows.map(r => `- ${r.day}: ${Number(r.avgCheck ?? 0).toFixed(0)} руб (${r.cnt} чеков)`).join('\n')
        return `Средний чек по дням за последние 14 дней:\n${lines}`
      } catch (e) {
        return `Не удалось получить тренд среднего чека: ${String(e)}`
      }
    }

    case 'refund_analysis': {
      try {
        const [stats] = await db
          .select({ cnt: count(), total: sum(refunds.totalAmount) })
          .from(refunds)
          .where(gte(refunds.createdAt, thirtyDays))
        const byReason = await db
          .select({ reason: refunds.reason, cnt: count(), total: sum(refunds.totalAmount) })
          .from(refunds)
          .where(gte(refunds.createdAt, thirtyDays))
          .groupBy(refunds.reason)
          .orderBy(desc(count()))
        const reasonLines = byReason.map(r => `- ${r.reason}: ${r.cnt} шт, ${Number(r.total ?? 0).toFixed(2)} руб`).join('\n')
        return `Возвраты за последние 30 дней:\n- Кол-во: ${stats?.cnt ?? 0}\n- Сумма: ${Number(stats?.total ?? 0).toFixed(2)} руб\n\nПо причинам:\n${reasonLines || '— нет данных'}`
      } catch (e) {
        return `Не удалось получить анализ возвратов: ${String(e)}`
      }
    }

    case 'salary_report': {
      try {
        const rows = await db
          .select({
            nickname: profiles.nickname,
            amount: salaryPayments.amount,
            date: salaryPayments.createdAt,
            method: salaryPayments.paymentMethod,
          })
          .from(salaryPayments)
          .leftJoin(profiles, eq(profiles.id, salaryPayments.profileId))
          .where(and(
            gte(salaryPayments.createdAt, firstOfLastMonth),
            lte(salaryPayments.createdAt, lastMonthEnd),
          ))
          .orderBy(desc(salaryPayments.createdAt))
        if (!rows.length) return 'Выплат зарплат в прошлом месяце не найдено.'
        const [totalRow] = await db
          .select({ total: sum(salaryPayments.amount) })
          .from(salaryPayments)
          .where(and(
            gte(salaryPayments.createdAt, firstOfLastMonth),
            lte(salaryPayments.createdAt, lastMonthEnd),
          ))
        const lines = rows.map(r => `- ${r.nickname ?? 'неизвестно'}: ${Number(r.amount).toFixed(2)} руб (${new Date(r.date).toLocaleDateString('ru-RU')}, ${r.method})`).join('\n')
        return `Зарплаты за прошлый месяц:\n${lines}\nИтого: ${Number(totalRow?.total ?? 0).toFixed(2)} руб`
      } catch (e) {
        return `Не удалось получить отчёт по зарплатам: ${String(e)}`
      }
    }

    case 'event_summary': {
      try {
        const upcoming = await db
          .select({ id: events.id, date: events.date, startTime: events.startTime, type: events.type, location: events.location })
          .from(events)
          .where(eq(events.status, 'planned'))
          .orderBy(events.date)
          .limit(5)
        const recentCompleted = await db
          .select({ id: events.id, date: events.date, type: events.type })
          .from(events)
          .where(eq(events.status, 'completed'))
          .orderBy(desc(events.date))
          .limit(5)
        const upLines = upcoming.length
          ? upcoming.map(e => `- ${e.date} ${e.startTime} | ${e.type} | ${e.location ?? '—'}`).join('\n')
          : '— нет запланированных'
        const completedLines = recentCompleted.length
          ? recentCompleted.map(e => `- ${e.date} | ${e.type}`).join('\n')
          : '— нет завершённых'
        return `Мероприятия:\n\nПредстоящие:\n${upLines}\n\nНедавно завершённые:\n${completedLines}`
      } catch (e) {
        return `Не удалось получить данные о мероприятиях: ${String(e)}`
      }
    }

    case 'certificate_usage': {
      try {
        const [total] = await db.select({ cnt: count() }).from(certificates)
        const [used] = await db.select({ cnt: count() }).from(certificates).where(eq(certificates.isUsed, true))
        const [active] = await db.select({ cnt: count() }).from(certificates).where(eq(certificates.isUsed, false))
        const [totalNominal] = await db.select({ total: sum(certificates.nominal) }).from(certificates)
        const [usedBalance] = await db.select({ total: sum(certificates.balance) }).from(certificates).where(eq(certificates.isUsed, false))
        return `Сертификаты:\n- Всего выдано: ${total?.cnt ?? 0}\n- Использовано: ${used?.cnt ?? 0}\n- Активных (неиспользованных): ${active?.cnt ?? 0}\n- Суммарный номинал: ${Number(totalNominal?.total ?? 0).toFixed(2)} руб\n- Остаток на активных: ${Number(usedBalance?.total ?? 0).toFixed(2)} руб`
      } catch (e) {
        return `Не удалось получить данные о сертификатах: ${String(e)}`
      }
    }

    case 'bonus_usage': {
      try {
        // Бонусы пишутся в bonus_history (amount > 0 — начисление, < 0 — списание),
        // а НЕ в transactions, поэтому считаем по bonus_history.
        const [accruals] = await db
          .select({ total: sum(bonusHistory.amount), cnt: count() })
          .from(bonusHistory)
          .where(and(gt(bonusHistory.amount, '0'), gte(bonusHistory.createdAt, thirtyDays)))
        const [spending] = await db
          .select({ total: sum(bonusHistory.amount), cnt: count() })
          .from(bonusHistory)
          .where(and(lt(bonusHistory.amount, '0'), gte(bonusHistory.createdAt, thirtyDays)))
        const spentAbs = Math.abs(Number(spending?.total ?? 0))
        return `Бонусная программа за 30 дней:\n- Начислено: ${Number(accruals?.total ?? 0).toFixed(2)} баллов (${accruals?.cnt ?? 0} операций)\n- Списано: ${spentAbs.toFixed(2)} баллов (${spending?.cnt ?? 0} операций)`
      } catch (e) {
        return `Не удалось получить данные о бонусах: ${String(e)}`
      }
    }

    case 'custom_query': {
      const query = question ?? (payload?.query as string) ?? ''
      if (!query) return 'Не указан вопрос для произвольного запроса.'
      return `Вопрос пользователя: ${query}`
    }

    default:
      return 'Нет данных для этого действия.'
  }
}

export const aiRouter = new Hono<AppEnv>()
aiRouter.use('*', requireAuth, requireRole('owner', 'staff'))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleChat(c: any) {
  const { action, payload, question } = c.req.valid('json') as z.infer<typeof ActionSchema>
  const cacheKey = `ai:${action}:${JSON.stringify(payload ?? {})}:${question ?? ''}`

  const redis = getRedis()
  try {
    const cached = await redis.get(cacheKey)
    if (cached) return c.json({ result: cached, cached: true })
  } catch { /* redis unavailable */ }

  let context: string
  try {
    context = await buildContext(action, payload, question)
  } catch (e) {
    context = `Ошибка получения данных: ${String(e)}`
  }

  const userMessage = action === 'custom_query'
    ? context
    : question
      ? `${context}\n\nДополнительный вопрос: ${question}`
      : context

  let result: string
  try {
    result = await callAI(SYSTEM_PROMPT, userMessage)
  } catch (e) {
    return c.json({ error: `AI недоступен: ${String(e)}` }, 502)
  }

  try {
    await redis.set(cacheKey, result, 'EX', 60)
  } catch { /* redis unavailable */ } finally {
    redis.disconnect()
  }

  return c.json({ result })
}

aiRouter.post('/chat', zValidator('json', ActionSchema), handleChat)
aiRouter.post('/action', zValidator('json', ActionSchema), handleChat)
