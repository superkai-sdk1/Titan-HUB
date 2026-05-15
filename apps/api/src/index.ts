import { serve } from '@hono/node-server'
import { app } from './app.js'
import { checkBirthdays } from './cron/birthdays.js'

const port = Number(process.env['API_PORT'] ?? 3001)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🚀 Titan HUB API running on http://localhost:${info.port}`)
})

// Daily birthday check at 9:00 AM
function scheduleBirthdayCron() {
  const now = new Date()
  const next9 = new Date(now)
  next9.setHours(9, 0, 0, 0)
  if (next9 <= now) next9.setDate(next9.getDate() + 1)
  const msUntil9 = next9.getTime() - now.getTime()

  setTimeout(async () => {
    await checkBirthdays().catch(console.error)
    setInterval(() => checkBirthdays().catch(console.error), 24 * 60 * 60 * 1000)
  }, msUntil9)

  console.log(`🎂 Birthday cron scheduled, next run in ${Math.round(msUntil9 / 60000)} min`)
}

scheduleBirthdayCron()
