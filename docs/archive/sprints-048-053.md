# Archive — Sprints 048–053 (OCR + Kinh Dich + Migration)

---

## Sprint 048 — OCR + PDF Pipeline Fix (Done 2026-04-06)

4 tasks. OCR audit, pipeline fallback, Puppeteer semaphore. Task 295 deferred (superseded by 1034+1025).

| ID | Title | Status |
|----|-------|--------|
| 292 | OCR audit: pdf_extracted_text DDL, DPI 150→200, confidence guard, isOcrAvailable cache | Done |
| 293 | Pipeline fallback: fetchParseAndStoreBctc reads OCR cache when pdf-parse < 100 chars | Done |
| 294 | SSC Puppeteer semaphore: withBrowserLock(1) around defaultBrowserFactory | Done |
| 295 | SSC selector probe: verify live portal DOM, update selectors if drifted | Deferred |

---

## Sprint 049 — Kinh Dich Differentiation (Done 2026-04-06)

Hexagram library, resolver, nuclear/transformed hexagram computers, Ngu Hanh classifier, backtester, formatter.

---

## Sprint 050 — Close the Cycle: Kinh Dich Goes Live + /ask Command (Done 2026-04-07)

Kinh Dich reading integration, formatter, scheduler wiring. /ask command pipeline.

---

## Sprint 051 — 3-Channel Telegram Migration (Done 2026-04-07)

Migrated from 2 channels to 3: MARKET (user alerts), WORK (dev status), BUG (actionable problems). Deleted legacy aliases.

---

## Sprint 053 — Shipped 2026-04-07

Additional feature work and polish.
