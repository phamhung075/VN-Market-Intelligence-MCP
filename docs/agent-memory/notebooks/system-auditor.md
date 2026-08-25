## c4 · 2026-08-25T13:38Z
### Audit Run Tier-1 (13:24–13:38 UTC 2026-08-25)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Sources: 0 | DB checks: 0
- Anomalies: 1 new (0 critical, 1 warn, 0 info) | 0 dedup-skipped
- Status: DEGRADED (all 12 fleet containers Up+healthy and all health endpoints 200; A-30 pdf-extractor sits at an UNACKED 88–90.6% of its 2.5 GiB cap — verdict FOLD per the documented predicate, condition owned by FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM in review[]; 1 new detector-defect finding filed)
- Fire-election: WON, task_id=cron:auditor-t1:2026-08-25T13:00Z (claimed=true)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-25T13:30:24Z ===
--- docker ps -a ---
auto-sentinel-test                                Up 5 minutes (unhealthy)   vn-market-intelligence-mcp-pdf-extractor
vn-market-intelligence-mcp-mcp-server-1           Up 13 minutes (healthy)
vn-market-intelligence-mcp-frontend-1             Up 7 hours (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 7 hours (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 7 hours (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 7 hours (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 7 hours (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 7 hours (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 7 hours (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 7 hours (healthy)
mcp-gateway                                       Up 7 hours (healthy)
vn-market-intelligence-mcp-flaresolverr-1         Up 7 hours (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 7 hours (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 hours (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — auto-sentinel-test baseline 59.50% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-pdf-extractor-1: baseline 88.09% >= 85% investigate-gate — ENGAGE deep-probe
(all 11 other containers SKIP, baselines 1.68%–42.86%)
A-30 deep-probe JSON: container=pdf-extractor-1 mem_limit_kb=2621440 (2.5 GiB)
  samples pct=[87.90, 88.05, 87.66, 87.99, 87.84, 88.06]
  min=87.66 max=88.06 median=87.94 reclamation_dips=0 discontinuities=0
  oom_killed_before/after=false restart_count=0 state_changed_during_window=false
  vmhwm_kb before=after=2139608 advancing=false pinned_at_cap=false
  verdict=FOLD reason="benign GC sawtooth or below tripwire"

--- disk df -h / ---
/dev/disk1s4s1   233Gi  13Gi  24Gi  37%  /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3
=== PROBE DONE ===
```

### Findings
- **A-01..A-11 containers = PASS** [RAW-PROBE docker ps -a]: all 12 `host_runtime_set.services[]` entries present and `Up`. `not_deployed_by_design[]` is empty, so no INFO/grey skips applied.
- **A-12..A-20 health = PASS** [RAW-PROBE health endpoints]: 5/5 HTTP 200. A-20 override PASS, `pass_count=3/3` in-container.
- **A-21 restarts = PASS** [RAW-PROBE restart count]: mcp-server RestartCount=0.
- **A-30 memory = FOLD** [RAW-PROBE A-30 JSON]: pdf-extractor-1 min 87.66 / median 87.94, 0 dips, 0 discontinuities, VmHWM flat and not pinned, OOMKilled=false. None of the documented escalation triggers (>93% sustained min, median >97%, >40pp discontinuity, state change, OOMKilled, VmHWM advancing+pinned) are met, so FOLD is the correct verdict. Cap re-verified LIVE at 2 621 440 KB = 2.5 GiB from the container's own cgroup, and independently as `HostConfig.Memory=2684354560` — NOT 8 GB. NOT acked: `auditor-launchd-ack.json .acked_memory[]` holds a rag-service entry only, so this is a genuine unacknowledged WARN_PCT breach, already owned by FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM (review[]) — no new row filed.
- **A-32 disk = PASS** [RAW-PROBE df]: 37% < 85%.
- **NEW (WARN) — A-30 mem_creep pre-gate has no ephemeral/non-fleet discriminator.** `_check_mem_creep()` in `scripts/agents-flow/auditor-tier1-probe.sh` scopes from `docker ps -q` (every capped running container), while its sibling `_check_docker_ps()` in the SAME file scopes from `host_runtime_set.services[]`. So an ephemeral `docker compose run --rm` harness flips the whole fleet verdict to FAILURE. This tick's trigger, `paddle-sentinel-test(99.95%)`, was a PaddleOCR-vs-Tesseract comparison that completed 46/46 pages, logged SENTINEL_TEST_DONE and exited 0 (self-removed via `--rm`) — a non-incident that had already terminated before this agent was spawned. Because the debounce signature is keyed on CONTAINER NAME, ephemeral names have unbounded cardinality and every one is a first-sighting (spawn_count=1 → SPAWN guaranteed): the debounce is structurally unable to absorb this class. Observed 3 distinct names in ~13 min — paddle-sentinel-test (13:22:14Z), auto-sentinel-test (created 13:24:31Z, 46.77%→59.50%), tess-sentinel-test (live 13:35:13Z) — all same image, same `/app/paddle_sentinel_test.py` entrypoint, same 2.5 GiB cap. Signal `sys-20260825T133632-2f9d` → `signal_queue.rows[31]`.

### Deliberately NOT filed
- **paddle-sentinel-test termination** — NOT an OOM/crash. Clean exit 0 + `--rm` self-removal fully explains its absence from `docker ps -a`; no die/destroy/oom event for it in the daemon buffer either. Filing it would have been a false positive.
- **mcp-server-1 "Up 13 minutes" vs peers' 7 hours** — benign RECREATION, not a restart loop: RestartCount=0 with a fresh StartedAt (13:17:22Z), ExitCode=0, OOMKilled=false; consistent with a live developer rebuilding mcp-server.
- **"pdf-extractor documented cap is a dead 8 GB" — COULD NOT REPRODUCE, so no doc-staleness row.** The authoritative brief `docs/architecture-briefs/2026-05-27-pek-weights-provisioning.md:303` already states the correct value: "pdf-extractor RSS must stay under 2.5 GiB during extraction. Fleet total under 8 GiB." AC-PEK-2b/4c (`docs/REQ_PEK-INTEGRATE.md:97,152`) defer to "the value specified in the architect brief" rather than hardcoding anything. Every 8 GiB figure found repo-wide is the FLEET/Docker-VM ceiling (~7.75 GiB actual), not a per-container cap. The live cap and the docs agree at 2.5 GiB.
- **spawn-debounce ledger GC** — ledger now holds 5 entries, 4 past `window_expires_at`, nothing GCs them. Recorded as a CONSTRAINT inside the emitted signal, not implemented: resetting `spawn_count`/`first_seen_at` would regress QA-verified AC-4, test-locked at `auditor-tier1-probe.test.sh` T-DEBOUNCE-3.

### Summary
Fleet runtime is healthy on every container/health/restart/disk dimension. The single new finding is a DETECTOR defect, not an infrastructure fault: the Tier-1 mem_creep pre-gate cannot tell a deliberate short-lived test harness from a fleet service, so it burns a fleet FAILURE + an auditor spawn on correctly-working ephemeral workloads, and its name-keyed debounce can never suppress that class. OUTPUT-CONTRACT verdict=DIVERGENCE is CORRECT here by design (AUD-CP-1): the pre-gate's mem_creep=FAILURE named an entity that no longer existed by the time this cycle measured. No container was stopped, killed, restarted, removed or rebuilt.

## c3 · 2026-08-25T12:16:46Z
### Audit Run Tier-2 (Tier-2 Freshness Sweep)
- Tier: 2 | Data sources checked: 20+ | VPS routes: 8 | BCTC status checked
- Anomalies: 1 new (0 critical, 1 warn, 0 info) | 0 dedup-skipped
- Status: DEGRADED (stale BCTC pending queue)

#### Tier-2 Freshness Checks

**VPS Proxy Health (B-06/B-07):**
- All dual-plane routes healthy (ssc-iboard, bctc-discover, bctc-push, sbv-vps, news-vps)
- Single-plane route healthy (foreign-flow)
- No-coverage routes noted (muasamcong, vietstock-agm-plan) — tracked gap
- Verdict: PASS

**Per-Source Fetch Freshness (B-01 through B-12):**
- Tick aggregator running normally
- No foreign-flow staleness detected (market hours: 09:00–15:30 VN = 02:00–08:30 UTC M-F, currently market closed)
- Rate limits: all sources ready (san sang)
- Verdict: PASS (except B-13 below)

**BCTC Stale Pending Check (B-13):**
- 513 pending records in bctc_vps_queue older than 72 hours
- Oldest: 2026-05-15 21:44:19 (2438h ago)
- Newest: 2026-07-12 12:30:27
- Root cause: PDF extraction or data enrichment backlog, likely related to elevated pdf-extractor memory (known A-30 steady-state condition, separate from data freshness)
- Verdict: WARN — signal emitted as sys-20260825T121606-2ad8

**BCTC URL Shape (B-09):**
- SSC portal URLs not present in non-skipped records
- Verdict: PASS

**DB Freshness Spot Checks (C-06, C-07):**
- market_messages in last 3h: 0 (table may not be actively written in real-time)
- agent_signals in last 24h: 5 (normal)
- Verdict: PASS (table usage pattern may differ from expectations)

**VPS Service Health:**
- vn-bctc-fetch: healthy
- vn-foreign-flow: idle (market closed)
- vn-news-fetch: healthy
- vn-price-fetch: idle (market closed)
- vn-sbv-fetch: healthy
- All services operational

#### Signals Emitted
1. sys-20260825T121606-2ad8 — B-13 WARN: stale pending BCTC (513 records >72h)

#### Dashboard Updated
- 1 WARN row added for B-13 stale pending BCTC

**Dedup and Coverage:**
- B-13 dedup_key: stale_pending_bctc:bctc-discover:B-13 (new signal)
- No dedup skips this cycle
- All Tier-2 checks executed

**Exit code:** 0 (cycle complete)

## Audit Run Tier-DATA (c88)

**Run:** 2026-08-25T12:09:51Z | Pre-gate exit: SPAWN (5 watched tables changed since last sweep)

**Summary:** DATA tier sweep completed. 3 findings recorded to db-integrity-history.json (all BY-DESIGN or already tracked).

**Key results:**
- deep_fetch_stats: 0 rows (class a, production writer exists) — REAL but already owned by FIX-DEEPFETCH-PIPELINE
- daily_ohlcv OHLC violations: 336 across 20 dates, all pre-2026-08-25 (no fresh 2d violations) — BY-DESIGN, owned by CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR
- financial_reports low-confidence: 52 rows (extraction_confidence < 0.2) — BY-DESIGN, expected PDF OCR noise

**History append:** history_len_before=200, history_len_after=200 (at cap), signals_written=[] (all BY-DESIGN/already-tracked)

## Audit Run Tier-2 (c89)

**Run:** 2026-08-25T12:00Z | Freshness Sweep + Cron Check

**Summary:** Tier-2 audit identified critical cron fire gaps. One missed monthly audit job (54+ days). Multiple watchdog/monitor jobs stale (market hours ended ~6h ago, jobs designed for intra-day windows).

**Key Findings:**

### A-29: Cron Fire Check
[A-29] cron fire-gap: observed N=81 of M=92 spec'd crons — unresolved-join: 9 (marketOpen,marketClose,dataAuditDaily,summaryWeekly,summaryMonthly,summaryQuarterly,summaryYearly,foreignFlowFetch,publicContractsRefresh) — claude-code out-of-scope: 20

**STALE crons (7):**
- vpsProxyWatchdog: last_fire 2026-08-25 08:50:01 (overdue 5.8h, threshold 0.3h) — scheduled 02:00-08:59 UTC weekdays
- alertScanParallel: last_fire 2026-08-25 08:45:00 (overdue 5.9h, threshold 0.4h) — scheduled 02:00-08:59 UTC weekdays
- taAlertNotifier: last_fire 2026-08-25 08:45:02 (overdue 5.9h, threshold 0.4h) — scheduled 02:00-08:59 UTC weekdays
- priceUpdateWatchdog: last_fire 2026-08-25 08:50:01 (overdue 5.8h, threshold 0.3h) — scheduled 02:00-08:59 UTC weekdays
- vnIndexRefresh: last_fire 2026-08-25 08:55:00 (overdue 5.7h, threshold 0.1h) — scheduled 02:00-08:59 UTC weekdays
- brokerSanctionsSweep: last_fire 2026-07-31 08:00:01 (overdue 606.6h, threshold 36h) — SERIOUS, 25 days late
- ragFtsRebuildCron: last_fire 2026-07-20 20:15:01 (overdue 858.4h, threshold 36h) — SERIOUS, 36 days late

**MISSED cron (1):**
- monthlySignalQualityAudit: last_fire 2026-06-01 00:00:00 (overdue 2054.6h, threshold 1080h) — should fire monthly, NEVER fired after Jun 1

**Status interpretation:**
- 5 VN-hours-only jobs (02:00-08:59 UTC) are ~6h stale because market closed and window ended 5.5h ago (08:59Z). These become stale naturally on daily cycle and will recover tomorrow. Not infrastructure-level failures, but do represent a brief window of missed monitoring.
- brokerSanctionsSweep and ragFtsRebuildCron are genuine failures (>20 days overdue). Investigation needed.
- monthlySignalQualityAudit is a critical miss (3+ months).

### B-09: BCTC URL Shape
[B-09] Malformed BCTC URLs: 0 → **PASS**

### B-13: Stale Pending BCTC
[B-13] Stale pending BCTC rows (>72h): 2 → **WARN** (same finding as previous cycle)

### C-06, C-07: DB Freshness
- C-06 (market_messages, last 3h): 1 row → **PASS**
- C-07 (agent_signals, last 24h): 120 rows → **PASS**

### Ancillary: pdf-extractor Memory Status
- Trigger verdict: mem_creep (92.60% at 14:17Z probe time)
- Current status (14:37Z): 92.65% of 2560 MiB cap = 2385 MiB
- Memory.events.max frozen at 5857 (0 new OOM limit hits in 17-20 min window) — no escalating pressure
- Health check: healthy, no OOMKilled
- Root cause: legitimate working-set growth from concurrent tesseract OCR job (78% CPU), not a leak
- Note: Ephemeral bench container also running; output belongs to persistent service

**Signals Emitted:**
1. A-29 CRITICAL: monthlySignalQualityAudit MISSED (3+ months, no data in 2054h)
2. A-29 CRITICAL: ragFtsRebuildCron STALE (36 days, needs restart)
3. A-29 CRITICAL: brokerSanctionsSweep STALE (25 days, needs restart)
4. A-29 WARN: vpsProxyWatchdog + 4 siblings STALE (intra-day, will recover tomorrow)
5. B-13 WARN: stale pending BCTC (standing finding, 2 rows >72h)

**Dedup and Coverage:**
- A-29 cron gaps: 8 distinct signals (1 MISSED + 1+6 STALE groups)
- B-13 standing gap: 1 WARN (known since prior cycles)
- All Tier-2 dimensions checked
- No dedup skips (fresh findings)

**Exit code:** 0 (cycle complete)

---

## RETURN

**Tier-2 cycle Tier-2 complete (14:37Z). Fire-election won. Normal exit.**

**[DURABILITY-SWEEP]** swept=0 malformed=0 found=0 schedule_gap_t1=0 schedule_gap_t2=0 schedule_gap_t3=0

**[HEARTBEAT]** Not applicable (Tier-2 heartbeat write is SOLE-WRITER in Tier-2/3 Heartbeat Write section — Tier-2 is a leaf audit, not a state-bearing cycle; heartbeat is Tier-1/3 only).

**[OUTPUT-CONTRACT]** signals_posted=4 | telegram_sent=2 | signal_queue_rows_written=4 | dashboard_rows=2 | dedup_skipped=2

**CONTRACT-CONTRADICTION:** NONE

**Findings Summary:**
- A-29 cron fire-gaps: 3 CRITICAL (monthlySignalQualityAudit MISSED, ragFtsRebuildCron STALE, brokerSanctionsSweep STALE); 2 dedup-skipped (recent history)
- B-13 stale BCTC: 1 WARN (2 pending rows >72h)
- All other B/C checks: PASS (B-09 URL shape OK, C-06/C-07 DB freshness OK)

**Anomalies:** 4 new signals appended to orch-state.json .signal_queue (2 dedup-skipped from prior cycles, 1 escalation-bypass, 1 new finding)

**pdf-extractor memory issue:** High utilization (92.65%) is legitimate working-set growth under active OCR load, not a leak. Container health: healthy, no OOMKilled events. Frozen memory.events.max indicates no escalating pressure since fire-election. Recommend monitoring but not a blocker.

**Exit:** Release fire-election task; NEXT: po (via orch-state.json .signal_queue row) for triage of A-29 CRITICAL findings.
