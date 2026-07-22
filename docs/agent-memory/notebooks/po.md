# PO Notebook

_Last: 2026-07-22T22:42Z (triage sys-20260722T223302-4f8b — auditor "sbv-vps stale 43h", DEDUP 0 mint)_

## Tick 2026-07-22T22:37–22:45Z — 43h is TRUE but it is not an sbv problem; already minted 6h earlier

**Signal:** system-auditor data_stale CRITICAL, `payload_ref: null`, summary was the whole signal.

**RAW probe (gateway→vn-market + docker exec bun:sqlite, live named volume):**
- `vps_push_log`: sbv MAX=`2026-07-21 03:05:21` (43h32m at signal ts) — **number is real**.
- Same table: prices `03:08:05`, foreign-flow `03:08:59` — **3 of 5 push services died in one 3.5-min window**. news alive (`22:30:04`, 68/24h) — it is the control: it already has the `StartLimitIntervalSec=0` hardening (42e8448ce) the other three never got.
- `sbv_rates_history`: 26130→26140→26120 across 07-22, last write `21:45:02Z`; `get_sla_status` sbv_fx age=53min. **sbv data is fresh and moving — least-damaged source.**

**Two-layer split (the trap):** push-plane 43h dead vs fetch/serve-plane 53min fresh. sbv looks alive *only* because `scheduler/macro/sbvRatesJob.ts` (VCB pull, `is_estimate=1`, 4-hourly) keeps refreshing the shared single-row `sbv_rates` — the exact masking `FIX-VPS-SBV-HEALTH-SHARED-TABLE-IS-ESTIMATE` already documents. Auditor emitted **both** numbers 4h apart (`sys-20260722T183223-0f2a` = "31min") and never reconciled them.

**FP-class checks all cleared → not an FP:** 07-18/07-19 absent = normal Sat/Sun, so 07-21 Tue + 07-22 Wed are real trading days (not market-hours-blind). Value not frozen (moved 3x on 07-22). Corroborated on a 2nd plane (price + foreign-flow), not single-source.

**Verdict: REAL, but MISFRAMED + ALREADY MINTED.** 3 live rows from `docs/vps-sources/vps-push-plane-stale-2026-07-22/recon.md` (all 2026-07-22T16:29Z) cover it: `FIX-VPS-SYSTEMD-STARTLIMIT-HARDENING` (P1, the dead pipe), `FIX-VPS-HEALTH-OFFHOURS-MASK-FALSE-GREEN`, `FIX-VPS-SBV-HEALTH-SHARED-TABLE-IS-ESTIMATE`. Root cause = systemd StartLimitBurst lockout, `blocked_by: user-escalation-vps-restart`. **0 mint** (conservation 628=628, signals 105=105). No restart (user-gated).

**One new fact folded into the P1's acceptance** (not a new row): the outage is destroying data that will NOT self-heal on restart — `daily_ohlcv` 07-21=**416**, 07-22=**51** vs **887–984/day** baseline (~1,400 ticker-days); `daily_foreign_flow` has **no 2026-07-22 row at all** (baseline 102/day).

## Carry-over
- **VPS is hard-blocked on the user** — SSH+HTTP unreachable, restart user-gated. Every further "sbv/prices/foreign-flow stale" signal until that restart is the SAME incident: mark triaged, do NOT mint. Age just grows (36h→43h→…).
- **Auditor B-06 is sbv-misattributed**: it names sbv (the one source still being served by a fallback) while prices/foreign-flow take the real damage. Worth folding into `FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE` — B-06 should report the push-plane *cluster*, not per-service, and should not label a source stale on a plane a documented fallback masks.
- **Signal `status` token is `triaged`** (103 rows) — `RESOLVED` would be novel-token drift; the spawn brief asked for RESOLVED, I used the canonical one.
- **Still live from prior tick:** WIP 0/2, RLC free to promote. Sprint `COWORK-GUARANTEED-SLOT-CATCHUP` + `BA-COWORK-GUARANTEED-SLOT-CATCHUP` (NEXT=ba write spec). Do NOT re-flag the 2 epic-hold rows.
