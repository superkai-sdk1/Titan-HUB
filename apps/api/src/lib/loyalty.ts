import { db, profiles, eq, and, sql } from '@titan/database'

// Гость становится Резидентом после N посещений. Посещение = БИЗНЕС-день
// (09:00→06:00 МСК), в который у клиента есть хотя бы один закрытый чек (а не
// каждый чек по отдельности — иначе 10 чеков за один вечер дали бы статус).
export const RESIDENT_VISIT_THRESHOLD = 10

// Число посещений = кол-во различных бизнес-дней с закрытым чеком клиента.
export async function countVisits(profileId: string): Promise<number> {
  const res: any = await db.execute(sql`
    SELECT count(distinct date_trunc('day', (created_at AT TIME ZONE 'Europe/Moscow') - interval '9 hours'))::int AS n
    FROM checks
    WHERE player_id = ${profileId} AND status = 'closed'
  `)
  const rows = res.rows ?? res ?? []
  return Number(rows[0]?.n ?? 0)
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
  const tier = p?.tier ?? 'guest'
  const visits = await countVisits(profileId)
  const isGuest = tier === 'guest'
  return {
    tier,
    visits,
    threshold: RESIDENT_VISIT_THRESHOLD,
    remaining: isGuest ? Math.max(0, RESIDENT_VISIT_THRESHOLD - visits) : 0,
    isResident: tier === 'resident',
  }
}

// Авто-повышение Гость→Резидент при достижении порога. Вызывать после оплаты чека.
// Возвращает { promoted } — true, если статус только что сменился (для уведомления).
export async function maybePromoteToResident(profileId: string): Promise<{ promoted: boolean }> {
  const [p] = await db.select({ tier: profiles.clientTier }).from(profiles).where(eq(profiles.id, profileId))
  if (!p || p.tier !== 'guest') return { promoted: false }
  const visits = await countVisits(profileId)
  if (visits < RESIDENT_VISIT_THRESHOLD) return { promoted: false }
  // Условие clientTier='guest' в WHERE защищает от гонки (двойное повышение).
  const updated = await db
    .update(profiles)
    .set({ clientTier: 'resident' })
    .where(and(eq(profiles.id, profileId), eq(profiles.clientTier, 'guest')))
    .returning({ id: profiles.id })
  return { promoted: updated.length > 0 }
}
