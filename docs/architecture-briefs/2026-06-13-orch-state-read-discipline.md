<!-- size-justification: 290L — operator-directed discipline brief (ORCH-STATE-READ-DISCIPLINE). All content load-bearing for agent-father handoff: §A SSOT decision + canonical rule + jq recipes, §B guard sentence, §C copy-pasteable edit inventory (12 file:line changes), §D acceptance tests. -->

# Architecture Brief — ORCH-STATE-READ-DISCIPLINE

**Date:** 2026-06-13
**Author:** agents-architect
**Status:** DESIGN COMPLETE — handoff to agent-father
**Problem class:** Token-burn leak — full-file model Read of a 933KB / ~233K-token JSON

---

## 0. Problem Statement

`docs/data/orch/orch-state.json` is now 933 KB / 10,708 lines / ~233K tokens.

Any agent that opens it with the Read tool — or assigns `CURRENT=$(cat docs/data/orch/orch-state.json)` to a shell variable piped back into model context — burns ~233K tokens in one shot, consuming 23% of a 1M-context window for state that is almost never needed in full.

Two literal full-file shell reads verified at time of writing:
- `docs/agents/dev-team/flow/main.md:169` — `CURRENT=$(cat docs/data/orch/orch-state.json)` (contradicts the comment on L167: "Read ONLY head block ~150 tokens")
- `.claude/skills/signal-dashboard/dashboard-protocol.md:26` (WRITE procedure), L87, L96, L142 — four `cat` calls loading the full file

Additional "Read … extract" phrasings in flow files that a model can execute as a Read-tool full-load:
- `docs/agents/system-auditor/handlers.md:40` — "Read `docs/data/orch/orch-state.json`. Extract `.head.active_task_id`"
- `docs/agents/system-auditor/handlers.md:48` — "Read `$PROJECT_ROOT/docs/data/orch/orch-state.json` … Extract `.task_board…`"
- `docs/agents/pm/flow/main.md:124` — "Read docs/data/orch/orch-state.json (do NOT use any cached snapshot)"
- `docs/protocols/smart-compact-protocol-offload.md:52` — "Re-read `docs/data/orch/orch-state.json .task_board`"

Shell `cat` reads that are write-side operations (bash context, not model context — still emit the full file to a shell variable):
- `docs/agents/po/flow/telegram-reports.md:82` — `cat … | jq '.task_board | …'`
- `docs/agents/po/flow/channel-audit.md:60` — `cat … | jq '.task_board.active_sprints[].tasks[] | …'`
- `.claude/skills/signal-dashboard/dashboard-protocol.md:26,87,96,142` — four `cat` calls

**Write side is SAFE** — the §2.3 atomic-write protocol in `docs/architecture-briefs/2026-06-01-orch-state-consolidate.md` uses `cat` inside a bash-only pipeline (`CURRENT=$(cat …)` then `echo "$CURRENT" | jq …`); the result is never surfaced to the model. Leave §2.3 write semantics unchanged.

---

## A. SSOT Home Decision

**Decision: `docs/standards/orch-state-access.md` (new file)**

Rationale:
- `docs/architecture-briefs/2026-06-01-orch-state-consolidate.md §2.4` would embed a read-access rule inside a migration brief — wrong layer. Briefs are historical design records, not living standards.
- `docs/standards/` already hosts living operational rules (`mcp-tools.md`, `task-schema.md`, `task-size-rules.md`). Read-access discipline belongs in the same tier.
- A dedicated `orch-state-access.md` is discoverable by any agent doing `lazy_load` on system standards and is easily cross-referenced with a single pointer sentence rather than an inline copy.
- The consolidate brief §2.3 (write protocol) is NOT touched — it remains in the brief as the write-side SSOT.

### Canonical rule (to be placed in §1 of `docs/standards/orch-state-access.md`)

```
ORCH-STATE READ RULE: Never open docs/data/orch/orch-state.json with the Read tool and never cat it to stdout; always extract the needed slice via `jq -c '.<section>'` in Bash.
```

