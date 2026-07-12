---
id: ALPHA-S1-architect-design
version: "2026-07-12"
authored_by: architect
status: READY_FOR_PM
zone: apps/mcp-server/
task_ref: ALPHA-S1-CANDLE-RECOVER, ALPHA-S1-STARTUP-CANDLE-GUARD, ALPHA-S1-OHLCV-BACKFILL-DONE-BUG
sprint: FLOW-PRICE-ALPHA-LOOP
build_standard: not-applicable
---

# [Architect] Brownfield Findings + Technical Design
# ALPHA-S1 wave-1 split — FLOW-PRICE-ALPHA-LOOP

---

## Zone correction (all 3 rows)

All three board rows carry `zone: multi`. **Verified recon finds all 3 are single-zone:
`apps/mcp-server/`** (scheduler + infrastructure/db + interface/mcp/routes layers only — no
stock-price:5000, technical-analysis:5003, or any other microservice needs touching). No
multi-service dependency exists for any of the three. **PM: correct `zone` to
`apps/mcp-server/` and clear `supervised:true` on all 3 backlog rows** — the supervision gate's
stated purpose ("zone=multi → architect splits") is satisfied by this cycle; once corrected, the
existing `dev-mcp-server` BOUNDED-1 loop can drain them without further decomposition (each row is
already S-size/atomic — no TASK_2xxx child fan-out needed, unlike the ARCH-DAILY-FOREIGN-FLOW-TABLE
precedent). Files touched are disjoint across all 3 tasks — parallel-safe,
`isolation: "worktree"` per `docs/policies/dev-standards.md` § Parallel Agent Dispatch.

**Recommended dependency correction:** add `"depends": ["ALPHA-S1-CANDLE-RECOVER"]` to
`ALPHA-S1-STARTUP-CANDLE-GUARD` (currently `[]`). Rationale in §2 below — the guard reuses a shared
function this design asks CANDLE-RECOVER to create. `ALPHA-S1-OHLCV-BACKFILL-DONE-BUG` stays
dependency-free (touches a disjoint file set, no shared primitive).

---

## Reconciliation note — ALPHA-S2-FOREIGN-FLOW-WRITE-RACE (wave-2, informational only)

Per the router's dispatch flag: **live `.head` (read this cycle) shows PO has already reconciled
this** — `updated_by: "dev-team (tick 18:37Z close; PO reconcile af465eb93 applied — TASK_2005
cleared, ALPHA-S2-FF-RACE partial-supersede)"`. Confirms the router's concern was correct and PO
resolved it before I even started this cycle: the deferred-write-race half is DONE via TASK_2002
(unconditional `daily_foreign_flow` upsert, ARCH-DAILY-FOREIGN-FLOW-TABLE track); residual scope
(intraday-granularity archive) stays parked wave-2/supervised. No action needed from this handoff —
recorded here only so it is not re-flagged as open by a future reader. Out of my wave-1 scope
either way (not designing S2).

---

## Live verification (RAW probes, 2026-07-12T19:1x UTC — grounds the design, not assumed)

Ran read-only probes against the live named-volume DB (`docker exec ... bun:sqlite`,
`readonly:true` where used) and one live MCP gateway call, before designing the recovery path —
per `docs/protocols/fail-loud-protocol.md` Anti-Hallucination Rule (never assume state from prior
session logs).

```
get_market_snapshot() → breadth.date: "2026-07-10"           (still stale, confirms router's 19:05Z finding)
get_price_history(FPT, days=5) → most recent bar: 2026-07-10  (watchlist ticker, deep history, still gapped)
market_prices_history: MIN(fetched_at)=2026-07-10T02:00:00Z, MAX=2026-07-10T09:00:02Z, cnt=44,278
                        → ZERO rows for any 2026-07-11 timestamp
daily_ohlcv: 33/33 watchlist tickers MAX(date)=2026-07-10 (761 rows each); VNINDEX MAX(date)=2026-07-10
             SELECT COUNT(*) WHERE date='2026-07-11' → 0 (universe-wide — not just watchlist)
ohlcv_backfill_queue: last 5 rows all done=1; most recent cycle 2026-07-12 01:40 UTC (~17.5h before
             this probe) — the pipeline is alive and has cycled multiple times since the gap
             appeared, and never self-healed it (confirms the code-level finding in §1 below:
             no existing job checks recency, only total depth)
```

**Corrected incident narrative** (reconciles the Docker-incident timeline with the tick data):
`market_prices_history` holds a full, complete Thursday 2026-07-10 session (02:00–09:00Z, ~44k
rows — matches ~105 codes × 60s cadence over the trading window) and **not a single 2026-07-11
row**. This means the VPS price-push pipeline had already stopped landing successful pushes
*before* 2026-07-11's session ever started — not "ticks were captured then purged." The
`ohlcvDailyAggregator` cron (15:03 UTC = 22:03 ICT, Mon-Fri) would have found nothing to aggregate
for Friday regardless of whether it ran; the 14:18Z Docker daemon failure (recorded in git log,
`95822aa90`) landed ~45 min before that cron's scheduled fire time, compounding rather than
solely causing the gap.

