# BCTC Refine-Stall + Discovery-Gap + Observability Hole — Architect Brief

**Date:** 2026-06-27
**Task:** BCTC-REFINE-STALL-RETRIGGER (ACTIVE, THROUGHPUT-DRAIN sprint, Option-B re-scope)
**Author:** architect
**Mode:** recon-first — blueprint only; no production code written
**Anchor:** de-duped escalation of 20-day VHM/VIC Q1-2026 data-integrity stall (filed 2026-06-07, corroborated WORK 3336/3337, c075)
**PO raw-probe baseline:** `get_bctc_full{VHM}` = "Chưa có dữ liệu BCTC", `get_bctc_pending_refine` = 47 docs, VHM in queue (text_status=COMPLETE / refine_status=PENDING), VIC absent from queue.

**Addendum 2026-06-27T19:38Z:** PO re-scoped to THROUGHPUT-DRAIN (Option-B). A1 DONE/falsified; B1/B2 CANCELLED (VIC resolved); A2/C1 → T3 backlog P2. New task set: T0 (P0 reset-guard) → T1 (P1 chunk-size) → T2 (P1 slots) → T3 (P2 watchdog). See § THROUGHPUT-DRAIN Sprint below.

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

---

## THROUGHPUT-DRAIN Sprint — Option-B Re-Scope (2026-06-27)

**PO Disposition:** OPTION-B — Re-scoped to focused THROUGHPUT-DRAIN sprint. A1 DONE/falsified
(dispatcher proven alive; 49 DONE units in GVR). B1/B2 CANCELLED (VIC now in refine queue, 40 windows).
A2/C1 demoted → T3 backlog P2. Consumer RAW-verified starved: `get_bctc_full{VHM}` = no data at 19:24Z.

### Task Map (sequence: T0 → T1+T2 parallel → T3)

| Task | Priority | Owner | Zone | Status | Description |
|---|---|---|---|---|---|
| **BCTC-REFINE-T0-RESET-GUARD** | **P0** | agent-father | `docs/agents/refine_bctc_md/` | READY | Harden `reset=true` guard — never clobber prior DONE units (see § Reset-Guard below) |
| **BCTC-REFINE-T1-CHUNKSIZE** | P1 | agent-father | `docs/agents/refine_bctc_md/` | READY (blocked by T0) | Raise REFINE_CHUNK_SIZE 7→12 in flow/main.md + init.md |
| **BCTC-REFINE-T2-SLOTS** | P1 | ops | `docs/data/cowork-schedule.json` | READY (blocked by T0) | Add 2 cowork refine slots (11:00 UTC + 16:30 UTC) |
| **BCTC-REFINE-T3-WATCHDOG** | P2 | dev-mcp-server | `apps/mcp-server/src/scheduler/financial-reports/` | BACKLOG | bctcRefineStalenessJob watchdog (folds A2+C1) — after T1+T2 drain |

---

### RISK-5 (CRITICAL) — reset=true Clobber: RAW-Confirmed Blocker for T1+T2

**RAW evidence (2026-06-27T19:35Z):** An ad-hoc `refine_bctc_md` worker pushed `unit-0000` with
`reset=true` on GVR (report c765098b-aad2-4c10-a66b-fddbf959a29d), which deleted all 49 prior
DONE units (now 7 remain: unit-0000..0006 from the clobbering fire). 42 completed units lost.
(Recoverable — OCR text still in `financial_reports`; re-drain needed from unit-0007.)

**Root cause:** `is_first = (pushed_ids.size == 0 OR report.refine_status == 'FAILED')` in Phase 2
of `flow/main.md`. Under non-standard invocation paths (ad-hoc prompt, partial context window), the
agent can fail to correctly populate `pushed_ids` from the `get_bctc_refined` skip-set, causing
`pushed_ids.size == 0` even when DONE units exist. The result: `reset=true` lands on a non-empty
report, wiping prior work.

**WHY THIS BLOCKS T1+T2:** Raising REFINE_CHUNK_SIZE (T1) means each clobber loses MORE units per
fire. Adding more cowork slots (T2) means MORE opportunities for a mis-fire. Shipping T1+T2 without
the reset guard makes the clobbering problem faster and larger.

