# Kinh Dich Service — Go (reboot from TS/Bun)
# Port 5005
# CGO_ENABLED=0 — pure-Go build (modernc.org/sqlite, no mattn/go-sqlite3)

# ── Stage 1: Builder ──
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Copy go.mod and go.sum first for better layer caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build with CGO disabled (pure-Go, no C dependencies)
ENV CGO_ENABLED=0 GOOS=linux GOARCH=amd64
RUN go build -o /app/server ./cmd/server

# ── Stage 2: Runtime ──
FROM alpine:3.20

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/server /app/server

# Copy API spec for reference (7 endpoints, same HTTP contract)
COPY --from=builder /app/api /app/api

EXPOSE 5005
ENV PORT=5005

ARG GIT_SHA=unknown
LABEL vn.market.git_sha=$GIT_SHA

CMD ["/app/server"]
