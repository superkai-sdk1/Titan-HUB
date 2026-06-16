<!-- generated-by: gsd-doc-writer -->

# @titan/web

PWA-фронтенд Titan HUB — кассовой системы для игрового клуба/антикафе. Написан на Next.js 15 (App Router, standalone-режим), работает как прогрессивное веб-приложение и устанавливается на iOS/Android-устройства персонала.

Часть монорепо [Titan HUB](../../README.md).

---

## Технологии

| Технология | Версия | Роль |
|---|---|---|
| Next.js | ^15.3.2 | App Router, SSR/RSC, standalone-сборка |
| React | ^19.1.0 | UI-рантайм |
| TypeScript | ^5.8.3 | Статическая типизация |
| Zustand | ^5.0.3 | Глобальное состояние авторизации (`store/auth.store.ts`) |
| TanStack React Query | ^5.75.2 | Серверное состояние, кэш, invalidate при pull-to-refresh |
| Framer Motion | ^12.10.0 | Анимации (Sheet, split-панели, переходы) |
| @use-gesture/react | ^10.3.1 | Жестовые хуки (свайп в Sheet) |
| @dnd-kit | core+sortable+utilities | Drag-and-drop (переупорядочивание меню, зон) |
| @simplewebauthn/browser | ^13.3.0 | WebAuthn/Passkey-аутентификация |
| react-hook-form + zod | ^7.56.3 / ^3.24.3 | Формы с валидацией |
| date-fns | ^4.1.0 | Форматирование дат (вкл. `ru`-локаль) |
| Tailwind CSS v4 | ^4.1.6 | Утилитарные классы (используется минимально) |
| next-pwa | ^5.6.0 | PWA-обвязка (manifest, service-worker хелперы) |

Зависимости рабочего пространства: `@titan/types`, `@titan/ui`, `@titan/config`.

---

## Структура

