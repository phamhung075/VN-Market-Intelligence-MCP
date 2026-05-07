**Part of:** [Agent Creation Guide](../AGENT_CREATION_GUIDE.md)

---

## 6. Flow File Templates

### 6.1 Cowork Agent Flow (`.claude/flows/<agent-id>/cycle.md`)

```markdown
# <Agent Name> — Cycle Flow

**Tools:** `.claude/tools/package/<agent-id>.md`

> **Anti-hallucination:** `.claude/skills/anti-hallucination/SKILL.md`

## Input
Bootstrap (market context 24h, system status, agent signals)

## Output
<What this agent produces per cycle>

---

## Error Boundary

If ANY tool call fails after 1 retry:
1. `send_telegram(channel="bug", message="[<agent-id>] Step N failed: {one-line error}")`
2. Append to session log: `"Cycle HH:MM — BLOCKED at step N: {error}"`
3. **EXIT immediately.**

Your job = <concise job description>. Blocked = report + EXIT.

---

## How to Call Tools

ALL tools via MCP gateway:
```
mcp__claude_ai_gateway__call_tool(server: "vn-market", tool: "<name>", arguments: {...})
```

---

**0. Bootstrap** (L1b)
```
call_tool(server="vn-market", tool="get_cycle_bootstrap", arguments={ "agent_name": "<agent-id>" })
```
If fails -> BUG -> STOP.

**0b. Load notebook** (L1)
Read `docs/agent-memory/notebooks/<agent-id>.md`.
Scan `## Lessons learned` — apply relevant lessons this cycle.
Do NOT act on carry-over items yet — just load context.

**0c. Cross-team context** (L3 — only if this step needs it)
Read max 2 notebooks from `memory.reads_notebooks`.
Extract: `Current state` + `Lessons learned` sections only.
Cache useful facts in your `## Cross-team notes`.

**0d. Regime extraction** (from bootstrap, zero extra tool calls)
Parse macro data already in bootstrap response. Extract regime (TIGHTENING|EASING|NEUTRAL).
No extra tool call — data is in bootstrap context.

**0e. Adaptive thresholds** (optional — agents with `watch_thresholds`)
Adjust thresholds based on regime. Example: tighter thresholds during TIGHTENING.

**1. <Main Step 1>** (L2 — lazy-load knowledge if this step needs it)
<Tool calls and logic>

**2. <Main Step 2>**
<Tool calls and logic>

...

### Advanced Steps (used by specific agents — add when needed)

| Step | Agent | Purpose |
|------|-------|---------|
| **Nb. Historical context** | news-scout | `search_similar_context(query, limit=3)` for high-impact items |
| **Nb. Price-validation override** | alert-commander | If signal.confidence < threshold BUT price move is large -> escalate anyway |
| **Nb. chain_catalyst routing** | alert-commander | Special processing for crisis/macro signals -> route to all cowork agents |
| **After code: doc update + graphify** | developer | Update related docs, run `/graphify docs --update --no-viz` |

Add domain-specific steps between main numbered steps. Use `Nb.` notation (N = parent step, b = substep).

**N-4. Pre-send validation** (before every signal/report — [Section 18.1](guide-quality.md#181-output-self-validation-pre-send-check))
Schema valid? Values in range? Not a duplicate? -> If any fail, suppress + log.

**N-3. Lesson extraction + decision trace** ([Section 18.5](guide-quality.md#185-decision-trace-log-why-not-just-what))
Review this cycle. Log WHY each signal was fired/suppressed. Extract lessons:

| Ask yourself | Write if YES |
|-------------|-------------|
| Tool behaved unexpectedly? | `LESSON: <tool> — <what> -> <workaround>` |
| Wasted tokens retrying? | `LESSON: <pattern> — skip, do <alternative>` |
| Data in unexpected place? | `LESSON: <data> in <location>, not <expected>` |
| Cross-agent signal useful? | `LESSON: <agent> signals include <field> — use for <purpose>` |
| Found a shortcut? | `LESSON: <shortcut>` |

One line per lesson. Link to detail: `-> detail: <session-log-path> @ Cycle HH:MM`

**N-2. Session log** (append to `docs/agent-memory/sessions/YYYY-MM-DD-<agent-id>.md`)
```markdown
### Cycle (HH:MM-HH:MM)
- <Key metrics>
- Lessons: [count] new | Tokens saved by notebook: [estimate]
```

**N-1. WORK channel** (actionable, not just status)
```
[<Agent Name>] HH:MM UTC — <what happened>
  Found: <key finding other agents can use>
  For: <who should care> (<why>)
  Next: <when/what next cycle>
```

**N. BUG on error** (check `get_recent_fixes(limit=20)` first — skip duplicates)

**N-2.5. Cycle self-review** ([Section 18.6](guide-quality.md#186-cycle-self-review-quality-gate-before-notebook-write))
5 checks: coherence, grounding, completeness, calibration, drift. If >=2 fail -> flag in notebook.

**Notebook write** -> skill: `.claude/skills/notebook-write/SKILL.md`

**Doc self-heal** -> skill: `.claude/skills/doc-self-heal/SKILL.md` (own zone only)

**Registry check** -> verify all files created this cycle are in `document_registry.dynamic`
```

### 6.2 Dev Team Agent Flow (`.claude/flows/<agent-id>/main.md`)

```markdown
# <Agent Name> — Main Flow

**Tools:** `.claude/tools/package/<agent-id>.md`

## Input
`docs/handoffs/TASK_NNN.md` with prior context

## Output
Code + tests on branch | Implementation Record in handoff | Next agent notified

---

**Step 0a — Resolve project root** -> `.claude/skills/project-root/SKILL.md`

**Step 0b — Load notebook** (L1) -> `.claude/skills/notebook-read/SKILL.md`

**Step 0c — Cross-team context** (L3 — if task touches another agent's domain)
Read relevant notebooks. Use: current state + lessons only. Never edit.

**Pre-code checklist**
1. Confirm task in docs/TASKS.md
2. Branch setup (`task/NNN-kebab-description`)
3. Read `docs/handoffs/TASK_NNN.md`
4. `depends_on` not Done -> STOP, notify PM
5. Load knowledge (L2, fail-loud)
6. Zone restriction check
7. Understand existing code -> use `mcp__semble__search` (not blind grep) — see [Section 15](guide-skills-registration.md#15-skills-catalog)

**TDD workflow**
```
RED -> GREEN -> REFACTOR -> REPEAT
```

**After code**
1. Tests pass | 2. Type check clean | 3. Grounding check: does implementation match spec? ([Section 18.2](guide-quality.md#182-grounding-rule-no-hallucination-between-tool-calls)) | 4. Git commit

**Lesson extraction** — same as Section 6.1 Step N-3

**Append to handoff:**
```markdown
## [Developer] Implementation Record
- **Files modified/created:** [path:lines — description]
- **Tests written:** [path — assertion count, GREEN]
- **Git commits:** [hash message]
- **Type check:** clean | **Tests:** N pass / 0 fail
- **Docs updated:** [path] | NONE
- **Lessons:** [one-line lessons for QA/future devs]
```

**Session log** -> `append_session_record()`

**Notebook write** -> `.claude/skills/notebook-write/SKILL.md`

**Doc self-heal** -> `.claude/skills/doc-self-heal/SKILL.md` (own zone only)

**Registry check** -> verify all new files are in `document_registry`

**RETURN:**
```
DONE: <one sentence>
NEXT: <agent-name> | <what it must do>
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue | complete | blocked
QUALITY: full | partial | degraded    # (Section 18.4)
CONFIDENCE: high | medium | low       # (Section 18.3)
```
```
