<!-- size-justification: index only — points to canonical sources, no goal duplication. -->
# Scale Rollout — Three-Tier-Trust Refactor

The technical-analysis pilot is **DONE** (verdict=`scale`, `docs/data/pilot-status.json`). This directory holds the planning groundwork for rolling the proven 12-goal three-tier-trust pattern out to the services that have **not yet** been scaled. Each service is driven from its OWN Claude Code terminal by its `dev-<service>` specialist.

## Canonical sources (do NOT duplicate per service)
- **G1–G12 + Decision Matrix + Security Clause + Baseline Capture:** `../pilot-charter.md`
- **Phase plan:** `../07-phases.md` · **QA gates:** `../qa-gates/`
- **Per-service status SSOT schema:** `docs/data/pilot-status-schema.json` (agent-father v1.0, macro-v2 shape)
- **The 12 goals are language-agnostic and universal.** Per-service charters document deltas ONLY.

## Fleet status at this groundwork cycle (2026-05-24, po cycle-70)

The fleet has advanced beyond a single-pilot view. Some services are already scaled under the **factory model** (`docs/architecture-briefs/<date>-<svc>-factory/` per-service charter dirs + `docs/data/pilot-status-<svc>.json` SSOT). Reconcile against the live SSOT before any dispatch — do NOT reset advanced services.

| Service | State | SSOT file | Charter | Owner | Lang |
|---|---|---|---|---|---|
| technical-analysis | **DONE** (pilot) | `docs/data/pilot-status.json` | `../pilot-charter.md` | dev-technical-analysis | Go |
| macro-indicators | **DONE** | `docs/data/pilot-status-macro-indicators.json` | factory dir | dev-macro-indicators | Go |
| stock-price | **DONE** | `docs/data/pilot-status-stock-price.json` | factory dir | dev-stock-price | Go |
| kinh-dich-service | **ACTIVE** (Go reboot — user override 2026-05-24) | `docs/data/pilot-status-kinh-dich.json` | `kinh-dich-charter.md` (reboot delta) + archived `2026-05-23-kinh-dich-factory/` (TS history) | dev-kinh-dich | **Go** (was TypeScript) |
| alert-engine | **ACTIVE** (pilot-5 Phase 2) | `docs/data/pilot-status-alert-engine.json` | `2026-05-24-alert-engine-factory/` | dev-alert-engine | Go |
| api-gateway | **PENDING** (fresh) | `docs/data/pilot-status-api-gateway.json` | `api-gateway-charter.md` (thin) | dev-api-gateway | Go |
| pdf-extractor | **PENDING** (fresh) | `docs/data/pilot-status-pdf-extractor.json` | `pdf-extractor-charter.md` (thin) | dev-pdf-extractor | Python |
| rag-service | **PENDING** (fresh) | `docs/data/pilot-status-rag-service.json` | `rag-service-charter.md` (thin) | dev-rag-service | Python |
| frontend | **PENDING** (fresh) | `docs/data/pilot-status-frontend.json` | `frontend-charter.md` (thin) | dev-frontend | TS (Remix) |
| news-fetch | **PENDING** (fresh) | `docs/data/pilot-status-news-fetch.json` | `news-fetch-charter.md` (thin) | developer | TS |
| **mcp-server** | **DONE** (scale — 12/12 YES, closed 2026-05-26 SOLO-LAST) | `docs/data/pilot-status-mcp-server.json` | `mcp-server-charter.md` (thin) | dev-mcp-server | TS (Bun) |

> **ROLLOUT 11/11 COMPLETE (2026-05-26).** mcp-server was the 11th and FINAL pilot of the 2026-05-22 three-tier deep-module rollout, closed SOLO-LAST per charter at 12/12 YES (verdict=scale) — qa P2-Z close-gate APPROVED (`docs/signals/qa-mcp-server-p2-close-2026-05-26T073000Z.json`) → PO Phase-3 atomic terminal flip. G9 trust contract verified via ops live-recheck (toolCount=146, 8 tools real data, 0 Telegram failures, Playwright 7/7) per `feedback_trust_verification_is_system_job`, NOT user verbal sign-off. The 2026-05-22 three-tier-trust pattern is now scaled across all 11 services. (Note: the "PENDING (fresh)" labels on other rows above are pre-rollout snapshot text — reconcile each against its live `pilot-status-<svc>.json` SSOT; do not treat this table's stale labels as authoritative.)

**Thin charters in this dir cover only the 6 fresh PENDING services.** The 4 DONE/ACTIVE services already have richer factory-dir charters — do not duplicate. When a fresh service kicks off, the architect should instantiate a factory charter dir (mirroring alert-engine pilot-5); the thin charter here captures interim deltas/risks/primitive candidates to fold in.

## ✅ kinh-dich Go-pivot — RATIFIED (user override 2026-05-24)
A TS→Go reboot for kinh-dich-service was initially **rejected by the PO** on ground-truth (kinh-dich was an already-closed pilot, verdict=scale, completed in TypeScript — rebooting a successfully-scaled service to Go for consistency alone discards a completed pilot and rewrites ~900 working files). **The user was shown that cost explicitly and directed the Go reboot anyway.** The PO's reservation is recorded as acknowledged-and-overridden by user authority. Decision: `docs/po-decisions/2026-05-24-language-pivot-kinh-dich.md`. Reboot charter (delta-only): `kinh-dich-charter.md`. Mirrors the TA Option-B Go reboot. kinh-dich-service is now **Go** — `pilot-status-kinh-dich.json` reopened DONE→ACTIVE, language TypeScript→Go, TS completion record archived under `tsCompletionArchive`, G1–G8 + G10–G12 reset to re-earn (G9 held, must re-confirm on Go dashboard). agent-father signal emitted to flip `.claude/agents/dev-kinh-dich.md` + reconcile `system-map.json` (kinh-dich + TA + macro drift entries).

## ⚠️ mcp-server — RUN-SOLO, LAST
mcp-server runs SOLO after every other service (shared-substrate write race + ~132-tool barrel churn). See `mcp-server-charter.md`.

## Parallel-safety
Each service writes ONLY its own `pilot-status-<service>.json` — never the shared `pilot-status.json` — so parallel terminals never clobber each other.
