import type { AppEnv } from '../../types.js'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { integrations, eq, type Database } from '@titan/database'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { encryptSecret, decryptSecret, maskSecret, getClubIntegration } from '../../lib/secrets.js'
import {
  searchPlayers, clubResidents, playerDetail, gomafiaLogin, parseClubId,
  type GomafiaPlayer,
} from '../../lib/gomafia.js'

// ─────────────────────────────────────────────────────────────────────────────
// Интеграция GoMafia.pro: подключение клуба (логин владельца) + поиск игроков и
// состав клуба для подбора при создании клиента. Поиск/составы публичны; логин
// нужен лишь чтобы подтвердить владельца и определить id его клуба.
//
// Хранение (таблица integrations клуба, шифрованно): gomafia_login,
// gomafia_password, gomafia_club_id. Фолбэк уровня платформы — env GOMAFIA_LOGIN/
// GOMAFIA_PASSWORD («проектный» аккаунт).
// ─────────────────────────────────────────────────────────────────────────────

export const gomafiaRouter = new Hono<AppEnv>()

const K_LOGIN = 'gomafia_login'
const K_PASS = 'gomafia_password'
const K_CLUB = 'gomafia_club_id'

async function setKey(db: Database, key: string, value: string, userId: string): Promise<void> {
  const valueEnc = encryptSecret(value)
  await db.insert(integrations).values({ key, valueEnc, updatedBy: userId })
    .onConflictDoUpdate({ target: integrations.key, set: { valueEnc, updatedAt: new Date(), updatedBy: userId } })
}
async function delKey(db: Database, key: string): Promise<void> {
  await db.delete(integrations).where(eq(integrations.key, key))
}

// Логин/пароль: интеграция клуба → иначе «проектный» аккаунт из env.
async function resolveCreds(db: Database): Promise<{ login: string; password: string; source: 'club' | 'project' } | null> {
  const login = await getClubIntegration(db, K_LOGIN).catch(() => null)
  const password = await getClubIntegration(db, K_PASS).catch(() => null)
  if (login && password) return { login, password, source: 'club' }
  const el = process.env['GOMAFIA_LOGIN']
  const ep = process.env['GOMAFIA_PASSWORD']
  if (el && ep) return { login: el, password: ep, source: 'project' }
  return null
}

// ─── Кэш состава клуба (для пометки «из клуба» и локальной фильтрации) ─────────
const rosterCache = new Map<string, { at: number; residents: GomafiaPlayer[] }>()
const ROSTER_TTL_MS = 5 * 60 * 1000
const ROSTER_MAX_PAGES = 12 // ~120 игроков с запасом

async function getClubRoster(clubId: string): Promise<GomafiaPlayer[]> {
  const cached = rosterCache.get(clubId)
  if (cached && Date.now() - cached.at < ROSTER_TTL_MS) return cached.residents
  const all: GomafiaPlayer[] = []
  for (let page = 1; page <= ROSTER_MAX_PAGES; page++) {
    const { residents, total } = await clubResidents(clubId, { page })
    all.push(...residents)
    if (all.length >= total || residents.length === 0) break
  }
  rosterCache.set(clubId, { at: Date.now(), residents: all })
  return all
}

// ─── Статус подключения ───────────────────────────────────────────────────────
gomafiaRouter.get('/status', requireAuth, requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const creds = await resolveCreds(db)
  const clubId = await getClubIntegration(db, K_CLUB).catch(() => null)
  let loginMasked: string | null = null
  try {
    const l = await getClubIntegration(db, K_LOGIN)
    if (l) loginMasked = maskSecret(l)
  } catch { /* нет логина клуба */ }
  let clubTitle: string | null = null
  if (clubId) {
    try { clubTitle = (await clubResidents(clubId, { page: 1 })).club?.title ?? null } catch { /* офлайн */ }
  }
  return c.json({
    connected: !!creds || !!clubId,
    source: creds?.source ?? null,
    clubId: clubId ?? null,
    clubTitle,
    loginMasked,
  })
})

