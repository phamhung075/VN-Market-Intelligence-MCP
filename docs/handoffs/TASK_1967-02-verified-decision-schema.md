# Handoff — TASK_1967-02: verified_decision / signal_feedback signal types

**Task:** 1967-02 | **Sprint:** 1967c | **Severity:** HIGH | **Size:** S

---

## Summary

The signal types `verified_decision` and `signal_feedback` are documented in alert-commander capabilities but absent from the `post_agent_signal` MCP tool enum. This breaks cross-agent chain de-duplication and acknowledgment mechanics.

---

## Evidence

**Brief cross-link:** `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md` § ITEM-02

**Repro path:line:**
- `docs/standards/mcp-tools.md:130-144` — signal_type table does NOT include `verified_decision` or `signal_feedback`
- `.claude/tools/list/post_agent_signal.md:25` — enum exhaustive, neither present
- alert-commander capabilities stanza says "Emit suppress and verified_decision signals back to all cowork agents"

---

## Current Behavior

- Alert-commander post cycle: `post_agent_signal(signal_type="verified_decision")` → rejected by enum validation
- news-scout and market-watcher never receive verified acks
- Cross-agent suppress/verify chain breaks

---

## Expected Behavior

Either:
- **Option A (additive):** Add `verified_decision` to enum in MCP schema
- **Option B (canonical):** Update alert-commander flow + capabilities to use `suppress` as canonical ack and deprecate `verified_decision` (preferred — smaller enum surface)

---

## Proposed Fix

**Recommendation:** Option B (smaller surface, cleaner schema)

**Zone:** 
- dev-mcp-server (if Option A: schema update in agentSignalTools.ts)
- agent-father (if Option B: alert-commander flow + capabilities doc update)

**Fix surface:** 
- Option A: agentSignalTools.ts Zod enum + post_agent_signal.md tool doc
- Option B: `.claude/agents/alert-commander.md` capabilities stanza + `.claude/flows/cowork/alert-commander/cycle.md` signal emission step

**Blast radius:** Cross-agent suppress/verify ack chain broken; news-scout and market-watcher never receive verified acks

**Dependency chain:** None — standalone fix (though decision requires architect/PO alignment on A vs B)

---

## Acceptance Criteria

### Option A:
1. [ ] Zod enum in MCP schema accepts `verified_decision` (and optionally `signal_feedback`)
2. [ ] post_agent_signal.md tool doc updated to list both signals
3. [ ] alert-commander can emit `post_agent_signal(signal_type="verified_decision")` without error
4. [ ] Unit test covering enum value
5. [ ] tsc 0 errors

### Option B:
1. [ ] alert-commander capabilities stanza updated: `verified_decision` removed, `suppress` documented as canonical ack
2. [ ] alert-commander cycle.md Step N (signal emission) changed: `signal_type="verified_decision"` → `signal_type="suppress"`
3. [ ] Deprecation note added to capabilities (e.g., "Legacy `verified_decision` replaced by `suppress`")
4. [ ] news-scout + market-watcher flows verified to handle `suppress` signal type
5. [ ] Alert-commander notebook shows successful chain on next cowork cycle pair

---

## Owner & Zone

- **Primary:** dev-mcp-server (Option A) OR agent-father (Option B)
- **Secondary:** agent-father (if Option A: capability doc update)
- **Zone:** apps/mcp-server/ (Option A) OR `.claude/` (Option B)
- **Model:** claude-haiku-4-5-20251001

---

## Decision Needed

**PO/Architect input:** Which option? A (additive enum) or B (consolidate to `suppress`)?

---

## Related

- REQ-1967-1a + REQ-1967-1e (signal_type enum exhaustive, signal feedback)
- ITEM-01 (related alertSource enum gap)
