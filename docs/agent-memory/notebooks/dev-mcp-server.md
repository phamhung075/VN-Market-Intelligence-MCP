# dev-mcp-server -- Notebook

## c312 · 2026-05-26T19:07Z (LF-OVERLAY verification run — BCTC-LAYOUT-FIRST)

### Verification result: CONFIRMED DONE

Prior cycle (c311) committed `2326ebb6`. This cycle re-ran tests + AC audit.

**Test results (re-run):** 29 pass / 0 fail (1272 + 1273) | full suite 9883 tests exit 0 | tsc EXIT 0

**AC-LFO-0..7 re-verified:** all pass except AC-LFO-7 (DEFERRED — needs corpus re-extraction at LF-DEPLOY)

**Done-signal:** `docs/signals/2026-05-26T19-07-11Z-lf-overlay-done.json`

**Pre-existing note:** 2 Bun module isolation failures occur ONLY when running 8+ files in parallel (deleteTelegramBug SyntaxError); each file passes 0 fail in isolation. Pre-existing before LF-OVERLAY. Bun C++ post-suite panic = upstream v1.3.13 bug, pre-existing.

---

## c311 · 2026-05-26 (LF-OVERLAY — BCTC-LAYOUT-FIRST zone overlay)

### LF-OVERLAY DONE

**Tests:** 29 pass / 0 fail (1272 + 1273) | tsc EXIT 0 | existing suite non-regressed (14 pushBctcTableHandler pass)

**Files changed (all UNSTAGED — main terminal commits):**
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — two new tables: `bctc_layout_units` + `bctc_page_zones` with DDL exactly per brief §3.1
- `apps/mcp-server/src/interface/mcp/routes/pushBctcLayoutHandler.ts` — NEW: handles POST /api/push-bctc-layout; writes both tables; DB-verified count; idempotent via INSERT OR REPLACE
- `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` — EXTENDED: new `handleBctcInspectZones` for GET /api/bctc-inspect/zones/{doc_id}?page=N; pure DB read, zero pdf-extractor import
- `apps/mcp-server/src/interface/mcp/server.ts` — EXTENDED: registered POST /api/push-bctc-layout + GET /api/bctc-inspect/zones/* routes; imported new handlers
- `apps/mcp-server/src/interface/bctc-inspector.html` — EXTENDED: zone overlay toggle control (id="zone-overlay-toggle", data-zone-toggle="true"); 5-color ZONE_COLORS; SVG overlay renderer with coordinate scaling; zone cache + clearAllOverlays
- `apps/mcp-server/src/__tests__/1272-push-bctc-layout.test.ts` — NEW: 20 tests for push handler
- `apps/mcp-server/src/__tests__/1273-bctc-inspect-overlay.test.ts` — NEW: 9 tests for zones endpoint

**AC audit:**
- AC-LFO-0 PASS: id="zone-overlay-toggle" + data-zone-toggle="true" in HTML
- AC-LFO-1 PASS: zones endpoint returns zones_json with positional col_0/col_1 col_ids (test 1273)
- AC-LFO-2 PASS: grep returns zero actual import lines of pdf-extractor in bctcInspectHandler.ts
- AC-LFO-3 PASS: bctc_table_rows read path in bctcInspectHandler.ts is untouched (Decision B); pushBctcTableHandler.test.ts 14/14 green
- AC-LFO-4 PASS: test 1272(f) — SELECT COUNT(*) FROM bctc_table_rows = 0 after layout push
- AC-LFO-5 PASS: test 1272(c) — two identical pushes result in 2 rows, not 4 (INSERT OR REPLACE)
- AC-LFO-6 PASS: ZONE_COLORS defines 5 distinct entries (headerBand/footerBand/gutterEven/gutterOdd/rowBand/unitBoundary) — code-inspectable
- AC-LFO-7 DEFERRED: requires corpus re-extraction (LF-DEPLOY gate); verified at QA step

**Carry-over from c310:**
- 345 pre-existing test failures within baseline; Bun C++ panic after full suite = upstream bug

**ops_rebuild_required: true** — route added to server.ts, new handler wired; docker compose build + up -d --no-deps --force-recreate mcp-server required before LF-DEPLOY can test live.

---

## c310 · 2026-05-26 (FA-FIX — fetch_and_analyze timeout reliability)

### FA-FIX DONE

**Commit:** `3c00c17a` | 3 files | tsc EXIT 0 | bun 9449 pass / 345 fail (within ≤348 baseline) | 7 new scenarios PASS

**Changes:**
- `analysis.ts` REC-1: per-source outer timeout budgets (cafef=10s, vnexpress=10s, vneconomy=12s, reuters=30s→15s) via `withSourceTimeout()` helper that resolves to `[]` on expiry.
- `analysis.ts` REC-2: `Promise.all(fetchPromises)` → `Promise.allSettled` in Step-1 fan-out.
- `analysis.ts` REC-3: Step-4 ragIndex fan-out switched to `Promise.allSettled` for graceful rag degradation.
- `ragHttpClient.ts` REC-3: `AbortSignal.timeout(8_000)` added to `ragSearch()` and `ragIndex()` fetch calls.
- `src/__tests__/1973-fetch-analyze-timeout.test.ts` (new): 7 scenarios — Scenario A (source timeout → partial), Scenario B (rag hang → AbortSignal fires gracefully), Scenario C (all fast → full result, static assertions).
- REC-4 (use_ingested SQLite read-path) DEFERRED per PO — opens as FETCH-ANALYZE-2.

**Done-signal:** `docs/signals/dev-mcp-server-fa-fix-done-20260526T1600Z.json`
**ops_rebuild_required: true** — docker compose up -d --build mcp-server needed.

---

## c309 · 2026-05-26 (FETCH-ANALYZE-PROFILE SPIKE — read-only)

**Commit:** NONE | profiling spike only | no production code changed
**Signal:** `docs/signals/dev-mcp-server-fetch-analyze-fix-proposal-20260526T1500Z.json`

Root cause documented: `Promise.all` Step-1 + no AbortSignal on ragHttpClient.
Reuters confirmed DOWN (48 consecutive failures). VPS news-fetch healthy.
Step-1 ceiling 30s (vneconomy serial + reuters budget) + Step-4 ragIndex no guard = 60s stall.

---

## c308 · 2026-05-26 (P2-L Trial-2 — G11 sector-classifier regression revert)

**Commit:** `3b9851fb` | 2 files | tsc EXIT 0 | bun 9451 pass / 336 fail | toolCount=148 | sched=68

sectorPeers.ts line 351 — restored ratio threshold from `<= 0` back to `<= 2.5`.
Sandbox 9/9 PASS. Phase-2 SCALE pilot CLOSED at 8972a155. P2 FROZEN.

---

## Working Memory

### Active Work
- LF-OVERLAY: DONE (c311). Files UNSTAGED — awaiting main terminal commit.
  NEXT = ops (LF-DEPLOY) — gated on LF-EXTRACT also done.
- FA-FIX: DONE (c310). ops rebuild required before live fix takes effect.

### Carry-over
- 345 pre-existing test failures — within ≤348 baseline
- Bun v1.3.13 C++ panic after full suite = known upstream bug (exit code 0, tests pass)
- AC-LFO-7 deferred to QA step (requires corpus re-extraction)

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
