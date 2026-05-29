import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db, certificates, eq, desc } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const CertSchema = z.object({
  nominal: z.number().positive(),
})

export const certificatesRouter = new Hono<AppEnv>()
certificatesRouter.use('*', requireAuth)

certificatesRouter.get('/', requireRole('owner', 'staff'), async (c) => {
  const rows = await db.select().from(certificates).orderBy(desc(certificates.createdAt))
  // Нормализуем под фронт: amount(=nominal), числа, производный статус.
  const out = rows.map(r => ({
    id: r.id,
    code: r.code,
    amount: Number(r.nominal),
    balance: Number(r.balance),
    status: (r.isUsed || Number(r.balance) <= 0 ? 'used' : 'active') as 'used' | 'active',
    createdAt: r.createdAt,
  }))
  return c.json({ certificates: out })
})

certificatesRouter.post('/', requireRole('owner', 'staff'), zValidator('json', CertSchema), async (c) => {
  const user = c.get('user')
  const { nominal } = c.req.valid('json')
  const code = generateCode()
  const [cert] = await db.insert(certificates).values({
    code,
    nominal: String(nominal),
    balance: String(nominal),
    createdBy: user.sub,
  }).returning()
  return c.json({ certificate: cert }, 201)
})

certificatesRouter.get('/validate/:code', async (c) => {
  const [cert] = await db.select().from(certificates).where(eq(certificates.code, c.req.param('code')))
  if (!cert) return c.json({ error: 'Not found' }, 404)
  if (cert.isUsed) return c.json({ error: 'Already used' }, 400)
  return c.json({ certificate: cert })
})

certificatesRouter.get('/:id', async (c) => {
  const [cert] = await db.select().from(certificates).where(eq(certificates.id, c.req.param('id')))
  if (!cert) return c.json({ error: 'Not found' }, 404)
  return c.json({ certificate: cert })
})

certificatesRouter.put('/:id/deactivate', requireRole('owner'), async (c) => {
  const [cert] = await db.update(certificates).set({ isUsed: true }).where(eq(certificates.id, c.req.param('id'))).returning()
  if (!cert) return c.json({ error: 'Not found' }, 404)
  return c.json({ certificate: cert })
})
