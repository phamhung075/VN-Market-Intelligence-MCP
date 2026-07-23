# ── VN Market Intelligence MCP Server ─────────────────────────────────────
# Runtime: Bun (glibc build, required by @lancedb and better-sqlite3 native binaries)
# Build context: monorepo root (docker-compose.yml sets context: .)
# python3 + vnstock are REQUIRED: vnstockBridge.ts spawns python3 subprocess
# to call the VCI backend for prices, financials, officers, and news.
# Chromium: installed via Ubuntu apt at runtime if chromium-browser snap is
# unavailable; puppeteer-core will gracefully fail for tradingeconomics.com
# scraping until a non-snap chromium is available in this environment.
#
# Multi-stage build:
#   Stage 1 (bun-src): extract bun glibc binary from oven/bun:1.3.13-debian
#   Stage 2 (base):    ubuntu:22.04 — system deps via archive.ubuntu.com
# ─────────────────────────────────────────────────────────────────────────────

FROM oven/bun:1.3.13-debian AS bun-src

FROM ubuntu:22.04 AS base
WORKDIR /app

# ── Copy bun binary (glibc build — compatible with Ubuntu 22.04) ─────────
COPY --from=bun-src /usr/local/bin/bun /usr/local/bin/bun

# ── System dependencies via Ubuntu apt (archive.ubuntu.com accessible) ───
# python3 + python3-pip: required by vnstockBridge.ts subprocess calls to VCI.
# build-essential + python3-dev: required for native modules (better-sqlite3, lancedb).
# fonts-liberation + libxss1: kept for Chromium runtime when available.
# NOTE: chromium-browser on Ubuntu 22.04 is a snap stub (no real binary).
# Puppeteer-core (tradingeconomics.com scraper) will fall back gracefully
# when PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH points to a missing binary.
# DEBIAN_FRONTEND=noninteractive prevents apt from prompting during build.
# --no-install-recommends keeps image size minimal.
# openssh-client: FIX-VPS-SSH-TRIGGER-FAIL-LOUD (2026-07-22) — sshExec.ts
# (infrastructure/vps/sshExec.ts) does Bun.spawn(["ssh", ...]) but no ssh binary
# was ever present in this image (confirmed empty `find / -name ssh -type f` in
# the cron audit). vpsServiceRestartHandler.ts already depends on this working;
# the 5 trigger_*_vps_fetch debug tools now also call the real sshExec() (see
# vpsDebugSshTrigger.ts) instead of only logging a would-be command.
RUN apt-get update -qq && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
      python3-dev \
      build-essential \
      fonts-liberation \
      libxss1 \
      curl \
      poppler-utils \
      tesseract-ocr \
      tesseract-ocr-vie \
      openssh-client \
    && rm -rf /var/lib/apt/lists/*

# ── Python packages — vnstock for VCI backend data ───────────────────────
RUN pip3 install --no-cache-dir --trusted-host pypi.org --trusted-host files.pythonhosted.org vnstock

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

# ── Chromium path hint ────────────────────────────────────────────────────
# Ubuntu 22.04 ships chromium-browser as a snap stub (/usr/bin/chromium-browser).
# The real Chromium binary is not available without snap in this environment.
# puppeteer-core falls back to this path; if missing, the tradingeconomics.com
# scraper will log an error but the MCP server continues to operate normally.
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# ── Expose port ───────────────────────────────────────────────────────────
EXPOSE 3000

# ── Health check ──────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD bun -e "fetch('http://localhost:3000/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

# ── Entrypoint — seeds VPS host key into known_hosts at container startup ──
# Runs ssh-keyscan against VPS_HOST before handing off to CMD. Non-fatal by
# design (FIX-MCP-DOCKERFILE-ENTRYPOINT-KNOWNHOSTS-REGRESSION, 2026-07-23):
# if ssh-keyscan fails or the VPS is unreachable, entrypoint.sh logs a WARN
# and starts the server anyway — see entrypoint.sh header for the full
# rationale. A VPS outage must never take down the entire MCP tool surface.
# Restored here after 6165aa3b4 ("rebase Dockerfiles from Debian to Ubuntu")
# silently dropped this whole block (task-1779c regression, no alarm raised).
COPY apps/mcp-server/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]

# ── Start ─────────────────────────────────────────────────────────────────
ARG GIT_SHA=unknown
LABEL vn.market.git_sha=$GIT_SHA

CMD ["bun", "run", "src/index.ts"]