### Canonical jq recipes (§2 of `docs/standards/orch-state-access.md`)

| Needed data | Recipe | Token budget |
|---|---|---|
| `.head` routing fields | `jq -c '.head' docs/data/orch/orch-state.json` | ~150 tokens |
| `.task_board` task count gate | `jq '[.task_board.active_sprints[].tasks[]] \| length' docs/data/orch/orch-state.json` | ~5 tokens |
| `.task_board` open tasks by status | `jq '[.task_board.active_sprints[].tasks[] \| select(.status=="TODO" or .status=="IN_PROGRESS")]' docs/data/orch/orch-state.json` | ~500 tokens typical |
| `.task_board` single task lookup | `jq --arg id "<task_id>" '.task_board.active_sprints[].tasks[] \| select(.task_id==$id or .id==$id)' docs/data/orch/orch-state.json` | ~50 tokens |
| `.task_board` done-task dedup search | `jq --arg kw "<keyword>" '[.task_board \| (.active_sprints[].tasks[], .backlog[], .archive[]) \| select(.status=="DONE" and (.title \| test($kw;"i")))]' docs/data/orch/orch-state.json` | ~200 tokens typical |
| `.sprint_goal` current sprint | `jq '.sprint_goal.entries[0]' docs/data/orch/orch-state.json` | ~80 tokens |
| `.signal_queue` NEW rows (two-phase READ) | See `.claude/skills/signal-dashboard/dashboard-protocol.md § READ Phase 2` — do NOT duplicate here | ~200 tokens |
| `.head.status` guard only | `jq -r '.head.status' docs/data/orch/orch-state.json` | ~3 tokens |

**Write recipe cross-reference:** `docs/architecture-briefs/2026-06-01-orch-state-consolidate.md §2.3` — do NOT copy here.
**Signal-queue READ cross-reference:** `.claude/skills/signal-dashboard/SKILL.md § READ` — do NOT copy here.

---

## B. One-Line Guard Text

Every high-risk flow reference should adopt exactly this sentence (or point to the SSOT):

> `Slice via jq — never open docs/data/orch/orch-state.json with the Read tool or cat it to stdout; see docs/standards/orch-state-access.md §1.`

This is the DRY propagation unit. All 12 edits in §C either replace a prohibited pattern with the correct jq recipe, or add a pointer to this rule.

---

## C. Edit Inventory

Agent-father: apply every item below. `(a)` = replace cat with jq slice; `(b)` = add guard sentence; `(c)` = replace "Read … extract" phrasing with explicit `jq -c` recipe.

### C-1 · docs/agents/dev-team/flow/main.md:167–175 — (a)

**Current (L167–175):**
```
Read ONLY `head` block from `docs/data/orch/orch-state.json` for routing (~150 tokens):
```bash
CURRENT=$(cat docs/data/orch/orch-state.json)
head_status       = $(echo "$CURRENT" | jq -r '.head.status')
head_active_task  = $(echo "$CURRENT" | jq -r '.head.active_task_id')
head_next_agent   = $(echo "$CURRENT" | jq -r '.head.next_agent')
head_next_action  = $(echo "$CURRENT" | jq -r '.head.next_action')
head_updated_at   = $(echo "$CURRENT" | jq -r '.head.updated_at')
```
```

**Replace with:**
```
Slice `.head` from `docs/data/orch/orch-state.json` (~150 tokens — see `docs/standards/orch-state-access.md §1`):
```bash
# NEVER cat the full file — jq slice only
HEAD=$(jq -c '.head' docs/data/orch/orch-state.json)
head_status       =$(printf '%s' "$HEAD" | jq -r '.status')
head_active_task  =$(printf '%s' "$HEAD" | jq -r '.active_task_id')
head_next_agent   =$(printf '%s' "$HEAD" | jq -r '.next_agent')
head_next_action  =$(printf '%s' "$HEAD" | jq -r '.next_action')
head_updated_at   =$(printf '%s' "$HEAD" | jq -r '.updated_at')
```
```

