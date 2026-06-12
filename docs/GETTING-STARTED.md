<!-- generated-by: gsd-doc-writer -->
# Начало работы с Titan HUB

Пошаговое руководство: от клонирования репозитория до работающего локального окружения.

---

## Содержание

1. [Предварительные требования](#1-предварительные-требования)
2. [Клонирование репозитория](#2-клонирование-репозитория)
3. [Установка зависимостей](#3-установка-зависимостей)
4. [Настройка переменных окружения](#4-настройка-переменных-окружения)
5. [Поднятие инфраструктурных зависимостей](#5-поднятие-инфраструктурных-зависимостей)
6. [Применение миграций базы данных](#6-применение-миграций-базы-данных)
7. [Создание первого владельца (owner)](#7-создание-первого-владельца-owner)
8. [Запуск в режиме разработки](#8-запуск-в-режиме-разработки)
9. [Первый вход в систему](#9-первый-вход-в-систему)
10. [Проверка сборки и типов](#10-проверка-сборки-и-типов)
11. [Типовые проблемы при первом запуске](#11-типовые-проблемы-при-первом-запуске)
12. [Следующие шаги](#12-следующие-шаги)

---

## 1. Предварительные требования

Перед началом убедитесь, что на вашей машине установлено всё необходимое.

### Рантаймы

| Инструмент | Минимальная версия | Зачем |
|---|---|---|
| **Node.js** | `>= 22` | Требование `package.json` (`engines.node`). Используют все пакеты монорепо. |
| **pnpm** | `>= 11` (рекомендуется `11.1.2`) | Менеджер пакетов монорепо (`packageManager: pnpm@11.1.2` в `package.json`). npm/yarn **не поддерживаются**. |

Установка pnpm:

```bash
npm install -g pnpm@11.1.2
```

Установка нужной версии Node.js через nvm (если используете):

```bash
nvm install 22
nvm use 22
```

### Инфраструктура

| Сервис | Версия (docker image) | Зачем |
|---|---|---|
| **Docker** + **Docker Compose** | актуальный стабильный релиз | Запуск Postgres, Redis и MinIO локально без ручной установки |
| **PostgreSQL** | `16-alpine` (`docker-compose.yml`) | Основная БД |
| **Redis** | `7-alpine` | Rate-limiting, WebAuthn challenge-кэш, SSE PubSub |
| **MinIO** | `RELEASE.2023-06-29T05-12-28Z` | S3-совместимое хранилище для загрузки фото и файлов |

Проверить наличие Docker:

```bash
docker --version
docker compose version
```

---

## 2. Клонирование репозитория

```bash
git clone https://github.com/superkai-sdk1/Titan-HUB.git titan-hub
cd titan-hub
```

Структура монорепо после клонирования:

```
titan-hub/
├── apps/
│   ├── api/          # Hono-бэкенд (Node.js)
│   ├── web/          # Next.js PWA-фронтенд
│   ├── wallet/       # Telegram WebApp кошелёк
│   ├── bot-admin/    # Telegram-бот для персонала
│   └── bot-wallet/   # Telegram-бот для клиентов
├── packages/
│   ├── auth/         # JWT, bcrypt, PIN-хэши
│   ├── database/     # Drizzle ORM: схема, клиент
│   ├── types/        # Общие TypeScript-типы
│   ├── ui/           # UI-примитивы
│   └── config/       # tsconfig / eslint конфигурации
├── docker-compose.yml
├── package.json
└── pnpm-workspace.yaml
```

---

## 3. Установка зависимостей

Из корня монорепо:

```bash
pnpm install
```

pnpm установит зависимости для всех воркспейсов (`apps/*`, `packages/*`) за один прогон, используя `pnpm-workspace.yaml`.

---

## 4. Настройка переменных окружения

Скопируйте шаблон:

```bash
cp .env.example .env
```

Откройте `.env` в редакторе и задайте значения. Ниже — **минимально необходимые переменные** для локального запуска:

### Обязательные для старта API

| Переменная | Пример значения | Описание |
|---|---|---|
| `POSTGRES_PASSWORD` | `titan_local_secret` | Пароль пользователя `titan` в PostgreSQL. Используется в `DATABASE_URL`, который Docker Compose собирает автоматически. |
| `JWT_SECRET` | `supersecretkeyatleast32charslong!` | Ключ подписи JWT. **Минимум 32 символа** — API не запустится при нарушении. |
| `MINIO_ACCESS_KEY` | `minioadmin` | Имя пользователя MinIO (аналог AWS Access Key ID). |
| `MINIO_SECRET_KEY` | `minioadmin` | Пароль MinIO (аналог AWS Secret Access Key). Минимум 8 символов. |

### Опциональные (с умолчаниями)

Эти переменные имеют рабочие умолчания для локальной разработки и не требуют правки сразу:

| Переменная | Умолчание | Описание |
|---|---|---|
| `DATABASE_URL` | Собирается compose-файлом | PostgreSQL DSN. В docker-compose формируется из `POSTGRES_PASSWORD` автоматически. При запуске API вне Docker: `postgresql://titan:<POSTGRES_PASSWORD>@localhost:5432/titan_hub` |
| `REDIS_URL` | `redis://redis:6379` | URL Redis. Для локального запуска API вне Docker: `redis://localhost:6379` |
| `FRONTEND_URL` | `http://localhost:3000` | CORS-origin для API. Для dev подходит значение по умолчанию. |
| `MINIO_ENDPOINT` | `minio` (в Docker) | Хост MinIO. При запуске API вне Docker: `localhost` |
| `MINIO_PORT` | `9000` | Порт MinIO API |
| `MINIO_PUBLIC_URL` | — | Публичный URL для ссылок на файлы. Для локальной разработки: `http://localhost:9000` |
| `API_PORT` | `3001` | Порт Hono-сервера |
| `WEBAUTHN_RP_ID` | `localhost` | Домен Relying Party для Passkey. В dev менять не нужно. |
| `WEBAUTHN_ORIGIN` | `http://localhost:3000` | Origin для верификации Passkey. В dev менять не нужно. |
| `NEXT_PUBLIC_API_URL` | `/api` | Префикс API для фронтенда |

### Опциональные функции (можно пропустить при первом запуске)

- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — Web Push-уведомления. Без них push отключается, SSE-уведомления работают.
- `ADMIN_BOT_TOKEN`, `WALLET_BOT_TOKEN` — Telegram-боты. Без них боты не запускаются, остальное работает.
- `POLZA_API_KEY`, `POLZA_BASE_URL`, `POLZA_MODEL` — TITAN AI (LLM-ассистент). Без них экран `/ai` недоступен.
- `PLATEGA_MERCHANT_ID`, `PLATEGA_SECRET` — интеграция с платёжным шлюзом Platega.

Полное описание всех переменных — в [`docs/CONFIGURATION.md`](CONFIGURATION.md).

---

## 5. Поднятие инфраструктурных зависимостей

### Вариант А — только инфраструктура через Docker Compose (рекомендуется для dev)

Запустите только Postgres, Redis и MinIO, а API и фронтенд запускайте локально через pnpm:

```bash
docker compose up -d postgres redis minio
```

Убедитесь, что сервисы здоровы:

```bash
docker compose ps
```

Все три должны показывать статус `healthy`.

### Вариант Б — полный стек через Docker Compose

Если нужно поднять весь проект включая API, web и ботов (требует предварительной сборки Docker-образов):

```bash
docker compose up -d
```

В этом варианте миграции применяются **автоматически** при старте контейнера `titan-api` (шаг 6 можно пропустить). Логи: `docker compose logs -f api`.

---

## 6. Применение миграций базы данных

> Этот шаг нужен только при **локальном запуске API вне Docker** (вариант А из шага 5). При запуске через `docker compose up` миграции применяются автоматически на старте контейнера `titan-api`.

Миграции применяет раннер `apps/api/src/migrations/runner.ts` при каждом старте API. Он:
1. Создаёт таблицу `_migrations` (если её нет).
2. Читает все `.sql` файлы из `apps/api/src/migrations/sql/` в алфавитном порядке.
3. Применяет только те, которых ещё нет в `_migrations` (идемпотентно).
4. Каждую миграцию оборачивает в транзакцию — откат при ошибке.

Текущий набор миграций: `001_event_payment_type.sql` … `046_drafts.sql`.

При запуске `pnpm --filter @titan/api dev` миграции применяются автоматически до старта HTTP-сервера. Дополнительных команд не нужно.

Если нужно применить миграции отдельно (например, для проверки схемы), запустите API и сразу остановите его после строки `[migrations] Done.` в консоли.

---

## 7. Создание первого владельца (owner)

В свежей базе нет ни одного пользователя. Эндпоинт `POST /api/staff` (создание сотрудников) требует авторизации с ролью `owner` — поэтому первого владельца нужно создать напрямую через SQL.

### Подключитесь к PostgreSQL

При запуске через Docker Compose:

```bash
docker compose exec postgres psql -U titan -d titan_hub
```

При локальном PostgreSQL:

```bash
psql -U titan -d titan_hub
```

### Вставьте запись владельца

API автоматически хеширует пароль при первом входе по паролю (функция `isPlaintext` в `packages/auth/src/password.ts` проверяет, начинается ли хэш с `$2`). Поэтому при ручном INSERT можно указать пароль в открытом виде — он будет заменён bcrypt-хэшем при первом успешном входе:

```sql
INSERT INTO profiles (nickname, password_hash, role)
VALUES ('owner', 'ваш_пароль', 'owner');
```

Замените `'owner'` на нужный ник и `'ваш_пароль'` на выбранный пароль (минимум 4 символа — требование `CreateStaffSchema` в `apps/api/src/modules/staff/staff.router.ts`).

После входа по паролю система предложит задать 4-значный PIN для быстрого входа (`needsPinSetup: true`), затем — зарегистрировать Passkey.

### Проверьте создание

```sql
SELECT id, nickname, role, created_at FROM profiles WHERE role = 'owner';
\q
```

---

## 8. Запуск в режиме разработки

### Запуск всего монорепо (Turborepo)

```bash
pnpm dev
```

Команда запускает `turbo run dev`, который одновременно стартует dev-серверы всех пакетов.

### Запуск отдельных приложений

Рекомендуется для ежедневной разработки — меньше шума в консоли:

**API** (`apps/api` — Hono на порту `3001`):

```bash
pnpm --filter @titan/api dev
```

Запускает `tsx watch src/index.ts`. При старте:
1. Проверяет обязательные env-переменные (`JWT_SECRET`, `DATABASE_URL`).
2. Применяет миграции (`[migrations] Done.`).
3. Поднимает HTTP-сервер на `http://localhost:3001`.

**Web-фронтенд** (`apps/web` — Next.js на порту `3000`):

```bash
pnpm --filter @titan/web dev
```

Запускает `next dev --turbopack`. Фронтенд доступен на `http://localhost:3000`.

**Wallet** (`apps/wallet` — Next.js на порту `3002`):

```bash
pnpm --filter @titan/wallet dev
```

**Боты** (запускаются аналогично):

```bash
pnpm --filter @titan/bot-admin dev
pnpm --filter @titan/bot-wallet dev
```

### Порты по умолчанию в dev

| Сервис | Порт |
|---|---|
| Web (Next.js) | `3000` |
| API (Hono) | `3001` |
| Wallet (Next.js) | `3002` |
| PostgreSQL | `5432` |
| Redis | `6379` |
| MinIO API | `9000` |
| MinIO Console | `9001` |

---

## 9. Первый вход в систему

Откройте `http://localhost:3000`. Вы попадёте на экран входа (`/login`).

### Экраны входа

Страница входа (`apps/web/src/app/login/page.tsx`) показывает три способа входа:

1. **Passkey** — экран по умолчанию (если браузер поддерживает WebAuthn). При первом запуске passkey ещё не зарегистрирован — нажмите «Войти по PIN» или «Войти по паролю».
2. **PIN** — 4-значный PIN. Недоступен до первого входа по паролю (пока `needsPinSetup: true`).
3. **Пароль** — ник + пароль. Используйте данные из шага 7.

### Последовательность первого входа

1. Выберите «Войти по паролю», введите ник и пароль из шага 7.
2. API вернёт `needsPinSetup: true` — система предложит задать 4-значный PIN.
3. Введите PIN (4 цифры) — API вызовет `POST /api/auth/pin/set`.
4. Если браузер поддерживает WebAuthn, система предложит зарегистрировать Passkey — для быстрого входа по биометрии/Face ID.
5. После настройки вы попадёте на `/pos` (POS-экран).

### Роли в системе

| Роль | Доступ |
|---|---|
| `owner` | Полный доступ: управление персоналом (`/manage/staff`), настройки, финансы, все модули |
| `staff` | Доступ к модулям, разрешённым владельцем (поля `permissions` в `profiles`) |
| `tablet` | Узкий токен для киоска самообслуживания (`/tablet`); создаётся через привязку планшета |
| `client` | Клиент заведения; входит через Telegram WebApp `/wallet` |

### Создание сотрудников

После входа под `owner` перейдите в **Управление → Персонал и смены → Пользователи** (`/manage/staff`). Нажмите «Добавить сотрудника» — система вызовет `POST /api/staff`.

---

## 10. Проверка сборки и типов

### Проверка TypeScript

Запускает `tsc --noEmit` для всех пакетов монорепо:

```bash
pnpm type-check
```

Или для конкретного пакета:

```bash
pnpm --filter @titan/api type-check
pnpm --filter @titan/web type-check
```

### Полная сборка

```bash
pnpm build
```

Собирает все пакеты через Turborepo (учитывает граф зависимостей `^build`). Артефакты:
- `apps/api/dist/` — скомпилированный JS + SQL-миграции
- `apps/web/.next/` — Next.js standalone-сборка
- `packages/*/dist/` — скомпилированные shared-пакеты

### Форматирование кода

```bash
pnpm format
```

Запускает Prettier для всех `*.ts`, `*.tsx`, `*.js`, `*.json`, `*.md`, `*.css` файлов.

---

## 11. Типовые проблемы при первом запуске

### API не запускается: `JWT_SECRET must be set and at least 32 characters long`

API проверяет длину `JWT_SECRET` при старте (`apps/api/src/index.ts`, функция `assertEnv`). Убедитесь, что в `.env` значение содержит не менее 32 символов.

### API не запускается: `DATABASE_URL must be set`

При запуске API **вне Docker** переменная `DATABASE_URL` не собирается автоматически. Добавьте в `.env`:

```
DATABASE_URL=postgresql://titan:ваш_пароль@localhost:5432/titan_hub
```

### Ошибка подключения к Redis при старте API

По умолчанию `REDIS_URL=redis://redis:6379` указывает на Docker-хост. При запуске API вне Docker задайте:

```
REDIS_URL=redis://localhost:6379
```

### Миграции падают: `relation "_migrations" already exists`

Этого не должно происходить — миграция создаёт таблицу через `CREATE TABLE IF NOT EXISTS`. Если таблица повреждена, подключитесь через psql и выполните `DROP TABLE _migrations;`, затем перезапустите API.

### Фронтенд показывает «API недоступен» / пустой экран

Убедитесь, что API запущен и отвечает на `http://localhost:3001/health` (должен вернуть `{"ok":true}`). Переменная `NEXT_PUBLIC_API_URL` на фронтенде по умолчанию `/api` — при локальном запуске без nginx API недоступен через этот путь. Добавьте в `.env` для фронтенда:

```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

### Нельзя войти: в базе нет пользователей

В базе нет автоматического seed'а. Создайте первого владельца вручную через SQL — см. [шаг 7](#7-создание-первого-владельца-owner).

### `pnpm: command not found`

Установите pnpm:

```bash
npm install -g pnpm@11.1.2
```

---

## 12. Следующие шаги

- **Конфигурация** — полный справочник всех переменных окружения, рантайм-настроек и Service Worker: [`docs/CONFIGURATION.md`](CONFIGURATION.md).
- **Архитектура** — описание компонентов, потоков данных, ключевых абстракций: [`docs/ARCHITECTURE.md`](ARCHITECTURE.md).
- **Работа с базой данных** — просмотр схемы через Drizzle Studio:

  ```bash
  pnpm db:studio
  ```
