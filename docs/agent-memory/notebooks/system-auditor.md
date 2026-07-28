## cw3f9m2q · 2026-07-28T15:10:56Z
### Audit Run Tier-1 (15:07–15:11 UTC 2026-07-28)
- Tier: 1 | Services: 12/12 host_runtime_set checked | Health: 5/5 endpoints | A-20 pdf-extractor: 3/3 in-container OK
- Anomalies: 0 new | 0 dedup-skipped (all Tier-1-scope checks PASS)
- Status: HEALTHY (Tier-1 runtime scope only — pdf-extractor memory condition below is Tier-2/pre-gate scope, already tracked)

### RAW-PROBE: (docs/agents/system-auditor/probe.sh, 2026-07-28T15:07:54Z)
```
=== AUDITOR PROBE 2026-07-28T15:07:54Z ===
--- docker ps -a --- 13/13 containers Up(healthy); 12/12 host_runtime_set present
--- health endpoints --- mcp-server/api-gateway/macro-indicators/pdf-extractor/frontend all OK (HTTP 200)
--- restart count --- mcp-server RestartCount=0
--- memory pressure --- mcp-server MemPerc=78.38%
--- A-30 multi-probe --- SKIP deep-probe, baseline 78.78% < 85%
--- disk --- 32% used
--- A-20 pdf-extractor multi-probe --- HTTP 200/200/200, pass_count=3/3
```

