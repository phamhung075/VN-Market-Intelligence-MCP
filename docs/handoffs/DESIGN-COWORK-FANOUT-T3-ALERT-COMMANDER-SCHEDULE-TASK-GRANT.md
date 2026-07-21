---
sprint: DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING
task_id: DESIGN-COWORK-FANOUT-T3-ALERT-COMMANDER-SCHEDULE-TASK-GRANT
type: TASK
size: S
zone: apps/mcp-server/
priority: P1
depends_on: []
blocks: [DESIGN-COWORK-FANOUT-T4-ALERT-COMMANDER-RECHECK-LOGIC]
order: tier2b-after-qa
---

## TLDR

alert_commander's SKILL_MANIFEST in agentBootstrap.ts does not grant `schedule_task` tool access today. T4 (alert-commander recheck logic) needs to call schedule_task at runtime to queue a recheck cycle after waiting. Add `schedule_task` to the `SKILL_MANIFEST.alert_commander` array, mirror in docs, and add a companion unit test following existing pattern.

## [PM] Planning Context

**Zone:** apps/mcp-server/

**Prerequisite (Brief §4.5, §F6):** T4 needs to call the `schedule_task` MCP tool to queue a recheck cycle when alert-commander's initial bus read is empty but co-producers were co-dispatched. The tool already exists (`apps/mcp-server/src/interface/mcp/tools/system/scheduledTaskTools.ts`, already swept by cowork-team Step 0b.3 for team="COWORK" targets). But alert_commander's SKILL_MANIFEST (currently lines 115-139 in agentBootstrap.ts) does not include `schedule_task` in its granted tools array — a real, concrete prerequisite for this design.

**Acceptance Criteria:**
- [ ] apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts SKILL_MANIFEST.alert_commander array (currently lines 115-139) includes `"schedule_task"` entry
- [ ] Companion test (following pattern of existing tests like `1872b-alert-commander-skill-manifest.test.ts`) asserts that `getToolsForSkills(["alert_commander"])` resolves a `schedule_task` registration fn
- [ ] Mirror entry in `docs/SKILL_MANIFEST.md` (per its own header comment: "mirrors docs/SKILL_MANIFEST.md JSON block") — update the alert_commander section
- [ ] Mirror entry in `docs/agents/tools/package/alert-commander.md` § Inter-Agent Communication (confirm schedule_task is now listed)
- [ ] Commit message includes: `AC: T3 — alert_commander schedule_task SKILL_MANIFEST grant`

**Files to read first:**
- `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts:115-139` (current SKILL_MANIFEST.alert_commander array)
- `apps/mcp-server/src/__tests__/1872b-alert-commander-skill-manifest.test.ts` (existing test pattern to follow)
- `docs/SKILL_MANIFEST.md` (understand the mirror structure)
- `docs/agents/tools/package/alert-commander.md` (tool list)
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md:128-131` (§4.5: design, tool grant as prerequisite)

**Files to modify:**
- `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts:115-139` (add "schedule_task" to alert_commander SKILL_MANIFEST)
- `docs/SKILL_MANIFEST.md` (mirror the grant)
- `docs/agents/tools/package/alert-commander.md` (update tool list)

**Files to create:**
- `apps/mcp-server/src/__tests__/<name>-alert-commander-schedule-task-grant.test.ts` (companion unit test, follow existing pattern)

**Dependencies:** none on T1-T2 (this is interface/MCP layer, independent of dispatch logic). But must complete before T4 (alert-commander recheck logic) can run at runtime.

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md` (§4.5)
- agentBootstrap.ts SKILL_MANIFEST pattern (understand how tool grants are registered)

**Why Tier 2b and Must Wait for QA:** This is the only task that modifies apps/mcp-server/ code. It must be sequenced after the live qa full-suite run completes (to avoid breaking CI/red-flagging). T1-T5 cannot fully progress until T3 completes (T4 blocks on T3). PO's stated reason: "T3 is the one strand that touches apps/mcp-server/ and must be sequenced behind the live qa full-suite run, so T1-T5 cannot complete promptly anyway."

---

## Implementation Notes

- The `schedule_task` tool already exists in `scheduledTaskTools.ts`, already has public MCP registration, already routes to cowork agents via Step 0b.3.
- The gap is purely in the SKILL_MANIFEST — alert_commander is not on the list of skills that can call schedule_task. This is a simple array entry addition.
- Follow the exact pattern used for other tools in that same SKILL_MANIFEST array.
- The companion test should mirror the structure of `1872b-alert-commander-skill-manifest.test.ts`: call `getToolsForSkills(["alert_commander"])`, assert that the result includes a `schedule_task` registration function.

---

## Testing (Brief §7, T-1)

- **T-1:** Unit test: `getToolsForSkills(["alert_commander"])` resolves a `schedule_task` registration fn (mirrors `1872b-alert-commander-skill-manifest.test.ts` pattern)
- QA will validate in tier-4 T8 test suite.

---

## Tier Sequencing

- **Tier 2b:** Independent initially, but must wait for qa full-suite run to complete before deployment
- **Blocks:** T4 (alert-commander recheck logic) depends on this at runtime
