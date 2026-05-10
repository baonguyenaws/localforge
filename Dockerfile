FROM node:20-alpine AS base

# Install dependencies needed for better-sqlite3 (native module)
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# ---- deps stage ----
FROM base AS deps
COPY package*.json ./
RUN npm ci

# ---- builder stage ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runner stage ----
FROM base AS runner
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

WORKDIR /app

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Create directories for persistent data
RUN mkdir -p /app/data /app/projects \
 && chown -R nextjs:nodejs /app/data /app/projects

USER nextjs

EXPOSE 7777

ENV PORT=7777
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
