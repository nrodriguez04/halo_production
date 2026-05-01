FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl

# ---- dependency stage ----
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/worker/package.json ./apps/worker/
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --workspace=@halo/worker --workspace=@halo/shared --include-workspace-root

# ---- build stage ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN npm run build --workspace=@halo/shared
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npm run build --workspace=@halo/worker

# ---- runtime stage ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 halo

COPY --from=builder --chown=halo:nodejs /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder --chown=halo:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=halo:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=halo:nodejs /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder /app/package.json ./package.json

USER halo
CMD ["node", "apps/worker/dist/main"]
