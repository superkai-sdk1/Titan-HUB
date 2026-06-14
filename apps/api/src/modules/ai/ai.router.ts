import type { AppEnv } from '../../types.js'
import { fmtMsk, bizDayStr, bizDayStart, bizMonthStart } from '../../lib/dateFmt.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { Redis } from 'ioredis'
import {
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
import type { Database } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { getClubIntegration } from '../../lib/secrets.js'
import { getBusinessDayStartHour } from '../../lib/appSettings.js'

// Источник БД для модульных хелперов: пер-запросный c.var.db (на основном домене
// === синглтон) либо tx внутри read-only транзакции answerFromDb/runReadonly.
type DbOrTx = Database | Parameters<Parameters<Database['transaction']>[0]>[0]

// Снимаем возможные кавычки/пробелы вокруг значений из .env (docker не всегда их убирает)
const clean = (v: string | undefined): string => (v ?? '').trim().replace(/^["']|["']$/g, '')
const POLZA_BASE = clean(process.env['POLZA_BASE_URL']) || 'https://polza.ai/api/v1'
// id модели на Polza: с префиксом провайдера и точкой в версии
const POLZA_MODEL = clean(process.env['POLZA_MODEL']) || 'google/gemini-3.1-flash-lite'

async function callAI(db: Database, systemPrompt: string, userMessage: string): Promise<string> {
  // Ключ AI — пер-клубный (integrations БД клуба) с фолбэком на env. На основном
  // домене integrations пусты → env POLZA_API_KEY (одно-клубный прод не затронут).
  // BASE_URL/MODEL остаются из env.
  const apiKey = clean((await getClubIntegration(db, 'ai_api_key')) ?? process.env['POLZA_API_KEY'])
  const res = await fetch(`${POLZA_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: POLZA_MODEL,
      max_tokens: 2048,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Polza AI error: ${res.status} ${body.slice(0, 300)}`)
  }
  const data = await res.json() as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}

function getRedis() {
  return new Redis(process.env['REDIS_URL'] ?? 'redis://redis:6379')
}

const SYSTEM_PROMPT = [
  'Тебя зовут Tai — AI-ассистент игрового клуба Titan. Если уместно, представляйся как Tai.',
  'Отвечай кратко, конкретно, на русском языке.',
  'Если в сообщении есть блок «РЕЗУЛЬТАТ» (данные SQL-запроса к базе) или',
  '«АКТУАЛЬНЫЕ ДАННЫЕ КЛУБА» — отвечай СТРОГО по этим данным, не выдумывай.',
  'Имя человека из вопроса сопоставляй с именами и никами из данных без учёта регистра',
  '(например «Саид» ↔ «Саид»/«said»). Если ответа в данных нет — честно скажи, что таких данных нет.',
  'Суммы давай в рублях.',
].join(' ')

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

// Снимок актуального состояния клуба для произвольных вопросов (долги, остатки,
// выручка и т.д.). Подаётся в промпт, чтобы ИИ отвечал по реальным данным, а не
// угадывал. Долг клиента = отрицательный profiles.balance; депозит = положительный.
async function buildBusinessSnapshot(db: DbOrTx): Promise<string> {
  const parts: string[] = []
  // Начало текущего БИЗНЕС-ДНЯ (по настройке business_day_start_hour, по умолч.
  // 09:00 МСК), а не календарной полуночи локали сервера.
  const h = await getBusinessDayStartHour(db)
  const todayStart = bizDayStart(bizDayStr(0, h), h)

  // Должники (balance < 0) + общий долг.
  try {
    const debtors = await db
      .select({ nickname: profiles.nickname, fullName: profiles.fullName, balance: profiles.balance })
      .from(profiles)
      .where(and(eq(profiles.role, 'client'), sql`${profiles.balance}::numeric < 0`))
      .orderBy(sql`${profiles.balance}::numeric asc`)
      .limit(80)
    const totalDebt = debtors.reduce((s, d) => s + Math.abs(Number(d.balance) || 0), 0)
    if (debtors.length) {
      const lines = debtors.map(d => {
        const name = d.fullName ? `${d.fullName} (${d.nickname})` : d.nickname
        return `- ${name}: ${Math.abs(Number(d.balance)).toFixed(0)} ₽`
      }).join('\n')
      parts.push(`ДОЛЖНИКИ — всего ${debtors.length}, ОБЩИЙ ДОЛГ ${totalDebt.toFixed(0)} ₽:\n${lines}`)
    } else {
      parts.push('ДОЛЖНИКИ: нет. Общий долг 0 ₽.')
    }
  } catch { parts.push('ДОЛЖНИКИ: данные недоступны.') }

  // Депозиты клиентов (balance > 0).
  try {
    const [dep] = await db
      .select({ total: sql<string>`coalesce(sum(${profiles.balance}::numeric), 0)`, cnt: count() })
      .from(profiles)
      .where(and(eq(profiles.role, 'client'), sql`${profiles.balance}::numeric > 0`))
    parts.push(`ДЕПОЗИТЫ КЛИЕНТОВ: ${Number(dep?.total ?? 0).toFixed(0)} ₽ у ${dep?.cnt ?? 0} клиентов.`)
  } catch { /* skip */ }

  // Нет в наличии (учёт ведётся, остаток 0).
  try {
    const out = await db
      .select({ name: inventory.name })
      .from(inventory)
      .where(and(eq(inventory.trackStock, true), isNull(inventory.deletedAt), eq(inventory.stockQuantity, 0)))
      .orderBy(inventory.name)
      .limit(100)
    parts.push(out.length
      ? `НЕТ В НАЛИЧИИ (закончилось) — ${out.length} позиций: ${out.map(i => i.name).join(', ')}`
      : 'НЕТ В НАЛИЧИИ: всё в наличии.')
  } catch { /* skip */ }

  // Заканчивается (остаток >0 и ниже/равен порогу).
  try {
    const low = await db
      .select({ name: inventory.name, stock: inventory.stockQuantity, threshold: inventory.minThreshold })
      .from(inventory)
      .where(and(eq(inventory.trackStock, true), isNull(inventory.deletedAt),
        gt(inventory.stockQuantity, 0), sql`${inventory.stockQuantity} <= coalesce(${inventory.minThreshold}, 0)`))
      .limit(100)
    parts.push(low.length
      ? `ЗАКАНЧИВАЕТСЯ — ${low.length} позиций:\n${low.map(i => `- ${i.name}: ${i.stock} шт (порог ${i.threshold ?? 0})`).join('\n')}`
      : 'ЗАКАНЧИВАЕТСЯ: нет позиций ниже порога.')
  } catch { /* skip */ }

  // Сегодня: выручка/чеки.
  try {
    const [today] = await db
      .select({ rev: sum(checks.totalAmount), cnt: count() })
      .from(checks)
      .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, todayStart)))
    parts.push(`СЕГОДНЯ: выручка ${Number(today?.rev ?? 0).toFixed(0)} ₽, закрыто чеков ${today?.cnt ?? 0}.`)
  } catch { /* skip */ }

  // Текущая смена.
  try {
    const [openShift] = await db.select().from(shifts).where(eq(shifts.status, 'open')).orderBy(desc(shifts.openedAt)).limit(1)
    parts.push(openShift
      ? `СМЕНА: открыта с ${fmtMsk(new Date(openShift.openedAt), true)}.`
      : 'СМЕНА: открытой смены нет.')
  } catch { /* skip */ }

  // Всего клиентов.
  try {
    const [cl] = await db.select({ cnt: count() }).from(profiles).where(eq(profiles.role, 'client'))
    parts.push(`ВСЕГО КЛИЕНТОВ: ${cl?.cnt ?? 0}.`)
  } catch { /* skip */ }

  return parts.join('\n\n')
}

