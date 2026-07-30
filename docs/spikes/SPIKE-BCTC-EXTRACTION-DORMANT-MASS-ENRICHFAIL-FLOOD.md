# SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD — AC-2 findings

- **Owner:** dev-mcp-server (assist: dev-pdf-extractor, PEK-layout sub-probe)
- **Scope this pass:** AC-2 only. AC-1 (infra-rollback verify) already CLEAR per ops/router — see `ac1_finding` on the board row. AC-3 (emission circuit-breaker) already `DONE_VERIFIED` + archived (`FIX-BCTC-RECONCILE-EMISSION-CIRCUIT-BREAKER`) — not touched.
- **Mode:** SPIKE, read-only diagnosis. No writes to the live serving DB (`data/live/market.db`). All DB access below is `readonly: true` SQLite opens (`bun:sqlite`, `docker exec`) or `docker logs`/`docker inspect`. No extraction was fired.
- **Time:** 2026-07-17T02:3x–02:5x UTC.

## AC-1 recap (context only, not re-verified — router/ops finding)

Hypervisor VM crash 2026-07-15 destroyed the named `market_data` Docker volume; recovery (commit `5ba622eca`, 17:21Z) restored a July-1 host backup and switched the 9 data services from the named volume to a host bind-mount (`./data/live:/app/data`) for durability. The restored snapshot's bctc extraction maxes (`bctc_layout_units` 2026-06-10, `bctc_table_rows` 2026-06-30, `bctc_md_tables` 2026-05-26) are **older** than the 2026-07-12 `SPIKE-BCTC-TABLEROWS-FROZEN-HOLLOW-DONE` readings (layout_units 07-12/1829 rows, table_rows 07-08/4091 rows) — the restore lost ~2.5 weeks of extraction progress. AC-1's own verdict: "dormant producer, not ongoing loss."

## AC-2 — is the producer actually dormant in the CURRENT (rebuilt) fleet, and why?

### 1. Cron registration + firing — RAW, CLEAR (not the problem)

Both extraction crons are registered as declarative Bun cron jobs inside the always-on `mcp-server` container (`apps/mcp-server/src/scheduler/schedulerJobTable.ts:260-276`, wired via `buildJobTable`/`registerJobTable` in `startScheduler.ts`), sharing the `jobRunRepo.wrapRun` envelope that records every invocation to `cron_job_runs`:

- `bctcPdfPullJob` — `CRONS.bctcPdfPull` = `*/30 * * * *`
- `bctcExtractReconcileJob` — `CRONS.bctcExtractReconcile` = `5,35 * * * *`

`docker inspect vn-market-intelligence-mcp-mcp-server-1` shows the container `StartedAt: 2026-07-17T00:33:00Z` (running, healthy). RAW-read `cron_job_runs` (readonly SQLite open, `docker exec ... bun -e`) for both job names, last 20 rows each, container clock `2026-07-17T02:48:42Z`:

```
bctcExtractReconcileJob  02:35:00 success  rows_written=0
bctcPdfPullJob           02:30:03 success  rows_written=0
bctcExtractReconcileJob  02:05:02 success  rows_written=0
bctcPdfPullJob           02:00:03 success  rows_written=0
...
bctcPdfPullJob           23:30:02→00:33:03  status=crashed  (container restart straddled this run; reaped as zombie on next boot, expected — see startScheduler.ts reapZombieJobRuns)
```

