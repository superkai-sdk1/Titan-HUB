// ─────────────────────────────────────────────────────────────────────────────
// Контур входа СУПЕРАДМИНА платформы (control-plane). Полностью отделён от
// клубной авторизации: данные живут в CONTROL-БД `titan_control` (таблицы
// superadmins / superadmin_passkeys), токены несут scope='superadmin'.
//
// ПОТОК (ТЗ владельца):
//   1) Первый вход: GET /bootstrap-status → если суперадминов нет, фронт ведёт на
//      POST /bootstrap (создать логин+пароль). bootstrap выдаёт КОРОТКОЖИВУЩИЙ
//      суперадмин-токен — только чтобы дойти до регистрации пасскея.
//   2) С этим токеном — POST /passkey/register/options + /verify (регистрация
//      WebAuthn-пасскея в superadmin_passkeys).
//   3) Последующие входы: POST /login/password → если у суперадмина ЕСТЬ пасскеи,
//      сервер НЕ выдаёт токен, а возвращает { needsPasskey, challengeId } + опции
//      аутентификации; затем POST /login/passkey/verify выдаёт ПОЛНЫЙ токен.
//      Если пасскеев ещё нет (сразу после bootstrap) — /login/password выдаёт
//      токен, чтобы можно было зарегистрировать первый пасскей.
//
// Зеркалит проверенный в проде клубный passkey-флоу (apps/api/src/modules/auth/
// auth.router.ts), но: challenge в Redis под префиксом `sa:`, RP_ID/ORIGIN из
// отдельных env SUPERADMIN_WEBAUTHN_* (панель на поддомене admin.titanpos.ru),
// хранилище — control-БД.
//
// БЕЗОПАСНОСТЬ: единый ответ при неверном логине/пароле (анти-enumeration);
// пароли только bcrypt-хешем; challenge одноразовый (удаляется после verify);
// counter проверяется и обновляется; rate-limit по IP+login (Redis). Никаких
// секретов в ответах.
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { Redis } from 'ioredis'
import { hashPassword, verifyPassword } from '@titan/auth'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server'
import { isoBase64URL, isoUint8Array } from '@simplewebauthn/server/helpers'
import { clientIp } from '../../lib/clientIp.js'
import { requireSuperadmin, signSuperadminToken } from './superadmin-token.js'
import type { SuperadminEnv } from './superadmin-token.js'
// Control-БД: импорт по относительному пути к собранному dist (закрытый exports-
// map пакета @titan/database не публикует subpath, а existing-файлы трогать нельзя;
// относительный импорт резолвится и в tsx-dev, и в node-prod из общего workspace).
import {
  getControlDb,
  superadmins,
  superadminPasskeys,
  eq,
} from '../../../../../packages/database/dist/control/index.js'

// WebAuthn-конфиг СУПЕРАДМИНА. Панель живёт на отдельном поддомене
// admin.titanpos.ru, поэтому RP_ID/ORIGIN отделены от клубных WEBAUTHN_*:
//  • SA_RP_ID — РЕГИСТРИРУЕМЫЙ домен `titanpos.ru` (валиден для всех *.titanpos.ru:
//    пасскей с rpID=titanpos.ru проходит и на admin.titanpos.ru — это поддомен).
//  • SA_ORIGIN — фактический browser-origin панели (https://admin.titanpos.ru).
//  • SA_RP_NAME — человекочитаемое имя RP (общее с клубным).
const SA_RP_ID = process.env['SUPERADMIN_WEBAUTHN_RP_ID'] ?? process.env['WEBAUTHN_RP_ID'] ?? 'titanpos.ru'
const SA_ORIGIN = process.env['SUPERADMIN_WEBAUTHN_ORIGIN'] ?? 'https://admin.titanpos.ru'
const SA_RP_NAME = process.env['WEBAUTHN_RP_NAME'] ?? 'Titan HUB'
// expectedOrigin — массив (@simplewebauthn принимает string | string[]): допускаем
// и поддомен admin.titanpos.ru, и (на переходный период) основной titanpos.ru,
// чтобы вход работал и со страницы /superadmin на основном домене.
const SA_EXPECTED_ORIGINS = [SA_ORIGIN, process.env['WEBAUTHN_ORIGIN'] ?? 'https://titanpos.ru']

