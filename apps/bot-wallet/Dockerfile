FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/database/package.json ./packages/database/
COPY packages/auth/package.json ./packages/auth/
COPY packages/ui/package.json ./packages/ui/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/wallet/package.json ./apps/wallet/
COPY apps/bot-admin/package.json ./apps/bot-admin/
COPY apps/bot-wallet/package.json ./apps/bot-wallet/
RUN pnpm install --frozen-lockfile

COPY packages/ ./packages/
COPY apps/bot-wallet/ ./apps/bot-wallet/
RUN pnpm --filter @titan/types build
RUN pnpm --filter @titan/database build
RUN pnpm --filter @titan/bot-wallet build
# Без `pnpm deploy` (виснет на флакающем npm-реестре). Копируем собранный
# workspace целиком — pnpm-симлинки относительные, резолв сохраняется.

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app /app
WORKDIR /app/apps/bot-wallet

# Security hardening: запускаем бота от встроенного непривилегированного
# пользователя `node` (UID 1000), а не от root. Бот только сеть+БД, файлы не
# пишет — чтения /app (принадлежит root) достаточно, оно разрешено всем.
USER node

CMD ["node", "dist/index.js"]
