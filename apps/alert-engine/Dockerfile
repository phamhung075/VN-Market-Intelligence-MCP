# Alert Engine Service — Go 1.22
# Multi-stage build — AC-1, NFR-1 (CGO required for mattn/go-sqlite3)
# Port 5006

# Stage 1: build
FROM golang:1.22-alpine AS builder

# CGO deps: gcc + musl-dev required by mattn/go-sqlite3
RUN apk add --no-cache gcc musl-dev

WORKDIR /app

# Cache go module downloads before copying source (layer cache optimisation)
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO_ENABLED=1 required for mattn/go-sqlite3
RUN CGO_ENABLED=1 GOOS=linux go build -o alert-engine ./cmd/server/

# Stage 2: minimal runtime
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /app/alert-engine /app/alert-engine

# Data directory for alert_engine.db (named volume mount point per NFR-2)
RUN mkdir -p /app/data

EXPOSE 5006

ENTRYPOINT ["/app/alert-engine"]
