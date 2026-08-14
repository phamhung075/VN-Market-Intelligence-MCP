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

---

## [BA] Prior-art triage — 2026-08-14

**Trigger:** row carried `po_prior_art_suspect_20260808T1600Z` — PO suspected this deliverable was
already shipped in `CLAUDE.md`/`dispatch-claim/{CARD,SKILL}.md` and required a diff before any new
work. Router dispatched this row to BA specifically to resolve that, not to re-decompose from the
title.

**Verdict: NOT shipped. Prior-art suspicion REFUTED. Missing sub-behaviour = the entire Step 2.4
mechanism (0% shipped, not partial).** Diffed the 5 cited lines (`CLAUDE.md:14`, `CARD.md:35`,
`SKILL.md:194/288/563`) against the AC list above — all 5 are the pre-existing generic `intent:`
collision pattern (predates this row's 2026-07-30 mint) or unrelated presence/roster mechanisms.
None construct `AGENT_SLOTS`/`TARGET_SLOTS`, none read `cowork-schedule.json`, none probe the
`cowork-slot:`/`published:` keyspace. Full-repo grep for `Step 2.4`/`Cross-Path Collision`/
`COWORK_AGENTS`/`AGENT_SLOTS`/`TARGET_SLOTS` returns zero hits outside planning docs. The FR-7 test
script (`scripts/agents-flow/cowork-dispatch-collision-probe.test.sh`, task 002's deliverable) does
not exist; the `spawn-fanout.md` cross-reference annotation (task 003's deliverable) does not exist
either — both siblings correctly remain `BACKLOG`, `depends: [TASK-COWORK-MUTEX-001]`, dependency
chain coherent.

**This independently re-confirms** `docs/spikes/SPIKE-COWORK-MUTEX-001-PRIOR-ART-ADJUDICATE.md`
(committed `4107ce310`, 2026-08-12) — same investigation, same verdict, done under a differently-named
working file that was never board-reflected (the board's own `SPIKE-COWORK-MUTEX-001-PRIOR-ART-AC-DIFF`
row, minted 2026-08-08, didn't know it had already been answered). `git log --since=2026-08-12` on
`CLAUDE.md`/`CARD.md`/`SKILL.md`/`task_list_held.md`/`spawn-fanout.md` is empty — zero drift since
that spike ran. Both board rows are now reconciled/closed (this cycle's `orch-apply.sh` write): the
`AC-DIFF` spike row moved `backlog[]` → `done[]`, and this row moved `in_progress[]` → `ready[]`.

**No new BA/architect/PM work needed.** The BA spec (`FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS-BA-spec.md`,
2026-07-23), the architect brief (2026-07-29, ruled Candidate A refined, full file-level design table
in §3), and the PM decomposition (this exact handoff + siblings 002/003, 2026-07-30, complete AC/files)
already exist and were re-verified today as still valid, current and unchanged. PM's own decision
journal (`sprint-COWORK-GUARANTEED-SLOT-CATCHUP-pm.md` STEP pm-S5) already recorded `NEXT: Router/PO
explicitly dispatches TASK-COWORK-MUTEX-001 to developer` — this triage executes that already-decided
next step rather than re-running a completed ba→architect→pm sequence.

`supervised: true` is left unchanged (not BA's call to clear) — the Ready-Lane Consumer explicitly
excludes `supervised` rows, so this will **not** auto-fire; router/PO must still perform a deliberate
dispatch to `developer`, matching PM's own S5 note and the `supervised`-flag design intent for
protocol-layer changes.

RETURN (this triage): DONE — prior-art diff complete, verdict NOT-shipped, board updated
(`ready[]`, `next_agent: developer`). NEXT: developer (deliberate dispatch, `supervised:true` blocks
auto-pickup). PIPELINE: continue.
