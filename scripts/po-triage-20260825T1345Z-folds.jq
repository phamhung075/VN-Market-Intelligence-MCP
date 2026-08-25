# po-triage-20260825T1345Z-folds.jq — PO triage folds + one signal_queue routing row.
# Companion to scripts/po-triage-20260825T1345Z-mint.jq (same cycle).
#
# Owning flow doc: docs/agents/po/flow/triage-signals.md (FOLD discipline — dedup on subject,
#                  one open artifact per subject, never one row per fire)
#
# Usage:
#   jq -f scripts/po-triage-20260825T1345Z-folds.jq docs/data/orch/orch-state.json \
#     | bash scripts/orch-apply.sh
#
# Every target was size-checked against ORCH_ROW_PROSE_CEILING_BYTES (12000) BEFORE writing:
#   review[26]  FIX-ORPHAN-FR4-FR5-...              1331B
#   backlog[413] FIX-REENTRANT-BRANCH-...           5463B
#   backlog[265] FIX-COWORK-BATCH-COVERAGESTATE-... 2026B
# Rows already over ceiling are NOT folded into (the guard hard-rejects net-new growth);
# those dispositions live in docs/agent-memory/decisions/triage-20260825T1345Z-po.md instead.

("2026-08-25T13:45:50Z") as $now

# ── FOLD 1: FIX-ORPHAN-FR4-FR5 — QA's two change-requests, both now ANSWERED ──
| (.task_board.review |= map(
    if .id == "FIX-ORPHAN-FR4-FR5-FLOW-DEVTEAM-ADOPTION-GUARD"
    then . + {
      po_fold_20260825T1345Z: "PO ANSWERED BOTH QA CHANGE-REQUESTS THIS TICK — do not re-dispatch either as written. (1) 'subtask 4 released:1 probe never run, needs a gateway-capable session' — PO HAS gateway tools and RAN it. Result: the AC FAILS, and it fails for a reason the AC cannot express. Live probe 2026-08-25T13:52Z: claimed a synthetic orphan-signal under a dead owner_client_session, then called task_release in the exact orphan-adoption.md:61-66 shape (owner_client_session=CALLER, owner_agent, original_owner_client_session=DEAD) -> {ok:true, released:0}; task_list_held(kind='orphan-signal') confirmed the lock was STILL HELD, so released:0 is a real non-release; POSITIVE CONTROL releasing under the dead session's OWN id -> {ok:true, released:1}, lock gone. So task_release authorises only on owner_client_session and original_owner_client_session is inert. The doc half of subtask 4 DID land (params present at all 3 sites) — the mechanism it depends on does not exist. Filed as FIX-TASKRELEASE-ORIGINAL-OWNER-CLIENT-SESSION-INERT-RUNGB-NEVER-RELEASES (P0, backlog, next_agent=architect), which carries the full 5-step probe transcript and both candidate fixes. ALSO: subtask 4's acceptance is unrunnable AS WRITTEN — it demands 'a real NULL-owner orphan-signal row' and PO measured task_list_held(kind='orphan-signal') = 0 live rows, so it can only ever be satisfied opportunistically after a genuine mid-task agent death. Restate it as the synthetic-fixture probe above. (2) 'the separate row for dispatch-claim/SKILL.md FR-3 retrofit does not exist' — CORRECT, PO re-grepped and confirmed. FILED: the FR-3 retrofit is now in scope on FIX-DISPATCHCLAIM-CARD-PAYLOAD-OBJECT-REJECTED-AND-PHASEA-OMITS-OWNER-AGENT (P1, backlog, next_agent=agent-father) AC-4. That id is the referent this row's record was pointing at; the reference now resolves. NOTE this row stays in review[] and is NOT unblocked by this fold — subtask 4 is blocked on the P0 above.",
      updated_at: $now,
      updated_by: "po"
    }
    else . end))

# ── FOLD 2: re-entrant claim — add the dev-team S2 dispatcher-wrap call site ──
| (.task_board.backlog |= map(
    if .id == "FIX-REENTRANT-BRANCH-SHARED-SESSION-UUID-DOUBLE-DISPATCH"
    then . + {
      po_fold_20260825T1345Z_second_call_site: "SECOND CALL SITE, router-observed 2026-08-25, folded here rather than minted separately because it is the SAME root mechanism (a re-entrant claim returning claimed:true is not evidence that no live work exists) at a different site — and a separate row would race this one's architect brief. SITE: docs/agents/dev-team/flow/main.md § S2 dispatcher-wrap treats outer_claim FAILURE as the only 'already running' signal. But task_claim is re-entrant for the OWNING session, so when the incident-lane consumer and the resume path are the SAME router session, outer_claim returns claimed:true and S2 would spawn a SECOND agent onto a task that already has a live one. LIVE INSTANCE THIS TICK: task:FIX-CCATO-NTG-ROWS-NOT-PRODUCED-BY-EITHER-SANCTIONED-ENGINE-FORGED-WRITER-ID held by session 036ceaf1 (claimed 13:15:01Z, expiring 14:15:38Z) with a live developer on it; the router skipped the double-spawn BY HAND, there is no automated guard. WF-1b/1c/1d all miss it because the row is legitimately in_progress[]-resident, which is exactly the state they treat as healthy. ADDS AC-5 to this row: S2's 'already running' test must be a LIVENESS test, not a claim-success test — enumerate what evidence actually distinguishes 'my own earlier claim' from 'nobody is working on this', and note that a claim's own claimed:true can never be that evidence. AC-1's two-process contention test does not cover this case: here it is ONE session at two points in its own flow, not two processes.",
      updated_at: $now,
      updated_by: "po"
    }
    else . end))