// Отдельный Redis-клиент на запрос (как в клубном auth.router.ts: getRedis()).
function getRedis() {
  return new Redis(process.env['REDIS_URL'] ?? 'redis://redis:6379', { lazyConnect: true })
}

// Rate-limit для пароля: 5 попыток / 15 мин (по образцу клубного login/password).
const PWD_MAX_ATTEMPTS = 5
const PWD_WINDOW_SECONDS = 900

// Redis-ключи контура суперадмина — префикс `sa:` изолирует от клубных `titan:`.
const kRegChallenge = (saId: string) => `sa:pk:reg:${saId}`
const kAuthnChallenge = (challengeId: string) => `sa:pk:authn:${challengeId}`
const kPwdFail = (ip: string, login: string) => `sa:pwd:fail:${ip}:${login}`

// TTL короткого «bootstrap»-токена: только чтобы дойти до регистрации пасскея.
const BOOTSTRAP_TOKEN_TTL = '15m'
// TTL «промежуточного» токена после login/password без пасскея (та же роль).
const NO_PASSKEY_TOKEN_TTL = '15m'

export const superadminAuthRouter = new Hono<SuperadminEnv>()

// ── GET /bootstrap-status → { needsBootstrap } ───────────────────────────────
// true, если в superadmins ещё 0 строк (можно создать первого суперадмина).
superadminAuthRouter.get('/bootstrap-status', async (c) => {
  const cdb = getControlDb()
  const rows = await cdb.select({ id: superadmins.id }).from(superadmins).limit(1)
  return c.json({ needsBootstrap: rows.length === 0 })
})

// ── POST /bootstrap { login, password } ──────────────────────────────────────
// Работает ТОЛЬКО пока суперадминов нет (иначе 409). Создаёт первого суперадмина
// с bcrypt-хешем пароля. Возвращает короткоживущий токен — для шага регистрации
// пасскея (пасскеев у нового суперадмина ещё нет).
superadminAuthRouter.post(
  '/bootstrap',
  zValidator('json', z.object({
    login: z.string().trim().min(1).max(64),
    password: z.string().min(8).max(200),
  })),
  async (c) => {
    const { login, password } = c.req.valid('json')
    const cdb = getControlDb()

    // Гонка bootstrap маловероятна (один оператор), но проверяем «никого нет» явно.
    const existing = await cdb.select({ id: superadmins.id }).from(superadmins).limit(1)
    if (existing.length > 0) {
      return c.json({ error: 'Суперадмин уже создан' }, 409)
    }

    const passwordHash = await hashPassword(password)
    const inserted = await cdb
      .insert(superadmins)
      .values({ login, passwordHash })
      .returning({ id: superadmins.id, login: superadmins.login })
    const sa = inserted[0]
    if (!sa) return c.json({ error: 'Не удалось создать суперадмина' }, 500)

    const token = await signSuperadminToken({ sub: sa.id, login: sa.login }, BOOTSTRAP_TOKEN_TTL)
    // needsPasskey: true — фронту явный сигнал вести на регистрацию пасскея.
    return c.json({ token, needsPasskey: true })
  },
)

// ── POST /passkey/register/options (requireSuperadmin) ───────────────────────
// Зеркало клубного register/options: исключаем уже зарегистрированные ключи,
// challenge кладём в Redis под sa:-ключом на 5 минут.
superadminAuthRouter.post('/passkey/register/options', requireSuperadmin, async (c) => {
  const sa = c.get('superadmin')
  const cdb = getControlDb()

  const existing = await cdb
    .select()
    .from(superadminPasskeys)
    .where(eq(superadminPasskeys.superadminId, sa.sub))
  const excludeCredentials = existing.map((pk) => ({
    id: pk.credentialId,
    transports: parseTransports(pk.transports),
  }))

  const options = await generateRegistrationOptions({
    rpName: SA_RP_NAME,
    rpID: SA_RP_ID,
    userID: isoUint8Array.fromUTF8String(sa.sub),
    userName: sa.login,
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  })

  const redis = getRedis()
  try {
    await redis.connect()
    await redis.set(kRegChallenge(sa.sub), options.challenge, 'EX', 300)
  } finally {
    redis.disconnect()
  }

  return c.json(options)
})

