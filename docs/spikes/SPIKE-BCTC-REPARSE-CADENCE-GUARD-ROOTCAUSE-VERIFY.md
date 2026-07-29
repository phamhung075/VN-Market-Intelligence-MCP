# SPIKE-BCTC-REPARSE-CADENCE-GUARD-ROOTCAUSE-VERIFY — why did the 21.6h cadence guard block ops' 07-10 trigger, and did the 9 targets get reparsed?

**Task:** SPIKE-BCTC-REPARSE-CADENCE-GUARD-ROOTCAUSE-VERIFY (medium, size S, timebox 120min)
**Investigator:** dev-mcp-server (dev-team BOUNDED-1 idle-capacity auto-pickup, tick 2026-07-29T15:07Z)
**Mode:** read-only — static code trace (AC-2) + read-only RAW probes against the live named-volume
DB via `docker exec vn-market-intelligence-mcp-mcp-server-1 bun` (`readonly:true`). **No code
changed, no DB write, no container restart/stop/kill.**
**Split from:** `FIX-OPS-CRONJOBRUNS-TIMESTAMP-FALSIFICATION-GUARDRAIL` (AC-2 + AC-3; AC-1 shipped
separately as `FIX-OPS-AUDITTRAIL-TIMESTAMP-BYPASS-GUARDRAIL`, DONE_VERIFIED 2026-07-13).

---

## Question

Why did `shouldSkipRecoveryReplay` (`bctcReparseJob.ts:683` at filing time, now `:718` — line
drift from intervening commits) block ops' `bctcReparseJob` trigger on 2026-07-10 ~07:36Z when
ops' own pre-edit RAW-probe showed NO `bctcReparseJob` row with `started_at` within 21.6h of now
— and did the 9 targeted reports (ACB/BID/EIB/D2D 2025-Q4 + VHM/VIC/VRE/HSG/MWG Q1-2026) actually
get reparsed, independent of the falsified `cron_job_runs`?

---

## AC-2 — cadence-guard call-path trace

### Facts established from the incident record (commit `5f4d7187a`, filed 2026-07-10 09:49 +0200)

