# BCTC Discover→Enqueue→Fetch→Push Pipeline — 17-Day 0-Push Root Cause

**Date:** 2026-07-03
**Task:** SPIKE-BCTC-DISCOVER-PIPELINE-DEAD (SPIKE, P0/critical, timebox 120min)
**Investigator:** architect
**Mode:** root-cause SPIKE — read-only infra probes (docker exec DB queries, container logs, `docker stats`), NO build/up/restart/deploy performed
**Origin signals:** sau-2026-07-03T06:42:33Z (B-05 CRITICAL, "bctc-discover stale 396.6h"), sau-2026-07-03T06:42:56Z (B-13 WARN, folded — 9 rows >72h, same root)

---

## Executive Summary — the dead stage is Stage 3 (fetch/pull/OCR), NOT Stage 1 or Stage 2

The pipeline has **four** stages: (1) discover cron scheduler, (2) enricher URL-discovery, (3) PDF pull+extract, (4) parse/finalize. Live RAW-probe evidence (docker-exec against the named-volume DB, container logs, `docker stats`) shows:

1. **Stage 1 (scheduler) — ALIVE.** All BCTC crons (`bctcQueueEnricherJob`, `bctcPdfPullJob`) fire on schedule continuously; zero scheduler-level defect.
2. **Stage 2 (enricher / URL discovery) — ALREADY FIXED**, by the sibling task `FIX-BCTC-ENRICHER-STUCK-BACKLOG` (DONE_VERIFIED, QA PASS commit `14b955802`, live in image `a169f5e2` built 2026-07-03T04:38:34Z). That fix closed the `last_attempt`-never-stamped defect that permanently excluded 23 HOSE rows from re-discovery. **This SPIKE independently confirms it is working**: since ~05:00Z today the enricher has discovered real `staticfile.hsx.vn` PDF URLs for ~10+ previously false-terminal rows (ACB/BID/CTG/D2D/NKG/POW/SSI/VCI/VHM/VIC/VPB/VRE/GAS/GVR/HCM/HSG/MBB and 2 VCB retries), correctly flipping their status to `pending`.
3. **Stage 3 (`bctcPdfPullJob` — PDF pull + 3-tier extraction) — THE NEWLY-EXPOSED DEAD STAGE.** This job has **no overlap/mutex guard** between successive cron invocations. Once Stage 2 started feeding it real work today, individual invocations began taking many minutes to tens-of-minutes (up to ~70 min observed), and because the 30-min cron keeps firing regardless, invocations now pile up concurrently — as of this probe **4 separate invocations are simultaneously "running"** (started 06:00:01, 06:30:00, 06:30:01, 07:00:01 — the oldest has been in-flight for 65+ minutes). Concurrent invocations re-select the SAME `status='pending'` rows (status doesn't flip until extraction finishes) and redundantly re-download + re-extract the same PDFs multiple times, saturating the `pdf-extractor` container (**204.67% CPU / 75.31% mem** at probe time) and starving net "done" throughput. **This defect was dormant for weeks** because Stage 2 never fed the queue any real work (all HOSE rows were false-terminal) — fixing Stage 2 unmasked it.
4. **Stage 4 (parse/finalize) — separately owned, NOT part of this SPIKE.** 9 of the most recent 10 pull-cycle items ended `enrich_failed` (0 `bctc_table_rows` AND 0 `bctc_md_tables`) — this is the exact defect class the CONCURRENT in-progress task `FIX-BCTC-BANK-BS-COLUMN-ORDER` targets (bank-form column-order + section-vocabulary parser bugs). Confirmed distinct and already ticketed — **not re-derived here**, only cited as corroborating evidence that Stage 3's redundant reprocessing is currently polluting the true failure signal (the same ticker fails 2-3× in the logs from duplicate concurrent attempts, not 2-3 independent parse bugs).

**Net effect at probe time:** the acute alarm ("0 pushes in 396.6h") is **already self-resolving** — `MAX(last_attempt) WHERE status='done'` in `bctc_vps_queue` is now `2026-07-03 05:14:18` (< 2h stale, well under the 24h health threshold), because 2 rows (VCB Q1-2025, VCB Q1-2026) completed the full pipeline today before the overlap pile-up took hold. **But this recovery is fragile and wasteful**: the Stage-3 architecture defect means the remaining 8 (and counting) newly-discovered rows are being hammered redundantly rather than processed cleanly, risking `pdf-extractor` OOM (currently 75% of its 2.5GiB cap) during the active Q2-2026 earnings window (36 actionable rows total; more filings incoming through day 14 of the trigger month per `isBctcEarningsWindowActive()`), and will reproduce the same "stale/no-push" symptom the next time a burst of real discovery work lands.

---

## Evidence Trail (RAW, docker-exec against live named-volume `/app/data/market.db`)

### 1. Scheduler liveness (Stage 1) — not the fault

`bctcQueueEnricherJob` and `bctcPdfPullJob` both fire on their configured cadence (`*/15` and `*/30` respectively) continuously through 2026-07-03. No gap, no scheduler-level defect. (Already independently confirmed by the sibling task's recon at `docs/vps-sources/bctc-discover-stale-15d/enricher-liveness.md` — 6214 zero-error runs since 2026-04-23.)

### 2. Enricher fix (Stage 2) verified live-working, NOT the current blocker

```
bctc_vps_queue status counts (probe time, 2026-07-03T07:04Z):
  deferred_infra: 328, done: 67, enrich_failed: 10, pending: 9, url_not_found: 17
  (9+17+10 = 36 — matches the SPIKE's "36 actionable rows" figure exactly)

MAX(last_attempt) WHERE status='done': 2026-07-03 05:14:18   (VCB Q1-2026, id 292117)
2nd most recent: 2026-07-03 05:06:57                          (VCB Q1-2025, id 224)
3rd most recent: 2026-06-16 18:02:24                          (ACV Q1-2026 — last "done" BEFORE today)
```
The `done` count moved 65→67 (+2) and 8 rows currently sit `pending` with real, non-placeholder `https://staticfile.hsx.vn/...` source URLs populated since ~05:15Z (NKG/POW/SSI/VCI/VHM/VIC/VPB/VRE), confirming the enricher fix (`FIX-BCTC-ENRICHER-STUCK-BACKLOG`, commit `14b955802`, QA PASS) is discovering real current-quarter PDFs correctly. **This rules out Stage 2 as the current blocker** — it answers the SPIKE's question (4) directly: the enricher does NOT return 0 URLs for current quarters once the `last_attempt` bug is fixed; it now discovers URLs on nearly every 15-min cycle.

### 3. `bctcPdfPullJob` overlap pile-up (Stage 3) — THE dead stage

```
cron_job_runs (job_name='bctcPdfPullJob'), 2026-07-03:
  00:00 → 04:30  — 30+ runs, ALL rows_written=0, duration_ms 0-18   (queue was empty pre-fix; job trivially fast)
  05:00:00       — status=success, rows_written=2, duration_ms=857679   (~14.3 min)
  05:00:01       — status=success, rows_written=2, duration_ms=742791   (~12.4 min)   ← both VCB rows landed here
  05:30:00       — status=success, rows_written=0, duration_ms=4194323  (~69.9 min!)  ← first sign of trouble
  06:00:01       — status=RUNNING, finished_at=NULL   (still running at probe time — 65+ min in flight)
  06:30:00       — status=RUNNING, finished_at=NULL   (35+ min in flight)
  06:30:01       — status=RUNNING, finished_at=NULL   (35+ min in flight)
  07:00:01       — status=RUNNING, finished_at=NULL   (5+ min in flight)
```
Container has been continuously alive (no restart) since the image rebuild at `2026-07-03T04:38:34.016Z` (`docker inspect --format '{{.State.StartedAt}} {{.RestartCount}}'` → `0` restarts, single PID-1 `bun run src/index.ts` process, 9m07s CPU time over ~2.5h wall clock) — **these "running" rows are genuinely in-flight/stuck async work in the SAME live process, not orphaned-by-crash rows.**

Application logs directly show the same row being re-selected and re-processed by overlapping invocations:
```
06:27:26Z  [bctcPdfPull] PDF saved  ticker=HCM  bytes=10764823
06:34:44Z  [bctcPdfPull] PDF saved  ticker=HCM  bytes=10764823   ← same PDF, re-downloaded
06:35:49Z  [bctcPdfPull] PDF saved  ticker=HCM  bytes=10764823   ← same PDF, re-downloaded AGAIN
06:40:24Z  [bctcPdfPull] PDF saved  ticker=HCM  bytes=10764823   ← 4th re-download
07:00:22Z  [bctcPdfPull] PDF saved  ticker=NKG  bytes=17054397
07:00:29Z  [bctcPdfPull] PDF saved  ticker=NKG  bytes=17054397   ← 7s later, same PDF
07:00:53Z  [bctcPdfPull] PDF saved  ticker=NKG  bytes=17054397   ← 3rd copy within 31s
```
`docker stats` at probe time: `pdf-extractor` container **204.67% CPU / 1.883GiB / 2.5GiB (75.31% mem)** — the microservice is under sustained multi-request contention consistent with several concurrent `bctcPdfPullJob` invocations hammering it with redundant `/extract` calls for the same documents.

### 4. Root cause in code — no overlap guard, no per-item claim

`apps/mcp-server/src/infrastructure/db/repositories/SqliteJobRunRepository.ts::wrapRun()` unconditionally inserts a new `cron_job_runs` "start" row and awaits the job function — there is **no check for an already-`running` row of the same `job_name`** before starting a new one.

`apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts` SELECTs its work batch via:
```sql
SELECT id, action_code, period_year, period_quarter, source_url, attempts
FROM bctc_vps_queue
WHERE status = 'pending' AND (source_url LIKE ? OR source_url LIKE ?)
ORDER BY created_at ASC LIMIT ?   -- DEFAULT_BATCH_SIZE = 10
```
`status` only transitions away from `'pending'` (to `done` / `enrich_failed` / back to `pending` on transient failure) at the very END of a per-row processing chain: `fetchPdf` (45s deadline) → `savePdf` → `triggerExtraction` (up to 3 tiers, each with its own `AbortSignal.timeout(120_000)` in `pdfExtractorClient.ts`, so worst case ~6 min/item) → 0-row gate → status write. With `DEFAULT_BATCH_SIZE = 10`, a single invocation can legitimately take **up to ~65-70 minutes in the worst case** — which matches the observed 05:30 run (69.9 min). Because the cron fires every 30 min with **no overlap protection**, and a row stays `'pending'` for the ENTIRE duration of its own processing, any invocation that starts while a previous one is still mid-flight on the same rows will re-select and re-process them — a self-amplifying pile-up, not a single crash or silent failure.

**This is not a novel failure class in this codebase — it already has an established, unused-here fix pattern.** `apps/mcp-server/src/scheduler/financial-reports/bctcBatchSweepJob`-adjacent jobs and, more directly, `runVnstockFundamentalsJobCron` / `runVnstockTradingStatsJobCron` (registered in `startScheduler.ts:963-973`, comment: *"isRunning guard prevents double-stack (7-10 min sweep). Per-ticker isolation."*) and `weatherCheckJob.ts` (module-level `isRunning` boolean, cleared in `finally`, explicit comment: *"isRunning to stay true indefinitely → WAL accumulation → disk I/O"* is the exact hazard being guarded against) both already implement the module-level `isRunning` boolean guard for precisely this "long sweep on a short fixed cron" shape. `bctcPdfPullJob` is the same shape (unbounded-in-practice per-batch runtime on a fixed-interval cron) but was never given the guard — plausibly because until today it never had real work in the queue (all rows false-terminal, sub-millisecond no-op runs), so the overlap hazard was latent and untested.

---

## Answering the SPIKE's four sub-questions directly

1. **Is the discover cron firing at all (scheduler alive)?** Yes — both `bctcQueueEnricherJob` (*/15) and `bctcPdfPullJob` (*/30) fire continuously, zero scheduler-level gap.
2. **Are URLs discovered on the VPS but not enqueued?** No — this SPIKE is about the mcp-server-side `bctcQueueEnricherJob` (Strategy 0, `hsx.vn`, zero VPS/SSC dependency for the current backlog), which now correctly discovers and enqueues (writes `source_url` + flips `status='pending'`) as of the sibling fix. VPS-side `discover-bctc-urls-browser.py` and the SSC/HNX legs (`BCTC-HNX-SSL-HARDEN`) are **ruled out** — not implicated in this backlog's drain failure.
3. **Is fetch/OCR failing silently?** **No, not silently** — the fail-loud `enrich_failed` gate (`FIX-BCTC-ENRICH-SILENT-0ROWS`) works exactly as designed and correctly surfaces genuine parse failures (Stage 4, already ticketed). The REAL Stage-3 problem is architectural, not a silent failure: unbounded concurrent overlap throttles net throughput to near-zero and wastes `pdf-extractor` capacity, independent of whether any individual extraction succeeds or fails.
4. **Is the enricher returning 0 URLs for CURRENT quarters?** No — confirmed working (see Evidence §2). `BCTC-ENRICHER-OLD-QUARTERS` (old-quarter-specific, separately KIN'd) is unaffected and out of scope here.

---

## Recommended Fix — precisely zoned, single service

**Zone: `apps/mcp-server` only.** VPS-scripts and pdf-extractor are ruled out as root cause (pdf-extractor is a contended *victim*, not buggy; VPS discovery scripts are not on this backlog's critical path). This SPIKE's "multi" zone candidate list resolves to **one** zone.

**File:** `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts` (+ its registration in `apps/mcp-server/src/scheduler/startScheduler.ts:359-364`)

**Fix (reuse the existing in-repo pattern, do not invent a new one):**
1. Add a module-level `isRunning` boolean guard around `runBctcPdfPullJob()`'s cron invocation (mirror `weatherCheckJob.ts` / `runVnstockFundamentalsJobCron`/`runVnstockTradingStatsJobCron` exactly): if already running, log a debug line and return immediately without starting a new `cron_job_runs` row; always clear the flag in a `finally` block so a thrown error can never wedge it permanently.
2. (Hardening, same file, low-risk) Consider capping `DEFAULT_BATCH_SIZE` down from 10 during the guard rollout, or adding a soft per-run wall-clock budget check between items (bail out of the loop, not the DB) so a single invocation cannot indefinitely outlive its own 30-min cron interval even under worst-case dense-PDF sequences — secondary, not required for the primary fix to be correct.
3. No schema change, no new table — purely an in-process concurrency guard, identical shape to 3 existing precedents in the same file family.

**Test strategy:** unit test simulating two overlapping `runBctcPdfPullJob()` invocations (inject a slow `deps.fetchPdf` that doesn't resolve until released) — assert the second invocation's DB query is never even issued while the first is in flight, and that the guard clears after completion (a 3rd invocation after completion runs normally). Mirror the existing `weatherCheckJob` test pattern if one exists, else follow the standard `apps/mcp-server/src/__tests__/NNN-task-name.test.ts` template.

**DDD layer:** `interface/scheduler` (job registration + guard) — no domain/application/infrastructure change required.

**BUILD-STANDARD:** not-applicable (bug-fix, in-zone, no new primitives, reuses an existing in-repo pattern verbatim).

---

## Dedup confirmation (explicit, per dispatch contract)

| Candidate | Verdict | Why not this |
|---|---|---|
| `BCTC-HNX-SSL-HARDEN` | ruled out | fetch works (insecurely) via `curl -k` on the VPS HNX leg — unrelated to mcp-server's `bctcPdfPullJob` hsx.vn/VPS-cache pull path; hardening debt only |
| `FU-CTG-DISCOVERY-FILENAME-FILTER` | ruled out | CTG-specific discovery filename quality — not a throughput/overlap defect |
| `FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH` | ruled out | detector-side false-P0 class; this SPIKE's data staleness is REAL (confirmed both by the original signal and by this probe's own timeline) |
| `BCTC-ENRICHER-OLD-QUARTERS` | ruled out | old-quarter-specific; this backlog is exclusively current/recent quarters (Q4-2025/Q1-2026) |
| `FIX-BCTC-BANK-BS-COLUMN-ORDER` (in progress, dev-mcp-server) | ruled out / corroborated, not duplicated | parse/finalize layer (Stage 4), downstream of and independent from the Stage-3 overlap defect found here; this brief's evidence corroborates its scope (9/10 recent `enrich_failed` rows) without re-deriving or duplicating it |

**New, distinct finding:** `bctcPdfPullJob` overlap/pile-up — not previously ticketed anywhere in the current board, backlog, or dedup list.

---

## Risk Flags

**RF-1 (MEDIUM) — pdf-extractor resource exhaustion during active earnings window.** At 75.31% mem / 204% CPU under only ~4 concurrent stuck invocations processing ~8-10 real rows, further backlog growth (36 actionable rows now, more incoming through the Q2 window's day-14 cutoff) without the overlap guard risks pushing `pdf-extractor` toward its 2.5GiB cap (OOM/restart), which would then ALSO break Stage 4 processing for unrelated callers of the same microservice.

**RF-2 (LOW) — stuck "running" `cron_job_runs` rows pollute observability**, not data integrity. The rows will eventually resolve (as 05:30's 69.9-min run did) rather than hang forever, but each additional overlapping invocation extends resolution time further and is pure waste (identical PDF re-downloaded/re-extracted 2-4× per ticker observed).

**RF-3 (LOW) — the acute B-05 alarm may look "self-resolved" to the next auditor pass** (fresh `done` timestamp from today's 2 VCB completions) even though the structural defect remains live. Recommend the dispatched fix ship this sprint regardless of whether B-05 goes quiet, since the same "16+ day 0-push" symptom will recur the next time a real discovery burst (e.g. next earnings window, or a re-triggered Arm-2 grace-period sweep) hands the queue a batch of real work.

---

## Files referenced (verified paths)

- `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts` — Stage 3 job, missing overlap guard (fix target)
- `apps/mcp-server/src/scheduler/startScheduler.ts:359-364` (registration), `:963-973` (existing `isRunning`-guard precedent for `vnstockFundamentalsRefresh`/`vnstockTradingStatsRefresh`)
- `apps/mcp-server/src/scheduler/weatherCheckJob.ts:67,85,89,243` — existing `isRunning` module-level guard pattern to mirror verbatim
- `apps/mcp-server/src/infrastructure/db/repositories/SqliteJobRunRepository.ts::wrapRun()` — confirmed no overlap check exists here (by design — overlap prevention is job-local, per the 3 existing precedents, not repository-level)
- `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts` — Stage 2, confirmed fixed and live-working (sibling task, not touched here)
- `apps/mcp-server/src/scheduler/financial-reports/pushBctcExtraction.ts`, `apps/mcp-server/src/infrastructure/fetchers/pdfExtractorClient.ts` — Stage 3/4 extraction tiers, per-call timeouts confirmed present (120s/tier) — NOT the defect; the defect is the absence of a job-level overlap guard, not missing per-call timeouts
- `docs/vps-sources/bctc-discover-stale-15d/enricher-liveness.md` — sibling task's Stage-1/2 recon (referenced, not duplicated)
- `docs/data/orch/orch-state.json` task rows: `B-05-FIX`, `B-05-FU-ENRICHER-LIVENESS`, `FIX-BCTC-ENRICHER-STUCK-BACKLOG` (all DONE/DONE_VERIFIED, sibling chain), `FIX-BCTC-BANK-BS-COLUMN-ORDER` (in progress, dev-mcp-server, unrelated layer)
