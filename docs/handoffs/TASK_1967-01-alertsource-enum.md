# Handoff — TASK_1967-01: alertSource enum gap (legal_risk + crisis_velocity)

**Task:** 1967-01 | **Sprint:** 1967c | **Severity:** HIGH | **Size:** XS

---

## Summary

The `alertSource` Zod enum in the MCP tool `write_alert_verdict` is missing two documented signal types: `legal_risk` and `crisis_velocity`. This causes alert-commander to silently degrade when emitting these signals — they are rejected at schema validation and fall back to an incorrect fallback type.

---

## Evidence

**Brief cross-link:** `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md` § ITEM-01

**Repro path:line:** `.claude/tools/list/write_alert_verdict.md:19` — enum list incomplete

**Notebook evidence:** alert-commander cycles 2026-05-20T04:37Z + 2026-05-21T04:39Z confirmed rejection fallback

---

## Current Behavior

- Alert-commander attempts: `write_alert_verdict(alertSource="legal_risk")`
- Server rejects with enum violation
- Agent silently falls back to `urgent_news` (wrong classification)
- Downstream analytics (alertSource distribution) is corrupted

---

## Expected Behavior

- Both `legal_risk` and `crisis_velocity` are recognized as valid alertSource enum values
- alert-commander can emit either signal type without fallback
- Schema validation passes
- Analytics downstream see correct signal classifications

---

## Proposed Fix

**Zone:** `apps/mcp-server/` (agentSignalTools.ts or equivalent)

**Fix surface:** Add `legal_risk` and `crisis_velocity` to alertSource Zod enum definition

**Blast radius:** All alert-commander `legal_risk` verdicts are currently mis-classified; analytics corrupted

**Dependency chain:** None — standalone fix

---

## Acceptance Criteria

1. [ ] Zod enum in MCP schema accepts both `legal_risk` and `crisis_velocity`
2. [ ] alert-commander flow can emit `write_alert_verdict(alertSource="legal_risk")` without error
3. [ ] MCP tool call succeeds with 200 / accepted response
4. [ ] Unit test added covering both enum values
5. [ ] tsc 0 errors, regression tests pass

---

## Owner & Zone

- **Dev agent:** dev-mcp-server
- **Zone:** apps/mcp-server/
- **Model:** claude-haiku-4-5-20251001

---

## Related

- REQ-1967-1a (signal_type enum exhaustive)
- 1964-AC-ENUM (pre-existing TASKS.md row, waiting on watchdog-4 unlock 2026-05-22T21:00Z)
