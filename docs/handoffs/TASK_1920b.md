# TASK 1920b — Bond Maturity Poller Scheduler Job

**Sprint:** 1920 | **Tier:** 1 | **Type:** FEATURE | **Zone:** apps/mcp-server/ | **Size:** S
**DDD Layer:** application + infrastructure | **Owner:** dev-mcp-server
**Status:** In Progress (PM assigned)

---

## [PM] Planning Context

**Developer assigned:** dev-mcp-server
**ZONE:** apps/mcp-server/
**Sequencing:** Parallel with 1920a/c (2 at a time, WIP=2). 1920d (broker sanctions) sequenced last due to CRITICAL schema migration pre-condition.
**AC-0 runtime check:** Verify HNX/vnstock source reachability from Docker host at implementation time. Document result as code comment. If VPS proxy required, wire via `VPS_PROXY_URL` env pattern (same as `bctcQueueEnricherJob.ts`).
**Duration estimate:** ~1.5h
**Handoff:** This file is the SSOT. Accept when: AC-0 check documented, file created, cronConfig key added, startScheduler wiring complete, acceptance criteria tests pass.

---

## Context

`bondMaturityStore.ts` (`infrastructure/db/bondMaturityStore.ts`) provides `upsertBond()` with `ON CONFLICT(issuer_code) DO UPDATE`. The store function is already correct and idempotent. However, zero scheduler jobs call it — the `bond_maturity` table is only populated by manual seed or on-demand MCP tool calls.

`news-scout` and `unified-agent` consume `get_bond_maturity_calendar` to detect upcoming bond rolls. A zero-row table produces silent wrong signals (no upcoming maturities = no alerts), which is a data-quality failure with no error visible to the user.

This task creates `bondMaturityPollerJob.ts` under `apps/mcp-server/src/scheduler/macro/` and registers one new cron in `cronConfig.ts` and `startScheduler.ts`.

**Pre-condition check (AC-0 — source reachability from France):** The architect brief (ARCH-1920 §3, R-2) confirms that HNX/SSC bond portal is geo-accessible from France (not geo-blocked). Direct HTTP fetch to `hnx.vn` is viable without VPS proxy. If the developer's integration test confirms geo-block at implementation time, route through `VPS_PROXY_URL` using the same pattern as `bctcQueueEnricherJob.ts`. This check is AC-0 and must be resolved before the job is merged.

---

## Requirements

### FR-1 — Weekly bond maturity fetch and upsert
**DDD layer:** application

Register a weekly cron (`bondMaturityPoller`, Sunday 02:30 UTC = 09:30 VN) that fetches upcoming bond maturities for watchlist issuers and calls `upsertBond()` for each record.

Source options (developer chooses at implementation time per AC-0 outcome):
- Option A: vnstock `bond` endpoint — direct API, no VPS required.
- Option B: HNX bond-issuance calendar scrape via `hnx.vn` — direct from France (geo-accessible per ARCH-1920). If geo-blocked observed at runtime, add VPS proxy route.

### FR-2 — Zero-row alert on WORK channel
**DDD layer:** infrastructure

If the fetch returns zero bond records, send `send_telegram(channel="work")` with a clear alert: `[bondMaturityPoller] Zero bond records returned — bond_maturity table may be stale`. A zero-row result is not a silent success — downstream agents depend on this data.

### FR-3 — Fail-loud on fetch error
**DDD layer:** infrastructure

If the fetch throws (network error, HTTP 4xx/5xx, parse error), send `send_telegram(channel="work")` with job name + error summary. Use WORK channel (data-pipeline failure), not BUG.

### FR-4 — recordJobRun observability
**DDD layer:** infrastructure

Wrap the job body in `recordJobRun(db, jobName, fn)`. `cron_job_runs` tracks status, rows_written, error_msg per run.

### FR-5 — cronConfig.ts addition
**DDD layer:** infrastructure

Append to the `CRONS` export:

```
bondMaturityPoller: Bun.env.CRON_BOND_MATURITY_POLLER ?? '30 2 * * 0'
```

