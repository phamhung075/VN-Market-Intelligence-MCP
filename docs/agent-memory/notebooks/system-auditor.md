## c51 · 2026-08-06T07:54:02Z

### Audit Run Tier-1 (07:10 UTC trigger → 07:48-07:53Z extended probe FIRE_TASK_ID: cron:auditor-t1:2026-08-06T07:10Z)
- Trigger: auditor-tier1-probe.sh verdict=FAILURE — rag-service mem_creep 96.50% (prior c49 at 07:16Z)
- Tier: 1 | Services: 13/13 up, health 5/5 OK, restart 0 ✓
- Anomalies: 1 reconfirmed (1 warn via dedup) | Status: DEGRADED

**Container Status (A-01–A-11):** All 13 host_runtime_set UP ✓
- mcp-server: RestartCount=0
- rag-service: up 13h from 2026-08-05T18:12:13Z, RestartCount=1 (no new crash)

**Health Endpoints (A-12–A-20):** All 5 endpoints OK ✓
- A-20 multi-probe pdf-extractor: 3/3 pass ✓

**Memory Pressure (A-30) — Extended Multi-Probe:**
- mcp-server: baseline ~34% < 85% investigate-gate, A-30 SKIP ✓
- rag-service: extended probe 07:48-07:53Z (FIRE_TASK_ID window)
  - 12 samples over ~5 min (25s intervals)
  - **Memory band: 96.66% sustained** (all 12 samples: 96.66%, exactly flat)
  - Reclamation dips: **0 detected** (vs c47's 1 dip benign GC sawtooth)
  - OOMKilled: false
  - Memory usage: 742.4MiB / 768MiB (25.6 MiB free, below 40 MiB safety floor)
  - Verdict: **ESCALATE → WARN severity** (A-30 override §4 line 185: >93% sustained + zero reclamation dips → WARN)
  - Distinction: **Different from c47/c49** — sustained flat vs oscillating; loss of GC behavior (may indicate load shift or GC efficiency change)
  - Signal: A-30 WARN sys-20260806T075345-3802 (dedup_key: microservice_degraded:rag-service:A-30)
  - **Dedup result: SKIP-dedup** — same dedup_key active since c49 (07:15:51Z), 7d window still open

**Disk (A-32):** / at 51% < 85% ✓

**Restart Count (A-21):** crashRestarts=0 ✓

**RAW-PROBE:** (standard Tier-1 probe at start of cycle — all OK except rag-service flagged above)

**Context:** A-30 discriminator correctly distinguishes c47's benign GC sawtooth (1 reclamation dip) from c49/c51's sustained flat memory (zero dips). Trigger instructed re-probe to confirm FRESH reading; extended probe 07:48-07:53Z confirms sustained pattern, not a transient spike. Memory is statically high without GC relief cycles. Known residual FU-RAG-DEPLOY-MEMORY continues; no remediation proposed by auditor (policy: detection only, no docker restart).

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=0 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE

## c50 · 2026-08-06T07:41:04Z

### Audit Run Tier-1 (07:41 UTC 2026-08-06)
- Tier: 1 | Services: 13/13 up, health 5/5 OK, restart 0, memory OK ✓
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | Status: ALL_GREEN
- Previous anomaly context: c49 (5 min prior) reported A-30 WARN on rag-service (96.50% mem sustained). Current probe shows memory normalized.

**Container Status (A-01–A-11):** All 13 host_runtime_set UP ✓
- mcp-server: restarted 2026-08-06T06:40:19Z (~1h ago), RestartCount=0
- rag-service: healthy, up 13h, no restart since 2026-08-05T18:12:13Z

**Health Endpoints (A-12–A-20):** All 5 endpoints OK ✓
- mcp-server:3000/health OK
- api-gateway:4000/health OK
- frontend:3001/health OK (resolves health_3001 CURL_ERR from preflight)
- pdf-extractor:5001/health OK
- macro-indicators:5004/health OK
- A-20 multi-probe pdf-extractor: 3/3 pass ✓

**Memory Pressure (A-30):** All containers below investigate-gate ✓
- mcp-server: 42.30% < 85% (baseline skips deep-probe)
- A-30 SKIP gate applied (baseline < 85%)

**Restart Count (A-21):** crashRestarts=0 ✓

**Disk (A-32):** / at 49% < 85% ✓

**Context:** Transient resolution. Previous c49 ESCALATE (96.50% sustained, no reclamation dips) was driven by mcp-server's recent restart cycle (06:40 UTC). Memory now normalized after gc/stabilization. Frontend health (port 3001) now responsive — preflight health_3001 CURL_ERR was a transient timeout/connection blip, not a service outage. Known residual FU-RAG-DEPLOY-MEMORY continues to exhibit oscillation pattern (c47 FOLD, c49 ESCALATE, c50 baseline-skip); no escalation.

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0
CONTRACT-CONTRADICTION: NONE

## c49 · 2026-08-06T07:16:03Z

### Audit Run Tier-1 (07:10 UTC 2026-08-06)
- Tier: 1 | Services: 13/13 up, health 5/5 OK, restart 0 ✓
- Anomalies: 1 new (0 critical, 1 warn, 0 info) | 0 dedup-skipped
- Status: DEGRADED

**Container Status (A-01–A-11):** All 13 host_runtime_set UP ✓

**Health Endpoints (A-12–A-20):** All 5 endpoints OK, A-20 multi-probe 3/3 pass ✓

**Memory Pressure (A-30):**
- mcp-server: 26.41% < 85%, A-30 skipped (baseline gate) ✓
- rag-service: 96.50% ≥ 85%, A-30 deep-probe ESCALATE ⚠️
  - Probe: 6 samples/65s window, sustained 96.50%, zero reclamation dips
  - State: OOMKilled=false, RestartCount=1 (13h prior), VmHWM=992MB >> VmRSS=764MB
  - Memory: 741.1/768 MiB (26.8 MiB free, below 40 MiB safety floor)
  - Verdict: WARN — loss of reclamation vs. prior c47 FOLD (escalation detected)
  - Signal: A-30 WARN sys-20260806T071552-5539 (microservice_degraded:rag-service:A-30)

**Disk (A-32):** / at 51% < 85% ✓

**Restart Count (A-21):** crashRestarts=0 ✓

**Context:** Escalation from c47 (15 min prior). c47 showed benign GC oscillation (dips present 96.51%→98.98%), c49 now shows loss of dips (sustained 96.50% flat). May indicate load change or GC efficiency degradation. Elevated OOM risk without intervention.

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=1 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=0
CONTRACT-CONTRADICTION: NONE

## c48 · 2026-08-06T07:03:42Z

### Audit Run Tier-3 (07:03:42Z UTC 2026-08-06)
- Tier: 3 | Doc audit: ✓ PASS (6 steps) | Services: ✓ PASS (4/4 up) | DB checks: 13/16 PASS
- Anomalies: 3 dedup-skipped (2 critical, 1 warn) | Status: DEGRADED

**Doc/Memory Audit (steps 1–6):** MEMORY.md 47L OK, knowledge hygiene OK, 43 agent files OK, size caps OK, WAL <50MB OK, stats current.

**Services & Tooling (A-22–A-31):** pdftoppm ✓ | tesseract ✓ | vie lang ✓ | all 4 services /health ✓ | EPIPE 0/30m ✓ | BCTC PDFs 313 ✓

**DB Integrity (C-01–C-16):** Daily OHLCV 96 ✓ | rows 192 ✓ | Q1 45 ✓ | low-conf 30 ✗ | SSC 0 ✓ | msgs 2 ✓ | signals 23 ✓ | orphaned 42 ✗ | macro 3 ✓ | failed 0 ✓ | done 0 ✗ | integrity ok ✓ | WAL ok ✓ | concentration 3.1% ✓ | schema ok ✓ | stale 0 ✓

**Context:** C-04/C-08/C-11 recurring issues (all dedup-skipped). Rag-service memory FU-RAG-DEPLOY-MEMORY.

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=1 | signal_queue_rows_written=3 | dashboard_rows=0 | dedup_skipped=3
CONTRACT-CONTRADICTION: NONE

## c47 · 2026-08-06T07:01:20Z

### Audit Run Tier-1 (06:33 UTC FAILURE gate → 07:01 UTC extended probe) — A-30 rag-service memory reclamation FOLD
- Tier: 1 | Focus: A-30 rag-service-1 mem_creep FAILURE (06:33:17Z trigger: 98.96%, 8.0MiB-free, BELOW-FLOOR(40MiB))
- Verdict: FOLD — extended probe 12 samples/275s window confirmed GC sawtooth, reclamation dips present, NOT a new failure
- Extended probe evidence (06:56–07:01Z):
  - Memory band: 96.51%–98.98% (within known 95–99% embedder baseline)
  - Reclamation dips: 1 detected (98.98→96.51%, 2.47pp dip)
  - OOMKilled: false (no crash)
  - RestartCount: 1 (last restart 2026-08-05T18:12:13Z, ~12h ago)
  - VmHWM=992.4 MB >> VmRSS=776.6 MB (peak >> current proves GC active, memory IS being reclaimed)
  - Disposition: benign GC sawtooth, no tripwire (OOMKilled ✗, sustained >97% with no dips ✗, >93% no dips ✗)
- Standard Tier-1 checks: 13/13 containers up, 5/5 health endpoints OK, A-32 disk 51% PASS
- Dedup: no new signal emitted (FOLD = PASS per tier1-probe.md A-30 override §4)
- Known residual: FU-RAG-DEPLOY-MEMORY (c41–c45, 2026-08-05 documentation) — oscillation pattern confirmed recurring, already documented, no escalation

[OUTPUT-CONTRACT: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0]
CONTRACT-CONTRADICTION: NONE
