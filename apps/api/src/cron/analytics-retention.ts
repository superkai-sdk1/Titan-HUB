import { db, analyticsEvents, sql, type Database } from '@titan/database'

// ─── Ретенция analytics_events ───────────────────────────────────────────────
//
// POST /api/analytics/track пишет событие телеметрии на каждое заметное действие
// в UI → таблица analytics_events растёт безгранично (ни DELETE, ни TTL в коде не
// было). Это раздувает БД и бэкапы, а сами события нужны лишь как недавняя история.
//
// Храним последние N дней (env ANALYTICS_RETENTION_DAYS, дефолт 180), остальное
// удаляем раз в сутки. DELETE по created_at дёшев: колонка проиндексирована
// (analytics_events_created_at_idx, миграция 036). Только удаление — ничего, кроме
// устаревшей телеметрии, не трогаем. НИКОГДА не бросает наружу (как balance-audit).
//
// По всем клубам прогоняется через runForAllClubs в index.ts (database = БД клуба).

const DEFAULT_RETENTION_DAYS = 180

export async function purgeOldAnalyticsEvents(database: Database = db): Promise<void> {
  try {
    const parsed = Number(process.env['ANALYTICS_RETENTION_DAYS'])
    const days = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_RETENTION_DAYS

    // make_interval(days => N) параметризует N как целое — без склейки строк в SQL.
    await database
      .delete(analyticsEvents)
      .where(sql`${analyticsEvents.createdAt} < now() - make_interval(days => ${days})`)

    console.log(`[analytics-retention] удалены события старше ${days} дн.`)
  } catch (e) {
    // Не роняем cron-интервал: телеметрия некритична, разберёмся по логу.
    console.error('[analytics-retention] ошибка очистки analytics_events', e)
  }
}
