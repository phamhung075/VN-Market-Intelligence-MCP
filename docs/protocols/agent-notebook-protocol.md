# Agent Personal Notebook Protocol

Each agent has a **personal notebook** — a freeform local file it reads at cycle start and writes to at cycle end. Think of it as a pocket notepad the agent carries between sessions.

---

## Location

```
docs/agent-memory/notebooks/<agent-id>.md
```

Examples:
- `docs/agent-memory/notebooks/developer.md`
- `docs/agent-memory/notebooks/po.md`
- `docs/agent-memory/notebooks/ops.md`

---

## Difference from session_log

| | session_log | notebook |
|---|---|---|
| Format | Structured, append-only | Freeform, overwrite allowed |
| Audience | Other agents, audit trail | Self only |
| Content | What happened | What I know / what to watch |
| Lifecycle | One file per date | One file per agent, persists indefinitely |

---

## What to write in the notebook

The notebook is for things the agent wants to remember **next time it runs**:

- **Recurring patterns**: "Foreign flow N/A every morning before 09:15 — not a bug, feed delay"
- **Known fragile areas**: "BCTC extraction fails for tickers with special chars — open issue"
- **Investigation state**: "Tracking slow briefing assembly — suspects macroTools.ts L88"
- **Shortcuts**: "VIC analysis brief is stale — was updated manually 2026-04-30"
- **Hypotheses**: "Alert spam correlates with BB scan running before price refresh — test next cycle"
- **Last known good state**: "All 9 containers healthy as of 2026-05-01 09:00"

Do NOT write:
- Full task reports (→ session_log)
- Code diffs (→ git)
- Sprint decisions (→ `docs/data/orch/orch-state.json` `.task_board` / `.sprint_goal`)

---

## How to use

### Cycle start — read notebook first
```
Read docs/agent-memory/notebooks/<agent-id>.md
```
If file missing → create it empty, continue.
Apply any relevant notes to current work before taking action.

### Cycle end — update notebook
Overwrite (not append) with current knowledge state. Keep it concise — max ~40 lines.
Structure freely, but suggested sections:

```markdown
# <Agent> Notebook — updated YYYY-MM-DD

## Watch list
- [thing to monitor and why]

## Known fragile
- [module/tool/ticker] — [symptom] — [workaround if any]

## Open hypotheses
- [hypothesis] — [evidence so far]

## Last known good
- [system component]: [state] as of [date]

## Notes
- [anything else worth remembering]
```

---

## Failure handling

If notebook read fails (file missing or empty):
- Create it: `Write docs/agent-memory/notebooks/<agent-id>.md` with empty template
- Do NOT stop the cycle — notebook is non-critical
- Do NOT send Telegram for notebook errors

If notebook write fails:
- Log to session_log only: `notebook write failed: <error>`
- Do NOT stop the cycle
