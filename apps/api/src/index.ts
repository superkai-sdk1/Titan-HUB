import { serve } from '@hono/node-server'
import { closeDb } from '@titan/database'
import { app } from './app.js'
import { checkBirthdays } from './cron/birthdays.js'
import { auditBalances } from './cron/balance-audit.js'
import { runMigrations } from './migrations/runner.js'
import { getSharedRedis } from './lib/redis.js'

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
    const server = serve({ fetch: app.fetch, port }, (info) => {
      console.log(`🚀 Titan HUB API running on http://localhost:${info.port}`)
    })
    setupGracefulShutdown(server)
  })
  .catch((err) => {
    console.error('[migrations] FATAL — server will not start:', err)
    process.exit(1)
  })

// Graceful shutdown: при деплое Docker шлёт SIGTERM. Перестаём принимать новые
// соединения, даём активным запросам/транзакциям завершиться, закрываем пул БД и
// Redis. Это и закрывает «деплой рвёт in-flight транзакции/SSE» из аудита.
function setupGracefulShutdown(server: { close: (cb?: () => void) => void }) {
  let shuttingDown = false
  const shutdown = (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[shutdown] ${signal} — завершаю работу, дренаж соединений…`)
    // Форс-выход, если дренаж завис (SSE/долгие соединения) — раньше, чем
    // Docker пришлёт SIGKILL (по умолчанию через 10с после SIGTERM).
    const force = setTimeout(() => {
      console.error('[shutdown] таймаут дренажа — выходим принудительно')
      closeDb().finally(() => process.exit(1))
    }, 8000)
    force.unref()
    server.close(() => {
      closeDb()
        .finally(() => {
          try { getSharedRedis().disconnect() } catch { /* noop */ }
        })
        .finally(() => {
          clearTimeout(force)
          console.log('[shutdown] готово')
          process.exit(0)
        })
    })
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

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

// Ежедневная сверка целостности балансов клиентов в 05:00 по Москве.
// MSK = UTC+3 → 02:00 UTC. Раннее утро: тихий час, сверяем итог за прошлые сутки.
// auditBalances() сама обёрнута в try/catch и НИКОГДА не бросает — .catch здесь
// лишь страхует от отказа самого вызова, чтобы не уронить интервал/процесс.
function scheduleBalanceAuditCron() {
  const now = new Date()
  const next = new Date()
  next.setUTCHours(2, 0, 0, 0)
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
  const msUntil = next.getTime() - now.getTime()

  setTimeout(async () => {
    await auditBalances().catch(console.error)
    setInterval(() => auditBalances().catch(console.error), 24 * 60 * 60 * 1000)
  }, msUntil)

  console.log(`🧾 Balance-audit cron scheduled (05:00 MSK), next run in ${Math.round(msUntil / 60000)} min`)
}

scheduleBalanceAuditCron()
