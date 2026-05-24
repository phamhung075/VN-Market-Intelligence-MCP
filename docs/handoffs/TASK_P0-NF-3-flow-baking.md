---
task_id: "P0-NF-3"
pilot: "news-fetch"
phase: "0"
title: "Agent-father: create thin flows/dev-news-fetch/main.md with G12 DoD gate (NO new agent .md)"
estimate: "1.5h"
owner: "agent-father"
status: "READY"
date: "2026-05-24"
---

# TASK P0-NF-3 — Bake G12 DoD Gate into Per-Service Flow (No New Agent)

## Summary

PO DECISION (2026-05-24): news-fetch is owned by the generic `developer` — there is NO `dev-news-fetch` agent .md, and one MUST NOT be created (that is agent-md-factory scope and adds roster surface for the smallest service). Instead, agent-father creates a thin **per-service flow** `.claude/flows/dev-news-fetch/main.md` that the generic developer is routed to (by zone) for news-fetch pilot tasks. This flow carries the G12 DoD gate (sandbox-dashboard-green-before-RETURN), matching the proven stock-price / macro-indicators per-service-flow pattern, while keeping `flows/developer/main.md` clean.

This bakes G12 Day-0 so that from dev-news-fetch's first Phase 1 task the loop enforces: "Do not mark task DONE until the sandbox dashboard shows all news-fetch scenarios green."

## Acceptance Criteria

### AC-1: NO new agent .md
- [ ] Confirm `.claude/agents/dev-news-fetch.md` is NOT created (PO decision: generic developer owns; agent identity stays generic)
- [ ] If a `dev-news-fetch.md` already exists from a prior cycle, flag to PO — do not silently keep it

### AC-2: Thin per-service flow created
- [ ] Create `.claude/flows/dev-news-fetch/main.md` by cloning `.claude/flows/dev-macro-indicators/main.md` (closest TS-friendly DoD-gate precedent) with news-fetch substitutions
- [ ] Zone: `apps/news-fetch/`; service port 5008; language TypeScript/Bun
- [ ] Standard structure: inputs, outputs, error boundary, step-0 setup, G12 DoD gate

### AC-3: G12 DoD Gate baked
- [ ] Clone the "BEFORE marking task DONE: sandbox-green gate" section from the macro/stock-price flow
- [ ] Customize sandbox command for TS/Bun: `bun run sandbox --tier=all --module=news-fetch` (or the actual runner name confirmed in P0-NF-1 brownfield)
- [ ] Explicit RETURN condition: "If sandbox-all-green exit 0 → continue to RETURN. If exit != 0 → escalate blocker, do NOT mark DONE."

### AC-4: Fence note (TS — ESLint, gated on SI-3)
- [ ] Add comment block: G4 fence for TS services = ESLint per SI-3 design; note "G4 AC locked only after SI-3 lands for TS pilots" (per pilot-status G4 _title_note)
- [ ] Fence-A/B/C intent: primitives import nothing inward-violating; module does not import infrastructure; infra/adapters wired only from composition root

### AC-5: Pre-revert tag protocol documented
- [ ] Document pre-revert tags in the flow: `news-fetch-pre-ci` (G4), `news-fetch-pre-delete` (G5), `news-fetch-pre-inject` (G10). No retag/force/push; frozen anchor.

### AC-6: SSOT + G12 streak rule effective
- [ ] Update `docs/data/pilot-status-news-fetch.json` `phase0.deliverables.dev_agent_flow_file` → DONE with flow path + commit SHA
- [ ] Set `goals[G12].g12Streak.ruleEffectiveAfter` to this commit SHA + date

## Boundary
- Agent-system files only (`.claude/flows/dev-news-fetch/main.md`). Invoke skill agent-md-factory standards (SSOT, DRY, lazy-load, factory templates) before editing.
- NO service code.

## References
- Precedent flow: `.claude/flows/dev-macro-indicators/main.md` (G12 DoD gate)
- Stock-price precedent handoff: `docs/handoffs/TASK_P0-SP-3-agent-flow-baking.md`
- Canonical G12: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G12

---

## Completion — agent-father · 2026-05-24

**Status:** DONE

**Deliverable:** `.claude/flows/dev-news-fetch/main.md` (135L, size-justification present)
**Commit:** `bca30508`

**AC verification:**
- AC-1 PASS: `.claude/agents/dev-news-fetch.md` NOT created (confirmed not exists). No prior file found.
- AC-2 PASS: Flow created at `.claude/flows/dev-news-fetch/main.md`. Zone: `apps/news-fetch/`, port 5008, language TS/Bun. Standard structure: pointer + Language Mode + Smoke Checks + G12 DoD gate + Security Clause + Fence Rules + Pre-Revert Tag Protocol + References.
- AC-3 PASS: G12 DoD gate baked: "Do not mark task DONE until sandbox dashboard shows all news-fetch scenarios green." Sandbox command: `bun run sandbox --tier=all --module=news-fetch`. Explicit RETURN condition: exit 0 = GREEN → continue; exit != 0 = escalate blocker, do NOT mark DONE.
- AC-4 PASS: Fence note added — G4 ESLint fence AC locked after SI-3 lands for TS pilots. Fence-A/B/C intent documented (primitives, module, composition root).
- AC-5 PASS: Pre-revert tags documented: `news-fetch-pre-ci` (G4), `news-fetch-pre-delete` (G5), `news-fetch-pre-inject` (G10). Frozen anchor rule stated.
- AC-6 PASS: `docs/data/pilot-status-news-fetch.json` `phase0.deliverables.dev_agent_flow_file` → DONE with flow path + commit SHA. `goals[G12].g12Streak.ruleEffectiveAfter` set to `bca30508 2026-05-24`.
