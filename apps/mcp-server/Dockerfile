# ── VN Market Intelligence MCP Server ─────────────────────────────────────
# Runtime: Bun (oven/bun:1.3.11-slim)
# Build context: monorepo root (docker-compose.yml sets context: .)
# ─────────────────────────────────────────────────────────────────────────────

FROM oven/bun:1-debian AS base
WORKDIR /app

# ── Install system dependencies ───────────────────────────────────────────
# tesseract-ocr: for OCR fallback in BCTC PDF extraction (scanned PDFs)
# poppler-utils: provides pdftoppm required by pdfOcrWorker for page rendering
# python3 + python3-pip: required by vnstockBridge.ts which spawns python3 -c
#   to call the vnstock library (VCI backend for prices / financials / events)
# openssh-client: required by sshExec.ts (restart_vps_service MCP tool) which
#   calls ssh binary via Bun.spawn to run systemctl commands on the Vinahost VPS.
# chromium + chromium system deps: required by tradingEconomicsChromium.ts which
#   uses playwright-core to scrape the JS-rendered Trading Economics indicators page.
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-vie \
    poppler-utils \
    curl \
    python3 \
    python3-pip \
    openssh-client \
    chromium \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Set Playwright to use the system Chromium instead of downloading its own binary.
# This avoids a ~300 MB download during image build and uses the already-installed
# chromium package above.
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# ── Prepare SSH directory ──────────────────────────────────────────────────
# /root/.ssh must exist and be chmod 700 before ssh reads known_hosts.
# The entrypoint seeds known_hosts at container startup via ssh-keyscan.
RUN mkdir -p /root/.ssh && chmod 700 /root/.ssh

# ── Install Python dependencies ───────────────────────────────────────────
# vnstock: VN stock data via VCI backend (spawned by vnstockBridge.ts)
RUN pip3 install --no-cache-dir --break-system-packages vnstock

# ── Install Node dependencies ─────────────────────────────────────────────
# Copy from apps/mcp-server since build context is monorepo root
COPY apps/mcp-server/package.json apps/mcp-server/bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# ── Copy application source ───────────────────────────────────────────────
COPY apps/mcp-server/src/ ./src/
COPY apps/mcp-server/tsconfig.json ./

# bctc-schema.ts lives at monorepo root, referenced as ../../../bctc-schema.js
# from src/infrastructure/db/ → resolves to /app/bctc-schema.ts in container
COPY bctc-schema.ts ./

# Runtime config (injected via volume mount in docker-compose, copied here as fallback)
COPY mcp.config.json ./

# ── Expose port ───────────────────────────────────────────────────────────
EXPOSE 3000

# ── Health check ──────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# ── Entrypoint — seeds VPS host key into known_hosts at container startup ──
# Runs ssh-keyscan against VPS_HOST before handing off to CMD.
# Fails loudly (exit 1) if ssh-keyscan returns no lines — never silently skips.
COPY apps/mcp-server/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]

# ── Start ─────────────────────────────────────────────────────────────────
CMD ["bun", "run", "src/index.ts"]
