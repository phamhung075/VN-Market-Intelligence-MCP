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

#### PDF-Extractor Memory Series (5-second samples 14:26–14:27Z):
- 14:26:09Z: 98.78% (2.469 GiB / 2.5 GiB)
- 14:26:15Z: 98.78% (2.469 GiB / 2.5 GiB)
- 14:26:22Z: 98.79% (2.47 GiB / 2.5 GiB)
- 14:26:28Z: 14:26:28Z: 98.79% (2.47 GiB / 2.5 GiB)
- 14:26:34Z: 98.87% (2.472 GiB / 2.5 GiB)
- 14:26:41Z: 98.85% (2.471 GiB / 2.5 GiB)
- 14:26:47Z: 98.84% (2.471 GiB / 2.5 GiB)
- 14:26:53Z: 98.84% (2.471 GiB / 2.5 GiB)
- 14:26:59Z: 98.84% (2.471 GiB / 2.5 GiB)
- 14:27:05Z: 98.86% (2.472 GiB / 2.5 GiB)
- 14:27:12Z: 98.79% (2.47 GiB / 2.5 GiB)
- 14:27:18Z: 98.79% (2.47 GiB / 2.5 GiB)
- **Pattern:** STABLE 98.78–98.87%, NOT climbing; at memory limit ceiling

#### PDF-Extractor Analysis (resolving the 14:11–14:19Z spike):
- Container StartedAt: 2026-07-28T09:26:20Z (5h uptime as of 14:26Z)
- RestartCount: 0 (never restarted) | OOMKilled: false
- Process RSS: ~1.768 GB (reported in container ps aux output)
- Context: refine_bctc_md OCR workload finished ~14:08Z; memory spike 14:11–14:19Z (3–11 min after)
- **Hypothesis Resolution:** NOT (a) traditional leak (no cascading restarts); NOT (b) pure bursty working set (memory sustained, not released after processing); **CONCLUSION: (c) Sustained memory accumulation** — likely application-level caching (Tesseract/PIL image buffers) not garbage-collected after OCR batch. CPU oscillating 202–218% (full core usage), indicating active work or cache operations. **RISK: At limit; any additional memory demand → OOM.**

#### SBV_FX Continuation (tracking FIX-SBV-FETCHER-ZERO-VALUE-EMIT):
- Age 14:26Z: 43 minutes stale (last DB write 2026-07-28T12:13:01Z)
- VPS proxy last push: 2026-07-28T14:26:34Z (concurrent with this audit) — HEALTHY
- Root cause: upstream SBV source returning zero-values in overnight_rate_pct, refinancing_rate_pct, etc. Pipeline integrity gate correctly rejecting.
- Tracking: FIX-SBV-FETCHER-ZERO-VALUE-EMIT (backlog, not re-minted)

#### News Pipeline False Positive (C-06 table mismatch):
- Previous audit at 13:44Z cited market_messages as "news stale 389 min" — **WRONG TABLE**
- Actual news ingestion table: rag_analyses (127 rows in 3h trailing, latest 2026-07-28T14:06:14Z) = **FRESH**
- market_messages: 1 row in 3h (outbound market briefing post, unrelated to RSS ingestion)
- Tracking: FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE (backlog; C-06 query not yet corrected in flow/main.md:589)

#### Misinterpretation Verification (per fresh audit remit):
1. **C-06 uses market_messages (WRONG)**: Confirmed KNOWN. Already tracked as FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE (not yet implemented).
2. **A-30 hardcoded to mcp-server**: Confirmed FIXED. sprint-FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE implemented; probe now checks all capped containers.
3. **RestartCount without StartedAt**: Confirmed CORRECT. Probe reads both together (line 72 + container inspect).

#### Signals Emitted:
- `[emit-signal] OK dedup_key=data_stale:sbv_fx:B-02-SBV id=sys-20260728T142957-693e` — sbv_fx HIGH
- `[emit-signal] OK dedup_key=microservice_degraded:pdf-extractor:A-30-MEMORY id=sys-20260728T143010-6ec2` — pdf-extractor WARN

