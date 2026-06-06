# dev-mcp-server -- Notebook

## c375 · 2026-06-06T12:45Z (FIX-REFINE-IDEM-LOCK-ISO) — COMMITTED 368b7bad

**Task:** FIX-REFINE-IDEM-LOCK-ISO (S) — isolate coordination-store lock in AR-refined-units-idempotency tests.

**Root cause:** `claimTask` used `owner_agent:"refine-orchestrator"` but `releaseTask` was called with `pid-${process.pid}` as `owner_agent` (positional mismatch) → DELETE matched 0 rows → lock zombied until TTL → all same-taskId subsequent calls skipped → 4 scenarios RED. Cross-scenario bleed: `_coordDb` singleton never reset between `it` blocks.

**Fix (2 files):**
- `AR-refined-units-idempotency.test.ts`: added `beforeEach` → `_resetCoordinationDbState()` + `ensureCoordinationTable(db)` + `_injectCoordinationDb(db)` + `afterEach` reset/close; imported 3 seam functions.
- `bctcRefineJob.ts` L512: `releaseTask(taskId, \`pid-${process.pid}\`)` → `releaseTask(taskId, "refine-orchestrator")` (owner_agent must match the claim).

**Results:** 9→13/13 GREEN; task-lock-coordination-store 27/27 still GREEN; tsc 0 errors; no coordination.db on disk (no leak path).

Note: bctcRefineJob.ts touched (production zombie-release fix); router to decide on container rebuild.

Zone health: 13/13 idempotency GREEN, 27/27 lock-store GREEN, tsc clean | HEALTHY

---

## c374 · 2026-06-05T23:46Z (ARCH-ORCH-F2) — COMMITTED da37602f

**Task:** ARCH-ORCH-F2 — journalStore.ts + orchestrationHandler.ts decisions extension (ORCH-DASH-DECISION-DRILLDOWN sprint).

**Implemented:**
- `apps/mcp-server/src/infrastructure/journalStore.ts`: StepDto/DecisionsDto types, parseJournalFile (pure, CRLF-safe, CAP-REACHED guard, task-id routing), buildDecisionsDto, getDecisionsForSprints with module-level mtime cache, _clearCacheForTesting export.
- Extended `orchestrationHandler.ts`: decisions: DecisionsDto added to OrchestrationDto; buildOrchestrationDto now accepts optional decisionsDir; sprint-ID union from sprint_goal.entries (all statuses) + active_sprints; zero-value on no-files (AC-F2-8).
- Created `1978-journal-store.test.ts` (26 tests, T1–T6 + real fixture + CRLF).
- Created `1979-orchestration-decisions.test.ts` (13 tests, T1–T3).
- Extended `1977-orchestration-endpoint.test.ts` (+1 T1h assertion).

**Results:** tsc 0 errors. 59 tests green (1977+1978+1979), 0 fail. Live curl: decisions.by_task[ARCH-ORCH-F1] (agent-father-S1) + sprint_bucket[ORCH-DASH-DECISION-DRILLDOWN] (9 entries) populated from real fixture. Container rebuilt.

Zone health: F2 DONE, decisions field live, ARCH-ORCH-F2 → REVIEW | HEALTHY

---

## c373 · 2026-06-05T21:50Z (FIX-CTG-PDF-MISLINK) — COMMITTED 77092007

**Task:** FIX-CTG-PDF-MISLINK (FIX, P1) — CTG 2026-Q1 row 69fa303f linked to 2-page cover letter CTG_2026_Q1.pdf instead of 62-page consolidated hop-nhat PDF.

**Root causes (2):**
1. backfillBctcPdfPaths treated CTG_2026_Q1.pdf (cover letter) and hop-nhat consolidated as equally valid candidates → old code linked whichever came first.
2. extractQuarter() had no Roman numeral support — real consolidated "Quy I.2026" parsed to quarter=null → token match failed entirely.
3. Backfill only processes `WHERE pdf_path IS NULL` → mislinked non-NULL rows never re-checked.

