# Alert Engine Service — Go 1.22
# Multi-stage build — AC-1, NFR-1 (CGO required for mattn/go-sqlite3)
# Port 5006

# Stage 1: build
FROM golang:1.22-alpine AS builder

# CGO deps: gcc + musl-dev + sqlite-dev required by mattn/go-sqlite3
RUN apk add --no-cache gcc musl-dev sqlite-dev

WORKDIR /app

# Cache go module downloads before copying source (layer cache optimisation)
COPY go.mod go.sum ./
RUN go mod download

COPY cmd/ cmd/
COPY pkg/ pkg/

# CGO_ENABLED=1 required for mattn/go-sqlite3
RUN CGO_ENABLED=1 GOOS=linux go build -o /out/server ./cmd/server/

# Stage 2: minimal runtime
FROM alpine:3.20

RUN apk add --no-cache sqlite-libs ca-certificates tzdata

WORKDIR /app

COPY --from=builder /out/server /app/server

# Data directory for alert_engine.db (named volume mount point per NFR-2)
RUN mkdir -p /app/data

EXPOSE 5006

ARG GIT_SHA=unknown
LABEL vn.market.git_sha=$GIT_SHA

ENTRYPOINT ["/app/server"]
