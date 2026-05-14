FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/config/ ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY apps/wallet/package.json ./apps/wallet/
RUN pnpm install --frozen-lockfile

COPY packages/ ./packages/
COPY apps/wallet/ ./apps/wallet/
RUN pnpm --filter @titan/types build
RUN pnpm --filter @titan/ui build
RUN pnpm --filter @titan/wallet build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/wallet/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/wallet/.next/static ./.next/static

USER nextjs
EXPOSE 3002
ENV PORT=3002
CMD ["node", "server.js"]
