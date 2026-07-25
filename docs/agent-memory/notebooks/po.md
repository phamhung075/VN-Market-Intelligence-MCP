# PO Notebook

_Last: 2026-07-25T12:57Z (router triage-decision — A-30 veto-gate defect: MINT, 1 row, 1 atomic write)_

## Tick 2026-07-25T12:50–12:57Z

| Input | Disposition |
|---|---|
| Router finding: A-30 clause-4 veto `VmHWM > VmRSS` is non-discriminating | **MINT** `FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE` (P1/S/`cross-service/`, `architect`, `supervised`+`plan_only`, `recurring_bug_count:5`) |
| Fold into `FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE`? | **NO** — different file, different plane, *opposite* mechanism (blindness vs veto). That row's own note pre-emptively forbade the merge. Back-ref added instead |
| Fold into `FIX-VPS-HEALTH-OFFHOURS-MASK-FALSE-GREEN`? | **NO** — same class, unrelated substance (`apps/mcp-server/` TS). Would force `zone:multi` + architect split. `related` only |
| Reopen `FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE` (DONE)? | **NO** — genuinely done on its own axis; reopening destroys two audit trails |
| Board totals | `task_total` 652→653, `signal_total` 125→125, ids 815/815 unique, `.head` untouched |

**Ruling:** an FP-suppression fix produced a false negative on the first tick where the check mattered. Journal: `docs/agent-memory/decisions/triage-20260725T1254Z-po.md`. One `orch-apply` transform carried both the mint and the sibling back-reference — one CAS under live concurrent writers.

## Tick 2026-07-25T12:27–12:34Z

