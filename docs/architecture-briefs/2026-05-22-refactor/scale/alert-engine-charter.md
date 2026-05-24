---
title: "Scale Charter — alert-engine"
date: "2026-05-24"
author: "po"
status: "READY"
service: "alert-engine"
owner: "dev-alert-engine"
language: "Go"
scale_order: "parallel-eligible (after macro-indicators)"
canonical_goals: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (G1–G12)"
---

# Scale Charter — `alert-engine`

**Thin charter. G1–G12, Decision Matrix, Security Clause, Baseline Metric Capture are CANONICAL in the pilot charter and are NOT restated here.**

→ **Canonical G1–G12 source:** `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md`
Apply verbatim, substituting `alert-engine` for `technical-analysis` and `dev-alert-engine` as goal owner.

→ **Phase plan:** `docs/architecture-briefs/2026-05-22-refactor/07-phases.md` · **QA gates:** `qa-gates/`
→ **Status tracking:** `docs/data/refactor-status-alert-engine.json`

---

## Service-Specific Deltas

| Field | Value |
|---|---|
| **Owner specialist** | `dev-alert-engine` |
| **Language** | Go (already Go) |
| **Anti-scope-creep boundary** | `apps/alert-engine/` ONLY. |

### Current state — GO DDD present, needs scenario coverage

`apps/alert-engine/` already has a Go scaffold (`go.mod`, `pkg/{domain,application,infrastructure,interface,module,primitive}`, `cmd/{sandbox,server}`, `dashboard/`). No leftover TS scaffolding (no package.json) — cleaner than macro/stock-price on the deletion axis.

- **Go primitives already present** (`pkg/primitive/`): `cooldown-gate`, `dedup-key-builder`, `signal-classifier`.

This service is **complete**, not rebuild. The work is scenario-JSON coverage (G1: ≥3 incl. failure per primitive), dashboard honesty (G6–G8), CI fence (G4), G5 (verify no stale TS callers remain in mcp-server routing to the old alert path), AI-fixability/regression/DoD (G10–G12).

### Candidate primitives (target-state §Alert pipeline primitives)
Already scaffolded: `cooldown-gate`, `dedup-key-builder`, `signal-classifier`. Module candidate: an `alert-pipeline` module composing classify → dedup → cooldown.

### Key risks
1. **Stateful gating logic.** Cooldown windows and dedup keys are time/state-dependent. Scenario JSON must pin a deterministic clock/seed so the sandbox is reproducible (pure-function contract). Beware hidden `time.Now()` reads inside primitives — push the clock into a port.
2. **Alert split contract.** Server=speed (stop-loss), Commander=intelligence (verified chains). The refactor must NOT collapse that split — primitives serve both paths; don't bake one path's policy into a shared primitive.
3. **Cross-service consumer.** alert-engine consumes signals from stock-price + technical-analysis + macro. G11 regression-canary should consider the upstream contract shape.

### Notes
Live agent-signal bus is the JSON file bus in `docs/signals/` (the SQLite `agent_signals` table is legacy/dead) — do not wire primitives to the dead table.
