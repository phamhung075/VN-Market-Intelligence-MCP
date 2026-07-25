# PO Notebook

_Last: 2026-07-25T16:34Z (router triage: coverage-sweep dead trigger + 2 relayed context_bloat signals — 3 MINTs, 4 evidence-attaches, 1 relayed diagnosis OVERTURNED, 1 umbrella DECLINED)_

## Tick 2026-07-25T16:21–16:34Z

**Returned BATCH(3).** All 3 ids + all 3 SPIKE instance fields read back off `.task_board` by `id` after write — none asserted from narration. Two atomic `jq -f … | bash scripts/orch-apply.sh` writes, Zod Stage0+1 PASS, conservation 651→652→654 (+3 exactly), `signal_total` 126 unchanged, `.head` never referenced.

| Minted | Lane (read back) | Mechanism |
|---|---|---|
| `FIX-COVERAGE-SWEEP-BLANKET-STAMP-DEAD-TRIGGER` | `backlog`/BACKLOG, P1/M, `cross-service/`, →developer | news-scout **AND** market-watcher stamp all 57 tickers/cycle instead of the ~2 analysed ⇒ 48h staleness trigger unsatisfiable, sweep dead. ~55 of 57 tickers have no other coverage path. Co-ships with `FIX-COVERAGE-STATE-CROSS-AGENT-LOST-UPDATE` |
| `FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES` | `backlog`/BACKLOG, P1/S, `cross-service/`, →developer | Line cap has an auto-actuator (`notebook-auto-prune.sh` :135/:174); byte cap has only a detector. 18 notebooks over cap; 87 breach signals filed as processed with the condition untouched |
| `FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE` | `backlog`/BACKLOG, P2/S, `cross-service/`, →developer | ONE `## This session` = 119035 of 120183B ⇒ drop-oldest-section pruner has nothing to drop; structurally immune to the row above |

**Attached as evidence, NO row minted** (all 4 verified present after write): `SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP` instances 11/12/13 · `FIX-COVERAGE-STATE-CROSS-AGENT-LOST-UPDATE` (co-ship) · `FIX-USDVND-THRESHOLD-SSOT` (saturation).

## Lessons

- **⚠️ Before minting an umbrella, check whether the class already has one.** Router offered a new "self-disabling state field" container for 3 same-day instances. `SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP` (ready/P1) has held exactly this class since 07-21 — 10 instances, 5 sub-classes, with a CLOSED-for-triage convention that stops re-surfacing. **A 4th container fragments a converging class.** Attached instead; marked 11/12/13 closed per that row's own convention.
- **⚠️ A correct contract executed by an LLM over a bulk structure is not an enforced contract (sub-class 6).** Both coverage flows say "stamp only the tickers analysed this cycle" — the prose is right, and reading code can never find this defect. Across 25 revisions news-scout ran 3/4/7 → 1 → 5 → 1 distinct stamps and market-watcher 8,9,10,10,10,6,7,11 → 1,1, **with no intervening code change**. Editing prose to say it more emphatically is not a fix; only a deterministic scripted patch is.
- **⚠️ Read the DATA, not the doc — and read the signal archive, not the code.** Two mechanical detectors this class needs, both orthogonal to the code-reading that found instances 1-10: `jq '[.<coll>|to_entries[]|.value.<field>]|group_by(.)|length'` on live state (result 1 across a collection meant to update incrementally = saturated field, any age gate on it is dead); and `ls docs/signals/processed/ | sed -E 's/-[0-9]{8}T[0-9]{6}Z.*//' | sort | uniq -c | sort -rn` (high count on a stable dedup key = detector works, remediation does not). Told the SPIKE to run as **two passes**, code and data.
- **⚠️ Verify a relayed diagnosis before building against it.** Relay said the byte cap "is denominated in the wrong unit" and wanted one built. It already exists, is correct (200×60), and IS what fired the signals (`reason=byte-cap`, `backstop.sh:119-123`). Building it again ships a duplicate. The relay's *instinct* was right (agents comply with the cap and defeat its purpose); its *mechanism* was wrong — the real defect is that only ONE of the two caps has an actuator.
- **⚠️ Fix the actuator, not the files.** Declined the prune the signals asked for: correcting the pruner's setpoint self-heals ~16 of 18 notebooks on their next write, whereas a prune row clears 2 and regenerates in ~48h — the 24 alert-commander signals since 07-23T16:13Z are exactly what that looks like.
- **A vanished key is proof of a write mechanism.** `sweep_config` present 07-21, gone 07-23, deleted by no commit. A merge-based writer cannot lose a key it never touches — that single observation settled the 9-day-old direction question on the sibling lost-update row, which had been stuck between three candidates.
- **Both relays under-reported scope; both times the sibling was live.** Coverage input named news-scout only — market-watcher was equally saturated. Bloat signals named 2 files — 18 are over cap, and `agent-father.md` (326L) is over the LINE cap too.

## Carry-over

- **`FIX-USDVND-THRESHOLD-SSOT` will close without fixing the defect if "pick one SSOT" picks 25000.** At Bearish=25000/Bullish=23000 and live 26130, BEARISH is the classifier's **only reachable output**. Added a mandatory AC: assert both branches reachable **at the live rate, not a fixture rate**. Durable question (absolute threshold on a drifting nominal series has a shelf life by construction) left with 3 options unchosen — implementer's call.
- **`docs/agent-memory/decisions/po-decisions.md` is 516L against a declared 200L rotation cap** (dev-standards:425) — a likely third live instance of sub-class 7. NOT minted: needs one read of the rotation path first to confirm it shares the mechanism. **Next PO tick: check before minting, not after.**
- Cowork cluster sequencing is fixed, do not reorder: `UC-SDF-P2` **first**, then `UC-CDC-P1` + `FIX-COWORK-CADENCE-DANGLING-POLICY-ID` as ONE change set.
- `FIX-COLDEVICT-DONE-LANE-TRIGGER-ACTION-AXIS-NOOP` (review/next=qa) needs router pickup. Two binding constraints: (a) do **not** narrow the trigger to the `done[]` predicate — `preflight.sh:419` is the sole caller and the run does evict `signal_queue.rows[]`; the trigger must gain a signal_queue disjunct in the *same* change; (b) fixing the `created_at` sort alone buys ~7 days — dated rows re-saturate at ~1.5/day. Both defects or neither.
- **`review`≈112 / `qa`=0 is ALREADY OWNED — do not re-mint.** `FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN` + `FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION`.
- **Do NOT let QA close `FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT` via host CLI / direct sqlite.** Live acceptance is `REBUILD_REQUIRED` (user-gated); correct outcome while unrebuilt is **BLOCKED-ON-REBUILD**, never PASS. (carried)
- `FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT` stays on `dispatch_hold_20260725` (sequencing hold, **not** a disposition) until `apps/mcp-server` is green. CI still RED on main, fingerprint `bda56d1c` — untouched, not mine.
- **Nothing pushed. No agent dispatched, no container touched.** Two `orch-apply.sh` writes, both validated + conservation-checked.
