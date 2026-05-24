# PO Notebook

**Cycle:** Sprint PDF-INSPECT scoped + dispatched — served PDF/extracted-text side-by-side inspector.
**Last update:** 2026-05-24T17:19:04Z
**Status:** OPEN. Architecture forks resolved via PO rulings; chain dispatched architect→dev-pdf-extractor→qa→PO. WIP=1.

---

## 2026-05-24T17:19Z — Sprint PDF-INSPECT: side-by-side PDF / extracted-text inspector

User feature request (via main terminal): pick a PDF from a list → see ORIGINAL PDF left / EXTRACTED text right, to eyeball BCTC extraction quality (spot decimal-shift bugs like VNM net_profit=0.000051). POST-PILOT feature — pdf-extractor SCALE pilot stays DONE 12/12 frozen; NOT a reopen.

GROUNDED REALITY (archaeology this cycle):
- Delivery FORK RESOLVED = served FastAPI viewer (port 5001), NOT file://. docker-compose mounts `market_data:/app/data` → source PDFs (/app/data/pdfs/) + metadata DB (/app/data/pdf_extractor.db) + extraction JSONs (/app/data/extractions/{id}.json) all in ONE named volume a file:// page can't reach. App already serves (main.py, CORS *, register_routes in interface/handlers.py).
- RIGHT pane default = this service's own extraction (text_content + tables[] in extractions/{id}.json). This service OWNS extraction.
- THE real unknown for architect (don't let dev guess): pdf_documents.url stores VPS source URL, NOT local /app/data/pdfs path. doc-id→on-disk-PDF mapping for LEFT pane is unresolved — architect grounds in real volume layout (opt a/b/c in goal reality #3).

PO RULINGS: R1 served-not-file://. R2 dev-frontend NOT in scope (dev-pdf-extractor builds minimal viewer self). R3 read-only inspector. R4 single zone default; ONE read-only SELECT-only mcp-server route ONLY if architect proves parsed fields live exclusively in BCTC DB (then zone=multi). R5 QA verifies USER's real served-URL path (L9). R6 pilot + sandbox surface frozen.
Security-Clause distinction made explicit: viewer's /app/data read = by-design app-process access, NOT sandbox zero-cred violation.

OUTPUTS: docs/SPRINT_GOAL.md (rewritten), docs/handoffs/TASK_PDF-INSPECT.md (PI-1..PI-EXIT full ACs), docs/TASKS.md (PDF-INSPECT block, 4 tasks), docs/signals/po-pdf-inspect-kickoff-20260524T171904Z.json.

NEXT: main terminal spawns architect PI-1 (design only) → dev-pdf-extractor PI-2 → qa PI-3 (L9 real-path) → PO PI-EXIT. Acceptance: user opens served viewer → list → select → PDF-left/text-right side-by-side.

## Carry-over
- PDF-INSPECT: WIP=1 sequential, zone apps/pdf-extractor/. Architect MUST resolve doc-id→PDF-file mapping (the real unknown). QA gate is L9 (served-URL-in-browser, not test-convenience server). Sandbox dashboard surface + pilot-status frozen.
- pdf-extractor pilot: DONE 12/12 verdict=scale, dashboard green on double-click (L9 lesson). STAYS frozen.
- rag-service (concurrent cron): REOPENED 10/12 @b43c3d97; dev-rag-service P3-A first. Re-close G6+G8+G9 + PO atomic 12/12; G9 needs USER verbal.
- news-fetch NF-LD (concurrent): architect→dev→qa→PO. Same served-read-route + new-panel pattern as PDF-INSPECT (precedent). pilot-status-news-fetch frozen 12/12; endpoint SELECT-only.
- kinh-dich KD-QREF (concurrent): architect KD-QREF-1→dev-kinh-dich→qa→PO. Go SSOT, dash-check.mjs exit-0, sandbox-traces.js frozen.
- LESSON (fleet): notebook + git index shared across crons — tight one-shot stage+foreign-path-guard+commit; race may steal slot, re-commit (never rewrite). commit-mutex enum defect: claim under 'sprint-task' kind.
