# Stock Price Service — Go multi-stage build
# CGO_ENABLED=1 required: mattn/go-sqlite3 (Tier3 SQLite cache, AC-7)
# Pattern: apps/api-gateway/Dockerfile adapted for CGO + sqlite3

# ── Stage 1: builder ─────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

# gcc + musl-dev are required for CGO (mattn/go-sqlite3)
RUN apk add --no-cache gcc musl-dev

WORKDIR /app

# Cache module downloads before copying source
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Build with CGO enabled; strip debug info for smaller binary
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-s -w" -o stock-price ./cmd/server/

# ── Stage 2: minimal runtime ─────────────────────────────────────────────────
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /app/stock-price /app/stock-price

# Data directory for SQLite files (market.db r/o, stock_price.db r/w)
# Actual DB files are mounted via Docker named volumes — do NOT bind-mount
# (memory: project_sqlite_corruption_fix.md — named volume prevents VirtioFS corruption)
RUN mkdir -p /app/data

EXPOSE 5000

ENV PORT=5000
ENV DB_PATH=/app/data/market.db
ENV STOCK_PRICE_DB_PATH=/app/data/stock_price.db

ARG GIT_SHA=unknown
LABEL vn.market.git_sha=$GIT_SHA

ENTRYPOINT ["/app/stock-price"]
