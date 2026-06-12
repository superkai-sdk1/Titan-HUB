<!-- generated-by: gsd-doc-writer -->

# @titan/ui

Общие UI-примитивы для приложений монорепо Titan HUB. Пакет является частью [монорепо Titan HUB](../../README.md).

> **Статус:** пакет содержит базовый набор компонентов, но в настоящее время **нигде не импортируется** напрямую — `apps/web` и `apps/wallet` объявляют его зависимостью в `package.json`, однако используют собственные компоненты и `DesignSystem.tsx`. Пакет готов к использованию, но реальное потребление отсутствует.

## Установка

Пакет помечен как `private: true` — он предназначен только для внутреннего использования в рамках монорепо. Устанавливается автоматически через pnpm workspaces.

## Экспорт

Всё экспортируется из `src/index.ts`. Также доступны глобальные стили: `@titan/ui/globals.css`.

### Компоненты

| Компонент | Экспорты | Описание |
|-----------|----------|----------|
| `Button` | `Button`, `ButtonProps`, `buttonVariants` | Кнопка на базе Radix Slot + CVA. Варианты: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`, `cyan`. Размеры: `default`, `sm`, `lg`, `icon`. |
| `Badge` | `Badge`, `BadgeProps`, `badgeVariants` | Бейдж. Варианты: `default`, `secondary`, `destructive`, `outline`, `cyan`, `emerald`, `rose`, `amber`. |
| `Card` | `Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter` | Карточка с закруглёнными углами (`rounded-2xl`). |
| `Input` | `Input`, `InputProps` | Текстовый инпут (`h-11`, `rounded-xl`). |
| `Dialog` | `Dialog`, `DialogTrigger`, `DialogPortal`, `DialogOverlay`, `DialogClose`, `DialogContent`, `DialogTitle`, `DialogDescription`, `DialogHeader`, `DialogFooter` | Тонкая обёртка над `@radix-ui/react-dialog`. |
| `Toast` | `Toast`, `ToastProvider`, `ToastAction`, `ToastClose`, `ToastTitle`, `ToastDescription`, `ToastViewport` | Реэкспорт `@radix-ui/react-toast`. |
| `Skeleton` | `Skeleton` | Пульсирующий плейсхолдер загрузки (`animate-pulse`, `rounded-xl`). |
| `Spinner` | `Spinner` | Спиннер с тремя размерами: `sm` (16px), `md` (24px), `lg` (40px). |

### Утилиты (`src/lib/utils.ts`)

| Функция | Сигнатура | Описание |
|---------|-----------|----------|
| `cn` | `(...inputs: ClassValue[]) => string` | Объединяет classnames через `clsx` + `tailwind-merge`. |
| `formatCurrency` | `(amount: number \| string) => string` | Форматирует число в рубли: `1234 → "1 234₽"` (локаль `ru-RU`). |
| `formatTime` | `(date: Date \| string) => string` | Форматирует дату в `HH:mm` (локаль `ru-RU`). |
| `formatDuration` | `(ms: number) => string` | Переводит миллисекунды в строку вида `"2ч 30м"`. |

## Зависимости

Компоненты построены на базе:
- [`@radix-ui/*`](https://www.radix-ui.com/) — `dialog`, `toast`, `slot` и др.
- [`class-variance-authority`](https://cva.style/) — варианты компонентов
- [`clsx`](https://github.com/lukeed/clsx) + [`tailwind-merge`](https://github.com/danbrown/tailwind-merge) — утилита `cn`
- `lucide-react` — объявлена зависимостью, но в текущих компонентах не используется

Требует React 19 в качестве peer dependency.

## Разработка

```bash
# Сборка
pnpm --filter @titan/ui build

# Сборка в режиме watch
pnpm --filter @titan/ui dev

# Проверка типов без сборки
pnpm --filter @titan/ui type-check
```

Сборка выполняется через `tsc` (TypeScript compiler), результат в `dist/`.
