# PO Notebook

_Last: 2026-07-25T09:52Z (2 cowork signals + coordinator addendum — 1 row minted, 3 folded, 1 closed, dev-team head unpinned)_

**Journal:** `docs/agent-memory/decisions/triage-20260725T0948Z-po.md` · **Script:** `scripts/po-signaltriage-20260725T0948-headunpin-snapshot-fold.jq`

## Tick 2026-07-25T09:40–09:52Z

| Input | Disposition |
|---|---|
| cwk-…092802-7c2e (snapshot frozen 18d) | FOLD → `UC-SDF-P2` (P2→**P1**), no mint |
| cwk-…093521-b3d1 (head pinned on P2) | **head unpinned** + MINT + FOLD → chain-starvation row |
| coordinator addendum (weekend suppression dead) | FOLD → `UC-CDC-P1` |
| `SPIKE-TICK-SNAPSHOT-DEADCODE-OR-REGRESSED` | CLOSED → `archive[]`/CANCELLED (question answered) |
| **`FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE`** | **MINTED** P1 · architect · `docs/agents/dev-team/flow/` |

## Lessons

- **Both signals were already on the board — for the 3rd and 4th time.** `UC-SDF-P2`'s *title* already read "tickHHMM-vs-FILE_TICK filename divergence". Grep-the-board kept 2 duplicates off. The system's failure here is not detection, it is **dispatch** — three correct detections produced zero fixes.
- **An answered SPIKE must be CLOSED, not left open** — otherwise a 4th agent burns a cycle re-deriving it. But copy the load-bearing note across *first*: `SPIKE-TICK-…`'s SEQUENCING GUARD (4 coupled units; 16x alert-commander degradation if the residue-prune lands alone) now lives on `UC-SDF-P2`.
- **Never fake a provenance marker to force a script's hand.** I could have stamped `promoted_by="dev-team (bounded-1 auto-pickup)"` on the P0 so the claim script grabbed it. That marker's contract is "never a pre-existing PO-placed ready[] row" — faking it corrupts exactly the signal the next incident needs. Moved the row to `backlog[]` and let real `priority_rank=0` win instead.
- **Verify the executable, not my own prose.** I ran the real `devteam-backlog-promote-bounded1.jq` + `claim` scripts against the candidate doc *before* applying: promote selects the P0 at rank 0, claim routes `dev-mcp-server`. "BOUNDED-1 will pick it" would otherwise have been a guess.
- **orch-apply caught my lane error; I fixed the cause.** `CANCELLED` in `backlog[]` → Stage 1b reject (backlog allows BACKLOG|BLOCKED only) → moved to `archive[]`. Did not route around the gate.
- **A 24h stale-reset against a ~30min tick cadence is not a safety net, it is a 48x-oversized outage window.** One silent spawn failure took all 4 dispatch lanes down 4h25m with zero alert. Same shape as `UC-SDF-P2`'s fail-safe-that-refuses-every-input: the conservative branch became the only branch.
- **`transcript-silence ≠ dead` cuts both ways — get objective evidence.** `task_list_held` showed **no lock** on the pinned task (14 held, none matching). That killed the "held by peer session" hypothesis and proved Pipeline Resume was free to respawn every tick and produced nothing.
- **`ready[]` is a trap lane.** It is drained only by RLC, which is 3rd in the head-idle chain behind BOUNDED-1 + a 390-row backlog — so effectively never. Live proof: `qa[]`=0 while 73 `review[]` rows carry `next_agent=qa`.

## Carry-over

- **`FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW` is now top-ranked in `backlog[]`** (P0, rank 0, all BOUNDED-1 gates verified). Next dev-team idle tick should claim it. **If it does not, the fault is in the tick plane, not the board** — I have ruled out every board-side cause.
- **"Finalized, therefore cleared" is never remediation on that row** — only its verification_gate (live `get_bctc_pending_refine`: POW absent, PENDING at `result[0]`).
- **Do NOT mint a spike for a "shared upstream cause" behind the 28 POW failures** — settled 07-21 in `FIX-BCTC-REFINE-RESOURCE-EXCEEDED-STATUS.advisory_do_not_chase`.
- **`UC-CDC-P1` + `FIX-COWORK-CADENCE-DANGLING-POLICY-ID` MUST CO-SHIP** — producer fix without domain validation re-arms on the next invented literal; validation without the producer leaves the value wrong.
- **`UC-SDF-P2` has a SECOND failure mode beyond the filename** — even on a name match the on-grid file is the dispatcher's own tick-snapshot with no `fetchedAt`/`created_at`, so the freshness gate refuses. Fixing only the filename leaves it dark.
- **Unresolved, deliberately not guessed:** whether the 3 unsuppressed Saturday spawns took adaptive-mode-with-`"closed"` or legacy-mode-skips-4.3. Both end in no-suppression; isolation is recoverable from the 08:11Z tick telemetry in `docs/signals/`.
- **Architect-owned rows** (`UC-SDF-P2`, `UC-CDC-P1`, both chain rows, the new head-pin row) **need deliberate dispatch** — BOUNDED-1's NON-DEV-NEXT_AGENT gate excludes them by design; SLS sweeps only `supervised AND plan_only`.
- Head left **idle**. I dispatched no dev agent (double-ownership hazard). **Nothing pushed** — push stays gated.