// ── POST /passkey/register/verify (requireSuperadmin) ────────────────────────
// Зеркало клубного register/verify: проверяем challenge из Redis, сохраняем
// credential в superadmin_passkeys, удаляем challenge (одноразовый).
superadminAuthRouter.post('/passkey/register/verify', requireSuperadmin, async (c) => {
  const sa = c.get('superadmin')
  const body = await c.req.json()
  const cdb = getControlDb()

  const redis = getRedis()
  let expectedChallenge: string | null = null
  try {
    await redis.connect()
    expectedChallenge = await redis.get(kRegChallenge(sa.sub))
  } finally {
    redis.disconnect()
  }
  if (!expectedChallenge) {
    return c.json({ error: 'Challenge not found or expired' }, 400)
  }

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: SA_EXPECTED_ORIGINS,
      expectedRPID: SA_RP_ID,
    })
  } catch (err: any) {
    return c.json({ error: err?.message ?? 'Verification failed' }, 400)
  }

  const { verified, registrationInfo } = verification
  if (!verified || !registrationInfo) {
    return c.json({ error: 'Verification failed' }, 400)
  }

  const { credential } = registrationInfo
  await cdb.insert(superadminPasskeys).values({
    superadminId: sa.sub,
    credentialId: credential.id,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    // transports храним строкой (схема: text) — сериализуем JSON-массив.
    transports: JSON.stringify((credential.transports as string[]) ?? []),
  })

  // Удаляем challenge (одноразовый).
  const redis2 = getRedis()
  try {
    await redis2.connect()
    await redis2.del(kRegChallenge(sa.sub))
  } finally {
    redis2.disconnect()
  }

  return c.json({ ok: true })
})

// ── POST /login/password { login, password } ─────────────────────────────────
// Шаг 1 входа. Анти-enumeration: при неверном логине/пароле — единый ответ.
//  • Есть пасскеи → НЕ выдаём токен: { needsPasskey:true, challengeId, options }.
//  • Пасскеев нет (сразу после bootstrap) → выдаём короткий токен, чтобы дойти до
//    регистрации первого пасскея.
superadminAuthRouter.post(
  '/login/password',
  zValidator('json', z.object({
    login: z.string().trim().min(1).max(64),
    password: z.string().min(1).max(200),
  })),
  async (c) => {
    const { login, password } = c.req.valid('json')
    const ip = clientIp(c)
    const key = kPwdFail(ip, login)
    const redis = getRedis()
    await redis.connect()
    try {
      const fails = parseInt((await redis.get(key)) ?? '0')
      if (fails >= PWD_MAX_ATTEMPTS) {
        const ttl = await redis.ttl(key)
        return c.json({
          error: `Слишком много попыток. Попробуйте через ${Math.ceil(Math.max(ttl, 0) / 60)} мин.`,
        }, 429)
      }

      const cdb = getControlDb()
      const [sa] = await cdb.select().from(superadmins).where(eq(superadmins.login, login))

      // Анти-enumeration: «нет такого логина» неотличимо от «неверный пароль».
      if (!sa?.passwordHash) {
        await redis.incr(key); await redis.expire(key, PWD_WINDOW_SECONDS)
        return c.json({ error: 'Неверный логин или пароль' }, 401)
      }
      const ok = await verifyPassword(password, sa.passwordHash)
      if (!ok) {
        await redis.incr(key); await redis.expire(key, PWD_WINDOW_SECONDS)
        return c.json({ error: 'Неверный логин или пароль' }, 401)
      }

      // Успех пароля — сбрасываем счётчик неудач.
      await redis.del(key)

      const pks = await cdb
        .select()
        .from(superadminPasskeys)
        .where(eq(superadminPasskeys.superadminId, sa.id))

      // Пасскеев нет (сразу после bootstrap) — выдаём короткий токен на регистрацию.
      if (pks.length === 0) {
        const token = await signSuperadminToken(
          { sub: sa.id, login: sa.login },
          NO_PASSKEY_TOKEN_TTL,
        )
        return c.json({ token, needsPasskey: true })
      }

      // Есть пасскеи — НЕ выдаём токен: требуем второй фактор. Готовим опции
      // аутентификации и сохраняем challenge в Redis (одноразовый, 5 мин).
      const allowCredentials = pks.map((pk) => ({
        id: pk.credentialId,
        transports: parseTransports(pk.transports),
      }))
      const options = await generateAuthenticationOptions({
        rpID: SA_RP_ID,
        allowCredentials,
        userVerification: 'preferred',
      })
      const challengeId = crypto.randomUUID()
      await redis.set(
        kAuthnChallenge(challengeId),
        JSON.stringify({ challenge: options.challenge, superadminId: sa.id }),
        'EX',
        300,
      )
      return c.json({ needsPasskey: true, challengeId, options })
    } finally {
      redis.disconnect()
    }
  },
)

