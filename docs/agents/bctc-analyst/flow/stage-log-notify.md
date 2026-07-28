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

**5a. Notebook write** — APPEND class → skill: `.claude/skills/notebook-write/SKILL.md` (AC-3 settled-write; AC-5 gate)

Section template (≤10L):
```
## c<NNN> · <ISO-timestamp>
### Analysis Cycle (HH:MM–HH:MM UTC) — mode: routine | release | mixed
- Mode: routine | release | mixed (N routine + M release)
- Stocks: N | Critical findings: [list] | Chain validations: M
- Regime: REGIME | Max Deposit Rate: X.XX% | Valuation flags: [TICKER=verdict,...]
- [if release or mixed] Earnings: K tickers processed | Beat: X | Miss: Y | In-line: Z
```

**5d. Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/bctc-analyst.md]
git add docs/agent-memory/notebooks/bctc-analyst.md
git commit -m "chore(memory/bctc-analyst): notebook YYYY-MM-DD"
```

**5d-1. Published-marker guard (dedup vs peer double-post of the same slot's WORK telegram)** —
established practice since c120, not previously documented here:
```
task_claim(task_id="published:bctc-analyst-<slot_id>:<cycle_tick_ISO>", task_kind="sprint-task",
  owner_agent="bctc-analyst", owner_client_session=$CLAUDE_CODE_SESSION_ID, ttl_seconds=3600)
```
`claimed:true` → proceed to 5e (WORK telegram). `claimed:false` (peer already posted this slot) →
skip 5e, log `"[bctc-analyst] published-marker held by peer — WORK telegram skipped this cycle"` to
notebook carry-over instead.

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
(skip notebook-write AND session-log steps — both would duplicate the notebook composition already done in 5a-5e above and violate the AC-3 single-settled-write invariant; keep doc-self-heal + self-critique only)

## Deadline Watch
7 days before + missing → flag in session log
Day of + still missing → mark LATE
