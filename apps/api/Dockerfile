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
COPY apps/api/ ./apps/api/
RUN pnpm --filter @titan/types build
RUN pnpm --filter @titan/database build
RUN pnpm --filter @titan/auth build
RUN pnpm --filter @titan/api build
RUN pnpm --filter @titan/api deploy --legacy --prod /deploy/api

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /deploy/api ./
COPY --from=builder /app/apps/api/dist ./dist

EXPOSE 3001
CMD ["node", "dist/index.js"]
