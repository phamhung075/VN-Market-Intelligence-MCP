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

### Section anchor format (AC-1)

Any `## ` level-2 heading is a valid section boundary:

```
## c<NNN> · <YYYY-MM-DDThh:mmZ>   ← c-format (agent-father, bctc-analyst)
## <ISO-timestamp>                 ← timestamp (agents-architect)
## Session: <date> (<context>)     ← session (ops)
```

Detect sections: `grep -c "^## " notebook.md`
New sections SHOULD use `## c<NNN> · <ISO-timestamp>` format.

### Retention rule (AC-2)

Keep: current cycle + 2 prior `## ` sections = last 3 total.
Prune: all sections older than the 3rd-most-recent (heading + block to next `## ` or EOF).
Never prune if file has < 3 sections. Preamble (before first `## `) is never pruned.

### Write operation (AC-3) — ATOMIC settled-write invariant

**Invariant: compose the final ≤200L body entirely in memory, then land it in ONE Write/Edit.
NEVER append-then-trim across two writes — every PostToolUse hook must see a file ≤200L.**

**Step 1 — Compose in memory (no file write yet):**

a. Read full notebook into memory.
b. Identify preamble (before first `## `) and all `^## ` section boundaries.
c. If ≥ 3 sections: drop oldest `## ` block in memory (heading + content to next `## `).
d. Append new section (≤60L) to end of in-memory body.
e. AC-2b: if any permanent accumulator heading now has ≥4 `### ` sub-blocks, drop the oldest sub-block in memory.
f. Count in-memory lines. If > 200L: drop next-oldest `## ` block, recount; repeat until ≤200L or only preamble + 1 section remain. If current-cycle section > 60L: trim to 60L first.
g. In-memory body is now the final settled content (≤200L guaranteed).

**Step 2 — Single settled write:**

```
Edit(file=<notebook_path>,
     old_string=<entire current file content verbatim>,
     new_string=<final settled body from Step 1>)
```

One Edit call. PostToolUse fires exactly once, sees ≤200L.
Alternative: `Write(path=<notebook_path>, content=<final settled body>)` — same guarantee.

**Forbidden:** any 2-Edit sequence where the file exceeds 200L after the first Edit.

### Blank-state fallback (AC-4)

If `grep -c "^## "` returns 0 → single Write to initialize:
```
Write(path=<notebook_path>, content="# <Agent> — Notebook\n\n## c<NNN> · <ISO>\n<content>")
```

### ≤200L gate (AC-5)

After the single settled write, verify as a sanity check:
```bash
NB_LINES=$(wc -l < "$NOTEBOOK_PATH" | tr -d ' ')
[ "$NB_LINES" -gt 200 ] && echo "[notebook-write] BUG: compose logic failed — recompose + ONE more settled write"
```
AC-5 is a verification gate, NOT a remediation loop. If it fires, fix Step 1 and re-write once.

### Two-class contract (AC-6)

| Class | Agents | Contract | Cap |
|---|---|---|---|
| OVERWRITE | po (≤50L), market-watcher (≤80L) | Full-file replace each cycle; preamble + 1 section only | Template IS cap; post-write wc guard |
| APPEND | unified-agent/CHEF, news-scout, bctc-analyst, agents-architect, digest-predict, fb-market-poster, system-auditor | AC-2 retention + AC-3 settled-write + AC-2b intra-prune + AC-5 wc gate | ≤200L file; ≤60L/section |

`po` uses OVERWRITE (single-session state); CHEF/developer use APPEND (rolling history). Not a contradiction.

### Commit — retry on lock collision (F4)

```bash
# → docs/protocols/head-lock-self-cure.md § F4
git_commit_retry -m "chore(memory/<agent-id>): cycle <NNN> <YYYY-MM-DD>"
```

> Requires `$PROJECT_ROOT` set by skill: `.claude/skills/project-root/SKILL.md`
