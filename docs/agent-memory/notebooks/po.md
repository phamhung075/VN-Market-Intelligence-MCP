# PO Notebook

_Last: 2026-07-25T14:31Z (dev-team Step 1 triage — signal_queue TRIAGED strand: 1 MINT + 1 launchd ACK; premise of the ask partly REFUTED)_

## Tick 2026-07-25T14:07–14:31Z

| Input | Disposition |
|---|---|
| Tick claim: `triaged` is an improvised status with NO contract (leg 1) | **REFUTED.** The grep was `'"triaged"'` — lowercase + double-quoted. The contract writes it uppercase, unquoted, in prose: `system-auditor/handlers.md:240`, `po/flow/scripts-registry.md:44`, `cron-db-data-integrity.md:130,138`. TRIAGED is canonical, deliberate, and **non-terminal by design** |
| Proposed fix (a): add `triaged`+`RETRACTED` to `TERMINAL_SIGNAL_STATUSES` | **REJECTED** — would evict rows whose tracked work is still open; contradicts all three contract sites |
| Proposed fix (b): strict `z.enum` on signal status ("the definitive fix") | **REJECTED** — already formally refuted 2026-07-12 (`ultracode-workflow-improvement-audit.md:1155` item 5). orch-apply Zod-validates the WHOLE doc, so one legit TRIAGED flip post-tightening hard-rejects **all** subsequent orch-state writes fleet-wide (`project_mcp_server_write_wedge`) |
| Real root cause | **MINT** `FIX-SIGNALQUEUE-TRIAGED-NO-EXIT-TRANSITION` → `backlog` (SPRINT-S/high/`cross-service/`/`architect`). TRIAGED has **no exit transition**: `pm/flow/task-archive.md:118` matches `.status=="READ"` only; TRIAGED falls to the `else .` no-op — and `:122` then echoes closure success **unconditionally**, a silent false-green that hid the skip |
| Dedup | 5 adjacent rows the prior-art list omitted were read and cleared (`FIX-BACKLOG-TERMINAL-ROW-DRIFT-EVICT-BLIND` = isomorphic bug, other plane; `P1-DETECTOR-CLOSURE-TRIAGE-SIGNALS` = forward half of the same mechanism, sequence it first; +3). No duplicate |
| Launchd: `com.vn-market.cowork-guaranteed-slot-firer` exit-143 unacked → full auditor spawn every ~30min | **ACK option (a)** against `FIX-GUARANTEED-SLOT-FIRER-FANOUT-TRUNCATION` (verified BACKLOG, so not stale-on-arrival). Probe re-run → `ALL_GREEN` |
| Board totals | `task_total` 654→655, `signal_total` 125→125, backlog 388→389, row read back from `.task_board` = **lane `backlog`, exactly 1 occurrence** |

**Ruling:** the reported symptom was real (124 rows, all >24h, hot file 1.9MB) but both proposed causes and both proposed fixes were wrong. Journal: `docs/agent-memory/decisions/triage-20260725T1407Z-po.md`.

## Lessons

- **⚠️ A grep that is case- and quote-sensitive can manufacture a "this exists in no contract" conclusion.** `'"triaged"'` returned zero while `TRIAGED` was documented in four places. The upstream agent had already caught one grep artifact (zsh glob-expanding `--include`) and still shipped a second one in the same command. **Two independent artifacts in one grep is the norm, not the exception — vary case AND quoting before concluding absence.**
- **⚠️ "No consumer in either prune path" can be the DESIGN, not the gap.** TRIAGED is excluded from both prune lists deliberately because it means *active*. Reading the exclusion as a bug and "fixing" it would have evicted live work. Before calling a missing entry a gap, find out who *chose* to leave it out.
- **⚠️ Check whether the fix you are about to mint was already refuted.** Candidate (b) was killed on write-wedge grounds 13 days earlier in an architecture brief. Prior-art grep must cover `docs/architecture-briefs/` verifier rulings, not just `.task_board` ids — the board records what was *minted*, not what was *rejected and why*.
- **A no-op guarded by an unconditional success echo is invisible.** `task-archive.md:122` prints `Signal closure: SID READ→RESOLVED` even when its `map` matched zero rows. Every closure of a TRIAGED row has been logging success while doing nothing.
- **"Count only grows" deserves its own timestamp check.** Newest TRIAGED row is 2026-07-23T18:33Z — ~44h stale. This is a *static* 124-row strand, not an accelerating fire; priority set high, not P0, on that basis.
- **The evidence for the fix's tractability was in the rows themselves.** 122/124 carry `triaged_by`, but only 49 carry `disposition` and 0 carry a structured `tracked_by` — so ~64% have no machine-readable back-reference. That number is what makes this an architect ruling rather than a mechanical patch.

## Carry-over

- **`FIX-SIGNALQUEUE-TRIAGED-NO-EXIT-TRANSITION` needs an ARCHITECT SEMANTIC RULING before code.** Two documented readings disagree: `handlers.md:240` says TRIAGED = work still open (keep hot); observed usage (row `po-20260720T052606`: *"Closing NEW so it stops resurfacing every PO triage tick"*) says TRIAGED = folded into a board row, stop showing me. The fix differs per reading, and the 75 undispositioned rows resolve under neither.
- **Sequence `P1-DETECTOR-CLOSURE-TRIAGE-SIGNALS` BEFORE it** — that row wires PO to stamp `origin_signal_id` (forward half); the new row fixes the predicate that consumes it (close half). Backfill has no back-reference for new rows until the forward half ships.
- **`FIX-BACKLOG-TERMINAL-ROW-DRIFT-EVICT-BLIND` is the same bug on the `task_board.backlog[]` plane.** Same shape, different array — consider one shared architect ruling covering both rather than two divergent fixes.
- **The launchd ACK is label-granular, not signature-granular.** A crash-at-startup or not-loaded failure of `com.vn-market.cowork-guaranteed-slot-firer` is now ALSO suppressed. Mitigated only by the ledger's STALENESS RULE: **remove that entry the moment FANOUT-TRUNCATION reaches DONE_VERIFIED.**
- **The "600s background tasks" line is NOT live evidence.** `cowork-guaranteed-slot-firer-error.log` mtime is 2026-07-18T22:27 — unchanged. Today's event was the OUTER 1800s bound only. Do not cite that line as a same-day observation.
- **Do NOT let QA close `FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT` via host CLI / direct sqlite.** Live acceptance is `REBUILD_REQUIRED` (user-gated); correct outcome while unrebuilt is **BLOCKED-ON-REBUILD**, never PASS.
- **`ready[]` / `review[]` drainage still unverified this tick** — not re-measured; carry forward from 12:57Z.
- **Nothing pushed. No agent dispatched, no container touched. Runtime reads only; probe run with `HEARTBEAT_FILE_PATH` redirected to scratch so the live heartbeat was untouched (still 13:44:06Z).**
