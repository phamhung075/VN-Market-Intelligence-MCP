## c004 · 2026-07-29T18:35:04Z
### Audit Run Tier-2 (16:00–18:35 UTC 2026-07-29)
- Tier: 2 | Cron health: A-29 PASS (all crons within cadence) | Sources: 5 checked
- Data freshness: SBV_FX OK (18m < 30m SLA), BCTC OK by SLA (1471m < 21304m), all 5 sources within SLA
- VPS proxy: bctc stale (34h+ since push), status ok but unhealthy service | vn-bctc-fetch unhealthy
- DB spot: C-06 WARN (0 market_messages in 3h), C-07 PASS (13 signals in 24h)
- BCTC queue: 167 pending | B-09 PASS (no SSC URLs) | B-13 PASS (0 stale 72h+)
- Anomalies: 2 new (2 warn, 0 critical, 0 info) | 1 dedup-skipped
- Status: DEGRADED (VPS bctc persistent stale; new: market_messages freshness warning)

Fire-election: tick=2026-07-29T16:00Z (`0 */4 * * *` boundary) — claimed, led tick.

[emit-signal] OK dedup_key=data_freshness:market_messages:C-06 id=sys-20260729T183438-0c12
[emit-signal] SKIP-dedup dedup_key=data_stale:vps_proxy:B-06 last_sent=2026-07-29T14:34:55Z id=sys-20260729T183440-1d23
[emit-dashboard] OK id=sys-20260729T183438-0c12 check_id=C-06
[emit-dashboard] OK id=sys-20260729T183440-1d23 check_id=B-06

Findings:
- C-06: market_messages table stale (0 rows in 3h) — messaging pipeline may be broken
- B-06: VPS bctc route stale 34h+ (last push 2026-07-28 08:23:22Z) — extraction blocked

[OUTPUT-CONTRACT] signals_posted=2 | telegram_sent=1 | signal_queue_rows_written=2 | dashboard_rows=2 | dedup_skipped=1

## c003 · 2026-07-29T14:35:45Z
### Audit Run Tier-2 (12:00–14:35 UTC 2026-07-29)
- Tier: 2 | Cron health: A-29 PASS (all crons within cadence) | Sources: 27 checked
- Data freshness: sbv_fx CRITICAL (48m > 30m SLA), BCTC queue stale (167 pending), VPS proxy 2/4 unhealthy
- DB spot checks: C-06 PASS (1 msg/3h), C-07 PASS (203 signals/24h)
- Rate limits: B-12 PASS (no source at 100%)
- Anomalies: 3 new (1 critical, 2 warn, 0 info) | 0 dedup-skipped
- Status: DEGRADED (sbv_fx CRITICAL SLA breach; VPS services down; BCTC queue stale 30h)

Fire-election: tick=2026-07-29T12:00Z (0 */4 * * * boundary) — claimed, led tick.

[emit-signal] OK dedup_key=data_stale:sbv_fx:B-01 id=sys-20260729T143446-2c78
[emit-signal] OK dedup_key=data_stale:vps_proxy:B-06 id=sys-20260729T143456-2973
[emit-signal] OK dedup_key=data_stale:bctc_discover:B-05 id=sys-20260729T143457-16cc
[emit-dashboard] OK id=sys-20260729T143446-2c78 check_id=B-01
[emit-dashboard] OK id=sys-20260729T143456-2973 check_id=B-06
[emit-dashboard] OK id=sys-20260729T143457-16cc check_id=B-05

Findings:
- B-01: sbv_fx age 48m exceeds SLA 30m — impact: FX data stale
- B-05: bctc-discover queue 167 pending items; VPS unhealthy; last push 2026-07-28 08:23Z
- B-06: VPS services unhealthy (vn-bctc-fetch, vn-sbv-fetch); BCTC/SBV extraction blocked

## c001 · 2026-07-29T10:34:31Z
### Audit Run Tier-2 (08:00–10:35 UTC 2026-07-29)
- Tier: 2 | Cron health: A-29 PASS (all crons within cadence)
- Data freshness: 10 PASS + 1 dedup-WARN (SBV_FX 32min stale, SLA 30min)
- BCTC queue: 167 pending, push-age ~26h < 347h dynamic SLA threshold = HEALTHY IDLE
- VPS proxy: prices/news/sbv ok | DB C-06/C-07: PASS
- Anomalies: 1 dedup-skipped (SBV_FX B-12 WARN) | 0 new
- Status: DEGRADED (SBV_FX SLA breach — isolated, no cascade)

Fire-election: tick=2026-07-29T08:00Z (`0 */4 * * *` boundary) — claimed, led tick.

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=3 | dashboard_rows=1 | dedup_skipped=1
