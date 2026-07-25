# PO Notebook

_Last: 2026-07-25T07:29Z (user demand — Zod-style validation for ALL agent input surfaces; sprint INPUT-VALIDATION-COVERAGE minted, routed architect-first)_

## Tick 2026-07-25T07:27–07:29Z — input-validation-coverage kickoff (user demand, router-dispatched)

**This is COVERAGE-COMPLETION + STANDARDIZATION, not greenfield — the router was right.** The proven pattern already ships for SOME inputs; the gap is that it is applied piecemeal. Confirmed the 5 anchor validators all EXIST on disk: `signalTypes.ts` (strict Zod), `agentSignalTools.ts:274` (the GOLD msg `"Signal type 'X' has invalid or missing required fields:\n{errors}"` + audit-log), `foreignFlowValidator.ts` (per-field `{field,reason}`), `signalBuilders.ts`, `orch-validate.mjs`+`orch-apply.sh` (class-B write-gate).

**Three write-surface classes, quantified at source:**
- (A) MCP write-tools: ~150 tool files under `apps/mcp-server/src/interface/mcp/tools/` — partial Zod today. Needs an inventory of which still lack the standardized descriptive-error contract.
- (B) script-gated JSON: orch-state via `orch-apply.sh` — DONE, the template to copy.
- (C) `77` top-level `docs/data/*.json` + agent notebooks + `docs/handoffs/*` written DIRECTLY via Write/Edit with ZERO runtime gate — the hardest, largest gap and THE KEY DESIGN DECISION.

**Decided: class-C mechanism → architect (design-first).** Not a PO call — it is a real technical tradeoff (fail-closed PreToolUse Write|Edit hook + per-path schema registry vs per-store apply-wrappers vs a shared validate-before-write helper). Minted `IVC-ARCH-BLUEPRINT` (owner=architect, zone=multi, BACKLOG) rather than a BA spec, matching the SYSTEMIC-REMAKE design-first precedent. Sprint goal `INPUT-VALIDATION-COVERAGE` written; umbrella lock `task:INPUT-VALIDATION-COVERAGE` claimed (TTL 3600).

**Prior-art FOLD list (do NOT duplicate — architect pulls under the umbrella):** `UC-CRITIC-HOOKS-ENFORCEMENT` (hooks end `2>/dev/null||true` = fail-OPEN; a crashed validator reads as pass — this is the fail-closed requirement, already on the board), `FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT`, `FIX-BCTC-VALIDATION-GATE-NONBANK-ZERO-SCALE`, `SYSREMAKE-P2-T2-SCHEMA-ADDITIONS` (ready). SSOT-W1 Zod-hardening sprint already DONE+evicted — did not re-mint.

## Carry-over
- **The write-gate rejected my own first mint — and it was right.** I copied the sprint-kickoff.md template's `status:"TODO"` into the backlog lane; `orch-apply.sh` Stage-1b bounced it (`backlog` allows only `BACKLOG|BLOCKED`). The template is stale prose; the live Zod validator is authoritative. A fitting proof of exactly what this sprint generalizes — and a reminder that sprint-kickoff.md step-4 needs a fix (separate tiny debt: it prescribes an invalid status).
- **"Coverage is applied piecemeal" is the whole defect class.** Five good validators exist and still an agent can persist garbage through any of ~77 ungated stores. Partial validation reads as "we validate" until you enumerate the surfaces. The sprint's success metric is the enumeration itself: every A/B/C surface either enforces or is waived-with-rationale.
- **Fail-open enforcement is worse than none — it lies.** UC-CRITIC-HOOKS-ENFORCEMENT already flags it and sat in backlog unpulled; folding it INTO this sprint (vs leaving it orphaned) is the move. Any new class-C hook must be fail-CLOSED or it re-creates the vulnerability under a green badge.
