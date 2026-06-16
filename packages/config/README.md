<!-- generated-by: gsd-doc-writer -->
# @titan/config

Общие конфигурационные пресеты TypeScript и ESLint для всего монорепо Titan HUB.

Пакет является частью монорепо [Titan HUB](../../README.md).

---

## Содержимое пакета

```
packages/config/
├── tsconfig/
│   ├── base.json      # базовый пресет TypeScript (Node/ESM)
│   ├── node.json      # пресет для Node.js-приложений и пакетов
│   └── nextjs.json    # пресет для Next.js-приложений (JSX, dom, Bundler)
└── eslint/
    └── index.js       # общая конфигурация ESLint (flat config)
```

---

## Пресеты TypeScript

### `tsconfig/base.json` — базовый пресет

Основа для всех остальных пресетов. Настроен под строгую типизацию и современный ESM.

| Опция | Значение | Назначение |
|---|---|---|
| `target` | `ES2022` | Уровень компиляции JS |
| `module` | `NodeNext` | Разрешение модулей по стандарту Node.js ESM |
| `moduleResolution` | `NodeNext` | Совместим с `"type": "module"` в package.json |
| `strict` | `true` | Полная строгая проверка типов |
| `exactOptionalPropertyTypes` | `true` | Запрет неявного `undefined` в optional-полях |
| `noUncheckedIndexedAccess` | `true` | Доступ к массивам/объектам всегда `T \| undefined` |
| `noImplicitOverride` | `true` | Обязательный `override` при перекрытии методов |
| `declaration` + `declarationMap` | `true` | Генерация `.d.ts` и карт деклараций |
| `sourceMap` | `true` | Source maps для отладки |
| `isolatedModules` | `true` | Совместим с esbuild/swc |
| `resolveJsonModule` | `true` | Импорт `.json`-файлов |
| `skipLibCheck` | `true` | Пропуск проверки типов `.d.ts` библиотек |
| `esModuleInterop` | `true` | Совместимость CommonJS/ESM импортов |
| `forceConsistentCasingInFileNames` | `true` | Единый регистр имён файлов |

Исключает: `node_modules`, `dist`.

---

### `tsconfig/node.json` — пресет для Node.js-пакетов

Расширяет `base.json`. Предназначен для пакетов и приложений, собираемых `tsc` в директорию `dist/`.

**Отличия от base:**

| Опция | Значение |
|---|---|
| `module` | `NodeNext` (унаследован) |
| `moduleResolution` | `NodeNext` (унаследован) |
| `outDir` | `dist` |
| `rootDir` | `src` |
| `include` | `src/**/*` |

Подходит для: `apps/api`, `apps/bot-admin`, `apps/bot-wallet`, `packages/auth`, `packages/database`, `packages/types`.

---

### `tsconfig/nextjs.json` — пресет для Next.js-приложений

Расширяет `base.json`. Адаптирован под App Router, браузерные типы и сборщик Next.js.

**Отличия от base:**

| Опция | Значение | Причина |
|---|---|---|
| `target` | `ES2017` | Широкая совместимость браузеров |
| `lib` | `["dom", "dom.iterable", "ES2022"]` | Браузерные API |
| `module` | `ESNext` | Для бандлера (Webpack/Turbopack) |
| `moduleResolution` | `Bundler` | Разрешение через бандлер, не Node |
| `jsx` | `preserve` | Next.js сам обрабатывает JSX |
| `allowJs` | `true` | Допускает `.js`-файлы рядом с `.ts` |
| `incremental` | `true` | Инкрементальная компиляция |
| `plugins` | `[{ "name": "next" }]` | Языковой сервер Next.js |
| `paths` | `{ "@/*": ["./src/*"] }` | Алиас `@/` → `src/` |
| `include` | `next-env.d.ts`, `**/*.ts`, `**/*.tsx`, `.next/types/**/*.ts` | |

Подходит для: `apps/web`, `apps/wallet`.

---

## Конфигурация ESLint

**Файл:** `eslint/index.js`
**Формат:** ESLint v9 flat config (`tseslint.config(...)`)

### Используемые плагины

| Плагин | Версия | Источник |
|---|---|---|
| `@eslint/js` | `^9.27.0` | `@eslint/js` |
| `typescript-eslint` | `^8.32.1` | `typescript-eslint` |

### Включённые наборы правил

1. `js.configs.recommended` — базовые правила ESLint
2. `...tseslint.configs.recommended` — рекомендуемые правила TypeScript

### Кастомные правила

| Правило | Уровень | Детали |
|---|---|---|
| `@typescript-eslint/no-unused-vars` | `warn` | Переменные с префиксом `_` игнорируются |
| `@typescript-eslint/no-explicit-any` | `warn` | Предупреждение, не ошибка |
| `@typescript-eslint/consistent-type-imports` | `error` | Обязателен `import type` для типов |

---

## Как подключить пресеты

### tsconfig — через `extends`

В `tsconfig.json` нужного пакета или приложения:

**Для Node.js-пакета** (`packages/*`, `apps/api`, `apps/bot-*`):

```json
{
  "extends": "@titan/config/tsconfig/node",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Для Next.js-приложения** (`apps/web`, `apps/wallet`):

```json
{
  "extends": "@titan/config/tsconfig/nextjs",
  "compilerOptions": {
    "baseUrl": ".",
    "noEmit": true
  }
}
```

### ESLint — через import

В `eslint.config.js` или `eslint.config.mjs` нужного пакета/приложения:

```js
import titanConfig from '@titan/config/eslint'

export default [
  ...titanConfig,
  // локальные переопределения при необходимости
]
```

---

## Экспорты пакета

Определены в `package.json` через поле `exports`:

```json
{
  "exports": {
    "./tsconfig/*": "./tsconfig/*.json",
    "./eslint": "./eslint/index.js"
  }
}
```

Это означает:
- `@titan/config/tsconfig/base` → `packages/config/tsconfig/base.json`
- `@titan/config/tsconfig/node` → `packages/config/tsconfig/node.json`
- `@titan/config/tsconfig/nextjs` → `packages/config/tsconfig/nextjs.json`
- `@titan/config/eslint` → `packages/config/eslint/index.js`

---

## Текущее состояние

На данный момент большинство пакетов и приложений монорепо имеют собственные `tsconfig.json` с дублированными настройками вместо наследования через `extends`. Пресеты `@titan/config` готовы к использованию и содержат те же значения — рефакторинг любого `tsconfig.json` до `extends` безопасен.

**Приложения, конфигурация которых соответствует `nextjs.json`:**
`apps/web`, `apps/wallet`

**Пакеты, конфигурация которых соответствует `node.json`:**
`apps/api`, `apps/bot-admin`, `apps/bot-wallet`, `packages/auth`, `packages/database`, `packages/types`
