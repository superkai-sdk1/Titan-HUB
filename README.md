<div align="center">

# ⚡ TITAN HUB

**Полноценная POS-система и платформа управления анти-кафе**

PWA-приложение: касса, чеки, лояльность, аналитика, склад, смены, зарплаты, Telegram-боты и AI-ассистент — в одном монорепо.

[![Next.js](https://img.shields.io/badge/Next.js_15-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Hono](https://img.shields.io/badge/Hono-E36002?style=for-the-badge&logo=hono&logoColor=white)](https://hono.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Drizzle](https://img.shields.io/badge/Drizzle_ORM-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black)](https://orm.drizzle.team)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com)
[![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![Turborepo](https://img.shields.io/badge/Turborepo-EF4444?style=for-the-badge&logo=turborepo&logoColor=white)](https://turbo.build)
[![pnpm](https://img.shields.io/badge/pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white)](https://pnpm.io)

🌐 **Продакшн:** [titanpos.ru](https://titanpos.ru)

</div>

---

## 📋 Содержание

- [О проекте](#-о-проекте)
- [Возможности](#-возможности)
- [Архитектура](#-архитектура)
- [Структура монорепо](#-структура-монорепо)
- [Модули API](#-модули-api)
- [Дизайн-система](#-дизайн-система)
- [PWA и offline](#-pwa-и-offline)
- [Безопасность](#-безопасность)
- [Быстрый старт](#-быстрый-старт)
- [База данных и миграции](#-база-данных-и-миграции)
- [Деплой](#-деплой)
- [Бэкапы и восстановление](#-бэкапы-и-восстановление)
- [Скрипты](#-скрипты)

---

## 🎯 О проекте

**Titan HUB** — система автоматизации анти-кафе / игрового пространства, построенная как установка-на-домашний-экран PWA. Покрывает весь операционный цикл заведения:

- 🧾 кассир открывает чеки, пробивает тарифы по времени и бар;
- 👥 клиенты копят бонусы, растут по тирам лояльности и привязывают Telegram;
- 📱 планшеты в зонах работают как киоски самообслуживания;
- 📊 владелец видит выручку, зарплаты, склад и аналитику в реальном времени;
- 🤖 AI-ассистент отвечает на вопросы по данным заведения.

Интерфейс — тёмная premium-тема (glassmorphism, фирменный градиент violet → cyan), оптимизирован под iPhone/планшеты, зум отключён, тач-таргеты ≥ 44px.

---

## ✨ Возможности

| Раздел | Описание |
|---|---|
| 💰 **Касса (POS)** | Открытие/закрытие чеков, тарифы по времени, бар, гостевые чеки, QR-оплата, смешанная оплата (наличные/карта/перевод/депозит) |
| 🧾 **Экран чека** | Позиции, скидки (ручные/авто/промо), комплименты персонала, отложенные заказы, возвраты |
| 👥 **Клиенты и лояльность** | Профили, тиры (новичок → резидент), бонусные лоты с TTL, депозиты, долги, привязка Telegram по QR |
| 📈 **Аналитика** | Дашборд: выручка, прибыль, тарифы/бар, игроки, персонал, мероприятия, экспорт CSV, период день/неделя/месяц (бизнес-день) |
| 📦 **Склад и поставки** | Остатки, движение, поставки, ревизия, себестоимость |
| 🍔 **Меню** | Категории, позиции, модификаторы, drag-and-drop сортировка |
| 🧑‍🍳 **Персонал и смены** | Роли (владелец/персонал/планшет), смены, зарплаты (ставка/процент), выплаты |
| 💸 **Финансы** | Расходы по категориям, кассовые операции (инкассация/внесение), сертификаты, скидки, ценообразование |
| 🎉 **Мероприятия** | Игровые вечера, события, статистика посещаемости |
| 🤖 **AI-ассистент** | Запросы к данным на естественном языке (безопасный read-only SQL) |
| 🔔 **Уведомления** | Web Push + SSE в реальном времени, группировка по объекту |
| 💳 **Кошелёк** | Отдельное приложение пополнения баланса (Platega), Telegram-бот кошелька |
| 📲 **Планшет-киоск** | Зональный режим для самообслуживания с IDOR-защитой по зоне |

---

## 🏗 Архитектура

```
                    ┌──────────────────────────────────────────┐
                    │                  NGINX                   │
                    │   TLS / gzip / static cache / proxy      │
                    └──────┬──────────────┬──────────┬─────────┘
                           │              │          │
              ┌────────────▼───┐  ┌───────▼────┐  ┌──▼─────────┐
              │  apps/web      │  │ apps/api   │  │ apps/wallet│
              │  Next.js 15    │  │ Hono       │  │ Next.js    │
              │  PWA + SW      │  │ REST + SSE │  │ Platega    │
              └────────────────┘  └─────┬──────┘  └────────────┘
                                        │
               ┌────────────┬───────────┼────────────┬───────────┐
               │            │           │            │           │
        ┌──────▼─────┐ ┌────▼────┐ ┌────▼─────┐ ┌────▼─────┐ ┌──▼────────┐
        │ PostgreSQL │ │  Redis  │ │  MinIO   │ │bot-admin │ │bot-wallet │
        │  Drizzle   │ │ pub/sub │ │  файлы   │ │  grammY  │ │  grammY   │
        │  37 мигр.  │ │ ratelim │ │  фото    │ │          │ │           │
        └────────────┘ └─────────┘ └──────────┘ └──────────┘ └───────────┘
```

**Стек:**

| Слой | Технологии |
|---|---|
| 🖥 Фронтенд | Next.js 15 (App Router), React 19, TanStack Query v5, Zustand, framer-motion, Tailwind CSS 4 + дизайн-токены |
| ⚙️ Бэкенд | Hono (REST + SSE), Zod-валидация, Drizzle ORM, идемпотентность, транзакции с `FOR UPDATE` |
| 🗄 Данные | PostgreSQL 16, Redis (pub/sub, rate limit, token blacklist), MinIO (S3-совместимое хранилище) |
| 🤖 Боты | grammY (admin-бот и wallet-бот) |
| 🚀 Инфраструктура | Docker Compose, nginx, Ubuntu VPS, деплой одним скриптом, ежедневные бэкапы + Google Drive |

---

## 📁 Структура монорепо

```
titan-hub/
├── apps/
│   ├── web/          # 🖥 Основное PWA (касса, управление, аналитика, планшет)
│   ├── api/          # ⚙️ REST API на Hono (24 модуля)
│   ├── wallet/       # 💳 Приложение пополнения баланса
│   ├── bot-admin/    # 🤖 Telegram-бот администратора
│   └── bot-wallet/   # 🤖 Telegram-бот кошелька
├── packages/
│   ├── database/     # 🗄 Drizzle-схема, клиент, SQL-миграции
│   ├── types/        # 📐 Общие типы и Zod-схемы (фронт + бэк)
│   ├── auth/         # 🔐 JWT, PIN, пароли, WebAuthn (passkeys), Telegram-auth
│   ├── ui/           # 🧩 Базовые UI-компоненты
│   └── config/       # ⚙️ Общие конфиги ESLint / TypeScript
├── nginx/            # 🌐 Конфиг reverse-proxy (TLS, gzip, кэш)
├── scripts/          # 🛠 deploy.sh, backup-db.sh, renew-ssl.sh, setup-vps.sh
├── docker-compose.yml
└── turbo.json        # Turborepo-пайплайны
```

---

## 🔌 Модули API

`apps/api/src/modules/` — 24 модуля, каждый со своим роутером:

| Модуль | Назначение | Модуль | Назначение |
|---|---|---|---|
| `auth` | Вход (PIN/пароль/passkey), роли, сессии | `pos` | Чеки, позиции, оплата, SSE-события |
| `clients` | Клиенты, тиры, балансы, бонусы | `customers` | Заказчики мероприятий |
| `menu` | Категории, позиции, модификаторы | `inventory` | Склад, движение остатков |
| `supplies` | Поставки | `expenses` | Расходы (с позициями) |
| `salary` | Зарплаты и выплаты | `shifts` | Смены персонала |
| `staff` | Профили персонала | `spaces` | Пространства/зоны |
| `discounts` | Скидки (ручные/авто) | `certificates` | Подарочные сертификаты |
| `cashops` | Кассовые операции | `refunds` | Возвраты (с откатом бонусов) |
| `events` | Мероприятия, игровые вечера | `analytics` | Дашборд-агрегаты |
| `pricing` | Тарифы по времени | `notifications` | Web Push + SSE-стрим |
| `ai` | AI-запросы к данным (read-only) | `upload` | Загрузка файлов (MinIO) |
| `platega` | Платёжный шлюз | `system` | Здоровье, бэкапы, версия |

**Паттерны бэкенда:**
- 🔒 каждый эндпоинт защищён `requireRole(...)`;
- ✅ вход валидируется Zod-схемами из `@titan/types`;
- 💰 денежные операции — в `db.transaction()` с `SELECT ... FOR UPDATE`;
- 🔁 критичные мутации идемпотентны (`idempotencyKey` + `onConflictDoNothing`);
- 📡 события чеков и уведомления — через Redis pub/sub → SSE.

---

## 🎨 Дизайн-система

Тема **«Stitch v2.0»** — тёмный glassmorphism с premium-акцентами (обновление 2026).

**Токены** (`apps/web/src/app/globals.css`):
- 🎨 цвета: `--primary-violet #8B5CF6`, `--secondary #4cd7f6`, статусы success/danger/warning/info;
- 🔲 поверхности: `.glass-l1` / `.glass-l2` / `.glass-3` (blur + объёмные тени + световой кант);
- 📐 радиусы `--r-*`, тени `--sh-*`, кривые анимации `--c-spring/expo/smooth/snappy`;
- 🔤 шрифты: **Inter** (UI) + **JetBrains Mono** (цифры, табличные значения).

**Премиум-примитивы** (`apps/web/src/components/manage/DesignSystem.tsx` и `components/`):
- `Button` / `IconButton` / `SaveButton` — градиент violet→cyan, внутренний световой кант, пружинное нажатие (spring press-scale);
- `Toggle` — градиентный трек со свечением и объёмным ползунком;
- `Sheet` — bottom-sheet на мобильном (жест 1:1 с пальцем) / модалка на десктопе;
- `ConfirmDialog` — иконка-чип по типу действия, danger-вариант;
- `Toast` — иконка-чип, акцент-полоса, прогресс-бар авто-скрытия;
- `StateView` — премиум-состояния загрузки/пусто/ошибка с пульсирующим свечением;
- `PageHeader` — sticky-шапка с градиентным заголовком и линией-подсветкой.

**Доступность:** контраст ≥ 4.5:1, тач-таргеты ≥ 44px, `:focus-visible`-кольцо, `prefers-reduced-motion`, aria-атрибуты на интерактивных элементах.

> ⚠️ **Важно (iOS WebKit):** плавающая нижняя навигация использует `backdrop-filter`. Не изменяйте `backdrop-filter`/blur у glass-классов, `BottomNav`, `PullToRefreshContainer` и высоту контейнера дашборда — это вызывает баг композитинга («тёмный остров» под панелью) в iOS PWA. Безопасные приёмы: цвет, рамки, box-shadow, градиентный текст, transform.

---

## 📲 PWA и offline

Service Worker (`apps/web/public/sw.js`, версионирование `CACHE_VERSION`):

| Ресурс | Стратегия |
|---|---|
| `/_next/static/*` | 💾 cache-first (неизменяемые хэши сборки) |
| HTML / JSON / медиа | 🌐 network-first (таймаут 8с) → кэш-фоллбек |
| `/api/*` | 🚫 network-only — данные (балансы, чеки) не оседают в кэше киоска |
| SSE / WebSocket | ⏭ не перехватываются |

- 🔔 **Web Push** с группировкой уведомлений по объекту (`tag` + `renotify`);
- ⬆️ при каждом деплое фронта **обязательно поднимается `CACHE_VERSION`** (`skipWaiting` + `clients.claim`);
- 📴 offline-фоллбек страница.

---

## 🔐 Безопасность

- **JWT (HMAC-256)**, секрет ≥ 32 символов, blacklist отозванных токенов в Redis;
- **Роли:** `owner` / `staff` / `tablet` / `client` — проверка на каждом эндпоинте;
- **Планшеты** привязаны к зоне (`linkedSpaceId`) — IDOR-защита на каждую операцию;
- **PIN-вход:** rate limit 5 попыток / 15 мин на IP + глобальный потолок неудач;
- **Rate limiting:** 120 rpm (аноним) / 600 rpm (авторизован), Redis sliding window;
- **SSE-тикеты:** одноразовые 60-секундные тикеты вместо JWT в URL;
- **SQL:** только параметризованные запросы через Drizzle; AI-модуль блокирует DML/DDL и чувствительные колонки;
- **Секреты в логах** маскируются (`redactUrlPath`), клиент получает generic-ошибки;
- **WebAuthn (passkeys)** для входа владельца/персонала.

---

## 🚀 Быстрый старт

### Требования

- Node.js ≥ 20, pnpm ≥ 9
- Docker + Docker Compose (для Postgres/Redis/MinIO)

### Установка

```bash
# 1. Клонировать и установить зависимости
git clone https://github.com/superkai-sdk1/Titan-HUB.git
cd Titan-HUB
pnpm install

# 2. Настроить окружение
cp .env.example .env
# → заполнить DATABASE_URL, REDIS_URL, JWT_SECRET, токены ботов и т.д.

# 3. Поднять инфраструктуру (БД, Redis, MinIO)
docker compose up -d postgres redis minio

# 4. Применить миграции
pnpm db:migrate

# 5. Запустить всё в dev-режиме
pnpm dev
```

| Сервис | URL |
|---|---|
| 🖥 Web (PWA) | http://localhost:3000 |
| ⚙️ API | http://localhost:3001 |
| 💳 Wallet | http://localhost:3002 |

---

## 🗄 База данных и миграции

- Схема: `packages/database/src/schema/` (разбита по доменам: checks, menu, events, profiles, finance…);
- Миграции: версионированные SQL-файлы `apps/api/src/migrations/sql/NNN_name.sql`;
- Применяются **автоматически при старте API** (транзакционно, журнал в таблице `_migrations`);
- nginx стартует только после healthy API → нет окна 502 во время миграций.

```bash
pnpm db:generate   # сгенерировать миграцию из изменений схемы
pnpm db:migrate    # применить миграции
pnpm db:studio     # Drizzle Studio (GUI)
```

---

## 🚢 Деплой

Продакшн — один VPS (Ubuntu 24.04) с Docker Compose за nginx (TLS).

```bash
# На сервере:
cd /opt/titan-hub && bash scripts/deploy.sh
```

`deploy.sh` делает: `git fetch && reset --hard origin/main` → `pnpm install` → **бэкап БД** → `docker compose build && up -d` → reload nginx.

**Чек-лист деплоя фронта:**
1. ✅ `pnpm --filter @titan/web type-check`
2. ⬆️ поднять `CACHE_VERSION` в `apps/web/public/sw.js`
3. 📦 коммит → пуш в `main` → `deploy.sh` на сервере
4. 🩺 проверить `https://titanpos.ru/api/health` → 200 и версию SW
5. 📱 на iPhone PWA: полностью закрыть и открыть приложение (активация нового SW)

> ⚠️ Не запускайте два деплоя одновременно — они делят `/tmp/titan-deploy.log` и сборку.

---

## 💾 Бэкапы и восстановление

- 🕐 `scripts/backup-db.sh` — `pg_dump --clean --if-exists` + gzip;
- 🔄 ротация: локально 14 дней, опционально выгрузка в Google Drive (rclone);
- 🛡 бэкап автоматически снимается **перед каждым деплоем**;
- ♻️ восстановление: распаковать дамп и накатить поверх (clean-режим), либо через системный модуль API.

---

## 🛠 Скрипты

| Команда | Действие |
|---|---|
| `pnpm dev` | Запуск всех приложений (Turborepo) |
| `pnpm build` | Сборка всех приложений |
| `pnpm lint` | Линтинг |
| `pnpm type-check` | Проверка типов по всем пакетам |
| `pnpm db:migrate` | Применить миграции БД |
| `pnpm db:studio` | GUI для базы данных |
| `pnpm format` | Prettier по всему репо |
| `bash scripts/deploy.sh` | Деплой на сервере |
| `bash scripts/backup-db.sh` | Ручной бэкап БД |
| `bash scripts/renew-ssl.sh` | Продление TLS-сертификата |

---

<div align="center">

**Titan HUB** © 2026 · Сделано с 💜 для анти-кафе

</div>
