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

## c23 · 2026-08-05T09:12:06Z
### Audit Run Tier-1 (09:00–09:12 UTC 2026-08-05)
- Tier: 1 | Containers: 13 checked (all UP) | Health endpoints: 5/5 OK
- Memory: mcp-server 94.50% max (ESCALATE — sustained >93% with no reclamation dips)
- A-20 multi-probe: 3/3 pass | A-21 windowed crashes: 0 | Disk: 40% (OK)
- Anomalies: 1 new (0 critical, 1 warn, 0 info) | Status: DEGRADED
- Pattern: 2nd distinct elevated cycle in 40min (c21→92.50%, c22→93.34%, c23→94.50% max)

Fire-election: tick=2026-08-05T09:00Z (`*/30 * * * *` Tier-1 boundary) — claimed, led tick.

### RAW-PROBE (2026-08-05T09:11:34Z):
- All 13 host_runtime_set UP; Health: 5/5 OK; A-20: 3/3 pass; A-21: 0 crashes; Disk: 40%
- **mcp-server memory:** 94.50% max (ESCALATE verdict — sustained >93% with no reclamation dips)
- **Analysis:** window=65s, 6 probes at 13s interval: 93.98%→94.19%→94.20%→94.32%→94.33%→94.50%
- **VM stats:** VmHWM=2.945GB > VmRSS=2.855GB (prior reclamation confirmed); OOMKilled=false
- **A-30 discriminator tripwire:** `verdict=="ESCALATE" AND reason contains "no reclamation dip" (>93% baseline case)` → **emit WARN**

### Findings: A-30 WARN
- **mcp-server A-30:** ESCALATE → **WARN** (new, non-dedup)
  - Sustained high baseline (all 6 probes ≥93.98%, peak 94.50%) with 0 reclamation dips in 65s window
  - Differs from c21/c22: those showed transient spikes with recovery windows; this is persistent elevation
  - Possible recurring pattern: 2nd distinct high reading within 40min (c21: 92.50%→max 93.61%; c22: 93.34%→max 94.52%; c23: 93.98%→max 94.50%)
  - Signal ID: sys-20260805T091206-591b | Dedup key: mem_pressure:mcp-server:A-30 | Telegram: SENT
  - DASHBOARD row appended via emit-dashboard-row.sh
  - Mapped to backlog: FIX-MCP-MEMORY-CODE-LEAK (root cause: GC inefficiency or code leak)
- All other checks PASS (A-01–A-11 UP, A-12 health 5/5, A-20 3/3, A-21 windowed=0, A-32 disk 40%)

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=1 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=0
CONTRACT-CONTRADICTION: NONE

## c22 · 2026-08-05T09:03:36Z
### Audit Run Tier-1 (09:00–09:05 UTC 2026-08-05)
- Tier: 1 | Containers: 13 checked (all UP) | Health endpoints: 5/5 OK
- Memory: mcp-server 93.34% (FOLD — recurring benign sawtooth), rag-service UP (33min uptime)
- A-20 multi-probe: 3/3 pass | A-21 windowed crashes: 0 | Disk: 40% (OK)
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | Status: HEALTHY
- Note: A-30 verdict="ESCALATE" overridden by reclamation discriminator (VmHWM > VmRSS, OOMKilled=false)

Fire-election: tick=2026-08-05T09:00Z (`*/30 * * * *` Tier-1 boundary) — claimed, led tick.

### RAW-PROBE (2026-08-05T09:03:36Z):
- All 13 host_runtime_set UP; Health: 5/5 OK; A-20: 3/3 pass; A-21: 0 crashes; Disk: 40%
- **mcp-server memory:** 93.34% (FOLD verdict, benign GC oscillation, VmHWM > VmRSS proves reclaim)
- **Analysis:** max 94.52%, min 93.43%, 0 reclamation-dips in 65s window, OOMKilled=false
- **A-30 reclamation discriminator:** ESCALATE verdict overridden per tier1-probe.md §A-30

### Findings: NONE — All checks PASS
- **mcp-server A-30:** FOLD (no emit, known benign GC sawtooth pattern 85-97.8%)
  - Genuine escalation tripwire NOT triggered: no OOMKilled, no unresponsive health, no peak sustained >97%
  - VmHWM=2.945GB > VmRSS=2.840GB proves GC already reclaimed; 65s window too short for "loss-of-reclamation" verdict
  - Map to existing tracked issue: FIX-MCP-MEMORY-CODE-LEAK (BACKLOG)
- **rag-service-1:** Restarted 33min ago, now UP and healthy; acknowledged-degraded condition tracked separately
- All other checks PASS (A-01–A-11 UP, A-12 health 5/5, A-20 3/3, A-21 windowed=0, A-32 disk 40%)

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0
CONTRACT-CONTRADICTION: NONE
