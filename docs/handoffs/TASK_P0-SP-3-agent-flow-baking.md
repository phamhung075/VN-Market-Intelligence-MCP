---
task_id: "P0-SP-3"
pilot: "stock-price"
phase: "0"
title: "Agent-father: confirm dev-stock-price.md + bake dev-stock-price flow with G12 DoD Gate (agent-father)"
estimate: "1.5h"
owner: "agent-father"
status: "READY"
date: "2026-05-24"
---

# TASK P0-SP-3 — Agent-Father Bake G12 DoD Gate + Flow Rules

## Summary

agent-father confirms (or creates) `.claude/agents/dev-stock-price.md` factory-mode definition and bakes the G12 DoD Gate (dashboard-green-before-RETURN) + CGO/Fence rules into `.claude/flows/dev-stock-price/main.md` at Phase 0, following the proven pattern from technical-analysis + macro-indicators pilots.

This task ensures that from Day 1 of Phase 1 (dev-stock-price's first task), the developer flow enforces: "Do not mark task DONE until sandbox dashboard shows all Go scenarios green."

## Acceptance Criteria

### AC-1: dev-stock-price.md agent file confirmed or created
- [ ] Check if `.claude/agents/dev-stock-price.md` exists (created 2026-05-14 per charter)
- [ ] If exists: verify YAML frontmatter has fields: `name`, `color`, `description`, `tools`, `model`, `zone`
- [ ] If missing: create via agent-md-factory standards:
  - Zone: `apps/stock-price/`
  - Flow: `.claude/flows/dev-stock-price/main.md`
  - Color: green (Go primary, matching macro-indicators)
  - Model: claude-opus (matched to system-map.json specialist)
  - Keywords: `["go", "price-fallback", "ddd", "module"]`
- [ ] Output: agent-stock-price frontmatter passes `yq . .claude/agents/dev-stock-price.md > /dev/null` (valid YAML)

### AC-2: dev-stock-price flow file confirmed or created
- [ ] Check if `.claude/flows/dev-stock-price/main.md` exists (created 2026-05-14 or clone from TA/macro)
- [ ] If missing: create by cloning `.claude/flows/dev-macro-indicators/main.md` with stock-price zone substitutions
- [ ] Confirm flow has standard structure: inputs, outputs, steps (at least error boundary + step-0 setup)

### AC-3: G12 DoD Gate baked into dev-stock-price flow
- [ ] Read the existing G12 DoD rule from `.claude/flows/dev-macro-indicators/main.md` (proven pattern)
- [ ] Identify the exact section: "BEFORE marking task DONE: sandbox-green gate"
- [ ] Clone that section into `.claude/flows/dev-stock-price/main.md`
- [ ] Customize for stock-price: replace `macro-indicators` → `stock-price`, `go run ./cmd/sandbox -tier=all -module=macro-indicators` → `go run ./cmd/sandbox -tier=all -module=stock-price`
- [ ] Verify: flow file includes explicit RETURN block condition: "If sandbox-all-green exit 0 → continue to RETURN. If exit != 0 → escalate blocker."

### AC-4: CGO/Fence rules baked into flow comment block
- [ ] Add a comment block to dev-stock-price flow documenting:
  - Fence-A rule: primitives must build CGO_ENABLED=0
  - Fence-B rule: module must not import infrastructure
  - Fence-C rule: infra (mattn/go-sqlite3) only from cmd/server/main.go
- [ ] Add lazy-load reference: `See docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md §CGO Boundary Clause`

### AC-5: Pre-revert tag protocol documented in flow
- [ ] Add comment block to dev-stock-price flow documenting pre-revert tags:
  - `stock-price-pre-ci` → BEFORE CI/violation work (G4)
  - `stock-price-pre-delete` → BEFORE deletion/deprecation commits (G5)
  - `stock-price-pre-inject` → BEFORE bug injection (G10)
- [ ] Tag protocol: "Create tag at commit BEFORE violation/deletion/injection. No retag, no force, no push. Frozen anchor."

### AC-6: R-CGO gate hard-coded into flow
- [ ] Add explicit check to dev-stock-price flow:
  ```
  Sandbox R-CGO pre-check:
  - Run: CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
  - If exit 0: R-CGO CLEAR, continue
  - If exit != 0: R-CGO BLOCKED, escalate to architect
  - Grep mattn/go-sqlite3 in pkg/primitive+pkg/module+cmd/sandbox:
    - Must return 0 matches
    - If >0 matches: abort task, escalate as BLOCKER
  ```
- [ ] Ensure: this check is documented in flow but NOT executable from dev flow (pre-task, run once at Phase 1 kickoff)

### AC-7: Flow file loads without errors
- [ ] Run: `cat .claude/flows/dev-stock-price/main.md | head -1` (valid markdown)
- [ ] Verify: YAML frontmatter (if present) is valid: `yq . .claude/flows/dev-stock-price/main.md > /dev/null` (exit 0)
- [ ] Verify: no hard-coded paths (all relative to repo root)

## Implementation Guidance

1. **Reference flows:**
   - TA G12 pattern: `.claude/flows/dev-technical-analysis/main.md` (source)
   - Macro proven: `.claude/flows/dev-macro-indicators/main.md` (reference)
2. **Agent-md-factory pattern:** use skill `.claude/skills/agent-md-factory/SKILL.md` for agent file creation (if not present)
3. **Flow cloning order:**
   - Clone macro-indicators flow (most recent + complete)
   - Replace zone names: `macro-indicators` → `stock-price`, `macro` → `stock-price` in context
   - Keep all hard gates + DoD rules verbatim
   - Update CGO-specific sections per stock-price CGO boundary clause
4. **Forbidden modifications:** do NOT edit TA or macro flow files; read-only reference only

## Handoff File Output

**Files:** 
- `.claude/agents/dev-stock-price.md` (confirmed or created)
- `.claude/flows/dev-stock-price/main.md` (confirmed or created with G12 DoD + CGO gates baked)

**dev-stock-price.md structure (YAML frontmatter):**
```yaml
---
name: "dev-stock-price"
color: "green"
description: "Developer specialist for stock-price microservice refactor (Go, DDD, Primitive/Module extraction, 3-tier price fallback)"
zone: "apps/stock-price/"
flow: ".claude/flows/dev-stock-price/main.md"
tools: ["go-lint", "go-test", "go-build"]
model: "claude-opus-4"
---
```

**dev-stock-price/main.md structure (markdown):**
```markdown
---
name: "dev-stock-price"
zone: "apps/stock-price"
trigger: "task dispatch (PM or PO)"
input: ["TASK_NNN.md handoff", "dispatch signal"]
output: ["completion signal docs/signals/dev-stock-price-TASK-done-<UTC>.json"]
---

# dev-stock-price Flow

## Hard Gates (Stock-Price Specific)

### G12 DoD Gate (Dashboard Green Before DONE)
[Clone from macro-indicators flow, customize for stock-price]

### R-CGO Gate (Phase 1 First Task Only)
[Sandbox CGO_ENABLED=0 verification]

### Fence Rules (Comment Block)
[CGO/Fence-A/B/C rules documented]

### Pre-Revert Tag Protocol
[stock-price-pre-ci, stock-price-pre-delete, stock-price-pre-inject documented]

## Steps
[Standard flow steps: setup → run task → verify gates → RETURN]
```

## Constraints

- **L84 explicit-file staging:** 2 files (.md only)
- **No source changes:** flow/agent files only
- **No git push:** local-only
- **Anchor held:** do not create tags during this task
- **Charter reference:** docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md §G12 + §CGO Boundary Clause

## Hard Gates

- [ ] **YAML valid:** `.claude/agents/dev-stock-price.md` passes yq validation
- [ ] **Flow loads:** `.claude/flows/dev-stock-price/main.md` valid markdown + YAML (if frontmatter)
- [ ] **G12 DoD present:** flow includes explicit "sandbox-green before DONE" gate
- [ ] **R-CGO documented:** flow includes R-CGO verification check + hard-gate rules

## RETURN Block

**Signal to emit:** docs/signals/pm-p0-sp3-agent-flow-baking-complete-<UTC>.json
- Status: DONE | BLOCKED
- dev-stock-price.md: CREATED | CONFIRMED
- dev-stock-price/main.md: CREATED | CONFIRMED
- G12 DoD Gate: BAKED
- R-CGO gate: DOCUMENTED
- Pre-revert tags: PROTOCOL-ADDED
- Flow loads: YES
- Next task: PM waits for all 6 Phase 0 deliverables before exit gate

**Expected timeline:** 2026-05-24 (same-day delivery, agent-father)
