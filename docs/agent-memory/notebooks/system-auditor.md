## c26 · 2026-08-05T10:11:22Z
### Audit Run Tier-2 (08:00–10:11 UTC 2026-08-05)
- Tier: 2 | Data sources: 5 checked | Cron jobs: 100+ monitored | DB checks: 5 PASS
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | Status: HEALTHY
- Coordination: Tier-1 rag-service-1 memory worsening confirmed (97.77% per c25 10:11Z, previously 96.91% at 10:08Z per c24) — Tier-2 corroborates via dedup_key mem_pressure:rag-service:A-30, no new signal (already tracked)

Fire-election: tick=2026-08-05T08:00Z (Tier-2 4h boundary `0 */4 * * *`) — claimed, led tick.

### Tier-2 Freshness Sweep Results:
- **SLA Status:** All 5 primary sources within SLA (price 9/101m ok, bctc 1177/10080m ok, news 9/30m ok, sbv_fx 5/30m ok, foreign_flow 70/101m ok)
- **Cron Health:** One job flagged (bctcReparseJob crashed 09:22:58Z, success_rate 83.3%) — noted for ops, non-critical (other BCTC jobs running)
- **VPS Proxy & Services:** All 4 proxy routes healthy (prices ok, news ok, sbv ok, bctc idle); 3 VPS services healthy
- **Rate Limits:** 11 API sources ready, none at 100%
- **DB Spot Checks:** market_messages 3h (3) ✓, agent_signals 24h (70) ✓, SSC URLs (0) ✓, stale pending BCTC (0) ✓, BCTC PDFs (313) ✓
- **BCTC-EVAL:** Endpoint unavailable — non-fatal skip per protocol
- **D-IMPROVE:** No actionable candidates

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0
CONTRACT-CONTRADICTION: NONE

## c25 · 2026-08-05T10:11:02Z
### Audit Run Tier-1 (10:00–10:11 UTC 2026-08-05)
- Tier: 1 | Containers: 13 checked (all UP) | Health endpoints: 5/5 OK
- Memory: rag-service 97.77% (FAIL, persistent WARN issue), mcp-server 10.63% (PASS — recovered)
- A-20 multi-probe: 3/3 pass | A-21 windowed crashes: 0 | Disk: 39% (OK)
- Anomalies: 1 recurring (0 critical, 1 warn, 0 info) | Status: DEGRADED
- Pattern: rag-service sustained high memory ~96-98% range since 07:41:37Z; mcp-server recovered

Fire-election: tick=2026-08-05T10:00Z (`*/30 * * * *` Tier-1 boundary) — claimed, led tick.

### RAW-PROBE (2026-08-05T10:10:12Z):
- All 13 host_runtime_set UP; Health: 5/5 OK; A-20: 3/3 pass; A-21: 0 crashes; Disk: 39%
- **rag-service-1 memory:** 97.77% (750.9MiB / 768MiB limit) — **FAIL** (consistent with c24 96.91%)
- **mcp-server memory:** 10.63% (326.6MiB / 3GiB) — **PASS** (recovered from c23's 94.50%)
- Container baseline check: rag-service over threshold; mcp-server well below

### Findings: A-30 WARN (Recurring)
- **rag-service-1 A-30:** FAIL at 97.77% memory — **WARN-severity** finding
  - This is a **RECURRING dedup match** (dedup key: mem_pressure:rag-service:A-30)
  - Last emitted: 2026-08-05T07:41:37Z (2h 29m ago, within 7d dedup window)
  - Current finding: **SKIP-dedup** (already tracked per 7d policy, no new signal)
  - Continues pattern from c24 (96.91%) — flat-lined high memory, approaching OOM
  - Mapped to backlog: FIX-RAG-DEPLOY-MEMORY (known recurring issue)
  - Action: PLAN-ONLY detection; remediation is ops/developer responsibility
- **mcp-server A-30:** PASS at 10.63% memory
  - State change from c23 (09:12Z @ 94.50% → WARN) to c25 (10:11Z @ 10.63% → PASS)
  - Recovery confirmed after c23's escalation; A-30 verdict=FOLD (no emit)
  - Previous cycle's signal was valid; healthy state now resumed
- All other checks PASS (A-01–A-11 UP, A-12 health 5/5, A-20 3/3, A-21 windowed=0, A-32 disk 39%)

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE

## c24 · 2026-08-05T10:08:34Z
### Audit Run Tier-1 Follow-Up (09:54–10:08 UTC 2026-08-05)
- Tier: 1 (follow-up dispatch) | Service: rag-service-1 | Check: A-30 memory pressure
- Investigation: 65-second multi-probe, 6 samples @ 13s intervals
- Anomalies: 1 recurring (0 critical, 1 warn, 0 info) | Status: DEGRADED

Fire-election: follow-up dispatch (no claim — prior Tier-1 completion at ~09:54Z left output unwritten).

### RAW-PROBE (from prior agent's analysis):
- **rag-service-1 memory:** 96.91% sustained (ALL 6 probes flat-lined at 96.91%)
- **Free memory:** 23.7 MiB (BELOW 40 MiB floor threshold)
- **OOMKilled:** false (not dead yet, approaching critical)
- **Restart count:** 58 (multiple restarts in session)
- **Container uptime:** ~1.5 hours (recent restart)
- **VmHWM/VmRSS:** 774.6MiB / 746.0MiB (reclamation occurred lifetime, NOT in probe window)
- **A-30 discriminator tripwire:** `verdict=="ESCALATE" AND reason contains "no reclamation dip" (>93% baseline case)` → **emit WARN**

### Findings: A-30 WARN (recurring, dedup-skipped)
- **rag-service-1 A-30:** ESCALATE → **WARN** (recurring, dedup key active until 2026-08-12T07:41:37Z)
  - Sustained high baseline (all 6 probes = 96.91%, zero reclamation dips in 65s window)
  - Free memory stuck at critical 23.7 MiB, far below safe 40 MiB floor
  - Differs from benign mcp-server sawtooth: flat-line vs oscillation, trending monotonically degraded
  - Dedup key mem_pressure:rag-service:A-30 last sent 2026-08-05T07:41:37Z (within 7d window — SKIP-dedup)
  - Signal row created: sys-20260805T100834-7723 (dedup skipped, no BUG Telegram, DASHBOARD row appended)
  - Status: RECORD-AND-LEAVE (same issue recurring; prior 07:42Z and 08:11Z rows status=READ)
  - Zone owner: dev-rag-service
- All other checks: not probed this cycle (follow-up dispatch focus: A-30 write path execution only)

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE
