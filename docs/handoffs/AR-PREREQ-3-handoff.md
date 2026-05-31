# AR-PREREQ-3 — Remove In-Container bctcRefineJob Cron (dev-mcp-server)

**Sprint:** BCTC-AGENTIC-REFINE | **Owner:** dev-mcp-server | **Date:** 2026-05-30  
**Status:** READY | **Blocker:** None | **Blocks:** AR-MCP-OPTY (same-file serialization)  
**Severity:** CRITICAL (active failure loop)

---

## Summary

**THE PROBLEM (from §0.7.1 runtime diagnosis):**

The `bctcRefineJob` cron entry in `cronConfig.ts` and its execution registration in `startScheduler.ts` are actively failing on every cron tick. The orchestrator attempts `spawn("claude", [...])` but the `claude` CLI binary does NOT exist in the mcp-server container. Every spawn fails with `ENOENT` (exit -2). The orchestrator then marks every report `refine_status='FAILED'` on every tick — a live failure loop corrupting the DB.

**THE FIX:**

Remove the `bctcRefineJob` cron definition from `cronConfig.ts` and its registration from `startScheduler.ts`. The orchestration moves OUT of mcp-server to the host-level fleet cron (Option Y, §0.7.2 ruling). This is a pure deletion task — no new code.

**Impact:** Stops the failure loop immediately. Allows AR-MCP-OPTY (new tools) and fleet cron to be wired cleanly without interference from the dead in-container job.

---

## Acceptance Criteria

### AC-PREREQ-3-1: cronConfig.ts — Remove bctcRefineJob Key

**File:** `apps/mcp-server/src/scheduler/cronConfig.ts`

- [ ] Delete the `bctcRefineJob` entry (lines 178-182 in current state) from the `CRONS` object.
- [ ] **Verify:** `grep "bctcRefineJob" cronConfig.ts` returns empty after deletion.
- [ ] **Verify:** `grep "CRON_BCTC_REFINE_JOB" cronConfig.ts` returns empty (no env var reference).

### AC-PREREQ-3-2: startScheduler.ts — Remove Registration

**File:** `apps/mcp-server/src/scheduler/startScheduler.ts`

- [ ] Locate the `bctcRefineJob` registration (typically in a `cron.schedule(CRONS.bctcRefineJob, ...)` block).
- [ ] Delete the cron schedule registration and any associated import of the `bctcRefineJob` handler (e.g., `import { runBctcRefineJob } from "./financial-reports/bctcRefineJob.js"`).
- [ ] **Verify:** `grep -r "bctcRefineJob\|runBctcRefineJob" apps/mcp-server/src/scheduler/startScheduler.ts` returns empty.

### AC-PREREQ-3-3: Clean Build

- [ ] Run `npm run build` (or `bun build`) in `apps/mcp-server/` — should pass with no errors.
- [ ] Run tests: `npm run test` in mcp-server. All tests pass.
- [ ] No lingering `bctcRefineJob` or `CRON_BCTC_REFINE_JOB` references in compiled output.

---

## Files to Modify / Delete

| File | Action | Reason |
|---|---|---|
| `apps/mcp-server/src/scheduler/cronConfig.ts` | Delete key | Remove `bctcRefineJob` entry from `CRONS` object |
| `apps/mcp-server/src/scheduler/startScheduler.ts` | Delete registration | Remove cron schedule + import |

---

## Implementation Notes

### cronConfig.ts Changes

Current state (lines 178-182):
```typescript
  bctcRefineJob:              Bun.env.CRON_BCTC_REFINE_JOB                          ?? '0 9,14,20 * * *',
```

**Delete these lines entirely.** The cron will be replaced by `.claude/commands/crons/cron-refine-bctc.md` (fleet-level, authored by agent-father in AR-AGENT-A-OPTY).

### startScheduler.ts Changes

Look for:
```typescript
cron.schedule(CRONS.bctcRefineJob, async () => {
  await runBctcRefineJob(db);
});
```

Or variant:
```typescript
const bctcRefineJobToken = scheduler.schedule(CRONS.bctcRefineJob, ...);
```

**Delete the entire block.** Also remove any `import { runBctcRefineJob }` or `import ... from "./financial-reports/bctcRefineJob.js"` related to this cron.

---

## Non-Negotiables

- **No changes to `bctcRefineJob.ts` itself.** This task only removes the CRON registration. The file stays in place — it will be refactored in AR-MCP-OPTY (new tools call it).
- **main branch only.** No feature branches.
- **Explicit `git add <file>`** per file — never `-A`.
- **Two-file commit:** `cronConfig.ts` + `startScheduler.ts` together (same scheduler layer, minimal commit).

---

## Exit Criteria

- [x] `bctcRefineJob` key removed from `CRONS` in `cronConfig.ts`.
- [x] `CRON_BCTC_REFINE_JOB` env var reference removed.
- [x] Cron schedule registration deleted from `startScheduler.ts`.
- [x] No import of `runBctcRefineJob` in `startScheduler.ts`.
- [x] Build passes: `npm run build` succeeds.
- [x] Tests pass: `npm run test` green.
- [x] Zero references to `bctcRefineJob` in scheduler layer (grep confirms).

---

## Related Docs

- Architecture brief: `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md` (§0.7)
- Option-Y ruling: §0.7.2 (host-level fleet cron, mcp-server is pure data service)
- Next: AR-MCP-OPTY (new tools in `bctcRefineJob.ts` — actually used via MCP push tools, not cron)

---

## RETURN

```
TASK: AR-PREREQ-3
STATUS: READY FOR ASSIGNMENT
OWNER: dev-mcp-server
BLOCKER: None
BLOCKS: AR-MCP-OPTY (same-file serialization rule)
ESTIMATED: 0.5 hours (pure deletion, low risk)
NEXT: AR-MCP-OPTY (dev-mcp-server) — creates 3 new tools, uses helpers in bctcRefineJob.ts
```
