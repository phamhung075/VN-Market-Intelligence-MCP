# ALPHA-S2-OMO-LIQUIDITY-CRON — Zone Split + Cron Design

**Task:** Archive-now (gap #2) — nothing calls macro-indicators' `POST /liquidity-state`, so
`sbv_omo_daily` accrues nothing and the built OMO-stress leg stays null.
**Sprint:** FLOW-PRICE-ALPHA-LOOP (wave 2)
**Verdict:** **LEAN single-file FIX** — stays on the architect→pm relay only because the board
row carried `zone: multi`; once resolved this is NOT a multi-subtask epic like the two wave-2
siblings (ALPHA-S2-TICK-DOWNSAMPLE-5MIN, ALPHA-S2-FOREIGN-FLOW-WRITE-RACE). No DDL, no write-path
touch — see §1.
**Zone:** `apps/mcp-server/` — **single zone.**
**BUILD-STANDARD:** not-applicable (in-zone scheduler wiring, zero new domain primitives — reuses
`macroFetch`, `sendTelegramBug`, `buildJobTable`, the existing `LiquidityStateResponseSchema`).

---

## 1. The split — why `apps/mcp-server/`, not `apps/macro-indicators/`

RAW-verified both candidate zones before deciding:

**`apps/macro-indicators/` (Go) already does 100% of the actual persist work — nothing to add
there.** `LiquidityStateUseCase.Execute()` (`pkg/application/usecases_vmt_liquidity.go:242-247`)
already calls `uc.computeOMOCurve()` → `uc.omoDailyRepo.Persist(ctx, persistRow)`
(`repository_vmt_omo_daily.go`) as a write-on-fetch side effect of **every** `POST
/liquidity-state` call, shipped in P0-3-OMO-CURVE (commit `cd8cfcc2`, 2026-06-29). The
`sbv_omo_daily` table, its DDL, and the idempotent `ON CONFLICT(auction_date) DO UPDATE` all
already exist and are already correct (NFR-P03-3). **The persist is only invoked when
`omoInputs.ParseOK == true`** — a fetch/parse failure short-circuits to `BuildOMOFailed` and
`omoCurve` stays `nil`, so **no row is ever written on failure**. This already satisfies the DoD's
"no fake-freshness / no fabricated rows" invariant natively, with zero new Go code required.

**The entire remaining gap is "nobody calls the endpoint."** That is a scheduling problem, and
`apps/macro-indicators/` structurally cannot own it:
- It is a pure Go HTTP service with **zero scheduler infrastructure** (no cron library, no
  `startScheduler.ts` equivalent) — `main.go`'s only loop is `srv.ListenAndServe()`.
- Its documented sandbox security posture (`main.go` header, "Sandbox security... reads ZERO
  secrets — only PORT and LOG_LEVEL... No DB credentials, no API keys, no external service
  credentials in this process env") is a **hard constraint**, not incidental — it has no Telegram
  bot token and none should be added. If the fail-loud alert lived here, either (a) it would need a
  new secret (Telegram token) violating that constraint, or (b) it could only `slog` to stdout,
  which is not "surface loudly" per the fail-loud protocol (nobody reads Go container stdout as an
  alert channel).

**`apps/mcp-server/` already owns every piece this task needs, off-the-shelf:**
- The exact HTTP client: `macroFetch<T>()` (`infrastructure/fetchers/fetchDeadline.ts`) — bounded
  deadline + discriminated `{ok:true,data} | {ok:false,degrade:{reason,status,label}}` envelope,
  **already used** by the existing `get_vn_liquidity_state` MCP tool
  (`interface/mcp/tools/macro/liquidityStateTools.ts`) to call this very endpoint on-demand. The
  new cron reuses `macroFetch` + `getMacroBaseUrl()` verbatim — same call, just cron-triggered
  instead of agent-triggered. `LiquidityStateResponseSchema` (exported from that same file) is
  reusable for response validation — no new DTO/schema needed.
- The scheduler composition root: `startScheduler.ts` + `schedulerJobTable.ts` (`buildJobTable()`
  plain-envelope registry, wraps every job in `jobRunRepo.wrapRun()` for automatic
  `cron_job_runs` bookkeeping) + `cronConfig.ts` (`CRONS` map, `Bun.env.CRON_*` overrides) — the
  exact pattern the sibling `ALPHA-S2-FF-SUB3`/`SUB4` just used for
  `intradayForeignFlow5mCompactorJob` (commits `8c67947de`, `a1265227e`).
- Telegram alerting: `sendTelegramBug()` (`infrastructure/notifiers/telegram.ts`) — persists into
  `telegram_reports` so the dev-team autonomous loop picks up a real outage, plus 4h dedup so a
  short-lived VPS blip doesn't spam. `vpsProxyWatchdogJob.ts` is the established "call remote thing
  on a schedule, alert loudly on failure, never fabricate" precedent to mirror in shape (not
  literally reused — different remote target).

`docs/data/system-map.json` corroborates: `mcp-server`'s microservice entry already has a
populated `.crons[]` array (the exact place new mcp-server cron entries get documented, see
`intraday5mCompactor`/`intradayForeignFlow5mCompactor` rows); `macro-indicators`'s entry has
`"crons": []` and stays that way — it is not a cron-owning service in this codebase.

**Decision: the new job lives in `apps/mcp-server/src/scheduler/macro/`** (sibling folder to
`macroIndicatorRefreshJob.ts`, which already owns "mcp-server's own macro-domain crons" — that job
calls FRED/Yahoo directly for a *different* concern; this new job proxies to the macro-indicators
Go service, a third macro-domain cron shape, same folder).

---

## 2. `sbv_omo_daily` write path + contract — ALREADY DONE, RAW-verified

No DDL work, no contract design needed — fully shipped by P0-3-OMO-CURVE:

```sql
-- apps/macro-indicators/pkg/infrastructure/repository_vmt_omo_daily.go
CREATE TABLE IF NOT EXISTS sbv_omo_daily (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  auction_date            TEXT    NOT NULL UNIQUE,
  add_bn_vnd              REAL    NOT NULL,
  absorb_bn_vnd           REAL    NOT NULL,
  net_outstanding_bn_vnd  REAL    NOT NULL,
  weighted_avg_rate_pct   REAL,
  created_at              TEXT    NOT NULL DEFAULT (datetime('now'))
);
```
Lives in `macro_indicators.db` (`MACRO_DB_PATH`, zone-owned SQLite per ARCH-RATIFY-OMO-1 — never
`market.db`). `Persist()` is `ON CONFLICT(auction_date) DO UPDATE` (idempotent re-fetch-safe).
`NetInjection5d()` / `PrevWeightedAvgRate()` already power the `ALPHA-S4-REGIME-GATE-V1` OMO leg's
`>=5 accrued auctions` gate (`DaysInWindow` honestly reports partial windows).

**Contract from the mcp-server cron's point of view: it writes NOTHING itself.** The response's
`omo_curve` field (non-null) confirms persistence happened server-side; `omo.is_estimate` +
`omo.blocked_reason` signal whether it didn't. This makes the new job side-effect-free on
`market.db` — its only observable actions are (a) triggering the remote persist and (b) alerting
on failure. Nothing for this job to get wrong on the data-integrity axis.

---

## 3. Fail-loud contract

Two distinct failure shapes, deliberately handled differently (avoids the
`freshness-threshold-market-hours-blind` false-positive class — SBV skips auction weeks by design,
already honestly modeled by `DaysInWindow < 5` upstream):

**(a) HARD fail — transport/endpoint/VPS down.** `macroFetch()` returns `{ok:false, degrade}`
(`reason: "deadline" | "http-error" | "network"`). This is unambiguous: "the endpoint/VPS is down"
per the DoD's literal wording. **Always** `sendTelegramBug()` immediately (dedup'd 4h by the
notifier itself) + `logger.error`. No row can exist for today either way — nothing to fake.

