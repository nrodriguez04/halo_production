FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl

# ---- dependency stage ----
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --workspace=@halo/api --workspace=@halo/shared --include-workspace-root

# ---- build stage ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN npm run build --workspace=@halo/shared
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npm run build --workspace=@halo/api

# ---- runtime stage ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 halo

COPY --from=builder --chown=halo:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=halo:nodejs /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=halo:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=halo:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=halo:nodejs /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/package.json ./package.json

USER halo
EXPOSE 3001
CMD ["node", "apps/api/dist/main"]
