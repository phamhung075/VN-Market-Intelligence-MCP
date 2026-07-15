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

### STEP architect-S6 · architect · 2026-07-14T21:30:00Z
**task-id:** ALPHA-S2-TICK-DOWNSAMPLE-5MIN
**what-done:** Corrected task framing — RAW-read `pushPricesHandler.ts` proved the 24h purge is
inline in the price-push hot path (rolling `now-24h` cutoff on every VPS push), NOT a separate
timer, so the compaction job must run continuously/decoupled rather than "before a nightly job".
Designed new `intraday_ohlcv_5m` table (reuses `ohlcvDailyAggregatorJob`'s exact OHLCV shape at
5-min granularity, same cumulative-volume convention as `daily_ohlcv.volume`) + standalone 24/7
cron (`*/5 * * * *`, zero market-hours gate) that always reprocesses the FULL surviving
`market_prices_history` content (bounded ~24h by the existing purge) — idempotent UPSERT and
gap-tolerant by construction, no watermark state needed; first invocation doubles as the
backfill-of-surviving-ticks migration (no separate script).
**what-considered:**
- Inline compaction inside `handlePushPrices` immediately before its existing DELETE
- Standalone decoupled cron reprocessing the whole table every tick (chosen)
- Per-code watermark/incremental catch-up (rejected — unnecessary given the source's own 24h bound)
**why-decision:** DoD literally asks for "a cron/job"; inline would add synchronous DB work to an
already-fragile hot path (OHLCV write + signal detection + alerts) for zero correctness gain over
a decoupled cron with wide safety margin against the purge's ≥24h horizon.
**why-change:** Corrected board row `zone` from `"multi"` → `apps/mcp-server/` (brownfield proved
single-zone; "multi" was a BOUNDED-1 routing placeholder). Flagged an independently-found live
landmine: `checkDuplicatePriceHistory` (W-3 weekly audit) collapses `market_prices_history` to 1
row/ticker/day whenever its 50%-safeguard doesn't trip — self-guarded today under normal tick
volume but a real risk under partial-outage/low-volume days; routed to PO/backlog, not fixed here
(distinct concern, would scope-creep this M task). Also cited prior corroborating incident (Task
1804c) where `get_price_history` had to migrate off `market_prices_history` for the same root
cause — independent proof this exact data-loss class already happened once.
**Output:** `docs/architecture-briefs/2026-07-14-alpha-s2-tick-downsample-5min.md`

### STEP architect-S7 · architect · 2026-07-15T00:00:00Z
**task-id:** ALPHA-S2-FOREIGN-FLOW-WRITE-RACE
**what-done:** RAW-verified FIX-half DONE (writeForeignFlowToOhlcv unconditional upsert,
3201c86cc); scoped residual to intraday-curve archive; verdict SPRINT-S-BUILD, zone corrected
multi->apps/mcp-server/.
**what-considered:**
- Reuse intraday_ohlcv_5m/compactor (sibling ALPHA-S2-TICK-DOWNSAMPLE-5MIN) vs standalone
- Found NO raw-ticks table exists for foreign flow (unlike market_prices_history) — both
  writers (upsertForeignFlow + writeForeignFlowToOhlcv) overwrite per-push, no source to
  retroactively downsample; write-path touch is unavoidable here
- Found "room"/holding_ratio (vnstock_trading_stats) suffers identical collapse from same
  push payload — unify into ONE new raw table + ONE compactor, not per-writer duplication
**why-decision:** STANDALONE table+job (own DDD bounded context, LAST-value-in-bucket semantics
differ from OHLC, sibling's raw table has no foreign columns so reuse buys nothing); only
cross-plane reuse worth taking is extracting the 5-min bucketing loop as a shared helper.
**why-change:** Board's "consider consolidating" framing correct to weigh but rejected on
DDD + semantics grounds, not a default no-op.

### STEP architect-S8 · architect · 2026-07-15T04:15:00Z
**task-id:** ALPHA-S2-OMO-LIQUIDITY-CRON
**what-done:** Scoped zone=multi FIX to single zone `apps/mcp-server/`; confirmed `sbv_omo_daily`
write path is already 100% shipped (P0-3-OMO-CURVE); designed a lean single-file trigger cron.
**what-considered:**
- Host cron in `apps/macro-indicators/` (Go, owns the persist) vs `apps/mcp-server/` (owns the
  scheduler + Telegram + HTTP-client infra)
- Go service is a documented zero-secrets sandbox (no Telegram token) with no scheduler at all —
  hosting fail-loud alerting there would violate that constraint or be silent-stdout-only
- HARD-fail (transport down, always alert) vs SOFT-fail (200 OK, no auction that session —
  already-modeled expected outcome per `DaysInWindow<5`) — chose to alert only on the former to
  avoid manufacturing false incidents out of normal SBV publish cadence
**why-decision:** mcp-server already has `macroFetch()` (same client `get_vn_liquidity_state`'s MCP
tool uses), `buildJobTable()`/`cronConfig.ts` registry, `sendTelegramBug()` — zero new primitives
needed; macro-indicators' Persist() already only fires on ParseOK=true (no-fake-data invariant is
structural already, nothing to add there).
**why-change:** Recommended AGAINST PM decomposing into a multi-subtask epic (unlike both wave-2
siblings) — no DDL, no write-path touch, genuinely one atomic dev-mcp-server commit.
**Output:** `docs/architecture-briefs/2026-07-15-alpha-s2-omo-liquidity-cron.md`
