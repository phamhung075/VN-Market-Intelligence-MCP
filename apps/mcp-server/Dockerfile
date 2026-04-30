# ── VN Market Intelligence MCP Server ─────────────────────────────────────
# Runtime: Bun (oven/bun:1-debian — glibc, required by @lancedb native binary)
# Build context: monorepo root (docker-compose.yml sets context: .)
# NOTE: tesseract, poppler, python3 are skipped — PDF OCR falls back to the
# pdf-extractor microservice. vnstockBridge will fail gracefully if python3
# is absent — other data sources remain active.
# Chromium is installed via apt (Debian trixie package) for puppeteer-core
# scraping of tradingeconomics.com (React SPA, requires real browser).
# ─────────────────────────────────────────────────────────────────────────────

FROM oven/bun:1-debian AS base
WORKDIR /app

# ── System dependencies — Chromium for Puppeteer ────────────────────────
# Debian trixie ships chromium 147.x at /usr/bin/chromium.
# DEBIAN_FRONTEND=noninteractive prevents apt from prompting during build.
# --no-install-recommends keeps image size minimal.
RUN apt-get update -qq && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      chromium \
      chromium-common \
      fonts-liberation \
      libxss1 \
    && rm -rf /var/lib/apt/lists/*

# ── Install Node dependencies ─────────────────────────────────────────────
# Copy from apps/mcp-server since build context is monorepo root
COPY apps/mcp-server/package.json apps/mcp-server/bun.lock* ./
RUN NODE_TLS_REJECT_UNAUTHORIZED=0 bun install --frozen-lockfile 2>/dev/null || NODE_TLS_REJECT_UNAUTHORIZED=0 bun install

# ── Copy application source ───────────────────────────────────────────────
COPY apps/mcp-server/src/ ./src/
COPY apps/mcp-server/tsconfig.json ./

# bctc-schema.ts lives at monorepo root, referenced as ../../../bctc-schema.js
# from src/infrastructure/db/ → resolves to /app/bctc-schema.ts in container
COPY bctc-schema.ts ./

# Runtime config (injected via volume mount in docker-compose, copied here as fallback)
COPY mcp.config.json ./

# ── Chromium path hint (matches default in tradingEconomicsChromium.ts) ──
# puppeteer-core uses PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH; the code falls back
# to /usr/bin/chromium if this env var is unset, so this is belt-and-suspenders.
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# ── Expose port ───────────────────────────────────────────────────────────
EXPOSE 3000

# ── Health check ──────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD bun -e "fetch('http://localhost:3000/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

# ── Start ─────────────────────────────────────────────────────────────────
CMD ["bun", "run", "src/index.ts"]