**This directly falsifies the "ticks already purged ~11h ago" framing in the dispatch prompt** —
the real state is "zero ticks were ever captured," which happens to produce the same practical
outcome (Step 1 finds nothing) but changes what Step 1 should actually *do*: it is a fast,
cheap, always-safe probe-and-bail, not a recovery attempt expected to usually succeed. Design
below still implements both branches (generic, for future recurrences), but flags that **this
specific incident's the recovery goes straight to Step 2 (VPS-relay trigger)**.

---

## 1. ALPHA-S1-CANDLE-RECOVER (P0, urgent, pick first)

### Verified paths
| File | Role | Key finding |
|---|---|---|
| `apps/mcp-server/src/scheduler/market-data/ohlcvDailyAggregatorJob.ts` | Tick→daily aggregator | `runOhlcvDailyAggregator(deps?)` already accepts injectable `nowMsFn` (built for tests) — this is a ready-made extension point for re-aggregating an **arbitrary past VN date**, zero code change needed to the aggregator itself. Scoped to `watchlist` table only — does **not** cover VNINDEX (confirmed live: VNINDEX is also missing 07-11 but is never populated by this job). |
| `apps/mcp-server/src/infrastructure/fetchers/ohlcvBackfill.ts` (`runOhlcvBackfill`) | Startup-only backfill | Resume-check only inspects `min_date` (`cnt>100 AND min_date<=2024-01-15`) — **no recency check**. Silently no-ops for every already-deep watchlist ticker regardless of a missing recent session. |
| `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts` (`runTaOhlcvBackfill`) | Daily 01:30 UTC Mon-Fri cron (**live-scheduled**, confirmed in `cronConfig.ts`/`schedulerJobTable.ts:517`) | Coverage gate is `cnt >= TA_MIN_ROWS(35) && corruptCnt===0` — **total-count only, no recency check**. For all 33 watchlist tickers (~761 rows each) this always evaluates `covered++`/skip, **never re-fetches**, regardless of a missing latest-session candle. This job — the one the dispatch prompt names "the taOhlcvBackfill fallback" — **will not recover this gap even after today's fix, unless §2's guard is also shipped**, because its trigger condition is structurally blind to recency, not just currently mis-tuned. |
| `apps/mcp-server/src/scheduler/market-data/ohlcvHistoryBackfillJob.ts` | Daily 01:40 UTC cron | Production mode (`defaultFetchFn` stub, geo-blocked no-op) only inserts an `ohlcv_backfill_queue` trigger when `cnt < HISTORY_TARGET_BARS(500)` per ticker — same blind-to-recency gap. Confirmed live: this cron DID run today 01:40 UTC (queue rows 647/648) and found nothing to trigger. |
| `vps-scripts/fetch-ohlcv-backfill.sh` + `vps-scripts/ohlcv-backfill-poll.sh` + `vps-scripts/vn-ohlcv-backfill.timer` (systemd, **oneshot, every 30 min** — confirmed in `scripts/deploy-vinahost.sh:248` `systemctl enable vn-ohlcv-backfill.timer`) | VPS-relay backfill (non-geo-blocked) | This is the **only reliable path**: runs from the Vietnam VPS (not geo-blocked, unlike the two jobs above which call `api-finfo.vndirect.com.vn` directly from the France/Docker host — per `ohlcvHistoryBackfillJob.ts`'s own header comment and `fetch-ohlcv-backfill.sh`'s header comment, this exact endpoint is geo-blocked from France). Fetches `DAYS=730` (unconditional full-window re-fetch, not incremental) for every code in `/api/ohlcv-codes` (full ~1459-code universe, falls back to watchlist), always includes 2026-07-11 since it's within `[fromDate, TO_DATE=today]`. Pushes via `/api/push-ohlcv-history` → `writeOhlcvBatch(conflictStrategy:'backfill')` — unconditional upsert, correctly lands the missing bar. Dedicated `Step 1.5` block fetches VNINDEX from `vnmarket_prices` (not `stock_prices`) with `type:"index"` — **this is the only path that can recover VNINDEX**, since it's not in the `watchlist` table the aggregator/other jobs use. |
| `apps/mcp-server/src/infrastructure/db/schema-market-data.ts:178-183` | `ohlcv_backfill_queue` DDL | `{id, queued_at, done, retry_count}` — a single global run-tracker, **not per-code**. `GET /api/ohlcv-backfill-queue` just checks "any `done=0` row exists" — inserting one fresh row is sufficient to force the next VPS poll cycle, regardless of why it was inserted. |

### Design — shared recovery function + thin CLI wrapper

**Risk this design must avoid:** the two "direct fetch" jobs above look superficially like a
working fallback but are geo-blocked from the France host and have no recency gate — relying on
either would silently fail to recover the candle while looking like it ran. The design below
routes exclusively through the VPS-relay path (verified working infra — this exact pipeline was
the subject of the recently DONE_VERIFIED `OPS-OHLCV-VPS-BACKFILL-STALL-NONWATCHLIST` fix,
2026-07-08).

