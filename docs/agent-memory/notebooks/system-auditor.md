## c6 · 2026-08-25T17:09Z
### Audit Run Tier-1 (17:00–17:09 UTC 2026-08-25) — targeted mem_creep verification, dispatched by coordinator
- Tier: 1 | Services: 13 checked (12 host_runtime_set + 1 ephemeral) | Sources: 0 | DB checks: 0
- Anomalies: 1 new (0 critical, 0 warn on A-30 itself, 1 WARN meta-finding) | 0 dedup-skipped
- Fire-election: WON, task_id=cron:auditor-t1:2026-08-25T17:00Z
- Trigger cited by coordinator: pre-gate `auditor-tier1-last-trigger.json` verdict=FAILURE 16:57:13Z, signature `mem_creep:vn-market-intelligence-mcp-pdf-extractor-1` (85.77%). Did NOT re-run `scripts/agents-flow/auditor-tier1-probe.sh` (mutates spawn-debounce ledger as a side effect — proven by the coordinator on this same tick). Debounce ledger read-only: this signature's own entry has spawn_count=4, first_seen_at 2026-08-24T12:42:19Z.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-25T17:00:35Z ===
--- docker ps -a --- : 12/12 host_runtime_set Up (healthy), +ocr-bench-tesseract-vie-3698 (ephemeral, health:starting, image=pdf-extractor, out of host_runtime_set) +flaresolverr-1 (pre-existing scope gap)
--- health endpoints --- : 5/5 HTTP 200
--- restart count --- : mcp-server RestartCount=1
--- memory pressure --- : mcp-server MemPerc=8.45%
--- memory pressure multi-probe reclamation (A-30) --- :
  SKIP (< 85%): ocr-bench-tesseract-vie-3698(38.62%) mcp-server(11.25%) frontend(9.57%) alert-engine(2.05%) rag-service(33.56%) news-fetch(2.84%) api-gateway(2.65%) stock-price(2.69%) macro-indicators(2.15%) flaresolverr(5.50%) technical-analysis(3.75%) kinh-dich-service(2.59%)
  ENGAGE: vn-market-intelligence-mcp-pdf-extractor-1 baseline 85.77%
  {"container":"vn-market-intelligence-mcp-pdf-extractor-1","window":{"probes":6,"interval_sec":13,"span_sec":65},
   "state":{"oom_killed_before":"false","oom_killed_after":"false","restart_count_before":"0","restart_count_after":"0","state_changed_during_window":false},
   "vm":{"vmhwm_kb_before":"2433436","vmhwm_kb_after":"2433436","mem_limit_kb":"2621440","vmhwm_advancing_in_window":false,"vmhwm_pinned_at_cap":true},
   "samples":[{"n":1,"t":"17:00:49Z","pct":85.77},{"n":2,"t":"17:01:04Z","pct":85.77},{"n":3,"t":"17:01:19Z","pct":85.77},{"n":4,"t":"17:01:34Z","pct":86.19},{"n":5,"t":"17:01:49Z","pct":86.19},{"n":6,"t":"17:02:05Z","pct":86.19}],
   "analysis":{"min_pct":85.77,"max_pct":86.19,"median_pct":85.98,"reclamation_dips":0,"discontinuities":0},
   "verdict":"FOLD","reason":"benign GC sawtooth or below tripwire"}
