> Parent: [./cycle.md](./cycle.md)

# BCTC Analyst — Stage 5: Notebook + Notify + Deadline

**5. Notebook commit (APPEND class — settled-write invariant)**

> Invariant: timestamp = current UTC, never future, never speculative.
> **AC-3 (settled-write invariant):** ONE settled write per cycle — now performed by the
> `scripts/notebook-compose.sh` actuator (§5a), never append-then-trim, never a narrated
> Write/Edit fallback. The model authors ONLY the new section's body.

### Notebook timestamp guard
- Before writing `docs/agent-memory/notebooks/bctc-analyst.md`, ALWAYS get current UTC via:
  ```
  date -u +"%Y-%m-%dT%H:%M:%SZ"
  ```
- Use the returned value verbatim — NEVER speculate, NEVER round to a future minute
- (No-Bash fallback REMOVED 2026-08-28 — FIX-BCTC-ANALYST-NOTEBOOK-COMPOSE-ACTUATOR: Bash is now
  scoped-granted, `date -u` is primary and authoritative; the MCP-`fetchedAt`/`computedAt`
  fallback was a workaround for the missing grant and is now false.)

**5a. Notebook write** — scripted actuator (FIX-BCTC-ANALYST-NOTEBOOK-COMPOSE-ACTUATOR, wired
2026-08-28): AC-1/AC-2/AC-2a/AC-3/AC-5 settled-write via `scripts/notebook-compose.sh` per skill:
`.claude/skills/notebook-write/SKILL.md`. Replaces the LLM-narrated compose that caused the AC-2
off-by-one (S51, FIX-NOTEBOOK-RETENTION-MANUAL-COMPOSE-DRIFT 2026-08-15 — settled at 2 sections
instead of 3, falsified 11 days later) — the model authors ONLY the new section's substantive
body; every retained section's bytes flow from disk to disk via bash the model never touches.
`c<NNN>` is derived in bash from the file's own headings, NEVER LLM-chosen and never
session-UUID-derived (FIX-AGENT-NOTEBOOK-UUID-PROVENANCE):

```bash
NB_PATH="docs/agent-memory/notebooks/bctc-analyst.md"
LAST_N=$(grep -oE '^## c[0-9]+' "$NB_PATH" | grep -oE '[0-9]+' | sort -n | tail -1)
NEXT_N=$(( ${LAST_N:-0} + 1 ))
UTC_STAMP="$(date -u +"%Y-%m-%dT%H:%MZ")"
```

Model authors ONLY the new section body (≤10L, template below) into a scratch file whose heading
line is machine-built, never freehand:

```bash
NEW_SECTION_FILE="$PROJECT_ROOT/docs/agent-memory/.bctc-analyst-newsection.tmp"
cat > "$NEW_SECTION_FILE" <<EOF
## c${NEXT_N} · ${UTC_STAMP}
<... the ≤10L template lines below, filled with THIS cycle's real values — nothing else ...>
EOF
```

ONE actuator call (max-sections=3 per AC-2; section-cap=60 per AC-2a — the bctc-analyst ≤10L
template is ample at 60, do NOT copy system-auditor's 150):

```bash
COMPOSE_OUT="$(bash scripts/notebook-compose.sh "$NB_PATH" "$NEW_SECTION_FILE" 3 60)"
COMPOSE_MARKER="$(printf '%s\n' "$COMPOSE_OUT" | grep '^\[notebook-compose\]' | head -1)"
rm -f "$NEW_SECTION_FILE"
```

**Verdict handling (branch on `$COMPOSE_MARKER`):**
- `OK ...` → the script already wrote the notebook. Proceed to **5d Commit** below, embedding
  `$COMPOSE_MARKER` verbatim in the commit message (this is the Verification Gate's
  runtime-execution proof — every post-fix commit is `git log --grep='notebook-compose'`-searchable).
- `WARN ...` (non-blocking: `new-section-trimmed-to-cap` / `direction-defaulted` /
  `ac2b-subblock-pruned`) → same as OK — an `OK` line always follows on the same run; proceed to
  **5d Commit**.
- `ABORT ...` (`single-section-overage` / `internal-invariant-violated`) → **notebook untouched by
  construction** (the script writes nothing on any ABORT). Send BUG telegram
  `[bctc-analyst] notebook-compose ABORT — <marker line>`. Log `[NOTEBOOK-GATE-ABORT]` for the
  next cycle. **Skip the commit** (nothing was staged). Continue the rest of the flow. NEVER fall
  back to a narrated Write/Edit of the notebook.
- `ERROR ...` (`bad-usage` / `notebook-not-found` / `new-section-file-not-found` /
  `new-section-empty` / `new-section-missing-heading` / `new-section-multiple-headings` /
  `tmpfile-write-failed` / `atomic-mv-failed`) → flow-wiring bug (unreachable if this rewire is
  implemented correctly). Send BUG telegram; continue the rest of the flow (do NOT abort the cycle).

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
git commit -m "chore(memory/bctc-analyst): notebook YYYY-MM-DD [${COMPOSE_MARKER#\[notebook-compose\] }]" -- docs/agent-memory/notebooks/bctc-analyst.md
```
`[${COMPOSE_MARKER#\[notebook-compose\] }]` embeds this cycle's own `notebook-compose.sh` stdout
marker (e.g. `[OK sections=3 dropped=1 lines=... bytes=... direction=newest_first]`) as a
bracketed commit-message suffix — this is the Verification Gate's runtime-execution proof
(`git log --grep='notebook-compose' -- docs/agent-memory/notebooks/bctc-analyst.md` returns every
post-fix commit), NOT a doc-grep on this file. Runs ONLY on the §5a `OK`/`WARN` path — on the
`ABORT` path the commit is skipped entirely (§5a), so a marker-bearing commit can only exist when
the actuator actually ran and wrote.

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