**(b) SOFT fail — HTTP 200 but no row persisted.** `result.data.omo.is_estimate === true` /
`omo_curve` null/undefined even though the call succeeded — SBV's OMO HTML fetch/parse failed
*inside* macro-indicators. This is genuinely ambiguous: it could mean "SBV published nothing this
session" (already a modeled, expected outcome — `DeriveStressResult`'s own doc comment: "may be <5
when SBV skips auction weeks (honest partial sum)") **or** "the SBV HTML structure changed and the
parser broke" (a real bug). **Do not alert Telegram BUG on a single occurrence** — `logger.warn`
only. Elevating every no-auction day to a BUG alert would manufacture false incidents out of normal
SBV publishing cadence (the exact `auditor_freshness_threshold_market_hours_blind` /
`passive_health_masks_dead_data` failure classes this codebase has hit before). **Flagged as
optional stretch, not blocking DoD:** a genuine streak-based staleness watchdog (mirror
`vpsProxyWatchdogJob`'s `INSIDER_STALE_MS`-style tolerant-threshold pattern) if OMO soft-fails
persist for several consecutive calendar days — not required to close this task; do not build it
here as scope-creep, name it in the handoff for PM to backlog if desired.

**Either path: the job never writes a placeholder/stale-marked row anywhere.** No local DB write
exists in this design at all (§2) — the invariant is structural, not a runtime check to get right.

---

## 4. New job design

**New file:** `apps/mcp-server/src/scheduler/macro/sbvOmoLiquidityCronJob.ts`, exporting
`runSbvOmoLiquidityCron(deps?)` (same DI-injectable shape convention as
`runIntradayForeignFlow5mCompactor`/`runIntraday5mCompactor` — `baseUrl`/`deadlineMs`/`notifyBug`
injectable for tests, real implementations by default):

```ts
export async function runSbvOmoLiquidityCron(deps?: {
  baseUrl?: string;
  deadlineMs?: number;
  notifyBug?: (msg: string) => Promise<unknown>;
}): Promise<{ persisted: boolean; reason: string }> {
  const baseUrl = deps?.baseUrl ?? getMacroBaseUrl();
  const deadlineMs = deps?.deadlineMs ?? 15_000;
  const notifyBug = deps?.notifyBug ?? ((m: string) => sendTelegramBug(m));

  const result = await macroFetch<unknown>(baseUrl, "/liquidity-state", {}, { deadlineMs });

  if (!result.ok) {
    const msg =
      `[sbv-omo-liquidity-cron] macro-indicators /liquidity-state unreachable ` +
      `(${result.degrade.reason}${result.degrade.status ? " status=" + result.degrade.status : ""}) ` +
      `— sbv_omo_daily did NOT accrue today. Check macro-indicators service / VPS.`;
    logger.error(msg);
    await notifyBug(msg);
    return { persisted: false, reason: `transport:${result.degrade.reason}` };
  }

  const parsed = LiquidityStateResponseSchema.safeParse(result.data); // reuse existing schema
  if (!parsed.success) {
    const msg = `[sbv-omo-liquidity-cron] macro-indicators response failed schema validation — contract drift?`;
    logger.error(msg);
    await notifyBug(msg);
    return { persisted: false, reason: "schema-mismatch" };
  }

  const { omo } = parsed.data;
  if (omo.is_estimate) {
    logger.warn(
      `[sbv-omo-liquidity-cron] reachable but OMO parse degraded ` +
        `(blocked_reason="${omo.blocked_reason ?? "n/a"}") — no row persisted today ` +
        `(may be a legitimate no-auction day).`,
    );
    return { persisted: false, reason: `omo-degrade:${omo.blocked_reason ?? "unknown"}` };
  }

  logger.info(`[sbv-omo-liquidity-cron] sbv_omo_daily row persisted for auction_date=${omo.auction_date}`);
  return { persisted: true, reason: "ok" };
}
```

**`cronConfig.ts` — new `CRONS` entry:**
```ts
/** sbvOmoLiquidityCron — daily trigger of macro-indicators POST /liquidity-state so
 *  sbv_omo_daily accrues (ALPHA-S2-OMO-LIQUIDITY-CRON). Off-market UTC slot (market hours
 *  are 02:00-08:59 UTC per isVnMarketHoursUtc), non-:00/:30 minute mark. 09:09 UTC daily
 *  (16:09 VN) — ~1h after VN market close (15:00 VN), generous buffer past SBV's same-day
 *  OMO auction-result publish window. */
sbvOmoLiquidityCron: Bun.env.CRON_SBV_OMO_LIQUIDITY ?? '9 9 * * *',
```

**`schedulerJobTable.ts` — new `buildJobTable()` plain-envelope entry** (same shape as
`macroIndicatorRefreshJob`/`intradayForeignFlow5mCompactorJob` entries):
```ts
{
  name: 'sbvOmoLiquidityCronJob',
  cron: CRONS.sbvOmoLiquidityCron,
  options: { timezone: 'UTC' },
  runner: async () => {
    const result = await runSbvOmoLiquidityCron();
    return { persisted: result.persisted, reason: result.reason };
  },
},
```
Registered via `registerJobTable()` — automatic `cron_job_runs` success/failure/duration
bookkeeping for free, no bespoke registration needed (unlike `vpsProxyWatchdogJob`'s cooldown-timer
shape, this job has no in-module state to carry between runs).

**No startup one-shot call** (unlike the two compactor jobs) — there is nothing to "backfill";
today's row either exists or it doesn't, calling the endpoint twice on deploy would just re-fetch
the same idempotent row.

**Cadence:** `9 9 * * *` — 09:09 UTC daily (16:09 VN), **not** weekday-gated. Rationale: SBV OMO
soft-fails (§3b) are already non-alerting by design, so a weekend/holiday run is a harmless
`logger.warn` no-op — matches the existing daily (non-M-F-gated) convention of
`insiderCheckJob`/`macroIndicatorRefreshJob` rather than the M-F-gated `foreignFlowAlertJob`. Avoids
the `:00`/`:30` fleet-load marks per constraint #4; `:09` is unused at hour 9 UTC (hour 9 already
has `marketEarningYield` at `:30` — no collision).

