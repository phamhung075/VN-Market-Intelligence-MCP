# Macro Indicators Service — Go multi-stage build
# No CGO required: pure-Go SQLite via modernc.org/sqlite
# Port 5004

# Stage 1: build
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Cache module downloads before copying source
COPY go.mod go.sum ./
RUN go mod download

COPY cmd/ cmd/
COPY pkg/ pkg/
COPY api/ api/

RUN CGO_ENABLED=0 GOOS=linux go build -o /out/server ./cmd/server/

# Stage 2: minimal runtime
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /out/server /app/server
COPY api/ /app/api/

RUN mkdir -p /app/data

EXPOSE 5004

ENV PORT=5004

ENTRYPOINT ["/app/server"]
