# BCTC Refine-Stall + Discovery-Gap + Observability Hole — Architect Brief

**Date:** 2026-06-27
**Task:** BCTC-REFINE-STALL-RETRIGGER (READY, P1, multi-zone)
**Author:** architect
**Mode:** recon-first — blueprint only; no production code written; no orch-state board mutations from this file
**Anchor:** de-duped escalation of 20-day VHM/VIC Q1-2026 data-integrity stall (filed 2026-06-07, corroborated WORK 3336/3337, c075)
**PO raw-probe baseline:** `get_bctc_full{VHM}` = "Chưa có dữ liệu BCTC", `get_bctc_pending_refine` = 47 docs, VHM in queue (text_status=COMPLETE / refine_status=PENDING), VIC absent from queue.

---

## Three Root-Cause Tracks

### Track (a) — Refine-Stall: 47 docs stuck text_status=COMPLETE / refine_status=PENDING

**Verified root cause: the server-side refine cron was deleted and the replacement host-level cron (cowork CronCreate) is currently not firing.**

Under Option-Y (§0.7.2 ruling, documented in `bctcRefineJob.ts` header comment), the production
in-container spawn path (`runBctcRefineJob()`) was deleted because `claude` CLI is absent inside the
Docker container. Orchestration was moved to the "host-level fleet cron" — which is the `refine_bctc_md`
cowork agent with two daily slots:
- `refine-bctc-slot-1`: 09:00 UTC daily
- `refine-bctc-slot-2`: 14:00 UTC daily

Both slots are `enabled: true` in `docs/data/cowork-schedule.json`. They are fired by the
`cowork-team` dispatcher (CronCreate `*/15 * * * *`).

**Why the 20-day stall:**
CronCreate sessions are scoped to the Claude terminal session. When the main terminal session restarted
around 2026-06-07 (consistent with the reported stall start date), the cowork-team CronCreate was
not re-armed. Unlike the server-side `startScheduler()` (always-on in Docker), CronCreate crons die
silently on session close. The `refine_bctc_md` agent then never received a dispatch tick, so
`get_bctc_pending_refine` was never polled, and the 47 OCR-complete docs accumulated.

**Secondary contributing factor:** The headpoison fix (FIX-REFINE-QUEUE-TERMINAL-FAILED-UNIT-HEADPOISON,
ARCH notebook 2026-06-24) extended the PARTIAL-exclusion predicate in `getBctcPendingRefineTool.ts` to
also exclude PARTIAL docs where all units are DONE or FAILED. This is correct logic, but it implies
that prior refine attempts on some of the 47 docs may have left stale FAILED window units — those docs
would re-enter the queue once the cron is re-armed and reset=true is used on first push.