---

## 5. Out of scope

- No DDL, no `apps/macro-indicators/` code change of any kind — already 100% shipped (§1/§2).
- No new MCP tool (the existing `get_vn_liquidity_state` proxy is untouched and orthogonal — it
  serves on-demand agent queries; this cron is the missing *scheduled* caller).
- No streak-based OMO-staleness watchdog (§3b) — flagged as optional PM/backlog follow-up, not
  required to close this task's DoD.
- No change to `ALPHA-S4-REGIME-GATE-V1`'s gate logic itself — that task already reads
  `NetInjection5d()`'s `DaysInWindow`; this task's only job is making sure rows start existing.

---

## 6. Acceptance criteria (for PM)

1. `runSbvOmoLiquidityCron()` calls `POST /liquidity-state` via `macroFetch` (reused, not
   reimplemented) with a bounded deadline (15s suggested, matches `get_vn_liquidity_state`'s own).
2. HARD fail (`ok:false` from `macroFetch`) → `sendTelegramBug()` + `logger.error`, every time
   (dedup handled by the notifier's existing 4h window, not re-implemented here).
3. SOFT fail (`omo.is_estimate===true`) → `logger.warn` only, no Telegram BUG alert (test:
   single-day soft-fail does NOT call the mocked `notifyBug`).
4. Success (`omo.is_estimate===false`) → `logger.info`, no alert, no local DB write of any kind
   (test: mocked DB handle, if any, receives zero write calls — confirms the side-effect-free
   design, not just "test passes").
5. Zero new tables/DDL/schema in `apps/mcp-server/` or `apps/macro-indicators/`.
6. Cron + docs registered in the 3 places the sibling ALPHA-S2-FF-SUB4 pattern established:
   `docs/data/cron-registry.json` (`.jobs[]` + `schedulerFileCount` 67→68, ONE new file only),
   `docs/data/system-map.json` (`mcp-server.crons[]` new entry), `docs/standards/cron-jobs.md` (new
   section, same format as adjacent macro/compactor sections).
7. `apps/mcp-server/src/__tests__/1190-pipeline-watchdog.test.ts`'s `schedulerFileCount` guard
   bumped 67→68 with a dated BUMP comment (same convention as the prior 4 bumps in that file).
8. `docs/data/project-stats.json`'s generator-derived `schedulerFileCount`/`cronJobCount` are
   NOT hand-edited — confirm via `bun scripts/gen-project-stats.ts --dry-run` they pick the change
   up on their own (same verification step ALPHA-S2-FF-SUB4 did).
9. Board hygiene: `zone` corrected `"multi"` → `"apps/mcp-server/"` (this brief's own write, §7).

---

## 7. Zone / board correction + PM routing recommendation

Board row `zone` corrected `"multi"` → `"apps/mcp-server/"` in the same `orch-apply.sh` write that
advances `.task_board` / `.head` — same stale BOUNDED-1 routing-placeholder class as both wave-2
siblings.

**Recommendation to PM: do NOT decompose into a multi-subtask epic** like
`ALPHA-S2-TICK-DOWNSAMPLE-5MIN` (5 subtasks) or `ALPHA-S2-FOREIGN-FLOW-WRITE-RACE` (6 subtasks) —
those needed DDL + write-path changes; this task has neither (§1/§2/§5). Mint **one atomic
`dev-mcp-server` task** covering: new job file + `cronConfig.ts` entry + `schedulerJobTable.ts`
registration + 3-file docs sync + `1190-pipeline-watchdog.test.ts` bump + one new unit test file
(HARD-fail / SOFT-fail / success paths, mocked `macroFetch`+`notifyBug`) — all in a single commit,
matching the task's own `size: S` classification. `owner: developer` / `next_agent: dev-mcp-server`
/ `sprint: FLOW-PRICE-ALPHA-LOOP` (unchanged).