```
apps/web/
├── src/
│   ├── app/                    # Next.js App Router (роуты и лейауты)
│   │   ├── layout.tsx          # Корневой лейаут: AuthGuard, Sidebar, BottomNav, PTR, SW
│   │   ├── providers.tsx       # QueryClientProvider и прочие провайдеры
│   │   ├── globals.css         # CSS-переменные, glass-классы, bg-mesh
│   │   ├── login/              # Экран входа (PIN, passkey, пароль)
│   │   ├── pos/                # Касса (masonry-сетка чеков + карточка смены ShiftCard)
│   │   │   └── [checkId]/      # Карточка открытого чека (мобильный полноэкранный роут)
│   │   ├── events/             # Мероприятия (сегмент-вкладки: Предстоящие · Прошедшие)
│   │   ├── dashboard/          # Аналитика (обзор/финансы/расходы/игры/бар/игроки/персонал/мероприятия)
│   │   ├── ai/                 # Tai — ИИ-ассистент (чат)
│   │   ├── shifts/             # Быстрый переход к сменам (редирект/модалки)
│   │   ├── manage/             # Хаб «Управление» (сплит-вью на десктопе)
│   │   │   ├── layout.tsx      # Сплит: меню слева, раздел справа (≥1024px)
│   │   │   ├── menu/           # Меню заведения
│   │   │   ├── inventory/      # Склад (вкладки: Остатки · Поставки · Ревизия)
│   │   │   ├── pricing/        # Тарифы и аренда (Тарифы · Типы вечеров · Зоны · Мероприятия)
│   │   │   ├── clients/        # Клиенты
│   │   │   ├── customers/      # Заказчики
│   │   │   ├── balances/       # Депозиты и долги
│   │   │   ├── loyalty/        # Лояльность (Скидки · Бонусы · Сертификаты)
│   │   │   ├── collections/    # Сбор средств (Фонд клуба + разовые взносы резидентов)
│   │   │   ├── staff/          # Пользователи (owner) / Мой профиль (staff)
│   │   │   ├── shifts/         # Смена и касса (инкассация встроена)
│   │   │   ├── salary/         # Зарплата (только owner)
│   │   │   ├── settings/       # Настройки системы (только owner)
│   │   │   ├── about/          # О системе (только owner)
│   │   │   ├── spaces/         # Зоны/столы (CRUD, tablet-link)
│   │   │   ├── modifiers/      # Модификаторы блюд
│   │   │   ├── notifications/  # Настройки уведомлений
│   │   │   └── ...             # Прочие служебные роуты (cashops, revision, supplies и др.)
│   │   ├── tablet/             # Планшетный киоск самообслуживания
│   │   │   ├── pair/           # Привязка планшета к зоне
│   │   │   └── order/          # Заказ гостя
│   │   ├── reports/            # Отчёты
│   │   ├── privacy/            # Политика конфиденциальности
│   │   └── terms/              # Условия использования
│   ├── components/             # Переиспользуемые компоненты
│   │   ├── AuthGuard.tsx       # Охрана роутов: редирект на /login при отсутствии токена
│   │   ├── BottomNav.tsx       # Нижняя навигация (мобильный, ≤1023px)
│   │   ├── Sidebar.tsx         # Боковая панель (десктоп/планшет, ≥1024px)
│   │   ├── GlobalPullToRefresh.tsx  # Pull-to-refresh (invalidate всех React Query)
│   │   ├── PullToRefreshContainer.tsx  # Локальный PTR для /events, /pos и /dashboard
│   │   ├── TaiLogo.tsx         # Анимированный логотип Tai (используется в кассе и чате)
│   │   ├── Icon.tsx            # SVG-иконки (собственная карта, не шрифт; вкл. titan_ai)
│   │   ├── SessionLock.tsx     # Блокировка экрана при бездействии (30 мин)
│   │   ├── ServiceWorkerRegister.tsx  # Регистрация SW
│   │   ├── NotificationsProvider.tsx  # SSE-поток уведомлений
│   │   ├── NotificationBell.tsx   # Колокольчик уведомлений в шапке
│   │   ├── ShiftModals.tsx     # Модалки открытия/закрытия смены
│   │   ├── CheckDetailView.tsx # Карточка чека (сплит-панель POS)
│   │   ├── CheckChat.tsx       # Чат/переписка по чеку (SSE)
│   │   ├── StateView.tsx       # Заглушки состояний (загрузка, ошибка, пусто)
│   │   ├── Toast.tsx           # Всплывающие уведомления
│   │   ├── SwipeableRow.tsx    # Свайп-строка (удаление жестом)
│   │   ├── TimeInput24.tsx     # Поле ввода времени (24ч)
│   │   ├── CategoryIcon.tsx    # Иконка категории меню
│   │   └── manage/
│   │       ├── DesignSystem.tsx  # UI-примитивы (Sheet, Toggle, Button, INP, LBL, SEL, Chip…)
│   │       ├── ManageMenu.tsx    # Меню «Управления» (4 группы, role+perm-гейтинг)
│   │       └── UnsavedGuard.tsx  # Диалог несохранённых изменений (черновики)
│   ├── store/
│   │   └── auth.store.ts       # Zustand-стор авторизации (persist в localStorage)
│   ├── hooks/
│   │   ├── useShift.ts         # useCurrentShift / useOpenShift / useCloseShift
│   │   └── useCountUp.ts       # Анимированный счётчик цифр
│   └── lib/
│       ├── api.ts              # HTTP-клиент (Bearer, 401→logout, ApiError)
│       ├── nav.ts              # NAV_PRIMARY, NAV_SHIFTS, isNavActive — источник истины навигации
│       ├── sse.ts              # Открытие SSE через одноразовый /auth/sse-ticket
│       ├── push.ts             # Web Push: enablePush / disablePush / getPushStatus
│       ├── haptic.ts           # Вибро/тактильная отдача (navigator.vibrate + Telegram WebApp)
│       ├── tabletSession.ts    # Хранение выбранного пространства планшета (localStorage)
│       ├── salary.ts           # Вспомогательные расчёты зарплаты
│       ├── contact.ts          # Утилита для контактов
│       └── funnyName.ts        # Генератор смешных имён гостей
├── public/
│   ├── sw.js                   # Service Worker (CACHE_VERSION v264, стратегии кэша, Web Push)
│   ├── manifest.json           # Web App Manifest (standalone, theme #15121b)
│   └── brand/                  # Логотипы и брендинг
└── package.json
```

