---
name: notebook-write
description: >
  Overwrite agent notebook at end of cycle. Records session summary, patterns,
  carry-over items. Used as end-of-cycle step in all dev-team flow files.
---

## End-of-cycle notebook write

Path: `$PROJECT_ROOT/docs/agent-memory/notebooks/<agent-id>.md`

**Operation = Write tool (full overwrite), NOT Edit (no append).** This is critical: the file MUST be replaced wholesale every cycle. Appending grows the notebook unbounded and breaks the waterfall lazy-load budget (see `feedback_waterfall_lazy_load`).

### Pre-write check (MANDATORY)

1. If the file already exists, Read it first to recover any explicit carry-over items (anything under a `## Carry-over` heading).
2. Drop everything else — old session summaries, old patterns, old "Zone health:" lines from prior cycles. Each cycle owns only its own observations + any carry-over the previous cycle explicitly marked.

### Body (target ≤100 lines, hard cap 120)

- **Last updated:** `<ISO date>` · **Sprint:** `<NNN>`
- **Archive pointer (if trimmed):** `> Archive: docs/archive/notebooks/<agent-id>-<YYYY-MM-DD>.md`
- **This session (1–3 sentences):** what was done, what was found.
- **Patterns noticed:** recurring bugs, architecture violations, calibration observations (optional, omit if none).
- **Zone health:** one line per zone-scan finding (dev-* agents only — emit `Zone health: no drift detected` or specific drift line).
- **Carry-over (next session):** unresolved questions, blocked tasks. **Only items here survive into the next cycle.**

**Archive-before-overwrite rule:** If the current notebook file exceeds 120 lines, COPY the full file to `docs/archive/notebooks/<agent-id>-<YYYY-MM-DD>.md` BEFORE writing the trimmed overwrite. Add an archive pointer on line 3 of the live file. Archive is write-once — do not edit archives.

If your draft is >120 lines, you are appending. Stop, re-read this skill, and rewrite as a fresh overwrite.

### Tool call

```
Write(path=$PROJECT_ROOT/docs/agent-memory/notebooks/<agent-id>.md, content=<≤50L body>)
```

Never use Edit/Append. Never preserve prior session content outside the explicit `## Carry-over` block.

### Commit — retry on lock collision (F4)

Notebook commits are bare `git commit` calls that hit `index.lock` / `HEAD.lock` during Docker VirtioFS scan races (H4 confirmed c57+c58). Use the `git_commit_retry` idiom for all notebook commit steps:

```bash
# idiom → docs/protocols/head-lock-self-cure.md § F4 — Git Commit Retry Wrapper
git_commit_retry -m "chore(memory/<agent-id>): notebook <cycle>"
```

> Requires `$PROJECT_ROOT` set by skill: `.claude/skills/project-root/SKILL.md`