Both jobs have fired **exactly on schedule, `status=success`, zero errors**, every single tick since at least 2026-07-16 22:xx (checked back through the container's cron history). **Cron registration + firing is 100% healthy — this is definitively NOT a cron-registration or cron-liveness problem.** The one `crashed` row is the expected zombie-reap artifact of the 00:33 mcp-server container restart, not a recurring failure.

### 2. Is `/pek-extract` (PEK-layout) producing `bctc_layout_units`? Where does it stall?

**No — and the stall point is now RAW-identified precisely.** `bctcPdfPullJob` itself succeeds at its own job (downloads PDFs, saves to `data/pdfs/`, upserts the `financial_reports` shell row, fires the async `/pek-extract` POST — its own `rows_written`/`downloaded` counter is non-zero on many runs through 2026-07-16 20:30, confirming the pull half is healthy). But `bctcExtractReconcileJob`'s `rows_written` (mapped to `result.done` — rows that actually landed `bctc_layout_units`/`bctc_table_rows`/`bctc_md_tables`) is **0 in 166 of 167 successful runs since 2026-07-15** (the lone exception, 2026-07-15 16:35, most likely a pre-existing `table_rows` row already satisfying the OR-check, not a new PEK success).

`docker logs vn-market-intelligence-mcp-pdf-extractor-1 --since 6h` shows the exact stall, repeated on every single `/pek-extract` invocation:

```
INFO:  "POST /pek-extract HTTP/1.1" 202 Accepted
ERROR:interface.handlers:_run_pek_extract: FAILED report_id=<...> — full traceback follows
FileNotFoundError: [Errno 2] No such file or directory: '/app/PDF-Extract-Kit/models/Layout/YOLO/doclayout_yolo_ft.pt'
RuntimeError: PekEngineAdapter: _PekLayoutModel load FAILED (...): [Errno 2] No such file or directory: '.../doclayout_yolo_ft.pt'
```

(During VN market hours, 02:00-08:59 UTC, the same calls instead get a clean `503 Service Unavailable` from pdf-extractor's own market-hours guard — expected, unrelated to the defect below; this SPIKE's log window straddled both.)

**Root cause, RAW-confirmed via `docker inspect` + `docker exec ... find`:**

```
docker inspect vn-market-intelligence-mcp-pdf-extractor-1 --format '{{json .Mounts}}'
  → { Type: "volume", Name: "vn-market-intelligence-mcp_pek_model_cache",
      Destination: "/app/PDF-Extract-Kit/models", RW: true }
  → StartedAt: 2026-07-15T15:16:48Z   (same-day as the VM-crash/rebuild window)

docker exec ... find /app/PDF-Extract-Kit/models -type f
  → /app/PDF-Extract-Kit/models/yolo/settings.yaml   (ONLY file — 12K total, `du -sh`)

docker exec ... ls /app/PDF-Extract-Kit/models/Layout/YOLO/
  → No such file or directory
```

The `pek_model_cache` **named Docker volume is empty** (only a stray `yolo/settings.yaml` auto-written by the `doclayout_yolo` package on first import) — the 40.7 MB YOLO layout-detection weight (`doclayout_yolo_ft.pt`) that `PekEngineAdapter._load_pek_models()` requires is simply not there. `_load_pek_models()` fails loudly (by design — this is intentional fail-loud, not a silent swallow) on **every single invocation**, so `bctc_layout_units` can never be written, market hours or not, no matter how many times `bctcPdfPullJob`/`bctcExtractReconcileJob` fire or re-fire.

**This is a RECURRING instance of an already-diagnosed-and-fixed defect class.** `docs/architecture-briefs/2026-05-27-pek-weights-provisioning.md` (architect brief, 2026-05-27, escalated from the identical symptom after a `--no-cache` rebuild wiped the same volume) designed and shipped (commit `e418d606d`) a committed, idempotent fetch script for exactly this scenario:

- `scripts/pek-fetch-weights.sh` — still present in the repo, executable, unmodified since `e418d606d`. It runs `docker run` against the pdf-extractor image, mounts `pek_model_cache`, and does a single-file `hf_hub_download` (primary) / ModelScope `snapshot_download` (fallback) of `models/Layout/YOLO/doclayout_yolo_ft.pt` from `opendatalab/PDF-Extract-Kit-1.0`. Idempotent (`exit 0` if already present).
- The brief's §4 explicitly designed this as a **manual, ops-run, one-time step after any fresh volume provision or `docker volume rm`** — NOT an automated entrypoint fetch (deliberately rejected, §4, to avoid coupling container boot to network latency). That means **any event that recreates/empties this named volume requires an explicit re-run of this script** — it does not self-heal.
- RAW-verified the four env vars this brief's fix depends on are still correctly set in the live `docker-compose.yml` today (`HUGGINGFACE_HUB_CACHE`, `MODELSCOPE_CACHE`, `YOLO_CONFIG_DIR`, `PADDLE_OCR_BASE_DIR` all point at `/app/PDF-Extract-Kit/models/*` — the `PADDLEOCR_HOME`→`PADDLE_OCR_BASE_DIR` fix from that brief was NOT reverted). So the only missing piece is the weight file itself.
- RAW-verified network reachability from inside the pdf-extractor container right now: `huggingface.co` → HTTP 200, `www.modelscope.cn` → HTTP 200. **The remediation is currently unblocked and low-risk** (idempotent, ~41 MB single-file download, no code change).

**Conclusion:** the 2026-07-15 hypervisor crash / VM-rebuild destroyed **two** named Docker volumes, not one — `market_data` (already handled by AC-1/ops via `5ba622eca`, converted to a host bind-mount + July-1 restore) **and** `pek_model_cache` (NOT converted to a bind-mount, NOT re-seeded — the committed `scripts/pek-fetch-weights.sh` step was simply never re-run after this particular volume-destroying event). The PEK-layout pipeline has therefore been 100%-failure since the container was recreated (`2026-07-15T15:16:48Z`) through the time of this SPIKE (`2026-07-17T02:5xZ`), independent of and in addition to whatever dormancy the `bctc_layout_units` max-date reading (06-10, an artifact of the July-1 backup content) already implied.

### 3. Is the agentic-refine trigger (bctc_table_rows producer) dormant? Fold recommendation

**Yes, still dormant — fold into the existing `FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP` backlog row, do NOT mint a new one.**

- `bctc_refined_units`: `MAX(refined_at)=2026-06-30`, count 390 (RAW read, readonly). **Zero rows with `refined_at > 2026-07-15`** — i.e., zero refine activity in the >36h since the rebuild, not merely "old max from the restored backup."
- `financial_reports.refine_status`: `PENDING=181` (up from the 151 recorded in the 07-12 spike — the backlog is still growing, not draining).
- `docs/data/cowork-schedule.json` **does** contain refine-related slots today (`refine-bctc-slot-1`, agent `refine_bctc_md`, `parallel_group: bctc-refine`) — this differs from the 07-12 spike's reading of zero slots, so the schedule itself was at some point repopulated — but the schedule containing a slot definition does not by itself prove a live session is actually dispatching it (per `.claude/commands/crons/cron-refine-bctc.md`'s Option-Y design: this is a session-scoped Claude-native `CronCreate`/cowork trigger, not an in-container Bun cron — this SPIKE cannot RAW-confirm live-session dispatch state from the filesystem/DB alone, only its *output*, which is flat).
- This is the exact same root-cause **class** already diagnosed and tracked: `FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP` (backlog, owner=ops, priority=high, filed 2026-07-12 from `SPIKE-BCTC-TABLEROWS-FROZEN-HOLLOW-DONE`) — "give `refine_bctc_md` dispatch a session-independent durable backstop... this pipeline has NO in-container/Docker scheduler trigger... depends entirely on a session-scoped Claude-native CronCreate cron... gone dormant." That row is still `status: BACKLOG`, unshipped. Nothing in this AC-2 probe changes that diagnosis or its recommended fix shape — it is simply still true, now with a longer dormancy window (0 new rows 07-04→07-17, 13 days) and a larger backlog (181 vs 151 PENDING).
- **Recommendation: FOLD.** Do not open a second row for the refine half — `FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP` already fully covers this symptom, root cause, and proposed remedy (launchd-class durable backstop). The only new information this pass adds is confirmation the dormancy is ongoing and worsening, which the existing row's owner (ops) should use to re-prioritize, not a reason to re-mint.