---

## Навигация

Единственный источник истины для основных пунктов меню — `src/lib/nav.ts`.

### Основные разделы (`NAV_PRIMARY`)

| Путь | Иконка | Метка |
|---|---|---|
| `/pos` | `point_of_sale` | Касса |
| `/events` | `event` | События |
| `/dashboard` | `bar_chart` | Аналитика / Отчёты |
| `/manage` | `settings` | Управление / Меню |

На мобильных устройствах навигация выводится через `BottomNav.tsx` (4 пункта + центральная кнопка Tai — FAB на `/dashboard`). На десктопе/планшете (≥1024px) — через `Sidebar.tsx` (раскладывается до 260px или сжимается до 72px, состояние сохраняется в `localStorage`).

---

## Хаб «Управление» (`/manage`)

Меню «Управления» (`ManageMenu.tsx`) содержит 4 группы. Видимость пунктов гейтируется ролью (`owner`/`staff`) и правами `profiles.permissions` (только для `staff`; данные подтягиваются из `/auth/me`).

### Меню и склад
| Путь | Метка | Права |
|---|---|---|
| `/manage/menu` | Меню | `owner`, `staff` (perm: `menu`) |
| `/manage/inventory` | Склад (Остатки · Поставки · Ревизия) | `owner`, `staff` (perm: `inventory`) |
| `/manage/pricing` | Тарифы и аренда | `owner`, `staff` |

### Клиенты
| Путь | Метка | Права |
|---|---|---|
| `/manage/clients` | Клиенты | `owner`, `staff` (perm: `clients`) |
| `/manage/customers` | Заказчики | `owner`, `staff` |
| `/manage/balances` | Депозиты и долги | `owner`, `staff` (perm: `debtors`) |
| `/manage/loyalty` | Лояльность (Скидки · Бонусы · Сертификаты) | `owner`, `staff` |
| `/manage/collections` | Сбор средств | `owner`, `staff` (perm: `debtors`) |

### Персонал и смены
| Путь | Метка (owner / staff) | Права |
|---|---|---|
| `/manage/staff` | Пользователи / Мой профиль | `owner`, `staff` |
| `/manage/shifts` | Смены | `owner`, `staff` |
| `/manage/salary` | Зарплата | `owner` (perm: `salary`) |

### Система
| Путь | Метка | Права |
|---|---|---|
| `/manage/settings` | Настройки | `owner` |
| `/manage/about` | О системе | `owner` |

На десктопе (≥1024px) `manage/layout.tsx` отображает сплит-вью: меню разделов слева (по умолчанию 420px, регулируется мышью/пальцем за ручку, сохраняется в `localStorage` ключ `manage-split-w`) и содержимое раздела справа с анимацией слайда. На мобильном обёртки сплита схлопываются в `display:contents` — меню и разделы работают как отдельные полноэкранные страницы.

---

## Ключевые экраны

### `/pos` — Касса

Главный экран — masonry-сетка чеков (`MasonryColumns`) с адаптивным числом колонок: 1–4 в зависимости от ширины контейнера (ResizeObserver, пороги ≥980→4 / ≥620→3 / ≥280→2 / иначе 1). Нечётные колонки смещены вниз на 34px для визуального разнообразия.

В предпоследнюю ячейку сетки встроена **карточка смены** (`ShiftCard`) — заменила полноэкранный оверлей. Состояния карточки:
- Смена не открыта: кнопка «Открыть смену»
- Смена открыта, чеки есть: три метрики — открытые чеки / прогноз Tai (бегущая анимация `tai-run`) / остаток в кассе + тап открывает `ShiftDetailSheet`
- Смена открыта, чеков нет: кнопка «Закрыть смену» + касса

Прогноз формируется через `GET /pos/shift-summary` и рассчитывается в `lib/shiftForecast.ts` (`computeShiftForecast`): проецирует каждый открытый чек до среднего чека резидента за 120 дней с поправкой на день недели. Лого-анимация — `TaiLogo` с keyframe `tai-run`.

Карточки чеков: аватар + ник + до 5 позиций (>5 → «Ещё N») + время + сумма. При выборе чека на десктопе (≥1024) разворачивается `CheckDetailView` в правой панели сплита, на мобильном — роут `/pos/[checkId]`. Pull-to-refresh — `PullToRefreshContainer`.

