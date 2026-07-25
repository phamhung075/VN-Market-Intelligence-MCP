# PO Notebook

_Last: 2026-07-25T11:02Z (router-referred throughput ruling — idle-chain fairness raised P0, design pre-selected, 1 row folded)_

**Journal:** `docs/agent-memory/decisions/ruling-20260725T1101Z-devteam-idle-chain-po.md` · **Script:** `scripts/po-s150-devteam-idle-chain-fairness-ruling-20260725T1059.jq`

## Tick 2026-07-25T10:53–11:02Z

| Input | Disposition |
|---|---|
| Router: decide disposition of idle-chain starvation | **FIX + RAISE P1→P0**, design **pre-selected** (was "PO has NOT pre-selected") |
| `FIX-DEVTEAM-BOUNDED1-PENDINGSIGNALS-EMPTY-GUARD` (P3) | **FOLDED** → parent AC-2; `CANCELLED`, `backlog[]`→`archive[]` |
| Router: close tick-plane open question | **CLOSED** — confirmed, with a two-cause correction (below) |
| Board totals | backlog 391→390, archive 8→9, task_total 653→652 (archive is excluded from `FLAT_TASK_LANES` — verified in `orch-conservation-check.mjs:67`, not assumed) |

**Ruling:** aged round-robin over all 5 idle-path consumers **+** durable `pendingSignals` handoff. Both required, co-shipped. BOUNDED-1 cap **stays 1** (AC-3 = diff proof it is byte-unchanged).

## Lessons

- **The defect is destructive, not slow — that is what forced P0.** Step 0a moves signal files to `processed/`, writes the fingerprint (so the next drain dedups them away), and marks queue rows `NEW→READ` — then hands off via `pendingSignals[]`, an **in-memory per-tick variable** whose ONLY consumer is Step 1. A short-circuited tick does not defer its signals, it **destroys** them. I nearly ruled this a scheduling issue; grepping for where `pendingSignals` is persisted (nowhere — no script, no orch-state key) is what changed the verdict.
- **Rotation alone would have been a false fix.** Under round-robin, triage loses 4 of every 5 ticks → still drops ~80% of drained signals. Durability is a *co-required part*, not a follow-up. This is why I folded the guard row in as a hard AC instead of leaving it as a sibling.
- **"PO has NOT pre-selected" is itself a cause of stalling.** The row sat from 07-22 with three open options; an architect ask with no decidable scope is not dispatchable. Picking one and writing the rejection reasons for the others is the deliverable.
- **62 PO cycles in 7d, but only 1 dev-team Step-1 triage.** PO being busy hid the starvation completely. The starved thing is a *path*, not an agent — measure the path (`signals.db` 363 `routed-to-po` vs `triage-*-po.md` count), never the agent's activity.
- **`grep` the board before minting — it paid twice.** `FIX-DEVTEAM-BOUNDED1-PENDINGSIGNALS-EMPTY-GUARD` already existed (07-16) for the exact loss I "discovered". Separately, my near-mint on the 57 non-drainable `docs/signals/` files was pre-empted by 3 already-CANCELLED archive rows (`CLEAN-SIGNALS-DIR-NONSIGNAL-ARTIFACTS`, `FIX-DRAIN-QUARANTINE-NONROUTABLE-SIGNALS`, `FIX-PRICE-ANOMALY-DISH-SIGNAL-ENVELOPE`). **0 rows minted this tick.**
- **Same lane-coherence trap as the 09:52Z tick, caught the same way.** `CANCELLED` in `backlog[]` → Stage 1b reject. Dry-run on a **scratch copy** caught it before the live file was touched. Status is not lane — a terminal status obliges a lane move.
- **The fix for the starvation is starved by the starvation.** The P0 is `supervised+plan_only` → SLS lane → 2nd in the very chain it describes → unreachable. A defect that blocks its own remediation outranks everything it starves; that is the P0 justification, and it is generalizable.

## Carry-over

- **`FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION` (P0) CANNOT self-dispatch** — needs an out-of-band `architect` spawn. Do **not** clear `supervised`/`plan_only` to make it auto-pickable; the classification is correct.
- **Do not re-open the option set** on that row. Architect may refine the *mechanism*, not re-litigate (a)/(b)/(c) — rejection reasons are recorded in the ruling journal.
- **If architect rejects the durable inbox** in favour of the narrow BOUNDED-1 guard → **re-open** `FIX-DEVTEAM-BOUNDED1-PENDINGSIGNALS-EMPTY-GUARD` from `archive[]`; do not silently narrow AC-2.
- **Tick-plane question CLOSED, with a correction:** the P0 BCTC row's ~4-day delay had **two** independent causes. Dead tick plane 05:18Z–10:37Z is real and closed. It does **not** explain the prior ~4 days — the row was in `ready[]`, a lane with no reachable consumer, until PO's 09:51Z ready→backlog re-route made it BOUNDED-1 eligible. Both stand; the second is why AC-1 must cover `ready[]`.
- **`ready[]` is a trap lane** (44 rows, 18 P0) and **`review[]` is write-only** (106 rows, 73 `next_agent=qa`, `qa[]`=0). Both unblock only via the P0 above.
- **Architect-owned rows** (`UC-SDF-P2`, `UC-CDC-P1`, both chain rows, head-pin row) need deliberate dispatch — BOUNDED-1's NON-DEV-NEXT_AGENT gate excludes them by design.
- **`UC-CDC-P1` + `FIX-COWORK-CADENCE-DANGLING-POLICY-ID` MUST CO-SHIP.** **`UC-SDF-P2` has a 2nd failure mode** beyond the filename (on-grid file lacks `fetchedAt`/`created_at` → freshness gate refuses); fixing only the name leaves it dark.
- **"Finalized, therefore cleared" is never remediation** on the BCTC row — only its verification_gate (live `get_bctc_pending_refine`: POW absent, PENDING at `result[0]`).
- Head untouched (`dev-mcp-server` owns it). I dispatched no agent. **Nothing pushed** — push stays gated.
