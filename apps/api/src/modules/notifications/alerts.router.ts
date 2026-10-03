import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { AppEnv } from '../../types.js'
import { publishEvent } from '../../lib/realtime.js'
import { ackStaffAlert } from './staff-calls.js'

/**
 * POST /api/alerts/:id/ack — iPhone сотрудника принял «звонок» (CallKit).
 * Без авторизации: звонок принимают с экрана блокировки, когда приложение ещё не
 * запущено. Доступ — по одноразовому ключу эскалации из VoIP-push.
 */
export const alertsRouter = new Hono<AppEnv>()

alertsRouter.post('/:id/ack', zValidator('json', z.object({
  key: z.string().min(16).max(100),
  device: z.string().max(80).optional(),
})), async (c) => {
  const id = c.req.param('id')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: 'Not found' }, 404)
  const { key, device } = c.req.valid('json')
  const result = await ackStaffAlert(c.var.db, id, key, device ?? null, (checkId) => {
    publishEvent(c.var.club?.id, 'chat:read', { checkId })
  })
  if (!result) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true, ...result })
})
