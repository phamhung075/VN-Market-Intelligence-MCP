# ── VN Market Intelligence MCP Server ─────────────────────────────────────
# Runtime: Bun (oven/bun:1.3.11-slim)
# Base: Debian slim for native module support (better-sqlite3, LanceDB)
# ─────────────────────────────────────────────────────────────────────────────

FROM oven/bun:1.3.11-debian AS base
WORKDIR /app

# ── Install system dependencies ───────────────────────────────────────────
# tesseract-ocr: for OCR fallback in BCTC PDF extraction
# python3/pip: for LanceDB native extensions (build-time only)
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-vie \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ── Install Node dependencies ─────────────────────────────────────────────
COPY package.json bun.lock* ./
# Use --frozen-lockfile to ensure reproducible builds
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# ── Copy application source ───────────────────────────────────────────────
COPY src/ ./src/
COPY tsconfig.json ./
# bctc-schema.ts is referenced from src/infrastructure/db/
COPY bctc-schema.ts* ./

# ── Expose port ───────────────────────────────────────────────────────────
EXPOSE 3000

# ── Health check ──────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# ── Start ─────────────────────────────────────────────────────────────────
CMD ["bun", "run", "src/index.ts"]
