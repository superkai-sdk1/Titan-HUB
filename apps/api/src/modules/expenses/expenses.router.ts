import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, expenses, eq, and, gte, lte, desc } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

const ExpenseSchema = z.object({
  category: z.enum(['rent', 'utilities', 'supplies', 'salary', 'marketing', 'equipment', 'other']).default('other'),
  amount: z.number().positive(),
  description: z.string().optional(),
  expenseDate: z.string(),
})

export const expensesRouter = new Hono<AppEnv>()
expensesRouter.use('*', requireAuth)

expensesRouter.get('/', requireRole('owner', 'staff'), async (c) => {
  const from = c.req.query('from')
  const to = c.req.query('to')

  const conditions = []
  if (from) conditions.push(gte(expenses.expenseDate, from))
  if (to) conditions.push(lte(expenses.expenseDate, to))

  const rows = await db
    .select()
    .from(expenses)
    .where(conditions.length ? and(...(conditions as [any, ...any[]])) : undefined)
    .orderBy(desc(expenses.createdAt))

  return c.json({ expenses: rows })
})

expensesRouter.post('/', requireRole('owner', 'staff'), zValidator('json', ExpenseSchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const [expense] = await db.insert(expenses).values({
    ...body,
    amount: String(body.amount),
    createdBy: user.sub,
  }).returning()
  return c.json({ expense }, 201)
})

expensesRouter.get('/:id', async (c) => {
  const [expense] = await db.select().from(expenses).where(eq(expenses.id, c.req.param('id')))
  if (!expense) return c.json({ error: 'Not found' }, 404)
  return c.json({ expense })
})

expensesRouter.patch('/:id', requireRole('owner', 'staff'), zValidator('json', ExpenseSchema.partial()), async (c) => {
  const body = c.req.valid('json')
  const update: Record<string, any> = { ...body }
  if (body.amount !== undefined) update.amount = String(body.amount)
  const [expense] = await db.update(expenses).set(update).where(eq(expenses.id, c.req.param('id'))).returning()
  if (!expense) return c.json({ error: 'Not found' }, 404)
  return c.json({ expense })
})

expensesRouter.delete('/:id', requireRole('owner'), async (c) => {
  await db.delete(expenses).where(eq(expenses.id, c.req.param('id')))
  return c.json({ ok: true })
})
