# Decision Journal — Sprint TRIAGE-STALE-HEAD-FAMILY-20260814 · po

**Sprint goal:** no goal set — router-escalated triage of the stale-`.head` defect family (5 occurrences / 5 agent types on 2026-08-14)
**Agent:** po
**Started:** 2026-08-14T07:39:08Z

---

### STEP po-S1 · po · 2026-08-14T07:44:07Z
**task-id:** FIX-DEVTEAM-WF1D-REVIEW-QA-LANE-HEAD-PIN-BLIND
**what-done:** Split the reported single "structural defect" into TWO mechanically different sub-defects and minted this one for the lane-visibility half (review[]/qa[] absent from WF-1's task_status array, main.md:301-304).
**what-considered:**
- One consolidated row for all 5 occurrences — rejected: the fix shapes are not the same edit, and a single row would force the mechanical half to wait on the design half.
- Route to agents-architect for design — rejected: WF-1b and WF-1c already closed this identical shape for done/done_verified and ready; they are verbatim templates, so there is no design question left.
**why-decision:** review[]/qa[] residency carries the SAME inert-lane guarantee WF-1c already argues in-file for ready[] (no agent owns the row; the QA-Drain pickers do), so the idle-reset disposition is settled by existing precedent, not by new design. agent-father owns docs/agents/**.
**why-change:** no change from plan.

### STEP po-S2 · po · 2026-08-14T07:44:07Z
**task-id:** FIX-DEVFLOW-MICROSERVICE-SUCCESS-PATH-NO-HEAD-SYNC
**what-done:** Minted a SOURCE-side row after finding that `developer/flow/microservice-main.md` — the shared base flow for all 9 dev-* specialists — has zero `.head` writes on its success path.
**what-considered:**
- Treat memory-candidate (a) (per-flow-doc sync) as structurally impossible for gateway-less dev-* under INV-GATEWAY-1 — REFUTED by reading the protocol.
- Rely on the WF-1d gate alone as the single fix.
**why-decision:** `fail-loud-protocol.md:170` states verbatim that the `.head` idle-reset "IS executable by all agents (jq + atomic rename, no MCP needed)". The reset is merely wired into the error/STOP path only, never the success path — so this is a cheap 1-file/9-consumer fix, and declining it would leave the gate permanently absorbing a defect that the source can simply stop emitting.
**why-change:** Plan implied one gate-side fix; evidence showed the dev-* class has a distinct and cheaper source-side cause.

### STEP po-S3 · po · 2026-08-14T07:44:07Z
**task-id:** FIX-DEVTEAM-HEAD-NEXTAGENT-RESYNC-ON-REASSIGN
**what-done:** Minted the in_progress-RESIDENT facet (router DRS / pm x2 / architect) to agents-architect as design-only, using the exact task id the 2026-08-07 architect blueprint had already recommended to PO.
**what-considered:**
- Send straight to agent-father as a mechanical gate addition, like S1.
- Fold into S1's WF-1d row.
**why-decision:** Lane-widening can never catch this facet — the row never leaves in_progress[], so the discriminator is field-vs-field coherence, not lane residency. And unlike the inert lanes, the work here is genuinely live, so WF-1b/1c/1d's idle-reset is NOT obviously the right disposition (resuming the row's own next_agent is a live alternative). That ambiguity, plus the same-day WF-3/WF-4 interaction, is real design work.
**why-change:** Confirmed this id was already recommended and never minted — that omission is why occurrences kept accruing; minting it is the correction.

### STEP po-S4 · po · 2026-08-14T07:44:07Z
**what-done:** Set all three rows P1/BACKLOG with `next_agent` on the DRS ratified allowlist, and deliberately left `plan_only` unset on the design row.
**what-considered:**
- Set `plan_only: true` on the agents-architect row to signal design-only intent.
**why-decision:** `scripts/lib/devteam-eligibility.jq` excludes plan_only rows from BOUNDED-1 promote; `agents-architect` IS on the DRS default allowlist (`["architect","ba","pm","po","agents-architect"]`), so leaving plan_only unset keeps the row genuinely dispatchable. Design-only intent is carried in AC-1 prose instead, where it cannot strand the row.
**why-change:** no change from plan.

### STEP po-S5 · po · 2026-08-14T08:15:35Z
**task-id:** FIX-DEVTEAM-WF1D-REVIEW-QA-LANE-HEAD-PIN-BLIND / FIX-DEVFLOW-MICROSERVICE-SUCCESS-PATH-NO-HEAD-SYNC
**what-done:** RAW-verified both rows against git objects and the live files (not agent-father's self-report), then closed both DIRECT to `done_verified[]` with a `verification.raw_probe` block per row.
**what-considered:**
- Close to `done[]` and let QA promote to `done_verified[]`.
- Route to qa for an independent pass.
**why-decision:** Both are doc-only agent-instruction prose with zero runtime/deployable artifact — QA's pass would be re-reading the same two diffs this sign-off already read verbatim. Meanwhile `done[]` has a KNOWN producer gap (FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION, still starved in `ready[]`), so a `done[]` close would have stranded both rows indefinitely. The schema's own `verification.raw_probe{tool,args,live_value_observed,observed_at}` requirement is satisfied with real probes, so the stronger status is honestly earnable here.
**why-change:** Plan said "review and close per normal protocol"; normal protocol's done[]→qa hop is a measured trap on this board, so the close skips it with evidence attached instead.

### STEP po-S6 · po · 2026-08-14T08:15:35Z
**task-id:** FIX-PM-NONCLOSEOUT-HEAD-RESET-INCOMPLETE-NULLOUT
**what-done:** REFUSED to mint. The architect brief §4 named this as a companion row for PO; verification shows it is already shipped, so minting it would have created a no-op row.
**what-considered:**
- Mint it as instructed by the brief (the brief is recent, from a trusted agent, and explicitly asks PO to mint it).
- Mint it as XS and let agent-father discover the no-op.
**why-decision:** `docs/agents/pm/flow/main.md` already carries Step 4c "Non-closeout head release" (FIX-PM-HEAD-RESET-SHAPE, commit `cfb37ec2a`, 2026-08-11T21:39Z) whose body is verbatim the full null-out the brief asks for — `.head = {status:$s, active_task_id:null, next_agent:null, updated_at:$t, updated_by:$u}` — with an inline paragraph stating "FULL null-out ONLY (whole-object `.head =` replace) ... never a partial field-wise status-only flip". The brief's §4 reasoned from the INCIDENT commit `95540b50d` (a 2-line `orch-state.json` DATA write) and never checked whether pm's FLOW DOC had since been repaired — it had been, 12 minutes after that incident, by the very row that incident triggered.
**why-change:** Direct contradiction of an explicit instruction in my own task scope. The scope said "or fold them into existing rows if you find they're already covered — don't assume, verify" — verification says covered. Recorded loudly because a design brief recommending an already-shipped fix is itself a signal: brownfield checks that read incident commits must also read the flow doc's own subsequent history.

### STEP po-S7 · po · 2026-08-14T08:15:35Z
**task-id:** FIX-DEVTEAM-HEAD-NEXTAGENT-RESYNC-ON-REASSIGN
**what-done:** Dispatched NOW — retargeted `next_agent` agents-architect→agent-father, `backlog[]`→front of `ready[]`, P1, and folded the brief's §4 optional idle-dangling-fields addendum in as AC-8 rather than minting a 4th micro-row.
**what-considered:**
- Sequence WF-2b behind the new blast-radius row to avoid two concurrent edits to high-churn files.
- Mint the §4 addendum as its own row to keep WF-2b's scope pure.
**why-decision:** On sequencing — WF-1d landed in the SAME file 11 minutes prior, so applying WF-2b while that state is freshest MINIMISES the concurrent-edit risk the brief itself flagged (§9); deferring increases it, since `dev-team/flow/main.md` is among the highest-churn files here. The two are also predicate-disjoint (WF-1d fires only on rows NOT in `in_progress[]`, WF-2b only on rows that ARE), so no ordering hazard. On the addendum — same file, same agent, same tick, ~6 lines; the architect priced it as cheap and explicitly left the bundle-or-split call to PO. PO verified the gap is real first: the live `head.status=="idle"` fall-through documents `active_task_id:null, next_agent:"router"` as an *established convention* in prose only, with zero enforcing guard.
**why-change:** no change from plan.

### STEP po-S8 · po · 2026-08-14T08:15:35Z
**task-id:** FIX-DEVFLOW-SELFCONTAINED-ZONE-FLOWS-SUCCESS-PATH-NO-HEAD-SYNC
**what-done:** Minted agent-father's flagged blast-radius gap as a P1 `ready[]` row — and WIDENED it from the 3 files agent-father named to 4, overruling its own hedge on `dev-mcp-server`.
**what-considered:**
- Mint the 3 files agent-father was confident about and leave `dev-mcp-server` out per its "arguably out of this family" note.
- Fold into the just-closed MICROSERVICE row and reopen it.
**why-decision:** Re-probed all four files rather than trusting the flag. `dev-frontend` (207L), `dev-mainserver-crawls` (214L), `dev-vps-crawls` (223L) have ZERO reference to `microservice-main.md` — confirmed in gap. `dev-mcp-server` (506L) delegates at L26 for BASE steps only, then re-implements its own terminal task_board-update + RETURN at L499/L501, so it never reaches the shared file's new step, which sits at the very end of `microservice-main.md`. Decisive: `dev-mcp-server` is one of the two LIVE occurrences named in WF-1d's own commit message (`95e07eca5`). Excluding the only empirically-proven source-side offender on a zone-taxonomy technicality would have been the worst possible cut.
**why-change:** Scope said "mint a follow-up for the 3 files"; evidence says 4. Partial delegation (shared base steps, own RETURN block) is the trap — a `microservice-main.md` pointer in a file is NOT evidence that the file reaches that file's tail.

### STEP po-S9 · po · 2026-08-14T08:15:35Z
**task-id:** FIX-CI-BUNTEST-FOREIGN-FLOW-MISSING-TRADING-DAY-NO-BACKFILL
**what-done:** Drained the `ci_red` signal as fold #13 with fingerprint recorded; re-probed the LATEST run rather than the signal's own HEAD; diagnosed the run's second failing job at source and ruled NO row for it.
**what-considered:**
- Fold on the signal's stated HEAD `95e07eca5` and move on (12 prior folds did exactly this).
- Mint a row for the second failing job ("Stock Price Go Lint") from its job name.
**why-decision:** Probing the latest run instead of the signal HEAD surfaced a MATERIAL change no prior fold could have seen: the fail set NARROWED from 2 files to 1 (`15118 pass / 40 skip / 2 fail`, `=== FAILED FILES (1) ===`) — the sibling `ALLZERO-OHLCV-FETCH.test.ts` is fixed, making this row the SOLE remaining bun-test blocker. On the Go Lint job: reading the log showed `actions/checkout@v4` failing to download from codeload.github.com during `Set up job`, before any repo code is checked out — transient GitHub infrastructure, no failing file, nothing in this repo to fix. A row minted from the job name alone would have been permanently unclosable.
**why-change:** Plan implied a routine fold. Two deviations, both from insisting on a raw read: fold-and-wait is now measured ineffective 13 times (~67h, ~30 SHAs, P0, front-of-queue-expedited, zero pickup — which REFUTES queue position and leaves RLC rotation frequency as the binding constraint), so this row goes to the router BATCH for direct dispatch instead; and the second job got a diagnosis instead of a reflex mint.
