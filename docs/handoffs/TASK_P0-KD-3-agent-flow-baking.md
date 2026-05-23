---
task_id: "P0-KD-3"
pilot: "kinh-dich"
phase: "0"
title: "Dev-kinh-dich agent file + flow file baking (agent-father)"
estimate: "3h"
owner: "agent-father"
status: "READY"
date: "2026-05-24"
---

# TASK P0-KD-3 — dev-kinh-dich Agent + Flow Baking

## Summary

Agent-father updates/confirms two files using the `agent-md-factory` skill (DRY, SSOT, lazy-load pattern):

1. **`.claude/agents/dev-kinh-dich.md`** — agent file for the kinh-dich specialist (TypeScript/Bun primary; G12 DoD gate constraint; R-FENCE lazy-load)
2. **`.claude/flows/dev-kinh-dich/main.md`** — dev flow with G12 DoD gate baked Day 0 + Fence-A/B/C rules + pre-revert tag protocol

Both files inherit the factory-proven pattern from stock-price (pilot 3) and macro (pilot 2), adapted for TypeScript/Bun and R-FENCE gate.

## Acceptance Criteria

### AC-1: Agent file `.claude/agents/dev-kinh-dich.md` confirmed/updated
- [ ] Invoke skill `agent-md-factory` with input: `{"agent": "dev-kinh-dich", "pilot": "kinh-dich", "language": "ts", "runtime": "bun"}`
- [ ] **If file does not exist:** factory creates full template (metadata, capabilities, tools, model, constraints, zone, pilot_constraints)
- [ ] **If file exists:** factory audits for factory-readiness (§4.5 pattern)
- [ ] Confirm file contains:
  - [ ] YAML frontmatter: name, color, description, tools, model, version
  - [ ] `zone: apps/kinh-dich-service/` (per system-map.json)
  - [ ] `language: "TypeScript"` (locked)
  - [ ] `runtime: "bun"` (locked)
  - [ ] `pilot_constraints: { r_fence: "eslint-plugin-boundaries", g7_zero_creds: true, pre_revert_tags: ["kinh-dich-pre-ci", "kinh-dich-pre-delete", "kinh-dich-pre-inject"] }`
  - [ ] `capabilities`: includes task decomposition, primitive extraction, module wiring, G12 flow rule compliance
  - [ ] `tools`: references `.claude/flows/dev-kinh-dich/main.md` (flow will be created/updated in AC-2)

### AC-2: Flow file `.claude/flows/dev-kinh-dich/main.md` created/updated with G12 DoD gate
- [ ] Invoke skill `agent-md-factory` with input: `{"flow": "dev-kinh-dich", "pilot": "kinh-dich", "language": "ts", "runtime": "bun", "dod_gate": true}`
- [ ] Factory creates or updates flow per macro/stock-price pattern (see references below)
- [ ] Confirm flow contains:
  - [ ] **G12 DoD-Gate rule (hardcoded in main flow):** before RETURN, dev-kinh-dich MUST paste sandbox-green evidence (zero failures across all scenarios at current tier). Example:
    ```
    ## DoD Gate (G12 checkpoint)
    
    Before returning to PM, verify:
    - [ ] Sandbox runs green: `cd apps/kinh-dich-service && bun run sandbox --tier=all --module=kinh-dich --scenario=all` exits 0
    - [ ] All scenarios PASS (zero failures)
    - [ ] Paste full sandbox output as evidence in the task RETURN block
    - If sandbox shows any RED, fix the scenario/implementation before shipping
    ```
  - [ ] **R-FENCE lazy-load gate (in Phase 1 handoff trigger):** when G4-related task lands, skip pre-check code — focus on proof structure only (full fence config template baked in charter, not to be downloaded/fetched)
  - [ ] **Pre-revert tag protocol (via caveman to dev-kinh-dich):**
    - `kinh-dich-pre-ci` — created BEFORE G4 deliberate-violation commit (Phase 2)
    - `kinh-dich-pre-delete` — created BEFORE G5 `git mv` to `_deprecated/` (Phase 2)
    - `kinh-dich-pre-inject` — created BEFORE G10 bug-injection commit (Phase 2)
  - [ ] Flow references charter `.pilot_constraints` for rule clarity

