# UC-CCA-P3-FR1-FR2-SKILL — Create published-marker-gate Skill

**Task ID:** UC-CCA-P3-FR1-FR2-SKILL · **Priority:** P0 · **Zone:** cross-service/  
**Assigned to:** dev-team (any)  
**Depends on:** None (blocking dependency for 7 follow-on tasks)  
**Handoff from:** pm

---

## Acceptance Criteria

1. New file `.claude/skills/published-marker-gate/SKILL.md` created with exact structure from architect brief §3
   - YAML frontmatter with `name: published-marker-gate` + size-justification header
   - §Inputs section (MARKER_KEY, MARKER_TTL, OWNER_AGENT, OWNER_CLIENT_SESSION)
   - §Phase 1 (cheap probe) — complete pseudocode with client-side scan logic for `task_list_held` result (noted: API has no task_id filter)
   - §Phase 2 (commit-point claim) — complete pseudocode with never-release language + TTL-sole-expiry statement
   - §Design note explaining why Phase 1 is optional for alert-commander/bctc-analyst
2. File is syntactically valid Markdown, lintable by existing flow-doc tools
3. No modifications to any other files (this task creates the skill only; FR-3 tasks wire it into the 6 flows)

---

## Technical Spec

**Source:** `docs/architecture-briefs/2026-08-08-uc-cca-p3-published-marker-gate-skill.md` §3 (full structural draft included)

**File path:** `.claude/skills/published-marker-gate/SKILL.md`

**Content (verbatim from brief §3, with size-justification adjusted per `docs/policies/dev-standards.md`):**

```markdown
---
name: published-marker-gate
description: >
  Two-phase publish-once mutex for cowork guaranteed-slot agents. Phase 1 (cheap, read-only)
  aborts before the expensive pipeline if the window is already published. Phase 2 (commit
  point) claims immediately before the flow's own irreversible publish action and is NEVER
  released on success — TTL is the sole expiry path. Analogous in shape to commit-mutex/SKILL.md
  but AGENT-SIDE, not dispatcher-side (see spawn-fanout.md's own disclaimer, L115) — each of the
  6 cowork guaranteed-slot flows (chef, alert-commander, bctc-analyst, fb-market-poster,
  digest-predict, tran-ngoc-bau) invokes this directly via native call_tool, no Bash grant
  required (same call shape all 6 already use live today).
---

## Inputs (caller-supplied, never re-derived by this skill)
- `MARKER_KEY` (string) — window-anchored, timezone-free, per FR-4 (FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR
  Component A). This skill treats it as opaque — date-scoped, per-window, or ISO-week-period-scoped
  keys are all valid; never hardcode a shape here.
- `MARKER_TTL` (int, seconds) — caller-derived from slot cadence (single-fire 100800s / 28h;
  multi-fire = cadence; weekly ~691200s / 8d).
- `OWNER_AGENT` (string) — e.g. "unified-agent", "alert-commander".
- `OWNER_CLIENT_SESSION` (string) — resolved CLAUDE_CODE_SESSION_ID. REQUIRED. Substitute the ACTUAL
  value — never write the literal text "$CLAUDE_CODE_SESSION_ID" (preserves FR-6's already-shipped
  invariant, be3545412).

## Phase 1 — Cheap probe (OPTIONAL — only for flows with an expensive pre-publish pipeline to
protect: chef, fb-market-poster, digest-predict, tran-ngoc-bau. SKIP for alert-commander/bctc-analyst
— their pre-gate work is not conditioned on the dedup outcome, see design note below.)

Run at the flow's existing early gate point (unchanged location — this is a relocation of intent,
not of file/line):

```
PROBE = call_tool(server="vn-market", tool="task_list_held",
                   arguments={ kind: "cowork-slot", owner_agent: OWNER_AGENT })
# task_list_held has NO task_id filter (verified coordinationTools.ts) — scan client-side:
HELD = PROBE.locks contains an entry where task_id == MARKER_KEY AND expires_at > now

if HELD:
  log "[<agent>] publish blocked (Phase-1 probe) — already held key=" + MARKER_KEY
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
  # claims NOTHING — a leak from this call is structurally impossible.
else:
  proceed with the flow's own gather/synthesis pipeline
```

## Phase 2 — Commit-point claim (MANDATORY, all 6 gates)

Place **immediately before** the flow's own irreversible publish action — `send_telegram` for 5 of
6 gates, the STEP-5 file `Write` for fb-market-poster. Not one step earlier (defeats FR-2), not
wrapped around synthesis (defeats the cost-optimisation Phase 1 exists for).

```
CLAIM = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              MARKER_KEY,
  task_kind:            "cowork-slot",
  owner_agent:          OWNER_AGENT,
  owner_client_session: OWNER_CLIENT_SESSION,
  ttl_seconds:          MARKER_TTL
})

if CLAIM.claimed != true:
  log "[<agent>] publish blocked (Phase-2 claim) — already published key=" + MARKER_KEY
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
  # a peer claimed between this Phase-1 probe and this Phase-2 claim — do NOT send anything.
else:
  proceed immediately to the publish action (send_telegram / file Write)
  # NEVER task_release on success, and NEVER on ANY exit after this point — successful send,
  # failed send, exception, process death: all leave the marker in place. TTL is the SOLE
  # expiry path (AC-3; resolves Q-send-fail literally — see brief §7).
