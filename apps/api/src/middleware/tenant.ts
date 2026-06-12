import { createMiddleware } from 'hono/factory'
import { db } from '@titan/database'
import type { AppEnv } from '../types.js'

/**
 * tenantContext — инжектит в запрос БД клуба (c.var.db) и его описание (c.var.club).
 *
 * Wave 0 (backward-compat, Фаза 1): резолюции арендатора по поддомену ещё нет —
 * используем ДЕФОЛТНУЮ (текущую) БД = синглтон `db`. Поведение байт-в-байт прежнее.
 *
 * Позже: резолвить клуб по Host (<slug>.titanpos.ru) через control-plane (clubs.db_name),
 * подставлять getClubDb(<строка подключения клуба>) и c.set('club', {...}). Роутеры,
 * читающие c.var.db, при этом автоматически начинают ходить в БД нужного клуба.
 */
export const tenantContext = createMiddleware<AppEnv>(async (c, next) => {
  c.set('db', db)
  c.set('club', null)
  await next()
})
