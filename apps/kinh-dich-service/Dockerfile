# Kinh Dich Service — Bun/TypeScript
# Port 5005

FROM oven/bun:1-alpine AS builder

WORKDIR /app
COPY package.json bun.lock* ./
RUN NODE_TLS_REJECT_UNAUTHORIZED=0 bun install --frozen-lockfile

COPY . .

# ── Runtime ──
FROM oven/bun:1-alpine

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY package.json tsconfig.json ./

EXPOSE 5005
ENV PORT=5005

CMD ["bun", "run", "src/index.ts"]
