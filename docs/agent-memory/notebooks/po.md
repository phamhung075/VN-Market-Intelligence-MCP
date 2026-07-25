# PO Notebook

_Last: 2026-07-25T12:34Z (dev-team Step 1 triage — broke the head=review wedge, returned 5-row BATCH, folded 2 signals into existing rows)_

## Tick 2026-07-25T12:27–12:34Z

| Input | Disposition |
|---|---|
| `.head = {status:"review", …}` wedging the whole dispatch chain | **RESET → idle** via `orch-apply.sh` — contract restoration, not a judgement call |
| Signal: agent_signals TTL 120m < alert-commander sweep 240m | **MINT** `FIX-AGENTSIGNALS-TTL-SHORTER-THAN-CONSUMER-CADENCE` (no prior art) |
| Signal: `promoteCycleSnapshot` HH:MM mismatch | **FOLD** → `UC-SDF-P2` (title already named it) — 0 rows minted |
| Finding B: drain-report prints `[PASS]` on 75 undrained rows | **MINT** `FIX-DRAINREPORT-PREDICATE-MEASURES-ARRIVAL-NOT-DRAINAGE` |
| Finding C: signal_queue PRUNE matches 0 rows | **FOLD** → `TE-T27` + sharpened root cause — 0 rows minted |
| Signal: pipeline-resume duplicate spawn | **MINT** `FIX-DISPATCHWRAP-LOCK-SPAWN-SCOPED-NOT-WORK-SCOPED` (P0) |
| 4× context-bloat (byte-cap, lines all under cap) | **MINT** `CLEAN-NOTEBOOK-BYTECAP-BREACH-20260725` — existing row is line-cap only |
| `FIX-PREDCLAIM-BACKFILL-NULL-CREATIONPRICE` (3d deadline) | `depends` **DELETED**, P1→**P0**, scope narrowed to deliverable (a) |
| Board totals | `task_total` 652→652 across 4 writes — conservation flat, nothing minted **on the board** |

**Ruling:** the binding constraint was never backlog depth, it was that `head.status=="review"` matches NO lane in Step 0b, so `BOUNDED-1 → SLS → RLC → QA-Drain` was unreachable and `in_progress`/`qa` were both 0. I reset head because `execute-tier.md § MUST (b)` — amended by the **already-shipped** `FIX-EXECTIER-HEADSYNC-BRANCHNULL-REVIEW-IDLE` (07-23, `020b9eeeeb`) — *already requires* `idle` for a `branch:null` REVIEW flip. Journal: `docs/agent-memory/decisions/triage-20260725T1207Z-po.md`.

## Lessons

- **⚠️ A shipped fix that is PROSE + a SYNTHETIC fixture is not a shipped fix.** `FIX-EXECTIER-HEADSYNC-BRANCHNULL-REVIEW-IDLE` amended a flow doc and added a verify script with a synthetic before/after fixture — both PASS. Two days later `dev-mcp-server` wrote `head.status="review"` anyway and wedged the board. I verified why: `HeadSchema.status` is `z.string()` + `.passthrough()` — **no enum, no validator, no gate anywhere.** The only enforcement was whether the writing agent happened to read the doc. Per `feedback_recurring_detection_vs_recurring_failed_fix`, a re-occurrence after a shipped fix is a *different* bug. Remedy must move enforcement from prose to `scripts/orch-apply.sh`, which CLAUDE.md already makes the mandatory single door.
- **⚠️ Ran the detector before trusting its verdict — it was lying.** `scripts/audits/devteam-review-lane-drain-report.sh` printed `[PASS] … drain is reaching this lane` while its own PRIMARY table listed **75 rows** and `qa[]==0`. **Two** independent defects in one predicate: (i) it is a disjunction — ONE row younger than 3d green-lights the lane; (ii) it ages rows by `updated_at`, a field bumped by **any** edit *including this very triage*, so it measures edit-recency, never drainage. Fixing only (i) leaves the instrument gameable by its own consumers.
- **Prior-art grep saved a duplicate mint, and the save came from my own carry-over.** I was about to mint the snapshot-promote row. Line 38 of last tick's carry-over pointed at `UC-SDF-P2`, whose **title already contains** "tickHHMM-vs-FILE_TICK filename divergence". **Grep the board on the mechanism words, not the symptom words** — I had searched `SNAPSHOT|PROMOTE|CYCLE-SNAPSHOT` on `.id` and got nothing; the row id is `UC-SDF-P2`.
- **`archive == 0` was the weak evidence; set-disjointness was the strong one.** PRUNE takes `status IN (READ, RESOLVED, SUPERSEDED)`; the live queue holds only `triaged` (124) + `RETRACTED` (1) — matches zero **by construction**, not by timing. I nearly filed "archive is empty" until noticing SKILL.md frontmatter says HSC-7 *removed* the archive lane, which makes an empty archive partly expected by design. **When two explanations fit, file the one the design cannot also produce.**
- **An unsatisfiable dependency is not a dependency, it is a deadline eater.** `FIX-PREDCLAIM-BACKFILL` depended on a row whose acceptance needs a **user-gated rebuild** with no authorization this session. Waiting to T-1 costs one permanently-unscoreable claim *per day* from 07-28. Deleted `depends` outright rather than overriding it, so `BOUNDED-1`/`RLC` cannot silently re-block.

## Carry-over

- **`FIX-DISPATCHWRAP-LOCK-SPAWN-SCOPED-NOT-WORK-SCOPED` is the highest-blast-radius row I minted.** CLAUDE.md says *all agents backgrounded by default*, and the dispatcher-wrap releases `task:<id>` on spawn-return — so the duplicate-spawn guard is unarmed for the **entire life of every task**, always. Session-scoping does not save it: the running agent is a subagent of the same session, so a re-claim reads re-entrant, not collision. Two code agents on one working tree.
- **Do NOT let QA close `FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT` via host CLI / direct sqlite.** Live acceptance is `REBUILD_REQUIRED` (user-gated, ask posted to WORK). Correct QA outcome while unrebuilt is **BLOCKED-ON-REBUILD**, never PASS (`feedback_host_cli_integrity_check_false_ok_verify_through_runtime`).
- **`UC-SDF-P2` must ship BEFORE `UC-CDC-P1`**, not with it. UC-CDC-P1's "decouple `stale_warning` from promotion refusal" treats a symptom of UC-SDF-P2's cause; with no candidate file ever found, the gate is not the binding constraint. Its **second** failure mode (on-grid file lacks `fetchedAt`/`created_at`) still stands — fixing only the name leaves it dark.
- **`FIX-AGENTSIGNALS-EXPIRED-GC-CRON` is in TENSION with my new TTL row** — it wants expired rows deleted *faster* (disk/retention); the new row says rows expire *before* their only consumer wakes. Whoever takes either must read both, or they will fight.
- **`ready[]` (44) and `review[]` (107, `qa[]`=0) are unchanged.** The wedge is now cleared, so the next tick is the first real test of whether the chain drains. **If `review[]` has not strictly decreased by the following tick, the QA-Drain consumer itself is broken** — not merely unreachable — and that is a new finding, not this one.
- Head is now `idle`. I dispatched no agent, touched no container. **Nothing pushed** — push stays gated.
