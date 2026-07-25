# PO Notebook

_Last: 2026-07-25T15:30Z (dev-team Step 1 triage — 3 drained signals + 1 signal_queue row + 2 router asks: 4 MINTs, 3 evidence-attaches, 1 router self-blame OVERTURNED, 1 router hypothesis FALSIFIED)_

## Tick 2026-07-25T15:07–15:30Z

**Returned BATCH(4).** Every id read back off `.task_board` by `id` after write — none asserted from narration.

| Minted | Lane (read back) | Mechanism |
|---|---|---|
| `REFLOW-FPT-Q1-2026` | `backlog`/BACKLOG, high/M, `multi`, →ba | FPT Q1-2026 units 8-14 stuck at conf 0.45 since 05-31. **This row IS the designed terminal action of the ESC loop** — `drain-esc-dispatch.md` GATE-B Tier 1 keys on id prefix `REFLOW-<ticker>-`, so minting it also stops the re-fire |
| `FIX-DRAINESC-GATEA-ESC5-MED-UNREACHABLE` | `backlog`/BACKLOG, high/S, `cross-service/`, →ba | GATE-A's `ESC_DEFAULT_SEVERITY[ESC-5]=MED` is **unreachable dead config** — producer always stamps HIGH |
| `FIX-AGENTMD-BCTC-WRITESCOPE-CONTRADICTS-INIT` | `backlog`/BACKLOG, high/S, `cross-service/`, →agent-father | agent-def frontmatter forbids the `docs/signals/` writes `init.md` mandates |
| `CLEAN-NB-TRIM-BCTC-ANALYST` | `backlog`/BACKLOG, low/S, `docs/agent-memory/notebooks/`, →agent-father | 14162B vs 12000B byte-cap at only 54L — append-not-overwrite, 4 near-duplicate cycles |

**Attached as evidence, NO row minted** (all 3 verified present after write): `UC-CDC-P1` + `FIX-COWORK-CADENCE-DANGLING-POLICY-ID` (calendar_status=`closed`) · `FIX-VNINDEX-CROSS-PLANE-PLAUSIBILITY-GATE` (VN-Index falsification + re-test instruction). Signal `sys-20260725T151406-cal1` → `triaged`/`evidence-attached-no-new-row`.

**Declined to write:** cycle-snapshot 18d-stale is the **5th** sighting of `UC-SDF-P2`, already re-stamped 12:33Z today with byte-identical evidence. A 5th corroboration adds zero information — churn, not convergence.

Board: backlog 390→394, `task_total` 647→651, `signal_total` 126 unchanged. `.head` **never touched by me** — it flipped to idle at 15:26:41Z `updated_by=developer` (own closeout, `FIX-COLDEVICT…`→review/next=qa), *before* my first write at 15:28:08Z. Verified by stamp, not assumed.

## Lessons

- **⚠️ "Escalated N times, actioned zero times" usually means the loop's terminal action has an owner who never ran it.** The FPT ESC loop was not broken: routing works, GATE-A/GATE-B exist, the guard TTL re-arms by design. GATE-B Tier 1 suppresses on a `REFLOW-<ticker>-<quarter>` row existing — **and minting that row was PO's job.** I live-ran the gate's own jq before minting: returned `false`. **Run the gate's real predicate against live state; never infer a gate is broken from the fact that it did not fire.**
- **⚠️ A defaults table consulted *only* when the caller omits a value is dead the moment the caller always supplies one.** GATE-A classifies ESC-5 as MED (below its HIGH floor) but its own comment forbids overriding an explicit value — and the producer hardcodes `context.severity OR "HIGH"`. The one classification that would ever change an outcome is structurally unreachable. **Two files agreeing on a policy is worthless if only one is on the execution path.**
- **⚠️ When an agent obeys the narrower of two contradictory authorities, that is correct behaviour — do not accept its dispatcher's self-blame.** Router reported the skipped signal writes as its own prompt-authoring error. It was not: it quoted `.claude/agents/bctc-analyst.md`, the correct SSOT for write-scope. The defect is that the SSOT contradicts `init.md` in three places. **Overturning a self-blame means reading both authorities, not sympathising with the confessor.**
- **⚠️ An unchanging market value on a closed market is the correct output, not a frozen feed.** 5 cycles of identical `-13.27` — all five fall after Friday close, on a Saturday. Killed it with a positive control: stored artifacts carry deltas 7.35 / 2.07 / -0.86 / -7.08 / -20.68, so the field demonstrably varies. **Off-hours, "carried by design" and "stale" emit byte-identical output and cannot be adjudicated — write the re-test, not the row.**
- **A partially-true impact claim still needs its arithmetic checked.** "8 routine signals missing" → really 5 net-new (KBC/NVL/SSI/VCI/HCM); FPT/HPG/VCB exist from c122 and were byte-identical under the E3 cache-hit. Had c123 written them they'd have *clobbered* c122 on the same date-keyed path (`FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING`).

## Carry-over

- `REFLOW-FPT-Q1-2026` carries a **self-defeat risk**: root blocker on units 8-14 is `image_unavailable`, so a plain re-refine may no-op into a 6th escalation. AC step 1 demands the page images be confirmed retrievable **before** re-running.
- `FIX-DRAINESC-GATEA-ESC5-MED-UNREACHABLE` AC-3 is unanswered: **zero** `reflow-needed-hint-*.json` exist on disk despite 5 recurrences. Either `recurrence_count` never reaches 2 or the branch is dead — implementer must determine which.
- Cowork cluster sequencing is fixed, do not reorder: `UC-SDF-P2` **first**, then `UC-CDC-P1` + `FIX-COWORK-CADENCE-DANGLING-POLICY-ID` as ONE change set.
- `FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT` stays on `dispatch_hold_20260725` (sequencing hold, **not** a disposition) until `apps/mcp-server` is green. CI still RED on main, fingerprint `bda56d1c` (`1408-tool-diacritics.test.ts`) — untouched, not mine.
- `FIX-COLDEVICT-DONE-LANE-TRIGGER-ACTION-AXIS-NOOP` is now **review/next=qa**, needs router pickup. Two constraints from 14:59Z still bind whoever works it: (a) do **not** narrow the trigger to the `done[]` predicate — `preflight.sh:419` is the sole caller and the run does evict `signal_queue.rows[]`; the trigger must gain a signal_queue disjunct in the *same* change; (b) fixing the `created_at` sort alone buys ~7 days, not a fix — dated rows re-saturate at ~1.5/day. Both defects or neither.
- **`review`≈111 / `qa`=0 is ALREADY OWNED — do not re-mint.** `FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN` (backlog, architect) + `FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION`.
- **Do NOT let QA close `FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT` via host CLI / direct sqlite.** Live acceptance is `REBUILD_REQUIRED` (user-gated); correct outcome while unrebuilt is **BLOCKED-ON-REBUILD**, never PASS. (carried)
- **Nothing pushed. No agent dispatched, no container touched.** Six `orch-apply.sh` writes, all validated + conservation-checked.
