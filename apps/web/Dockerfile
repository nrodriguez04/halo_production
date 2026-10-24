# Node 20 reached end of life on 2026-04-30; 22 is supported until 2027-04.
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat

# ---- dependency stage ----
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --workspace=@halo/web --workspace=@halo/shared --include-workspace-root
# npm hoists workspace dependencies to the root; a workspace gets its own
# node_modules only when one of its versions conflicts. Create them so the
# copies below work either way.
RUN mkdir -p apps/web/node_modules packages/shared/node_modules

# ---- build stage ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Inlined into the browser bundle by `next build` (docker-compose.prod.yml
# passes them as build args); setting them at runtime has no effect.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_DESCOPE_PROJECT_ID
ARG NEXT_PUBLIC_DESCOPE_FLOW_ID=sign-in
ARG NEXT_PUBLIC_DESCOPE_BASE_URL
# The commit being built (.git is not in the context); shown by the 404 debugger.
ARG BUILD_SHA
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_DESCOPE_PROJECT_ID=$NEXT_PUBLIC_DESCOPE_PROJECT_ID \
    NEXT_PUBLIC_DESCOPE_FLOW_ID=$NEXT_PUBLIC_DESCOPE_FLOW_ID \
    NEXT_PUBLIC_DESCOPE_BASE_URL=$NEXT_PUBLIC_DESCOPE_BASE_URL \
    BUILD_SHA=$BUILD_SHA
# The app has no static assets yet; the runtime stage copies the folder.
RUN mkdir -p apps/web/public
RUN npm run build --workspace=@halo/shared
RUN npm run build --workspace=@halo/web

# ---- runtime stage ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
# Next's standalone server binds to $HOSTNAME, which Docker sets to the
# container id; listen on every interface so the health check's localhost
# and Caddy's web:3000 both reach it.
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
