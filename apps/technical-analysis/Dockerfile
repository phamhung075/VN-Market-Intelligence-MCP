# Technical Analysis Service — Bun/TypeScript
# Port 5003

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
COPY --from=builder /app/composition-root.ts ./
COPY package.json tsconfig.json ./

EXPOSE 5003
ENV PORT=5003

CMD ["bun", "run", "composition-root.ts"]
