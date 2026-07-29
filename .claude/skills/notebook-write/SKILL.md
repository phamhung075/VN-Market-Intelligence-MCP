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

**`c<NNN>` generation rule (FIX-AGENT-NOTEBOOK-UUID-PROVENANCE) — MANDATORY.**
`NNN` MUST be one of:
(a) a literal incrementing decimal counter, continuing from the highest existing
    `c<NNN>` already in the file (e.g. prior `c125` → next `c126` — see
    `docs/agent-memory/notebooks/bctc-analyst.md` for the reference-correct
    pattern), or
(b) a fixed constant SOURCE label already declared for that write path (e.g.
    `## d4-auto · <ts>`), identifying the MECHANISM, not the cycle.

**FORBIDDEN, no exceptions:** deriving the token from `$CLAUDE_CODE_SESSION_ID`,
`owner_client_session`, `coordination_session`, or ANY fragment of a
per-invocation UUID/session identifier. A session id is an operational
coordination parameter ONLY — never author it into a committed file. This
substitution is the confirmed root cause of a recurring session-UUID leak
(e.g. `## ad265f86 · ...` in `docs/agent-memory/notebooks/system-auditor.md`):
the writer treated the session id's first 8 hex chars as a valid stand-in for
`<NNN>` because no generation rule was specified. If unsure which of (a)/(b)
applies for your agent, check the AC-6 table below for its existing
convention before writing a new heading.

### Retention rule (AC-2)

Keep: current cycle + 2 prior `## ` sections = last 3 total, ALWAYS — this is
the converging steady state, not a per-cycle delta.
Prune: WHILE the section count (current + retained) exceeds 3, drop the
oldest (bottom-most) `## ` block in memory, one at a time, recounting after
each drop — repeat until exactly 3 remain or fewer sections exist. A single
"drop one, stop" pass is NOT sufficient: if the file entered the cycle already
over 3 sections (e.g. a prior cycle under-pruned), one drop leaves it over cap
again next cycle and the file never converges. This WHILE form is the
authoritative reconciliation with AC-3 Step 1d below — AC-2's steady state of
3 sections is normative; Step 1d is worded as a loop, not a single conditional
drop, specifically so it can reach that steady state from any starting count.
Never prune if the file already has ≤ 3 sections. Preamble (before first
`## `) is never pruned.

### IMMUTABILITY INVARIANT (AC-2a) — the data-loss fix

Any `## ` section that survives a cycle (i.e. is neither the brand-new
current-cycle section nor a section dropped whole under AC-2) MUST be
byte-identical, heading through the line before the next `## ` or EOF, before
and after the write. The ONLY authorized mutations to existing notebook
content are: (1) dropping a whole oldest `## ` block (AC-2); (2) the AC-2b
intra-prune of a named permanent-accumulator heading's oldest `### `
sub-block; (3) trimming the CURRENT cycle's OWN new section to ≤60L (Step
1c below) — this never touches a prior section, only the section being
built. No other edit to a retained section is authorized: not
re-summarising, not compacting a bullet list, not dropping a sub-line. If a
retained section must shrink for cap pressure (e.g. `CLEAN-NB-TRIM-*` work),
the correct pattern is to DROP the whole section (moved verbatim to an
archive doc if it must be preserved) and add a NEW section/marker recording
what was dropped and why — see `docs/agent-memory/notebooks/architect.md`
for the reference-correct example. NEVER shrink a retained section's body in
place: that is indistinguishable, in the final diff, from silent data loss,
which is exactly why this class went undetected for multiple cycles
(measured recurrence across ≥5 of the last 12 `system-auditor` notebook
commits — `FIX-NOTEBOOK-COMPOSE-REWRITES-RETAINED-PRIOR-SECTIONS`). A
pre-commit mechanical gate (`scripts/git-hooks/pre-commit`
`_check_notebook_immutability`) enforces this for every APPEND-class notebook
(AC-6) by hashing each `## ` section in HEAD vs staged content and rejecting
the commit if any heading present on both sides has a different body hash.
Prose alone was already tried on this exact class and failed — the hook is
the control; the prose above only explains how to stay on its happy path.

### Write operation (AC-3) — ATOMIC settled-write invariant

**Invariant: compose the final ≤200L body entirely in memory, then land it in ONE Write/Edit.
NEVER append-then-trim across two writes — every PostToolUse hook must see a file ≤200L.**

**Step 1 — Compose in memory (no file write yet):**

a. Read full notebook into memory.
b. Identify preamble (before first `## `) and all `^## ` section boundaries.
c. Trim the CURRENT cycle's new section to ≤60L FIRST — always, unconditionally,
   before it is counted toward retention/cap arithmetic. This is the FIRST rung
   of the cap-pressure ladder, not a fallback inside the >200L branch below —
   skipping it and instead compacting OLDER retained sections to pay for an
   over-cap new section is the exact defect AC-2a forbids.