**T0 spec (routes via agent-md-factory → zone `docs/agents/refine_bctc_md/flow/main.md`):**

Phase 0, Step 5 currently ends with:
```
pushed_ids = Set(units.map(u => u.unit_id))
```

T0 adds an explicit guard immediately after Step 5:
```
// RESET-GUARD (T0): if ANY prior unit is DONE, force is_first=false
// reset=true ONLY when the report has zero prior pushed units
has_done_units = units.some(u => u.window_status === 'DONE')
```

Phase 2 `is_first` becomes:
```
is_first = (pushed_ids.size == 0 AND NOT has_done_units)
// NOT: pushed_ids.size == 0 OR report.refine_status == 'FAILED'
// The FAILED path is preserved — but only when there are no DONE units to protect.
// If there ARE done units, resume from skip-set regardless of refine_status.
```

Add a fail-loud note: "If has_done_units is true and is_first would otherwise be true, log
`[RESET-GUARD] Protecting N DONE units — forcing is_first=false (reset=false)` and continue."

**Files to modify (via agent-md-factory):**
- `docs/agents/refine_bctc_md/flow/main.md` — Phase 0 Step 5 guard + Phase 2 `is_first` expression
- `docs/agents/refine_bctc_md/init.md` — update constraints section to include `no_reset_with_done_units: true`

**Post-T0 re-drain:** GVR needs re-drain from unit-0007 (7 units present, re-process units 0007..0048
and any others above 0006). Cowork next fire will pick it up once refine_status = PARTIAL.

---

### T1 — REFINE_CHUNK_SIZE Safe Ceiling

**Diagnostic baseline:** 7 windows in ~228s / ~62k subagent tokens (Haiku model).

**Per-window averages:** ~32.5s/window, ~8,857 tokens/window.

**Constraint analysis:**

| Constraint | Limit | At 12 windows | At 15 windows | Binding? |
|---|---|---|---|---|
| Haiku context (200k) at 75% budget | ~185k tokens available | 12×8.9k = 107k ✓ | 15×8.9k = 134k ✓ | Not binding at 12 |
| task_claim TTL (1800s) | 1800s | 12×39s = 468s ✓ | 15×39s = 585s ✓ | Not binding at either |
| Dense financial tables (worst-case ~15k/window) | 185k@75% | 12×15k = 180k ≈ limit | 15×15k = 225k FAIL | **Context binding at 15** |

**Recommendation: REFINE_CHUNK_SIZE = 12** (conservative ceiling, safe on dense table-heavy PDFs).
Ceiling of 15 risks context saturation on annual reports with many dense table pages.

**Files to modify (slice expressions — 4 occurrences):**
- `docs/agents/refine_bctc_md/flow/main.md` L8 (description): `REFINE_CHUNK_SIZE=7` → `REFINE_CHUNK_SIZE=12`
- `docs/agents/refine_bctc_md/flow/main.md` L48 (chunk filter): `.slice(0, 7)` → `.slice(0, 12)`
- `docs/agents/refine_bctc_md/init.md` L55 (constraints): `REFINE_CHUNK_SIZE=7` → `REFINE_CHUNK_SIZE=12`
- `docs/agents/refine_bctc_md/init.md` L60 (boundary_rules): `≤7 windows` → `≤12 windows`

---

### T2 — Cowork Slot Expansion

**Current:** 2 slots (refine-bctc-slot-1 at 09:00 UTC, refine-bctc-slot-2 at 14:00 UTC).
**Target:** 4 slots (+2 at non-conflicting off-market times).

**Conflict matrix for proposed new slots:**

| Proposed slot | Time | ICT equivalent | OFF-HOSE (02-08 UTC) | bctc-analyst (15/18/21/00) | chef-evening (19:45) | tnb-audit (20:13) | digest-daily (17:30) | Verdict |
|---|---|---|---|---|---|---|---|---|
| refine-bctc-slot-3 | 11:00 UTC | 18:00 ICT | Clear ✓ | Clear ✓ | Clear ✓ | Clear ✓ | Clear ✓ | **SAFE** |
| refine-bctc-slot-4 | 16:30 UTC | 23:30 ICT | Clear ✓ | >1h after slot-1 ✓ | Clear ✓ | Clear ✓ | Clear ✓ | **SAFE** |

