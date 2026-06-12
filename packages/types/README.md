<!-- generated-by: gsd-doc-writer -->
# @titan/types

Общие TypeScript-типы, перечисления и Zod-схемы для всех приложений монорепо Titan HUB.

Пакет приватный (`"private": true`) и предназначен только для внутреннего использования.

## Установка (внутри монорепо)

```json
"dependencies": {
  "@titan/types": "workspace:*"
}
```

## Экспортируемое содержимое

Пакет реэкспортирует три модуля (`src/index.ts`):

### `src/enums.ts` — константы-объекты и типы

| Имя | Значения |
|-----|----------|
| `Role` | `owner`, `staff`, `tablet`, `client` |
| `ClientTier` | `guest`, `resident`, `student` |
| `ShiftStatus` | `open`, `closed` |
| `EveningType` | `sport_mafia`, `city_mafia`, `kids_mafia`, `board_games`, `none` |
| `CheckStatus` | `open`, `closed`, `cancelled` |
| `PaymentMethod` | `cash`, `card`, `transfer`, `bonus`, `deposit`, `debt`, `split`, `certificate` |
| `DiscountType` | `percent`, `fixed` |
| `DiscountTarget` | `check`, `item` |
| `EventType` | `titan`, `exit` |
| `EventStatus` | `planned`, `active`, `completed`, `cancelled` |
| `EventPaymentType` | `fixed`, `per_head`, `free` |
| `SpaceType` | `small_booth`, `large_booth`, `hall` |
| `CashOperationType` | `deposit`, `withdrawal`, `salary` |
| `RefundType` | `full`, `partial` |
| `RefundReason` | `return`, `exchange`, `discount`, `damage` |
| `TransactionType` | `deposit`, `withdrawal`, `payment`, `refund`, `bonus_accrual`, `bonus_spend` |
| `TgLinkStatus` | `pending`, `approved`, `rejected` |
| `NotificationChannel` | `telegram`, `pwa`, `both` |
| `AdminNotificationType` | `shift_opened`, `shift_closed`, `payment_card`, `payment_cash`, `low_stock`, `new_client`, `tablet_order`, `event_reminder`, `birthday`, `debt_payment` |
| `PlayerSegment` | `new`, `active`, `sleeping` |
| `PlayerTariff` | `regular`, `resident`, `student`, `one_game` |

Каждая константа объявлена через `as const`, для неё экспортируется одноимённый тип (union из значений).

### `src/roles.ts` — права доступа персонала

```ts
export const PERMISSIONS: readonly string[]  // массив ключей разрешений
export type Permission                        // union всех ключей
export type UserPermissions                   // Partial<Record<Permission, boolean>>
```

Разрешения: `can_give_discount`, `can_view_finance`, `can_manage_menu`, `can_manage_clients`, `can_manage_staff`, `can_manage_supplies`, `can_manage_expenses`, `can_view_analytics`, `can_process_refunds`, `can_manage_events`, `can_manage_certificates`, `can_manage_salary`, `can_cash_operations`, `can_view_reports`, `can_manage_spaces`.

### `src/schemas.ts` — Zod-схемы и выведенные типы

| Схема | Назначение |
|-------|-----------|
| `LoginPinSchema` | PIN-вход: 4 цифры + опциональный `userId` |
| `LoginPasswordSchema` | Вход по паролю: `nickname` + `password` |
| `LoginTelegramSchema` | Вход через Telegram: `initData` |
| `SetPinSchema` | Установка нового PIN |
| `CreateCheckSchema` | Открытие кассового чека (POS) |
| `AddCartItemSchema` | Добавление позиции в чек |
| `PaymentSchema` | Оплата чека (поддерживает сплит, бонусы, депозит, сертификат) |
| `CreateEventSchema` | Создание мероприятия |
| `CreateClientSchema` | Регистрация клиента |
| `CreateInventoryItemSchema` | Создание позиции меню/склада |
| `OpenShiftSchema` | Открытие смены (`cashStart`, `eveningType`) |
| `CloseShiftSchema` | Закрытие смены (`cashEnd`, опциональная заметка) |
| `AiActionSchema` | Действие TITAN AI (15 типов действий + payload) |

Для каждой схемы экспортируется выведенный тип (`LoginPinInput`, `CreateCheckInput` и т. д.).

## Где используется

| Приложение / пакет | Характер использования |
|--------------------|------------------------|
| `apps/api` | Валидация запросов в роутерах (например, `auth.router.ts` использует `LoginPinSchema`, `LoginPasswordSchema`, `LoginTelegramSchema`, `SetPinSchema`) |
| `apps/web` | Фронтенд Next.js — типы чеков, ролей, разрешений; указан в `transpilePackages` |
| `apps/wallet` | Telegram WebApp кошелька; указан в `transpilePackages` |
| `apps/bot-admin` | Telegram-бот персонала |
| `apps/bot-wallet` | Telegram-бот клиентов |
| `packages/auth` | Хелперы аутентификации |

## Сборка

```bash
# сборка
pnpm build

# режим отслеживания изменений
pnpm dev

# только проверка типов без артефактов
pnpm type-check
```

Выходные файлы (`dist/`) генерируются через `tsc` и не коммитятся в репозиторий — собираются локально и в CI при `turbo build`.

---

Часть монорепо [Titan HUB](../../README.md).