Поддерживает добавление позиций, тарифов, скидок/бонусов/сертификатов, оплату наличными/картой/переводом/депозитом/долгом, аренду зон с почасовой тарификацией. SSE-поток событий чека через `CheckChat.tsx`. Открытие/закрытие смены — `ShiftModals.tsx`.

При создании нового клиента встроен подбор из GoMafia (`/gomafia/search?q=…`).

### `/events` — Мероприятия

Два сегмент-вкладки: **Предстоящие** и **Прошедшие** (иконка над подписью, аналогично Складу). Pull-to-refresh — собственный `PullToRefreshContainer` (глобальный PTR на `/events` отключён).

Прошедшие: события текущего месяца выводятся плоским списком, события прошлых месяцев сворачиваются в папки по названию месяца (иконка `folder_open`, раскрытие по клику).

### `/dashboard` — Аналитика

Вкладки: обзор, финансы, расходы, игры, бар, игроки, персонал, **мероприятия**. Диапазоны: 7 дней, 30 дней, текущий месяц, произвольный период.

Вкладка **«Мероприятия»** (`EventsTab`) — `GET /analytics/events?from&to` — данные по окну календарной даты события:
- количество / суммарные часы / дни заказов, выручка
- средняя длительность / средний чек / выручка за час / среднее число гостей
- разбивка по формату (Титан / Выезд / Миникап)
- загрузка по дням недели
- топ заказчиков и зон

Расходы — отдельная вкладка `ExpensesTab`. Анимированные счётчики (`useCountUp`). Pull-to-refresh — собственный `PullToRefreshContainer` (глобальный PTR на `/dashboard` отключён).

### `/ai` — Tai

Чат-интерфейс с ИИ-ассистентом (`TitanAiChat.tsx`). Запросы на бэкенд (`POST /ai/chat`). Ассистент работает через провайдер Polza, модель `anthropic/claude-sonnet-4.6`, text-to-SQL по схеме БД (только `SELECT`). Иконка `titan_ai` — кастомная SVG в `Icon.tsx`; анимированный логотип — компонент `TaiLogo.tsx`. На экране `/ai` глобальный PTR отключён.

### `/tablet/*` — Планшетный киоск
- `/tablet/pair` — привязка планшета к зоне (по ссылке с кодом из `/spaces/:id/tablet-link-code`)
- `/tablet/order` — заказ гостя самообслуживания

Выбранное пространство хранится в `localStorage` через `lib/tabletSession.ts`. `AuthGuard` не вмешивается в `/tablet/*` — у киоска собственная логика авторизации (staff-токен по PIN).

### `/manage/shifts` — Смена и касса

Открытие/закрытие смены (тип вечера, стартовый остаток), инкассация (внесения/изъятия/зарплаты наличными). Живой остаток кассы. История смен. Аналитика по закрытой смене.

### `/manage/inventory` — Склад

Три вкладки в едином роуте:
- **Остатки** — текущие количества и себестоимости по WAC
- **Поставки** — документы приёмки (черновики + применение), `UnsavedGuard` при уходе из черновика
- **Ревизия** — плановый пересчёт (черновики + применение), `UnsavedGuard`

### `/manage/collections` — Сбор средств

Взносы резидентов вне кассы: Фонд клуба (recurring, авто-период месяц) и разовые сборы (oneoff). Способы оплаты: Наличные / Перевод / СБП / Депозит / Долг. Операции через депозит/долг изменяют `profiles.balance` и отражаются в истории игрока. Наличные/перевод/СБП идут в копилку мимо баланса.

Управление исключениями (1 месяц / 3 месяца / навсегда) и персональными суммами. API: `GET/POST /api/collections`, детали периода `GET /collections/:id`, оплата `POST /collections/:id/pay`. Таблицы: `collections`, `collection_periods`, `collection_contributions`, `collection_members` (миграция 053).

### `/manage/staff` — Пользователи / Мой профиль

