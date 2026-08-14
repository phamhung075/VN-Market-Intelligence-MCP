# PO Decision Journal — QA-Lane Saturation Triage 2026-08-14T09:11Z

**task_id:** `QA-LANE-SATURATION-STALE-ROWS-ESCALATION` (9 stranded `qa[]` rows dispositioned individually + 2 mints)
**Inputs:** live `.task_board.qa[]` (10 rows, full field dump per row) · `git log --all --grep=<id>` per row + `git show --stat` on 14 candidate commits · `docs/agents/qa/flow/main.md` (275L, read in full) · `docs/agents/dev-team/flow/main.md` § Review-Lane QA-Drain + WF-1d/WF-3/WF-4 · `grep -rn orch-apply docs/agents/qa/` · source-verification of 2 discharged blockers
**Writes:** 1 `orch-apply.sh` pipe — Stage 0+1 PASS, conservation OK (task_total 740→742, +2 mints), `qa[]` 10→1, `review[]` 95→104, `backlog[]` 399→401

---

## D-1 — Refused the blanket treatment; the 9 rows split into three genuinely different classes

**What was considered:** (a) treat all 9 as the same CHANGES_REQUESTED-stuck shape the router's sample suggested, one sweep; (b) re-derive a verdict-evidence trail per row before touching any of them.

**Why (b):** the router explicitly flagged that only 1 of 9 was verified, and the standing failure class here is agents that narrate a disposition they never executed — a sweep that assumes one shape would have written 8 wrong dispositions with high confidence.

**What the per-row probe actually showed — three classes, not one:**
- **4 rows with a rendered QA verdict whose lane-move never landed** (`FIX-PO-BATCH-MINT-NO-WRITE-ACTUATOR`, `FACTORY-ALERT-dedup-window-config`, `FIX-COMMITCONVENTION-…`, `FIX-STOCKPRICE-…`).
- **4 rows with zero QA activity ever** — no notebook, no journal, no report, no `[QA]` marker in the row (`TE-T17`, `FIX-SCHEDULER-DOUBLE-REGISTRATION`, `FACTORY-RAG-delete-dead-sqlite-repo`, `FIX-MARKETDB-WAL-SEQUENCE-STEPS-2-4-NO-OWNER`). The spawn produced nothing durable; the lock TTL-expired silently.
- **1 row soak-parked on an expired timer** (`FIX-MCP-SSE-…`) — QA genuinely ran, then parked on `next_recheck_not_before=2026-08-08T23:06:00Z`, a field **nothing in the fleet reads**.

**The router's fixer hypothesis was wrong, and the flow doc says so.** `qa/flow/main.md:198` (`vc-changes`) routes explicitly to *the row's own `.owner`*, **not** `fixer`: "there is no task branch for a fixer to work on; the owner must apply a NEW direct commit." Sending these to `fixer` would have handed a 1-2-file-patch agent a set of rows with `branch:null` and, in two cases, nothing left to patch at all.

## D-2 — Two of the four CHANGES_REQUESTED blockers were already discharged, so they are re-QA rows, not fix rows

**What was considered:** (a) route every CHANGES_REQUESTED row to its owner for a fix round; (b) verify at source whether the named blocker still exists first.

**Why (b):** these verdicts are 3-8 days old; the fleet kept working in that window. Routing an already-fixed row to an implementer burns a cycle and produces a no-op commit.

**Result — both checked at source this tick, neither inferred:**
- `FIX-PO-BATCH-MINT-NO-WRITE-ACTUATOR`: QA's sole blocker was AC-3's regression verifier "not authored". `scripts/audits/po-mint-orchapply-actuator-verify.sh` exists, 10466B, executable, landed `f9e511353` at **18:24Z — 5h after the 13:25Z verdict**. → re-QA.
- `FIX-COMMITCONVENTION-…`: QA's sole blocker was `docs/protocols/docker-deployment-runbook.md:148` instructing a bare `git commit -m`. Read that line: it now carries an explicit 3-path trailing pathspec (`4fbb3eb0d`, 16:38Z, ~1h after the 15:30Z verdict). → re-QA.

Only `FACTORY-ALERT-dedup-window-config` still has a live blocker, and it is **not** a code fix: correct code (`43f4e3add`) that was never deployed. Routed to `ops` for a single-service rebuild — QA's own note had already reasoned this out ("routing to developer/fixer would misdirect — the defect is undeployed, not unwritten") and I executed its ruling verbatim rather than re-deciding it.

## D-3 — Waived the SSE container-soak AC on my own authority; the row had explicitly deferred the call to po/qa

**What was considered:** (a) re-park with a fresh recheck window; (b) waive the soak AC and close on the unit-test evidence; (c) escalate to architect.

**Why (b):** the AC's evidence source is a **shared mutable runtime property** — container `StartedAt` — which any of 8+ peers legitimately rebuilding the same container resets. It was reset **3 times** (`project_sse_soak_clock_reset_shared_container_20260808`). Re-parking is choosing (a) again for a fourth time with no reason to expect a different outcome; an AC that a correct peer action invalidates is unsatisfiable, not merely slow. Escalating adds a hop to a question the row itself already routed to me.

Decisive: superseding evidence is **already committed** — unit tests T13/T14 (`apps/mcp-server` `1862c-transport-session-eviction.test.ts`) prove the shipped `>=4h` max-age eviction branch fires deterministically in milliseconds, decoupled from container uptime and wall-clock. The row's own stamp says qa/po must decide whether that supersedes the soak. **It does.** Stamped `po_soak_ac_waiver_20260814T0908Z`, cleared `next_recheck_not_before`, routed to QA to close on the unit-test evidence.

## D-4 — Root-caused it as a supply-side defect, not a backlog-cleanup, and refused to stop at the cleanup

