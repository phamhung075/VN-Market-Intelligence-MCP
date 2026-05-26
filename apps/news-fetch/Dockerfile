# News Fetch Service — Multi-stage Dockerfile
# Stage 1: Bun builder (Alpine, lightweight dep install)
# Stage 2: Playwright Jammy runtime (glibc required for Chromium)
# Port: 5008

# ── Stage 1: dependency builder ───────────────────────────────────────────────
FROM oven/bun:1.3.13-alpine AS bun-builder

WORKDIR /app
COPY package.json bun.lock* ./
RUN NODE_TLS_REJECT_UNAUTHORIZED=0 bun install --frozen-lockfile

COPY . .

# ── Stage 2: Playwright runtime (Ubuntu 22.04 Jammy — glibc for Chromium) ────
# Updated to v1.60.0 to match npm playwright@1.60.0 from bun.lock
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

# Install unzip + curl required for Bun install
RUN apt-get update && apt-get install -y unzip curl && rm -rf /var/lib/apt/lists/*

# Install Bun in the Jammy runtime (no Alpine apk available here)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Playwright browsers are pre-installed at /ms-playwright by the base image.
# Do NOT run `playwright install` — binaries already present.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Copy built artifacts from builder stage
COPY --from=bun-builder /app/node_modules ./node_modules
COPY --from=bun-builder /app/src ./src
COPY --from=bun-builder /app/composition-root.ts ./
COPY package.json tsconfig.json ./

EXPOSE 5008
ENV PORT=5008

ARG GIT_SHA=unknown
LABEL vn.market.git_sha=$GIT_SHA

CMD ["bun", "run", "src/index.ts"]
