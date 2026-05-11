# Microservice: pdf-extractor

**Language:** Python / FastAPI
**Port:** 5001 (external + internal)
**Role:** BCTC (financial statement) PDF parsing. Receives PDF files from Vinahost VPS via POST `/api/push-bctc-pdf`, extracts financial data using pdfplumber + Tesseract OCR, stores results in `pdf_extractor.db`, and sends structured data back to mcp-server.

---

## DDD Layers

| Layer | Path | Responsibility |
|-------|------|----------------|
| domain | Extraction logic | Balance sheet extractor, income statement extractor, cash flow extractor, ratio computer, bctcValidator |
| application | Use cases | parseBctcReport, fetchParseAndStoreBctc |
| infrastructure | `pdf_extractor.db` (sole writer), pdfplumber, Tesseract OCR worker, TLS bypass for HNX/UPCOM PDFs | PDF download, OCR fallback when text layer absent |
| interface | FastAPI endpoints | POST /api/push-bctc-pdf, GET /api/bctc-fetch-queue |

---

## Tool Surface

PDF-related MCP tools live in mcp-server, not here. See `docs/architecture/microservice/mcp-server/financial-reports.md` for tools: `get_bctc_full`, `list_stored_pdfs`, `trigger_bctc_vps_fetch`, `get_earnings_calendar`, `compare_financials`.

---

## Upstream Dependencies (data in)

| Source | How | Cadence |
|--------|-----|---------|
| Vinahost VPS `vn-bctc-fetch.service` | POST /api/push-bctc-pdf (multipart) | Every 6h |
| VPS fetch queue | GET /api/bctc-fetch-queue (VPS pulls pending items from `bctc_vps_queue` table) | Per VPS loop |

---

## Downstream Dependencies (calls out)

| Service | Port | What for |
|---------|------|----------|
| mcp-server | 3000 | Push parsed financial report data |

---

## Database Write Authority

`pdf_extractor.db` — sole writer. Isolated, not shared.

`bctc_vps_queue` table lives in `market.db` (mcp-server owns it) — pdf-extractor reads queue via GET, does not write to market.db directly.

---

## Confidence Thresholds

| Confidence | Action |
|-----------|--------|
| = 0 | Skip insert |
| < 0.2 | Insert with `low_confidence=true` flag + WORK channel alert |
| >= 0.2 | Normal insert |

Source: `.claude/knowledge/bctc-extraction-runbook.md` + MEMORY reference `reference_low_confidence_handling.md`

---

## Known Invariants

1. Max PDF size: 50 MB per push.
2. On successful push, `bctc_vps_queue` row status → `done`.
3. TLS bypass required for HNX/UPCOM PDF downloads (self-signed cert).
4. Tesseract OCR is the fallback when pdfplumber finds no text layer (scanned PDFs).
5. VPS pipeline is PULL-based from VPS perspective: VPS pulls queue → downloads PDFs → pushes to MCP. MCP never initiates BCTC downloads.
6. `disableSscPolling` flag in config disables direct Puppeteer SSC polling (default: disabled).
7. Dead-end: SSH self-heal inside Bun (commit c151376, reverted). Never SSH from within the service.
