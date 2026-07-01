# ============================================================================
# 3C数码零售系统 · Dockerfile (多阶段构建)
# 目标: 腾讯云 TKE / 轻量应用服务器
# ============================================================================

# ---- Stage 1: 构建阶段 ----
FROM node:24-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare npm@latest --activate

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts 2>/dev/null || npm install --ignore-scripts

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# ---- Stage 2: 生产阶段 ----
FROM node:24-alpine
LABEL maintainer="LDK-SE"
LABEL description="3C数码零售系统 · 生产级 API"

RUN apk add --no-cache dumb-init tzdata curl \
  && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
  && echo "Asia/Shanghai" > /etc/timezone

ENV NODE_ENV=production \
  APP_PORT=3000

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.env.example ./.env.example

RUN addgroup -g 1001 appgroup && \
  adduser -u 1001 -G appgroup -s /bin/sh -D appuser && \
  chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]

HEALTHCHECK --interval=15s --timeout=5s --retries=3 --start-period=20s \
  CMD curl -f http://localhost:3000/api/v1/ai/health || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