Override via `CRON_BOND_MATURITY_POLLER` env var. No side-effects at module load.

### FR-6 — startScheduler.ts wiring
**DDD layer:** infrastructure

Import and register the cron function from `bondMaturityPollerJob.ts` in `startScheduler.ts`. Zone: `macro/`.

### NFR-1 — Idempotency
`upsertBond()` uses `ON CONFLICT(issuer_code) DO UPDATE`. Repeated Sunday runs are safe — existing bond records are updated (amount/maturity_date may change as issuers amend filings).

### NFR-2 — VPS proxy pattern (conditional)
If Option B (HNX scrape) is chosen and geo-block is confirmed, the job must read `process.env.VPS_PROXY_URL` and route the HTTP request through it — same pattern as `bctcQueueEnricherJob.ts`. The env var name must not be hardcoded in the job body; read from a shared env accessor.

---

## Acceptance Criteria

- AC-0 (source reachability — MUST resolve before merge): Developer verifies whether `hnx.vn` or vnstock `bond` endpoint is reachable from the Docker host without VPS proxy. Document the result as a comment in the job file. If VPS required, wire `VPS_PROXY_URL` before merge.
- AC-1 (cadence): `bondMaturityPoller` fires Sunday 02:30 UTC. Verifiable in `cron_job_runs`.
- AC-2 (coverage): After first successful run, `SELECT COUNT(*) FROM bond_maturity` >= 5 upcoming bonds for watchlist issuers.
- AC-3 (zero-row alert): Unit test — when fetcher returns `[]`, `sendWorkFn` spy called with zero-row warning message.
- AC-4 (fetch error): Unit test — when fetcher throws, `sendWorkFn` spy called with error summary; job does not rethrow.
- AC-5 (upsert): Integration test — running the job twice with the same bond data produces `COUNT(*) = N` (no duplicates), not `2N`.
- AC-6 (recordJobRun): `cron_job_runs` row inserted per run with `status` and `rows_written`.

---

## Edge Cases

- Partial fetch: HNX may return bonds for some tickers but not others (pagination or per-issuer query). Accumulate results across all tickers; total rows_written = sum of all upserted records.
- Bond record with null `maturity_date`: `upsertBond()` must tolerate nulls in optional fields — do not coerce to sentinel value.
- Issuance amended: same `issuer_code` appears with different `maturity_date` — upsert updates the row. This is the correct behavior (bond terms can change pre-issuance).
- VN locale: bond amounts are in tỷ đồng (billion VND) on HNX portal. Ensure unit is preserved as-is in the `bond_maturity` table — no conversion to triệu đồng.

---

## Files Changed (expected)

- `apps/mcp-server/src/scheduler/macro/bondMaturityPollerJob.ts` — NEW file
- `apps/mcp-server/src/scheduler/cronConfig.ts` — append `bondMaturityPoller` key
- `apps/mcp-server/src/scheduler/startScheduler.ts` — import + register cron function
- `apps/mcp-server/src/__tests__/1920b-bond-maturity-poller-job.test.ts` — NEW test file

---

## Blockers

**SD-1 (developer-resolvable, not a PO blocker):** AC-0 — confirm source reachability (HNX direct vs VPS) at implementation time. This is a dev-time integration check, not a business decision. If VPS is required, wire `VPS_PROXY_URL`; no new PO approval needed.

No PO questions required.

---

## Test Criteria Summary

| AC | Test type | Pass condition |
|----|-----------|----------------|
| AC-0 | Manual integration check | Source accessible from Docker host; finding documented as code comment |
| AC-1 | Unit (cron expression) | `CRONS.bondMaturityPoller === '30 2 * * 0'` |
| AC-2 | Integration | `SELECT COUNT(*) FROM bond_maturity` >= 5 after job run |
| AC-3 | Unit | Empty fetcher result → `sendWorkFn` spy called with zero-row warning |
| AC-4 | Unit | Fetcher throws → `sendWorkFn` spy called; no rethrow |
| AC-5 | Integration | Two runs same data → row count unchanged (upsert) |
| AC-6 | Unit | `recordJobRunSpy` receives status + rows_written |
