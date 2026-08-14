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
- **No-Bash fallback (this agent has no Bash tool grant, per `project_bctc_analyst_no_bash_grant_perpetual_dirty_artifacts`):** use the `fetchedAt`/`computedAt` timestamp from the most recent live MCP tool response this cycle (e.g. `get_macro_snapshot`, `get_cycle_bootstrap`) instead of shelling out — established practice across prior cycles, now documented here.

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
git commit -m "chore(memory/bctc-analyst): notebook YYYY-MM-DD" -- docs/agent-memory/notebooks/bctc-analyst.md
```

**5d-1. Published-marker guard (Phase 2 only — no Phase 1, per skill's own design note: this
agent's extraction is the core deliverable independent of the WORK-channel notify this marker
dedups, so an early probe buys no cost-optimisation)** — dedup vs peer double-post of the same
slot's WORK telegram, established practice since c120 →
skill: `.claude/skills/published-marker-gate/SKILL.md` (agent-id=bctc-analyst).

Invoke Phase 2 with `MARKER_KEY="published:bctc-analyst-<slot_id>:<cycle_tick_ISO>"`,
`MARKER_TTL=3600`, `OWNER_AGENT="bctc-analyst"`. **UC-CCA-P3-FR3 task_kind normalization
(Q-taskkind, resolved YES):** `task_kind="cowork-slot"` — was `"sprint-task"`, the one gate of
the 6 that did not match the other 5; migration is bounded/self-healing (old-kind markers still
in flight simply drain within their remaining ≤1h TTL, no script needed).

**`<cycle_tick_ISO>` MUST be the NOMINAL slot fire time from the cron schedule (`0 15,18,21,0 * * *`
→ round DOWN to `HH:00Z`), never the agent's own observed bootstrap timestamp.** Two concurrent
sessions dispatched for the same slot will have different observed ticks (e.g. one starts 21:07Z,
another 21:09Z) — keying on the observed tick lets both claim distinct keys and both post to WORK,
defeating the dedup this guard exists for (live-observed 2026-07-30, slot-3 double-dispatch,
cycle_id 20260730-2100 — see notebook c133 addendum).
`claimed:true` → proceed to 5e (WORK telegram). `claimed:false` (peer already posted this slot) →
skip 5e, log `"[bctc-analyst] published-marker held by peer — WORK telegram skipped this cycle"` to
notebook carry-over instead. NEVER call `task_release` on success or any exit — TTL is the sole
expiry path (per skill Phase 2).

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

**End of cycle** → skill: `.claude/skills/end-0-cowork/SKILL.md`

## Deadline Watch
7 days before + missing → flag in session log
Day of + still missing → mark LATE
