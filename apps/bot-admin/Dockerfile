FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/config/ ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/database/package.json ./packages/database/
COPY apps/bot-admin/package.json ./apps/bot-admin/
RUN pnpm install --frozen-lockfile

COPY packages/ ./packages/
COPY apps/bot-admin/ ./apps/bot-admin/
RUN pnpm --filter @titan/types build
RUN pnpm --filter @titan/database build
RUN pnpm --filter @titan/bot-admin build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/bot-admin/dist ./dist
COPY --from=builder /app/packages ./packages

CMD ["node", "dist/index.js"]
