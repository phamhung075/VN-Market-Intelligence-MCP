---
name: notebook-write
description: >
  Section-overwrite agent notebook at end of cycle. Appends a new section,
  retains last 3 sections, prunes older sections. Replaces full-overwrite pattern.
  Used as end-of-cycle step in all dev-team and cowork flow files.
---

## End-of-cycle notebook write — section-overwrite pattern

Path: `$PROJECT_ROOT/docs/agent-memory/notebooks/<agent-id>.md`

**Operation = Edit tool (section append + prune), NOT Write/full-overwrite.**
Each cycle appends a new section; the prior 2 sections are retained; older sections are pruned.

### Section anchor format (AC-1)

Any `## ` level-2 heading is a valid section boundary. Three formats in use:

```markdown
## c<NNN> · <YYYY-MM-DDThh:mmZ>      ← c-format agents (agent-father, bctc-analyst)
## <ISO-timestamp>                    ← timestamp agents (agents-architect)
## Session: <date> (<context>)        ← session agents (ops)
```

Detect sections: `grep -c "^## " notebook.md`
Identify oldest: first `^## ` line in file (after any preamble — content before line 1's first `## `).

New sections appended by this skill SHOULD use `## c<NNN> · <ISO-timestamp>` format.
Agents that already emit a different format remain valid — prune fires regardless.

### Retention rule (AC-2)

Keep: current cycle (newest `## ` section) + 2 prior sections = last 3 `## ` sections total.
Prune: all sections older than the 3rd-most-recent (delete heading + entire block down to next `## ` or EOF).
Do NOT prune if the file has fewer than 3 `## ` sections (blank-state or fresh deploy).
Preamble (any content before the first `## ` line) is NEVER pruned — preserve verbatim.

### Write operation (AC-3)

**Step 1 — Prune oldest section** (only if ≥ 3 sections exist after counting via `grep -c "^## "`):

Locate the oldest section block:
- Find first `^## ` line (start of oldest section).
- Find the second `^## ` line (start of next section = end boundary of oldest).
- `old_string` = everything from first `^## ` line up to (but NOT including) second `^## ` line.
- `new_string` = `""` (delete it).

```
Edit(file=<notebook_path>,
     old_string=<full oldest ## heading + its content block>,
     new_string="")
```

**Step 2 — Append new section** (append after last line of current content):
```
Edit(file=<notebook_path>,
     old_string=<last line of existing file content>,
     new_string=<last line>\n\n## c<N+1> · <ISO-timestamp>\n<new cycle content ≤60L>)
```

### Blank-state fallback (AC-4)

If the file does NOT yet contain any `## ` section heading (`grep -c "^## "` returns 0):
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
  # Prune the next-oldest section (whichever is now oldest remaining):
  #   Edit(file=<notebook_path>, old_string=<full ## oldest block>, new_string="")
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

<!-- TODO: po/main.md L126 says "OVERWRITE, target ≤50L"; developer/flow/main.md L125 says "append c<NNN>". These are contradictory — po uses full-overwrite, developer uses section-append. Reconciliation deferred (scope risk); QA should flag if po notebooks exceed 200L. -->

### Commit — retry on lock collision (F4)

```bash
# idiom → docs/protocols/head-lock-self-cure.md § F4 — Git Commit Retry Wrapper
git_commit_retry -m "chore(memory/<agent-id>): cycle <NNN> <YYYY-MM-DD>"
```

> Requires `$PROJECT_ROOT` set by skill: `.claude/skills/project-root/SKILL.md`