**New file — `apps/mcp-server/src/application/usecases/recoverMissingOhlcvSession.ts`** (application
layer — orchestrates infra `market_prices_history` read + the aggregator + the VPS-relay queue;
DDD table: "Orchestrating multiple services → application/usecases/"):

```ts
export interface RecoverMissingOhlcvSessionResult {
  date: string;
  alreadyPresent: boolean;
  ticksFound: number;
  action: "none" | "reaggregated" | "vps-relay-triggered" | "vps-relay-already-pending";
  aggregatorResult?: OhlcvAggregatorResult;
}

export async function recoverMissingOhlcvSession(
  date: string,                       // YYYY-MM-DD, VN calendar date
  deps?: { db?: Database },
): Promise<RecoverMissingOhlcvSessionResult> {
  const db = deps?.db ?? getDb();

  // 1. Idempotent no-op guard.
  const already = db.prepare("SELECT COUNT(*) as n FROM daily_ohlcv WHERE date = ?").get(date) as { n: number };
  if (already.n > 0) return { date, alreadyPresent: true, ticksFound: 0, action: "none" };

  // 2. Probe surviving ticks for the VN trading window of `date`.
  //    VN midnight(date) in UTC = date T00:00 − 7h.
  const vnMidnightUtcMs = new Date(`${date}T00:00:00Z`).getTime() - 7 * 3_600_000;
  const vnNextMidnightUtcMs = vnMidnightUtcMs + 24 * 3_600_000;
  const tickRow = db.prepare(
    "SELECT COUNT(*) as n FROM market_prices_history WHERE fetched_at >= ? AND fetched_at < ?"
  ).get(new Date(vnMidnightUtcMs).toISOString(), new Date(vnNextMidnightUtcMs).toISOString()) as { n: number };

  // 3a. Ticks survive — re-aggregate via the EXISTING aggregator's injectable nowMsFn
  //     (zero change to ohlcvDailyAggregatorJob.ts). NOTE: watchlist-scoped only — does
  //     NOT cover VNINDEX (see verified-paths table above); caller must not assume this
  //     branch alone is a complete recovery when VNINDEX is also missing.
  if (tickRow.n > 0) {
    const midSessionMs = vnMidnightUtcMs + 5 * 3_600_000; // any timestamp inside the VN session
    const aggregatorResult = await runOhlcvDailyAggregator({
      db: () => db,
      nowMsFn: () => midSessionMs,
      sendWorkFn: async () => {},   // suppress duplicate WORK alert — caller alerts once
    });
    return { date, alreadyPresent: false, ticksFound: tickRow.n, action: "reaggregated", aggregatorResult };
  }

  // 3b. No ticks survived — force the VPS-relay pipeline (fail-loud caller decides alerting).
  const pending = db.prepare("SELECT id FROM ohlcv_backfill_queue WHERE done = 0 LIMIT 1").get();
  if (pending) {
    return { date, alreadyPresent: false, ticksFound: 0, action: "vps-relay-already-pending" };
  }
  db.prepare("INSERT INTO ohlcv_backfill_queue (queued_at, done) VALUES (datetime('now'), 0)").run();
  return { date, alreadyPresent: false, ticksFound: 0, action: "vps-relay-triggered" };
}
```

**Thin CLI wrapper — `scripts/recover-missing-ohlcv-day.ts`** (Script Persistence policy —
reusable, belongs in `scripts/`, not a one-off `/tmp` script; canonical pointer to add to
`docs/policies/dev-standards.md` § Script Persistence after landing):

```bash
# Dry-probe only (no writes) — omit --live to just print ticksFound/action without executing:
docker cp scripts/recover-missing-ohlcv-day.ts \
  vn-market-intelligence-mcp-mcp-server-1:/app/recover-missing-ohlcv-day.ts
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  bun run /app/recover-missing-ohlcv-day.ts --date=2026-07-11 --live
```
Calls `recoverMissingOhlcvSession(date, { db })` and prints the result. Exit 0 = action taken or
already-present; exit 2 = usage/DB error. **This incident: expect `action: "vps-relay-triggered"`**
(ticks confirmed empty by this cycle's live probe) — next `vn-ohlcv-backfill.timer` tick (≤30 min,
systemd oneshot-every-30min, confirmed deployed) performs the actual fetch+push. Re-verify via
`get_price_history(code, days=3)` / `get_market_snapshot()` ~30-40 min after running the script —
comfortably inside the Monday 02:15Z deadline (currently ~31h of runway at time of this handoff).

### DDD layer
`recoverMissingOhlcvSession` → `application/usecases/` (orchestrates infra read + existing
aggregator + queue write, no new domain rule). CLI wrapper → `scripts/` (operational tooling, not
a DDD layer). No production route/tool surface added — this is a manual-trigger recovery action
per the row's own scope note ("DATA-RECOVERY row only").

