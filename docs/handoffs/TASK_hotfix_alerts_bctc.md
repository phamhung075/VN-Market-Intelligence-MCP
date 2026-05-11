# Handoff: Hotfix — Alert Truncation + PDF Extractor Docker Networking

**Date:** 2026-04-29
**Branch:** main
**Commit:** c34ab25f

---

## What was done

### Fix 1 — Alert message truncation (100 → 400 graphemes)

File: `apps/mcp-server/src/infrastructure/notifiers/telegramMessageFactory.ts`
- `formatAlertMessage()` limit raised from 100 to 400 graphemes.
- JSDoc comment updated to match.
- `morningBriefingJob.ts` line 133 is unaffected — it calls `formatAlertMessage()` which now uses the new limit automatically.

### Fix 2 — PDF Extractor Docker networking bug

File: `docker-compose.yml`
- Added `PDF_EXTRACTOR_URL=http://pdf-extractor:5001` to the `mcp-server` environment block.
- The mcp-server container was previously falling through to the `localhost:5001` default (hardcoded fallback), which is unreachable inside the Docker network. The correct Docker service hostname is `pdf-extractor`.

File: `apps/mcp-server/src/infrastructure/fetchers/pdfExtractorClient.ts`
- `process.env.PDF_EXTRACTOR_URL` → `Bun.env.PDF_EXTRACTOR_URL` (dev-standards: always `Bun.env`).
- JSDoc updated to document Docker vs local-dev resolution.

---

## Not changed

- `apps/mcp-server/src/infrastructure/microservices/clients.ts` — already uses `Bun.env.PDF_EXTRACTOR_URL` correctly; will pick up the new docker-compose env var automatically.
- `apps/mcp-server/src/index.ts` — also reads `Bun.env.PDF_EXTRACTOR_URL`; no change needed.
- Existing test `1323-pdf-extractor-client.test.ts` — asserts the constant is a non-empty string, not the literal `localhost:5001`; no change needed.

---

## QA checklist

- [x] `bun test` passes — 7989 pass, 25 fail (all pre-existing, unrelated to hotfix)
- [x] `formatAlertMessage` tests updated 100→400 graphemes — 26/26 pass
- [x] `bun tsc --noEmit` — 0 errors in production source files; 4 pre-existing errors in test files only
- [x] DDD scan clean — no domain←infrastructure imports in hotfix files
- [x] Security scan clean — no `process.env`, no hardcoded secrets in hotfix files
- [x] `Bun.env.PDF_EXTRACTOR_URL` confirmed in `pdfExtractorClient.ts` line 20
- [x] `docker-compose.yml` — `PDF_EXTRACTOR_URL=http://pdf-extractor:5001` present in mcp-server env block
- [x] `telegramMessageFactory.ts` — `formatAlertMessage` calls `smartTruncate(msg, 400)` (was 100)
- [x] Merged to main and pushed — commit 65fd960e (QA fix) on top of c34ab25f (hotfix)
- [ ] Docker: `docker-compose up mcp-server pdf-extractor` — runtime verification (ops to confirm)
- [ ] Morning briefing Telegram message shows full alert text (not cut at ~100 chars) — ops to verify post-restart

## QA outcome: APPROVED

Merged to main. Pushed to origin. Ops must rebuild Docker containers to pick up `PDF_EXTRACTOR_URL`.
