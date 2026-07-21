---
sprint: FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-SKILLS
branch: task/FIX-COMMIT-SWEEP-GUARD-SKILLS
size: S
zone: .claude/skills/
depends_on: []
blocks: []
---

## TLDR

Fix three existing skills' own bare-commit lines to use pathspec-scoped commits (`git commit -m "<msg>" -- <paths>` instead of bare `git commit -m "<msg>"`). This is the structural fix that makes all callers of these skills immune to the index-sweep defect, independent of whether the pre-commit hook fires. The hook is the universal backstop; the skills fixes are the actual structural remedy.

## [PM] Planning Context

**Zone:** .claude/skills/ (skill infrastructure)

**Acceptance Criteria:**
- [ ] AC-1: The three existing skills' bare-commit lines are fixed to pathspec-scoped form (documented surgical edits below); this closes the sweep defect for the highest-volume, most-scrutinized call sites
- [ ] AC-2: By fixing these three call sites, WARN-volume from the pre-commit hook is massively reduced on day 1 (Layer 1 fixes + Layer 0 hook = majority of traffic stops triggering the warn immediately)
- [ ] AC-3: The guard's own failure MUST NOT be silently indistinguishable from a pass; the skills themselves must remain loud on error (mirrors commit-mutex's own C-2/C-2b precedent: transport/mechanism failure fails-open AND loud, never 2>/dev/null || true)

**Files to read first:**
- `docs/architecture-briefs/2026-07-21-commit-path-peer-index-sweep-guard.md` (complete design specification; read §2.1 §4.2 for the structural fix and empirical verification)
- `.claude/skills/commit-mutex/SKILL.md` (the master control; read Step 3a/3b/3c to understand the TOCTOU race it was designed to protect against)
- `.claude/skills/commit-boundary/SKILL.md` (already has RULE 1 = explicit git add; RULE 3 = post-hoc reset guard; needs RULE 2.5 = commit-line pathspec)
- `.claude/skills/commit/SKILL.md` (slash command /commit; reads explicit file list in Step 1)

**Files to modify:**

| File | Location | Current (defective) | Fix (pathspec-scoped) | Notes |
|---|---|---|---|---|
| `.claude/skills/commit-mutex/SKILL.md` | Step 3c | `git commit -m "$(cat <<'EOF' ...)"` | `git commit -m "$(cat <<'EOF' ...)" -- <own_paths from Step 3a>` | Closes the TOCTOU race: pathspec commit is atomic under git's index.lock; removes need to trust the Step 3b snapshot |
| `.claude/skills/commit-boundary/SKILL.md` | Insert between RULE 2 and RULE 3 | (no explicit commit-line pathspec shown) | New sub-rule: "commit with `-- <same explicit paths from RULE 1>`"; keep RULE 3's post-hoc `git show`/`reset --soft` as defense-in-depth | RULE 1 already mandates "git add <named files only> — NEVER git add -A/./dir"; RULE 3 already mandates post-hoc `git show --name-only HEAD` verify. The commit line pathspec closes the race by ensuring only those explicitly-added paths are included atomically. |
| `.claude/skills/commit/SKILL.md` | Step 2 | `git commit -m "$(cat <<'EOF' ...)"` | `git commit -m "$(cat <<'EOF' ...)" -- <paths>` (reusing the Step 1 explicit file list) | The slash command `/commit` already collects an explicit file list in Step 1; Step 2 must apply it as a pathspec on the commit line |

**Caveat from verification harness:**
A pathspec commit CANNOT introduce an untracked file — it will error `did not match any known file`. This is the responsibility of the **caller** of these skills, not the skills themselves:
- If a caller adds NEW files, it MUST `git add <new-files>` first, THEN call the skill with the scoped commit
- This is already documented in `.claude/skills/commit-boundary/SKILL.md` RULE 1 as "git add <named files only>" (explicitly, not broadly with -A)
- Call out this caveat explicitly in each of the 3 commits (AC trailers in the PM handoff become git commit trailers per `docs/policies/commit-convention.md`)

**Dependencies:** None (tier-1 parallel with hook implementation)

**Knowledge needed:**
- `docs/policies/commit-convention.md` (commit message format, AC trailers)
- `docs/protocols/fail-loud-protocol.md` (error handling pattern: fail-open but loud, mirrors commit-mutex C-2/C-2b)
- Git pathspec syntax: `-- <exact-file-paths>` (not globs, not directories, only exact file paths to match RULE 1 semantics)

**Design specification from architect brief (§2.1 §4.2):**
- Empirically verified: `git commit -m msg -- exact-files` resolves the pathspec atomically at commit time and ignores everything else in the index, even if `git add -A` was used beforehand. This is the mechanism that prevents the sweep.
- The hook will detect bare commits (§4.1) and warn; the skills fixes prevent bare commits from ever being called by skilled actors (the highest-traffic path through the system)
- Recommend these 3 skills additionally set `GIT_SWEEP_GUARD_MODE=reject` around their own critical section AFTER they are fixed to pathspec form (since their commit line is now correct by construction, REJECT is a self-regression guard for them specifically, not a fleet-wide gamble like it would be today)

**Scope bounds (what NOT to do):**
- Do NOT re-architect commit-mutex (the mutex itself is sound; the fix is to close its Step 3b→3c TOCTOU gap via pathspec)
- Do NOT replace RULE 3's post-hoc `git show`/`reset --soft` backstop in commit-boundary (keep it as defense-in-depth)
- Do NOT change the explicit file list collection logic (Step 1 in commit/, RULE 1 in commit-boundary, Step 3a in commit-mutex)
- Do NOT invent a new control; the control already exists; the fix is to close the gap in its own implementation

**Test strategy:**
- Verify the 3 skills can be called and produce correct commits (existing CI/flow tests should pass)
- Spot-check: a fresh agent using one of these skills should generate a pathspec-scoped commit (examine git log with `git show --name-only HEAD`)
- Cross-check: re-run the parent task's `verification_gate` scenario (actor A stages file X, actor B calls a skill, B's commit is clean — only B's files, A's staged content is preserved)

**Post-implementation follow-up (Layer 2, NOT this row):**
- Layer 2 sweep of remaining ad-hoc inline `git commit -m` blocks in individual flow docs (60+ grep results) to pathspec-scoped form; this is PM-tracked cleanup, dispatched separately
- Optional per-skill `GIT_SWEEP_GUARD_MODE=reject` hardening around the critical section (recommended for self-regression guard, not required for AC compliance)
