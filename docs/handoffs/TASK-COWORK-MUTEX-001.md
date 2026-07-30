---
sprint: COWORK-DISPATCH-ROUTER-INTENT-MUTEX
task_id: TASK-COWORK-MUTEX-001
branch: task/cowork-mutex-001-collision-probe-core
size: M
zone: cross-service/
depends_on: []
blocks: [TASK-COWORK-MUTEX-002, TASK-COWORK-MUTEX-003]
---

## TLDR

Implement Step 2.4 Cowork-Slot Cross-Path Collision Probe in dispatch-claim/SKILL.md (FR-1: recognize cowork-slot agents; FR-2: resolve intent-key→slot_id with fallback; FR-3: read-probe published:<slot_id>: via task_list_held; FR-4: symmetric log/telegram/EXIT). Update CLAUDE.md phase list (1-line diff). Fix doc-sync on task_list_held.md. All must land in ONE commit per FR-6.

## [PM] Planning Context

- **Zone:** cross-service/ (dispatch protocol layer, not a microservice zone)
- **Acceptance Criteria:**
  - [ ] `.claude/skills/dispatch-claim/SKILL.md` § Pattern updated with new Step 2.4 section inserted between Phase A.5 and Phase B
  - [ ] Step 2.4 recognizes cowork-slot agents via `cowork-schedule.json` `.slots[].agent` (9 agents: unified-agent, digest-predict, tran-ngoc-bau, bctc-analyst, news-scout, market-watcher, refine_bctc_md, fb-market-poster, alert-commander)
  - [ ] FR-2 implementation: intent-key-IS-slot_id resolves to single target; otherwise ALL-SLOTS conservative fallback (loops `jq '[.slots[] | select(.agent==$a) | .slot_id]'`)
  - [ ] FR-3 collision check: `task_list_held(kind="cowork-slot", expired=false)` called once, client-side filter on `task_id` == "cowork-slot:" + slot_id OR starts with "published:" + slot_id + ":"
  - [ ] FR-4 response reuses exact peer-collision telegram/log/EXIT text from existing Phase B
  - [ ] FR-5 verified: non-cowork agents bypass Step 2.4 entirely (no behavior change)
  - [ ] CLAUDE.md § "BEFORE spawning any agent" phase-list line updated to mention Step 2.4 (1-line diff only, no re-paste)
  - [ ] `docs/agents/tools/list/task_list_held.md` updated: document `expired` parameter (non-blocking doc-sync)
  - [ ] Single commit: both SKILL.md and CLAUDE.md changes land together (git show --name-only confirms both files modified)
  - [ ] Commit message includes "FR-6: lockstep CLAUDE.md/SKILL.md update" trailer or note
  - [ ] All tests in existing suite pass (no new tests in this task — test harness is TASK-COWORK-MUTEX-002)

- **Files to read first:**
  - `docs/handoffs/FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS-BA-spec.md` § FRs 1-6
  - `docs/architecture-briefs/2026-07-29-fix-cowork-dispatch-router-intent-mutex-bypass-design.md` § Ruling + File-level design (items 1-2)
  - `.claude/skills/dispatch-claim/SKILL.md` § Pattern (current Phase A.5 and Phase B structure)
  - `CLAUDE.md` § "BEFORE spawning any agent — MANDATORY" (phase-list target)
  - `docs/data/cowork-schedule.json` (SSOT for agent→slot_id mapping, lines ~3-50 for `.slots[]` structure)
  - `docs/agents/tools/list/task_list_held.md` (tool schema, `expired` param)

- **Files to create:** None

- **Files to modify:**
  - `.claude/skills/dispatch-claim/SKILL.md` — add § Step 2.4 section (new subsection, ~40-50L)
  - `CLAUDE.md` — 1-line update to phase-list in § "BEFORE spawning any agent — MANDATORY" (line 2.5 reference)
  - `docs/agents/tools/list/task_list_held.md` — add 1-2 lines documenting `expired` parameter in schema section

- **Dependencies:** None (greenfield protocol layer, no implementation depends on it yet)

- **Knowledge needed:**
  - `docs/policies/dev-standards.md` — commit convention (FR-6 lockstep)
  - `docs/handoffs/FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS-BA-spec.md` — full context
  - `docs/architecture-briefs/2026-07-29-fix-cowork-dispatch-router-intent-mutex-bypass-design.md` § Ruling (why Candidate A, not B)
  - `docs/data/cowork-schedule.json` — agent→slot_id mapping (read-only input)
  - Occurrence 3 raw proof at board row's own note (2026-07-21T20:25:14Z) — reference for test case design in Task 2

## Edge Cases & Constraints

**FR-6 (lockstep):** Both CLAUDE.md and SKILL.md changes MUST land in the same commit, or the phase-list pointer becomes stale and silently disables Step 2.4 on the next router session that reads CLAUDE.md.

**FR-5 (non-cowork agents):** Non-cowork agents must see zero behavior change. Implement as a short-circuit: if agent not in COWORK_AGENTS → skip Step 2.4, proceed to Phase B. Verify byte-identical dispatch logs for a non-cowork agent (ba, po, qa, etc.) before marking AC-6 DONE.

**EC-2 (daily vs weekly slots):** The probe does NOT compute exact period-keys (that's the point — zero date-basis duplication). It just prefix-matches "published:<slot_id>:" — this is correct because both daily (`published:tnb-audit:<date>`) and weekly (`published:tnb-audit:<iso_week>`) keys start with the same prefix, so one probe catches both. No date logic needed at router layer.

**Performance:** `task_list_held(kind="cowork-slot", expired=false)` is ONE call per dispatch, not per-slot. The router gets back ALL live cowork-slot locks in one round trip, then filters client-side. Cost is sub-10ms even with all 23 slots live (confirmed by reading coordinationStore.ts:794-835). No batching optimizations needed.

**Doc-sync note:** `expired` parameter already exists and works in the live tool (coordinationTools.ts:234-240). The doc-update is to surface it so future maintainers know it's there and available for this use case.

## Test Strategy

This task does NOT include new tests — it defines the interface that TASK-COWORK-MUTEX-002's test harness will validate. Verification of core logic (Step 2.4's recognition + resolution + probe + exit) is deferred to FR-7 (task 002). This task focuses on correctness of the implementation itself (AC checks above).

## RETURN
DONE: Step 2.4 implemented, CLAUDE.md pointer updated, doc-sync complete, single commit verified.
NEXT: TASK-COWORK-MUTEX-002 (test harness, depends on this task's interface).
