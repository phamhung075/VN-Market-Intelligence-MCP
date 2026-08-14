---
sprint: FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT
branch: task/FIX-SIGNALQUEUE-UNIFIED-AGENT-CONSUMER
size: S
zone: unified-agent
depends_on:
  - FIX-SIGNALQUEUE-PUSH-SPAWN-FANOUT-MECHANISM
blocks: []
---

## TLDR
Add minimal consumption step (Step 0.3) to unified-agent/flow/chef.md to parse and apply CROSS-TEAM SIGNAL blocks injected by cowork-team's spawn-fanout push. For methodology-flag type: treat as authoritative correction overriding any hardcoded rule this cycle. Other types: log receipt only. Block absent or empty: no-op.

## [PM] Planning Context

**Zone:** unified-agent

**Origin:** Architect ruling (HYBRID approach) — Component B Part 1 in `docs/architecture-briefs/2026-08-07-fix-signalqueue-receiver-delivery-contract.md` § 4

**Acceptance Criteria:**
- [ ] AC-1: `docs/agents/unified-agent/flow/chef.md` new **Step 0.3 — Cross-team signal consumption**, inserted between Step 0 (Bootstrap) and Step 0.5 (Published Marker Gate)
- [ ] AC-2: Step 0.3 logic:
  - If entry prompt contains `## CROSS-TEAM SIGNAL` block: parse it (markdown list format, fields: id, from, type, severity, summary)
  - For each row with `type=methodology-flag`: treat text as authoritative correction, log `"[unified-agent] applied cross-team signal <id> from <from> (methodology-flag): <correction>"` and recompute the hardcoded rule value (e.g., gold threshold) live instead of pasting literal value from hardcode
  - For other signal types: log receipt only `"[unified-agent] received cross-team signal <id> from <from> (type=<type>) — handler not yet defined, see reference.md § Receiver Delivery Mechanism"` (future extensibility hook)
  - Block absent or empty: no-op, proceed to Step 0.5 exactly as today
- [ ] AC-3: Logging goes to the **Step 8b notebook append** (same location where published-marker results log), so the signal application is recorded in the session record
- [ ] AC-4: NO new MCP tool calls introduced (no task_claim, no task_release, no task_heartbeat — cowork-team handles all locking centrally)
- [ ] AC-5: NO activation of dormant `task_claim`/`task_release` wiring in the tool package (Phase 2 gates remain, no new live calls)
- [ ] AC-6: Single-file change (chef.md only; no changes to init.md, no changes to tool package, no new skills)
- [ ] AC-7: Update `docs/agents/unified-agent/init.md` `inter_agent` section: add entry `receives_from: {agent: cowork-team, mechanism: signal_queue_push, signal_type: [methodology-flag], trigger: scheduled_slot_fire}` (closes the frontmatter gap where this path was not documented)
- [ ] AC-8: Test verification — post a test signal row with `type=methodology-flag` and `to=unified-agent`, trigger next scheduled chef-* slot, verify:
  - ENTRY_PROMPT contains the CROSS-TEAM SIGNAL block
  - Step 0.3 logs the "applied" message
  - Hardcoded rule recomputed live (not pasted literal) for this cycle
  - Step 8b notebook append records the signal application

**Files to read first:**
- `docs/architecture-briefs/2026-08-07-fix-signalqueue-receiver-delivery-contract.md` (full context + Component B design)
- `docs/agents/unified-agent/flow/chef.md` (structure, where Step 0.3 inserts, logging pattern)
- `docs/agents/unified-agent/init.md` (inter_agent section, where to add receives_from entry)
- `docs/agents/dev-team/flow/drain-signals.md` (reference: how other agents consume signals)
- `docs/agents/tran-ngoc-bau/flow/bootstrap.md` § 0b-DASH (reference: alternative pull pattern)
- `.claude/skills/signal-dashboard/reference.md` § Receiver Delivery Mechanism (will be created by Task 2)