**Note:** The `cat docs/data/orch/orch-state.json` on L169 is eliminated; the `$CURRENT` intermediary is not needed. Downstream reads of `.task_board` at L183–185 already use `docs/data/orch/orch-state.json` directly in jq — those are safe and unchanged.

---

### C-2 · .claude/skills/signal-dashboard/dashboard-protocol.md:24–27 — (a)

**Section:** WRITE procedure, Step 1 "Read current state"

**Current (L24–27):**
```
# 1. Read current state
CURRENT=$(cat docs/data/orch/orch-state.json)
```

**Replace with:**
```
# 1. Read current state — NEVER cat full file to model context; bash-only pipeline is safe here
#    (This cat runs inside a bash write-path pipeline, not surfaced to the model.
#     Rule: docs/standards/orch-state-access.md §1)
CURRENT=$(cat docs/data/orch/orch-state.json)
```

**Rationale:** The WRITE procedure `cat` calls (L26, L87, L96, L142) happen inside bash pipelines (`echo "$CURRENT" | jq …`) — the result is never surfaced to the model's context. They are safe for token budget, but they are confusing because they look identical to the forbidden pattern. Add an explicit comment on L26 clarifying the distinction. L87, L96, L142 get the same comment prefix. This is a documentation fix, not a behavioral change.

---

### C-3 · .claude/skills/signal-dashboard/dashboard-protocol.md:85–89 — (b) comment

**Current (L87):**
```
NEW_ROWS=$(cat docs/data/orch/orch-state.json | jq \
```

**Replace with:**
```
# bash-only pipeline — cat feeds jq, output never surfaced to model (rule: docs/standards/orch-state-access.md §1)
NEW_ROWS=$(cat docs/data/orch/orch-state.json | jq \
```

Same treatment for L96 and L142 (identical pattern in MARK-READ and PRUNE blocks).

---

### C-4 · docs/agents/system-auditor/handlers.md:40 — (c)

**Current (L40):**
```
Read `docs/data/orch/orch-state.json`. Extract `.head.active_task_id` (may be null).
```

**Replace with:**
```
Slice `.head` via jq (see `docs/standards/orch-state-access.md §1`):
```bash
head_active_task=$(jq -r '.head.active_task_id // empty' docs/data/orch/orch-state.json)
```
```

---

### C-5 · docs/agents/system-auditor/handlers.md:48 — (c)

**Current (L48):**
```
Read `$PROJECT_ROOT/docs/data/orch/orch-state.json` (absolute path — NEVER use relative path; CWD may have drifted). Extract `.task_board.active_sprints[].tasks[]`. For each held lock from Step R-1:
```

**Replace with:**
```
Slice `.task_board` via jq (absolute path — CWD may have drifted; see `docs/standards/orch-state-access.md §1`):
```bash
TASKS=$(jq -c '[.task_board.active_sprints[].tasks[]]' "$PROJECT_ROOT/docs/data/orch/orch-state.json")
```
For each held lock from Step R-1:
```

---

### C-6 · docs/agents/pm/flow/main.md:121–135 — (b)

The Signal Queue Write Guard at L121–135 instructs "Read docs/data/orch/orch-state.json" in a numbered step (L124). This is a bash-only write guard — the result is piped through jq, never surfaced to the model. However the phrasing is ambiguous.

**Current (L124):**
```
1. Read docs/data/orch/orch-state.json (do NOT use any cached snapshot from earlier in this cycle)
```

**Replace with:**
```
1. Slice `.head.status` via jq — NEVER use Read tool (see `docs/standards/orch-state-access.md §1`):
   ```bash
   head_status=$(jq -r '.head.status' docs/data/orch/orch-state.json)
   ```
```

The remaining steps (2–4) reference `head_status` by value and are unchanged.

---

### C-7 · docs/agents/pm/flow/main.md:39–41 — (b) comment

**Current (L39–41):**
```bash
TASK_COUNT=$(cat "$PROJECT_ROOT/docs/data/orch/orch-state.json" | jq '[.task_board.active_sprints[].tasks[]] | length')
```

