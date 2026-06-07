import { db, profiles, eq, and, sql } from '@titan/database'

// Новичок становится Резидентом после N посещений. Посещение = БИЗНЕС-день
// (09:00→06:00 МСК), в который у клиента есть хотя бы один закрытый чек (а не
// каждый чек по отдельности — иначе 10 чеков за один вечер дали бы статус).
// Плюс ручные («виртуальные») посещения profiles.manual_visits (±, без кассы).
export const RESIDENT_VISIT_THRESHOLD = 10
// Статус, который автоматически дорастает до «Резидента» по посещениям.
export const STARTER_TIER = 'newbie'

// Число посещений = различные бизнес-дни с закрытым чеком + ручные корректировки.
export async function countVisits(profileId: string): Promise<number> {
  const res: any = await db.execute(sql`
    SELECT count(distinct date_trunc('day', (created_at AT TIME ZONE 'Europe/Moscow') - interval '9 hours'))::int AS n
    FROM checks
    WHERE player_id = ${profileId} AND status = 'closed'
  `)
  const rows = res.rows ?? res ?? []
  const checkVisits = Number(rows[0]?.n ?? 0)
  const [p] = await db.select({ mv: profiles.manualVisits }).from(profiles).where(eq(profiles.id, profileId))
  return Math.max(0, checkVisits + (p?.mv ?? 0))
}

// Прогресс к Резиденту для UI (карточка клиента + Wallet).
export interface VisitProgress {
  tier: string
  visits: number
  threshold: number
  remaining: number
  isResident: boolean
}
export async function visitProgress(profileId: string): Promise<VisitProgress> {
  const [p] = await db.select({ tier: profiles.clientTier }).from(profiles).where(eq(profiles.id, profileId))
  const tier = p?.tier ?? STARTER_TIER
  const visits = await countVisits(profileId)
  const isStarter = tier === STARTER_TIER
  return {
    tier,
    visits,
    threshold: RESIDENT_VISIT_THRESHOLD,
    remaining: isStarter ? Math.max(0, RESIDENT_VISIT_THRESHOLD - visits) : 0,
    isResident: tier === 'resident',
  }
}

// Авто-повышение Новичок→Резидент при достижении порога. Вызывать после оплаты
// чека и после ручной корректировки посещений. Возвращает { promoted } — true,
// если статус только что сменился (для уведомления).
export async function maybePromoteToResident(profileId: string): Promise<{ promoted: boolean }> {
  const [p] = await db.select({ tier: profiles.clientTier }).from(profiles).where(eq(profiles.id, profileId))
  if (!p || p.tier !== STARTER_TIER) return { promoted: false }
  const visits = await countVisits(profileId)
  if (visits < RESIDENT_VISIT_THRESHOLD) return { promoted: false }
  // Условие clientTier=STARTER_TIER в WHERE защищает от гонки (двойное повышение).
  const updated = await db
    .update(profiles)
    .set({ clientTier: 'resident' })
    .where(and(eq(profiles.id, profileId), eq(profiles.clientTier, STARTER_TIER)))
    .returning({ id: profiles.id })
  return { promoted: updated.length > 0 }
}