### AC-3: Skill invocation audit trail
- [ ] Paste both skill invocation commands and their outputs into handoff as evidence
- [ ] Confirm no errors from factory (token budget, DRY conflicts, schema violations)
- [ ] If factory returns warnings: document them and confirm they are expected/acceptable (e.g., "agent already exists" is OK for AC-1 update pass)

### AC-4: Agent + flow integration check
- [ ] Confirm `.claude/agents/dev-kinh-dich.md` references the correct flow path: `.claude/flows/dev-kinh-dich/main.md`
- [ ] Confirm flow `trigger` section references the agent name: `agent: dev-kinh-dich` (per dispatch table)
- [ ] Spot-check: flow can be invoked by main router with `Agent(dev-kinh-dich, TASK_NNN)` pattern (no syntax errors in YAML/Markdown)

### AC-5: Zone + runtime confirmation
- [ ] Verify zone in agent file matches system-map.json: `zone: apps/kinh-dich-service`
- [ ] Verify runtime in agent file matches system-map.json: `runtime: bun`
- [ ] Verify port in agent file (if present) matches system-map.json: `port: 5005` (never hardcoded in flow; only in charter/SSOT)

### AC-6: Constraints + pilot-readiness sign-off
- [ ] Confirm agent file contains all L1-L7 + L-FENCE constraints baked in (comments/docs)
- [ ] Output: "Agent + flow files READY for factory-pilot-4. R-FENCE gate deferred to Phase 1 G4 task. G12 DoD gate active from Phase 1 A onwards."

## Implementation Guidance

1. **Skill invocation:** Use skill tool with `skill: "agent-md-factory"` and structured JSON input per skill documentation
2. **Reference templates:**
   - Agent: `.claude/agents/dev-stock-price.md` (Go service; adapt zone/runtime/language)
   - Flow: `.claude/flows/dev-stock-price/main.md` (Go service; adapt DoD gate + pre-revert tags)
3. **DRY enforcement:** factory will detect duplicates and warn; overwrite is OK if intentional (update pass)
4. **Forbidden:** do NOT hand-edit agent/flow files; use factory only (ensures SSOT + consistency across pilots)

## Constraints

- **L84 explicit-file staging:** agent + flow files only (no other changes)
- **Skill-mandatory:** MUST use agent-md-factory; hand-editing forbidden
- **No git push:** local-only commit
- **Factory-proven pattern:** no custom extensions without architect sign-off (charter locked until post-pilot)

## Hard Gates

- [ ] **FACTORY SUCCESS:** skill invocations exit 0 with no errors (warnings OK)
- [ ] **FILES EXIST:** `.claude/agents/dev-kinh-dich.md` and `.claude/flows/dev-kinh-dich/main.md` present and valid YAML/Markdown
- [ ] **ZONE + RUNTIME SET:** zone = apps/kinh-dich-service, runtime = bun, language = TypeScript

## RETURN Block

**Signal to emit:** docs/signals/pm-p0-kd3-agent-flow-baking-complete-<UTC>.json
- Status: DONE | BLOCKED
- Files: .claude/agents/dev-kinh-dich.md, .claude/flows/dev-kinh-dich/main.md
- Factory verdict: SUCCESS | WARNINGS | FAILED
- DoD gate rule: ACTIVE (with example paste)
- Pre-revert tags: [kinh-dich-pre-ci, kinh-dich-pre-delete, kinh-dich-pre-inject]
- Next task: PM waits for all 5 remaining Phase 0 deliverables before exit gate

**Expected timeline:** 2026-05-24 (same-day delivery, agent-father with factory skill)