**Replace with:**
```bash
# jq slice only — NEVER cat full file to model context (rule: docs/standards/orch-state-access.md §1)
TASK_COUNT=$(jq '[.task_board.active_sprints[].tasks[]] | length' "$PROJECT_ROOT/docs/data/orch/orch-state.json")
```

Remove the `cat | jq` antipattern; `jq` accepts the filename directly.

---

### C-8 · docs/protocols/smart-compact-protocol-offload.md:52 — (c)

**Current (L52):**
```
3. Re-read `docs/data/orch/orch-state.json .task_board` for current task states
```

**Replace with:**
```
3. Slice `.task_board` via jq for current task states (see `docs/standards/orch-state-access.md §1`):
   ```bash
   TASKS=$(jq -c '[.task_board.active_sprints[].tasks[]]' docs/data/orch/orch-state.json)
   ```
```

---

### C-9 · docs/agents/po/flow/telegram-reports.md:82 — (b) comment

**Current (L82):**
```bash
cat docs/data/orch/orch-state.json | jq '.task_board | (.active_sprints[].tasks[], .backlog[], .archive[]) | select(.title | test("<keywords>"; "i"))'
```

**Replace with:**
```bash
# jq slice — bash-only; never pipe full file into model context (rule: docs/standards/orch-state-access.md §1)
jq --arg kw "<keywords>" '.task_board | (.active_sprints[].tasks[], .backlog[], .archive[]) | select(.title | test($kw; "i"))' docs/data/orch/orch-state.json
```

Remove `cat |`; `jq` accepts file directly.

---

### C-10 · docs/agents/po/flow/channel-audit.md:60 — (b) comment

**Current (L60):**
```bash
cat docs/data/orch/orch-state.json | jq '.task_board.active_sprints[].tasks[] | select(.status=="DONE" and (.title | test("<keyword>"; "i")))'
```

**Replace with:**
```bash
# jq slice only (rule: docs/standards/orch-state-access.md §1)
jq --arg kw "<keyword>" '.task_board.active_sprints[].tasks[] | select(.status=="DONE" and (.title | test($kw; "i")))' docs/data/orch/orch-state.json
```

---

### C-11 · docs/agents/tools/package/pm.md:10,38 — (b) guard line

Both lines say "Read `docs/data/orch/orch-state.json .task_board`" as a tool capability description. Add the guard:

**L10:** Change `Read \`docs/data/orch/orch-state.json .task_board\`` → `jq-slice \`docs/data/orch/orch-state.json .task_board\` (see docs/standards/orch-state-access.md §1 — never Read-tool full file)`

**L38:** Change `Read + jq: docs/data/orch/orch-state.json .task_board` → `jq-slice only: docs/data/orch/orch-state.json .task_board (never Read-tool full file — docs/standards/orch-state-access.md §1)`

---

### C-12 · NEW FILE — docs/standards/orch-state-access.md

Agent-father creates this file with the content below. This is the SSOT that all other pointers reference.

```markdown
<!-- size-justification: 60L — living standard, single rule + jq recipe table + cross-refs. -->

# orch-state Access Standard

**Load when:** any agent or flow reads from `docs/data/orch/orch-state.json`.

---

## §1 — Read Rule (mandatory)

**ORCH-STATE READ RULE:** Never open `docs/data/orch/orch-state.json` with the Read tool and never cat it to stdout for model consumption. Always extract the needed slice via `jq -c '.<section>'` in Bash. The file is ~933KB / ~233K tokens — a full Read burns 23% of a 1M context.

Exception: `CURRENT=$(cat docs/data/orch/orch-state.json)` inside a **bash-only write pipeline** (result fed back through `jq` and never printed to stdout or returned to the model) is permitted — see `docs/architecture-briefs/2026-06-01-orch-state-consolidate.md §2.3`. Mark such lines with comment `# bash-only pipeline — not surfaced to model`.

---

## §2 — Canonical jq Recipes

