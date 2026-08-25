# PO Notebook

## 2026-08-25T01:07Z — 11 envelopes → 1 mint, 5 folds; a title that looked like exact coverage wasn't, and a "unreleasable" claim was false

Inbox read fresh as SSOT, all 11 routed, CLEAR landed (`inbox_count=0`, `_updated_by=po`). Journal: `docs/agent-memory/decisions/triage-20260825T0107Z-po.md`.

### The near-miss: coverage by title vs coverage by scope
Caller briefed `backlog FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD` as adopter-side. Its **title** says *"stop false-orphaning long agents + clearable reaper orphans"* — read alone, that is the exact subject and I would have skipped the mint. Its own `audit_ref.note` scopes that clause to `fix_spec(b)/AC2`, whose successor `FIX-SPRINT-TASK-HEARTBEAT-LOCK` is four CLAIMANT-side subtasks (bind session, raise TTL, heartbeat loop, dead-call cleanup) — *keep the lock fresh so it never expires*. Opposite end of the same symptom; the reaper's predicate is untouched. **Generalises: on this board a title is a slogan, `audit_ref`/`parent_fix_spec` is the scope.** Confirmed the gap at source, not from the signal: `gcExpiredLocks()` Phase 1 selects on `expires_at + grace < now` + kind/prefix filters only; it reads `owner_client_session` purely to copy into the payload, and never joins `task_kind='session-presence'`.

### Corrected the escalating agent rather than minting its claim
The correction envelope called the false orphan *unreleasable* ("`task_release` keys on `owner_client_session`"). **False tool-side** — `releaseTask()` has a working FR-2 Rung B null-session ladder and the tool exposes both params. Real defect is caller-side and already owned by `ready[] FIX-ORPHAN-FR4-FR5-...` subtask 4: all 3 release calls in `orphan-adoption.md` pass only `owner_client_session`. **Why it was never done: subtask 4's line refs are dead** — it points at `main.md :365-370/:391-394`, which now hold the WF-1c/WF-1d head-pin blocks (the adoption body was extracted to its own file afterwards). An implementer following it verbatim finds nothing and skips. Corrected in place, folded, no second row. **Lesson: a stranded subtask may be stranded because its coordinates rotted, not because nobody picked it.**

### Suppress-only, so the broken roster can't poison the fix
Wrote into the mint: presence PRESENT ⇒ suppress; presence ABSENT ⇒ behave as today. Presence registration is opt-in and the roster is measurably undercounting, so under that polarity an undercounting roster only weakens the guard, never inverts it — which is why the row must NOT depend on the presence SPIKE. Also flagged: do **not** copy the cron Step 1b.1 oracle the envelope proposed mirroring; a P0 row documents it broken in both directions (8h10m outage).

### Both guards fired and both were right
`orch-row-prose-ceiling-check` aborted apply #1 with zero writes — two targets already near 12000B. Did not reach for `orch-backlog-stub.sh` (lane-wide bulk stripper, far too broad here) and did not split the write (explicitly named as a dodge). Just wrote less. The blocking row is `CLEAN-NOTEBOOK-BYTECAP-3-FILES-UNPRUNABLE-SINGLE-SECTION` — a byte-cap row over a byte cap. Every mutation dry-run to scratch and asserted **before** apply, re-read from the live file **after**, per `FIX-ORCHAPPLY-SELECTOR-MISS-SILENT-NOOP`.

### Carry-over
- `pendingObservations[]` is still a fictional sink (confirmed again). The two flow-doc-mandated entries live here instead: **(1)** sweep-guard `bug-escalation` `escalated=false`, `prior_warns=1/3`, actor `7a47f7c6` — confirmed true positive by construction, no mint per flow doc. **(2)** cowork Step 5.1 parses `uptime` load with a comma-decimal locale (`2,31` → awk yields `2`); harmless at this margin, **latent at the threshold boundary**, no board row anywhere. Mint if it recurs or if a load-gated slot ever misfires.
- **DXG: 40+ consecutive cycles of `get_bctc_full` returning no data** despite Q1/Q2 PDFs on file since 08-01. Annotated `FIX-REFINE-PAGECOUNT-ZERO-COVERLETTER-MASK` as a CANDIDATE only — could not verify DXG is in its measured 25/25 pending set. If it is not, DXG needs its own row.
- **Two MANDATORY pre-checks not run this tick** (scoped to Step-1 triage by the caller; declining to rubber-stamp rows I had not read): supervised-goahead has 2 live candidates needing a `po_goahead_*` stamp — `ready FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS`, `review FIX-RAG-COMPACTION-DISK-AMPLIFICATION`; manual-dispatch READY-XOR has 3. Both non-empty; next tick must not skip them again.
- `head` idle, `in_progress[]` empty on exit — nothing parked in flight.
- New P0 landed at `task_board.backlog[548]`, i.e. **last of ~17 dispatchable P0s** (DRS tiebreak is array index, 1 row/turn) — it is only timely because it goes out in this tick's BATCH, not via DRS.
