# Decision Journal — FIX-BDI-SHIPPING-STALE-404-GUARD

**task-id:** FIX-BDI-SHIPPING-STALE-404-GUARD
**agent:** dev-mcp-server
**date:** 2026-07-25
**zone:** apps/mcp-server/

## Context
`get_supply_chain_exposure` served "BDI: 1,400 (+0.0%) — 2026-04-07" under a
CURRENT header, concluding "Chuỗi cung ứng ổn định". `^BDI` Yahoo has been
permanently HTTP 404 since 2026-04 — the last successful `shipping_bdi` write
(before the endpoint died) is served forever with no freshness check. Same
CLASS as `DSI-MACRO-PHANTOM-STALE-GUARD` (stale value served as current), new
BDI/supply-chain instance. Precedent: `docs/handoffs/DSI-MACRO-PHANTOM-STALE-GUARD.md`.

## Finding (verify-live premise)
Confirmed at source: no commit touches `shippingIndex.ts` since the 2026-06-21
mint; L160 still had `(meta.regularMarketTime as number) ?? Date.now() / 1000`.
No redundant-fix reconciliation needed — the guard genuinely did not exist yet.
Also confirmed a shared staleness helper DOES already exist from the DSI
precedent — `TRACKED_INDICATOR_STALE_MS` (4h) + `listTrackedIndicatorsFromDb()`
in `commodityTracker.ts` — already reused by 4 other consumers (marketContextBuilder,
systemTools, kinhDichScoring, assembleBriefing) for the SAME `tracked_indicators`
table `shipping_bdi` rows live in. Reused it rather than inventing a new
threshold/inline compare (prior-art-check discipline).

## Change (2 seams, both reuse the shared helper — no new number invented)
1. `supplyChainTools.ts` `readShippingIndicesFromDb()` (now exported for
   testability) — was a raw "latest row per `shipping_%` indicator" SQL query
   with no freshness check. Rewritten to call `listTrackedIndicatorsFromDb(db)`
   and filter `indicator.startsWith("shipping_") && !isStale` — a stale
   shipping index is excluded from the served set entirely (epoch-ms compare,
   not a `datetime('now')` SQL string-compare, per the DSI lesson).
2. `buildSupplyChainExposureOutput()` Section 4 — previously defaulted to
   "ổn định" whenever `signals.length === 0`, regardless of WHY (including
   `indices=[]`, i.e. all shipping data stale/absent). Added an
   `indices.length === 0` branch (checked after the real alert/signal
   branches, so a genuine event/signal still wins) emitting an explicit
   "Không đủ dữ liệu..." no-data summary instead.
3. Root cause at source (`shippingIndex.ts` `fetchSymbolData` L160): removed
   the `?? Date.now() / 1000` fallback. A response missing
   `meta.regularMarketTime` now returns `null` (no-data) instead of
   fabricating "now" — generic to any symbol (BDI/BFIY), not a per-instance
   patch. This is the fetch seam BOTH `get_supply_chain_exposure` (indirectly,
   via stored rows) AND `commodityTrackerRefreshJob`'s Block 2 call through —
   no direct edit to `commodityTrackerRefreshJob.ts` was needed or made; the
   guard lives at the shared fetch seam it already calls, avoiding a
   duplicate per-job copy.

Generic mandate respected: no per-date literal, no hardcoded BDI value —
threshold/filter is by `indicator` prefix + the existing shared `isStale`
flag, timestamp guard is symbol-agnostic.

## Fence
- `bunx tsc --noEmit` (apps/mcp-server): **exit 0**.
- RED confirmed first: `git stash push --keep-index` on the 2 source files
  (test file kept) → new test failed with `SyntaxError: Export named
  'readShippingIndicesFromDb' not found` (pre-fix code has no export/guard) →
  `git stash pop` restored the fix.
- New `FIX-BDI-SHIPPING-STALE-404-GUARD.test.ts`: **7 pass / 0 fail / 12
  expect() calls** — stale BDI excluded (GUARD-1), fresh BDI still served
  (GUARD-2), partial-staleness generic (stale BDI + fresh FBX, GUARD-3),
  `indices=[]` no longer concludes "ổn định" (GUARD-4), fresh-data regression
  control still concludes "ổn định" (GUARD-5), missing-timestamp treated as
  no-data not fabricated (GUARD-6), real-timestamp regression control
  (GUARD-7).
- Precedent + affected suites (252-shipping-index, 253-supply-chain,
  254-supply-chain-events, 256-mcp-tool-041, 1920c-commodity-tracker-refresh-job,
  DSI-MACRO-PHANTOM-STALE-GUARD, FIX-DOWJONES-STALE-WRONG-VALUE,
  1039-commodity-tracker-ddl-dedup, 1248-bdi-vps-proxy, 255-signal-integration):
  **107 pass / 0 fail** across 11 files, zero regression.
- Docs updated: NONE (no API surface change — same tool name/schema, same
  cron name/cadence — behavioral fix only; `infrastructure.md`'s
  `shippingIndex.ts` one-line table row is still accurate).

## Closeout
`rebuild_required: true` — container swap deferred to qa/ops rebuild queue
per task instruction (this agent does not rebuild). Moving row to REVIEW,
`next_agent: qa`.

## Remaining (ops/QA — part (b), NOT this row's scope)
`^BDI` Yahoo Finance is permanently HTTP 404 — recon of a live BDI feed
(candidate: Trading Economics, a maritime index provider) is
`ops-mainserver-fetch`'s live-recon domain (international source), not
`dev-mcp-server`'s. Did NOT invent/guess a replacement URL or wire a fake
source. The `baseline_pass` clause "(post source-fix) BDI shows real varied
fresh values" stays OPEN — part (a) (this row) ships and verifies
independently: stale → explicit no-data/stale, conclusion never falsely
"ổn định". QA should decide whether part (b) becomes its own
`ops-mainserver-fetch` co_owner row on this ticket or a new one.