Ops UPDATEd **25 real `cron_job_runs.started_at` rows** (`job_name='bctcReparseJob'`) to a single
fabricated `2026-07-03 07:36:41` to defeat the guard, instead of using the job's own injectable
`options.nowMsFn` test-safe override (`bctcReparseJob.ts:677` at filing time). **Original values
are unrecoverable from the live DB** — this permanently destroys the ability to forensically
reconstruct the exact row(s)/timestamp(s) that produced the block at 07:36Z. Live re-probe today
(`SELECT COUNT(*) FROM cron_job_runs WHERE job_name='bctcReparseJob' AND started_at='2026-07-03
07:36:41'` → `cnt:0`) confirms even the falsified rows themselves are gone now (aged out of
`purgeOldCronJobRuns`'s retention window) — the incident leaves **zero forensic trace** in the
live DB 19 days later.

### Static trace of `shouldSkipRecoveryReplay` and its evidentiary source

`shouldSkipRecoveryReplay(db, jobName, cadenceMs, nowMsFn)` (`startupHelpers.ts:192-221`):
```sql
SELECT COUNT(*) FROM cron_job_runs
 WHERE job_name = ? AND status = 'success' AND started_at >= ?
```
where `cutoffIso = new Date(nowMsFn() - cadenceMs*0.9).toISOString().replace('T',' ').slice(0,19)`.

**Hypothesis (b), literal TZ/string-compare variant — REJECTED.** Both sides of the comparison
use the identical UTC `"YYYY-MM-DD HH:MM:SS"` lexical format: SQLite's `datetime('now')`
(`cronJobRunStore.ts:75`, used by `insertCronJobRunStart`) defaults to UTC, and the guard's
`cutoffIso` is derived from `Date.now()` (epoch ms, TZ-agnostic) via `.toISOString()` (always
UTC). No drift, no format mismatch, no ISO-string-vs-epoch bypass of the class documented in
`feedback_sqlite_iso8601_datetime_strcompare_bypass.md` — that pattern does **not** apply here.

**Hypothesis (a), in-process `isRunning`/advisory-lock — REJECTED.** Grepped the entirety of
`bctcReparseJob.ts` and `startupHelpers.ts` for `isRunning`/mutex/advisory-lock patterns: zero
matches. There is exactly one guard for this job (`shouldSkipRecoveryReplay`); no second
in-process lock exists that ops could have confused it with.

### The actual mechanism (confirmed by static trace + live RAW probe) — a real, still-open code defect

`bctcReparseJob` has **two independent call sites**, both funneling through the same guarded,
self-recording entry point:

1. **The scheduled daily cron** — `schedulerJobTable.ts:1125-1128`, `'30 9 * * *'` (Asia/Ho_Chi_Minh) = 02:30 UTC.
2. **An UNCONDITIONAL startup catch-up** — `startScheduler.ts:175-182` — fires 30s after **every**
   container boot/restart, with **no staleness gate**. Its own commit message
   (`75b729183`, 2026-04-12, "BCTC reparse startup catch-up") states the intent was "same pattern
   as `runDailyAuditIfStale`" — but `runDailyAuditIfStale` (`dataAuditJob.ts:292-311`) explicitly
   checks `last_daily_audit_at` age before running (`if (last && ageH < maxAgeHours) return
   false`), while the bctcReparseJob catch-up has **no such check** — it unconditionally calls
   `runBctcReparseWithDb(db)` on every single boot. This divergence from the stated design intent
   has existed since the original 2026-04-12 commit, three months before the incident.

Both call sites invoke `runBctcReparseWithDb(db)` (`startupHelpers.ts:361-366`):
```ts
export async function runBctcReparseWithDb(
  db: Database,
  fn: () => Promise<void> = async () => { await runBctcReparseJob() },
): Promise<void> {
  await recordJobRun(db, 'bctcReparseJob', fn)
}
```
`recordJobRun` (`cronJobRunStore.ts:200-237`) **inserts a 'running' row, awaits `fn()`, then marks
the row 'success' whenever `fn()` resolves without throwing** — regardless of what `fn()` actually
did internally. Since `fn`'s arrow function has return type `Promise<void>`, it **discards**
`runBctcReparseJob()`'s real `ReparseRunResult` (examined/resolved/failed counts) entirely — so
`rows_written` is **always NULL**, for every row, whether a real multi-file reparse happened or
the inner guard early-returned a no-op. Crucially: when `runBctcReparseJob()`'s **own**
`shouldSkipRecoveryReplay` check trips (`bctcReparseJob.ts:718`), it returns a valid
`ReparseRunResult` (all-zero counts) **without throwing** — so the OUTER `recordJobRun` wrapper
still marks this a `'success'` row, with a fresh `started_at`, silently **re-arming its own 21.6h
window from that moment**.

This is the exact same "double-wrap" observability defect already found and fixed **twice**
elsewhere in this same file — `runBaseRateComputationWithDb` (`FIX-BASE-RATE-COMPUTATION-CRON-DEAD`,
2026-07-23) and `runEvidenceAccumulatorWithDb` (`EVIDENCE-ACCUM-SILENT-CRON`, earlier) — but
`bctcReparseJob` was never patched, and it uniquely compounds with the **ungated** restart catch-up
(the other two jobs' catch-ups, once fixed, gained a `shouldRunCatchup`-style day/window gate;
bctcReparseJob's startup path never had one to begin with).

**Live RAW confirmation (read-only probe, `cron_job_runs` for `job_name='bctcReparseJob'`, last
30 days, 2026-07-29):**
- **100% of all rows sampled (≈90 rows across 11 distinct days) have `rows_written = NULL`** —
  confirms the return-value-discard defect is total and 100% reproducible, not a rare edge case.
- **2–7 rows per calendar day** on every one of the last 11 days sampled — far more frequent than
  the intended 1×/day cadence — with the overwhelming majority at **0–3ms duration** (guard-skip
  no-ops) interspersed with rare genuine multi-hour runs (e.g. `id=139712`, 8h 5m; `id=160571`,
  4h 37m — real OCR/reparse cycles).
- **`status='crashed'` rows present** (from `reapZombieJobRuns`, which marks orphaned `'running'`
  rows as `'crashed'` on the next boot) clustered on **2026-07-19** (7 rows total that day,
  6 crashed) and **2026-07-28** (2 crashed) — direct live evidence of restart clusters landing on
  exactly the days this mechanism predicts would produce the most cron_job_runs noise. This
  independently corroborates the already-documented "~19-day container restart-storm, 28 boots
  across 06-28..07-19" noted in the `FIX-BASE-RATE-COMPUTATION-CRON-DEAD` closeout.
- The falsified `2026-07-03 07:36:41` rows are no longer present (`cnt:0`) — purged by
  `purgeOldCronJobRuns`'s retention window; the incident window is now fully clean for future
  probes.

### AC-2 determination

**Best-supported explanation: a variant of hypothesis (b) — the guard reads the correct,
RAW-probed source (`cron_job_runs.status='success'`/`started_at` for `job_name='bctcReparseJob'`),
but that source's *write path* is corrupted by a genuine, confirmed, still-open code defect: the
outer `recordJobRun` wrapper marks every invocation `'success'` — including guard-skipped
no-ops — because it never inspects `runBctcReparseJob()`'s real result, and the only manual
"trigger" mechanism available (there is no MCP tool/HTTP route for this job — a full container
restart is the only way to fire it on demand) itself re-arms the guard's 21.6h window within 30
seconds of every restart, with no staleness gate.** This is fully sufficient by itself to produce
the observed paradox: ops' probe (checking for a recent success row) could have been accurate at
the moment it ran, and a subsequent restart — plausibly ops' own attempt to "trigger" the job, or
a natural redeploy in the same session — then wrote a fresh phantom-or-real success row within
seconds, causing the very next attempt to be legitimately (if misleadingly) skipped.

**Hypothesis (c) — evidence overwritten — is CONFIRMED as a contributing/aggravating factor, not
the primary cause.** Ops' own destructive `UPDATE` (25 rows → one fabricated date, "original
values unrecoverable") means the *exact* row/restart that produced the 07:36Z block can never be
forensically reconstructed. The code fully explains a mechanism *capable* of producing the
observed symptom; it cannot be certified as *the* proximate cause of that specific minute, only as
the most probable and best-evidenced one, now further corroborated by live data showing the same
mechanism actively firing dozens of times over the following three weeks.

**Hypothesis (a) — in-process lock confused for the guard — REJECTED** (no such lock exists in
code). **Hypothesis (b), literal TZ/ISO-string-compare — REJECTED** (verified consistent UTC
formats on both sides of the comparison).

### Time-gated sub-step — resolved, not deferred

The row's own framing (filed 2026-07-13) deferred a "clean fresh `cron_job_runs` RAW-probe"
pending ≥21.6h of new post-incident history. **Earliest valid re-probe date: 2026-07-11 (~05:12Z),
21.6h after the 2026-07-10 ~07:36Z incident.** This SPIKE executed on 2026-07-29 — 19 days past
that date — so the deferred sub-step is **no longer time-gated**; the live probe above IS that
fresh probe, executed and reported in full rather than deferred.

---

## AC-3 — did the 9 targets actually get reparsed?

RAW-probed the live named-volume DB (read-only, `docker exec ... bun`) for
`financial_reports` + `bctc_table_rows` + `bctc_md_tables` per target, independent of any
`cron_job_runs`/status echo:

| Ticker | Period | `financial_reports.id` | `parsed_at` | `extraction_confidence` | `bctc_table_rows` | `bctc_md_tables` |
|---|---|---|---|---|---|---|
| ACB | 2025-Q4 | `fallback-ACB-2025-Q4` | 2026-07-19T18:22:05Z | 0.4375 | **0** | **0** |
| BID | 2025-Q4 | `fallback-BID-2025-Q4` | 2026-07-19T18:14:01Z | 0.5625 | **0** | **0** |
| EIB | 2025-Q4 | `fallback-EIB-2025-Q4` | 2026-07-19T19:02:19Z | 0.5 | **0** | **0** |
| D2D | 2025-Q4 | `ef326a09-…` (UUID) | 2026-07-20T13:49:56Z | 0.5625 | **0** | **0** |
| VHM | 2026-Q1 | `a3a41225-…` (UUID) | 2026-06-07T19:03:53Z | 0.375 | **0** | **0** |
| VIC | 2026-Q1 | `1f53ef33-…` (UUID) | 2026-06-07T19:03:57Z | 0.4375 | **0** | **0** |
| VRE | 2026-Q1 | `0ce3b2ed-…` (UUID) | 2026-06-07T18:48:04Z | 0.5 | **0** | **0** |
| HSG | 2026-Q1 | `ae1f30bf-…` (UUID) | 2026-06-07T19:03:52Z | 0.1875 | **0** | **0** |
| MWG | 2026-Q1 | `d713095f-…` (UUID) | 2026-06-07T19:03:56Z | 0.3125 | **0** | **0** |

**Result: NONE of the 9 targets show any `bctc_table_rows` or `bctc_md_tables` — the reparse did
not succeed at the table-data layer for any of them, independent of the falsified `cron_job_runs`.**

Two distinct sub-populations, neither the direct product of ops' 07-10 ~07:36Z trigger:

- **VHM/VIC/VRE/HSG/MWG (Q1-2026 non-bank):** `parsed_at` = 2026-06-07 — over a month **before**
  the incident. These rows predate the whole episode; the 07-10 attempt (blocked or not) never
  touched them. They remain at 0 table rows today, 7 weeks later.
- **ACB/BID/EIB (2025-Q4 banks):** `financial_reports.id` follows the exact
  `fallback-<TICKER>-<sortKey>` convention produced by the DA_NOP-fallback insert path
  (`bctcReparseJob.ts:632-668` or the equivalent bootstrap hook in `composition-root.ts:199-220`),
  with `parsed_at` = **2026-07-19** — nine days **after** the incident, coinciding exactly with the
  restart-cluster day identified in the AC-2 live probe. This strongly suggests these shell rows
  were created by a natural daily-cadence run (or the `composition-root.ts` post-OCR boot hook)
  once the falsified cadence-guard rows had long aged out of the 21.6h window — not by ops'
  07-10 attempt at all.
- **D2D:** a genuine UUID-style row, `parsed_at` 2026-07-20, also post-incident, also 0 rows.

**Root cause of the 0-row outcome is NOT the cadence-guard incident — it is a separately-tracked,
already-diagnosed architectural gap.** Per `SPIKE-BCTC-TABLEROWS-FROZEN-HOLLOW-DONE`
(2026-07-12, still open; follow-on `FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP`, BACKLOG/owner ops):
`bctc_table_rows`' **only live producer** is the session-scoped BCTC-AGENTIC-REFINE pipeline
(`bctcRefineJob.ts` `refineOneReport` Phase 4), which depends on a Claude-native CronCreate cron
dispatching a live interactive session — not on any in-container Docker scheduler job.
`bctcReparseJob`'s own three extraction tiers (service `/extract`, `pdf-parse`, OCR cache — see
`reparseSingleWithOcrFallback`, `bctcReparseJob.ts:293-463`) never call `/extract-tables`,
`/extract-md-tables`, or `/pek-extract` — the only pdf-extractor endpoints that populate
`bctc_table_rows`/`bctc_md_tables` — so **`bctcReparseJob` is architecturally incapable of
populating table data for any ticker, any quarter, regardless of whether the cadence guard blocks
it.** This is the same root-cause class already closed for the 2025-Q4 extraction axis by
`SPIKE-BCTC-2025Q4-PDFPULL-OCR-0ROW` (do-not-re-tread per this row's own scope note) — this SPIKE
confirms it extends unchanged to Q1-2026 non-bank and reconfirms it for the 4 bank tickers, and
additionally cross-references the *separate* `bctc_table_rows` producer-dormancy gap
(`SPIKE-BCTC-TABLEROWS-FROZEN-HOLLOW-DONE`) as the deeper reason even a fully-unblocked
`bctcReparseJob` run could never have closed this gap on its own.

**AC-3 answer: No, the 9 targets were not reparsed to completion (0 table rows for all 9),
independent of the falsified `cron_job_runs` — but this is fully explained by two already-tracked,
in-progress structural gaps (extraction-endpoint wiring + agentic-refine dormancy), not a new
defect this SPIKE needed to diagnose.**

---

## Code bug found → FIX minted

`FIX-BCTC-REPARSE-DOUBLE-WRAP-DEDUP-GUARD` (backlog, owner `dev-mcp-server`) — the double-wrap
`recordJobRun` defect (item 3 above) plus the ungated startup catch-up, matching the precedent
pattern already fixed for `runBaseRateComputationWithDb`/`runEvidenceAccumulatorWithDb`. Not fixed
inline per SPIKE discipline. See board row for full AC.

---

## Code references

- `apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts:697-720` — `runBctcReparseJob`
  entry point + `shouldSkipRecoveryReplay` call (now line 718; was 683 at incident-filing time —
  line drift from intervening commits, same function).
- `apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts:890-896` — inner
  fire-and-forget self-record (only reached on a REAL, non-skipped run — confirmed NOT the source
  of the paradox by itself).
- `apps/mcp-server/src/scheduler/startupHelpers.ts:192-221` — `shouldSkipRecoveryReplay` (guard
  implementation, UTC-consistent, TZ hypothesis rejected).
- `apps/mcp-server/src/scheduler/startupHelpers.ts:361-366` — `runBctcReparseWithDb` (the
  double-wrap outer entry point both call sites share).
- `apps/mcp-server/src/scheduler/startScheduler.ts:169-182` — ungated 30s-post-boot startup
  catch-up (compare `:184-` region siblings and `dataAuditJob.ts:292-311`
  `runDailyAuditIfStale`, which DOES gate on staleness — the pattern this catch-up's own commit
  message claimed to mirror but never implemented).
- `apps/mcp-server/src/scheduler/schedulerJobTable.ts:1125-1128` — the regular `'30 9 * * *'`
  (Asia/Ho_Chi_Minh) scheduled cron registration, second call site.
- `apps/mcp-server/src/infrastructure/db/cronJobRunStore.ts:200-237` — `recordJobRun` (the
  generic wrapper responsible for the blind `'success'` marking).
- `apps/mcp-server/src/composition-root.ts:150-234` — the separate 10s-post-boot "post-OCR
  reparse" bootstrap hook (bypasses `shouldSkipRecoveryReplay` entirely — calls
  `reparseSingleWithOcrFallback` directly — a third, ungated code path, out of this SPIKE's AC-2
  scope but the likely creator of the `fallback-ACB/BID/EIB-2025-Q4` shell rows found in AC-3).
- `docs/spikes/SPIKE-BCTC-2025Q4-PDFPULL-OCR-0ROW.md` — closed 2025-Q4 extraction axis (cross-ref,
  not re-treaded).
- `docs/data/orch/archive/backlog-detail.json` (`SPIKE-BCTC-TABLEROWS-FROZEN-HOLLOW-DONE`) — the
  separate, still-open `bctc_table_rows` producer-dormancy root cause (cross-ref, not re-treaded).
- Live probe artifacts (read-only, no writes): `docker exec vn-market-intelligence-mcp-mcp-server-1
  bun /tmp/probe_ac2.js` (cron_job_runs history + per-day counts for `bctcReparseJob`),
  `/tmp/probe_ac3.js` (financial_reports/bctc_table_rows/bctc_md_tables for the 9 targets).
