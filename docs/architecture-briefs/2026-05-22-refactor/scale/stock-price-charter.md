---
title: "Scale Charter — stock-price"
date: "2026-05-24"
author: "po"
status: "READY"
service: "stock-price"
owner: "dev-stock-price"
language: "Go"
scale_order: "parallel-eligible (after macro-indicators proves the scale pattern)"
canonical_goals: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (G1–G12)"
---

# Scale Charter — `stock-price`

**Thin charter. G1–G12, Decision Matrix, Security Clause, Baseline Metric Capture are CANONICAL in the pilot charter and are NOT restated here.**

→ **Canonical G1–G12 source:** `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md`
Apply verbatim, substituting `stock-price` for `technical-analysis` and `dev-stock-price` as goal owner.

→ **Phase plan:** `docs/architecture-briefs/2026-05-22-refactor/07-phases.md` · **QA gates:** `qa-gates/`
→ **Status tracking:** `docs/data/refactor-status-stock-price.json`

---

## Service-Specific Deltas

| Field | Value |
|---|---|
| **Owner specialist** | `dev-stock-price` |
| **Language** | Go (already Go) |
| **Anti-scope-creep boundary** | `apps/stock-price/` ONLY. |

### Current state — GO DDD present, needs cleanup + scenario coverage

`apps/stock-price/` already has a Go scaffold (`go.mod`, `pkg/{domain,application,infrastructure,interface,module,primitive}`, `cmd/{sandbox,server}`, `dashboard/`).

- **Go primitives already present** (`pkg/primitive/`): `price-quote-normalizer`, `price-staleness-classifier`, `tier-fallback-selector`.
- **Leftover TS scaffolding to remove** (G5): `package.json`, `bun.lock`, `tsconfig.json`, `node_modules/`, `api/`, `bin/`. Confirm not live first.

This service is **rewire + complete**. Structure exists; the work is scenario-JSON coverage (G1), dashboard honesty (G6–G8), CI fence (G4), TS-scaffold deletion (G5), AI-fixability/regression/DoD (G10–G12).

### Candidate primitives
Already scaffolded: `price-quote-normalizer`, `price-staleness-classifier`, `tier-fallback-selector`. Likely additions from real bugs: OHLCV field-order normalization (the SELECT/Scan field-order bug class — see bug-inventory), null-coercion guard. Module candidate: a `market-data` price-context module.

### Key risks
1. **Known field-order / null-coercion bug class.** Recent SEV-1 (API `close`=DB.low Scan misalignment) and null-coercion bugs in `pkg/infrastructure/fetchers.go` are exactly the kind of bug G10 should prove AI-fixable. These are strong, realistic injection candidates for the G10/G11 bug-injection goals.
2. **VPS / live-feed coupling.** Price ingestion is VPS-proxy driven. Keep fetch in adapters; primitives must stay pure (Security Clause — zero creds in sandbox).
3. **Downstream blast radius.** stock-price feeds technical-analysis and alert-engine. A primitive regression has cross-service impact — G11 regression-canary design should account for the downstream contract.

### Notes
DB decision is locked (SQLite local, no cloud). Readonly handle pattern preserved.
