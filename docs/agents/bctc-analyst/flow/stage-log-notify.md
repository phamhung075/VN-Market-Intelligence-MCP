> Parent: [./cycle.md](./cycle.md)

# BCTC Analyst — Stage 5: Notebook + Notify + Deadline

**5. Notebook commit (APPEND class — AC-3 + AC-5 inline)**

> Invariant: timestamp = current UTC, never future, never speculative.

### Notebook timestamp guard
- Before writing `docs/agent-memory/notebooks/bctc-analyst.md`, ALWAYS get current UTC via:
  ```
  date -u +"%Y-%m-%dT%H:%M:%SZ"
  ```
- Use the returned value verbatim — NEVER speculate, NEVER round to a future minute

**5a. Append new section** (≤60L) to `docs/agent-memory/notebooks/bctc-analyst.md`:
```
## c<NNN> · <ISO-timestamp>
### Analysis Cycle (HH:MM–HH:MM UTC) — mode: routine | release | mixed
- Mode: routine | release | mixed (N routine + M release)
- Stocks: N | Critical findings: [list] | Chain validations: M
- Regime: REGIME | Max Deposit Rate: X.XX% | Valuation flags: [TICKER=verdict,...]
- [if release or mixed] Earnings: K tickers processed | Beat: X | Miss: Y | In-line: Z
```

**5b. AC-3 prune** — after append, count `## ` sections:
```bash
SEC_COUNT=$(grep -c "^## " docs/agent-memory/notebooks/bctc-analyst.md)
# if SEC_COUNT >= 4: Edit-delete the oldest ## block (heading + body up to next ##)
```

**5c. AC-5 wc gate** (inline, mandatory before commit):
```bash
NB_LINES=$(wc -l < docs/agent-memory/notebooks/bctc-analyst.md | tr -d ' ')
if [ "$NB_LINES" -gt 200 ]; then
  echo "[bctc-analyst] GUARD: ${NB_LINES}L > 200 — prune additional section"
  # Edit-delete next-oldest ## block; trim current section if still >200
fi
```

**5d. Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/bctc-analyst.md]
git add docs/agent-memory/notebooks/bctc-analyst.md
git commit -m "chore(memory/bctc-analyst): notebook YYYY-MM-DD"
```

**5e. WORK** — `send_telegram(channel="work", message=...)`:

Routine-only format:
```
[BCTC Analyst] HH:MM UTC — mode: routine — N stocks analyzed
  Signals: X fundamental_validation | Critical: Y | Next: TIME
```

Release or mixed format:
```
[BCTC Analyst] HH:MM UTC — mode: release|mixed — N stocks analyzed, M earnings processed
  Beat: X | Miss: Y | In-line: Z | Signals: P fundamental_validation | Next: TIME
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`
(skip notebook-write step — already written above; keep session-log + doc-self-heal + self-critique)

## Deadline Watch
7 days before + missing → flag in session log
Day of + still missing → mark LATE
