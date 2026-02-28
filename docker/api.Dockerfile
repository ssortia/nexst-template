FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

# ---- deps stage ----
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/
COPY packages/types/package.json ./packages/types/
COPY packages/config/typescript/package.json ./packages/config/typescript/
RUN pnpm install --frozen-lockfile

# ---- builder stage ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN pnpm --filter @repo/types build
RUN pnpm --filter @repo/database db:generate
RUN pnpm --filter @repo/api build

# ---- runner stage ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/packages/database/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3001
CMD ["node", "dist/main"]