### 4. Root cause of the ~06-30 dormancy — two independent, non-communicating causes

`bctc_layout_units` and `bctc_table_rows` are two structurally independent pipelines (established by the prior `SPIKE-BCTC-TABLEROWS-FROZEN-HOLLOW-DONE` F1-F3: layout-first is a geometric QA/review overlay with no derivation step into table_rows; table_rows' sole producer is the separate agentic-refine pipeline). Their current dormancy has **two separate, RAW-confirmed root causes**, not one:

| Producer | Table | Root cause | Status |
|---|---|---|---|
| PEK-layout (`/pek-extract`, in-container Bun cron, always-on) | `bctc_layout_units` | **NEW finding, this SPIKE**: `pek_model_cache` named Docker volume wiped by the 2026-07-15 hypervisor crash/VM-rebuild, never re-seeded. `doclayout_yolo_ft.pt` (40.7 MB YOLO weight) absent → `_load_pek_models()` fails loudly on every invocation. Cron fires correctly; the downstream microservice cannot produce output. | Unfixed, but a committed one-command remedy already exists (`scripts/pek-fetch-weights.sh`) and is currently unblocked (network reachable). |
| BCTC-AGENTIC-REFINE (session-scoped Claude-native cron) | `bctc_table_rows` | **Pre-existing, re-confirmed**: no in-container/Docker trigger exists by design (Option-Y ruling); depends on a fragile session-scoped `CronCreate`/cowork dispatch with no durable backstop, dormant since 2026-07-04 and still dormant 13 days later. | Tracked, unfixed: `FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP` (backlog). |

Both causes independently explain why `bctcExtractReconcileJob`'s three-way OR success-check (`bctc_layout_units OR bctc_table_rows OR bctc_md_tables`, all `>0`) has been failing for essentially every row queued since the rebuild — **neither producer can currently satisfy it** — which is the direct mechanism behind the mass `enrich_failed` sweep and the ongoing ~1/tick `RECONCILE-EXHAUSTED` report duplicates (VND, BSR, VIX-Q2, SHB, VIX-Q1, ...) the circuit-breaker (AC-3, already shipped) now batches instead of flooding one-per-row.

## Answer to the root question

The extraction layer is not "dormant" in the sense of a dead/unregistered cron — both crons fire exactly on schedule with zero errors. It is dormant because **both of its two independent producers are separately broken**: PEK-layout because the 2026-07-15 VM-rebuild silently destroyed a second named Docker volume (`pek_model_cache`, distinct from the `market_data` volume AC-1 already remediated) that holds the YOLO layout weights, and nobody re-ran the already-committed provisioning script for it; agentic-refine because its session-scoped trigger — a pre-existing, already-tracked defect — remains unfixed. `bctcExtractReconcileJob` and `bctcPdfPullJob` are both working exactly as designed; the reconcile job's mass-enrich-fail sweep is the correct, honest signal that neither producer landed anything, not a bug in the reconcile job itself (consistent with the prior SPIKE's F1 finding that this job's success-gate is intentional, QA-approved design).

## Fix recommendation (PO/router mints — not done here)

1. **NEW, ops-owned, small, high-value, currently-unblocked**: re-run `scripts/pek-fetch-weights.sh` against the live `pek_model_cache` volume (network reachability to HuggingFace/ModelScope RAW-confirmed live), verify `doclayout_yolo_ft.pt` lands (~40.7 MB) and a subsequent `/pek-extract` call (outside VN market hours, 09:00-01:59 UTC) logs `PekEngineAdapter: _PekLayoutModel loaded` instead of `FileNotFoundError`. This is the durable-provisioning gate from `docs/architecture-briefs/2026-05-27-pek-weights-provisioning.md` §4/§6, already fully designed — just needs re-execution. Suggest also considering a durability follow-up for this volume specifically (a boot-time presence check/alert, mirroring the pattern that just protected `market_data`) since this is now the SECOND time this exact volume has gone missing after an infra event. **This SPIKE does NOT execute the fetch or fire a test extraction** — both would write to shared infra/DB state, which the SPIKE's read-only + "no live test-fire" constraints reserve for a gated follow-up.
2. **Existing, do not re-mint**: fold the agentic-refine dormancy confirmation into `FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP` (still BACKLOG) — this SPIKE only reconfirms and extends its evidence (13d dormant, 181 PENDING), it does not change the diagnosis or remedy shape.
3. AC-3 (circuit-breaker) — already `DONE_VERIFIED`, no action.

## What could not be verified

- Whether `refine-bctc-slot-1`'s presence in `cowork-schedule.json` reflects an actually-armed, currently-firing session dispatch, or a stale/inert schedule entry (the underlying trigger is a session-scoped Claude-native mechanism this SPIKE cannot introspect from disk/DB state alone — only its output, `bctc_refined_units`, which is flat). Recommend whoever picks up `FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP` RAW-verify live session/cron-arm state directly rather than relying on the schedule file's mere presence.
- Whether PaddleOCR's own auto-provisioned weights (downloaded lazily on first successful call, per the 2026-05-27 brief) are similarly absent on the volume — could not be tested without a live extraction call (would write rows / trigger a real fetch), out of scope for this read-only pass. Should be checked as part of item 1's verification step (a successful extraction implies PaddleOCR's own lazy-download also succeeded).
- Exact minute-level sequencing of the 2026-07-15 crash → container-recreate → `5ba622eca` fix-commit timeline (pdf-extractor recreated 15:16:48Z, `5ba622eca` committed 17:21Z) was not fully reconstructed — not necessary for this AC-2's conclusion (both events are RAW-confirmed to be within the same incident window) but a full ops timeline would need launchd/compose history this SPIKE did not pull.
- Did not independently re-verify AC-1's own finding (out of this AC's scope; treated as given per router instruction).

## Investigation method

100% read-only: `Read` (source files, architecture briefs, board JSON), `Bash` (`docker exec ... bun -e` with `new Database(path, {readonly:true})` for all live-DB queries, `docker logs`, `docker inspect`, `find`/`du`/`ls` inside the pdf-extractor container, a plain HTTP reachability probe from inside the container). No file writes inside any container, no DB writes, no extraction triggered, no branch created (not needed — no code changed).

---

## 2026-07-30 ADDENDUM — Ops Dispatch Supervised-Lane Sweep

**Dispatch:** 2026-07-30T17:46Z via Supervised-Lane Sweep (ops, plan-only, 180min timebox)  
**Coordinator:** system-auditor (dev-team monitoring)  
**Status:** Recurring dormancy confirmed; new root cause identified; follow-up FIX required

### Close-Predicate Verification (original 07-17)

**Part A: "bctc_layout_units MAX advances past 2026-06-10"**
- ✓ **VERIFIED first half:** 2026-07-17 08:20:21Z (per row's `producer_resumption_proof` field)
- ✗ **REGRESSION DETECTED:** MAX(extracted_at) = 2026-07-28 11:06:59Z (STALE 55 hours as of dispatch)
- **Verdict:** First half was genuinely met, then LOST. Producer worked briefly post-reseed, then dormant again since 07-28T11:07Z.

**Part B: "Terminal enrich_failed backlog rows (PDR/BSR/DGC/GEX 2024-Q1/2023-Q4) recover"**
- ✗ **UNVERIFIED AND LIKELY NOT RECOVERED**
- Financial_reports shows PDR/BSR/DGC/GEX rows exist with text_status=COMPLETE, but no evidence layout extraction succeeded for the terminal quarter/ticker combinations mentioned in `close_caveat`.
- Reason: Second dormancy (07-28 onwards) prevented any post-reseed recovery proof for these specific rows.
- **Verdict:** Close_predicate's second half was NEVER confirmed. Row remains un-closed.

### NEW DORMANCY EPISODE (2026-07-28 → present)

**Timeline:**
```
2026-07-28T11:06:59Z  → Last bctc_layout_units write (1193 total rows)
2026-07-28T11:11:00Z  → Circuit-breaker fires (per po_unstrand note: breaker quiet window)
2026-07-28T18:04:41Z  → pdf-extractor container restarts (7h gap — root event)
2026-07-30T17:47Z     → THIS DISPATCH — PEK still dormant (55h stale)
```

**State Check (RAW 2026-07-30T17:47Z):**
- `bctc_layout_units` MAX: 2026-07-28 11:06:59Z (1193 rows, DORMANT)
- `bctc_table_rows` MAX: 2026-07-30 11:14:48Z (3597 rows, FRESH — 6.5h stale, actively producing)
- `bctc_vps_queue` enrich_failed: 128 terminal rows (not recovering)
- `financial_reports` refine_status: PENDING=202 (was 181 on 07-17; GROWING)
- **Asymmetry confirmed:** Refine leg fresh, layout leg stalled

**Root Cause Identified (NEW — not same as 07-17):**

This is NOT the 07-17 "missing weights" defect. Weights ARE present (doclayout_yolo_ft.pt 39M, dated 2026-07-17 03:01Z in volume). The new dormancy is a **silent infrastructure failure**:

1. **OCR Gateway Child Process Deadlock:**
   - Error log repeats: `ERROR:infrastructure.ocr_gateway:ocr_gateway.inflight: semaphore=1 != os_children=0 — bookkeeping disagrees with OS ground truth`
   - Semaphore (internal bookkeeping) claims 1 child process in flight; OS sees 0 children → zombie/deadlock
   - This is a concurrency defect in the gateway's process pool or semaphore management

2. **Network Push Failure:**
   - Error log: `ERROR:infrastructure.layout_first_push_client:LayoutFirstPushClient.push_layout network error: [Errno 111] Connection refused`
   - Extraction completes but cannot push results back to mcp-server
   - Connection refused suggests mcp-server port (likely 3000 or internal endpoint) not reachable
   - Makes extraction silently fail or drop results (no FileNotFoundError crash, just silent non-recovery)

3. **Container Restart at 18:04Z:**
   - Likely orchestrated by watchdog/health check failover triggered by one of the above errors
   - Restart cleared the zombie/deadlock state momentarily but did not fix the root cause
   - Same errors resuming in current logs, causing re-stall

**Defect Class Taxonomy:**
- **NOT** a repeat of 07-17 (model cache provisioning, now fixed)
- **IS** a new infra/concurrency class: `PEK-LAYOUT-PUSH-FAILURE-NETWORK-DEADLOCK`
- **Symptom:** Silent extraction stall, no loud crash, no user-visible error
- **Scope:** Only PEK layout leg affected; refine leg unimpacted (proves mcp-server is reachable, suggests gateway/network issue is PEK-specific)

### Disposition: Original SPIKE Close BLOCKED

**Cannot flip original SPIKE to DONE because:**

1. Close_predicate first half verified but second half never confirmed, and producer re-stalled before second-half could be proven
2. New dormancy root cause is distinct and requires dedicated FIX (see below)
3. Row already contains historical context; converting to DONE would bury the ongoing live defect

**Board Action Required:**

- **Status Flip:** IN_PROGRESS → REVIEW (mark for close after follow-up FIX verifies terminal-row recovery)
- **Follow-up FIX:** Mint `FIX-BCTC-LAYOUT-PUSH-FAILURE-NETWORK-DEADLOCK` (ops+dev-pdf-extractor, high priority, P0)
  - Scope: Debug OCR gateway semaphore/child-process bookkeeping; verify mcp-server network endpoint reachability from pdf-extractor; check for port/firewall config drift post-infra events
  - Gate: Verify layout extraction resumes AND terminal rows from close_caveat recover before closing this SPIKE
  - Not a simple restart (container was restarted at 18:04Z with no fix); requires code review or config fix

### Investigation Method

100% read-only: Docker logs (`docker logs` pdf-extractor since 07-28), `docker inspect` (container state), `bun:sqlite` readonly queries (cron_job_runs, bctc_layout_units, bctc_table_rows). No file writes, no DB mutations, no extraction triggered, no code changes. Operators can execute this dispatch's findings with a single container restart + re-probe + re-dispatch if needed.

---
