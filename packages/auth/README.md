<!-- generated-by: gsd-doc-writer -->
# @titan/auth

Внутренний пакет монорепо Titan HUB. Содержит хелперы аутентификации: JWT-токены, хэширование паролей и PIN-кодов, верификацию Telegram WebApp. Пакет приватный (`"private": true`) и предназначен исключительно для использования внутри монорепо.

Часть монорепо [Titan HUB](../../README.md).

---

## Установка

Пакет подключается как workspace-зависимость в `package.json` других пакетов и приложений монорепо:

```json
"dependencies": {
  "@titan/auth": "workspace:*"
}
```

---

## Экспортируемые функции

### JWT — `src/jwt.ts`

Реализован на библиотеке [`jose`](https://github.com/panva/jose), алгоритм `HS256`.

#### `signToken(payload, expiresIn?): Promise<string>`

Создаёт подписанный JWT.

| Параметр | Тип | Описание |
|---|---|---|
| `payload` | `Omit<JwtPayload, 'iat' \| 'exp'>` | Поля токена: `sub` (user id), `role`, `nickname` |
| `expiresIn` | `string` (необяз.) | Срок жизни токена, напр. `"7d"`. Если не передан — берётся из `JWT_EXPIRES_IN` или `"7d"` |

Требует переменной окружения `JWT_SECRET` длиной не менее 32 символов — иначе бросает ошибку.

```ts
const token = await signToken({ sub: '42', role: 'staff', nickname: 'Иван' })
```

#### `verifyToken(token): Promise<JwtPayload>`

Верифицирует и декодирует JWT. Возвращает `JwtPayload` (`sub`, `role`, `nickname`, `iat`, `exp`) или бросает ошибку, если подпись недействительна или токен просрочен.

```ts
const payload = await verifyToken(bearerToken)
console.log(payload.role) // 'owner' | 'staff' | 'tablet' | 'client'
```

#### Тип `JwtPayload`

```ts
interface JwtPayload {
  sub: string       // id пользователя (profiles.id)
  role: string      // 'owner' | 'staff' | 'tablet' | 'client'
  nickname: string  // отображаемое имя
  iat?: number      // issued at (unix timestamp)
  exp?: number      // expiration (unix timestamp)
}
```

---

### Пароли — `src/password.ts`

Реализован на [`bcryptjs`](https://github.com/dcodeIO/bcrypt.js), cost factor `10`.

#### `hashPassword(password): Promise<string>`

Хэширует пароль bcrypt. Возвращает хэш для сохранения в БД.

```ts
const hash = await hashPassword('secretPassword')
// → '$2b$10$...'
```

#### `verifyPassword(password, hash): Promise<boolean>`

Сравнивает открытый пароль с bcrypt-хэшем.

```ts
const ok = await verifyPassword(inputPassword, storedHash)
```

#### `isPlaintext(hash): boolean`

Возвращает `true`, если строка **не** является bcrypt-хэшем (не начинается с `$2`). Используется для миграции legacy-данных: если пароль хранится в открытом виде, его нужно сначала захэшировать перед сравнением.

```ts
if (isPlaintext(storedValue)) {
  // прямое сравнение + rehash
} else {
  await verifyPassword(input, storedValue)
}
```

---

### PIN-коды — `src/pin.ts`

Реализован на [`bcryptjs`](https://github.com/dcodeIO/bcrypt.js), cost factor `10`.

#### `hashPin(pin): Promise<string>`

Хэширует числовой PIN-код. Семантически отделён от паролей, поскольку PIN используется для быстрого входа сотрудников через экран ввода.

```ts
const hash = await hashPin('1234')
```

#### `verifyPin(pin, hash): Promise<boolean>`

Сравнивает введённый PIN с bcrypt-хэшем из БД.

```ts
const ok = await verifyPin(inputPin, profile.pinHash)
```

---

### Telegram WebApp — `src/telegram.ts`

Проверка подлинности данных Telegram Mini App по официальному алгоритму HMAC-SHA256.

#### `verifyTelegramInitData(initData, botToken, maxAgeSeconds?): boolean`

Верифицирует строку `initData`, полученную от Telegram WebApp. Проверяет:
1. HMAC-SHA256 подпись (`hash`) с секретным ключом, производным от `botToken` через `"WebAppData"`.
2. Актуальность данных: `auth_date` не должна быть старше `maxAgeSeconds` (по умолчанию `86400` — 24 часа, анти-replay защита).

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| `initData` | `string` | — | URL-encoded строка из `Telegram.WebApp.initData` |
| `botToken` | `string` | — | Токен бота, которому принадлежит WebApp |
| `maxAgeSeconds` | `number` | `86400` | Максимальный возраст `initData` |

Возвращает `false` при любом нарушении (отсутствие `hash`, неверная подпись, устаревший `auth_date`).

```ts
const valid = verifyTelegramInitData(initData, process.env.BOT_TOKEN!)
if (!valid) throw new Error('Unauthorized')
```

#### `parseTelegramInitData(initData): Record<string, string>`

Разбирает URL-encoded строку `initData` в словарь ключ → значение. Удобна для извлечения полей (`user`, `auth_date` и др.) после успешной верификации.

```ts
const data = parseTelegramInitData(initData)
const user = JSON.parse(data.user) // { id, first_name, username, ... }
```

---

## Переменные окружения

| Переменная | Обязательная | Описание |
|---|---|---|
| `JWT_SECRET` | Да | Секрет для подписи JWT, минимум 32 символа |
| `JWT_EXPIRES_IN` | Нет | Срок жизни токена по умолчанию (напр. `"7d"`). По умолчанию `"7d"` |

---

## Где используется

| Потребитель | Файл | Функции |
|---|---|---|
| `apps/api` — middleware аутентификации | `src/middleware/auth.ts` | `verifyToken`, `JwtPayload` |
| `apps/api` — rate limiting | `src/middleware/rateLimit.ts` | `verifyToken` |
| `apps/api` — роутер аутентификации | `src/modules/auth/auth.router.ts` | `signToken`, `verifyPin`, `verifyPassword`, `hashPassword`, `hashPin`, `isPlaintext`, `verifyTelegramInitData` |
| `apps/api` — управление сотрудниками | `src/modules/staff/staff.router.ts` | `hashPassword`, `hashPin` |
| `apps/api` — управление клиентами | `src/modules/clients/clients.router.ts` | `hashPassword` |
| `apps/bot-admin` — Telegram-бот персонала | `src/index.ts` | `signToken` |

### Роутер `auth.router.ts` (`apps/api`)

Основной потребитель пакета. Реализует все способы входа в Titan HUB:

- **PIN-вход** (`POST /auth/login/pin`) — `verifyPin` + `isPlaintext` для legacy-данных, после успешной проверки `signToken`.
- **Вход по паролю** — `verifyPassword` + `signToken`.
- **Смена/установка пароля** (`POST /auth/me` и аналоги) — `hashPassword`.
- **Установка PIN** (`POST /auth/pin/set`) — `hashPin`.
- **Вход через Telegram** (`POST /auth/login/telegram`) — `verifyTelegramInitData` + `signToken`.

### Middleware `auth.ts` (`apps/api`)

`requireAuth` и `requireRole` — декодируют JWT из заголовка `Authorization: Bearer <token>` через `verifyToken` и кладут `JwtPayload` в контекст Hono-запроса.

### Бот `apps/bot-admin`

`signToken` используется для генерации служебного JWT при инициализации бота (запросы к API от имени системного пользователя).

---

## Сборка

```bash
# Однократная сборка
pnpm --filter @titan/auth build

# Режим watch (разработка)
pnpm --filter @titan/auth dev
```

Скомпилированные файлы попадают в `dist/`. TypeScript-типы экспортируются из `dist/index.d.ts`.