```

## Design note — why Phase 1 is optional per-gate
alert-commander and bctc-analyst already independently converged on LATE-claim-only (no separate
early probe) because their pre-gate work is not wasted on a dedup miss: alert-commander's
claim-truth-gate + snapshot always runs regardless of dedup outcome (its Firing Gate has already
decided fire/no-fire before this point); bctc-analyst's extraction is the core deliverable
independent of the WORK-channel notify this marker dedups. Retrofitting Phase 1 onto either would
add a call with no cost-optimisation benefit — skip it there, per the existing correct precedent.
```

---

## Design Decisions

- **Two-phase structure:** Phase 1 (cheap, read-only probe) aborts expensive pipeline if already published; Phase 2 (commit-point claim) seals the decision immediately before publish
- **Never-release:** On Phase-2 success, no `task_release` call (TTL is the sole expiry mechanism). This applies uniformly to all exit paths: successful send, failed send, exception, process death
- **Skill home:** `.claude/skills/published-marker-gate/SKILL.md` (agent-side, not dispatcher-side). All 6 flows reference it identically
- **No new enum:** Uses `task_id`-prefix guard (`^published:`) for immunity, not a new `task_kind` enum member
- **No Bash required:** All 6 flows already have native `call_tool` access; this skill is plain markdown pseudocode/contract

---

## Related Documents

- Architect brief: `docs/architecture-briefs/2026-08-08-uc-cca-p3-published-marker-gate-skill.md` (full design, FR-1 through FR-5, all resolved questions)
- BA spec: `docs/handoffs/UC-CCA-P3-BA-spec.md` (requirements, 6 ACs, blockers/open questions)
- Sibling row (key-agreement): `FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR` (FR-4 mechanics, Component A)
- Sibling row (release gate): `FIX-CHEF-PUBLISHED-MARKER-RELEASE` (Component B, reconciliation pending)
- Sibling row (determinism guard): `FIX-CHEF-MIDFLOW-BAIL-DETERMINISM` (complementary, not blocking)

---

## QA Gate

- [ ] File exists at `.claude/skills/published-marker-gate/SKILL.md`
- [ ] YAML frontmatter parses correctly (name, description fields present)
- [ ] All 4 Inputs documented with no placeholder values
- [ ] Phase 1 pseudocode includes client-side task_id scan (noted API limitation)
- [ ] Phase 2 pseudocode includes "never release" statement + "TTL sole expiry" statement
- [ ] Design note explains why Phase 1 is optional for alert-commander/bctc-analyst
- [ ] File lintable by existing flow-doc checker

---

## Blocker(s)

None. This task has no upstream dependencies.

---

## Follow-on Tasks

This task is a blocking dependency for 7 follow-on tasks (all FR-3 wiring tasks):
- UC-CCA-P3-FR3-CHEF
- UC-CCA-P3-FR3-ALERT-COMMANDER
- UC-CCA-P3-FR3-BCTC-ANALYST
- UC-CCA-P3-FR3-FB-MARKET-POSTER
- UC-CCA-P3-FR3-DIGEST-PREDICT
- UC-CCA-P3-FR3-TRAN-NGOC-BAU
- UC-CCA-P3-FR3-SPAWN-FANOUT-CLEANUP

These cannot start until this skill file is complete and visible to the flow-doc wiring tasks.

---

## [Developer] Implementation Record

- **Files modified:** `.claude/skills/published-marker-gate/SKILL.md` (new file, 86L)
- **Tests written:** none — doc/skill-only task, no `apps/` TS/Go touched, `bun test`/`tsc` structurally N/A
- **Git commits:** `6d63b9cac` — feat(cross-service): published-marker-gate two-phase gate skill
- **tsc status:** N/A (no code)
- **Full suite:** N/A (no code)
- **Docs updated:** `docs/WORK.md` (one-liner), `docs/data/orch/orch-state.json` (`UC-CCA-P3-FR1-FR2-SKILL` `ready[]`→`review[]`, `UC-CCA-P3` umbrella note, `UC-CCA-P3-FR5-CODE-GATE` dependency-satisfied annotation) — all via `orch-apply.sh`
- **Graphify:** skipped — no Skill-tool path available to this Task-spawned agent session (structural gap, see `feedback_devteam_flow_needs_nested_agent_spawn_subagent_cannot.md`)
- **AC verification:** AC-1 all 5 sub-bullets present (frontmatter name+description; Inputs MARKER_KEY/MARKER_TTL/OWNER_AGENT/OWNER_CLIENT_SESSION; Phase-1 pseudocode incl. `task_list_held` no-`task_id`-filter caveat; Phase-2 pseudocode incl. never-release + TTL-sole-expiry language; Design note on Phase-1-optional for alert-commander/bctc-analyst). AC-2: YAML frontmatter parses (verified via `python3 -c yaml.safe_load`). AC-3: `git show --stat 6d63b9cac` confirms exactly one file touched.
- **Deviation from standard flow:** implemented directly by the dev-team-lead `developer` session rather than dispatched — `.claude/skills/` has no zone owner in `system-map.json` and this row's own `next_agent` was the non-specialist placeholder `"dev-team"`; matches this flow's documented known-drift fallback ("no matching zone → developer handles it directly"). This session also had no Agent-tool binding to nest-spawn a specialist regardless.