d. WHILE (in-memory section count, current new section included) > 3: drop the
   oldest (bottom-most) `## ` block in memory (heading + content to next `## `
   or EOF), recounting after each drop. Repeat until ≤3 sections remain (AC-2
   steady state) or fewer exist.
e. Append the (already ≤60L) new section to the in-memory body, per the
   agent's declared NEWEST-FIRST/OLDEST-FIRST convention for that file
   (whichever order is declared must stay consistent within the file).
f. AC-2b: if any permanent accumulator heading now has ≥4 `### ` sub-blocks, drop the oldest sub-block in memory.
g. Count in-memory lines. If still > 200L after d–f (only possible when 3
   sections at ≤60L each plus a large preamble still exceed 200L): drop the
   next-oldest `## ` block, recount; repeat until ≤200L or only preamble + 1
   section remain. This is a BACKSTOP, not the primary mechanism — if c and d
   were followed correctly this branch should almost never fire (3×60L =
   180L, comfortably under 200L for a normal preamble).
h. In-memory body is now the final settled content (≤200L guaranteed, and
   every retained section byte-identical to its Step 1a pre-write form per
   AC-2a).

**Step 2 — Single settled write:**

```
Edit(file=<notebook_path>,
     old_string=<entire current file content verbatim>,
     new_string=<final settled body from Step 1>)
```

One Edit call. PostToolUse fires exactly once, sees ≤200L.
Alternative: `Write(path=<notebook_path>, content=<final settled body>)` — same guarantee.

**Forbidden:** any 2-Edit sequence where the file exceeds 200L after the first Edit.
**Forbidden (AC-2a):** landing a Step 2 write where any retained section's text
differs from its Step 1a pre-write form for a reason other than the 3
authorized mutations listed in AC-2a above.

### Blank-state fallback (AC-4)

If `grep -c "^## "` returns 0 → single Write to initialize:
```
Write(path=<notebook_path>, content="# <Agent> — Notebook\n\n## c<NNN> · <ISO>\n<content>")
```

### ≤200L gate (AC-5)

After the single settled write, verify as a BLOCKING gate:
```bash
NB_LINES=$(wc -l < "$NOTEBOOK_PATH" | tr -d ' ')
[ "$NB_LINES" -gt 200 ] && echo "[notebook-write] BUG: compose logic failed — MUST recompose until ≤200L"
```
AC-5 is a BLOCKING gate. If the composed body exceeds 200L after Step 1, the agent MUST recompose (return to Step 1g, drop the next-oldest section) and re-run Step 1g until ≤200L — do not land the write with an over-cap file, and NEVER pay the overage out of a retained section's content (AC-2a). The PostToolUse hook `scripts/agents-flow/notebook-auto-prune.sh` backstops this gate at write time; if the hook prunes the file, it means AC-3 Step 1 failed — treat as a BUG in the composing agent's flow. The pre-commit hook `_check_notebook_immutability` (AC-2a) backstops the commit itself, independent of and stricter than this line-count gate.

### Two-class contract (AC-6)

| Class | Agents | Contract | Cap |
|---|---|---|---|
| OVERWRITE | po (≤50L), market-watcher (≤80L), orch-sentinel (≤80L) | Full-file replace each cycle; preamble + 1 section only | Template IS cap; post-write wc guard |
| APPEND | unified-agent/CHEF, news-scout, bctc-analyst, agents-architect, digest-predict, fb-market-poster, system-auditor, ops, ops-vps-fetch, ops-mainserver-fetch, developer, dev-technical-analysis, dev-macro-indicators, dev-mcp-server, dev-stock-price, dev-kinh-dich, dev-frontend, dev-pdf-extractor, dev-rag-service, dev-alert-engine, dev-api-gateway, dev-vps-crawls, dev-mainserver-crawls, qa, claude-manager-helper, pm, fixer, tran-ngoc-bau, code-janitor, ba, agent-father, alert-commander, architect, qa-responder, cowork-refactory-expert, market-analyst, idea-forge | AC-2 retention + AC-3 settled-write + AC-2b intra-prune + AC-5 wc gate | ≤200L file; ≤60L/section |

`po` uses OVERWRITE (single-session state); CHEF/developer use APPEND (rolling history). Not a contradiction.

### Commit — retry on lock collision (F4)

```bash
# → docs/protocols/head-lock-self-cure.md § F4
git_commit_retry -m "chore(memory/<agent-id>): cycle <NNN> <YYYY-MM-DD>"
```

> Requires `$PROJECT_ROOT` set by skill: `.claude/skills/project-root/SKILL.md`
