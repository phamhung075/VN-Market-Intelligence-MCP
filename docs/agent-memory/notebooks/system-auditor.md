# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## 5c1b8a0 · 2026-07-22T15:07:36Z
### Audit Run Tier-2 (15:05–15:07 UTC 2026-07-22)
- Tier: 2 | Cron fire check: PASS (100+ jobs running, 4 recent crashes at 14:52:12-14:52:34Z consistent with OOM) | Sources checked: 28
- VPS proxy health: ACCEPTABLE (news OK, sbv/bctc stale but off-season SLA allows; prices off-hours)
- SLA breaches: 0 CRITICAL (all within thresholds, BCTC 2956min / 11017min SLA window)
- DB spot checks: PASS (news freshness OK, BCTC queue 183 items healthy-idle gate pass)
- Container status: 12/12 UP (mcp-server up 13min post-restart; restart count=2 — OOM pattern identified)
- **NEW CRITICAL**: rag-service memory 763.8/768 MiB (99.46%) — LanceDB ceiling pressure detected
- **NEW WARN**: mcp-server restart count=2 — recurring OOM→restart pattern, root cause: potential memory leak
- Anomalies: 2 new (C critical × 1: rag-service memory, W warn × 1: mcp-server OOM pattern) | Status: DEGRADED
- [emit-signal] OK A-31 id=sys-20260722T150730-2c18
- [emit-signal] OK A-21-OOM-PATTERN id=sys-20260722T150735-5955
- Context: mcp-server recovered from 14:51Z OOM event; current memory 651.6MiB/3GiB (21.21%); previous A-30 mem threshold alert RESOLVED (not re-emitted per dedup/resolution gate)

## 43a798a97 · 2026-07-22T15:01:19Z
### Audit Run Tier-2 (15:00–15:01 UTC 2026-07-22)
- Tier: 2 | Cron fire check: PASS (100+ jobs running) | Sources checked: 28
- VPS proxy health: DEGRADED (2 healthy, 2 unhealthy: vn-news-fetch, vn-bctc-fetch; 1 idle)
- SLA breaches: 2 CRITICAL (B-04 news-vps 389min/30min, C-06 market_messages 0/expected>0)
- DB spot checks: C-07=288 signals PASS, B-09=0 SSC URLs PASS, B-13=0 stale PASS
- BCTC queue: 183 pending items (not healthy-idle gate); push-age OK within SLA
- Rate limits: All sources ready
- Anomalies: 2 new (C critical × 2: news stale, market_messages zero) | Status: DEGRADED
- [emit-signal] OK B-04 id=sys-20260722T150033-635a
- [emit-signal] OK-escalation-bypass C-06 id=sys-20260722T150037-7ed7
- Post-restart assessment: mcp-server restart ~14:53Z; freshness ages elevated but plausibly attributable to outage window; no false-alarm suppression per E-3 contract.

## 0ab97c7 · 2026-07-22T06:32:52Z
### Audit Run Tier-2 (06:30–06:32 UTC 2026-07-22)
- Tier: 2 | Cron fire check: PASS (100+ jobs running) | Sources checked: 28
- VPS proxy health: DEGRADED (2 healthy, 3 unhealthy: vn-bctc-fetch, vn-price-fetch, vn-foreign-flow)
- SLA breaches: 2 CRITICAL (B-04 foreign-flow 1642min/10min, B-05 bctc-discover 2441min/120min)
- DB spot checks: PASS (C-06=3 messages, C-07=284 signals, B-09=0 SSC URLs, B-13=0 stale)
- BCTC queue: 183 pending/url_not_found/enrich_failed items (not healthy-idle gate)
- Anomalies: 3 new (C critical × 3: foreign-flow, bctc-discover, VPS services) | Status: DEGRADED
- [emit-signal] OK-escalation-bypass B-04 id=sys-20260722T063217-1356
- [emit-signal] OK-escalation-bypass B-05 id=sys-20260722T063233-76cb
- [emit-signal] OK-escalation-bypass B-06 id=sys-20260722T063225-07c9

## a4f2b1e · 2026-07-22T06:11:30Z
### Audit Run Tier-1 (06:10–06:11 UTC 2026-07-22)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 12 UP (all healthy)
- Health endpoints: 5 OK (all stable)
- A-20 multi-probe (pdf-extractor): 3/3 PASS — event-loop healthy
- A-21 Restart count: mcp-server=1 PASS | A-30 Memory: 49.92% PASS | A-32 Disk: 27% PASS
- Anomalies: 0 new (all green) | Status: HEALTHY

## 7d3f9cd · 2026-07-22T03:40:44Z
### Audit Run Tier-1 (03:40–03:41 UTC 2026-07-22)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 12 UP (all healthy)
- Health endpoints: 5 OK (all stable)
- A-20 multi-probe (pdf-extractor): 3/3 PASS — event-loop healthy
- A-21 Restart count: mcp-server=1 PASS | A-30 Memory: 18.18% PASS | A-32 Disk: 27% PASS
- Anomalies: 0 new (all green) | Status: HEALTHY

## d4-auto · 2026-07-22T03:00:02.728Z
D4 candidates: none

## c86a9e8 · 2026-07-22T02:32:20Z
### Audit Run Tier-2 (02:31–02:32 UTC 2026-07-22)
- Tier: 2 | Cron gap check: PASS | Per-source freshness: 1 CRITICAL | VPS proxy: DEGRADED
- Sources checked: 28 | DB spot checks: PASS (C-06, C-07)
- B-05 gate: bctc-discover HEALTHY IDLE (queue=183, SLA out-of-window threshold=2355h)
- B-09 URL shape: PASS (0 SSC portal URLs) | B-13 stale pending: PASS
- Anomalies: 1 new (C critical: foreign-flow stale 1402min, SLA 30min) | Status: DEGRADED
- [emit-signal] OK dedup_key=data_stale:foreign-flow:B-04 id=sys-20260722T023220-774e

## c8f3b5d · 2026-07-22T02:11:23Z
### Audit Run Tier-1 (02:10–02:11 UTC 2026-07-22)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 12 UP (all healthy)
- Health endpoints: 5 OK (all stable)
- A-20 multi-probe (pdf-extractor): 3/3 PASS — event-loop healthy
- A-21 Restart count: mcp-server=1 PASS | A-30 Memory: 10.99% PASS | A-32 Disk: 27% PASS
- Anomalies: 0 new (all green) | Status: HEALTHY
