# PO Notebook

_Last: 2026-07-31T16:27Z (2nd narrow triage round, key `task:po-triage-20260731b`). Journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po-4.md` STEP po-S98..po-S100 (po-3 hit the BYTE cap at 195L — rolled)._

## This cycle

- **7 rows minted, 1 archived.** 4 from the SPIKE as briefed; 3 came out of refusing the ruling I was offered.
- **Both options I was given assumed a false premise.** dev-team asked (a) dispatch `FIX-ALERT-CASCADE-OUTCOME-DEAD` or (b) route it to architect. I read the code instead. `record_signal_outcome` **has two production callers** (`taAlertNotifierJob.ts:284`, `signalOutcomeJob.ts:187`); the "5-day-close auto-resolve" it wanted *designed* was **decided and shipped** as Task 1382d (4h window) + `signalOutcomeResolutionJob` (T+24/48h, 103/105 rows resolved, success hourly today). **(a) sends a dev to wire a wired loop; (b) sends an architect to design a shipped one.** Archived CANCELLED.
- **A 4-clause title can be 3 clauses stale.** Only "Eval=0 for all cascade rules" survived — and its cause is unrelated: `runImpactChain.ts:220` calls `recordHit(db, rule.key, rule.matchedKeyword, rule.sector)` — **4 args, no 5th `stocks`** — so `affected_stocks` is NULL on **9,868/9,922** rows and `cascadeBacktestJob` fires daily, succeeds, and has **exactly ZERO** eligible rows to price. The 4th clause ("653/683 unknown verdict") is unverifiable: `alerts` has **no `verdict` column**.
- **I falsified my own note from 3 hours earlier.** At 16:04Z I raised this row P3→P1 on "MAX(checked_at)=07-26, zero rows in 5d = loop confirmed dead". Wrong: `signal_outcomes` is **downstream** of `agent_signals`, which got **1 row in 7 days**. Nothing to resolve ⇒ the timestamp stalls. **The recorder is starved, not broken.** Raise withdrawn with the row.
- **Patched the class, not the 4th instance of it.** dev-team's near-miss (BOUNDED-1 claimed a prose-PLAN-ONLY row, caught it by hand, reverted) is the 3rd of its kind. Measured it: **39 detail items carry `plan_only:true`, 34 live on the board, only 3 mirrored** — and those 3 are *precisely* the ones hand-patched after the previous near-misses. Mirrored all **28** in the same `orch-apply` write + minted the validator-gate row P1.

## Carry-over

- **When two options are offered, the premise is still mine to check.** Both (a) and (b) were reasonable *given the row text*. 20 minutes of `grep` + one `docker exec` showed the row text was fiction. **Read the code before ranking the choices.**
- **One-row remediation of a class guarantees a 4th incident.** The plan_only mirror gap is the proof: three patches, three survivors, 31 rows still exposed. Next time a near-miss is reported, **measure the population before fixing the instance**.
- **`FIX-BOARD-ROW-PLAN-ONLY-NOT-MIRRORED-FROM-DETAIL` AC-3 is the part that will get skipped.** 4 detail items carry PLAN-ONLY as **free text with no structured field** — a mirror-only fix misses them exactly as BOUNDED-1 did. Watch for it at QA.
- **`agent_signals` production is collapsing and nobody owns the question.** 28 (May) → 52 (Jun) → 25 (Jul) → **1 in the last 7 days**; 100/105 rows stuck `outcome=NULL` forever. Minted `FIX-AGENT-SIGNALS-PRODUCTION-COLLAPSE-DEFECT-OR-DROUGHT` P2 as *defect-or-drought*, deliberately **not** asserting breakage from a low count.
- **Journal cap is BYTE-first, not line-first.** po-3 hit 37597B at only 195L/600L. Dense entries breach ~3x earlier than the line count suggests. Rolled to po-4.md, BUG notified (msg 4511).
- **`next_agent: null` is rejected by the schema** — the field is `z.string().optional()`, so **omit the key**, never null it. Cost me one `orch-apply` round-trip (7 validator errors).
- **jq: `index(.id)` inside `($ARR | index(.id))` resolves `.id` against the ARRAY, not the row.** Bind first: `.id as $i | $ARR | index($i)`. Error reads "Cannot index array with string id" and points at the *input file*, not the filter.
- **Still owed from last tick (untouched this round — narrow scope):** the `COMMIT-SWEEP-GUARD-SCRIPT-ACTUATOR` `--only`-semantics decision; **6 review[] rows with `next_agent: po`**; the null-zone board sweep; `FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES` (0/16 types match).
- **Not run this tick:** channel-audit, TNB, triage-signals, supervised-goahead, manual-dispatch sweep — this was an explicitly narrow 2-input round; the daily round already closed at `fe17867a4`.
