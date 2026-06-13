import { db as singletonDb, getClubDb } from '@titan/database'
import { createWalletBot, type WalletBotCtx } from './bot.js'

// ─────────────────────────────────────────────────────────────────────────────
// Wallet бот-менеджер (мульти-тенант). Симметричен bot-admin: на старте читает
// активные клубы из /api/internal/bot-clubs и поднимает по wallet-боту на клуб.
//   • ДЕФОЛТНЫЙ клуб → env-токен + синглтон-БД + основной WALLET_WEBAPP_URL
//     (байт-в-байт прежнее поведение);
//   • прочие → их wallet-токен + getClubDb + https://<subdomain>/wallet.
// Дедуп по токену (анти-409). Добавление клуба/смена токена → перезапуск контейнера.
// ─────────────────────────────────────────────────────────────────────────────

const API_URL = process.env['API_URL'] ?? 'http://api:3001'
const INTERNAL_SECRET = process.env['JWT_SECRET'] ?? ''
const ENV_TOKEN = process.env['WALLET_BOT_TOKEN']
const ENV_WEBAPP = process.env['WALLET_WEBAPP_URL'] ?? 'https://titanpos.ru/wallet'

interface ClubCfg {
  slug: string
  subdomain: string | null
  dbName: string
  isDefault: boolean
  adminToken: string | null
  walletToken: string | null
}

function clubConn(dbName: string): string {
  const base = process.env['DATABASE_URL']
  if (!base) throw new Error('DATABASE_URL не задан')
  const u = new URL(base)
  u.pathname = `/${dbName}`
  return u.toString()
}

async function fetchClubs(): Promise<ClubCfg[]> {
  const res = await fetch(`${API_URL}/internal/bot-clubs`, {
    headers: { 'x-internal-secret': INTERNAL_SECRET },
  })
  if (!res.ok) throw new Error(`bot-clubs ${res.status}`)
  const json = (await res.json()) as { clubs: ClubCfg[] }
  return json.clubs ?? []
}

async function main() {
  let clubs: ClubCfg[] = []
  try {
    clubs = await fetchClubs()
    console.log(`[bot-wallet] получено клубов: ${clubs.length}`)
  } catch (e) {
    console.error('[bot-wallet] не удалось получить список клубов — поднимаю только дефолт по env', e)
  }

  const startedTokens = new Set<string>()
  const toStart: { ctx: WalletBotCtx }[] = []

  for (const c of clubs) {
    const token = c.isDefault ? c.walletToken || ENV_TOKEN : c.walletToken
    if (!token) {
      console.log(`[bot-wallet] клуб «${c.slug}»: нет wallet-токена — пропуск`)
      continue
    }
    if (startedTokens.has(token)) {
      console.log(`[bot-wallet] клуб «${c.slug}»: токен уже занят — пропуск (анти-409)`)
      continue
    }
    startedTokens.add(token)
    toStart.push({
      ctx: {
        token,
        db: c.isDefault ? singletonDb : getClubDb(clubConn(c.dbName)),
        webappUrl: c.isDefault ? ENV_WEBAPP : `https://${c.subdomain}/wallet`,
        label: c.slug,
      },
    })
  }

  const hasDefault = clubs.some((c) => c.isDefault)
  if (!hasDefault && ENV_TOKEN && !startedTokens.has(ENV_TOKEN)) {
    startedTokens.add(ENV_TOKEN)
    toStart.push({
      ctx: { token: ENV_TOKEN, db: singletonDb, webappUrl: ENV_WEBAPP, label: 'default(env)' },
    })
  }

  if (toStart.length === 0) {
    console.error('[bot-wallet] нет ни одного бота для запуска (нет токенов). Выхожу.')
    return
  }

  for (const { ctx } of toStart) {
    const bot = createWalletBot(ctx)
    bot
      .start({ onStart: () => console.log(`💳 Wallet bot started for «${ctx.label}»`) })
      .catch((e) => console.error(`[bot-wallet] старт бота «${ctx.label}» не удался:`, e))
  }
  console.log(`💳 Wallet bot-manager: запущено ботов — ${toStart.length}`)
}

main().catch((e) => {
  console.error('[bot-wallet] фатальная ошибка менеджера:', e)
  process.exit(1)
})
