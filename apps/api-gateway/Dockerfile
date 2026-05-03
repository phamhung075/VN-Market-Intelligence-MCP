# API Gateway — Bun/TypeScript
# Port 4000

FROM oven/bun:1.3.13-alpine AS builder

WORKDIR /app
COPY package.json bun.lock* ./
RUN NODE_TLS_REJECT_UNAUTHORIZED=0 bun install --frozen-lockfile

COPY . .

# ── Runtime ──
FROM oven/bun:1.3.13-alpine

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY package.json tsconfig.json ./

EXPOSE 4000
ENV PORT=4000

CMD ["bun", "run", "src/index.ts"]
