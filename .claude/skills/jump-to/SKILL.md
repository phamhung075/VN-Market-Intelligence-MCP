---
name: jump-to
description: >
  Fluid flow navigation — labelled anchors + JUMP TO jumps so agents skip
  unreachable steps instead of walking the whole flow. Apply to any flow with
  >3 sequential steps or a dispatch table at the top.
---

<!-- size-justification: 63L — under cap, no marker needed (kept for placeholder pattern only) -->

## Why

Linear "Step 1 → 2 → 3 → … → end" flows force agents to read and acknowledge every step even when the trigger pre-determines the path. JUMP TO removes that waste:

- Cron tick + empty signals → JUMP TO Session Gate (skip PO triage entirely)
- Pipeline resume → JUMP TO Step 3 Execution (skip Steps 0–2)
- FIX task → JUMP TO Step 3 (skip planning)
- Empty result at Step N → JUMP TO end (skip reporting noise)

## Anchor format

Every JUMP-TO-able step MUST carry an HTML comment anchor immediately above its heading:

```markdown
<!-- jump:drain-signals -->
## Step 0a — Drain `docs/signals/`
```

- Label = kebab-case, ≤24 chars, unique within the file.
- Anchors are case-sensitive. JUMP TO must use the exact label.
- Reserved label: `end` (always = "stop and return PIPELINE: complete/blocked/idle as appropriate").

## Jump reference

Two valid forms:

| Form | Where used | Example |
|---|---|---|
| Dispatch table row | Top-of-flow trigger router (preferred) | `\| cron tick + empty signals \| JUMP TO `session-gate` \|` |
| Inline conditional | Mid-step branch | `If `pendingSignals` empty → JUMP TO `session-gate`.` |

Write `JUMP TO <label>` in UPPERCASE with the label in backticks. Always inside the same file — cross-file jumps use `→ Run sub-flow: <path>` instead (no JUMP TO across files).

## When to apply

| Condition | Action |
|---|---|
| Flow file has >3 sequential steps | Add anchors to each step + dispatch table at top |
| Flow file has top-of-file Dispatch table | Convert "Entry step" column to `JUMP TO <label>` |
| Flow file ≤3 steps | Skip — overhead not worth it |
| Sub-flow file invoked via `Run sub-flow:` | Skip — entry is always Step 1 |

## When NOT to apply

- Skill files (`.claude/skills/*/SKILL.md`) — declarative, no steps.
- Agent definition files (`.claude/agents/*.md`) — YAML descriptors.
- Cron skill files (`.claude/commands/crons/cron-*.md`) — one-line dispatchers to `main.md`.

## Invariants

- Every `JUMP TO <label>` MUST resolve to an existing `<!-- jump:<label> -->` anchor in the same file (or reserved `end`). Audit: `grep -rEoh 'JUMP TO \`[a-z0-9-]+\`' docs/agents/*/flow | sort -u`.
- Anchors live ON the step they identify, never as standalone navigation lines.
- A dispatch table that maps to JUMP TOs must cover every distinct entry condition the flow supports.
