---
name: end-0-cowork
description: >
  Composite end-of-cycle skill for cowork agents (and dev-core/maintenance/ops
  flows that shared the old cowork-end-cycle dispatcher). Replaces cowork-end-cycle
  + session-log-cowork with one file load: decision-journal flush (pointer), one
  settled notebook write (pointer, absorbs the old session-log step), condensed
  doc-self-heal, and a self-critique TRIGGER-CHECK gate that lazy-loads the full
  118L self-critique flow only when a trigger actually fires.
---
<!-- Sprint: TOKEN-ECONOMY-AUDIT (TE-T05) | Author: agent-father | 2026-08-06 -->
<!-- Supersedes: cowork-end-cycle/SKILL.md (16L 5-step dispatcher, deleted — 0 remaining
     live consumers after this repoint) + session-log-cowork/SKILL.md (33L, deleted — its
     cycle-summary fields are now written inside notebook-write's own `## c<NNN>` section,
     see NO-OP RULE below). decision-journal / notebook-write / doc-self-heal / self-critique
     stay standalone, unmodified — dev-team has independent call sites into each (NFR-1: pointer
     only, never an inlined copy — that is the exact SSOT-drift class AC-2a was written to kill). -->

## Step 0 — Decision journal flush

→ skill: `.claude/skills/decision-journal/SKILL.md` § Write Entry
`task_id`: active task_id if a sprint task was claimed this cycle; omit for an ambient cowork cycle.
Flush any pending STEP entries before the notebook write below. Journal = WHY (decision trail); notebook = WHAT LEARNED. Never narrate reasoning on terminal.

## Step 1 — Notebook write (absorbs the old session log — ONE write, not two)

→ skill: `.claude/skills/notebook-write/SKILL.md` (pointer only — that file owns AC-1..AC-6:
section format, last-3 retention, the AC-2a immutability invariant, the atomic settled-write,
the ≤200L blocking gate, and the `c<NNN>` UUID-provenance rule + pre-commit backstop).

**NO-OP RULE (mandatory, ratified P6-Piece2 amendment):** the notebook write and the
end-of-cycle session summary are ONE write, never two. `session-log-cowork/SKILL.md`'s
former fields (findings / actions / next_cycle_hint / estimated_tokens) now live INSIDE
the same `## c<NNN>` section that notebook-write composes this cycle — do not write them
to a second location. **Skip this step entirely** if the flow already landed its settled
notebook write earlier this cycle (e.g. a chef-dish-style mid-flow section commit) —
do not compose a second section for the same cycle.

## Step 2 — Doc self-heal (condensed)

Review the flow/knowledge/skill docs you followed this cycle; fix only what was actually
wrong (full protocol: `.claude/skills/doc-self-heal/SKILL.md`).

| Category | Fix |
|---|---|
| Outdated | tool renamed, path moved, step no longer applies |
| Unclear | ambiguous instruction that caused hesitation or a wrong action |
| Missing | improvised step that should be documented for next cycle |
| Wrong order | steps that needed reordering to work correctly |

- Minimal edits only — fix substance, never style.
- **Never remove a safety check**, even one you skipped this cycle — it may apply next cycle.
- **Skip silently if nothing was wrong** — no edit for the sake of editing, no "nothing to fix" log line.
- Commit doc fixes separately: `docs: self-heal <agent> flow — <what changed>`.

## Step 3 — Self-critique (TRIGGER-CHECK only)

PLAN-ONLY, zero mutation unless a trigger fires. The full 118L flow (evidence schema,
lane classification, DRAFT proposal write, signal row, commit) lazy-loads ONLY on trigger:
`.claude/skills/self-critique/SKILL.md`.

**Pilot-scope gate (NFR-2 — this is a gate check, never a second copy of the allowlist):**
agent-id NOT IN {`news-scout`, `dev-team`} → skip silently, EXIT. Live SSOT for the
allowlist stays `self-critique/SKILL.md` § SC-0.

**Trigger taxonomy T1-T5 (full detail: `self-critique/SKILL.md` § SC-1):**
- T1: tool call returned 5xx / timeout / empty-where-expected / degraded source_tier
- T2: flow step skipped/improvised for a missing capability (not a doc error — that's Step 2)
- T3: primary output carried confidence <0.5 or an explicit partial/incomplete flag
- T4: notebook carry-over repeats the same workaround ≥2 times across entries
- T5: elapsed time >2x typical duration, step count >1.5x listed, or >10 sequential retries on one step

None fired → EXIT silently, write nothing (S4 safety invariant). Any fired → load the
full `self-critique/SKILL.md` and execute SC-0 through SC-6 there (tie-break on lowest
T-code, lane pre-classification, DRAFT write, signal_queue row, mutex-guarded commit).

---

## Usage in flow files

Replace any `cowork-end-cycle/SKILL.md` end-of-cycle reference with:
```
**End of cycle** → skill: `.claude/skills/end-0-cowork/SKILL.md`
```

No `<agent-id>` substitution needed — each constituent skill resolves the agent id from
its own caller context (same as `notebook-write`/`decision-journal` did standalone).
