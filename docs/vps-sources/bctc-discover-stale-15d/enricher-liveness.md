# Enricher Liveness — B-05-FU-ENRICHER-LIVENESS

**Date:** 2026-07-02 ~00:00 UTC (probes at 2026-07-01T23:24Z–2026-07-02T00:xxZ)
**Agent:** dev-mcp-server (probe-only, no speculative code change)
**Task:** B-05-FU-ENRICHER-LIVENESS — follow-up to B-05-FIX (CORROBORATED-BROKEN,
SSC portal 503 outage). Confirm whether `bctcQueueEnricherJob` is actually firing,
and reconcile the 38-row `bctc_vps_queue` backlog composition.

---

## VERDICT

1. **Job liveness: ALIVE, not dead.** `bctcQueueEnricherJob` fires exactly on its
   `*/15 * * * *` cron schedule, has run **6214 times** since 2026-04-23 08:45 UTC,
   **zero errors ever recorded**, most recent run 2026-07-01 23:15:01 (status=success).
2. **Backlog composition: GROWN, not the same historical set.** The 38 rows
   (36 `url_not_found` + 2 `enrich_failed` — exactly matches the auditor's gate count)
   now include **23 new HOSE-listed rows** beyond the 2026-06-25 known HNX/UPCOM
   non-filer set (15 rows: BDI/DAG/DLC/JSH/SIS/VDC/VNH/VEA + Q4-2025/Q1-2026 variants).
3. **Root cause of non-draining is NOT the job being dead, and is NOT (currently) the
   SSC outage.** It is a separate, pre-existing code defect: the enricher's
   grace-period retry arm (Arm 2) can **structurally never re-select** any of the 23
   new HOSE rows, because the SQL UPDATE statements that terminalize a row
   (`incrementAttemptsStmt`, `markUrlNotFoundStmt`) never write `last_attempt`, while
   Arm 2 requires `last_attempt IS NOT NULL`. Combined with `enrich_failed` not being
   selected by *either* arm at all, this makes these rows **permanently excluded from
   re-discovery**, independent of whether SSC is up or down.
4. **No code change made** — per task constraint ("if the job is provably DEAD: fix +
   rebuild — otherwise NO code change") and because the job is provably alive. This
   doc recommends the dispatcher/PM open a **new, separate fix task** for the
   last_attempt/Arm-2 defect (see § Recommendation).

---

## 1. Job liveness — raw evidence

### Source location
- Job impl: `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts`
  (`runBctcQueueEnricherJob`)
- Cron registration: `apps/mcp-server/src/scheduler/startScheduler.ts:349`
  ```
  scheduleCron(CRONS.bctcQueueEnricher, async () => {
    await jobRunRepo.wrapRun('bctcQueueEnricherJob', async () => {
      const result = await runBctcQueueEnricherJob()
      return { rowsWritten: result.urlsPopulated }
    })
  }, { timezone: 'Asia/Ho_Chi_Minh' })
  ```
- Schedule: `apps/mcp-server/src/scheduler/cronConfig.ts:30` —
  `bctcQueueEnricher: Bun.env.CRON_BCTC_QUEUE_ENRICHER ?? '*/15 * * * *'`
  (env var unset in the live container → default `*/15 * * * *` in effect).
- Execution path Strategy 0 (hsx.vn, no VPS/SSC dependency) →
  `infrastructure/fetchers/hsxBctcFetcher.ts::fetchHsxBctcUrls`. Strategy 1 (VPS
  Playwright, hits `/proxy/bctc-discover/:ticker` via `BCTC_DISCOVER_URL`) →
  `infrastructure/fetchers/bctcHttpFetcher.ts::bctcHttpFetch`. Both wired in
  `domain/services/bctcDiscovery.ts::discoverHosePdfUrls`.
- Container confirms `BCTC_DISCOVER_URL=http://125.212.251.27:8765/proxy/bctc-discover`
  is correctly set (`docker exec vn-market-intelligence-mcp-mcp-server-1 sh -c 'echo $BCTC_DISCOVER_URL'`).

### Live container
```
$ docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | grep mcp-server
vn-market-intelligence-mcp-mcp-server-1  vn-market-intelligence-mcp-mcp-server  Up 56 minutes (healthy)

$ docker inspect vn-market-intelligence-mcp-mcp-server-1 --format '{{.State.StartedAt}} {{.Image}}'
2026-07-01T22:27:16.555149731Z sha256:33fea3bafe16bbb389957cd643630ac64c64ff8a7750b02d7b2f093c1c00a025
```

### Job-run bookkeeping (`cron_job_runs` table, live named-volume `/app/data/market.db`)
```
SELECT MIN(rows_written), MAX(rows_written), SUM(rows_written>0), COUNT(*),
       MIN(started_at), MAX(started_at)
FROM cron_job_runs WHERE job_name='bctcQueueEnricherJob';
→ { mn: 0, mx: 14, nonzero: 20, total: 6214, earliest: "2026-04-23 08:45:00", latest: "2026-07-01 23:15:01" }

SELECT COUNT(*) FROM cron_job_runs WHERE job_name='bctcQueueEnricherJob' AND status='error';
→ { c: 0 }
```
Last 20 runs (2026-07-01 20:15Z–23:15Z), every one `status=success`, `duration_ms` 0-5ms,
`rows_written=0` for all of them (expected — see § 2, no `pending` rows currently exist
to select). Runs land in pairs at `:00`/`:01` seconds for most 15-min slots — this is
`scheduleCron`'s `recoverMissedExecutions: true` catch-up wrapper
(`apps/mcp-server/src/scheduler/startupHelpers.ts:230`, by design, not a bug —
T2-ARCH-CRON-RECOVER-JITTER), not a double-fire defect; the job is idempotent per-row.

**Container logs:** `docker logs ... --since 6h | grep -i bctcQueueEnricher` → **0 lines**.
This is *expected*, not evidence against liveness — the job's code path only emits a
`logger.*` line when `queueItems.length > 0` or the orphan-resync arm finds rows; the
zero-item happy path (current state) returns silently. The `cron_job_runs` DB rows are
the authoritative liveness signal here, and they are conclusive: 6214 runs, perfect
15-min cadence, zero errors, latest run 9 minutes before this probe.

**Conclusion: the job is not the failure mode being probed for.** It is alive, healthy,
and has been running reliably for the entire 2026-04-23→2026-07-01 window.

---

## 2. Backlog composition — raw evidence

Live-volume query (`docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e '...'`
against `/app/data/market.db`, bun:sqlite — NOT a host-side copy):

```
SELECT status, COUNT(*) FROM bctc_vps_queue GROUP BY status;
→ deferred_infra: 328, done: 65, url_not_found: 36, enrich_failed: 2
```
`36 + 2 = 38` — matches the auditor's gate count exactly (`status IN
('pending','url_not_found','enrich_failed')`). **There are currently ZERO `pending`
rows in the entire queue.**

### Full 38-row dump (ticker / period / status / attempts / last_attempt)

Known 2026-06-25 HNX/UPCOM non-filer set (confirmed genuine non-filers, unaffected by
SSC since HNX/UPCOM use a different discovery path) — **15 rows, unchanged**:
`BDI` (Q4-2025, Q1-2026), `DAG` (Q4-2025, Q1-2026), `DLC` (Q4-2025, Q1-2026),
`JSH` (Q4-2025, Q1-2026), `SIS` (Q4-2025, Q1-2026), `VDC` (Q4-2025, Q1-2026),
`VNH` (Q1-2026 only), `VEA` (Q4-2025, Q1-2026). All attempts=6-7, all `last_attempt=NULL`.

**NEW since 2026-06-25 — 23 rows, all HOSE-listed, all created 2026-04-28/04-30**
(i.e. **not new arrivals from today's SSC outage** — these are old rows that were
already terminalized weeks before the outage started):

| Ticker | Period | Status | Attempts | last_attempt | created_at |
|---|---|---|---|---|---|
| ACB | Q4-2025 | url_not_found | 6 | NULL | 2026-04-28 |
| ACV | Q4-2025 | url_not_found | 6 | NULL | 2026-04-28 |
| BID | Q4-2025 | url_not_found | 1 | NULL | 2026-04-28 |
| CTG | Q4-2025 | url_not_found | 6 | NULL | 2026-04-28 |
| D2D | Q4-2025 | url_not_found | 6 | NULL | 2026-04-28 |
| DHG | Q4-2025 | url_not_found | 6 | NULL | 2026-04-28 |
| EIB | Q4-2025 | url_not_found | 1 | NULL | 2026-04-28 |
| GAS | Q4-2025 | url_not_found | 6 | NULL | 2026-04-28 |
| GVR | Q4-2025 | url_not_found | 6 | NULL | 2026-04-28 |
| HCM | Q4-2025 | url_not_found | 6 | NULL | 2026-04-28 |
| HSG | Q4-2025 | url_not_found | 6 | NULL | 2026-04-28 |
| HVN | Q4-2025 | url_not_found | 6 | NULL | 2026-04-28 |
| MBB | Q4-2025 | url_not_found | 6 | NULL | 2026-04-28 |
| NKG | Q4-2025 | url_not_found | 6 | NULL | 2026-04-28 |
| POW | Q4-2025 | url_not_found | 6 | NULL | 2026-04-28 |
| SSI | Q4-2025 | url_not_found | 6 | NULL | 2026-04-28 |
| VCB | Q1-2025 | **enrich_failed** | 0 | 2026-06-15 | 2026-04-14 |
| VCB | Q1-2026 | **enrich_failed** | 1 | 2026-06-15 | 2026-04-30 |
| VCI | Q4-2025 | url_not_found | 6 | NULL | 2026-04-28 |
| VHM | Q4-2025 | url_not_found | 6 | NULL | 2026-04-28 |
| VIC | Q4-2025 | url_not_found | 6 | NULL | 2026-04-28 |
| VPB | Q4-2025 | url_not_found | 6 | NULL | 2026-04-28 |
| VRE | Q4-2025 | url_not_found | 6 | NULL | 2026-04-28 |

**Answer to the task's composition question: the set has GROWN**, more than doubling
(15 → 38 rows), by adding 23 HOSE tickers — but the growth happened **weeks before**
today's SSC outage and is **not caused by it**.

---

## 3. Why these 23 rows can never drain — the real root cause

### The bug
`bctcQueueEnricherJob.ts` selects rows to (re-)enrich via two arms:
- **Arm 1** (`status = 'pending'`) — none of the 38 backlog rows qualify (0 `pending`
  rows exist in the whole table right now).
- **Arm 2** (grace-period retry, line 314-319):
  ```sql
  status = 'url_not_found'
  AND last_attempt IS NOT NULL
  AND last_attempt < datetime('now', '-7 days')
  AND attempts < 6
  ```

But the statements that *write* a row into `url_not_found` never populate
`last_attempt`:
```ts
// bctcQueueEnricherJob.ts:434-439
const incrementAttemptsStmt = db.prepare(
  `UPDATE bctc_vps_queue SET attempts = attempts + 1 WHERE id = ?`);   // no last_attempt
const markUrlNotFoundStmt = db.prepare(
  `UPDATE bctc_vps_queue SET status = 'url_not_found', attempts = attempts + 1 WHERE id = ?`); // no last_attempt
```
Result: 21 of the 23 new rows have `last_attempt = NULL` forever →
`last_attempt IS NOT NULL` never true → Arm 2 never matches → **permanently excluded**,
regardless of source availability. The remaining 2 rows (VEA-style pattern; e.g. the one
row that *does* have `last_attempt` set) fail the `attempts < 6` guard instead
(`attempts=6-7` on every row observed). `enrich_failed` (the 2 VCB rows) is not
referenced by *either* arm's WHERE clause — those rows are invisible to the enricher
entirely, by design gap, not by timing.

This exact class of bug was already hit and hand-patched **once** for a single row:
`apps/mcp-server/src/migrations/reset-ppc-q4-2025.ts` (one-shot, not in
`runMigrations()`), whose own comment says: *"row exhausted 6 enricher attempts before
FIX-CTG-1 + FIX-VPS-SSC-CURL-SCRAPER shipped. `last_attempt=NULL` means Arm 2
(grace-period) can never fire. Manual reset required."* — i.e. this is a **recurring**,
previously-diagnosed defect (see global lesson: recurring bug 2+ → block/escalate),
not a fresh discovery, but it was never fixed at the root (only worked around for one
ticker/quarter).

A related removed safety net compounds this: `schema-financial-reports.ts:695-706`
documents that a startup-reset (`resetQ1UrlNotFound`) was **intentionally removed**
under FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH, on the stated assumption that "the
Arm 2 grace-period query ... already provides the correct bounded grace-period retry —
no startup reset needed." That assumption is false for any row where `last_attempt`
was never set — which, per the live data, is the *majority* case.

### Proof the discovery gap is real, not just theoretical (live probe, no code change)
Direct calls to the **same production API** the enricher's Strategy 0 uses
(`api.hsx.vn`, no VPS/SSC dependency — confirmed working from France since
2026-05-15 per the fetcher's own docblock):

```
$ curl https://api.hsx.vn/l/api/v1/1/securities/stock?code=GAS  (type/Origin/Referer headers)
→ {"data":{"list":[{"id":2496,"code":"GAS", ...}]}, "success":true}

$ curl https://api.hsx.vn/m/api/v1/1/mediafiles/5/2496?pageIndex=1&pageSize=100&year=2025
→ includes: {"time":"04.2025","type":"Quý","fileName":"20260202 - GAS - Bao cao tai
   chinh Quy 4. 2025 HN.pdf", ...}
```
**GAS Q4-2025 has a real, discoverable PDF on hsx.vn**, published 2026-02-02 — before
the `bctc_vps_queue` row for GAS/Q4-2025 was even created (2026-04-28) and long before
it was terminalized to `url_not_found`. The row's terminal state is a **false
terminal**: the data exists and Strategy 0 (which has zero SSC dependency) can fetch it
today, but the code will never try again because of the `last_attempt` gap above. This
row (and, by the identical mechanism, the other 22 HOSE rows) was very likely
terminalized using only the pre-TASK-BCTC-3b codebase (Strategy 0 shipped 2026-05-15,
after this row's 2026-04-28 creation date) and has been silently stuck ever since.

### Relationship to the SSC outage (parent B-05-FIX)
**Independent.** These 23 rows never reach a network call at all under current code —
they are excluded at the SQL `SELECT` stage before any `discoverHosePdfUrls()` call is
made. Today's SSC 503 outage is irrelevant to draining this specific backlog (Strategy 0
doesn't touch SSC; these rows are never even attempted). The outage *would* matter for
brand-new `pending` rows requiring Strategy 1 fallback — but zero such rows currently
exist in the queue.

---

## 4. Recommendation (no code change made in this task)

Per task constraints, no code change was made — the job is provably alive, and fixing
the Arm 2 / `enrich_failed` gap is a distinct defect from the liveness question this
task was scoped to. Recommend the dispatcher/PM open a **new fix task** (e.g.
`FIX-BCTC-ENRICHER-STUCK-BACKLOG` or similar) covering:
1. Set `last_attempt = datetime('now')` in `incrementAttemptsStmt` and
   `markUrlNotFoundStmt` (root cause — makes future terminalizations retry-able).
2. Extend Arm 2 (or add an Arm 3) to also select `status = 'enrich_failed'` rows.
3. One-time backfill/reset for the 23 currently-stuck rows (same pattern as
   `reset-ppc-q4-2025.ts`, generalized — reset to `pending`/`attempts=0`/
   `last_attempt=NULL` so the next `*/15` cycle picks them up via Arm 1) — this is
   what will actually let real Q4-2025 filings like GAS get discovered via the
   already-working hsx.vn Strategy 0, independent of the SSC outage's resolution.

This is flagged as a **recurring bug class** (2nd known occurrence, same mechanism as
the PPC Q4-2025 one-shot patch) — per standing policy this should be prioritized
rather than hand-patched a third time.

---

## 2026-08-29 update — FIX-BCTC-DATA-GAP-FAMILY U1 (developer)

The Arm-2 grace bound quoted in §3 above (`AND attempts < 6`) has been widened to
`AND attempts <= MAX_ENRICH_ATTEMPTS + 1` (i.e. `<= 6`, `< 7`) in
`bctcQueueEnricherJob.ts`. Rationale: `markUrlNotFoundStmt` sets `attempts=attempts+1`
when `item.attempts >= MAX_ENRICH_ATTEMPTS(5)`, so every `url_not_found` row landed at
`attempts=6` and the old `< 6` bound permanently excluded exactly the rows this job
itself terminalizes from the 7-day-grace re-discovery pass the 2026-07-02 fix intended.
A row at `attempts=6` past grace is now re-eligible; the `last_attempt < -7 days` gate
still bounds churn. Additionally a new `deferred_infra` NULL-URL recycle arm reopens
rows parked with `source_url IS NULL` (293 live rows were unreachable by all three
arms), and `bctcPdfPullJob.ts` reroutes non-pull-eligible http(s) `pending` URLs back
to the enricher (single discovery owner). See the architect brief
`docs/architecture-briefs/2026-08-28-fix-bctc-data-gap-family.md` U1.
