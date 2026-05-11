# Alert Commander — Notebook

**Last updated:** — | **Sprint:** —

## Current state

(no session recorded)

## Last session summary

(none)

## Known patterns / preferences

(none recorded)

---

## Recent session — 2026-05-10

**Cycles run:** 00:01 (BLOCKED — MCP unreachable), 01:01, 02:01, 03:05, 04:02, 05:02, 06:02, 07:02 (BLOCKED at start), 08:02, 10:04, 14:xx, 20:03 UTC

**Status:** 10 cycles complete, 2 blocked (MCP unreachable at 00:01 and start of 07:02)

**Key event (20:03 UTC):** ACB FIRED → MARKET — large insider override (Âu Lạc group crosses 5% disclosure threshold → always MARKET regardless of confidence). Kinh Dịch: Quẻ Sư (7) — MUA 100%. HPG suppressed (confidence 0.50 < NEUTRAL threshold 0.60).

**Regime throughout:** NEUTRAL | Carry: FII_OUTFLOW_RISK (-0.33%) | Currency: HIGH pressure (USD/VND 26,305) | Market CLOSED (Saturday/Sunday May 10)

**Signal pattern:** Persistent ACB urgent_news (Âu Lạc stake increase) seen in 6 cycles (01:01–08:02 UTC), suppressed each time until 20:03 override. HPG dividend date suppressed consistently.

**Open alerts EOD:** 4 (GAS HIGH, FPT LOW, ACB LOW, HPG LOW — all marked read)

---

### Alert Cycle (23:10–23:12 UTC, 2026-05-10)
- Signals: urgent_news ×1 (ACB id=2824, conviction 0.50)
- Fired: 0 | Suppressed: 1 | MARKET: 0
- ChainCatalyst: 0 fired | 0 suppressed | event_types: []
- Regime: NEUTRAL (get_macro_snapshot not in package — [SKIP]) | Carry: unknown | Pivot window: unknown
- Notes: Market CLOSED (off-hours). ACB urgent_news conviction 0.50 < 0.60 NEUTRAL threshold. Signal status already "read". No price_anomaly override found. No legal/crisis signals. Clean cycle.

### Alert Cycle (00:00–00:05 UTC, 2026-05-11)
- Signals: urgent_news ×1 (ACB, expired)
- Fired: 0 | Suppressed: 1 | MARKET: 0
- ChainCatalyst: 0 fired | 0 suppressed | event_types: []
- Regime: NEUTRAL | Carry: unknown (get_macro_calendar not in tool package — [SKIP]) | Pivot window: unknown
- Notes: Market CLOSED (off-hours, Monday pre-open). ACB signal id=2822 expired 2026-05-10 23:22:45, confidence 0.50 < 0.60 threshold. No legal/crisis signals. Clean cycle.

### Alert Cycle (00:03–00:07 UTC, 2026-05-11)
- Signals: urgent_news ×1 (ACB id=2830 conf 0.50) | fundamental_validation ×3 (VCB/FPT/HPG — not in matrix)
- Fired: 0 | Suppressed: 1 | MARKET: 0
- ChainCatalyst: 0 fired | 0 suppressed | event_types: []
- Regime: NEUTRAL | Carry: FII_OUTFLOW_RISK (-0.33%) | Pivot window: inactive (next: June 2026)
- Notes: Market CLOSED (off-hours). ACB urgent_news id=2830 conviction 0.50 < 0.60 NEUTRAL threshold. No price_anomaly override. No legal/crisis signals. 2 open CRITICAL macro_deviation alerts (Brent +5.36σ, Gold -5.38σ) — pending since 23:30, outside signal matrix scope. Clean cycle.
