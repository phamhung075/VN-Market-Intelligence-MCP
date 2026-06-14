# PO Notebook

## 2026-06-14T14:45Z — S50: ARCH-CRON umbrella decision + backlog drain (Sunday, market CLOSED)

T3-ARCH-CRON-WATCHDOG reached done_verified (router RAW-confirmed LIVE: watchdog fires,
3 false "never ran" alerts gone, genuine-stale alerts correct). All 3 children done_verified.
dev-mcp-server zone now FREE. Commit **2be44824** (explicit-path: orch-state + s50 script only;
coverage-state.json + cowork-schedule.json left dirty/unstaged — concurrent agent).

### DECISION 1 — umbrella HOLD-OPEN (not closed)
Rationale: mechanism-complete != outcome-proven. G4(dropped-tick test)+G5(watchdog
self-heal/alert) MET via T1/T2/T3, watchdog LIVE. G1/G2/G3 need LIVE VN-market-day auto-fire
(ohlcv aggregator advance + 16 sectors leave N/A; fundamentals VCB/ACB/CTG repopulate;
reputationCompute 08:30 under contention) — 2026-06-14 is Sunday, market CLOSED, evidence
can't exist yet. Closing on mechanism would repeat the EXACT anti-pattern that spawned this
umbrella (53d00955 marked done on a MANUAL trigger → RECURRED on reputation). Added
**MARKET-DAY-2026-06-15 re-verify gate**. Corrected QA cycle-269 (it mis-stated CLOSED).
Marked 5 stale BLOCKED TASK-ARCH-CRON-1A/1A-TEST/1B/1C/2 as SUPERSEDED by shipped children.

### DECISION 2 — triage (WIP<=2, apps/mcp-server serialized to ONE in-flight)
- **FIX-REFINE-LOCK-TTL-RECLAIM** (P1, ready, NEXT dev-mcp-server) — generic TTL-steal of any
  expired refine lock; [Lock orphaned by rebuild] LET-EXPIRE has FAILED (acquire refused 11.5h
  past expiry). Unblocks refine_bctc_md (bdcfa5e0 VCB Q4 7/26 + VCB Q1/HPG Q4/GVR/HPG/HVN pending).
- **FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP** (high, ready, sequenced behind refine-lock, same zone) —
  canonical ISO-week / period-date-range mutex + RemoteTrigger last_fired. Recurrence-prevention
  ONLY (W24/W25 double-post already delivered to MARKET; do NOT re-send).
- **FIX-BASE-RATE-COMPUTATION-CRON-DEAD** (P2 backlog) — genuine watchdog-surfaced ~20d-stale job.
- **ARCH-WATCHDOG-WEEKDAY-AWARE-THRESHOLD** (P2 architect) — weekend false-stale for weekday-only
  jobs (morning/evening/france briefings).
- **CLEAN-CONTEXT-BLOAT-NOTEBOOKS-20260614** (P3 code-janitor, 3 notebooks);
  **ROUTE-BCTC-FPT-Q1-2026-ROUTINE** (P3 bctc-analyst/cowork, ALL_PASS).
- CLOSED already-resolved: workflow-protocol-coherence-audit (IMPLEMENTED 85935da3),
  dev-team-tool-contract-cron-overlap (live SF-1 single-flight). Both NEW signal_queue rows RESOLVED.

### Carry-over
- Monday 2026-06-15: QA must LIVE-verify G1/G2/G3 (pipeline-health + cron_job_runs named-volume,
  never badges). All-PASS → umbrella done_verified. Any miss → watchdog (G5, LIVE) should have
  self-healed/alerted → capture evidence + spin residual FIX.
- Next dev-mcp-server pull = FIX-REFINE-LOCK-TTL-RECLAIM (architect-route, recurring). digest-dedup
  sequenced behind it. P2/P3 wait until the HIGH/P1 pair clears the single zone slot.
- digest-predict 13:47 "gateway not reachable in subagent" = per-session init-miss
  (False-infra-failure class), NOT a dev bug — do not queue.
