import { Hono } from 'hono'
import { requireAuth, requireRole } from '../../middleware/auth.js'

export const systemRouter = new Hono()
systemRouter.use('*', requireAuth)

// TODO: system info and over-the-air update via SSE
systemRouter.get('/info', async (c) => c.json({ info: null }))

systemRouter.post('/update', requireAuth, requireRole('owner'), async (c) => {
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()
  const send = (msg: string) => writer.write(encoder.encode(`data: ${JSON.stringify({ msg })}\n\n`))

  ;(async () => {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)
    const steps = ['git fetch', 'git reset --hard origin/main', 'npm ci', 'npm run build']
    for (const step of steps) {
      await send(`Running: ${step}`)
      try { await execAsync(step, { cwd: process.cwd() }) } catch (e) { await send(`Error: ${e}`) }
    }
    await send('Done')
    await writer.close()
  })()

  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
})