**Fixes:**
- `isCoverLetterFilename()`: exported; detects CV_CBTT marker + short 3-seg TICKER_YEAR_Qn.pdf form.
- NULL pass: filter cover letters when consolidated exists; sole candidate always links; 2+ consolidated → ambiguous.
- Heal pass: rows with pdf_path pointing at a cover-letter file re-linked when consolidated arrives (new `healed` field in BackfillResult).
- `extractQuarter()` Pass 1d: QUY + Roman numeral I/II/III/IV — real CTG consolidated now parses correctly.

**Tests:** 44 pass / 0 fail (FIX-CTG-PDF-MISLINK.test.ts AC-1..12 + PI3-bctc-inspect-reopen2.test.ts). tsc clean. AC-R7 updated (was "ambiguous", is now "consolidated wins" with cover-letter filter).

**Files (3):** backfillBctcPdfPaths.ts (+178L), FIX-CTG-PDF-MISLINK.test.ts (new, +385L), PI3-bctc-inspect-reopen2.test.ts (AC-R7 updated).

Zone health: backfill cover-letter gap closed, heal pass added, Roman numeral quarter fix, tsc clean | REBUILD REQUIRED

---

## c372 · 2026-06-05T16:09Z (FIX-CTG-3 STEP-C — extraction stuck-fetching) — COMMITTED d29de43d

**Task:** FIX-CTG-3 STEP-C (FIX, P1) — CTG extraction stuck 14 cycles. get_bctc_full(CTG) returns 'Chưa có dữ liệu BCTC' despite 6MB hop-nhat PDF on disk.

**Root cause (confirmed):** POST /api/push-bctc-pdf saves PDF to disk and sets status='fetching'. setImmediate→triggerPushBctcExtraction calls extractViaService(hsx.vn URL). The pdf-extractor service cannot reach geo-blocked hsx.vn → null → pipeline skipped → financial_reports empty. No scheduled job queries status='fetching'. Row stranded until next daily bctcReparseJob (02:30 UTC).

**FIX-1 (pushBctcExtraction.ts):** Three-tier local-file fallback. Tier 1: remote URL (existing). Tier 2: file://filePath (NEW — reads local disk, not geo-blocked). Tier 3: extractText(readFile) direct pdf-parse (NEW). Pipeline runs iff any tier yields ≥100 chars.

**FIX-2 (schema-financial-reports.ts):** recoverStuckFetchingQueue() startup migration. Resets bctc_vps_queue rows where status='fetching' AND no financial_reports row back to status='pending'.

**Tests:** 8/8 pass (FIX-CTG-3-STEP-C.test.ts). tsc clean. 43/43 targeted regression pass.

Zone health: pushBctcExtraction.ts geo-block fallback added, stuck-fetching recovery added | HEALTHY

---

## c371 · 2026-06-05T07:16Z (FDA-1 — polymarket fabricated 0.5 probability) — COMMITTED cc4dbcba

**Task:** FDA-1 (FIX, P2) — polymarket.ts fabricated 0.5 coin-flip probability on all unparseable prices; contaminated get_prediction_markets output and Telegram dish.

**Fix:** SKIP approach. `parseOutcomePrices()` + `extractPrices()` return `null` for unparseable. Both call sites guard with `if (prices === null) continue`.

**Gate results:** tsc clean. 164 file: 21/0. Poly suite: 53/0. Pred suite: 74/0.

Zone health: polymarket.ts fabrication class eliminated, tsc clean | HEALTHY

---

## Working Memory

### Baselines (c373)
- tools=162, sched=72 | ops_rebuild_required: true (1881a + FDA-1 + FIX-CTG-PDF-MISLINK all pending rebuild)
- baseline_pass post-rebuild: get_bctc_pending_refine row 69fa303f → consolidated PDF (page_count ~62)

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
