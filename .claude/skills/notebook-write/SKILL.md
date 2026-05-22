---
name: notebook-write
description: >
  Section-overwrite agent notebook at end of cycle. Appends a new c<NNN> section,
  retains last 3 cycles, prunes older sections. Replaces full-overwrite pattern.
  Used as end-of-cycle step in all dev-team and cowork flow files.
---

## End-of-cycle notebook write — section-overwrite pattern

Path: `$PROJECT_ROOT/docs/agent-memory/notebooks/<agent-id>.md`

**Operation = Edit tool (section append + prune), NOT Write/full-overwrite.**
Each cycle appends a new section; the prior 2 sections are retained; older sections are pruned.

### Section anchor format (AC-1)

```markdown
## c<NNN> · <YYYY-MM-DDThh:mmZ>
```

`<NNN>` = agent's current cycle counter (from kickoff signal `cycle_id`, or count existing `## c` headings + 1).
Grep to locate sections: `grep "^## c[0-9]" notebook.md`

### Retention rule (AC-2)

Keep: current cycle `c<N+1>` + 2 prior cycles `c<N>` and `c<N-1>`.
Prune: `c<N-2>` and older (delete heading + entire content block below it, down to the next `## c` heading or EOF).
Do NOT prune if the file has fewer than 3 `## c` sections (blank-state or fresh deploy).

### Write operation (AC-3)

**Step 1 — Prune oldest section** (only if ≥ 3 sections exist):
```
Edit(file=<notebook_path>,
     old_string=<full ## c(N-2) heading + its content block>,
     new_string="")
```

**Step 2 — Append new section** (append after last line of current content):
```
Edit(file=<notebook_path>,
     old_string=<last line of existing file content>,
     new_string=<last line>\n\n## c<N+1> · <ISO-timestamp>\n<new cycle content ≤60L>)
```

### Blank-state fallback (AC-4)

If the file does NOT yet contain any `## c<NNN>` heading (new file or legacy format):
→ Perform a single full **Write** to initialize the section structure:
```
Write(path=<notebook_path>, content="# <Agent> — Notebook\n\n## c<NNN> · <ISO-timestamp>\n<cycle content>")
```
This handles first-deploy and pre-existing plain-text notebooks gracefully (forward-only, no retro-write).

### ≤200L bound (AC-5)

If file would exceed 200L after write: prune one additional prior section.
A notebook exceeding 200L after pruning signals a section-content discipline violation — trim the current section to ≤60L.
Note: 200L is the file-level cap (3 sections × ~50L each + header). Per-section discipline (≤60L) is the primary enforcement lever.

### Commit — retry on lock collision (F4)

```bash
# idiom → docs/protocols/head-lock-self-cure.md § F4 — Git Commit Retry Wrapper
git_commit_retry -m "chore(memory/<agent-id>): cycle <NNN> <YYYY-MM-DD>"
```

> Requires `$PROJECT_ROOT` set by skill: `.claude/skills/project-root/SKILL.md`
