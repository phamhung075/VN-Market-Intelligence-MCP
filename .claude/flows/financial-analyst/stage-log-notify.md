> Parent: [./cycle.md](./cycle.md)

# Financial Analyst — Stage 5: Notebook + Notify + Deadline

**5. Notebook commit**

> Invariant: timestamp = current UTC, never future, never speculative.

### Notebook timestamp guard
- Before writing `docs/agent-memory/notebooks/financial-analyst.md`, ALWAYS get current UTC via:
  ```
  date -u +"%Y-%m-%dT%H:%M:%SZ"
  ```
- Use the returned value verbatim — NEVER speculate, NEVER round to a future minute
- NEVER write entries for cycles that have not fired yet

Append to `docs/agent-memory/notebooks/financial-analyst.md`:
```
### Analysis Cycle (HH:MM–HH:MM)
- Stocks: N | Critical findings: [list] | Chain validations: M
- Regime: REGIME | Max Deposit Rate: X.XX% | Valuation flags: [TICKER=verdict,...]
```
**Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/financial-analyst.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/financial-analyst.md
git commit -m "chore(memory/financial-analyst): notebook YYYY-MM-DD"
```

**5b. WORK** — `send_telegram(channel="work", message=...)`:
```
[Financial Analyst] HH:MM UTC — N stocks analyzed
  Signals: X fundamental_validation | Critical: Y | Next: TIME
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

## Deadline Watch
7 days before + missing → flag in session log
Day of + still missing → mark LATE
