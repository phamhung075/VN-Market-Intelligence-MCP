---
sprint: DESIGN-COWORK-FANOUT
task_id: DESIGN-COWORK-FANOUT-T3-ALERT-COMMANDER-SCHEDULE-TASK-GRANT
size: M
zone: apps/mcp-server/src/interface/mcp/bootstrap/
depends_on: []
blocks: [DESIGN-COWORK-FANOUT-T4, DESIGN-COWORK-FANOUT-T8]
gate: "SEQUENCED AFTER LIVE QA FULL-SUITE (touches apps/mcp-server/ — per row constraint)"
---

## TLDR
Grant the `schedule_task` tool to `alert_commander` in the SKILL_MANIFEST bootstrap registry. This is a real, blocking prerequisite for T4 (alert-commander's bounded recheck mechanism). Add `schedule_task` to three places: (1) `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` SKILL_MANIFEST.alert_commander array, (2) mirror in `docs/SKILL_MANIFEST.md`, (3) `docs/agents/tools/package/alert-commander.md`, plus a companion unit test following the `1872b-alert-commander-skill-manifest.test.ts` pattern.

## [PM] Planning Context

**Zone:** `apps/mcp-server/src/interface/mcp/bootstrap/`

**Acceptance Criteria:**
- [ ] `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` lines 115–139 (SKILL_MANIFEST.alert_commander array) now includes `"schedule_task"`
- [ ] `docs/SKILL_MANIFEST.md` mirrors the update (per file's own header comment)
- [ ] `docs/agents/tools/package/alert-commander.md` § Inter-Agent Communication includes `schedule_task` in the tool list
- [ ] Unit test `apps/mcp-server/src/__tests__/1872b-alert-commander-skill-manifest.test.ts` (existing prior-art pattern) is mirrored: `getToolsForSkills(["alert_commander"])` resolves a `schedule_task` registration fn
- [ ] Live qa full-suite run passes (this task touches app code, must verify CI clean)

**Rationale:**
- Fixes F6 gap from brief: `schedule_task` is public, already routes to cowork agents, already wired in dispatcher's one-shot sweeper (cowork-team Step 0b.3)
- This grant is a **blocking prerequisite**: without it, T4's `schedule_task` call will fail at runtime
- Existing prior art: `dev_team` and `unified_coordinator` already have this grant; gap is alert-commander only
- No new tool implementation needed; grant is additive to existing tool already in production

**Files to read first:**
- `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` (current alert_commander SKILL_MANIFEST, compare dev_team/unified_coordinator for reference)
- `apps/mcp-server/src/__tests__/1872b-alert-commander-skill-manifest.test.ts` (existing test pattern to mirror)
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md` § F6 § 4.5 (gap detail + prerequisite explanation)

**Files to modify:**
- `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` (add `schedule_task` to alert_commander SKILL_MANIFEST array)
- `docs/SKILL_MANIFEST.md` (mirror the change)
- `docs/agents/tools/package/alert-commander.md` (add tool to documentation)
- `apps/mcp-server/src/__tests__/1872b-alert-commander-skill-manifest.test.ts` (add new test case or extend existing)

**Files to create:**
- Optional: `apps/mcp-server/src/__tests__/1872b-alert-commander-schedule-task-grant.test.ts` (if modularizing; existing pattern also shows adding to existing test file)

**Dependencies:**
- None on T1–T5 or T6
- GATE: Must sequence after today's live qa full-suite run completes (touches app code)
- Blocks T4 (T4 calls `schedule_task`)
- Blocks T8 (QA gate: T-1 test verifies this)

**Knowledge needed:**
- `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` SKILL_MANIFEST structure
- Existing test pattern in `1872b-alert-commander-skill-manifest.test.ts`
- Brief § F6 § 4.5 (gap detail + why it's blocking)
- Standard tool-grant procedure (straightforward array addition + doc sync)