// ─── Подключить: проверить логин, определить клуб, сохранить ───────────────────
gomafiaRouter.post(
  '/connect',
  requireAuth,
  requireRole('owner'),
  zValidator('json', z.object({
    login: z.string().min(1).max(200),
    password: z.string().min(1).max(200),
    clubUrl: z.string().max(200).optional(),
  })),
  async (c) => {
    const db = c.var.db
    const userId = c.get('user').sub
    const { login, password, clubUrl } = c.req.valid('json')

    const res = await gomafiaLogin(login, password)
    if (!res.ok) return c.json({ error: res.error === 'network' ? 'GoMafia недоступен, попробуйте позже' : (res.error ?? 'Неверный логин или пароль') }, 400)

    // Определяем id клуба: явная ссылка → ответ логина → карточка владельца.
    let clubId: string | null = clubUrl ? parseClubId(clubUrl) : null
    if (!clubId) clubId = res.clubId ?? null
    if (!clubId && res.userId) {
      try { clubId = (await playerDetail(res.userId))?.clubId ?? null } catch { /* офлайн */ }
    }

    // Сохраняем учётку клуба (шифрованно) + клуб, если определили.
    await setKey(db, K_LOGIN, login, userId)
    await setKey(db, K_PASS, password, userId)
    if (clubId) { await setKey(db, K_CLUB, clubId, userId); rosterCache.delete(clubId) }

    let clubTitle: string | null = null
    if (clubId) { try { clubTitle = (await clubResidents(clubId, { page: 1 })).club?.title ?? null } catch { /* офлайн */ } }

    return c.json({
      connected: true,
      clubId: clubId ?? null,
      clubTitle,
      loginMasked: maskSecret(login),
      needClubUrl: !clubId, // не смогли определить клуб — попросим ссылку
    })
  },
)

// ─── Указать/сменить клуб вручную (ссылка или id) ──────────────────────────────
gomafiaRouter.post(
  '/club',
  requireAuth,
  requireRole('owner'),
  zValidator('json', z.object({ clubUrl: z.string().min(1).max(200) })),
  async (c) => {
    const db = c.var.db
    const clubId = parseClubId(c.req.valid('json').clubUrl)
    if (!clubId) return c.json({ error: 'Не удалось распознать клуб. Вставьте ссылку вида gomafia.pro/club/49' }, 400)
    const r = await clubResidents(clubId, { page: 1 })
    if (!r.club) return c.json({ error: 'Клуб не найден на GoMafia' }, 404)
    await setKey(db, K_CLUB, clubId, c.get('user').sub)
    rosterCache.delete(clubId)
    return c.json({ ok: true, clubId, clubTitle: r.club.title })
  },
)

// ─── Отключить ─────────────────────────────────────────────────────────────────
gomafiaRouter.delete('/disconnect', requireAuth, requireRole('owner'), async (c) => {
  const db = c.var.db
  const clubId = await getClubIntegration(db, K_CLUB).catch(() => null)
  if (clubId) rosterCache.delete(clubId)
  await delKey(db, K_LOGIN)
  await delKey(db, K_PASS)
  await delKey(db, K_CLUB)
  return c.json({ ok: true, connected: false })
})

// ─── Поиск игроков для подбора: сперва состав клуба, затем все игроки сайта ─────
gomafiaRouter.get('/search', requireAuth, requireRole('owner', 'staff'), async (c) => {
  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 2) return c.json({ players: [], total: 0 })
  const db = c.var.db
  const clubId = await getClubIntegration(db, K_CLUB).catch(() => null)

  // Совпадения в составе клуба (локальная фильтрация по кэшу).
  let clubMatches: GomafiaPlayer[] = []
  const clubIdsSet = new Set<string>()
  if (clubId) {
    try {
      const roster = await getClubRoster(clubId)
      roster.forEach((p) => clubIdsSet.add(p.gomafiaId))
      const ql = q.toLowerCase()
      clubMatches = roster.filter((p) => p.login.toLowerCase().includes(ql))
    } catch { /* офлайн — пропускаем клубную часть */ }
  }

  // Глобальный поиск по всем игрокам сайта.
  const { players: global } = await searchPlayers(q, { limit: 20 })

  // Склейка: сначала клуб (inClub), затем глобальные без дублей.
  const seen = new Set<string>()
  const out: (GomafiaPlayer & { inClub: boolean })[] = []
  for (const p of clubMatches) { if (!seen.has(p.gomafiaId)) { seen.add(p.gomafiaId); out.push({ ...p, inClub: true }) } }
  for (const p of global) { if (!seen.has(p.gomafiaId)) { seen.add(p.gomafiaId); out.push({ ...p, inClub: clubIdsSet.has(p.gomafiaId) }) } }

  return c.json({ players: out.slice(0, 30), total: out.length })
})

// ─── Состав клуба (для просмотра) ──────────────────────────────────────────────
gomafiaRouter.get('/club/residents', requireAuth, requireRole('owner', 'staff'), async (c) => {
  const db = c.var.db
  const clubId = await getClubIntegration(db, K_CLUB).catch(() => null)
  if (!clubId) return c.json({ error: 'Клуб GoMafia не подключён' }, 400)
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1)
  const r = await clubResidents(clubId, { page })
  return c.json({ club: r.club, residents: r.residents, total: r.total })
})

// ─── Полная карточка игрока (с именем/фамилией) — для автозаполнения ───────────
gomafiaRouter.get('/player/:id', requireAuth, requireRole('owner', 'staff'), async (c) => {
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'bad id' }, 400)
  const p = await playerDetail(id)
  if (!p) return c.json({ error: 'Игрок не найден' }, 404)
  return c.json({ player: p })
})