**Production file map:**
- `apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts` — Option-Y comment; `runBctcRefineJob()` deleted
- `docs/agents/refine_bctc_md/init.md` — trigger.schedule_slots (slots 1+2) + dispatcher pointer
- `docs/data/cowork-schedule.json` — live slot definitions (`refine-bctc-slot-1/2`, `enabled: true`)
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPendingRefineTool.ts` — Branch 3 queue predicate
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/pushBctcRefinedUnitTool.ts` — reset=true DELETE guard
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts` — Phase 4 collect-then-write

**Structural gap:** A cowork-only drain creates a single point of failure with no self-healing. The
server-side scheduler has zero awareness of whether the host-level agent is alive. When the agent lapses,
the queue silently grows.

**Recommended fix:**
- **Immediate (ops, no dev):** Re-arm the cowork CronCreate via `/cron-cowork-team` skill. The existing
  `refine_bctc_md` flow is complete; it just needs to be re-dispatched.
- **Structural (dev-mcp-server, SPRINT-S):** Add a server-side `bctcRefineStalenessCheckJob` that
  detects when the refine queue has aged beyond 4h and logs a WORK-channel alert with the count of
  stuck docs. This is observability (Track (c) below), not a replacement cron. The cowork agent
  remains the actual drain mechanism; the server job is the watchdog.
  - Zone: `apps/mcp-server/src/scheduler/financial-reports/`
  - DDD layer: interface/scheduler (reads DB, writes Telegram)
  - Route_to: dev-mcp-server

---

### Track (b) — VIC Discovery-Gap: PDF never entered the pipeline

**Verified facts:** VIC and VHM are both HOSE-listed. VHM successfully reached `text_status=COMPLETE`
in `financial_reports`. VIC is absent entirely from `financial_reports` AND from `get_bctc_pending_refine`.

**Pipeline stages that must have all completed for VHM but not VIC:**

```
Stage 1: backfillBctcQ12026 inserts bctc_vps_queue row (source_url=NULL)
Stage 2: bctcQueueEnricherJob discovers PDF URL via SSC NewsSearch (MAX_ENRICH_ATTEMPTS=5)
Stage 3: bctcPdfPullJob downloads PDF from VPS cache (source_url must start with VPS base)
Stage 4: POST /api/push-bctc-pdf → pdf-extractor OCR → financial_reports row created
```

VIC's absence from `financial_reports` means Stage 4 never completed. The failure could be at Stage 2 or 3.

**Root-cause hypothesis (ranked by probability):**

**C-1 (most likely): VIC Q1-2026 PDF not indexed in SSC NewsSearch when the enricher ran.**
Vingroup's conglomerate BCTC may have been filed later than Vinhomes. The enricher runs at most
`MAX_ENRICH_ATTEMPTS=5` times per row (~75 min window at 15-min cadence). If all 5 attempts were
exhausted before VIC filed, the row was parked as `url_not_found` and exits the normal pull cycle.

**C-2: Enrichment batch-size cap.** `DEFAULT_BATCH_SIZE=20` items per run. If the Q1-2026 backfill
produced 30+ tickers in the queue simultaneously, VIC could have been consistently below position 20
for the first 5 enricher runs (oldest-first ordering). By the time VIC's row reached the top, the
PDF may have been discoverable — but the row was already parked.

**C-3: SSC NewsSearch title-match failure.** The discovery script parses SSC result rows and matches
quarter/year via Vietnamese title strings (e.g., "quý 01 năm 2026"). Vingroup's filing format might
use a non-standard title structure that `_ssc_parse_rows()` regex doesn't match. The VPS script logs
"No PDF found" but this log is never surfaced in the mcp-server alerting path.

**What needs to be diagnosed (RAW-probe before fix):**
1. Check `bctc_vps_queue` for VIC row: what is `status`, `attempts`, `source_url`?
2. Check VPS systemd logs: `grep VIC /var/log/vn-bctc-fetch.log` — did discovery ever find a URL?
3. Run `discover-bctc-urls-browser.py VIC 2026 Q1` manually on VPS to confirm current discoverability.

**Production file map:**
- `vps-scripts/discover-bctc-urls-browser.py` — `_discover_ssc()` + `_ssc_parse_rows()` (title regex)
- `vps-scripts/fetch-bctc.sh` — per-item discovery + push flow
- `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts` — `MAX_ENRICH_ATTEMPTS=5`, `DEFAULT_BATCH_SIZE=20`
- `apps/mcp-server/src/scheduler/financial-reports/backfillBctcQ12026.ts` — INSERT OR IGNORE for all watchlist tickers

**Recommended fix:**
- **Immediate (dev-mcp-server, 1 query):** RAW-probe `bctc_vps_queue` for VIC row to confirm hypothesis.
  If `status=url_not_found`, manually reset the row to `pending, attempts=0` so the enricher re-tries.
- **Structural (dev-vps-crawls, SPRINT-S):** If C-1 confirmed, add a "re-discovery sweep" that resets
  `url_not_found` rows for tickers still missing from `financial_reports` after a configurable window
  (e.g., 30 days post-earnings-season). Current `url_not_found` status is terminal — no auto-retry.
  Zone: `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts`
- **If C-3 confirmed (dev-vps-crawls):** Fix the SSC title-match regex in `vps-scripts/discover-bctc-urls-browser.py`
  to handle Vingroup's filing title format.

---

### Track (c) — Observability Hole: 20 days of silence

**Root-cause: no server-side watchdog monitors `refine_status=PENDING` queue depth over time.**

The existing alert coverage for the BCTC pipeline:

| Watchdog | What it catches | What it misses |
|---|---|---|
| `vpsProxyWatchdogJob.ts` | price staleness (>15 min) | anything BCTC |
| `FIX-BCTC-ZERO-URL-ALERT` (bctcQueueEnricherJob) | 0 URLs in enricher cycle during earnings window | OCR-done docs stuck in refine |
| `FIX-BCTC-FRESHNESS-GATE` (bctcQueueEnricherJob) | VPS push age > 24h | refine-side stalls |
| `freshnessSlaMonitorJob.ts` | price/news/macro/portfolio SLA | BCTC refine queue depth |
| `bctcOverdueCheckJob.ts` | tickers with zero filings | OCR-done docs stuck in refine |

**Gap:** No watchdog checks: `COUNT(*) WHERE text_status='COMPLETE' AND refine_status IN ('PENDING','PARTIAL') AND parsed_at < (now - 24h)`. This count was 47 for 20 days — fully undetected.

**Second-order gap:** The Option-Y cowork-dependency architecture creates a silent-failure class.
When the cowork CronCreate lapses, the server has no self-healing path and no internal signal that
the refine drain has stopped. The existing `freshnessSlaMonitorJob` monitors data-source freshness
(prices, news) but BCTC refine-queue depth is not a data-source signal — it's a pipeline-processing
signal at a different layer.

**Definitif fix (root-cause, not band-aid):** Extend `freshnessSlaMonitorJob` OR add a dedicated
`bctcRefineStalenessJob`:

```typescript
// apps/mcp-server/src/scheduler/financial-reports/ (new file)
// bctcRefineStalenessJob.ts
//
// Cron: every 2h (not 6h — want to catch 24h-old stalls within the day)
// DDD layer: interface/scheduler
//
// Check 1: refine_pending_count
//   SELECT COUNT(*) FROM financial_reports
//   WHERE text_status = 'COMPLETE'
//     AND refine_status IN ('PENDING', 'PARTIAL')
//     AND parsed_at < (strftime('%s','now') - 86400)  -- older than 24h
//
// Check 2: last_refine_attempt age (from cron_job_runs WHERE job_name = 'refine_bctc_md')
//   If last run > 25h ago AND refine_pending_count > 0 → cowork drain has lapsed
//
// Alert thresholds (WORK channel, 6h dedup per type):
//   refine_pending_count > 0 for >24h:   "BCTC refine queue stalled: N docs PENDING"
//   refine_pending_count > 5:             escalate to HIGH
//   last_refine_attempt > 25h:            "refine_bctc_md agent not seen for Xh — check cowork cron"
```

**Note:** Check 2 (cron_job_runs probe for refine_bctc_md) requires the `refine_bctc_md` agent to
log its cycle to `cron_job_runs` on each invocation. This is a small additive change to the
`refine_bctc_md` flow. Current: the agent pushes units and finalizes but does not write a
`cron_job_runs` row. The `SqliteJobRunRepository.wrapRun` pattern already used by `bctcBatchSweepJob`
can be reused.

**Production file map:**
- `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts` — existing SLA watchdog (extend or peer)
- `apps/mcp-server/src/domain/services/freshnessSlaChecker.ts` — domain checker (extend signal types)
- `apps/mcp-server/src/scheduler/jobs.ts` — cron registration (add new job)
- `docs/agents/refine_bctc_md/flow/main.md` — add `SqliteJobRunRepository.wrapRun` call at start/end of each cycle

---

## Standard Detection

```
NEW FEATURE (apps/mcp-server/ already exists):
  → BUILD-STANDARD: lean
  → BUILD-STANDARD-REF: docs/standards/microservice-build-standard.md
  → NOTE: dev-mcp-server drives end-to-end for Tracks (a) and (c)