// ── POST /login/passkey/verify { challengeId, response } ─────────────────────
// Шаг 2 входа: проверяем WebAuthn-ответ против сохранённого challenge, обновляем
// counter, выдаём ПОЛНЫЙ суперадмин-токен. challenge одноразовый.
superadminAuthRouter.post(
  '/login/passkey/verify',
  zValidator('json', z.object({ challengeId: z.string(), response: z.any() })),
  async (c) => {
    const { challengeId, response } = c.req.valid('json')

    const redis = getRedis()
    let raw: string | null = null
    try {
      await redis.connect()
      raw = await redis.get(kAuthnChallenge(challengeId))
    } finally {
      redis.disconnect()
    }
    if (!raw) {
      return c.json({ error: 'Challenge not found or expired' }, 400)
    }
    const { challenge: expectedChallenge, superadminId } = JSON.parse(raw) as {
      challenge: string
      superadminId: string
    }

    const cdb = getControlDb()
    // Ищем credential строго среди пасскеев ЭТОГО суперадмина (привязка challenge
    // к superadminId исключает подмену чужим ключом).
    const rows = await cdb
      .select()
      .from(superadminPasskeys)
      .where(eq(superadminPasskeys.superadminId, superadminId))
    const pkRecord = rows.find((pk) => pk.credentialId === response?.id) ?? null
    if (!pkRecord) {
      return c.json({ error: 'Passkey not found' }, 404)
    }

    let verification
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: SA_EXPECTED_ORIGINS,
        expectedRPID: SA_RP_ID,
        credential: {
          id: pkRecord.credentialId,
          publicKey: isoBase64URL.toBuffer(pkRecord.publicKey),
          counter: pkRecord.counter,
          transports: parseTransports(pkRecord.transports),
        },
      })
    } catch (err: any) {
      return c.json({ error: err?.message ?? 'Verification failed' }, 400)
    }

    const { verified, authenticationInfo } = verification
    if (!verified) {
      return c.json({ error: 'Authentication failed' }, 401)
    }

    // Обновляем counter (защита от клонирования/replay).
    await cdb
      .update(superadminPasskeys)
      .set({ counter: authenticationInfo.newCounter })
      .where(eq(superadminPasskeys.id, pkRecord.id))

    // Удаляем challenge (одноразовый) ДО выдачи токена.
    const redis2 = getRedis()
    try {
      await redis2.connect()
      await redis2.del(kAuthnChallenge(challengeId))
    } finally {
      redis2.disconnect()
    }

    const [sa] = await cdb.select().from(superadmins).where(eq(superadmins.id, superadminId))
    if (!sa) {
      return c.json({ error: 'Superadmin not found' }, 404)
    }

    // ПОЛНЫЙ суперадмин-токен (TTL по умолчанию из signSuperadminToken — 12h).
    const token = await signSuperadminToken({ sub: sa.id, login: sa.login })
    return c.json({ token, superadmin: { id: sa.id, login: sa.login } })
  },
)

// transports в control-схеме хранятся как text (JSON-строка массива). Разбираем
// безопасно: пустое/битое значение → []. Возвращаем тип, ожидаемый @simplewebauthn.
function parseTransports(raw: string | null): AuthenticatorTransportFuture[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr as AuthenticatorTransportFuture[]) : []
  } catch {
    return []
  }
}