**Files to create:**
- None (modifications only)

**Files to modify:**
- `docs/agents/unified-agent/flow/chef.md` — new Step 0.3 (parse CROSS-TEAM SIGNAL, apply methodology-flag corrections, log)
- `docs/agents/unified-agent/init.md` — `inter_agent.receives_from` entry (documents the signal_queue_push path)

**Dependencies:**
- FIX-SIGNALQUEUE-PUSH-SPAWN-FANOUT-MECHANISM (Task 1) — push mechanism must exist before consumer can be tested
- Soft dependency on FIX-SIGNALQUEUE-SIGNAL-DASHBOARD-DOCS (Task 2) — documentation should be in place for developer reference, but implementation does not depend on it

**Knowledge needed:**
- `docs/architecture-briefs/2026-08-07-fix-signalqueue-receiver-delivery-contract.md` (design context + Component B pattern)
- `docs/agents/unified-agent/flow/chef.md` (current structure, logging pattern)
- `docs/policies/dev-standards.md` § Logging Convention

## [Developer] Implementation Notes

### Step 0.3 logic pseudo-code
```
def consume_cross_team_signals():
  if "## CROSS-TEAM SIGNAL" not in entry_prompt:
    return  # no-op
  
  signals = parse_markdown_list(extract_signal_block(entry_prompt))
  for signal in signals:
    if signal.type == "methodology-flag":
      log(f"[unified-agent] applied cross-team signal {signal.id} from {signal.from} (methodology-flag): {signal.summary}")
      apply_correction(signal.text)  # override hardcoded rule, recompute live
    else:
      log(f"[unified-agent] received cross-team signal {signal.id} from {signal.from} (type={signal.type}) — handler not yet defined")
```

### Markdown block format
The CROSS-TEAM SIGNAL block is generated by spawn-fanout.md Step 5.2b and looks like:
```
## CROSS-TEAM SIGNAL
- id=signal-123 from=po type=methodology-flag severity=HIGH :: Override L6 token literal, compute from live gold
- id=signal-124 from=news-scout type=market-alert severity=MEDIUM :: Check VNM dividend announcement
```

Parser should extract the entire block between the header and the next `##` section (or end of prompt), split by `-` lines, and extract fields.

### Logging style
Use the same format as other chef.md steps (e.g., published-marker results):
```
[unified-agent] applied cross-team signal <id> from <from> (type): <summary>
```

All logs go to Step 8b notebook append (the final step that persists the session record).

### Hardcoded rule override example
**Before (hardcoded):**
```
L6_GOLD_THRESHOLD = 4300  # literal, never changes
```

**After (with methodology-flag correction):**
```
if cross_team_signal_overrides["L6_gold_threshold"]:
  L6_GOLD_THRESHOLD = fetch_live_gold_price() * 0.98  # recomputed live
else:
  L6_GOLD_THRESHOLD = 4300
```

The methodology-flag is an instruction to do this recomputation, not a literal value — the brief's repro fixture (po-20260720T052606) is evidence that this distinction matters.

### Test scenario
1. Create test signal row in `.signal_queue.rows[]`: `{id: "test-sig-001", from: "po", to: "unified-agent", type: "methodology-flag", status: "NEW", summary: "Override L6 token — compute from live gold", ...}`
2. Trigger next chef-morning/chef-intraday spawn (or manually invoke spawn-fanout)
3. Verify:
   - spawn-fanout logs show signal row was claimed and marked READ
   - chef.md Step 0.3 logs show signal was applied
   - Step 8b notebook records the correction
   - L6 threshold recomputed live, not pasted literal

---

## Sibling coordination note

This task is tier2, depends on Task 1 (spawn-fanout push mechanism). Task 4 (alert-commander consumer) is parallel and independent. Both should land shortly after Task 1 to close the delivery loop. No file overlap with Task 4, no inter-task dependencies.