Владелец (`owner`) видит список всех пользователей, может создавать/редактировать/удалять, сбрасывать PIN (`/staff/:id/reset-pin`), привязывать Telegram (`/staff/:id/telegram-link`), управлять passkey (`/staff/:id/passkeys`). Сотрудник (`staff`) видит только свой профиль с настройками уведомлений и passkey.

---

## Авторизация и безопасность

Состояние авторизации — Zustand-стор `useAuthStore` (`src/store/auth.store.ts`) с persist в `localStorage` под ключом `titan-auth`. Хранит JWT-токен, данные пользователя (`id`, `nickname`, `role`, `photoUrl`), `rememberedUserId`/`rememberedNickname`.

**Блокировка при бездействии.** При каждой холодной загрузке (перезагрузка страницы) и после 30 минут бездействия (`INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000`) `SessionLock` переводит стор в `isLocked: true` и показывает экран подтверждения (PIN или passkey). Планшеты-киоски (`role = 'tablet'`) не блокируются.

**AuthGuard.** Компонент `AuthGuard` (`src/components/AuthGuard.tsx`) проверяет наличие токена. Публичные пути без авторизации: `/login`, `/privacy`, `/terms`. Путь `/tablet/*` не блокируется — у киоска собственный поток входа.

**HTTP-клиент.** `lib/api.ts` прокидывает `Authorization: Bearer <token>` во все запросы. При 401 с действующим токеном вызывает `logout()` и редиректит на `/login`.

**SSE-потоки.** `lib/sse.ts` открывает `EventSource` через одноразовый тикет (`POST /auth/sse-ticket`, TTL 60 с), чтобы JWT не попадал в URL/логи nginx.

**WebAuthn/Passkey.** Регистрация и аутентификация через `@simplewebauthn/browser`. Управляется в `/manage/staff` (экраны Пользователей и Мой профиль).

---

## PWA и Service Worker

**Манифест** (`public/manifest.json`): `display: standalone`, `theme_color: #15121b`, иконки 192/512/512-maskable.

**Service Worker** (`public/sw.js`, текущая версия `CACHE_VERSION = 'v264'`):

| Ресурс | Стратегия |
|---|---|
| `/_next/static/*` | cache-first (неизменяемые build-хэши) |
| `/api/*` | network-only (данные не кэшируются — безопасность между сессиями на киоске) |
| HTML, изображения, прочее | network-first с fallback на кэш (таймаут 8 с) |
| WebSocket, SSE, не-GET | без перехвата |

**Web Push** (`lib/push.ts`): `enablePush` запрашивает разрешение у браузера → получает VAPID-ключ из `/notifications/vapid-public-key` → подписывает (`pushManager.subscribe`) → регистрирует на бэкенде (`POST /notifications/push/subscribe`). SW обрабатывает входящий push (`push`-событие) и показывает системное уведомление. Группировка уведомлений по `tag` (из `meta.groupKey` или типа уведомления).

**iOS-совместимость.** `appleWebApp.statusBarStyle: 'default'` + явный мета-тег `apple-mobile-web-app-capable` в корневом `layout.tsx` — для корректного размера вьюпорта без артефактов Safari на iPhone.

> **Важно:** при любых изменениях фронтенда бампить `CACHE_VERSION` в `public/sw.js` для принудительного обновления кэша у клиентов.

---

## Дизайн-система

Компонент `src/components/manage/DesignSystem.tsx` содержит переиспользуемые UI-примитивы:

- `Sheet` — универсальный модальный компонент: на мобильном (<768px) — bottom sheet с интерактивной высотой, на десктопе (≥768px) — центрированная модалка. Жесты через Framer Motion.
- `Toggle` — переключатель (размеры `sm`/`md`, акцентный цвет).
- `Button` — кнопка (варианты `primary`/`secondary`/`danger`).
- `Chip` — фильтр-чип (активный/неактивный).
- `INP`, `SEL`, `LBL` — CSS-объекты для полей ввода, селектов и меток (инлайн-стили).

Иконки: `src/components/Icon.tsx` — собственная SVG-библиотека (24×24 viewBox, stroke-based, `strokeWidth 1.75`). Включает кастомную иконку `titan_ai`.

Анимированный логотип Tai: `src/components/TaiLogo.tsx` — используется в кассе (прогноз в `ShiftCard`, карточки чеков), чате Tai и модалках.

