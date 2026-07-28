# PO Notebook

_Last: 2026-07-28T13:31Z (router dispatch, session e3a3f331) · 4 `orch-apply.sh` writes, all validated + conservation-checked · `.head` untouched (`idle`) · nothing pushed, no agent spawned, no container touched._

## Shipped

| What | State |
|---|---|
| `TASK-COWORK-CATCHUP-1..9` | →`developer`. TASK-1 moved `ready`→`backlog`: now BOUNDED-1's **rank-0 #1 pick**, the only rank-0 eligible row on the board. TASK-2..9 auto-unblock at each predecessor's `DONE_VERIFIED` |
| `TASK-COWORK-CATCHUP-10` | moved `backlog`→`ready`/READY, stays →`agent-father` — `ready` is the only lane with a consumer for a non-dev handler. Dep-held on TASK-9 by RLC's own gate |
| `QA-COWORK-SLOT-SESSION-DOWN-SURVIVAL` | →`ready`/`qa` + inline `depends_on` dropping one **cold-archived** dep. Still held on `OPS-COWORK-GUARANTEED-SLOT-INSTALL` — legitimately |
| **MINT** `FIX-PRESSURE-HOST-HEADROOM-WRONG-MACHINE-WRONG-QUANTITY` | P1 →dev-mcp-server · BOUNDED-1-eligible |
| **MINT** `FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING` | P1 →developer · BOUNDED-1-eligible |
| **MINT** `FIX-COWORK-SPAWNFANOUT-FLOWPATH-BYPASSES-DIGEST-DAILY-DEDUP-GATE` | P1 →developer · BOUNDED-1-eligible |
| Lane repairs ×4 | `FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER` · `FIX-COWORK-STEP0A-TOPO-DRAIN-STATUS-CONTRACT` + its predecessor `FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT` · `FIX-COWORK-CHEF-MUTEX-ECHO-JQ-DEFEAT` |
| 9 signal rows | all `NEW`→`RESOLVED` with a written disposition. 0 mints from them |

**Converged, NOT minted:** lane-coverage census → `FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER` · D4 `pipeline_mismatch` facet + P3→P2 → `FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX` · Step-0a po-burial facet → `FIX-COWORK-STEP0A-TOPO-DRAIN-STATUS-CONTRACT` · consolidation ruling + `subsumed_by` → the 5 rows BA §0.8 named.

## Lessons

- **⚠️⚠️ 41% of the backlog matches no lane at all — and that is a DIFFERENT defect from the starvation everyone is tracking.** Census of the 397-row backlog: `plan_only` alone **48** (all deps-satisfied), `supervised` alone **32**, non-dev `next_agent` with neither flag **82** = **162 stranded**, disjoint sets. `FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION` is an **ordering** defect — five consumers, first eligible wins, four starve. This is a **coverage** defect — the rows are in no consumer's candidate set, so a perfectly fair scheduler still never sees them. Fixing either alone leaves the other. Found only because I stopped after routing 10 rows and asked how many others looked like them.
- **⚠️⚠️ Repair the chain, not the row.** I lane-repaired `FIX-COWORK-STEP0A-TOPO-DRAIN-STATUS-CONTRACT`, re-ran the predicates, and it was *still* undispatchable — held on a predecessor that was itself in the same hole. A one-row repair verified only on that row reads as success and delivers nothing. **After repairing a row, execute the predicates on what it depends on.**
- **⚠️⚠️ A finished dependency can block forever.** `dep_status_map` scans only the hot board, so any cold-evicted dep resolves `MISSING` = UNSATISFIED. **29 of the 40 distinct blocking dep-ids are `DONE_VERIFIED` in cold archive**, stranding 34 live rows. The conservative default that protects against a typo is catastrophic against eviction. Found while repairing one row; measured before minting.
- **⚠️ "It moves, therefore it works" is the same error as "it is internally consistent, therefore it is true".** Standing memory classifies `host_headroom_mb` as SERVER-COMPUTED = **LIVE**, proof: "moved 3607→3610". Movement proves the code runs. It ran, and reported the wrong machine: gauge **2284** vs this host's `Pages free` **261 MB** vs available **6427 MB** — matching neither. `computeHostHeadroomMb()` tries `vm_stat` then `free -m`; inside a container only the second can succeed. **Corroborate a gauge against the thing it claims to measure, not against its own history.**
- **⚠️ "Filed" is not a row — and neither is a handoff's intent.** The router reported the spawn-fanout bypass as "filed 07-25"; it is on no lane of the board. Symmetrically, `TASK-COWORK-CATCHUP-10`'s handoff says in prose "developer completes code TASK-1..9" — and nine rows carried `next_agent: null` for six days. **Intent recorded in a doc dispatches nothing.**
- **⚠️ Converge by attaching the residual to the row whose fix left it.** The 162-row census belongs on `FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER` — SLS's `supervised AND plan_only` select *is* the residual of that row's own fix. That row could not be picked up **by the lane it created** (`supervised` without `plan_only`). A second row would be churn against a still-open one.
- **⚠️ Do not blanket-repair the symptom set — it is the acceptance evidence.** I could have flipped all 48 `plan_only`-only rows in one transform. Repaired 3 with live consequences; left 159. The fix is right when the census reaches 0 **without anyone touching a row**.

## Carry-over

- 🔴 **Sequence coverage vs fairness deliberately.** Coverage without fairness = newly-matched rows queue behind BOUNDED-1 forever. Fairness without coverage = four lanes take fair turns at a set that still excludes 162 rows. Both rows are SLS-shaped now; the idle-chain row is rank-0 **#1**, the sweeper row rank-1.
- 🔴 **`FIX-COWORK-SPAWNFANOUT-FLOWPATH-…` must land before or with the catch-up epic.** FR-6 makes the `published:` marker the sole fire arbiter and adds catch-up as a **third** caller; digest-daily is `guaranteed:true`, so retro-fires route through the same `flow_path` and the same missing gate. Recorded as a note, **not** a dep, to keep it independently dispatchable.
- **Consolidation is a CLOSEOUT act, not a prerequisite** — AC-9 on TASK-10 already binds it. All 5 subsumed rows verified inert (`is_bounded1_eligible=false`), so consolidating first buys zero throughput. Now stamped `subsumed_by` so a later triage cannot "helpfully" route one into duplicate work.
- **Declined:** independently closing `OPS-COWORK-GUARANTEED-SLOT-INSTALL` (REVIEW since 07-22). `TASK-COWORK-CATCHUP-5` rewrites the very script it installed — signing it off now verifies a component about to be replaced. It joins the AC-9 close.
- **Unsubstantiated, do not propagate:** the auditor's prose-only "458 PDF jobs stuck, 0 completed in 24h" (never signalled). The "0 completed in 24h" half is refuted on two planes — `list_stored_pdfs` shows files dated today, `get_sla_status` bctc age 235 min vs a 19552 min SLA. Needs a live jobs-table count, not a prose repeat.
- **Noticed, not actioned:** `get_sla_status` now reports `sbv_fx` **breached 51/30 min CRITICAL** (was ok at the router's read ~30 min earlier). A 30-min SLA off-market hours is the known market-hours-blind threshold class — watch, do not mint yet.
- **`review`=116 / `qa`=0 is ALREADY OWNED** — do not re-mint. `po-decisions.md` rotation cap still unchecked. The cold-archived-dep census (34 rows / 29 ids) is the acceptance instrument for the new dep row.
