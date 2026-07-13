# Decision Journal — Sprint FLOW-PRICE-ALPHA-LOOP · architect

**Sprint goal:** Flow-and-Price Alpha Loop (Option A) — foreign flow x sentiment x RS ranked daily
watchlist signals, regime-gated, outcome-scored. S1 = repair serving floor first.
**Agent:** architect
**Started:** 2026-07-12T19:27:07Z

---

### STEP architect-S1 · architect · 2026-07-12T19:27:07Z
**task-id:** ALPHA-S1-CANDLE-RECOVER
**what-done:** Live-probed DB (docker exec bun:sqlite, read-only) before designing recovery —
market_prices_history has ZERO 2026-07-11 rows (only complete 07-10 session), falsifying the
dispatch's "ticks purged ~11h ago" framing (real cause: no ticks were ever captured that day).
**what-considered:**
- Rely on taOhlcvBackfillJob/ohlcvBackfill.ts direct-fetch as router suggested
- Route recovery exclusively through VPS-relay (ohlcv_backfill_queue trigger)
**why-decision:** Both direct-fetch jobs call the exact VNDirect endpoint 3 independent code
comments confirm is geo-blocked from France; their coverage gates also check total-count only
(no recency) so they silently no-op on deep watchlist tickers regardless. VPS-relay is the only
non-geo-blocked, recency-agnostic path — reused verbatim (recently DONE_VERIFIED pipeline).
**why-change:** Corrects dispatch's step-1/step-2 priority framing to match live-verified DB state.

### STEP architect-S2 · architect · 2026-07-12T19:27:07Z
**task-id:** ALPHA-S1-STARTUP-CANDLE-GUARD
**what-done:** Designed new `recoverMissingOhlcvSession` shared function (application layer) +
`ohlcvCandleGuard.ts` (scheduler layer) wired at 2 call sites (startup + daily aggregator cron
trailing step), reusing existing `isVnTradingDay`/`vnTradingCalendar.ts` (previously wired only
to a deregistered MCP tool) for recency computation.
**what-considered:**
- Startup-only guard (matches DoD's literal "on startup" wording)
- Startup + daily-cron-trailing dual hook (covers restart-less transient failures too)
**why-decision:** Startup-only leaves a real gap — a 1-day failure that doesn't crash the
container never re-triggers a startup check; daily-cron trailing call self-heals every trading
day regardless of restart timing, matching DoD's own "and/or first tick of a session" wording.
**why-change:** Recommends new `depends:["ALPHA-S1-CANDLE-RECOVER"]` (was `[]`) — guard reuses
S1's shared recovery function; flagged for PM, not self-applied (task breakdown is PM's job).

### STEP architect-S3 · architect · 2026-07-12T19:27:07Z
**task-id:** ALPHA-S1-OHLCV-BACKFILL-DONE-BUG
**what-done:** Traced `handleOhlcvBackfillDone` line-by-line — confirmed `done=1` flips
unconditionally, `barsPushedTotal` parsed but never used to gate outcome. Designed insert-count
verification reusing the existing R-5 retry/escalate ladder (new queue row, not gating `done`
itself) + `bars_inserted` column (idempotent ALTER, mirrors existing `retry_count` migration).
**what-considered:**
- Gate `done` itself on zero-insert (leave row pending for retry)
- Re-queue via a NEW row (existing depth-shortfall pattern), keep `done` unconditional
**why-decision:** `vn-ohlcv-backfill.timer` is a systemd oneshot fired every 30 min (verified in
deploy-vinahost.sh) — re-queuing via a new row achieves identical retry semantics without
touching the poller's documented "regardless of exit code" unblock contract (risk of starvation
regression if that contract were altered).
**why-change:** Added mutual-exclusion guard vs the existing depth-probe re-queue block (traced
all 5 existing BT-1..BT-5 tests) — without it, a `bars_pushed_total:0` + shallow-watchlist-code
call would double-fire (2 queue rows, 2 Telegram alerts) for one underlying event.

### STEP architect-S4 · architect · 2026-07-13T00:00:00Z
**task-id:** FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT
**what-done:** Confirmed async-reroute over sync-bump (480s direct call already failed to
return); rejected size/page threshold via live `data/pdfs/` corpus check (15-23MB files serve
fine, 2-3x the 7.1MB HPG failure) — adopted existing `extractPdfText`/`PDF_CONFIDENCE_HIGH_THRESHOLD`
(200 chars) classifier instead. Confirmed `bctcExtractReconcileJob.ts` (FIX-BCTC-D3A/B/C) already
owns the done/enrich_failed state machine origin-agnostically — push path just needs to feed it.
**what-considered:**
- Byte-size/page-count cutoff (PO's literal ask) — falsified by corpus evidence
- Reuse existing pdf.ts confidence classifier as the gate (zero new constant)
**why-decision:** Content-based signal (has-real-text-layer) is direct causally; size is only a
weak proxy in this corpus (large legit text-native filings coexist with the small scanned failure).
**why-change:** Flagged a must-fix risk PO/dev didn't ask about: `ensureFinancialReportShellRow`'s
upsert never clobbers an existing `pdf_path` — silently defeats the corrective push use-case
(HPG-style re-source) unless dev adds an explicit unconditional pdf_path UPDATE after it.

### STEP architect-S5 · architect · 2026-07-13T21:00:00Z
**task-id:** FIX-DAILY-FF-VIEW-JOIN-ANCHOR
**what-done:** Chose Shape A (bidirectional/FULL-OUTER-emulated `daily_ohlcv_with_flow` view via
LEFT JOIN + UNION ALL anti-join); verified empirically against a throwaway `sqlite3 :memory:`
session (T-3/T-4/legacy-fallback all correct, no dup rows). Wrote brief to
docs/architecture-briefs/2026-07-13-daily-ff-view-join-anchor.md.
**what-considered:**
- Shape B (rewire 5 Class-A read sites to query daily_foreign_flow directly)
- Shape A (fix the view itself)
**why-decision:** Structural disqualifier for B — the 2 frozen gate assertions query
`daily_ohlcv_with_flow` directly via `queryViewRow()`, not through any Class-A tool function;
only a view-level fix can flip them GREEN without editing the test.
**why-change:** Found a real regression the task didn't flag: `daily-foreign-flow-schema.test.ts`
"R-1 view-level proof" test currently asserts `rows.length===0` (documents the bug as correct) —
will flip red under Shape A unless dev-mcp-server updates it in the same commit. Also flagged a
production footgun: `CREATE VIEW IF NOT EXISTS` is a no-op on the persisted named-volume DB —
needs `DROP VIEW IF EXISTS` first or the fix never actually deploys.
