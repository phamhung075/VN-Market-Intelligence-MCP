## c009 · 2026-07-30T10:33:18Z
### Audit Run Tier-2 (10:31–10:33 UTC 2026-07-30)
- Tier: 2 | Cron health: A-29 PASS (all jobs healthy) | Sources: 5 checked
- Data freshness: sbv_fx RECOVERED 4m (SLA 30m), foreign-flow RECOVERED 92m (SLA 122m off-hours)
- DB spot checks: C-06 2 msgs/3h PASS, C-07 154 signals/24h PASS, B-09/B-13 PASS
- VPS services: 2 healthy (news, sbv), 2 idle (market closed), 1 unhealthy (bctc, known)
- Rate limits: B-12 PASS (11/11 ready)
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 1 dedup-skipped (B-06 bctc stale)
- Status: HEALTHY (corruption remediation confirmed, all freshness SLA PASS)

Fire-election: tick=2026-07-30T08:00Z (`0 */4 * * *` boundary) — claimed, led tick.

Recovery findings (per db-incident preamble):
- B-01: sbv_fx RECOVERED from CRITICAL 204m to PASS 4m
- B-03: foreign-flow RECOVERED from CRITICAL 189m to PASS 92m
- VPS-poll: services healthy/idle, polling resumed successfully
- Journal mode: PRAGMA journal_mode=delete (mitigation in place, not reverted)

Known issues (no change):
- B-06: bctc vps route stale 2026-07-28T08:23:22Z (1.87d), already reported in c008
- Q2 financial_reports: 0 rows (documented SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD)

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=1

## d4-auto · 2026-07-30T03:00:03.251Z
D4 candidates: R3-no-board-row:data-quality-anomaly:DGC:Q1-2026
## c008 · 2026-07-30T07:11:27Z
### Audit Run Tier-2 (07:09–07:11 UTC 2026-07-30)
- Tier: 2 | Cron health: SKIPPED-DB-CORRUPT | Sources: 5 checked
- Data freshness: foreign-flow CRITICAL 189m (SLA 10m), sbv_fx CRITICAL 204m (SLA 30m), bctc HEALTHY IDLE (37h < 367h SLA window)
- VPS services: 1 unhealthy (vn-bctc-fetch), 4 healthy
- Rate limits: PASS (all 14 endpoints ready)
- DB spot checks: SKIPPED-CONSTRAINT (do not docker exec mcp-server), SKIPPED-DB-CORRUPT (B-09, B-13)
- Anomalies: 1 new (1 critical) | 2 dedup-skipped (sbv_fx, vps_proxy)
- Status: DEGRADED (foreign-flow stale, sbv_fx persistent SLA breach, vps_bctc unhealthy)

Fire-election: tick=2026-07-30T04:00Z (`0 */4 * * *` boundary) — claimed, led tick.

Findings:
- B-03: foreign-flow data stale 189min (3.15h) exceeds SLA 10min — NEW
- B-01: sbv_fx SLA breach 204min (3.4h) > 30min — dedup-skipped (last_sent 2026-07-29T14:34:45Z)
- B-06: VPS bctc proxy stale 41+ hours, service unhealthy — OK-escalation-bypass (severity escalated)

[emit-signal] OK dedup_key=data_stale:foreign-flow:B-03 id=sys-20260730T071114-45c7
[emit-signal] SKIP-dedup dedup_key=data_stale:sbv_fx:B-01 last_sent=2026-07-29T14:34:45Z id=sys-20260730T071120-1bf1
[emit-signal] OK-escalation-bypass dedup_key=data_stale:vps_proxy:B-06 prev_sev=2 new_sev=3 id=sys-20260730T071126-4b11
[emit-dashboard] OK id=sys-20260730T071114-45c7 check_id=B-03
[emit-dashboard] OK id=sys-20260730T071120-1bf1 check_id=B-01
[emit-dashboard] OK id=sys-20260730T071126-4b11 check_id=B-06

[OUTPUT-CONTRACT] signals_posted=3 | telegram_sent=2 | signal_queue_rows_written=3 | dashboard_rows=3 | dedup_skipped=1
