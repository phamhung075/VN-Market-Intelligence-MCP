> Parent: [./cycle.md](./cycle.md)

# BCTC Analyst — Stage 5: Notebook + Notify + Deadline

**5. Notebook commit (APPEND class — settled-write invariant)**

> Invariant: timestamp = current UTC, never future, never speculative.
> **AC-3: compose ≤200L body entirely in memory, then land in ONE Write/Edit. Never append-then-trim.**

### Notebook timestamp guard
- Before writing `docs/agent-memory/notebooks/bctc-analyst.md`, ALWAYS get current UTC via:
  ```
  date -u +"%Y-%m-%dT%H:%M:%SZ"
  ```
- Use the returned value verbatim — NEVER speculate, NEVER round to a future minute

**5a. Compose in memory (NO file write yet):**

Step 1 — Read full `docs/agent-memory/notebooks/bctc-analyst.md` into memory.
Step 2 — Identify preamble (before first `^## `) and all `^## ` section boundaries.
Step 3 — If ≥ 3 sections: drop oldest `## ` block (heading + body to next `## `) from in-memory body.
Step 4 — Build new section (≤60L) in memory:
```
## c<NNN> · <ISO-timestamp>
### Analysis Cycle (HH:MM–HH:MM UTC) — mode: routine | release | mixed
- Mode: routine | release | mixed (N routine + M release)
- Stocks: N | Critical findings: [list] | Chain validations: M
- Regime: REGIME | Max Deposit Rate: X.XX% | Valuation flags: [TICKER=verdict,...]
- [if release or mixed] Earnings: K tickers processed | Beat: X | Miss: Y | In-line: Z
```
Append new section to end of in-memory body.
Step 5 — Count in-memory lines. If > 200L: drop next-oldest `## ` block, recount; repeat until ≤200L. If new section > 60L: trim to 60L first.
Step 6 — Single settled write:
```
Write(path="docs/agent-memory/notebooks/bctc-analyst.md", content=<final settled body>)
```

**5b. AC-5 sanity check** (after the single write — verification only, NOT a remediation loop):
```bash
NB_LINES=$(wc -l < docs/agent-memory/notebooks/bctc-analyst.md | tr -d ' ')
[ "$NB_LINES" -gt 200 ] && echo "[bctc-analyst] BUG: compose logic failed — fix Step 5a and re-write once"
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