# ── FOLD 3: coverage-state contention premise FALSIFIED by a controlled contrast ─
| (.task_board.backlog |= map(
    if .id == "FIX-COWORK-BATCH-COVERAGESTATE-CONTENTION-CORRELATES-WITH-MISSED-NOTEBOOK-COMMIT"
    then . + {
      po_premise_correction_20260825T1345Z: "THIS ROW'S OWN PREMISE IS FALSIFIED BY A SAME-TICK CONTROLLED CONTRAST — read before building. The row blames coverage-state:main mutex contention under parallel-batch spawn for the skipped notebook commit. Cowork envelope 4facdd5e... (tick 2026-08-25T12:00Z, type flow-wiring-gap-controlled) reports both agents dispatched by the SAME tick, both offhours, both under the same persistence obligation, spawned within the same second: market-watcher DID commit (d41596771, pathspec-scoped, touches exactly docs/agent-memory/notebooks/market-watcher.md, tree clean afterwards — verified real, commit exists); news-scout did NOT (return listed the notebook under 'Files Modified' and claimed 'Notebook c282 appended', but working tree still shows M docs/agent-memory/notebooks/news-scout.md and the newest commit touching that file is c46bf951e from the 08:07Z cycle). Identical contention conditions, opposite outcomes -> contention is NOT the discriminator. This upgrades the finding from correlational (2x, this row's original basis) to CONTROLLED, and moves the search to the per-agent flow: what does market-watcher's Step 5 do that news-scout's does not. Also note the failure SHAPE — news-scout narrated a commit it never made — which is the recurring 'claimed N writes, made zero' class (feedback_coverage_state_stranded_sweep_silent_skip_rests_on_false_no_bash_premise); whatever fix lands must make the agent READ BACK git HEAD before asserting persistence, not just execute a commit step. owner_hint from the reporting dispatcher: agent-father.",
      updated_at: $now,
      updated_by: "po"
    }
    else . end))

# ── Durable artifact for QA: the mid-window D1 dmesg capture ──────────────────
# FU-RAG-DEPLOY-MEMORY (qa[1]) is 18508B — already over the prose ceiling, so it
# cannot be folded into. Route-by-`to` per triage-signals.md's fallback row instead.
| if ([.signal_queue.rows[] | select(.id == "po-20260825T134550-ragd1midwindow")] | length) == 0
  then .signal_queue.rows += [{
    id: "po-20260825T134550-ragd1midwindow",
    ts: $now,
    from: "po",
    to: "qa",
    type: "ops_followup_request",
    summary: "RAG durability window opened 13:18Z on container 16c59b5e929f — take a MID-window D1 dmesg capture, not only at close; the previous window died exactly this way",
    severity: "WARN",
    status: "NEW",
    payload_ref: null,
    provenance: "po-triage",
    dedup_key: "rag-durability-bar:mid-window-d1-dmesg-capture",
    detail: "FU-RAG-DEPLOY-MEMORY (qa[], P0) gates on a RAG-MEM-DURABILITY-BAR v2 D1-D5 window. D1 is evidenced by a dmesg read inside the Docker Desktop VM, and that ring buffer is VOLATILE: the previous window's evidence was destroyed when the 05:31-06:45Z VM crash reset it, and that row's own status_note already records the buffer having ROLLED once before. Capturing only at window close therefore risks a THIRD recurrence of the same evidence loss. Take a D1 capture mid-window and record the buffer span (first and last -T timestamp) alongside it, so a later roll can be detected rather than silently producing a shortened, unrepresentative negative. Also re-prove the negative is non-vacuous each time (the prior cycle used a docker0 grep returning 901 hits against the same buffer) — a 0-hit dmesg grep with no positive control is indistinguishable from a broken pipeline. NOTE: this could not be written onto the FU-RAG-DEPLOY-MEMORY row itself — that row is 18508B, already past ORCH_ROW_PROSE_CEILING_BYTES=12000, and the guard hard-rejects net-new growth on over-ceiling rows (tracked as FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS, ready[])."
  }]
  else . end

| .signal_queue._updated_at = $now
| .signal_queue._updated_by = "po"
| .task_board._updated_at = $now
| .task_board._updated_by = "po"