// ─── Произвольные вопросы по базе (text-to-SQL) ──────────────────────────────
// Схема базы из information_schema (кэш 5 мин). Исключаем служебные и
// чувствительные таблицы/колонки (пароли, пины, токены, ключи).
let schemaCache: { doc: string; ts: number } | null = null
const SENSITIVE_TABLES = new Set(['_migrations', 'push_subscriptions'])
const SENSITIVE_COL = /pass|pin|hash|secret|token|credential|webauthn|private_key|public_key/i

async function getSchemaDoc(db: DbOrTx): Promise<string> {
  if (schemaCache && Date.now() - schemaCache.ts < 300000) return schemaCache.doc
  const res: any = await db.execute(sql`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `)
  const rows: any[] = res.rows ?? res ?? []
  const byTable = new Map<string, string[]>()
  for (const r of rows) {
    const t = String(r.table_name)
    if (SENSITIVE_TABLES.has(t)) continue
    if (SENSITIVE_COL.test(String(r.column_name))) continue
    if (!byTable.has(t)) byTable.set(t, [])
    byTable.get(t)!.push(`${r.column_name} ${r.data_type}`)
  }
  const doc = [...byTable.entries()].map(([t, cols]) => `${t}(${cols.join(', ')})`).join('\n')
  schemaCache = { doc, ts: Date.now() }
  return doc
}

