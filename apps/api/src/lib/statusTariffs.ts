import { tariffs, inventory, menuCategories, eq, and, asc, isNull, like, sql, type Database } from '@titan/database'

// ─────────────────────────────────────────────────────────────────────────────
// Статус клиента = ТАРИФ. Единая сущность (таблица tariffs): key — слаг статуса
// (на него ссылается profiles.client_tier), price — сумма за игровой вечер,
// backing-позиция меню (itemId) — через неё тариф ложится в чек. Иерархия по
// sort_order: Резидент → Студент → Новичок → Гость.
//
// ensureSystemStatuses идемпотентно гарантирует наличие 4 базовых статус-тарифов
// (с backing-позицией). Безопасно вызывать на каждом GET — после первого прогона
// только один SELECT.
// ─────────────────────────────────────────────────────────────────────────────

export const SYSTEM_STATUSES: { key: string; label: string; color: string; sortOrder: number }[] = [
  { key: 'resident', label: 'Резидент', color: '#8B5CF6', sortOrder: 0 },
  { key: 'student', label: 'Студент', color: '#3B82F6', sortOrder: 1 },
  { key: 'newbie', label: 'Новичок', color: '#22D3EE', sortOrder: 2 },
  { key: 'guest', label: 'Гость', color: 'rgba(204,195,216,0.6)', sortOrder: 3 },
]

export async function ensureSystemStatuses(db: Database): Promise<void> {
  // Какие статус-ключи уже есть среди тарифов.
  const existing = await db.select({ key: tariffs.key }).from(tariffs).where(sql`${tariffs.key} is not null`)
  const have = new Set(existing.map((r) => r.key as string))
  const missing = SYSTEM_STATUSES.filter((s) => !have.has(s.key))
  if (missing.length === 0) return

  try {
    await db.transaction(async (tx) => {
      // Категория «Тарифы» для backing-позиций.
      let [cat] = await tx.select().from(menuCategories)
        .where(like(sql`lower(${menuCategories.name})`, '%тариф%'))
        .orderBy(asc(menuCategories.sortOrder)).limit(1)
      if (!cat) {
        const [maxCat] = await tx.select({ m: sql<number>`coalesce(max(${menuCategories.sortOrder}), 0)::int` }).from(menuCategories)
        ;[cat] = await tx.insert(menuCategories).values({ name: 'Тарифы', sortOrder: (maxCat?.m ?? 0) + 1 }).returning()
      }

      for (const s of missing) {
        // Перепривязать существующий тариф с тем же именем (без key) — иначе создать.
        const [adopt] = await tx.select().from(tariffs)
          .where(and(isNull(tariffs.key), eq(tariffs.isActive, true), sql`lower(${tariffs.name}) = ${s.label.toLowerCase()}`))
          .limit(1)
        if (adopt) {
          await tx.update(tariffs)
            .set({ key: s.key, isSystem: true, color: s.color, sortOrder: s.sortOrder, updatedAt: new Date() })
            .where(eq(tariffs.id, adopt.id))
          continue
        }
        // Создать backing-позицию + статус-тариф (цена 0 — владелец задаст в «Тарифах»).
        const [item] = await tx.insert(inventory).values({
          name: s.label, category: cat!.id, price: '0', trackStock: false, isService: true, isActive: true,
        }).returning()
        await tx.insert(tariffs).values({
          name: s.label, key: s.key, isSystem: true, price: '0', color: s.color, sortOrder: s.sortOrder, itemId: item.id,
        })
      }
    })
  } catch {
    // Гонка двух параллельных GET (unique key) — игнорируем, статус уже создан.
  }
}