- Anomalies: 2 new (sbv_fx BREACH CONTINUES, pdf-extractor CAPACITY) | 1 FALSE POSITIVE clarified (news/C-06)
- Status: **DEGRADED** (two active data freshness issues; pdf-extractor at capacity threshold)

## c9k7w2l4 · 2026-07-28T13:44:56Z
### Audit Run Tier-1 Freshness Investigation (13:44 UTC 2026-07-28)
- Tier: 1 + Tier-2 Freshness Deep-Dive (unscheduled focus on SLA breaches)
- Tier-1 Probe: All services UP (13/13) ✓ | All health endpoints 200 OK (5/5) ✓
- pdf-extractor mem: 85.54% (continuation from 12:45Z, plateau confirmed) | rag-service mem: ~1h post-restart (12:21:47Z)
- **INVESTIGATION: Two Data-Freshness SLA Breaches (CRITICAL + HIGH)**

#### FINDING-1: sbv_fx (macro_indicators) CRITICAL Breach
- Age: 91 minutes | SLA threshold: 30 min | Status: **CRITICAL BREACH**
- Database last update: 2026-07-28T12:13:01Z (91 min stale)
- VPS layer: Fetching actively (last push 13:26:32Z) but **returning zero-values**
- Log evidence: "[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row" (timestamps 12:56:31Z, 13:26:32Z)
- Rejected zero-columns: overnight_rate_pct, refinancing_rate_pct, max_deposit_rate_pct, max_lending_rate_pct
- Prior valid row: {overnight_rate_pct:3, refinancing_rate_pct:4.5, max_deposit_rate_pct:5, max_lending_rate_pct:12, usd_vnd_official:26145}
- **Verdict:** (b) Genuine fetch stall — not a config/SLA-mismatch defect. Root cause: **SBV data source returning malformed data (zero-values)**. The SLA (30 min) is reasonable for macro data; the pipeline is correctly rejecting corrupt writes. Data integrity gate is working; upstream source quality is degraded.

#### FINDING-2: news (market_messages) CRITICAL Breach
- Age: 389 minutes (6h 29m) | SLA threshold: 30 min | Status: **CRITICAL BREACH**
- Database last update: 2026-07-28T07:15:02Z (389 min stale) — pre-market window
- VPS layer: Fetching actively (last push 13:34:12Z, 10 min ago) — **zero inserts despite fetches**
- Log evidence (13:34 cycle): "[push-news] fetched":61, "inserted":0, "duplicates":60 — ALL news detected as duplicates, none entering DB
- Pattern across all recent cycles (since ~07:15Z): 100% duplicate-rate, zero new inserts
- **Verdict:** (b) Genuine pipeline stall — not a config defect. Root cause: **news deduplication logic broken or news API genuinely delivering all-duplicate articles**. Two-layer disconnect: VPS successfully receiving news → mcp-server deduplication layer rejecting 100% as duplicates → zero storage. Requires investigation into (a) duplicate-detection algorithm or (b) news source behavior.

#### Two-Layer Fetch Architecture Confirmed
- Layer 1 (VPS Proxy Fetch): HEALTHY — news/sbv data arriving on schedule
- Layer 2 (Database Storage): BROKEN — data not reaching DB due to (sbv: data quality validation, news: deduplication overreach)

#### Timing Correlation (rag-service restart 12:21:47Z)
- sbv last DB write: 12:13:01Z (8 min BEFORE restart)
- news last DB write: 07:15:02Z (5+ hours BEFORE restart)
- rag-service restart appears **coincidental, not causal** — sbv/news staleness predates or is independent of restart

#### Note: foreign_flow Approaching Threshold
- Age: 283 min | SLA: 313 min | Status: OK but close (headroom ~30 min)
- No action needed; monitor next cycle

#### Note: cycle_snapshot_promoted = false (22+ days)
- Known tracked epic TASK-COWORK-CATCHUP-1..10; not re-minting

#### Anomalies: 2 CRITICAL (sbv_fx pipeline, news pipeline)
- Status: **CRITICAL** (two data-freshness failures affecting market analysis)