**What was considered:** (a) one-off cap-clear, close the escalation; (b) cap-clear **and** mint the structural fix.

**Why (b):** CLAUDE.md — fix root cause, not recurrent symptom — and because the cleanup provably does not hold. Read at source: `qa/flow/main.md:189` (`vc-approved`) *names* `orch-apply.sh` but supplies no jq and no pipe; `:198` (`vc-changes`) does not mention it **at all**. `grep -rn orch-apply docs/agents/qa/` returns 3 hits, none on a verdict exit. **This is verbatim the `FIX-PO-BATCH-MINT-NO-WRITE-ACTUATOR` defect class** — prose-only board mutation with no executable actuator — which was fixed for PO's sub-flows on 2026-08-05 (`3ce726a6e`, inline pipes at every mutation point) and never propagated to QA.

**The disconfirming check that made it conclusive:** the same paths *do* sometimes land (`977c533b3`, `f9e597a76`, `6245e116d`, `0fd243794`, `87755ab3a` are real `qa->done_verified` writes; `d146e96b5`, `0f1cbf920`, `cd3b7efec` real `qa->review` writes). So this is **not** "QA cannot write `orch-state.json`". `6b721b889` settles it: QA wrote `orch-state.json` in the *same commit* as its CHANGES_REQUESTED verdict — and still left the row at `status:"QA"` in `qa[]`, because it appended the review record (which the doc shows how to do) and skipped the lane-move (which the doc only describes). Success is a coin-flip on whether the spawned session improvises the jq. Prose-only = nondeterministic.

**Minted `FIX-QA-VC-LANEMOVE-PROSE-ONLY-NO-ORCHAPPLY-ACTUATOR` (P0, `agents-architect`)** — 5 ACs, patch template named (`3ce726a6e`).

## D-5 — Minted the watchdog as a separate P1 backstop rather than folding it into the P0

**What was considered:** (a) one row covering actuator + watchdog; (b) two rows, watchdog `depends` on the actuator fix.

**Why (b):** they have different owners (`agents-architect` for an agent flow doc vs `architect` for the dev-team dispatch chain), different sizes (S vs M), and different lifetimes — the actuator fix stops *new* strandings, the watchdog heals the ones that slip through any *future* variant of the class. Folding them lets the harder half sink the easier half.

**The gap, grep-verified at source:** WF-3 (`main.md:441`) and WF-4 (`:469`, 2h stale-age) are `.head`-pin checks keyed off `.head.active_task_id` + the `in_progress[]` row's `claimed_at` — a stranded `qa[]` row **pins nothing**, so neither can ever observe it. WF-1d *does* read `review[]`/`qa[]` but states "NO lane-move — the row is already correctly resident where Review-Lane QA-Drain/SECONDARY-Drain expect it". **That premise is true for `review[]` and false for `qa[]`**: QA-Drain claims *from* `review[]` only. Net: `in_progress[]` has a resume bound + a stale-age check, `review[]` has two drains, `qa[]` has neither.

**Two further defects folded in as ACs rather than dropped:** (i) `next_recheck_not_before` has no reader anywhere — a deliberate time-boxed park silently becomes permanent (AC-4); (ii) lane-moves do not re-stamp `claimed_at`/`claimed_by`, so a watchdog keyed naively on that field is unsound on this lane *today* — `FIX-SCHEDULER-DOUBLE-REGISTRATION` carried its original `bounded-1` promotion stamp (apparent age 16d, actual 6d) and `FIX-MARKETDB-WAL-…` carried nulls because it entered `qa[]` via a PO reopen write, not the drain (AC-5). Also AC-8: the `QA_WIP -lt QA_CAP` gate **no-ops silently when full** — that silence is precisely why this ran undetected for weeks.

**Minted `FIX-DEVTEAM-QA-LANE-STALE-AGE-WATCHDOG-BLIND` (P1, `architect`, depends on the P0)** — 8 ACs incl. two negative controls.

## D-6 — Routed both mints to allowlisted agents on purpose

**What was considered:** `next_agent: agent-father` (the historical committer of `qa/flow/main.md` and the applier of WF-3/WF-4).

**Why not:** `agent-father` is **off** the DRS ratified allowlist `[architect, ba, pm, po, agents-architect]`, so a row pointed at it is unreachable by every automated dispatch lane — documented on `FIX-COMMITCONVENTION-…`'s own `status_note`, which called it out as a dispatch-stranding warning. Minting a P0 fix for a stranding defect into a stranded row would have reproduced the bug in the remedy. Routed P0 → `agents-architect` (designs, then signals `agent-father` — the sanctioned, dispatchable chain) with the design pre-specified inline so it is a one-hop signal, not a fresh design cycle; P1 → `architect`, which authored the WF-3/WF-4 blueprint this is the analogue of.

## D-7 — Corrected 4 circular `owner: "qa"` fields as part of the same write

Four rows carried `owner: "qa"`. Since `vc-changes` routes to `.owner`, any future CHANGES_REQUESTED on those rows would have bounced QA back to itself — a second, independent strand. Corrected: `FIX-PO-BATCH-MINT`→`developer`, `FIX-STOCKPRICE-…`→`dev-stock-price`, `FACTORY-ALERT-…`→`ops`, `FIX-MARKETDB-WAL-…`→`ops`; plus two nulls filled (`FIX-SCHEDULER-DOUBLE-REGISTRATION`→`dev-mcp-server`, `FACTORY-RAG-delete-dead-sqlite-repo`→`dev-rag-service`).

## D-8 — Did not touch `FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED`

Claimed 2026-08-14T08:32:49Z, legitimately mid-24h durability window per my own prior ruling. `qa[]` left at 1/10 — 9 free slots.
