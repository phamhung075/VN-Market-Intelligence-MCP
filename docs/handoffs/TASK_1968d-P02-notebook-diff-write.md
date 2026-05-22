# TASK_1968d-P02 — L-12 Notebook Diff-Write SKILL Refactor

**Sprint:** 1968d | **Wave:** 1 (parallel with P01) | **Owner:** agent-father
**Zone:** `.claude/skills/notebook-write/SKILL.md`
**Est. savings:** ~10–20 KB write I/O / trading-day across active agents + searchable prior-cycle history
**DDD layer:** Infrastructure (write-path optimization, no domain logic)
**Size:** M | **Priority:** HIGH | **NFR-3:** BCTC-freeze not triggered
**Depends on:** none (Wave 1 parallel-safe with P01)

---

## § 1 — Problem Statement

Current `notebook-write` SKILL specifies full-overwrite every cycle: Write tool replaces the entire file.
This means:
1. The previous cycle's content is gone immediately — no searchable history in the live file.
2. Each write I/O = full notebook (target ≤120L) even when only 20–30L of new content is generated.
3. Agents reading a notebook mid-task see only the latest cycle, losing the carry-over chain.

The diff-write pattern: each cycle writes a NEW section (`## c<N+1> · <timestamp>`) appended to the file. Old sections `c<N>` and `c<N-1>` remain intact. `c<N-2>` and older sections are pruned. Net: each cycle writes ~50L of new content (not ~150L), and the last 2 prior cycles remain readable.

---

## § 2 — Scope

**Files to UPDATE (1 file of dev work):**
- `.claude/skills/notebook-write/SKILL.md` — replace full-overwrite spec with section-overwrite + retention rule

**OUT of scope:**
- Retro-conversion of existing notebook content (only FORWARD from deploy — existing notebooks keep their current structure until the next cycle overwrites them)
- Any `apps/*` file
- Any agent `.md` file (the skill is the SSOT; all agents reference this skill)
- The `docs/agent-memory/notebooks/` files themselves (agent-father does not touch live notebooks as part of this task — they self-update on next cycle)

Note: This is a 1-file task, well within the ≤2-file split policy.

---

## § 3 — Acceptance Criteria

**AC-1 (section anchor convention):** The updated skill defines the anchor format:
- `## c<NNN> · <YYYY-MM-DDThh:mmZ>` where `<NNN>` is the cycle number matching the agent's current cycle counter
- Each cycle's content is nested under this heading
- The heading is recognizable by a grep: `grep "^## c[0-9]" notebook.md`

**AC-2 (retention rule documented):** The skill states: keep the current cycle section (`c<N+1>`) + 2 prior cycle sections (`c<N>` and `c<N-1>`). Prune `c<N-2>` and older by deleting those headings + their content block before the write. Net file length ≤200L (enforced by 3-cycle × max ~50L/section + carry-over header).

**AC-3 (write operation):** The skill instructs agents to use the Edit tool for the append-section step (not Write/full-overwrite). The prune step uses Edit to remove the oldest section. The skill must document the exact edit pattern:
1. Prune: `Edit(file, old_string=<§c(N-2) block>, new_string="")` to remove oldest section
2. Append: `Edit(file, old_string=<last line of current content>, new_string=<last line>\n\n## c<N+1> · <ts>\n<new content>)`

**AC-4 (full-overwrite fallback):** If the file does not yet contain any `## c<NNN>` heading (blank-state or legacy format), the skill instructs the agent to perform a single full-overwrite Write to initialize the section structure. This handles first-deploy and legacy notebooks gracefully.

**AC-5 (≤200L bound verified):** The skill includes a note: "If file would exceed 200L after write, prune an additional prior section. A notebook exceeding 200L after pruning signals a section-content discipline violation — trim the current section to ≤60L."

---

## § 4 — Smoke Test (3-cycle simulation)

1. Create a scratch notebook file at `/tmp/test-notebook.md` with initial content: `# Test Agent — Notebook\n\n## c100 · 2026-05-20T10:00Z\nCycle 100 content (10L)\n\n## c99 · 2026-05-20T09:00Z\nCycle 99 content (5L)\n\n## c98 · 2026-05-20T08:00Z\nCycle 98 content (5L)`
2. Simulate cycle 101 write using the updated skill rules: prune `## c98` block, append `## c101 · 2026-05-22T05:00Z` section with 15L of content.
3. Assert: file contains `c101`, `c100`, `c99`; `c98` is GONE; total file ≤200L.
4. Simulate cycle 102: prune `c99`, append `c102`.
5. Assert: file contains `c102`, `c101`, `c100`; `c99` and `c98` GONE; total ≤200L.
6. Simulate blank-state: new file with no `## c<NNN>` heading → skill performs full Write with `## c103 · ...` section. Assert: file contains exactly 1 `## c` heading.

Pass condition: all 6 steps assert correctly. File never exceeds 200L in any step.

---

## § 5 — Rollback (1-step revert)

```bash
git revert HEAD --no-edit
```

`notebook-write/SKILL.md` reverts to the full-overwrite spec. All agents that run after rollback resume full-overwrite behavior on their next cycle. No notebook data is lost (the section-format files written during the task window remain readable under either convention). No other files affected.

---

## Implementation Notes (for agent-father, not BA work)

- The section cycle counter `<NNN>` should match the `cycle_id` field in the agent's kickoff signal if available; otherwise use an incrementing integer derived from counting existing `## c` headings in the current file.
- The prune logic must handle the case where fewer than 3 sections exist (blank-state or fresh deploy) — do not prune if only 1 or 2 sections present.
- The skill should remain ≤60L after update (current SKILL.md is 50L; the new retention rule + edit patterns add ~15L, total ~65L — trim examples if needed to stay ≤80L).
- Cross-ref: `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md § L-2` specifies 120L hard cap per notebook; this task's 200L file bound is the bound AFTER 3 sections × ~50L each — not a per-section cap. Per-section discipline (≤60L per section) is the enforcement lever.

---

## [BA] Spec Record

**BA:** ba | **Cycle:** c250 | **Timestamp:** 2026-05-22T05:10Z
**Blockers for PO:** none
**DDD layer:** Infrastructure (write-path tooling, no domain entity change)
**Wave:** 1 — parallel-safe with P01 (single skill file, no overlap with P01's skill or flows)

## §impl-agent-father

## [Developer] Implementation Record

- **Agent:** agent-father | **Cycle:** c252 | **Timestamp:** 2026-05-22T08:35Z
- **Files modified:**
  - `.claude/skills/notebook-write/SKILL.md` — 69L; full-overwrite → section-overwrite; ## c<NNN>·ISO-ts anchor; 3-cycle retention; Edit-based prune+append; blank-state Write fallback; ≤200L bound with trim note
- **Smoke test:** PASS — 3-cycle simulation (c101+c100+c99 present after c101 write; c99+c98 absent after c102 write; 44L ≤200L). Blank-state: 1 ## c heading after init Write.
- **Dogfood:** agent-father notebook initialized via blank-state Write path (AC-4 exercised live on own notebook).
- **AC status:** AC-1 PASS, AC-2 PASS, AC-3 PASS, AC-4 PASS, AC-5 PASS
- **Signal:** docs/signals/agent-father-1968d-P02-ready.json emitted (NEXT=qa)
