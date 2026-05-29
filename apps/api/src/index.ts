import { serve } from '@hono/node-server'
import { app } from './app.js'
import { checkBirthdays } from './cron/birthdays.js'
import { runMigrations } from './migrations/runner.js'

const port = Number(process.env['API_PORT'] ?? 3001)

// Fail-fast: проверяем обязательные переменные окружения до запуска сервера.
function assertEnv() {
  const errors: string[] = []
  const jwtSecret = process.env['JWT_SECRET']
  if (!jwtSecret || jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be set and at least 32 characters long')
  }
  if (!process.env['DATABASE_URL']) {
    errors.push('DATABASE_URL must be set')
  }
  if (errors.length > 0) {
    console.error('[env] FATAL — server will not start:\n - ' + errors.join('\n - '))
    process.exit(1)
  }
}
assertEnv()

// Запускаем миграции перед стартом сервера
runMigrations()
  .then(() => {
    serve({ fetch: app.fetch, port }, (info) => {
      console.log(`🚀 Titan HUB API running on http://localhost:${info.port}`)
    })
  })
  .catch((err) => {
    console.error('[migrations] FATAL — server will not start:', err)
    process.exit(1)
  })

// Ежедневная проверка дней рождения в 09:00 по Москве.
// MSK = UTC+3 (без перехода на летнее время) → 06:00 UTC. Считаем в UTC,
// чтобы не зависеть от таймзоны контейнера (обычно UTC).
function scheduleBirthdayCron() {
  const now = new Date()
  const next = new Date()
  next.setUTCHours(6, 0, 0, 0)
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
  const msUntil = next.getTime() - now.getTime()

  setTimeout(async () => {
    await checkBirthdays().catch(console.error)
    setInterval(() => checkBirthdays().catch(console.error), 24 * 60 * 60 * 1000)
  }, msUntil)

  console.log(`🎂 Birthday cron scheduled (09:00 MSK), next run in ${Math.round(msUntil / 60000)} min`)
}

scheduleBirthdayCron()
