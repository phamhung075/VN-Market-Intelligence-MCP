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

### Write operation (AC-3) — ATOMIC settled-write invariant

**Invariant:** the file MUST be ≤ its line-cap after EVERY individual Edit/Write the skill
performs. NEVER append-then-trim across two writes. Compose the final ≤200L body FIRST,
then land it in ONE operation.

**Step 1 — Compose final body in memory (no file write yet):**

a. Read the full current notebook content into memory.
b. Identify all `^## ` section boundaries (preamble = everything before first `## `).
c. If the file has ≥ 3 sections: drop the oldest `## ` section block from the in-memory
   representation (heading + all content down to but NOT including the next `## `).
d. Append the new section text (≤60L) to the end of the in-memory body.
e. Apply AC-2b intra-section prune in memory if a permanent accumulator heading now has
   ≥4 `### ` sub-blocks — drop the oldest sub-block in memory.
f. Count lines of the resulting in-memory body.
   - If still > 200L: drop the next-oldest `## ` section block from memory and recount.
     Repeat until ≤200L or only preamble + 1 section remain.
   - If the current-cycle section alone exceeds 60L: trim it to 60L before counting.
g. The in-memory body is now the final settled content (≤200L guaranteed).

**Step 2 — Single settled write:**

Replace the ENTIRE current file content with the composed final body in ONE operation:
```
Edit(file=<notebook_path>,
     old_string=<entire current file content, verbatim>,
     new_string=<final settled body from Step 1>)
```

This is ONE Edit call. The PostToolUse hook fires exactly once and sees a file ≤200L.

**Alternative when old_string uniqueness is hard to guarantee (large unchanged preamble):**
Use the Write tool instead of Edit — same single-operation guarantee:
```
Write(path=<notebook_path>, content=<final settled body from Step 1>)
```

**What is NOT allowed:**
- Edit to delete oldest section → then a SEPARATE Edit to append (two observed writes,
  intermediate state is over-cap, fires spurious breach signals).
- Any sequence of 2+ Edits where the file exceeds 200L after the first Edit.

### Blank-state fallback (AC-4)

If the file does NOT yet contain any `## ` section heading (`grep -c "^## "` returns 0):
→ Perform a single full **Write** to initialize the section structure:
```
Write(path=<notebook_path>, content="# <Agent> — Notebook\n\n## c<NNN> · <ISO-timestamp>\n<cycle content>")
```
This handles first-deploy and pre-existing plain-text notebooks gracefully (forward-only, no retro-write).

### ≤200L bound (AC-5) — verification gate (post-write sanity check)

After the single settled write (AC-3 Step 2), verify the line count as a sanity check:

```bash
NB_LINES=$(wc -l < "$NOTEBOOK_PATH" | tr -d ' ')
if [ "$NB_LINES" -gt 200 ]; then
  echo "[notebook-write] BUG: $NB_LINES L > 200 after settled write — Step 1 compose logic failed"
  # This should NOT happen if AC-3 Step 1 composed correctly.
  # If it does: re-compose (trim current section further) and perform ONE more settled write.
  # Do NOT commit until wc -l returns ≤200.
fi
```

**IMPORTANT — AC-5 is a verification step, NOT a remediation loop via extra Edits.**
The AC-3 settled-write approach means the file should ALWAYS be ≤200L after the single
write. If AC-5 fires, it means AC-3 Step 1 had a compose error — fix the compose, re-write
once, not iterative small Edits. Each extra Edit fires the PostToolUse backstop; the goal
is zero intermediate over-cap states.

200L is the file-level cap (3 sections × ~50L each + header). Per-section discipline (≤60L)
is the primary enforcement lever at compose time (Step 1f).

### Two-class notebook contract (AC-6)

| Class | Agents | Contract | Cap |
|---|---|---|---|
| OVERWRITE | po (≤50L), market-watcher (≤80L) | Full-file replace each cycle; no section accumulation; preamble + 1 section only | Template IS the cap; post-write `wc -l` guard fails-loud if exceeded |
| APPEND | unified-agent/CHEF, news-scout, bctc-analyst, agents-architect, digest-predict, fb-market-poster | Section-append + AC-2/AC-3 retention (last 3 `##` sections) + AC-2b intra-section prune + AC-5 wc gate | ≤200L file; ≤60L per section |

**AC-2b — intra-section prune for permanent accumulator headings**

For APPEND-class agents that maintain a permanent named heading (e.g. `## Prior cycles`) whose body accumulates `### ` sub-blocks across cycles:
1. During AC-3 Step 1e (in-memory, before any write): count `### ` sub-blocks inside the permanent heading block in the composed body.
2. If count ≥ 4 → drop the **oldest** `### ` sub-block from the in-memory body (heading line through next `### ` or `## ` boundary).
3. This is done IN MEMORY as part of the single compose-then-write sequence — NOT as a separate Edit call after the settled write.

**Note:** `po` uses OVERWRITE intentionally (single-session state, no historical accumulation). CHEF/developer use APPEND intentionally (rolling history). These are different classes — not a contradiction.

### Commit — retry on lock collision (F4)

```bash
# idiom → docs/protocols/head-lock-self-cure.md § F4 — Git Commit Retry Wrapper
git_commit_retry -m "chore(memory/<agent-id>): cycle <NNN> <YYYY-MM-DD>"
```

> Requires `$PROJECT_ROOT` set by skill: `.claude/skills/project-root/SKILL.md`
