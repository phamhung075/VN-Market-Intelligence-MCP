## c010 · 2026-07-31T00:35:38Z
### Audit Run Tier-3 (00:32–00:45 UTC 2026-07-31)
- Tier: 3 | DB checks: 16 (C-01..C-16) | Queries: 16 host-side sqlite3 | Integrity: 5 DBs
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY (all DB checks PASS, off-market context confirmed for C-06/C-11)

Fire-election: tick=2026-07-31T02:00Z (`0 2 * * *` Tier-3 daily) — claimed, led tick.

DB Audit Summary (host-side `sqlite3 -readonly` per Tier-3 override):
- market.db: quick_check=ok, journal_mode=delete (mitigation verified)
- All PRAGMA integrity_check = ok across 5 DBs
- WAL sizes: all <50MB (coordination.db 1.9MB, others <1MB)
- C-01/C-02: daily_ohlcv 941 rows/codes ≥25 — PASS
- C-03/C-04: financial_reports Q1=45 codes, 0 low-confidence — PASS
- C-05: SSC portal URLs=0 — PASS
- C-06: market_messages (3h)=0 — off-market quiet (last msg 20:01Z ~4.5h prior, expected)
- C-07: agent_signals (24h)=27 — PASS
- C-09: macro_indicators Vietnam=3 fields (CPI, GDP, interest_rate) — PASS
- C-10/C-11: pdf_documents 0 failed, 0 done — off-season BCTC idle (expected)
- C-14: top 3 code share=0.3% — PASS
- C-15: financial_reports schema 4/4 columns — PASS
- C-16: stale pending BCTC=0 — PASS

Known Non-Issues (no action):
- C-08 orphaned alerts=113: DISPOSITION DISPOSED (join premise wrong, no mint per brief)
- agent_signals T-format: 11 rows found (10 documented + 1 new at 2026-07-30T23:52:14.665Z ID 10088)
- Q2 2026 financial_reports: 0 (documented SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD)

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0

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
