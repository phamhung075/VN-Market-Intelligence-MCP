# syntax=docker/dockerfile:1.4
# Multi-stage: deps → build → runtime
# Port: 3001 | API_GATEWAY_URL default: http://api-gateway:4000

# ──────────────────────────────────────────────────────────────────────────────
# Stage 1: deps — install production + dev dependencies
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2: build — compile Remix + Vite bundle
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
RUN npm run build

# ──────────────────────────────────────────────────────────────────────────────
# Stage 3: runtime — minimal production image
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV API_GATEWAY_URL=http://api-gateway:4000

# Copy only production node_modules and built artefacts
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json

EXPOSE 3001

ARG GIT_SHA=unknown
LABEL vn.market.git_sha=$GIT_SHA

CMD ["node_modules/.bin/remix-serve", "./build/server/index.js"]