**Throughput projections (all sequential, limit:1 per fire):**

| Config | Windows/day | Drain time for ~1,739 total windows |
|---|---|---|
| Current (2 slots × 7) | 14 | ~124 days |
| T1 only (2 slots × 12) | 24 | ~72 days |
| T2 only (4 slots × 7) | 28 | ~62 days |
| **T1 + T2 (4 slots × 12)** | **48** | **~36 days** |

**DDD layer:** cowork-schedule.json is not a service — it is dispatcher configuration
(layer: infrastructure/scheduling). No server rebuild required.

**New slot spec:**
```json
{
  "slot_id": "refine-bctc-slot-3",
  "cron": "0 11 * * *",
  "utc_description": "11:00 UTC daily (18:00 ICT — off-market)",
  "agent": "refine_bctc_md",
  "flow_path": "docs/agents/refine_bctc_md/flow/main.md",
  "trigger_prompt": "run docs/agents/refine_bctc_md/flow/main.md  slot=refine-bctc-slot-3\nCall get_bctc_pending_refine (limit:1), pick the OLDEST pending row (result[0]), run the flow for it. Skip any row whose pdf_path basename matches a cover-letter pattern (CV_CBTT or a TICKER_YEAR_Qn.pdf with page_count<=4) — report skip to WORK channel and EXIT cleanly.",
  "dish_type": "bctc_refine",
  "guaranteed": false,
  "depends_on": null,
  "enabled": true,
  "policy_id": "bctc-offmarket",
  "parallel_group": "bctc-refine",
  "_note": "Slot 3 of 4. Off-market confirmed (11:00 UTC = 18:00 ICT). Outside OFF-HOSE window."
},
{
  "slot_id": "refine-bctc-slot-4",
  "cron": "30 16 * * *",
  "utc_description": "16:30 UTC daily (23:30 ICT — off-market)",
  "agent": "refine_bctc_md",
  "flow_path": "docs/agents/refine_bctc_md/flow/main.md",
  "trigger_prompt": "run docs/agents/refine_bctc_md/flow/main.md  slot=refine-bctc-slot-4\nCall get_bctc_pending_refine (limit:1), pick the OLDEST pending row (result[0]), run the flow for it. Skip any row whose pdf_path basename matches a cover-letter pattern (CV_CBTT or a TICKER_YEAR_Qn.pdf with page_count<=4) — report skip to WORK channel and EXIT cleanly.",
  "dish_type": "bctc_refine",
  "guaranteed": false,
  "depends_on": null,
  "enabled": true,
  "policy_id": "bctc-offmarket",
  "parallel_group": "bctc-refine",
  "_note": "Slot 4 of 4. Off-market confirmed (16:30 UTC = 23:30 ICT). >1h after bctc-analyst-slot-1 (15:00 UTC). Outside OFF-HOSE window."
}
```

---

### T3 — bctcRefineStalenessJob Watchdog (Backlog P2, folds A2+C1)

See § Track (c) above for the full design. Key constraint from PO disposition:
the watchdog MUST distinguish "queue is deep but draining" from "queue is stalled".
Implementation must compare `refine_pending_count` across two consecutive 2h check cycles
before escalating — a single snapshot cannot distinguish growth from stable depth.

Build trigger: AFTER T1+T2 deployed AND verified draining (refine_pending_count decreasing
over 48h of observation).

---

### DDD Layer Summary

| Component | Layer | File |
|---|---|---|
| `is_first` reset-guard (T0) | interface/agent-flow | `docs/agents/refine_bctc_md/flow/main.md` |
| `no_reset_with_done_units` constraint (T0) | interface/agent-flow | `docs/agents/refine_bctc_md/init.md` |
| `REFINE_CHUNK_SIZE=12` (T1) | interface/agent-flow | `docs/agents/refine_bctc_md/flow/main.md` + `init.md` |
| Slot 3+4 (T2) | infrastructure/scheduling | `docs/data/cowork-schedule.json` |
| `bctcRefineStalenessJob` (T3) | interface/scheduler | `apps/mcp-server/src/scheduler/financial-reports/` |
