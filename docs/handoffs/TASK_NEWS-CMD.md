# Handoff: NEWS-CMD-DEPLOY → QA

**Task:** NEWS-CMD-DEPLOY  
**Status:** ✓ OPS COMPLETE  
**Date:** 2026-05-27 22:31:30 CEST  
**Ops Session:** docs/agent-memory/notebooks/ops.md (2026-05-27 NEWS-CMD-DEPLOY)

---

## Summary

mcp-server container has been rebuilt and is now running the fresh `/news` Telegram command code (commits e49ad47a..34d299a2). The container is healthy, all 146 tools are registered, and the service is operational.

**Image details:**
- Image ID: sha256:21da3475a8bf069b30a1e2b9c0c1c699d21fa2dc7b4cc48b564f21d115078d6e
- Created: 2026-05-27T22:29:45+02:00 CEST (today, just now)
- Status: Running, healthy in 12 seconds

**Service details:**
- Port 3000 (MCP API): http://localhost:3000
- Port 4004 (MCP proxy): http://localhost:4004
- Health endpoint: http://localhost:3000/health → HTTP 200 OK

---

## What Was Done (OPS)

1. **Rebuild:** `docker compose build mcp-server` → 89.7s, successful
2. **Force-recreate:** `docker compose up -d --no-deps --force-recreate mcp-server`
3. **Verify:** Container healthy, logs clean, health endpoint 200
4. **Document:** Appended session to ops notebook

---

## Next Steps (QA)

**Test Plan for /news Command:**

1. **Command availability:** Verify `/news` command appears in Telegram bot command list
2. **Invocation:** Send `/news` command to bot (in VN Market telegram chat or test group)
3. **Expected behavior:**
   - Bot pulls full day's news articles (VN market sources)
   - Response sent in Vietnamese
   - Includes article headlines, timestamps, sources
4. **Edge cases:**
   - Test outside market hours (should return latest available)
   - Test with multiple rapid invocations (rate limit handling)
5. **Regression:** Verify other Telegram commands still work (/price, /macro, etc.)

**Exit Criteria (QA sign-off):**
- [ ] /news command receives user input and returns articles
- [ ] Response is in Vietnamese
- [ ] No error messages or timeouts
- [ ] Bot remains responsive for other commands

---

## Rollback (if needed)

If critical issues found:
```bash
docker compose down mcp-server
docker compose up -d mcp-server  # Will use previous image from 16h ago
```

---

## Files Modified (OPS)

- ✓ docs/agent-memory/notebooks/ops.md — session appended (staged for commit)

---

**Handoff prepared by:** ops  
**Verified by:** ops flow main.md  
**Timestamp:** 2026-05-27T20:31:30Z

---

## [QA] Review Record — NEWS-CMD-QA

**QA agent:** qa  
**Date:** 2026-05-27T20:50Z  
**Verdict:** APPROVED

---

### 1. Test Suite

| Suite | Pass | Fail | Notes |
|---|---|---|---|
| `214-telegram-commands.test.ts` (T-NEWS-1..8 + prior 214 tests) | 31 | 0 | All 8 T-NEWS scenarios pass |
| `1406c-webhook-handler.test.ts` (webhook handler) | 3 | 0 | Multi-message send loop confirmed |
| `215-telegram-webhook.test.ts` | 12 | 0 | Non-regression |
| **Full suite (mcp-server)** | **9873** | **0** | Bun v1.3.13 C++ crash post-run is a known Bun runtime bug, NOT a test failure; all 9873 tests ran before crash |
| `bun tsc --noEmit` | 0 errors | — | Clean |

Floor check: 9873 >= 9408 (NFR-5 floor). PASS.

---

### 2. T-NEWS-1..8 Individual Results

| Test ID | Description | Result |
|---|---|---|
| T-NEWS-1 | 3 today-rows — all 3 headlines in output | PASS |
| T-NEWS-2 | `positive` → `tích cực`; no `positive`, no `0.85` | PASS |
| T-NEWS-3 | Empty table → `Chưa có tin hôm nay.` (Vietnamese fallback) | PASS |
| T-NEWS-4 | `/news 2` with 5 rows → exactly 2 story blocks | PASS |
| T-NEWS-5 | 20 rows × 230-char summaries — `texts[]` chunks each <= 4096 | PASS |
| T-NEWS-6 | `source_title = NULL` — no throw, non-empty output | PASS |
| T-NEWS-7 | `summary = NULL` — no throw, non-empty output | PASS |
| T-NEWS-8 | No today-rows, old fallback rows exist — output contains `gần đây` header | PASS |

