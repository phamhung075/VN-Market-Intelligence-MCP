# FIX-BDI-SHIPPING-STALE-404-GUARD — Handoff (PO / BA-spec stub)

**Status:** BACKLOG
**Task type:** FIX
**Priority:** P2 / MEDIUM
**Zone:** apps/mcp-server (`infrastructure/fetchers/shippingIndex.ts` + supply-chain serve path) — co-touch apps/macro-indicators if BDI source moves there
**Owner:** dev-mcp-server (guard) + ops-mainserver-fetch / recon (source replacement)
**Source:** router RAW-verify 2026-06-21T06:1x (`get_supply_chain_exposure`) + health-recheck `^BDI` HTTP 404

---

## Problem (router RAW-verified)

`get_supply_chain_exposure` serves:

> **BDI: 1,400 (+0.0%) — 2026-04-07** under a CURRENT header "13:10 21/6/26",
> concluding "Chuỗi cung ứng ổn định".

The BDI value is **~2.5 months stale** (data date 2026-04-07, today 2026-06-21),
frozen at +0.0%. Root: the Yahoo Finance `^BDI` endpoint is **dead (HTTP 404)**
(per health-recheck report). The supply-chain path serves the last cached BDI as
if it were current — a no-fake-data / staleness violation
([[feedback_no_fake_data_real_fetch]]). Affects `get_supply_chain_exposure`
**and** `commodityTrackerRefreshJob`.

This is the **same CLASS** as `DSI-MACRO-PHANTOM-STALE-GUARD` (stale macro served
as current) but for the **BDI / supply-chain path** — a NEW instance, not a dup.

## Why this is NOT covered by existing rows (dedup record)

- **FIX-COMMODITY-WTI-DELTA-CORRUPT** (P2, backlog) — its scope only "adds BDI to
  `commodityTrackerRefreshJob` scope" assuming BDI just needs refreshing. That
  does NOT help: `^BDI` is 404-dead, so adding it to the job still yields no fresh
  data, AND it has no serve-stale-as-current guard. This task owns the
  dead-source + staleness-guard legs WTI-DELTA-CORRUPT does not.
- **SEC-FUNC-03-FIX** (backlog) — functional "return ≥1 risk factor / sparse data"
  test gap, not the stale-served-as-current integrity bug.
- **FDA-10** (P3, backlog) — `shippingIndex.ts` misleading comment cleanup only,
  no data fix.

## Fix (two parts)

**(a) Staleness guard** — a BDI value older than N days (mirror the
`DSI-MACRO-PHANTOM-STALE-GUARD` precedent: epoch-seconds compare, NOT
`datetime('now')` string-compare — ISO-8601 'T' > space byte; ref
[[feedback_sqlite_iso8601_datetime_strcompare_bypass]]) must surface as
"no data / stale", NOT served as current with "+0.0% ... ổn định". The
"Chuỗi cung ứng ổn định" conclusion must NOT be drawn from a stale BDI.

**(b) Working `^BDI` source replacement** — recon a live BDI feed (Yahoo `^BDI`
is permanently 404; candidate alternatives e.g. Trading Economics / a maritime
index source) → ops-mainserver-fetch / dev wires it. Until a live source lands,
the guard from (a) ensures honesty (gap, not phantom).

## Acceptance (done_verified = LIVE RAW)

1. `get_supply_chain_exposure` does NOT present a >N-day-old BDI as a current
   "+0.0%" value under a current header — stale → explicit "no data / stale".
2. The supply-chain conclusion is not falsely "ổn định" off a frozen BDI.
3. (when source replaced) BDI shows REAL varied values with a fresh data date.
4. Generic: guard the staleness seam, no per-date literal, no hardcoded value.

## Precedent

`docs/handoffs/DSI-MACRO-PHANTOM-STALE-GUARD.md` (epoch-seconds 4h gate,
no-fake-data gate).