### Test strategy
- Unit: `recoverMissingOhlcvSession` with an in-memory DB — (a) date already has rows → `action:"none"`;
  (b) ticks present for date → `action:"reaggregated"`, daily_ohlcv row written, values match tick
  MIN/MAX/first/last (mirrors `ohlcvDailyAggregatorJob.ts`'s own existing test pattern); (c) zero
  ticks, no pending queue row → `action:"vps-relay-triggered"`, one new `done=0` row inserted; (d)
  zero ticks, pending row already exists → `action:"vps-relay-already-pending"`, no duplicate insert.
- Regression: existing `ohlcvDailyAggregatorJob` test suite unaffected (zero changes to that file).

---

## 2. ALPHA-S1-STARTUP-CANDLE-GUARD (P1)

### Verified paths
| File | Role | Key finding |
|---|---|---|
| `apps/mcp-server/src/scheduler/startScheduler.ts:90-95` | Startup sequence | `void runOhlcvStartupProbe().then(...)` — established fire-and-forget startup-check pattern; my new guard call slots in immediately after this, same phase. |
| `apps/mcp-server/src/scheduler/market-data/ohlcvDailyAggregatorJob.ts` | Daily 15:03 UTC Mon-Fri cron | Natural second hook ("first tick of a session" per the row's own DoD wording) — a trailing catch-up check here means the guard self-heals daily regardless of container-restart timing, closing the coverage gap a startup-only guard would have (a transient one-day failure that doesn't crash the container would never re-trigger a startup check). |
| `apps/mcp-server/src/interface/mcp/tools/system/isTradingDayTool.ts` + `apps/mcp-server/src/domain/services/vnTradingCalendar.ts` | VN holiday/weekend calendar | `isVnTradingDay(date): TradingDayResult` — pure domain function, embedded VN holiday data through 2027 (`VN_CALENDAR_LAST_YEAR=2027`), already tested (`DWF-is-trading-day.test.ts`). **Reusable as-is** — no existing "walk backward to most recent trading day" helper, needs one small additive export. |

### Design — new domain helper + new scheduler guard, calling §1's shared function

**Extend `apps/mcp-server/src/domain/services/vnTradingCalendar.ts`** (additive export, same file,
same layer — "extend not duplicate"):

```ts
/** Most recent VN trading day on or before `date` (inclusive). Walks backward through
 *  weekends/holidays using isVnTradingDay. Bounded to 14 days back (safety — VN holiday
 *  blocks never exceed ~9 consecutive non-trading days e.g. Tet). */
export function mostRecentTradingDayOnOrBefore(date: string): string {
  let d = date;
  for (let i = 0; i < 14; i++) {
    if (isVnTradingDay(d).is_trading_day) return d;
    d = shiftDateDays(d, -1);   // small local helper, YYYY-MM-DD arithmetic
  }
  return date; // exhausted bound — caller treats as "unknown", does not alert
}
```

**New file — `apps/mcp-server/src/scheduler/market-data/ohlcvCandleGuard.ts`** (single-responsibility,
mirrors the codebase's existing one-job-per-file granularity — `ohlcvStartupProbe.ts`,
`ohlcvDailyAggregatorJob.ts`, `taOhlcvBackfillJob.ts` are all separate files for separate concerns):

```ts
export async function runOhlcvCandlePresenceGuard(deps?: {
  db?: Database; sendWorkFn?: (msg: string) => Promise<unknown>; nowMs?: number;
}): Promise<{ expectedDate: string; missingCodes: string[]; action: string }> {
  const db = deps?.db ?? getDb();
  const nowMs = deps?.nowMs ?? Date.now();
  const sendWorkFn = deps?.sendWorkFn ?? ((m: string) => sendTelegramWork(m));

  // "Expected" session = most recent VN trading day whose close has already passed
  // relative to now (before today's market open ⇒ expect yesterday's trading day).
  const vnToday = getTodayVnDate();
  const vnNowIcT = new Date(nowMs + 7 * 3_600_000);
  const beforeMarketOpen = vnNowIcT.getUTCHours() < 9; // VN 09:00 ICT open, using shifted-UTC hours
  const cutoffDate = beforeMarketOpen ? shiftDateDays(vnToday, -1) : vnToday;
  const expectedDate = mostRecentTradingDayOnOrBefore(cutoffDate);

  const watchlist = db.prepare("SELECT code FROM watchlist").all() as { code: string }[];
  const missing = watchlist
    .filter(({ code }) => !db.prepare(
      "SELECT 1 FROM daily_ohlcv WHERE code=? AND date=?"
    ).get(code, expectedDate))
    .map((r) => r.code);
  // + VNINDEX (not in watchlist table — separate check, matches ohlcvBackfillHandler.ts's
  //   existing FR-B2 pattern of checking VNINDEX depth alongside watchlist depth).
  const vnindexMissing = !db.prepare(
    "SELECT 1 FROM daily_ohlcv WHERE code='VNINDEX' AND date=?"
  ).get(expectedDate);

  if (missing.length === 0 && !vnindexMissing) {
    return { expectedDate, missingCodes: [], action: "none" };
  }

  try {
    const result = await recoverMissingOhlcvSession(expectedDate, { db });
    await sendWorkFn(
      `[ohlcv-candle-guard] ${expectedDate} missing for ${missing.length + (vnindexMissing?1:0)} ` +
      `code(s) (${missing.slice(0,5).join(",")}${vnindexMissing?",VNINDEX":""}${missing.length>5?",...":""}) ` +
      `— catch-up action: ${result.action}`
    );
    return { expectedDate, missingCodes: missing, action: result.action };
  } catch (err) {
    // DoD: "fail-loud on catch-up failure" — do not swallow.
    await sendTelegramBug(
      `[ohlcv-candle-guard] catch-up FAILED for ${expectedDate}: ` +
      `${err instanceof Error ? err.message : String(err)}`
    );
    throw err;
  }
}
```

**Idempotency:** relies entirely on §1's `recoverMissingOhlcvSession`'s own guards (already-present
no-op, pending-row dedup) — calling this guard twice in a row (startup + same-day cron trailing
call) is safe by construction, no new dedup logic needed here.

**Wiring (2 call sites, both additive):**
1. `startScheduler.ts`, immediately after the existing `runOhlcvStartupProbe()` call (same phase).
2. `ohlcvDailyAggregatorJob.ts`, as a trailing step after `runOhlcvDailyAggregator`'s own write —
   check the **previous** trading day (not today — today's own aggregation just ran above it in
   the same function), i.e. `runOhlcvCandlePresenceGuard` invoked with a `nowMs` that resolves
   `cutoffDate` to yesterday relative to the cron's fire time. This is the daily self-heal path
   that does not depend on a container restart ever happening.

### DDD layer
`vnTradingCalendar.ts` addition → domain/services (pure function, no I/O, matches existing file).
`ohlcvCandleGuard.ts` → scheduler (interface layer — orchestrates domain calendar + infra DB read +
application recovery function, matches `ohlcvStartupProbe.ts`'s existing layer placement exactly).

### Risk flags
| Risk | Severity | Mitigation |
|---|---|---|
| Startup-only guard misses a restart-less multi-day failure | MEDIUM (closed by this design) | Second call site in the daily aggregator cron (§ Wiring point 2) — self-heals every trading day regardless of restarts. |
| Guard fires falsely right at/before market open (today's candle not written yet — expected) | LOW | `beforeMarketOpen` cutoff explicitly expects **yesterday's** candle before 09:00 ICT, not today's — avoids a false alert every single morning. |
| VN holiday-block edge case (e.g. Tet, ~9 consecutive non-trading days) exceeds the 14-day backward-walk bound | LOW | Bounded loop returns the input date unchanged (`"unknown"`-equivalent) rather than looping/throwing — guard silently no-ops rather than false-alerting on an ambiguous calendar edge; flagged as a known limitation, not blocking. |
| Guard's `recoverMissingOhlcvSession` call inherits §1's "watchlist-only tick re-aggregation, VNINDEX needs VPS-relay" limitation | LOW | Guard explicitly checks VNINDEX separately (FR-B2-style) so a VNINDEX-only gap is still detected and correctly routed to the VPS-relay branch (ticksFound=0 path, since VNINDEX ticks were never in `market_prices_history` to begin with). |

### Test strategy
- Unit: `mostRecentTradingDayOnOrBefore` — weekday input returns itself; Saturday/Sunday input walks
  back to Friday; a known VN holiday date walks back correctly (reuse existing `VN_HOLIDAYS` fixture
  dates from `DWF-is-trading-day.test.ts`).
- Unit: `runOhlcvCandlePresenceGuard` with injected `db`/`nowMs`/mocked `recoverMissingOhlcvSession` —
  (a) all codes present for expected date → `action:"none"`, no alert sent; (b) some codes missing →
  calls recovery, sends exactly one WORK alert; (c) VNINDEX-only missing → detected, recovery called;
  (d) recovery throws → `sendTelegramBug` fires, error re-thrown (fail-loud, not swallowed).
- Regression: `ohlcvDailyAggregatorJob` existing tests unaffected (trailing call is additive, injected
  via deps in tests, defaults to real guard only in production).

---

## 3. ALPHA-S1-OHLCV-BACKFILL-DONE-BUG (P1)

### Verified paths
| File | Role | Key finding |
|---|---|---|
| `apps/mcp-server/src/interface/mcp/routes/ohlcvBackfillHandler.ts:186-293` (`handleOhlcvBackfillDone`) | `POST /api/ohlcv-backfill-done` | Line 209: `UPDATE ohlcv_backfill_queue SET done = 1 WHERE done = 0` fires **unconditionally on every call**, before any use of the parsed `barsPushedTotal`. The value is logged (`log.info(...barsPushedTotal)`) but never used to gate the outcome — confirmed 100% live in code, exactly matching the row's DoD wording. |
| `vps-scripts/ohlcv-backfill-poll.sh:71-77` | VPS poll script (oneshot, systemd-timer-wrapped every 30 min) | Comment: `"Signal done regardless of exit code so the server unblocks"` — **this call is deliberately non-authoritative** (always empty body → `barsPushedTotal=null` server-side). This is load-bearing and must be preserved (see design below — the fix must not break the poller's unblock guarantee). |
| `vps-scripts/fetch-ohlcv-backfill.sh:302-314` | Real backfill script's own completion signal | POSTs `{"bars_pushed_total": N}` **before** the poller's own call in the same cycle (synchronous exec order: `"$BACKFILL_SCRIPT"` runs to completion, *then* the poller does its own POST) — this is the **authoritative** call when it happens. If the script crashes/exits early (the historical Phase A/B incident: `docs/vps-sources/ohlcv-backfill-pipeline-stall/recon.md`, unsubstituted `__MCP_BASE__` placeholder → every curl fails DNS resolution), this call never lands and only the poller's blind ack does. |
| `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts:485` | `writeOhlcvBatch` | `result.written++` fires on **every** successful upsert (insert-or-update both count) — confirms `bars_pushed_total > 0` is the expected steady-state value for any healthy run over an actively-traded universe; a genuine `0` is anomalous, not a legitimate "already up to date" outcome (the fetch re-pulls the full 730-day window every run, unconditionally, not incrementally). |
| `apps/mcp-server/src/infrastructure/db/schema-market-data.ts:178-198` | `ohlcv_backfill_queue` DDL + migration | Existing idempotent `ALTER TABLE ... ADD COLUMN retry_count` migration pattern (guarded by `PRAGMA table_info` column-existence check) — template to reuse for the new `bars_inserted` column. |
| `apps/mcp-server/src/__tests__/ohlcv-backfill-done-subtask-b.test.ts` | Existing test suite (BT-1..BT-5) | Verified all 5 existing tests remain green under this design (traced through each — see Test strategy below); the depth-shortfall re-queue/escalate logic (R-5) stays untouched, and this design deliberately **short-circuits** it on an insert-verification failure to avoid a double-fire (see Design note). |

### Design — inserted-count verification + reuse of the existing R-5 retry/escalate ladder

**Schema addition** (`schema-market-data.ts`, same idempotent-migration idiom as `retry_count`):
```ts
if (!obqCols.includes("bars_inserted")) {
  db.exec("ALTER TABLE ohlcv_backfill_queue ADD COLUMN bars_inserted INTEGER");
}
```
Nullable — `NULL` = no authoritative report ever landed for that closed row (distinguishable from
a real `0`).

**Handler change** (`ohlcvBackfillHandler.ts`, `handleOhlcvBackfillDone`):
```ts
// 1. Mark pending rows done, recording bars_inserted (NULL for a blind/empty-body ack).
const closeResult = db.prepare(
  "UPDATE ohlcv_backfill_queue SET done = 1, bars_inserted = ? WHERE done = 0"
).run(barsPushedTotal);
log.info("[ohlcv-backfill-done] marked done", { barsPushedTotal, rowsClosed: closeResult.changes });

// 2. NEW — insert-count verification. closeResult.changes>0 means THIS call is the one
//    that actually closed a pending row (not a redundant idempotent ack finding nothing
//    pending — matches the existing documented double-call idempotency).
let insertVerificationFailed = false;
if (closeResult.changes > 0 && (barsPushedTotal === null || barsPushedTotal === 0)) {
  insertVerificationFailed = true;
  const lastRow = db.prepare<{ retry_count: number }, []>(
    "SELECT retry_count FROM ohlcv_backfill_queue WHERE done = 1 ORDER BY id DESC LIMIT 1"
  ).get();
  const currentRetryCount = lastRow?.retry_count ?? 0;
  const reason = barsPushedTotal === null
    ? "no completion report received (fetch-ohlcv-backfill.sh likely crashed/DNS-failed before reporting — poller force-closed the queue row)"
    : "fetch-ohlcv-backfill.sh reported 0 bars inserted across all tickers";

  if (currentRetryCount >= 5) {
    log.error("[ohlcv-backfill-done] insert-count retry cap reached (>=5)", { retry_count: currentRetryCount, reason });
    void sendTelegramBug(`[OHLCV-BACKFILL] ${reason}, after ${currentRetryCount} retries. Manual VPS investigation required.`);
  } else {
    const nextRetryCount = currentRetryCount + 1;
    db.prepare("INSERT INTO ohlcv_backfill_queue (queued_at, done, retry_count) VALUES (datetime('now'), 0, ?)").run(nextRetryCount);
    log.warn("[ohlcv-backfill-done] insert-count verification failed — re-queued", { retry_count: nextRetryCount, reason });
  }
}

// 3. EXISTING depth-probe block — UNCHANGED, but skip it when step 2 already re-queued/escalated
//    for the SAME cycle to avoid a double-fire (double retry_count bump, double Telegram alert).
if (!insertVerificationFailed) {
  // ...existing depth-probe code, verbatim...
}
```

**Why `done=1` still flips unconditionally (not gated) — deliberate, verified-safe:**
`vn-ohlcv-backfill.timer` is a **systemd oneshot timer firing every 30 min** (confirmed:
`vps-scripts/vn-ohlcv-backfill.service` is `Type=oneshot`, enabled via
`scripts/deploy-vinahost.sh:248` `systemctl enable vn-ohlcv-backfill.timer`). Re-queuing via a
**new** `done=0` row (mirroring the existing depth-shortfall pattern exactly, not by leaving the
current row pending) guarantees the retry is picked up within 30 min regardless — there is no
starvation risk from also closing the original row. Gating `done` itself instead (leaving the
row pending on failure) was considered and rejected: it would change the poller's documented
"regardless of exit code" unblock contract for zero benefit, since the new-row re-queue achieves
the same retry outcome without touching that contract.

**Double-fire avoidance (why step 3 is now conditional):** BT-3/BT-4 (existing tests) show the
existing depth-probe block ALSO reads "last row retry_count" and ALSO re-queues/escalates on a
watchlist depth shortfall. Before this change, a call with `barsPushedTotal===0` AND a shallow
watchlist code would trigger **both** blocks independently → two new queue rows inserted, two
Telegram alerts for the same underlying event. The `if (!insertVerificationFailed)` guard makes
the two checks mutually exclusive per call: "we don't know whether real work happened this cycle"
(step 2) supersedes "was the resulting depth sufficient" (step 3) — a depth-shortfall diagnostic is
meaningless when the underlying run couldn't be verified to have inserted anything.

### Existing-test regression trace (all 5 cases re-verified against this design)
- **BT-1** (`bars_pushed_total:500`): `500>0` → step 2 condition false → unaffected. PASS.
- **BT-2** (empty body, row already `done=1`): `closeResult.changes===0` → step 2 skipped entirely. PASS.
- **BT-3** (`bars_pushed_total:10`, shallow watchlist code): `10>0` → step 2 skipped, step 3 (existing
  depth-probe) runs exactly as today. PASS, unaffected.
- **BT-4** (empty body, retry_count=5 already): `barsPushedTotal===null`, `changes>0` → step 2 fires,
  `currentRetryCount>=5` → escalate branch, **no new row inserted**, step 3 skipped (mutual exclusion)
  → `countPendingQueueRows()===0` as asserted. PASS (previously this scenario also ran the redundant
  depth-probe escalation — now fires exactly once, a strict improvement, assertions unaffected).
- **BT-5** (`bars_pushed_total:300`, all depths healthy): `300>0` → step 2 skipped, step 3 runs,
  finds no shortfall. PASS, unaffected.

### DDD layer
Schema migration → infrastructure/db (same file/layer as the existing `retry_count` migration).
Handler change → interface/mcp/routes (same file/layer, no new file). No DDD violations, no new
cross-layer import.

### Risk flags
| Risk | Severity | Mitigation |
|---|---|---|
| Double-fire (step 2 + step 3 both re-queue for the same failure) | MEDIUM (closed by this design) | Mutual-exclusion guard (`if (!insertVerificationFailed)`) — see design note above. |
| Retry storm if VNDirect/VPS has an extended real outage | LOW (pre-existing, unchanged) | Same R-5 cap (retry_count≥5 → escalate, no infinite requeue) already governs both paths — this design reuses it, does not introduce a new unbounded loop. |
| `bars_inserted` column adds an unused write path if nothing ever reads it | LOW | Immediate reader: the fail-loud branches above. Secondary value: observability for future ALPHA-S2/S3 cross-sectional quality checks (gap #6 in the strategy brief) without needing another schema change later. |

### Test strategy
New cases to add to `ohlcv-backfill-done-subtask-b.test.ts` (same file, same harness):
- **BT-6**: `bars_pushed_total:0`, retry_count=0 pending row → re-queue inserted (`retry_count:1`),
  depth-probe NOT independently re-triggered (assert via a spy/counter that `sendTelegramBug` or the
  depth-log fires at most the step-2 alert, not a duplicate).
- **BT-7**: empty body, retry_count=0 pending row (no shallow watchlist code seeded) → re-queue
  inserted (`retry_count:1`) — proves the "no report" path re-queues even when depth would have
  looked fine (i.e., a full-universe zero-insert failure is caught even though watchlist itself is
  deep — this is the exact gap class this task exists to close).
- **BT-8**: `bars_pushed_total:0`, retry_count=5 → escalate, no new row, `sendTelegramBug` called once.
- Regression: BT-1..BT-5 pass unmodified (traced above).

---

## Combined DDD layer summary

| Change | Layer | Rationale |
|---|---|---|
| `recoverMissingOhlcvSession.ts` (new) | application/usecases | Orchestrates infra read + existing aggregator + queue write — matches DDD table exactly. |
| `scripts/recover-missing-ohlcv-day.ts` (new) | scripts/ (not a DDD layer) | Thin CLI wrapper, operational tooling. |
| `vnTradingCalendar.ts` addition | domain/services | Pure function, no I/O — extends existing file, same layer. |
| `ohlcvCandleGuard.ts` (new) | scheduler (interface) | Matches `ohlcvStartupProbe.ts`'s existing placement exactly — one-job-per-file convention. |
| `ohlcv_backfill_queue.bars_inserted` migration | infrastructure/db | Same file/layer as the existing `retry_count` migration. |
| `handleOhlcvBackfillDone` change | interface/mcp/routes | Same file/layer, no new cross-layer import. |

`domain/` still has zero imports from `infrastructure/` — no violations introduced by any of the
three designs.

---

## PM task atomization recommendation

No further fan-out needed — each of the 3 existing board rows is already the correct grain (S-size,
single-zone once corrected, disjoint file sets). Recommended PM actions:

| Row | Correction | Depends |
|---|---|---|
| `ALPHA-S1-CANDLE-RECOVER` | `zone: "apps/mcp-server/"`, `supervised: false` | `[]` (unchanged) — pick first, P0 |
| `ALPHA-S1-STARTUP-CANDLE-GUARD` | `zone: "apps/mcp-server/"`, `supervised: false` | `["ALPHA-S1-CANDLE-RECOVER"]` (**new** — reuses its `recoverMissingOhlcvSession` function; CANDLE-RECOVER is P0/pick-first so this is a low sequencing cost for a real DRY benefit) |
| `ALPHA-S1-OHLCV-BACKFILL-DONE-BUG` | `zone: "apps/mcp-server/"`, `supervised: false` | `[]` (unchanged) — fully independent file set, parallel-safe with the other two via `isolation:"worktree"` |

All three: `BUILD-STANDARD: not-applicable` (bug-fix/hardening in an existing service, no new
primitive/port).

---

## [Architect] Brownfield Findings

- **Zone:** `apps/mcp-server/` (all 3 — corrected from `multi`, see § Zone correction)
- **Verified paths:** see per-task tables above (§1/§2/§3) — 11 files read/traced, plus 5 live
  RAW probes (gateway MCP call + 2 read-only `docker exec bun:sqlite` queries) grounding the
  recovery design in actual current DB state rather than the dispatch prompt's assumption.
- **Reuse patterns:**
  - `runOhlcvDailyAggregator`'s existing injectable `nowMsFn` reused as-is for historical-date
    re-aggregation — zero change to that file.
  - `isVnTradingDay`/VN holiday calendar (previously wired only to a deregistered MCP tool) reused
    for the guard's recency computation — one small additive export, no duplication of holiday data.
  - `ohlcv_backfill_queue` INSERT idiom (already used by `ohlcvStartupProbe.ts` and
    `ohlcvHistoryBackfillJob.ts`) reused verbatim for the recovery trigger and the guard's fallback.
  - R-5 retry/escalate ladder (already shipped for the depth-shortfall path) reused for the new
    insert-count-verification path — same cap, same escalation message shape, no new state machine.
- **Design decisions:**
  - New shared `recoverMissingOhlcvSession` application-layer function avoids duplicating the
    probe-then-branch recovery logic between the one-off CLI script (P0) and the recurring guard (P1).
  - Recovery routes exclusively through the VPS-relay pipeline (not the two geo-blocked direct-fetch
    jobs) — a risk the dispatch prompt's framing did not surface; confirmed via 3 independent code
    comments (`ohlcvHistoryBackfillJob.ts`, `fetch-ohlcv-backfill.sh`, strategy brief's own probe note
    on `stock-price:5000`'s Tier 1/2 VnDirect geo-block).
  - `handleOhlcvBackfillDone`'s fix preserves the poller's "regardless of exit code" unblock contract
    exactly — re-queues via a **new** row (existing pattern) rather than gating the original row's
    `done` flip, avoiding a starvation regression on a systemd-timer-driven one-shot poller.
- **Scan clean:** true
- **BUILD-STANDARD:** not-applicable (bug-fix/hardening, existing service, no new primitive) — all 3

---

## Shared verification gate (post-implementation, all 3)

- `ALPHA-S1-CANDLE-RECOVER`: live `get_price_history(<any watchlist code>, days=3)` and
  `get_market_snapshot()` show `2026-07-11` present / `breadth.date` advanced past `2026-07-10`,
  probed ~30-40 min after the recovery script runs. Hard deadline: before Monday 2026-07-14 02:15Z.
- `ALPHA-S1-STARTUP-CANDLE-GUARD`: restart the mcp-server container against a DB with a deliberately
  stale row (test-seeded) and confirm the WORK-channel alert + recovery call fire; confirm the daily
  cron trailing-call path also fires by inspecting the next day's `ohlcvDailyAggregator` cron log.
- `ALPHA-S1-OHLCV-BACKFILL-DONE-BUG`: after next real backfill cycle, confirm `ohlcv_backfill_queue`
  rows now carry a non-NULL `bars_inserted` value; live-trigger a `bars_pushed_total:0` call (test
  env) and confirm exactly one Telegram BUG fires, not two.