---

### 3. DDD Compliance

**PASS.**

- `telegramCommands.ts` (infrastructure): imports `VN_OFFSET_MS` from `domain/services/timeConstants.js` only. No import of `assembleEveningSummary` or any application-layer use-case. `midnightVietnamAsUtcInline()` is correctly inlined. No forbidden `from.*application` imports.
- `webhookHandler.ts` (interface): owns the Telegram send-loop (`result.texts ?? [result.text]` iterated sequentially). Imports `handleTelegramCommand` from infrastructure layer — correct direction.
- Implementation commit `25a92ca6` touches only `apps/mcp-server/` files + `docs/architecture/microservice/mcp-server/news-analysis.md`. NFR-3 (zone isolation) SATISFIED.

---

### 4. Security Scan

**PASS.**

- Zero `process.env` calls in modified files (`Bun.env` used correctly in `webhookHandler.ts`).
- Zero hardcoded credentials, tokens, or secrets in modified files.
- All SQL queries use parameterized `?` placeholders.
- No new cron jobs, no new push to delivery lane — NFR-2 confirmed.

---

### 5. Spec Conformance (6 FRs)

| FR | Status | Notes |
|---|---|---|
| FR-1 (`case "/news":` + `handleNews` + `HELP_TEXT`) | PASS | Switch branch at line 633, `HELP_TEXT` includes `/news [N] Tin tức hôm nay (mặc định 20 bài)` |
| FR-2 (today-query with midnight-GMT+7, `impact_score DESC, created_at DESC`, fallback) | PASS | `midnightVietnamAsUtcInline()` replicates assembleEveningSummary arithmetic; primary + fallback queries correct |
| FR-3 (`/news N` arg parsing, clamp `[1,50]`, default 20) | PASS | Non-numeric and negative/zero treated as default |
| FR-4 (plain Vietnamese, sentiment-as-words, `impact_score` hidden, `source_url` hidden) | PASS | `sentimentLabel()` maps all variants; `impact_score` never in output; `source_url` not selected |
| FR-5 (empty-DB fallback = `Chưa có tin hôm nay.`) | PASS | Both DB-error and zero-rows paths return this string |
| FR-6 (4096-char chunking, story-boundary splits, no silent truncation) | PASS | `chunkStories()` splits at story boundaries; `texts[]` returned; webhookHandler iterates sequentially |

---

### 6. Live End-to-End Check

**RUN and CONFIRMED.**

- Container: `vn-market-intelligence-mcp-mcp-server-1` healthy, port 3000, built 2026-05-27T22:29Z.
- `GET /health` → `{"status":"ok","toolCount":146}` — 146 tools registered, service live.
- `POST /webhook` with `{"message":{"text":"/news","chat":{"id":12345}}}` → HTTP 200 "ok". Telegram send attempted; 400 from Telegram API is expected (fake chatId `12345` is not a real group — bot has no token for test env). Handler did NOT crash or return an error.
- Direct in-container invocation (`bun --eval` + `handleTelegramCommand('/news 3', db)`):
  - `texts` count: 1 (3 stories fit in one chunk for `/news 3`)
  - First chunk starts: `Tin tức hôm nay (3 bài):\n\n[Vietnamese headline]...`
  - Plain Vietnamese framing. Sentiment rendered as `Cảm xúc: trung tính`.
  - Live `rag_analyses`: 4458 total rows, 174 from today (2026-05-27).
- Note: Live `summary` column contains HTML fragments (`<a href="..."><img ...>`) from the news ingestion pipeline. This is a pre-existing data quality issue in ingested news (RSS/scraper preserves HTML). The `/news` handler renders `summary` as-is per spec § 8 ("render stored source_title and summary as-is"). This is NOT a handler defect — the spec explicitly defers HTML stripping to the ingestion layer. Low-priority cleanup for a future sprint.

---

### 7. Verdict

**APPROVED.** All tests green, tsc clean, DDD + security pass, spec conformance across all 6 FRs confirmed, live check run with real data.

**Non-blocking observation (no merge block):** Live `summary` field contains HTML from ingestion — not readable in plain-text Telegram. Recommendation: news-fetch pipeline to strip HTML before storing in `summary`. Out of scope for this sprint per § 8 but worth logging as a follow-up.

---

**QA signed off:** qa  
**Timestamp:** 2026-05-27T20:50:00Z  
**NEXT:** po (NEWS-CMD-EXIT final sign-off)
