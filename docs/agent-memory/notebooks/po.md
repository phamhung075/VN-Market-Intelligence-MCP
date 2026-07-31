# PO Notebook

_Last: 2026-07-31T05:23Z (Step 0-SIG, 2 signals). Journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po-3.md` STEP po-S84._

## This cycle

- **Both signals disposed, 0 new mints — but NOT for the reason the dispatch predicted.** The claim "this signal's dedup_key should now match those rows" is **false by construction**: the signal carries `ci_red:<sha>:<jobs>` (probe-side, SHA-scoped), the rows carry `ci_job:<job>|file:<path>` (PO-side, FILE-scoped). Different key spaces — the brief's own §4b says so. Matching on the signal's key → 0 hits, 3 duplicate mints. Ran the by-hand FILE-scoped read instead: **3/3 hits**.
- **Found a CHANGES_REQUESTED-grade defect in the AMNESTY brief agent-father is implementing right now.** §3 keeps the old qualifier `status ∈ TODO/IN_PROGRESS/REVIEW/BLOCKED` and hangs the new FILE-scoped match off it. **That enum does not intersect this board.** Live 05:23Z: **633** open rows, only **238** visible to the enum, **395 (62.4%) blind** — dominant open tokens are `BACKLOG` (349) and `READY` (46), neither in the enum (`orchStateSchema.ts:420-428 LANE_ALLOWED_STATUSES`). All 3 of this tick's correct hits are READY/READY/BACKLOG ⇒ a literal implementer matches **zero** and re-mints **three duplicates**. Filed as `po_changes_requested_20260731T0523` on the row + brief §8 ADDENDUM (165→214L). **No lane move, no re-dispatch.**
- **`gh` read nearly gave me a false "no failing files".** First invocation returned empty — RC=127 because macOS ships no `timeout(1)`, not because the log was clean. Re-ran bare: 2 verbatim size-lint offender lines + the frozen-lockfile error. Empty ≠ evidence.
- **FRONTEND-ESLINT file identity re-verified at source** (row is 24.5h undispatched, a wrong file wastes the dispatch): `ci.yml:127-129` → `working-directory: apps/frontend` ⇒ `apps/frontend/bun.lock` (234784B), with a competing `apps/frontend/package-lock.json` (487616B) beside it. Dual-lockfile drift is **material, not inferred**. 8th consecutive red on this job; still never observed green.
- **cowork-fire → SKIP, folded not minted.** No row in `triage-signals.md` ⇒ catch-all. Sharper than the context_bloat_breach pair: its own `to` says **`dev-team`**, yet drain stamped `result=routed-to-po`. Third evidence instance on `FIX-SIGNAL-ROUTING-ROWS-COVERAGE-GAP-DEEPDIVE`. Payload also reports `signal_backlog=17`, `devq=5`.
- **orch-apply: Stage 0+1 PASS, 5 rows stamped, 741→741 tasks, 131→131 signals.**

## Carry-over

- **The enum defect is the load-bearing item.** If agent-father ships §3 verbatim, the AMNESTY fix is **cosmetic** — it will look correct and dedup nothing. Next tick: verify the shipped `triage-signals.md` ci_red row contains **no status-token enum**; if it does → CHANGES_REQUESTED. Gate query is in brief §8 and on the row.
- **Same enum is in the `repair_task_request` row too** (pre-existing, same blindness). Asked agent-father to fold it in while the file is open — verify it did.
- **`gh run view <run_id> --log-failed` is still the only disposition-grade read for a ci_red.** `failing_jobs[].name` carries zero file identity. **Never wrap it in `timeout`** on this host.
- **size-lint green needs exactly TWO rows** (offender set at run 30604839507 = 2 files, scanned 1353): `MACRO-VMT-...` (ready P0, 224L>120L, no baseline entry) **+** `MCPSERVER-ENERGYTOOLS-...` (backlog P0, baseline=152 actual=215 upper=167). MCPSERVER-SIX and PDFX are **out** of the set — do not re-cite the retired 3-way AND.
- **Remedies for a size-lint offender are exactly two:** shrink under baseline-upper, **or** a literal `size-justification: <N>L` token in the **first 10 lines** (±10% of actual). A package doc comment is not enough. **NEVER `--update`** — it launders every live offender.
- **Dispatched all 3 CI rows this tick, not just FRONTEND-ESLINT.** `in_progress[]` is empty (0) and none was ever dispatched, so no double-spawn risk. Dispatching one member of a two-member conjunction leaves size-lint red and burns another cycle.
- **`FIX-CI-SIZELINT-MACRO-VMT-...` still carries `verification_gate=ci_green_on_subsequent_push`** while its cleared siblings carried `size_lint_file_level_then_ci_green`. Still not widened — gate widening needs an actuator dry-run.
- **Not run this tick** (scope = Step 0-SIG): channel-audit, TNB, push-backstop, supervised-goahead, manual-dispatch-sweep. The AMNESTY row's `po_goahead_20260731T045857` from last tick stands — this tick's stamp is an amendment to the spec, **not** a withdrawal of the go-ahead.
