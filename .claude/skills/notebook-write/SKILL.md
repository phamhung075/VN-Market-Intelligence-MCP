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

### ≤200L bound (AC-5) — hard gate, non-optional

After every write (AC-3 Step 2), run the line-count gate before any commit:

```bash
NB_LINES=$(wc -l < "$NOTEBOOK_PATH" | tr -d ' ')
if [ "$NB_LINES" -gt 200 ]; then
  echo "[notebook-write] GUARD: $NB_LINES L > 200 — prune additional section now"
  # Prune the next-oldest section (c<N-3> or whichever is oldest remaining):
  #   Edit(file=<notebook_path>, old_string=<full ## c(oldest) block>, new_string="")
  # Then re-check:
  NB_LINES=$(wc -l < "$NOTEBOOK_PATH" | tr -d ' ')
  if [ "$NB_LINES" -gt 200 ]; then
    echo "[notebook-write] GUARD: still $NB_LINES L — trim current section to ≤60L"
    # Shorten the current-cycle section content until file ≤200L.
    # Do NOT skip this step. Do NOT commit until guard passes.
  fi
fi
```

**This gate is MANDATORY.** A notebook at >200 L after AC-3 = a blocking violation.
Do NOT commit the notebook until `wc -l` returns ≤200.
200L is the file-level cap (3 sections × ~50L each + header). Per-section discipline (≤60L) is the primary enforcement lever.

### Commit — retry on lock collision (F4)

```bash
# idiom → docs/protocols/head-lock-self-cure.md § F4 — Git Commit Retry Wrapper
git_commit_retry -m "chore(memory/<agent-id>): cycle <NNN> <YYYY-MM-DD>"
```

> Requires `$PROJECT_ROOT` set by skill: `.claude/skills/project-root/SKILL.md`
