import { createMiddleware } from 'hono/factory'
import { verifyToken } from '@titan/auth'
import type { JwtPayload } from '@titan/auth'

type Variables = { user: JwtPayload }

export const requireAuth = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  try {
    const token = header.slice(7)
    const user = await verifyToken(token)
    c.set('user', user)
    await next()
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
})

export const requireRole = (...roles: string[]) =>
  createMiddleware<{ Variables: Variables }>(async (c, next) => {
    const user = c.get('user')
    if (!roles.includes(user.role)) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  })