Цветовая палитра: один violet-акцент `#8B5CF6` (`--violet`), тёмный фон `#15121b`, glass-эффекты (`glass-l2`/`glass-l3`).

---

## GlobalPullToRefresh

`src/components/GlobalPullToRefresh.tsx` — глобальный pull-to-refresh, навешенный на `.layout-content`. При свайпе вниз от верха (когда `scrollTop === 0`) вызывает `queryClient.invalidateQueries()` — обновляет все React Query на текущем экране.

Не перехватывает касания:
- вне `.layout-content` (порталы модалок/Sheet)
- внутри вложенных скроллеров (Sheet с `overflow:auto`, списки)

Отключён на: `/login`, `/tablet*`, `/pos*`, `/dashboard*`, `/ai*`, `/events*` (у них собственные PTR или внутренний скролл).

---

## Интеграции

### GoMafia (`gomafia.pro`)

При создании нового клиента в кассе (`/pos`) встроен поиск по базе GoMafia. Дебаунс-запрос `GET /gomafia/search?q=…` (через бэкенд) возвращает список игроков клуба и всей платформы. При выборе игрока его `gomafiaId`, логин и фото подставляются в форму. Аватары по приоритету: загруженное фото → Telegram → GoMafia.

### Web Push (VAPID)

Управляется через `lib/push.ts`. Ключ публикуется бэкендом по `GET /notifications/vapid-public-key`. Подписка хранится в `pushManager` браузера и регистрируется на сервере.

### WebAuthn / Passkey

Реализован через `@simplewebauthn/browser`. Работает на странице профиля (`/manage/staff`). Используется для входа без пароля и для подтверждения при снятии блокировки экрана.

---

## Взаимодействие с бэкендом

Фронтенд обращается к API через `lib/api.ts`. Базовый URL: переменная окружения `NEXT_PUBLIC_API_URL` (по умолчанию `/api`, проксируется nginx).

```typescript
import { api } from '@/lib/api'

// GET
const shift = await api.get<{ shift: Shift }>('/shifts/current')

// POST
const result = await api.post<{ check: Check }>('/checks', { spaceId, guestName })

// Ошибки — ApiError с полем .status
try {
  await api.delete('/checks/123')
} catch (e) {
  if (e instanceof ApiError && e.status === 404) { /* … */ }
}
```

**Типы** берутся из `@titan/types` (workspace-пакет).

**React Query** (`@tanstack/react-query`) используется для всех серверных запросов. `QueryClientProvider` монтируется в `app/providers.tsx`. Ключи запросов — вложенные массивы: `['shifts', 'current']`, `['auth', 'me']`, `['collections']` и т.д.

**SSE-события** (`lib/sse.ts`) используются в POS (события чека) и уведомлениях. Открываются через одноразовый тикет — JWT не попадает в URL.

---

## Команды

```bash
# Разработка с Turbopack
pnpm dev

# Продакшн-сборка (Next.js standalone)
pnpm build

# Запуск продакшн-сервера (порт 3000)
pnpm start

# Линтинг (Next.js ESLint)
pnpm lint

# Проверка типов
pnpm type-check

# Удаление артефактов сборки
pnpm clean
```

Рекомендуется запускать через Turborepo из корня монорепо:

```bash
# Запустить только web
pnpm --filter @titan/web dev

# Запустить весь стек локально
pnpm dev
```

---

## Переменные окружения

| Переменная | Обязательная | Описание |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Нет (default `/api`) | Базовый URL бэкенда. В Docker-среде — `/api` (проксируется nginx). При локальной разработке — `http://localhost:3001`. |

---

## Связь с другими пакетами

- **`apps/api`** — бэкенд на Hono, все HTTP-запросы идут через `lib/api.ts`. Аутентификация: JWT Bearer.
- **`packages/database`** — типы Drizzle-схемы используются как основа интерфейсов (реэкспортируются через `@titan/types`).
- **`@titan/types`** — общие типы и интерфейсы (workspace-пакет).
- **`@titan/ui`** — дополнительные UI-примитивы (workspace-пакет).
- **`@titan/config`** — общий tsconfig и eslint-конфиг (devDependency).
