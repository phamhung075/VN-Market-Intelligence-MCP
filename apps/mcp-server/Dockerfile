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
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-vie \
    poppler-utils \
    curl \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

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

# ── Start ─────────────────────────────────────────────────────────────────
CMD ["bun", "run", "src/index.ts"]
