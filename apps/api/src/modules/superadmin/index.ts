// ─────────────────────────────────────────────────────────────────────────────
// Сборка суперадмин-контура (control-plane). Монтируется в app.ts под
// /api/superadmin.
//   /api/superadmin/auth/*  — bootstrap/login/passkey (БЕЗ requireSuperadmin внутри;
//                             эти эндпоинты сами решают, что публично, а что нет).
//   /api/superadmin/clubs*  — управление клубами; ВЕСЬ блок под requireSuperadmin.
// ─────────────────────────────────────────────────────────────────────────────
import { Hono } from 'hono'
import { superadminAuthRouter } from './auth.router.js'
import { superadminClubsRouter } from './clubs.router.js'
import { requireSuperadmin } from './superadmin-token.js'

export const superadminRouter = new Hono()

// Авторизация суперадмина (публичные/частично-публичные эндпоинты внутри роутера).
superadminRouter.route('/auth', superadminAuthRouter)

// Управление клубами — строго под requireSuperadmin. Гейтим и точный /clubs
// (список/создание), и /clubs/* (конкретный клуб/модули/подписка).
superadminRouter.use('/clubs', requireSuperadmin)
superadminRouter.use('/clubs/*', requireSuperadmin)
superadminRouter.route('/', superadminClubsRouter)