| Needed data | Recipe | Token budget |
|---|---|---|
| `.head` routing fields | `jq -c '.head' docs/data/orch/orch-state.json` | ~150 tokens |
| `.head.status` guard only | `jq -r '.head.status' docs/data/orch/orch-state.json` | ~3 tokens |
| `.task_board` task count | `jq '[.task_board.active_sprints[].tasks[]] \| length' docs/data/orch/orch-state.json` | ~5 tokens |
| `.task_board` open tasks | `jq '[.task_board.active_sprints[].tasks[] \| select(.status=="TODO" or .status=="IN_PROGRESS")]' docs/data/orch/orch-state.json` | ~500 tokens typical |
| `.task_board` single task lookup | `jq --arg id "<task_id>" '[.task_board.active_sprints[].tasks[] \| select(.task_id==$id or .id==$id)]' docs/data/orch/orch-state.json` | ~50 tokens |
| `.task_board` dedup keyword search | `jq --arg kw "<kw>" '[.task_board \| (.active_sprints[].tasks[], .backlog[], .archive[]) \| select(.title \| test($kw;"i"))]' docs/data/orch/orch-state.json` | ~200 tokens typical |
| `.sprint_goal` current sprint | `jq '.sprint_goal.entries[0]' docs/data/orch/orch-state.json` | ~80 tokens |
| `.signal_queue` NEW rows | See `.claude/skills/signal-dashboard/dashboard-protocol.md § READ` | ~200 tokens |

---

## §3 — Cross-References

- Write protocol (atomic temp-file-then-rename): `docs/architecture-briefs/2026-06-01-orch-state-consolidate.md §2.3`
- Signal-queue READ (two-phase delta): `.claude/skills/signal-dashboard/SKILL.md § READ`
- Signal-queue WRITE: `.claude/skills/signal-dashboard/dashboard-protocol.md § WRITE`
```

---

## D. Acceptance Tests

After agent-father applies all §C edits:

**D-1 (mandatory):**
```bash
grep -rn "cat docs/data/orch/orch-state.json" docs/ .claude/ | grep -v "# bash-only pipeline"
```
Expected: 0 hits. Any remaining `cat` line without the `# bash-only pipeline` comment is a violation.

**D-2:**
```bash
grep -rn "CURRENT=\$(cat docs/data/orch/orch-state.json)" docs/ .claude/ | grep -v "architecture-briefs"
```
Expected: 0 hits outside architecture-briefs (the §2.3 brief retains its example as a write-side reference).

**D-3:**
```bash
grep -rn "Read \`docs/data/orch/orch-state.json\`\." docs/ .claude/ | grep -v "orch-state-access.md"
```
Expected: 0 hits (bare "Read … extract" phrasing eliminated from all flow files).

**D-4:**
```bash
ls docs/standards/orch-state-access.md && jq . docs/standards/orch-state-access.md 2>/dev/null; echo "file exists"
```
Expected: file exists (not JSON — this just confirms presence).

**D-5 (functional — run after edits):**
```bash
HEAD=$(jq -c '.head' docs/data/orch/orch-state.json)
printf '%s' "$HEAD" | jq -r '.status'
```
Expected: non-empty string (the canonical C-1 recipe works on the live file).

---

## E. Scope Boundary

**Not in scope (write side — leave unchanged):**
- `docs/architecture-briefs/2026-06-01-orch-state-consolidate.md §2.3` — write SSOT with its `cat`-in-bash example
- `apps/mcp-server/src/**` TypeScript writers — they use `writeOrchStateAtomic()`, no model context risk
- Signal-dashboard WRITE `cat` calls inside bash pipelines — annotated with `# bash-only pipeline` comment per C-2/C-3 (behavioral change only if model reads the output, which they do not)

**Not in scope (signal-dashboard READ — already compliant):**
- `.claude/skills/signal-dashboard/SKILL.md § READ` already has the two-phase delta-read pattern; no change needed there

---

_Brief owner: agents-architect. Implementation routing: agent-father (all 12 items in §C)._
