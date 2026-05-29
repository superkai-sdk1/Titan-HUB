import { db, profiles, notifications } from '@titan/database'
import { eq, and, isNull, sql } from 'drizzle-orm'

export async function checkBirthdays() {
  // Дата по Москве (UTC+3) — независимо от TZ контейнера и времени запуска.
  const msk = new Date(Date.now() + 3 * 3600 * 1000)
  const mm = String(msk.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(msk.getUTCDate()).padStart(2, '0')
  const mmdd = `${mm}-${dd}`
  const year = msk.getUTCFullYear()

  // Clients with birthday today. birthday — свободный text, поэтому НЕ кастуем в
  // ::date (битая строка уронила бы весь запрос). Сравниваем MM-DD через substring
  // только для строк формата YYYY-MM-DD.
  const birthdayClients = await db
    .select({ id: profiles.id, nickname: profiles.nickname, birthday: profiles.birthday })
    .from(profiles)
    .where(and(
      eq(profiles.role, 'client'),
      isNull(profiles.deletedAt),
      sql`${profiles.birthday} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'`,
      sql`substring(${profiles.birthday} from 6 for 5) = ${mmdd}`,
    ))

  if (birthdayClients.length === 0) {
    console.log(`[birthdays] No birthdays today (${mmdd})`)
    return
  }

  // All owners to notify
  const owners = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.role, 'owner'), isNull(profiles.deletedAt)))

  for (const client of birthdayClients) {
    const age = client.birthday
      ? year - parseInt(client.birthday.split('-')[0])
      : null

    const body = age
      ? `Сегодня ${age} ${pluralAge(age)}: ${client.nickname}`
      : `День рождения: ${client.nickname}`

    for (const owner of owners) {
      // Avoid duplicate notifications for the same client+owner today
      const existing = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(
          eq(notifications.userId, owner.id),
          eq(notifications.type, 'birthday'),
          sql`DATE(${notifications.createdAt}) = CURRENT_DATE`,
          sql`${notifications.meta}->>'clientId' = ${client.id}`,
        ))
        .limit(1)

      if (existing.length > 0) continue

      await db.insert(notifications).values({
        type: 'birthday',
        title: '🎂 День рождения клиента',
        body,
        meta: { clientId: client.id, nickname: client.nickname, age },
        userId: owner.id,
      })
    }
  }

  console.log(`[birthdays] Processed ${birthdayClients.length} birthday(s) for ${mmdd}`)
}

function pluralAge(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return 'лет'
  if (mod10 === 1) return 'год'
  if (mod10 >= 2 && mod10 <= 4) return 'года'
  return 'лет'
}
