# Multi-stage Go build — AC-1, AC-7 (log/slog), no CGO required
# Stage 1: build
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Cache go module downloads before copying source (R-G3 mitigation)
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o gateway ./cmd/server/

# Stage 2: minimal runtime
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /app/gateway /app/gateway

EXPOSE 4000

ARG GIT_SHA=unknown
LABEL vn.market.git_sha=$GIT_SHA

ENTRYPOINT ["/app/gateway"]