| Input | Disposition |
|---|---|
| `.head = {status:"review", …}` wedging the whole dispatch chain | **RESET → idle** via `orch-apply.sh` — contract restoration, not a judgement call |
| …and its root cause: `head.status` has no write-time gate anywhere | **MINT** `FIX-ORCHAPPLY-HEAD-STATUS-WRITE-GATE` (batch #1) — prose→gate |
| Signal: agent_signals TTL 120m < alert-commander sweep 240m | **MINT** `FIX-AGENTSIGNALS-TTL-SHORTER-THAN-CONSUMER-CADENCE` (no prior art) |
| Signal: `promoteCycleSnapshot` HH:MM mismatch | **FOLD** → `UC-SDF-P2` (title already named it) — 0 rows minted |
| Finding B: drain-report prints `[PASS]` on 75 undrained rows | **MINT** `FIX-DRAINREPORT-PREDICATE-MEASURES-ARRIVAL-NOT-DRAINAGE` |
| Finding C: signal_queue PRUNE matches 0 rows | **FOLD** → `TE-T27` + sharpened root cause — 0 rows minted |
| Signal: pipeline-resume duplicate spawn | **MINT** `FIX-DISPATCHWRAP-LOCK-SPAWN-SCOPED-NOT-WORK-SCOPED` (P0) |
| `FIX-PREDCLAIM-BACKFILL-NULL-CREATIONPRICE` (3d deadline) | `depends` **DELETED**, P1→**P0**, scope narrowed to deliverable (a) |

## Lessons

- **⚠️ A veto stacked on an already-discriminating check must itself discriminate, or it silently converts that check into a constant.** `VmHWM` is a *monotone high-water mark*, so `VmHWM > VmRSS` is false only in the knife-edge instant where current RSS equals the all-time peak — a **tautology**, not a weak heuristic. It returned the identical verdict at **98.1% of cap** and at **10.4% of cap** on a 3-minute-old container. Triage generalisation: when a fix adds a suppressor, ask *what input would make it NOT fire* — if you cannot name one, it is a constant and the check it guards is dead.
- **⚠️ Verify the ORDER of a guard, not just its condition.** The router reported the predicate; reading clause 4 myself surfaced a second defect it had not — the veto is ordered **before** the verdict mapping, so it also pre-empts `OOMKilled=true → CRITICAL`. A post-OOM restarted process shows `VmHWM > VmRSS` almost immediately, so the confirmed-OOM branch was reachable only when VM data was *unavailable*. Severity ordering is part of the predicate.
- **My own prior note was the decisive fold-vs-mint evidence.** The scope row I minted at 08:56Z already said "adding a second predicate in the same change would confound the FP evidence for the first; mint it separately later." Four hours later the answer to a fold question was sitting in a field I wrote. **Read the neighbour row's `note`/`scope_out`, not just its title** — the title says what a row *is*; `scope_out` says what it has already *refused*.
- **Bound a design you are not entitled to choose with an INFORMATION-CONTENT test, not a threshold.** Told not to prescribe the predicate, and holding no data to choose, I made the acceptance criterion: return **different** verdicts for the 98.1%-of-cap and 10.4%-of-cap samples. That rejects every non-discriminating candidate by construction while leaving formula and number to the architect — and avoids re-introducing the flat-threshold churn the converge row eliminated (rag-service legitimately plateaus ~95-99%).
- **⚠️ A shipped fix that is PROSE + a SYNTHETIC fixture is not a shipped fix.** `FIX-EXECTIER-HEADSYNC-BRANCHNULL-REVIEW-IDLE` amended a flow doc and added a verify script with a synthetic fixture — both PASS; two days later `dev-mcp-server` wedged the board anyway. `HeadSchema.status` is `z.string()` + `.passthrough()` — no enum, no gate. Enforcement must move from prose into `scripts/orch-apply.sh`.
- **Prior-art grep on the MECHANISM words, not the symptom words.** `SNAPSHOT|PROMOTE|CYCLE-SNAPSHOT` on `.id` returned nothing; the row was `UC-SDF-P2`, whose *title* carried the mechanism.
- **Ran the detector before trusting its verdict — it was lying.** `devteam-review-lane-drain-report.sh` printed `[PASS]` while its own table listed 75 rows and `qa[]==0`: a disjunction (one young row green-lights the lane) *and* it ages rows by `updated_at`, which any edit bumps — including the triage reading it.

## Carry-over

- **Sequence `FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE` AHEAD of `FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE`.** They touch the same detector from two sides. Widening *which* containers get inspected while the interpretation layer still vetoes every ESCALATE just multiplies a constant. If the architect concludes they should ship together, that must be stated explicitly in the brief — never by absorbing one into the other.
- **Do NOT let any downstream row quote an mcp-server pp/h growth rate or an 85% ETA.** Today's windows gave 7.25 / ~3 / 1.6 / ~4.7 pp/h and the 1.6 is formally RETRACTED. Settling it needs process-level RSS logging *inside* the container across several cycles. The 12:45:09Z swap reset the clock — the climb series from 12:47:46Z is the cleanest window available and degrades with every restart.
- **The 12:45:09Z mcp-server swap is INTERIM MITIGATION, not a fix.** `FIX-MCP-MEMORY-CODE-LEAK` (BACKLOG/high) has been open since 2026-06-09 and is untouched by it. Repair the detector and leave the leak, and the repaired detector will simply fire correctly and repeatedly.
- **`FIX-DISPATCHWRAP-LOCK-SPAWN-SCOPED-NOT-WORK-SCOPED` remains the highest-blast-radius row I have minted.** All agents are backgrounded by default and the dispatcher-wrap releases `task:<id>` on spawn-*return* — so the duplicate-spawn guard is unarmed for the entire life of every task. Session-scoping does not save it: the running agent is a subagent of the same session, so a re-claim reads re-entrant, not collision.
- **Do NOT let QA close `FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT` via host CLI / direct sqlite.** Live acceptance is `REBUILD_REQUIRED` (user-gated). Correct QA outcome while unrebuilt is **BLOCKED-ON-REBUILD**, never PASS (`feedback_host_cli_integrity_check_false_ok_verify_through_runtime`).
- **`UC-SDF-P2` must ship BEFORE `UC-CDC-P1`.** UC-CDC-P1 treats a symptom of UC-SDF-P2's cause; with no candidate file ever found, the gate is not the binding constraint.
- **`FIX-AGENTSIGNALS-EXPIRED-GC-CRON` is in TENSION with the new TTL row** — it wants expired rows deleted *faster*; the TTL row says rows expire *before* their only consumer wakes. Whoever takes either must read both.
- **`ready[]` (44) / `review[]` (105) still not draining.** The head wedge cleared at 12:34Z and `.head` has since moved to a real BOUNDED-1 claim (`FIX-PREDCLAIM-BACKFILL-NULL-CREATIONPRICE`, 12:45:28Z) — so the chain IS alive. If `review[]` has not strictly decreased by the next tick, the QA-Drain consumer itself is broken, which is a new finding.
- **Nothing pushed. No agent dispatched, no container touched, read-only on runtime throughout.**
