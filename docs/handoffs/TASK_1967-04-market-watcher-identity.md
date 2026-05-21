# Handoff — TASK_1967-04: market-watcher identity recurrence

**Task:** 1967-04 | **Sprint:** 1967c | **Severity:** HIGH | **Size:** S

---

## Summary

market-watcher exhibits intermittent self-refusal after the 1963-MW-IDENTITY fix. Pattern: SUCCESS→SILENT→FAILURE every alternate cowork cycle. The fix (context promotion + identity assertion) did not address the root cause structurally; it survives only as long as prompt context is complete.

---

## Evidence

**Brief cross-link:** `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md` § ITEM-04

**Repro path:line:** `docs/signals/processed/cowork-team-20260521T163840Z.json:won_slots=[market-watcher-prepost]` (SUCCESS) → `T165007Z:silent=true` → `T170504Z:won=[market-watcher-prepost]` (FAILURE: "cannot directly call MCP tools through the gateway")

**Pattern:** Two consecutive cowork cycles with market-watcher-prepost slot; first succeeds, second fails with self-refusal

**Root cause (from brief):** Model-level context construction at spawn relies on always_load + notebook size. If market-watcher notebook exceeds ≤200L cap, tail of always_load content is truncated on haiku context limit. Identity self-check is not idempotent.

---

## Current Behavior

- Cowork cycle N: market-watcher runs successfully, emits price_anomaly signals
- Cowork cycle N+1: market-watcher rejects own flow, claims "cannot directly call MCP tools through the gateway"
- Session log shows: "I am Claude Haiku. I do not have direct MCP tool access. You must use the gateway."
- Pattern repeats every alternate cycle

---

## Expected Behavior

- market-watcher executes flow end-to-end on every cowork cycle
- No self-refusal errors
- Consistent identity anchoring across multiple spawn instances
- No cyclic pattern (SUCCESS/FAILURE alternation)

---

## Proposed Fix

**Comprehensive 3-part structural fix:**

1. **Enforce ≤150L market-watcher notebook** — archive old cycles to `docs/archive/notebooks/market-watcher-<date>.md`, keep ≤150L active
2. **Add explicit identity assertion in market-watcher flow Step 0:**
   ```
   assert: I am market-watcher. I call tools via call_tool(server="vn-market")
   ```
3. **agent-father adds notebook size guard** — automated warning if notebook exceeds 150L at end of cycle

**Zone:** 
- `.claude/agents/market-watcher.md` (YAML identity stanza strength check)
- `.claude/flows/market-watcher/cycle.md` (Step 0 identity assertion)
- `docs/agent-memory/notebooks/market-watcher.md` (archive + trim to ≤150L)
- `docs/agents/system-auditor/audit-dimensions.md` (add D-N: notebook-size guard)

**Blast radius:** Every second market-watcher cycle is a wasted spawn (1 skipped per cowork tick = ~1h of missed price anomaly detection per day)

**Dependency chain:** None — standalone fix

---

## Acceptance Criteria

1. [ ] market-watcher notebook trimmed to ≤150L (old content archived to docs/archive/notebooks/)
2. [ ] market-watcher YAML identity stanza strengthened with explicit mcp_tool_capability
3. [ ] market-watcher cycle.md Step 0 includes "assert: I am market-watcher. I call tools via call_tool(server=\"vn-market\")"
4. [ ] market-watcher runs successfully on 2 consecutive cowork cycles post-fix (no SILENT or FAILURE)
5. [ ] system-auditor notebook-size dimension added (warning if >150L)
6. [ ] tsc 0 errors

---

## Owner & Zone

- **Dev agent:** agent-father
- **Zone:** `.claude/agents/`, `.claude/flows/market-watcher/`, `docs/agent-memory/notebooks/`
- **Model:** claude-haiku-4-5-20251001

---

## Related

- 1963-MW-IDENTITY (pre-existing fix, symptom-level only)
- ITEM-05 (market-watcher cycle.md append/overwrite drift, same PR candidate)
- REQ-1967-2c (market-watcher identity recurrence)
