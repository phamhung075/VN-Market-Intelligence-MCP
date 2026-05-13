# Macro Indicators Service — Bun/TypeScript
# Port 5004

FROM oven/bun:1.3.13-alpine AS builder

WORKDIR /app
COPY package.json bun.lock* ./
RUN NODE_TLS_REJECT_UNAUTHORIZED=0 bun install --frozen-lockfile

COPY . .

# ── Runtime ──
FROM oven/bun:1.3.13-alpine

WORKDIR /app

# Install Python + curl_cffi, beautifulsoup4, lxml for investing.com adapter
RUN apk add --no-cache python3 py3-pip python3-dev gcc musl-dev libxml2-dev libxslt-dev && \
    pip install --break-system-packages --no-cache-dir requests curl_cffi beautifulsoup4 lxml

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY package.json tsconfig.json ./

EXPOSE 5004
ENV PORT=5004

CMD ["bun", "run", "src/index.ts"]