NEW FEATURE (vps-scripts/ — Track b structural):
  → BUILD-STANDARD: lean
  → NOTE: dev-vps-crawls; deploy via scripts/deploy-vinahost.sh

BUG-FIX / OPERATIONAL (immediate re-arm + VIC queue reset):
  → BUILD-STANDARD: not-applicable (ops action + 1-query fix)
```

---

## Recommended Task Split (3 tracks → 5 tasks)

| Task ID | Type | Route_to | Zone | Size | Priority | Description |
|---|---|---|---|---|---|---|
| **BCTC-REFINE-A1** | OPS | ops (immediate) | `.claude/` | XS | P1 | Re-arm cowork CronCreate via `/cron-cowork-team` skill. Unblocks 47 docs TODAY. |
| **BCTC-REFINE-A2** | SPRINT-S | dev-mcp-server | `apps/mcp-server/src/scheduler/financial-reports/` | S | P1 | `bctcRefineStalenessJob` — server-side watchdog for refine queue depth + cowork-lapse detect. Wire into `jobs.ts`. |
| **BCTC-REFINE-B1** | FIX | dev-mcp-server | `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts` | XS | P2 | RAW-probe VIC queue row; manually reset to `pending, attempts=0`; verify enricher picks up VIC. |
| **BCTC-REFINE-B2** | SPRINT-S | dev-vps-crawls | `vps-scripts/discover-bctc-urls-browser.py` | S | P2 | Fix: (a) re-discovery sweep for `url_not_found` rows missing from financial_reports; (b) if C-3 confirmed, fix SSC title-match regex. |
| **BCTC-REFINE-C1** | SPRINT-S | dev-mcp-server | `apps/mcp-server/src/scheduler/financial-reports/` + `docs/agents/refine_bctc_md/flow/` | S | P2 | Add `SqliteJobRunRepository.wrapRun` to refine_bctc_md cycle; extend freshnessSlaChecker with `refine_bctc` signal type. |

---

## Highest-Value FIRST Track Under WIP=1

**BCTC-REFINE-A1 (ops, immediate, no dev sprint needed).**

Re-arm the cowork CronCreate immediately. The `refine_bctc_md` flow is fully implemented and
correct — the stall is purely a session-restart problem. Once re-armed:
- The next slot fires at 09:00 UTC or 14:00 UTC
- `get_bctc_pending_refine` returns 47 docs (oldest-first order)
- The agent processes one report per invocation (limit:1 per slot)
- With 2 slots/day, 47 docs drain in ~23 days at steady state; the router can optionally spawn
  additional manual refine invocations to clear the backlog faster

After re-arm is confirmed live (check `cron_job_runs` or probe `refine_status` flipping on VHM),
route BCTC-REFINE-A2 + BCTC-REFINE-B1 as the next sprint under WIP=1.

**Baseline risk (re-arm):** Low. The cowork skill is /cron-cowork-team (idempotent). No code changes
to deploy. The refine_bctc_md flow handles the 47-doc backlog via `reset=true` on first push,
which DELETEs any prior stale FAILED units before re-processing.

**Risk note for B1 (VIC):** After VIC's `bctc_vps_queue` row is reset and the enricher discovers
the PDF, the VPS-side download may still fail if VIC's BCTC was filed late OR if the SSC session
has changed. The router should probe `bctc_vps_queue WHERE action_code='VIC'` after the reset to
confirm source_url is populated before declaring B1 done.

---

## DDD Layer Assignments

| Component | Layer | Folder |
|---|---|---|
| `bctcRefineStalenessJob` (new) | interface/scheduler | `apps/mcp-server/src/scheduler/financial-reports/` |
| `refine_pending` SLA signal type | domain | `apps/mcp-server/src/domain/services/freshnessSlaChecker.ts` |
| `cron_job_runs` wrapRun call in refine_bctc_md | interface (agent flow) | `docs/agents/refine_bctc_md/flow/main.md` |
| VIC queue reset (1 SQL) | infrastructure (bctc_vps_queue) | ops query, no new file |
| SSC title-match regex fix | infrastructure/fetcher | `vps-scripts/discover-bctc-urls-browser.py` |
| re-discovery sweep for url_not_found | interface/scheduler | `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts` |

---

## Risk Flags

**RISK-1 (HIGH — Track a):** The cowork CronCreate is the SOLE drain mechanism for the refine queue.
Without Track (c) staleness watchdog, any future session restart will silently stall the queue again.
Re-arm alone is a band-aid; BCTC-REFINE-A2 + BCTC-REFINE-C1 are the definitif fixes.

**RISK-2 (MEDIUM — Track b):** The `url_not_found` status is currently terminal — once parked, VIC
stays out of the enricher forever. If VIC's BCTC is now publicly available on SSC but the row is
parked, no automatic retry will fetch it. B1 (manual reset) is the only unblock path today.

**RISK-3 (LOW — Track a, drain speed):** With limit:1 per slot and 2 slots/day, the 47-doc backlog
takes ~23 days to clear at steady state. The router can manually trigger additional refine_bctc_md
invocations outside the cowork schedule to accelerate drain. Each invocation is idempotent (reset=true
on first push clears prior stale state).

**RISK-4 (LOW — Track c, Check 2):** The `refine_bctc_md` agent currently does NOT write to
`cron_job_runs`. Adding `wrapRun` requires a small change to the agent flow AND a server-side cron
for reading it. If this is deferred, Check 1 (queue depth) alone is 80% of the observability value.
