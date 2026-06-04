# Handoff: DSI-ARCH — DATA-SERVE-INTEGRITY Architect Phase

**Sprint:** DATA-SERVE-INTEGRITY
**Task:** DSI-ARCH
**From:** architect
**To:** BA-DSI
**Date:** 2026-06-04

## Brief

Full brief: `docs/architecture-briefs/2026-06-04-data-serve-integrity.md`

## [Architect] Brownfield Findings

- **Zone:** multi-zone
  - `apps/mcp-server/`         → dev-mcp-server   (DSI-S1-SLA, DSI-S1-FE-TYPE, DSI-S2-PRICE client side, DSI-S3-SECTOR-FIN)
  - `apps/stock-price/`        → dev-stock-price  (DSI-S2-PRICE service side)
  - `apps/macro-indicators/`   → dev-macro-indicators — ~~LATENT LANDMINE, not in deploy set, backlog only~~ LIVE (CORRECTED 2026-06-05: container healthy :5004); DSI-INV-1 fix already shipped; FU-SBV-DEPOSIT-PROVENANCE-GO tier correction open

- **Verified paths:**
  - `apps/mcp-server/src/domain/services/macroIndicatorSla.ts:35,73` — queries `country='VN'`, dead since commit 7a0adfdc (2026-05-17)
  - `apps/mcp-server/src/scheduler/macro/macroIndicatorRefreshJob.ts:242` — writes `country='vietnam'`, active primary writer
  - `apps/mcp-server/src/infrastructure/fetchers/tradingEconomics.ts:195,231,306` — writes `country='vietnam'`
  - `apps/mcp-server/src/domain/services/macro/macroIndicatorFetcher.ts:266,296` — writes `country='VN'`, dead code (production path never reached)
  - `apps/mcp-server/src/interface/mcp/server.ts:1435,1520` — push-gso defaults country to `'VN'` when payload omits field
  - `apps/macro-indicators/pkg/application/usecases.go:43-51` — fixtureFedFundsRate=5.33, fixtureVNDDepositRate=4.7; allLive only covers oil/gold/usdVnd, not carry/yield
  - `apps/stock-price/pkg/module/price_resolution/price_resolution.go:76,114` — Staleness computed but not in FetchPriceResponse DTO
  - `apps/stock-price/pkg/application/usecases.go:19-33` — FetchPriceResponse missing Staleness, IsEstimate, source_tier
  - `apps/frontend/app/domain/market.ts:152-159` — MacroSnapshot interface missing dataSource, is_estimate, source_tier

- **Reuse patterns:**
  - Implement `ProvenanceFields` once as a shared domain model; extend all response types from it
  - `price-staleness-classifier` primitive already exists in stock-price — extend, never duplicate

- **Design decisions:**
  - DSI-INV-1: per-field provenance (source_tier + true fetched_at + is_estimate) — not response-level
  - `dataSource:"live"` only when ALL component fields fresh within SLA window
  - Nullable Change/ChangePercent: `*float64` in Go, `number | null` in TS
  - macro-indicators Go plane: ~~not deployed~~ LIVE (CORRECTED 2026-06-05); DSI-INV-1 producer fix shipped; FU-SBV-DEPOSIT-PROVENANCE-GO FINAL RULING: tier:2/is_estimate:false unconditional (live schema probe confirmed no effective_date col; absence is schema gap, not estimate flag; suppressing a real signal for schema completeness violates DSI-INV-1 intent); minimal fix = 1-line constant in buildCarryDTO (sourceTier:=2 on live path) + TestDSIINV1_CarrySourceTierAdministeredRate; no new port/col/dead-branch; FU-SBV-EFFECTIVE-DATE-COLUMN tracked separately P3/backlog

- **Scan clean:** true ✓
- **BUILD-STANDARD:** lean
- **BUILD-STANDARD-REF:** docs/standards/microservice-build-standard.md

## Risk Flags

- **R-1 HIGH:** push-gso default country change may conflict with VPS scripts that send `country:'VN'` explicitly — BA must include VPS script audit step
- **R-2 MEDIUM:** macroIndicatorFetcher.ts dead code — comment only, do not remove
- **R-3 LOW:** Change/ChangePercent nullability is a breaking API change — update all TS callers in same PR
- **R-4 ~~LOW: Confirm macro-indicators container not running before treating as latent-only~~ RESOLVED HOT 2026-06-05:** Container confirmed Up+healthy (:5004) via `docker ps`. DSI-INV-1 fix LIVE. Residual: FU-SBV-DEPOSIT-PROVENANCE-GO tier correction (tier:1→tier:2 for administered SBV rate) — must ship before sprint closes.

## Task Sequence

1. DSI-S1-SLA (XS) — fix `country='VN'` → `'vietnam'` in macroIndicatorSla.ts + server.ts push-gso default
2. DSI-S1-MACRO (M) — per-field is_estimate on carry/yield; true-source fetched_at
3. DSI-S1-FE-TYPE (S) — extend MacroSnapshot + MacroSignalEntry TS types (can parallel with S1-MACRO)
4. DSI-S2-PRICE (M) — stock-price Staleness propagation + Change nullability
5. DSI-S3-SECTOR-FIN (L, P2) — sector/fin fixture clusters → null + is_estimate
6. ~~DSI-MACRO-INDICATORS-LATENT — backlog only~~ LIVE. DSI-INV-1 fix shipped. FU-SBV-DEPOSIT-PROVENANCE-GO FINAL: 1-line fix in buildCarryDTO (sourceTier:=2 on live path; no new port/col/dead-branch) + TestDSIINV1_CarrySourceTierAdministeredRate. Brief §2 addendum updated with final ruling.

## RETURN

```
DONE: Technical design corrected (2026-06-05) — deploy-scope error annotated RESOLVED; SBV tier ruling added
ZONE: multi (mcp-server, stock-price, macro-indicators LIVE)
NEXT: dev-macro-indicators | apply FU-SBV-DEPOSIT-PROVENANCE-GO tier correction per §2 addendum
HANDOFF: docs/handoffs/DSI-ARCH.md
PIPELINE: continue
```