#### Investigation: two router-flagged leads (read-only probes only, AUD-ND-1 respected)
1. **Unexplained green heartbeat (14:12:23Z mem_creep=PASS)** — DISCRIMINATED, not a gate bug. `docs/data/auditor-launchd-ack.json .acked_memory[]` has never listed pdf-extractor (only rag-service since 2026-07-25T15:48:56Z, unchanged today — no commits to this file today) so a PASS at 14:12Z could only be a genuine <85% reading, never suppression. Fresh `docker inspect` (15:08:40Z): RestartCount=2 (cumulative since Created=2026-07-21), current-run StartedAt=09:26:20.035Z unbroken (FinishedAt=09:26:19.47Z belongs to the prior run, before this window) — no restart between 14:12Z and now. Best-supported explanation: genuine pre-burst dip below 85%, then climb to 98.87% by 14:30:10Z tracking the mcp-server POST /extract burst PO logged at 14:24Z (orch-state.json po_disposition_20260728T1453). Mechanism already MINTED: FIX-PDFX-TESSERACT-CONCURRENCY-VIOLATES-SINGLE-WORKER-INVARIANT (P0, backlog) — not re-minted.
2. **Severity mapping (98.87%/98.84% emitted WARN; tier1-probe.md A-30 clause maps peak>97%→CRITICAL)** — CORROBORATED. signal_queue rows sys-20260728T143010-6ec2 (98.87%, WARN) and sys-20260728T143457-0d5b (98.84%, WARN) both exceed 97% yet both WARN; control row sbv_fx sys-20260728T142957-693e(HIGH)→sys-20260728T143455-6a8a(CRITICAL) proves the ladder escalates when the producer varies the label. Already tracked: FIX-AUDITOR-EMIT-SEVERITY-LABEL-FLAT-ESCALATION-BYPASS-NEVER-FIRES (P1, backlog) — not re-minted.
3. **Live re-check (15:08:40Z, read-only)**: pdf-extractor MemPerc=95.59% (2.39/2.5GiB); 10 tesseract PIDs all PPID=1, elapsed 01:03:36→00:07:17 — population still pinned at 10 (unchanged mechanism from router's snapshot; youngest PID turned over, oldest aged further).

#### Signals Emitted: none this cycle. Tier-1's own scope (A-30 override in tier1-probe.md is mcp-server-only) is ALL_GREEN. pdf-extractor's memory condition is a pre-existing Tier-2/pre-gate finding already carrying open signal_queue rows + a PO disposition (14:53Z) + a P0 board task — no re-triage, per write-fence.

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## ca9mxk7p · 2026-07-28T14:33:40Z
### Audit Run Tier-2 (14:30–14:35 UTC 2026-07-28)
- Tier: 2 | Freshness sweep post-dormancy | Sources: 28 checked | Cron: 1 sweep | VPS: 4 routes | DB spot: 5 checks
- **Dormancy-spanning audit:** Fleet dormancy 66h (2026-07-25T17:49Z–2026-07-28T12:13Z), first freshness sweep since restart
- **Findings:** sbv_fx escalated HIGH→CRITICAL (47min stale vs 30min SLA, zero-value rejects continue); pdf-extractor at 98.84% memory (capacity warning, dedup-skipped)
- **Anomalies:** 0 net new | 1 escalation (sbv_fx HIGH→CRITICAL) | 1 dedup-skip (pdf-extractor WARN)
- **All-green checks:** cron-fire A-29 ✓ | VPS proxy B-06/B-07 ✓ | BCTC shape B-09 ✓ | stale BCTC B-13 ✓ | market msg C-06 ✓ | signals C-07 ✓
- **Status:** DEGRADED (1 CRITICAL sbv_fx, 1 WARN pdf-extractor at capacity)

#### Signals Emitted:
- `[emit-signal] OK-escalation-bypass dedup_key=data_stale:sbv_fx:B-02-SBV prev_sev=2→new_sev=3` (B-02 HIGH→CRITICAL)
- `[emit-signal] SKIP-dedup dedup_key=microservice_degraded:pdf-extractor:A-30-MEMORY` (A-30 WARN, last_sent 14:30:09Z)

#### Two-Layer Freshness (Dormancy Context):
- Fetch layer: All 4 VPS routes active (prices 08:59Z, news 14:30Z, sbv 14:26Z, bctc 08:23Z) — healthy
- Analysis layer: Crons running post-restart; 117 signals in 24h; BCTC queue 166 active rows — operational
- Monday 2026-07-27: OHLCV current (773 rows, post-dormancy aggregation), no data loss detected

## caj9n5k2 · 2026-07-28T14:29:58Z
### Audit Run Tier-2 Freshness Sweep (14:26 UTC 2026-07-28)
- Tier: 2 | Freshness sweep with pdf-extractor memory deep-dive
- **KEY FINDINGS:**
  1. **pdf-extractor MEMORY CAPACITY CRITICAL** — sustained 98.78–98.87% (2.47–2.472 GiB / 2.5 GiB) at ceiling, NOT climbing now but at capacity
  2. **sbv_fx SLA BREACH continues** — 43 min stale vs 30 min SLA; VPS fetching but returning zero-values, pipeline integrity gate rejecting
  3. **news (market_messages) FALSE POSITIVE ALERT** — C-06 reads wrong table; actual rag_analyses has 127 rows in 3h (FRESH)
  4. **Three prior misinterpretations verified**: C-06 table issue = known tracked; A-30 hardcode = fixed; RestartCount+StartedAt = both read correctly
  5. **foreign_flow OK** — 328 min vs 359 min SLA, headroom ~31 min
  6. **cowork slot catch-up** — rag_analyses shows 239 rows/24h (127 in last 3h), pipeline running post-outage, no second-order stale data effect

#### Signals Emitted:
- `[emit-signal] OK dedup_key=data_stale:sbv_fx:B-02-SBV id=sys-20260728T142957-693e` — sbv_fx HIGH
- `[emit-signal] OK dedup_key=microservice_degraded:pdf-extractor:A-30-MEMORY id=sys-20260728T143010-6ec2` — pdf-extractor WARN

- Anomalies: 2 new (sbv_fx BREACH CONTINUES, pdf-extractor CAPACITY) | 1 FALSE POSITIVE clarified (news/C-06)
- Status: **DEGRADED** (two active data freshness issues; pdf-extractor at capacity threshold)
