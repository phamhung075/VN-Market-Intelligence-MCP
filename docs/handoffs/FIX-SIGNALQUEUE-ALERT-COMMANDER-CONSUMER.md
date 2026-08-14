---
sprint: FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT
branch: task/FIX-SIGNALQUEUE-ALERT-COMMANDER-CONSUMER
size: S
zone: alert-commander
depends_on:
  - FIX-SIGNALQUEUE-PUSH-SPAWN-FANOUT-MECHANISM
blocks: []
---

## TLDR
Add minimal consumption step to alert-commander/flow/cycle.md to parse and log CROSS-TEAM SIGNAL blocks injected by cowork-team's spawn-fanout push. For methodology-flag type: treat as authoritative correction. Other types: log receipt only. Block absent or empty: no-op.

## [PM] Planning Context

**Zone:** alert-commander

**Origin:** Architect ruling (HYBRID approach) — Component B Part 2 in `docs/architecture-briefs/2026-08-07-fix-signalqueue-receiver-delivery-contract.md` § 4

**Acceptance Criteria:**
- [ ] AC-1: `docs/agents/alert-commander/flow/cycle.md` new consumption block inserted **before the Firing Gate section** (exact insertion point: just before the section that decides which sub-flows to invoke for this cycle)
- [ ] AC-2: Block logic (identical to unified-agent Component B Part 1):
  - If entry prompt contains `## CROSS-TEAM SIGNAL` block: parse it
  - For each row with `type=methodology-flag`: treat as authoritative correction, log `"[alert-commander] applied cross-team signal <id> from <from> (methodology-flag): <correction>"`
  - For other types: log receipt only `"[alert-commander] received cross-team signal <id> from <from> (type=<type>) — handler not yet defined"`
  - Block absent or empty: no-op, proceed exactly as today
- [ ] AC-3: Logging goes to **Step 5 notebook append** (alert-commander's existing notebook step, where cycle results are recorded)
- [ ] AC-4: NO new MCP tool calls (no task_claim, no task_release — cowork-team handles locking)
- [ ] AC-5: NO activation of dormant `task_claim`/`task_release` wiring
- [ ] AC-6: Single-file change (cycle.md only; no changes to init.md, no changes to tool package, no new skills)
- [ ] AC-7: Update `docs/agents/alert-commander/init.md` `inter_agent` section: add entry `receives_from: {agent: cowork-team, mechanism: signal_queue_push, signal_type: [methodology-flag], trigger: scheduled_slot_fire}` (closes the frontmatter gap)
- [ ] AC-8: Test verification — post a test signal row with `type=methodology-flag` and `to=alert-commander`, trigger next scheduled slot (≤15min during market hours), verify:
  - ENTRY_PROMPT contains the CROSS-TEAM SIGNAL block
  - cycle.md parses and logs the signal
  - Step 5 notebook append records the signal receipt
  - Correction applied if methodology-flag (handler logic TBD at definition time, not required here — only log and document the extension point)

**Files to read first:**
- `docs/architecture-briefs/2026-08-07-fix-signalqueue-receiver-delivery-contract.md` (full context + Component B design)
- `docs/agents/alert-commander/flow/cycle.md` (structure, where consumption step inserts, firing-gate section location, logging pattern)
- `docs/agents/alert-commander/init.md` (inter_agent section, where to add receives_from entry)
- `docs/agents/unified-agent/flow/chef.md` (reference: Component B Part 1 pattern, for consistency)
- `.claude/skills/signal-dashboard/reference.md` § Receiver Delivery Mechanism (will be created by Task 2)

**Files to create:**
- None (modifications only)

**Files to modify:**
- `docs/agents/alert-commander/flow/cycle.md` — new consumption block (parse CROSS-TEAM SIGNAL, apply methodology-flag corrections, log)
- `docs/agents/alert-commander/init.md` — `inter_agent.receives_from` entry (documents the signal_queue_push path)

**Dependencies:**
- FIX-SIGNALQUEUE-PUSH-SPAWN-FANOUT-MECHANISM (Task 1) — push mechanism must exist before consumer can be tested
- Soft dependency on FIX-SIGNALQUEUE-SIGNAL-DASHBOARD-DOCS (Task 2) — documentation reference
- **No dependency on Task 3 (unified-agent)** — can land in parallel, implementation is independent

**Knowledge needed:**
- `docs/architecture-briefs/2026-08-07-fix-signalqueue-receiver-delivery-contract.md` (design context + Component B pattern)
- `docs/agents/alert-commander/flow/cycle.md` (current structure, logging pattern, firing-gate section)
- `docs/policies/dev-standards.md` § Logging Convention

## [Developer] Implementation Notes

### cycle.md insertion point
The alert-commander/flow/cycle.md is deliberately minimal (`no_cycle_headers: true`). The consumption step should:
1. Not add cycle headers (respect the existing minimalism)
2. Insert **before the Firing Gate section** (the section that decides which of the 3 sub-flows to invoke)
3. Use the existing Step 5 notebook append for logging

### Consumption logic (pseudocode)
```
def consume_cross_team_signals():
  if "## CROSS-TEAM SIGNAL" not in entry_prompt:
    return  # no-op
  
  signals = parse_markdown_list(extract_signal_block(entry_prompt))
  for signal in signals:
    if signal.type == "methodology-flag":
      log(f"[alert-commander] applied cross-team signal {signal.id} from {signal.from} (methodology-flag): {signal.summary}")
      # Actual correction logic TBD — for now, document the extension point
      # apply_correction(signal.text)  # placeholder for future handlers
    else:
      log(f"[alert-commander] received cross-team signal {signal.id} from {signal.from} (type={signal.type}) — handler not yet defined")
```

### Logging style
Consistent with alert-commander's own pattern and the unified-agent Task 3 implementation:
```
[alert-commander] applied cross-team signal <id> from <from> (type): <summary>
[alert-commander] received cross-team signal <id> from <from> (type=<type>) — handler not yet defined
```

All logs go to Step 5 notebook append.

### Markdown block format
Same as unified-agent (generated by spawn-fanout.md Step 5.2b):
```
## CROSS-TEAM SIGNAL
- id=signal-123 from=po type=methodology-flag severity=HIGH :: Override threshold, compute from live data
```

### Test scenario
1. Create test signal row: `{id: "test-sig-002", from: "po", to: "alert-commander", type: "methodology-flag", status: "NEW", ...}`
2. Trigger next scheduled alert-commander slot (alert-commander fires every 15min during market hours)
3. Verify:
   - spawn-fanout logs show signal was claimed and marked READ
   - cycle.md Step 5 logs show signal was received/applied
   - Notebook append records the signal event

### Insertion location example
In cycle.md, the structure is typically:
```
Step 1: Setup
Step 2: Read market data
...
Step 4: Decide which sub-flows to fire (Firing Gate)
Step 5: Invoke sub-flows + append notebook
```

The consumption step should be:
```
Step 0.5: Consume CROSS-TEAM SIGNAL block (if present)
Step 1: Setup
...
Step 4: Firing Gate (unchanged)
Step 5: Invoke sub-flows + append notebook
```

---

## Sibling coordination note

This task is tier2, depends on Task 1 (spawn-fanout push mechanism). Task 3 (unified-agent consumer) is parallel and independent. Both should land shortly after Task 1 to close the delivery loop. No file overlap with Task 3, no inter-task dependencies. Implementation is nearly identical to Task 3 (same parsing/logging pattern), but insertion point differs (cycle.md structure is different from chef.md).
