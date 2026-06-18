// ─────────────────────────────────────────────────────────────────────────────
// Манифест baseline.sql: какие миграции УЖЕ «вшиты» в provisioning/baseline.sql.
//
// baseline.sql — это pg_dump --schema-only, снятый с эталонной БД, прогнанной
// через часть миграций. Это НЕ чистая граница «001..NNN»: дамп делали руками и
// он непоследователен (есть 051/052, но НЕТ 050; нет всего 053–059).
//
// Этот список используется провижинингом нового клуба (modules/superadmin/
// provisioning.ts): ТОЛЬКО перечисленные ниже файлы помечаются в `_migrations`
// нового клуба как «уже применённые» (их создал baseline). ВСЕ ОСТАЛЬНЫЕ .sql из
// migrations/sql/ доприменяет штатный раннер (runMigrationsOn) — так схема нового
// клуба гарантированно совпадает с основной БД.
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ ВНИМАНИЕ: при РЕГЕНЕРАЦИИ baseline.sql (новый pg_dump) ОБЯЗАТЕЛЬНО обновить ║
// ║ этот список. Если baseline пересняли через миграцию NNN — внести сюда все  ║
// ║ файлы ≤ NNN, что реально попали в дамп. Рассинхрон = новый клуб получит    ║
// ║ либо неполную схему (файл забыли → раннер его НЕ прогонит, т.к. он помечен  ║
// ║ применённым… нет — наоборот), либо ДВОЙНОЕ применение. Страховка в         ║
// ║ provisioning.ts проверяет, что каждый .sql из каталога ЛИБО здесь, ЛИБО    ║
// ║ применён раннером — иначе громкий throw. Не полагайтесь на память: после   ║
// ║ pg_dump сверьтесь grep'ом по ключевым объектам новых миграций.            ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// Состояние на 2026-06-18 (перепроверено пообъектным grep'ом по baseline.sql):
//   • Содержит: 001–049, 051, 052.
//   • НЕ содержит (доприменяет раннер): 050, 053, 054, 055, 056, 057, 058, 059.
//     050 (integrations), 053 (collections*), 054 (fiscal_receipts),
//     055–057 (bookings + колонки), 058 (wallet_login_codes), 059 (resident_payments).
// ─────────────────────────────────────────────────────────────────────────────

export const BASELINE_MIGRATIONS: string[] = [
  '001_event_payment_type.sql',
  '002_events_fields.sql',
  '003_perf_indexes.sql',
  '004_more_indexes.sql',
  '005_warehouse.sql',
  '006_idempotency.sql',
  '007_refund_tenders.sql',
  '008_fk_constraints.sql',
  '009_inventory_soft_delete.sql',
  '010_text_to_enum.sql',
  '011_supplies_idempotency.sql',
  '012_space_types_capacity.sql',
  '013_bonus_lots.sql',
  '014_perf_indexes.sql',
  '015_drop_wrong_check_discounts_fk.sql',
  '016_check_excluded_discounts.sql',
  '017_events_cash_fields.sql',
  '018_event_contact_status.sql',
  '019_customers.sql',
  '020_profile_fullname.sql',
  '021_client_tiers.sql',
  '022_drop_dead_types.sql',
  '023_refund_restored_items.sql',
  '024_push_subscriptions.sql',
  '025_tariffs_evening_types.sql',
  '026_event_hourly_rates.sql',
  '027_wallet_notify.sql',
  '028_check_tip_amount.sql',
  '029_pending_orders.sql',
  '030_chat_messages.sql',
  '031_chat_read_at.sql',
  '032_one_open_shift.sql',
  '033_platega_tx_id.sql',
  '034_supplies_idem_full_index.sql',
  '035_supply_corrections.sql',
  '036_analytics_events.sql',
  '037_staff_comp.sql',
  '038_minicap.sql',
  '039_expense_items.sql',
  '040_newbie_tier.sql',
  '041_manual_visits.sql',
  '042_perf_indexes.sql',
  '043_revisions.sql',
  '044_stock_ledger.sql',
  '045_tx_idempotency.sql',
  '046_drafts.sql',
  '047_acquiring_surcharge.sql',
  '048_one_open_rental_per_space.sql',
  '049_fk_perf_indexes.sql',
  // 050_integrations.sql — НЕ в baseline (раннер)
  '051_client_photo_sources.sql',
  '052_status_tariff_unify.sql',
  // 053_collections.sql … 059_resident_payments.sql — НЕ в baseline (раннер)
]