// Жёсткая проверка: только одиночный SELECT/WITH на чтение, без DDL/DML и секретов.
function sanitizeSql(raw: string): string {
  let s = (raw || '').trim().replace(/```sql/gi, '').replace(/```/g, '').trim()
  const semi = s.indexOf(';')
  if (semi >= 0) s = s.slice(0, semi).trim()
  const lower = s.toLowerCase()
  if (!/^(select|with)\b/.test(lower)) throw new Error('Не SELECT-запрос')
  if (/\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|merge|call|vacuum|reindex|lock|begin|commit|rollback)\b/.test(lower)) throw new Error('Запрещённая операция')
  if (/\binto\b/.test(lower)) throw new Error('INTO запрещён')
  if (SENSITIVE_COL.test(lower) || /push_subscription/.test(lower)) throw new Error('Чувствительные данные')
  return s
}

// Выполнение в READ ONLY транзакции с таймаутом и лимитом строк.
async function runReadonly(db: Database, query: string): Promise<any[]> {
  const wrapped = `SELECT * FROM (${query}) AS _q LIMIT 200`
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION READ ONLY`)
    await tx.execute(sql`SET LOCAL statement_timeout = '5000'`)
    const res: any = await tx.execute(sql.raw(wrapped))
    return (res.rows ?? res ?? []) as any[]
  })
}

const SQLGEN_PROMPT = [
  'Ты эксперт PostgreSQL. По схеме базы и вопросу составь ОДИН SQL-запрос ТОЛЬКО на чтение (SELECT).',
  'Правила: только SELECT или WITH...SELECT; без INSERT/UPDATE/DELETE/DDL; одна инструкция без «;».',
  'Используй ТОЛЬКО таблицы и колонки из схемы. Имена людей сравнивай через ILIKE \'%...%\' (без регистра).',
  'Долг клиента = отрицательный profiles.balance при role=\'client\'; депозит = положительный balance.',
  'Остаток товара = inventory.stock_quantity; учёт = inventory.track_stock=true; «нет в наличии» = stock_quantity=0; «заканчивается» = stock_quantity<=min_threshold.',
  'Денежные/числовые поля часто text/numeric — при сравнении и агрегации приводи через ::numeric.',
  'Закрытые чеки: checks.status=\'closed\'. Ставь разумный LIMIT. Ответь ТОЛЬКО SQL, без пояснений и markdown.',
].join(' ')

// Полный конвейер: вопрос → SQL → выполнение → блок данных для финального ответа ИИ.
async function answerFromDb(db: Database, query: string): Promise<string | null> {
  try {
    const schema = await getSchemaDoc(db)
    const rawSql = await callAI(db, SQLGEN_PROMPT, `СХЕМА БАЗЫ:\n${schema}\n\nВОПРОС: ${query}`)
    const clean = sanitizeSql(rawSql)
    const rows = await runReadonly(db, clean)
    const json = JSON.stringify(rows).slice(0, 6000)
    return `Чтобы ответить, выполнен SQL-запрос к базе:\n${clean}\n\nРЕЗУЛЬТАТ (${rows.length} строк):\n${json}`
  } catch {
    // Не валим запрос — вернём null, выше подставится снимок-фоллбек.
    return null
  }
}

async function buildContext(db: Database, action: string, payload?: Record<string, unknown>, question?: string): Promise<string> {
  const thirtyDays = new Date(Date.now() - 30 * 86400000)
  const fourteenDays = new Date(Date.now() - 14 * 86400000)
  // Границы — по БИЗНЕС-ДНЮ/БИЗНЕС-МЕСЯЦУ в МСК (по настройке business_day_start_hour,
  // по умолч. 09:00), а не по локальной полуночи сервера.
  const h = await getBusinessDayStartHour(db)
  const todayStart = bizDayStart(bizDayStr(0, h), h)
  const firstOfMonth = bizMonthStart(0, h)
  const firstOfLastMonth = bizMonthStart(-1, h)
  const lastMonthEnd = new Date(firstOfMonth.getTime() - 1)

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
        return `Сводка за сегодня (${fmtMsk(todayStart)}):\n- Выручка: ${rev} руб\n- Чеков: ${cnt}\n- Средний чек: ${avgC} руб`
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
        return `${status} смена:\n- Открыл: ${opener[0]?.nickname ?? 'неизвестно'}\n- Начало: ${fmtMsk(new Date(targetShift.openedAt), true)}\n- Длительность: ${hours}ч ${minutes}мин\n- Выручка: ${Number(revenue?.rev ?? 0).toFixed(2)} руб\n- Чеков: ${revenue?.cnt ?? 0}`
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
            // Час берём в МСК, а не UTC — иначе «популярные часы» съезжают на 3ч.
            hour: sql<number>`extract(hour from (${checks.closedAt} AT TIME ZONE 'Europe/Moscow'))::int`,
            cnt: count(),
            rev: sum(checks.totalAmount),
          })
          .from(checks)
          .where(and(eq(checks.status, 'closed'), gte(checks.createdAt, thirtyDays)))
          .groupBy(sql`extract(hour from (${checks.closedAt} AT TIME ZONE 'Europe/Moscow'))`)
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
        const lines = rows.map(r => `- ${r.nickname ?? 'неизвестно'}: ${Number(r.amount).toFixed(2)} руб (${fmtMsk(new Date(r.date))}, ${r.method})`).join('\n')
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
      const snapshot = await buildBusinessSnapshot(db)
      if (!query) return snapshot
      // Сначала пробуем точный ответ через SQL по всей базе; если не вышло —
      // подставляем общий снимок (покрывает частые вопросы).
      const dbBlock = await answerFromDb(db, query)
      if (dbBlock) {
        return `ВОПРОС ПОЛЬЗОВАТЕЛЯ: ${query}\n\n${dbBlock}\n\nСправочно (общая сводка клуба):\n${snapshot}`
      }
      return `АКТУАЛЬНЫЕ ДАННЫЕ КЛУБА:\n\n${snapshot}\n\nВОПРОС ПОЛЬЗОВАТЕЛЯ: ${query}`
    }

    default:
      return 'Нет данных для этого действия.'
  }
}

export const aiRouter = new Hono<AppEnv>()
aiRouter.use('*', requireAuth, requireRole('owner', 'staff'))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleChat(c: any) {
  const db = c.var.db
  const { action, payload, question } = c.req.valid('json') as z.infer<typeof ActionSchema>
  const cacheKey = `ai:${action}:${JSON.stringify(payload ?? {})}:${question ?? ''}`

  const redis = getRedis()
  try {
    const cached = await redis.get(cacheKey)
    if (cached) return c.json({ result: cached, cached: true })
  } catch { /* redis unavailable */ }

  let context: string
  try {
    context = await buildContext(db, action, payload, question)
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
    result = await callAI(db, SYSTEM_PROMPT, userMessage)
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