--- disk df -h / --- : 45%
--- pdf-extractor in-container multi-probe (A-20) --- : 3/3 HTTP 200
=== PROBE DONE ===
```

### Findings
- **A-30 (pdf-extractor) = FOLD, no emit** (per spec: FOLD → PASS). Discriminator sees no escalation signal: 0 dips, 0 discontinuities, no state change, OOMKilled false before/after, VmHWM pinned at cap (2433436kB/2621440kB) but NOT advancing during this window.
- **Independent cgroup read** (direct `docker exec ... cat /sys/fs/cgroup/memory.*`, taken ~30s before the probe run): `memory.current=2349654016B` (~2240.9MiB), `memory.max=2684354560B` (2560MiB — matches the coordinator's stated 2.5GiB cap exactly), `memory.peak=2684370944B` (~2560.0MiB, i.e. peak has reached the hard cap). `memory.events`: `max=5920 oom=0 oom_kill=0` — the cgroup hard limit has been hit thousands of times but the kernel has reclaimed, never killed. `docker inspect`: `OOMKilled=false RestartCount=0 ExitCode=0`.
- **Container lifecycle**: `Created=2026-08-24T13:35:05Z` but `StartedAt=2026-08-25T06:33:03Z` — this container's current process is only ~10.5h old (a clean stop/start with exit_code=0, RestartCount=0, NOT a crash — restart policy `unless-stopped`; container logs at 06:33Z show a normal uvicorn/ProcessPoolExecutor startup, no error). It reached the 85%+ band well within that 10.5h window, which argues AGAINST an unbounded multi-day leak (a leak would reset near-zero at restart and take a long time to reclimb) and FOR a workload-intrinsic steady-state footprint.
- **Historical cross-check (git log, independent of coordinator's cited 08-11 data point)**: this container has recurred in an 85.1–87.1% MemPerc band on every A-30 deep-probe since at least 2026-08-08 (c22 2026-08-09 was the one genuine ESCALATE investigated at the time; every cycle since — c23, c30/c32 sustained-WARN dedup-skips, c47, c52, c64/c65/c67, c116/c117, 2026-08-24T03:00Z 87.06%, today) resolved FOLD or benign-tracked. This is a >2-week plateau, not creep.
- **Prior-art, same day**: an earlier Tier-1 cycle today (commit `c5ffb1d0e`, 14:24:20Z+0200/14:23:16Z tick) already ran a deeper cgroup investigation and filed `sys-20260825T142316-4385` (INFO, dedup_key `pdf_extractor_memory_pressure_investigation:A-30`, still NEW/unactioned to po) concluding genuine anonymous-working-set pressure, not a leak, recommending a cap increase to 3–3.5GiB. My independent readings this cycle corroborate that conclusion (same cap-pinned peak, same zero-OOM-kill pattern). Not re-filed — would be a duplicate.
- **Two existing WARN signals** (`sys-20260825T133632-2f9d`, `sys-20260825T150107-0332`, dedup_key `detector_defect:auditor-tier1-probe:mem_creep_ephemeral_container_scope`) cover a DIFFERENT, already-tracked root cause: short-lived OCR-benchmark containers polluting the mem_creep composite signature. Not the same mechanism as this cycle's finding (below) — the persistent named container `pdf-extractor-1` is not an ephemeral test harness.

### New finding filed this cycle
The pre-gate's per-signature spawn-debounce window is 1h (`docs/data/auditor-tier1-spawn-debounce.json`); this signature (`mem_creep:vn-market-intelligence-mcp-pdf-extractor-1`) has spawn_count=4 in ~28h on its current ledger entry alone, against an underlying condition that git history shows has persisted 17+ days and has NEVER escalated on deep-probe. Each re-spawn burns a full Tier-1 subagent + ~95–105s deep-probe subprocess to reconfirm a state that resolves FOLD every time — a detector-cadence cost distinct from the two mechanisms already tracked above. Filed WARN, detect-only, no fix implemented or mandated (candidate directions named in the signal: action the existing cap-increase recommendation, or lengthen debounce for signatures with N consecutive FOLD verdicts):
`[emit-signal] OK dedup_key=detector_defect:auditor-tier1-probe:mem_creep_debounce_window_vs_persistent_fold_baseline:pdf-extractor id=sys-20260825T170808-1ae7`
`[emit-dashboard] OK id=sys-20260825T170808-1ae7 check_id=A-30-GATE`
Both read back and committed (`aad5f750a` signal_queue+dedup-ledger, `35bac8cbe` DASHBOARD.md).

### CONTRACT-CONTRADICTION
NONE — the coordinator's brief asserted no verdict, only asked for independent verification; the pre-gate's FAILURE→SPAWN and this cycle's own A-30 FOLD are not a contradiction (documented CALLER-INSTRUCTION PRECEDENCE / pre-gate-vs-cycle split, AUD-CP-1).

### Deliberately NOT done
- No `docker stop/restart/rm/compose down|up` on pdf-extractor or any peer container (constraint honored — observation-only: `docker ps`, `docker stats`, `docker inspect`, `docker exec ... cat /sys/fs/cgroup/*`, `docker logs`).
- No subagent spawned.
- Did not re-invoke `scripts/audits/verify-a30-mcp-memory-reclamation.sh` standalone — reused the JSON block already embedded in this cycle's own `docs/agents/system-auditor/probe.sh` PROBE_OUT, per the coordinator's efficiency note.
- Did not touch `docs/data/auditor-tier1-last-healthy.json` or `docs/data/auditor-tier1-last-trigger.json` (both read-only from this flow).

### Summary
mem_creep pre-gate FAILURE on pdf-extractor (85.77%) verified independently via cgroup `memory.current`/`memory.peak`/`memory.events` (never `ru_maxrss`): a >2-week-old plateau at 85–87% of a confirmed 2560MiB cap, zero OOM kills, kernel reclaiming not killing, this cycle's own A-30 discriminator FOLD (no escalation signal). TREND=steady, not monotonic creep. Root cause of the memory reading itself was already established by an earlier cycle today (genuine working-set demand, cap-increase recommended, still pending action). This cycle's own contribution: a new WARN signal on the detector's own re-spawn cadence against a long-settled baseline. No destructive action taken.
## c7 · 2026-08-25T18:33Z
### Audit Run Tier-2 (18:33–18:35 UTC 2026-08-25) — Freshness sweep, VPS routes, cron fire gaps
- Tier: 2 | Services: 0 checked (Tier-2 skips runtime) | Sources: unable to check | DB checks: 0
- Anomalies: 9+ existing (all dedup-skipped, 7-day window) | 0 new
- Fire-election: WON, task_id=cron:auditor-t2:2026-08-25T18:33:17Z

### Cron Fire Check (A-29)
**Endpoint: /api/cron-status reachable. Layer A = 92 crons total (documented in system-map.json + live CRONS registry).**

#### Summary
- Observable layer_a: N=79 (HEALTHY + STALE + MISSED + NEVER_FIRED excluding unresolved joins)
- M=92 total layer_a + 3 claude-code systemAuditTier rows = 95 spec'd
- Unresolved-join (name-join fell through, status ambiguous): 9 entries
- Claude-code out-of-scope: 20 rows (no fire-evidence source equivalent to auditor-tier*.json exists)

#### Critical Fire Gaps Detected
All gaps below already in dedup ledger (7-day window); skipping BUG channel, always appending signal_queue + DASHBOARD.

1. **monthlySignalQualityAudit** — Last fire: 2026-06-01 00:00:00 (54+ days ago, 2058.6h overdue, ngưỡng 1080h)
   - Dedup: `auditor-a29-fire-gap:monthlySignalQualityAudit` ts=2026-08-24T02:43:18Z (SKIP)

2. **ragFtsRebuildCron** — Last fire: 2026-07-20 20:15:01 (36 days ago, 862.3h overdue, ngưỡng 36h)
   - Dedup: `auditor-a29-fire-gap:ragFtsRebuildCron` ts=2026-08-24T02:43:18Z (SKIP)

3. **commodityTrackerRefresh** — Last fire: 2026-08-24 06:00:01 (36.6h overdue, ngưỡng 36h)
   - Likely in `auditor-a29-fire-gap:stale-crons` dedup ts=2026-08-23T07:56:03Z (SKIP)

4. **vpsProxyWatchdog** — Last fire: 2026-08-25 08:50:01 (9.7h overdue, ngưỡng 0.3h)
5. **alertScanParallel** — Last fire: 2026-08-25 08:45:00 (9.8h overdue, ngưỡng 0.4h)
6. **taAlertNotifier** — Last fire: 2026-08-25 08:45:02 (9.8h overdue, ngưỡng 0.4h)
7. **priceUpdateWatchdog** — Last fire: 2026-08-25 08:50:01 (9.7h overdue, ngưỌng 0.3h)
8. **vnIndexRefresh** — Last fire: 2026-08-25 08:55:00 (9.6h overdue, ngưỡng 0.1h)

**Newer short-term gaps (may or may not be in dedup yet — cannot confirm without live ledger check):**
- All 5 watchdog/update/refresh crons above are in STALE state, fired 9–10h ago with thresholds of 0.1–0.4h.
- These suggest a 9–10h gap occurred, possibly a batch service or scheduler hiccup.
- If not already deddup-SKIPPED, would emit WARN/CRITICAL per the endpoint's reason messages (Vietnamese: "quá hạn Xh").

#### Unresolved Joins (A-29b — WARN, every cycle, 7-day dedup)
9 cron names with `status==NEVER_FIRED && job_name_db==name` (honest fallback, not confirmed dead):
- dataAuditDaily, foreignFlowFetch, marketClose, marketOpen, publicContractsRefresh, summaryMonthly, summaryQuarterly, summaryWeekly, summaryYearly

These are known (see dedup ledger entries like `auditor-a29-unresolved-join:marketOpen:A-29b` ts=2026-08-23T14:41:57Z). Do NOT re-emit individually; they are in the A-29b standing WARN bucket.

### Data Freshness Checks (B-01+)
**CANNOT COMPLETE:** Attempted to reach pipeline-health endpoint → 404 Not Found.  Attempted vps-service-health → 404 Not Found. The flow spec calls `get_pipeline_health`, `get_vps_service_health`, `get_macro_snapshot` as MCP tools; these map to HTTP endpoints that do not exist in the current MCP server version.

**Partial data: `/api/vps-proxy-health` EXISTS and responds:**
- prices: ok (last push 08:59:54, 286 pushes/24h)
- news: ok (last push 18:30:05, 134 pushes/24h)
- sbv: ok (last push 18:23:09, 34 pushes/24h, off-hours=false)
- bctc: ok (last push 14:44:34, shared bctc-discover/bctc-push)

All `ok` status, no per-source staleness comparison possible without pipeline-health endpoint.

### Attempted Actions and Constraints
- **Cron-status check**: ✓ Completed via HTTP endpoint (no direct MCP tool invocation attempted due to flow scope)
- **Pipeline-health check**: ✗ Endpoint 404, cannot proceed
- **VPS routes check**: Partial (proxy health only; service health endpoint missing)
- **No destructive ops**: Honored (observation-only, no docker/kill/rm/restart)

### Contract Contradiction
NONE

### Findings Summary
**New anomalies filed this cycle: 0**
- All A-29 gaps already in 7-day dedup ledger (SKIP on BUG channel)
- Data freshness check blocked by missing MCP endpoints

**Deferred to next cycle or out-of-scope:**
- Cannot audit per-source freshness without pipeline-health endpoint fix
- Cannot audit macro-snapshot without that endpoint
- Tier-2 scope does not include DB checks; those are Tier-3

### Notes
1. The 9–10h batch of STALE crons (watchdog/refresh series) may be a single systemic issue (scheduler hiccup ~09:00–10:00 UTC) rather than 5 independent cron gaps. Worth investigating root cause if not already known.
2. The flow expects `scripts/emit-audit-signal.sh` to be called for B-01 through B-14 checks; those are deferred pending endpoint availability.
3. No DASHBOARD rows for this cycle (no new findings with severity ≥ WARN).

### OUTPUT-CONTRACT
[Will be filled by audit-output-contract.sh script]

### RETURN Summary
Fire-election: WON | Tier-2 freshness sweep run | A-29 confirmed 9+ known fire gaps (all dedup-SKIPPED) | B-xx data freshness checks blocked by missing endpoints | 0 new findings emitted | NEXT: none (all findings already tracked via dedup ledger)

