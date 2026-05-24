---
title: "Reboot Charter — kinh-dich-service (TS/Bun → Go reboot)"
date: "2026-05-24"
author: "po"
status: "RATIFIED (user override 2026-05-24)"
service: "kinh-dich-service"
owner: "dev-kinh-dich (now Go)"
language: "Go"
reboot_from: "TypeScript/Bun (completed pilot, verdict=scale, ~900 files)"
authority: "USER DIRECTIVE 2026-05-24 — docs/po-decisions/2026-05-24-language-pivot-kinh-dich.md"
precedent: "docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md (TA Option-B Go reboot)"
canonical_goals: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (G1–G12)"
---

# Reboot Charter — `kinh-dich-service` (TS/Bun → Go)

**Thin, delta-only charter. G1–G12, Decision Matrix, Security Clause, Baseline Metric Capture are CANONICAL in the pilot charter and are NOT restated here.**

→ **Canonical G1–G12 source:** `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md`
Apply verbatim, substituting `kinh-dich-service` for `technical-analysis` and `dev-kinh-dich` as goal owner. G1–G12 are language-agnostic — the Go reboot re-earns each goal on Go evidence.

→ **Phase plan:** `docs/architecture-briefs/2026-05-22-refactor/07-phases.md` · **QA gates:** `qa-gates/`
→ **Status tracking (canonical SSOT, schema = docs/data/pilot-status-schema.json):** `docs/data/pilot-status-kinh-dich.json`
→ **Decision + authority + sunk-cost ledger:** `docs/po-decisions/2026-05-24-language-pivot-kinh-dich.md`

---

## Why a reboot (not a fresh pilot)

kinh-dich-service was a **completed** TS/Bun pilot (12/12 goals YES, verdict=`scale`). The user directed a forced Go reboot for fleet consistency (all core compute services in Go + single Go sandbox toolchain). The completed TS history is **archived, not destroyed** (`tsCompletionArchive` in the SSOT). This charter is the delta from the TA Option-B Go reboot pattern applied to kinh-dich.

---

## Service-Specific Deltas

| Field | Value |
|---|---|
| **Owner specialist** | `dev-kinh-dich` (language flipped TS/Bun → Go by agent-father per agent-md-factory rule) |
| **Language** | Go (was TypeScript/Bun) |
| **Port** | 5005 (internal == external) per `system-map.json` — unchanged |
| **Anti-scope-creep boundary** | `apps/kinh-dich-service/` ONLY. No other service touched. |
| **G4 fence tool** | `depguard` via golangci-lint (Go path) — replaces the TS `eslint-plugin-boundaries` fence. |

---

## Reboot Scope (TS → Go)

Mirror the TA Option-B reboot. Revert/replace the TypeScript implementation and re-extract in Go:

1. **Primitives** — revert/replace TS `src/primitive/*` (hexagram-resolver, hao-encoder, ngu-hanh-classifier, reading-scorer, nuclear-hexagram-computer). Re-extract as Go pure functions in `pkg/primitive/` (architect confirms exact Go layout). Each re-earns G1 (≥3 scenarios: golden + edge + failure).
2. **Module** — replace TS `src/module/reading_composer/` with a Go module composing the Go primitives via ports/DI (MarkovPort → Go interface, infra injected only at composition root). Re-earns G2.
3. **Composition root** — replace TS `src/index.ts` with Go `cmd/server/main.go` (≤80 lines, DI wiring + Hono-equivalent Go router + server startup, zero domain ops). Re-earns G3.
4. **Sandbox dashboard** — rebuild `dashboard/index.html` to render from Go sandbox traces (3 panels: primitives + module + microservice). Re-earns G6–G9.
5. **Architecture fence** — `depguard` via golangci-lint, deliberate-violation proof (Go path). Re-earns G4.
6. **Old TS code deletion + HTTP rewire** — move superseded TS to `_deprecated/`; MCP handlers route HTTP to port 5005 (Go service). Re-earns G5.

### Assets to PRESERVE through the reboot (language-agnostic)
- **Scenario JSON** (`docs/scenarios/kinh-dich/`) — rescuable; dev SHOULD preserve, regenerate only if mechanically too risky.
- **OpenAPI YAML** (`src/interface/openapi.yaml`) — Go composition root serves the same HTTP contract on port 5005.

### Goal re-earn map
- **G1–G8, G10–G12** — RESET to TBD; the Go reboot must re-earn them on Go evidence (Go sandbox green, Go depguard fence, Go AI-fix-cycle).
- **G9** — held; was earned via Path B (PO Playwright). It **must be re-confirmed on the Go dashboard** (the dashboard is rebuilt, so the prior render proof no longer applies).

---

## Key risks
1. **Discarding earned work.** ~900 TS files are rewritten. The TS pilot was dashboard-green and trust-verified. The reboot must not regress hexagram-resolution correctness — the rescued scenario JSON is the safety net (the Go primitives must pass the same golden/edge/failure scenarios the TS primitives passed).
2. **Domain fidelity.** The TS pilot uncovered authentic domain contracts (e.g. `extractAction(actionText: string)` not `(score: number)`; `THIEU_DUONG_THRESHOLD=0.10`; `LAO_DUONG_THRESHOLD=0.75`). The Go reboot MUST preserve these authentic contracts — do not reintroduce the handoff-spec errors the TS pilot corrected. Cross-check against the archived TS evidence and the rescued scenario JSON.
3. **Markov dependency.** The TS module used a `MarkovPort` (infra SQLite impl injected at composition root). The Go module must keep the same port boundary — infra injected only at the composition root, never imported by the module (G2 / Fence-C).

## Sequencing note
Standalone domain service (port 5005); not RUN-SOLO. Parallel-eligible once dev-kinh-dich is flipped to Go (agent-father signal D4). Writes ONLY its own `pilot-status-kinh-dich.json` — never the shared `pilot-status.json`.
