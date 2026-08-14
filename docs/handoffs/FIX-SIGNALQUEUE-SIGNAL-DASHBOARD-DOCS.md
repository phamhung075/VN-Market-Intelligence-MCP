---
sprint: FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT
branch: task/FIX-SIGNALQUEUE-SIGNAL-DASHBOARD-DOCS
size: S
zone: docs
depends_on: []
blocks: []
---

## TLDR
Update signal-dashboard SKILL and add reference.md section documenting the new hybrid push+pull receiver delivery mechanism (SSOT flag on cowork-schedule slots, push injection at spawn, minimal consumption step in leaf flows). Keep SKILL.md at ≤120L by relocating delivery-mechanism prose to reference.md.

## [PM] Planning Context

**Zone:** docs (`.claude/skills/signal-dashboard/`)

**Origin:** Architect ruling (HYBRID approach) — Component C in `docs/architecture-briefs/2026-08-07-fix-signalqueue-receiver-delivery-contract.md` § 5

**Acceptance Criteria:**
- [ ] AC-1: `.claude/skills/signal-dashboard/SKILL.md` Receivers table gains one-line annotation: *"Delivery mechanism: `po`/`tran-ngoc-bau` self-pull (own flow Step 0b-DASH/pre-check); `unified-agent`/`alert-commander` receive by push injection at scheduled spawn — see reference.md § Receiver Delivery Mechanism."*
- [ ] AC-2: `.claude/skills/signal-dashboard/SKILL.md` stays ≤120 lines (current: 120) — no net growth; any existing text that can relocate to reference.md must be moved to offset the new line
- [ ] AC-3: `.claude/skills/signal-dashboard/reference.md` new section `## Receiver Delivery Mechanism` (after existing reference sections) documents:
  - Distinction between **pull** (po, tran-ngoc-bau) and **push** (unified-agent, alert-commander) mechanisms
  - Explanation of `signal_queue_push` SSOT flag on cowork-schedule.json slots (6 named: chef-morning, chef-intraday, chef-eod, chef-evening, alert-commander-market, alert-commander-critical)
  - Entry-point timing: unified-agent receives signal in ENTRY_PROMPT at next scheduled chef-* slot fire; alert-commander receives at next scheduled slot fire (≤15 min during market hours)
  - Consumption pattern: CROSS-TEAM SIGNAL block in prompt (optional, parsed if present, no-op default), receiver applies type-specific handling (methodology-flag: override hardcoded rule; other types: log only)
  - Lock model: DB-plane only (orch-state.json rows[]) uses existing `dash:signal_queue:<row.id>` task_kind lock; file-plane (docs/signals/*.json) unchanged, out of scope
- [ ] AC-4: `.claude/skills/signal-dashboard/SKILL.md` no structural changes except the one-line annotation (no removal of existing content unless moved to reference.md per AC-2)
- [ ] AC-5: Receivers table Delivery column (if column-format) or inline annotation (if prose format) is consistent with signal-dashboard/reference.md § Receiver Delivery Mechanism prose
- [ ] AC-6: Reference section prose is self-contained and does NOT require reading the full architect brief to understand (brief is background; reference.md stands alone for day-to-day developer use)
- [ ] AC-7: No new dependencies introduced (no new tools, no new signal types, no new flow steps)

**Files to read first:**
- `.claude/skills/signal-dashboard/SKILL.md` (current Receivers table, line count, structure)
- `.claude/skills/signal-dashboard/reference.md` (existing reference sections, style)
- `docs/architecture-briefs/2026-08-07-fix-signalqueue-receiver-delivery-contract.md` § 3 (Component A push design) and § 4 (Component B consumption design)
- `docs/agents/cowork-team/flow/spawn-fanout.md` (where push injection happens, ENTRY_PROMPT composition)
- `docs/agents/unified-agent/flow/chef.md` and `docs/agents/alert-commander/flow/cycle.md` (where consumption step will be added)

**Files to create:**
- None (modifications and content relocation only)

**Files to modify:**
- `.claude/skills/signal-dashboard/SKILL.md` — Receivers table: add one-line annotation, possibly relocate existing content to reference.md to stay ≤120L
- `.claude/skills/signal-dashboard/reference.md` — new `## Receiver Delivery Mechanism` section

**Dependencies:** None (tier1, can land in parallel with Task 1)

**Knowledge needed:**
- `docs/architecture-briefs/2026-08-07-fix-signalqueue-receiver-delivery-contract.md` (full design context + rationale)
- `.claude/skills/signal-dashboard/SKILL.md` (existing structure, line-count discipline)

## [Developer] Implementation Notes

### SKILL.md line-count discipline
Current file is at 120L hard cap. Adding the one-line delivery annotation requires one net new line. Options to stay ≤120L:
1. Consolidate existing Receivers table prose (combine rows, move verbose fields to reference.md)
2. Move non-critical reference content (e.g., old examples, legacy note) to reference.md
3. If annotation must stay in SKILL.md table row, trim another section by 1 line to compensate

Recommend inspecting current file, identifying what can safely move to reference.md (anything that is "background info" rather than "critical hot-path knowledge" is a candidate).

### reference.md section structure
Suggested outline:
```markdown
## Receiver Delivery Mechanism

### Overview
...explain the split between pull and push...

### Pull mechanism (po, tran-ngoc-bau)
- ...where/when they read (flow Step 0b-DASH)...
- ...existing correct behavior, no change...

### Push mechanism (unified-agent, alert-commander)
- ...SSOT flag on cowork-schedule.json...
- ...push happens at spawn-fanout Step 5.2b...
- ...signal injected as CROSS-TEAM SIGNAL block in ENTRY_PROMPT...
- ...latency bound per receiver (unified-agent: next dish window; alert-commander: ≤15min)...

### Lock model
- ...DB-plane (orch-state.json rows[]) uses dash:signal_queue:<row_id> lock...
- ...file-plane (docs/signals/*.json) unchanged...
- ...no contradiction with FIX-DRAIN-FILEPLANE-PEER-COLLISION-GUARD...

### Consumption pattern
- ...CROSS-TEAM SIGNAL block optional (no-op if absent)...
- ...type-specific handling (methodology-flag example: override hardcoded, others: log)...
```

### Verification
1. SKILL.md line count: `wc -l .claude/skills/signal-dashboard/SKILL.md` ≤ 120
2. Receivers table annotation: grep for "push injection" or "receive by push" confirms it's present
3. reference.md section: grep for "Receiver Delivery Mechanism" confirms section exists and is readable

---

## Sibling coordination note

This documentation task is tier1 and can land in parallel with Task 1 (push mechanism). Both Task 3 (unified-agent consumer) and Task 4 (alert-commander consumer) will reference this documentation, so having it in place before they land is helpful (though not strictly required for implementation). No technical dependencies, only documentation clarity.
