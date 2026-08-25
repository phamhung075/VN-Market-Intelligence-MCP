# po-triage-20260825T0107Z-reaper-liveness-mint-and-folds.jq
#
# PO Step 0-SIG board mutations for dev-team tick 2026-08-25T01:07Z (session 036ceaf1).
# Owning flow doc: docs/agents/po/flow/triage-signals.md (Pipeline A routing + dedup discipline).
# Registry pointer: docs/agents/po/flow/scripts-registry.md
#
# ONE mint + FIVE folds. All row selection is by .id (never array index — indices drift).
# Invoke:  jq --arg now "$NOW" -f <this> docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# 1. MINT  backlog[] FIX-REAPER-ORPHAN-MINT-KEYS-ON-TTL-ONLY-NO-SESSION-LIVENESS-CHECK (P0)
#          — inbox envelopes d89d8226 + 4a5a8e12 (ONE finding; #2 supersedes #1's root cause).
# 2. FOLD  ready[] FIX-ORPHAN-FR4-FR5-FLOW-DEVTEAM-ADOPTION-GUARD — subtask 4 file/line refs have
#          DRIFTED to dead lines; corrected + Rung-B param-omission evidence attached.
# 3. FOLD  backlog[] CLEAN-NOTEBOOK-BYTECAP-3-FILES-UNPRUNABLE-SINGLE-SECTION — 3x ba.md envelopes.
# 4. FOLD  ready[] FIX-BCTC-NONBANK-OPERATING-PROFIT-EBITDA-SCALAR-ZERO-HPG — HPG 36th+ cycle.
# 5. FOLD  backlog[] FIX-CYCLE-SNAPSHOT-PRODUCER-NAMES-BY-WALLCLOCK-CONSUMER-LOOKS-UP-BY-NOMINAL-TICK
# 6. FOLD  backlog[] FIX-REFINE-PAGECOUNT-ZERO-COVERLETTER-MASK — DXG CANDIDATE corroboration only.

def append_note($id; $text):
  map(if .id == $id then .status_note = ((.status_note // "") + $text) | .updated_at = $now | .updated_by = "po/triage-20260825T0107Z" else . end);

.task_board.backlog += [{
  id: "FIX-REAPER-ORPHAN-MINT-KEYS-ON-TTL-ONLY-NO-SESSION-LIVENESS-CHECK",
  type: "FIX",
  status: "BACKLOG",
  priority: "P0",
  size: "S",
  zone: "apps/mcp-server/",
  owner: "po",
  next_agent: "dev-mcp-server",
  created_at: $now,
  created_by: "po/triage-20260825T0107Z",
  updated_at: $now,
  dedup_key: "reaper:orphan-mint-no-session-presence-liveness-check",
  title: "server-reaper mints orphan-signals keyed ONLY on lock TTL expiry with ZERO liveness check — gcExpiredLocks' Phase-1 scan never consults session-presence, so a presence-REGISTERED, demonstrably-live session's long-running task is falsely orphaned the moment its TTL lapses",

  desc: "CONFIRMED AT SOURCE by po triage 2026-08-25T01:07Z (session 036ceaf1) — read verbatim from the implementation, NOT inferred from the signal. Two dev-team recurring-bug envelopes (d89d8226 and its correction 4a5a8e12, carrying corrects_envelope_id) collapse to ONE finding; envelope 2 supersedes envelope 1's root cause and ONLY envelope 2's premise is built on here.\n\nTHE PREDICATE (apps/mcp-server/src/infrastructure/db/coordinationStore.ts, gcExpiredLocks() Phase 1 pre-GC scan):\n  WHERE expires_at + ? < unixepoch('now')\n    AND task_kind IN (ORPHAN_EMIT_ALLOW_LIST)\n    AND task_id NOT LIKE 'published:%'\n    AND task_id NOT LIKE 'cron:%'\n    AND task_id NOT LIKE 'cron-registration:%'\n    AND task_id != 'dev-team-cron-singleton'\nTTL expiry is the SOLE liveness proxy. The row's own owner_client_session IS selected by that query — but only to be copied into the emitted signal payload as original_owner_client_session. It is never used to ask whether that session is still alive. There is no join, no subquery and no lookup against task_kind='session-presence' anywhere in the function.\n\nLIVE EVIDENCE: orphan-signal:task:FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING was minted 2026-08-24T23:59:49Z against a lock owned by session 036ceaf1-bf34-46cd-92e4-8c6b213ff4bb — a session that was presence-REGISTERED and LIVE at mint time (started_at 2026-08-24T21:09:38Z, heartbeat_at 2026-08-25T01:09:58Z, continuously running, executed ticks 00:37Z / 00:54Z / 01:07Z) and was still live when this row was written. Observed re-trips of the same false orphan: 00:37Z and 01:07Z.\n\nWHY ENVELOPE 1'S FRAMING IS INSUFFICIENT (deliberately NOT built on): 'the S2 dispatch convention leaves the sprint-task lock unreleased on the success path' is a real contributing factor but NOT the generator. A fix designed against it would leave the defect fully intact for any task that legitimately outlives its TTL — the reaper would still falsely orphan a correctly-behaving, mid-flight, long-running agent.\n\nCRITICAL DESIGN CONSTRAINT — THE GUARD MUST BE SUPPRESS-ONLY, NEVER ASSERT-DEAD. Sibling row SPIKE-SESSION-PRESENCE-ROSTER-UNDERCOUNTS-LIVE-SESSIONS (backlog, P2) measured task_list_held(kind=session-presence) returning 1 row while >=3 sessions were demonstrably live, and presence registration is OPT-IN, so an ABSENT presence row does NOT mean the session is dead. Required polarity: presence row PRESENT and unexpired => SUPPRESS the mint; presence ABSENT => fall through to exactly today's behaviour. Under that polarity an undercounting roster can only make the guard weaker, never wrong — which is why this row deliberately does NOT depend_on the SPIKE and must not be blocked behind it.\n\nCHEAP TO IMPLEMENT: session-presence rows live in the SAME task_locks table (task_kind='session-presence'), so the guard is one NOT EXISTS correlated subquery added to the existing Phase-1 SELECT — same transaction, no new I/O, no new table, no schema change.\n\nDO NOT COPY THE CRON STEP 1b.1 ORACLE VERBATIM: envelope 2 proposes mirroring the oracle in .claude/skills/cron-detect-loop/SKILL.md Step 1b.1. Open row FIX-CRON-REARM-STEP1B1-LIVENESS-ORACLE-BLIND-WINDOW-FALSE-LIVE (ready[], P0) documents at source that that oracle is broken in BOTH directions across 3 cron families and cost an 8h10m dispatcher outage on 2026-08-23. Take the SHAPE (cross-check presence before acting on lock state); never that implementation.",

  acceptance: "AC-1 gcExpiredLocks' Phase-1 scan must NOT emit an orphan-signal for an expired row whose owner_client_session matches a task_kind='session-presence' row with expires_at > unixepoch('now'). Phase-2 DELETE behaviour is UNCHANGED — the expired lock itself still GCs; only the adoption-signal mint is suppressed.\nAC-2 POLARITY TEST (the load-bearing one): an expired row whose owner_client_session has NO presence row MUST still emit exactly as today. Absence of presence is never treated as proof of life or of death — it is simply not a suppression trigger. A patch that inverts this (emit only when presence is absent-and-confirmed) is a REJECT.\nAC-3 NULL-safety: an expired row with owner_client_session IS NULL must not accidentally match a presence row whose own owner_client_session is NULL; it emits as today.\nAC-4 regression test reproducing the live incident: claim a sprint-task under session S with a short TTL, register a session-presence row for S with a long TTL, let the sprint-task lock expire, run gcExpiredLocks — assert ZERO orphan-signal rows for that task_id AND assert the expired sprint-task row was still deleted.\nAC-5 no regression in the existing reaper/coordination suites — compare the failing FILE SET against the documented pre-existing baseline, never the exit code (reference_mcpserver_fullsuite_preexisting_failure_baseline).",

  files: ["apps/mcp-server/src/infrastructure/db/coordinationStore.ts"],
  baseline_pass: "cd apps/mcp-server && bun test src/__tests__/task-lock-reaper-timer.test.ts src/__tests__/FU-LOCKSTORE-EXPIRED-GC.test.ts src/infrastructure/__tests__/coordinationStore.test.ts — green BEFORE and AFTER; full-suite comparison by failing-FILE-SET vs the documented pre-existing baseline, never by exit code.",

  related_to: [
    "FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD",
    "FIX-ORPHAN-FR4-FR5-FLOW-DEVTEAM-ADOPTION-GUARD",
    "FIX-ORPHANADOPTION-TREEHYGIENE-EMPTY-ZONE-REPOWIDE-REVERT",
    "SPIKE-SESSION-PRESENCE-ROSTER-UNDERCOUNTS-LIVE-SESSIONS",
    "FIX-CRON-REARM-STEP1B1-LIVENESS-ORACLE-BLIND-WINDOW-FALSE-LIVE",
    "FIX-SPRINT-TASK-HEARTBEAT-LOCK"
  ],
  depends_on: [],
  discovered_by: "dev-team ticks 2026-08-24T23:59Z / 2026-08-25T00:37Z / 01:07Z (recurring-bug envelopes d89d8226 + correction 4a5a8e12); routed + source-verified by po triage 2026-08-25T01:07Z",

  coverage_verified_by_po: "Re-verified independently this tick via scripts/po-board-dedup-search.sh over the NON-TERMINAL lanes on 'reaper', 'orphan', 'presence' and 'liveness', then by READING each candidate in full rather than trusting its title. RESULT: no row covers the MINTING side. Rebuttals of the near-misses, each checked at source: (a) backlog FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD's title does say 'stop false-orphaning long agents', which looks like coverage — but its own audit_ref.note scopes that clause to fix_spec(b)/AC2, whose successor row is FIX-SPRINT-TASK-HEARTBEAT-LOCK; (b) that successor's four subtasks are owner_client_session binding, sprint-task TTL raise, a heartbeat loop in execute-tier.md, and INV-GATEWAY-1 cleanup — i.e. keep the CLAIMANT's lock fresh so it never expires. That is the opposite end of the same symptom and leaves the reaper's own predicate untouched: any task outliving even a raised TTL is still falsely orphaned. (c) backlog SPIKE-SESSION-PRESENCE-ROSTER-UNDERCOUNTS-LIVE-SESSIONS is the INVERSE direction (roster misses live sessions; here the roster HAS the session and the reaper never looks). (d) backlog FIX-DEVTEAM-SF1-GATE-BLIND-TO-INFLIGHT-DISPATCH-LIVENESS is the same DEFECT CLASS (lock possession read as liveness) in a different component (the SF-1 singleton gate), not this call site. (e) ready[] FIX-ORPHAN-FR4-FR5-*, backlog FIX-ORPHANADOPTION-TREEHYGIENE-* are both adopter-side. Cold archive docs/data/orch/archive/2026-08.json also carries no reaper-side row."
}]

| .task_board.ready |= map(
    if .id == "FIX-ORPHAN-FR4-FR5-FLOW-DEVTEAM-ADOPTION-GUARD" then
      .subtasks = ((.subtasks // []) | map(
        if .seq == 4 then
          .title = "Fix the orphan-signal task_release call sites (FR-2 Rung B) — in orphan-adoption.md, NOT main.md; see po_triage_20260825T0107Z_subtask4_lineref_drift"
          | .acceptance = "All 3 orphan-signal:* release calls (docs/agents/dev-team/flow/orphan-adoption.md :69, :72, :95) pass owner_agent + original_owner_client_session (echoing payload.original_owner_client_session) so Rung B matches. Verify released:1 against a real NULL-owner orphan-signal row; today all 3 return released:0."
        else . end))
      | .po_triage_20260825T0107Z_subtask4_lineref_drift = "FOLD, NOT A NEW ROW (po triage 2026-08-25T01:07Z). A dev-team envelope this tick called the false orphan orphan-signal:task:FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING 'UNRELEASABLE — task_release keys on owner_client_session so the call is a no-op', re-tripping every tick until TTL. THE TOOL-SIDE HALF IS FALSE: releaseTask() (coordinationStore.ts) HAS a working FR-2 Rung B null-session ladder (WHERE task_kind='orphan-signal' AND owner_client_session IS NULL) and taskReleaseTool.ts exposes both params — shipped with FIX-ORPHAN-FR1-FR2-INFRA-HEARTBEAT-LADDER. THE REAL DEFECT IS CALLER-SIDE = this row's subtask 4: all 3 orphan-signal release calls in orphan-adoption.md (:69,:72,:95) pass ONLY owner_client_session, so Rung A cannot match a NULL-owner row and Rung B is never attempted. That is the true generator of released:0. WHY NEVER IMPLEMENTED — LINE DRIFT: subtask 4 pointed at dev-team/flow/main.md :365-370/:391-394, verified live this tick to now hold the WF-1c/WF-1d head-pin blocks (the adoption body was extracted to orphan-adoption.md after subtask 4 was written), so an implementer following it verbatim finds no release call and skips it. Subtask 4 corrected in this same write. dispatch_lane left null deliberately — this row's own 22:30Z correction already diagnosed the stranding as RLC starvation, not a lane-field defect. The MINTING-side half of the same envelope pair is genuinely uncovered and was minted separately as FIX-REAPER-ORPHAN-MINT-KEYS-ON-TTL-ONLY-NO-SESSION-LIVENESS-CHECK."
    else . end)

| .task_board.ready |= append_note("FIX-BCTC-NONBANK-OPERATING-PROFIT-EBITDA-SCALAR-ZERO-HPG";
    " || FOLD +1 occurrence, po triage 2026-08-25T01:07Z: bctc_signal envelope 13ae0312 (HPG Q1-2026, routine cycle) reports esc4 DISCARDED with reason 'operating_profit=0 (corrupt extraction, recurring 36th+ cycle)', alongside net profit 9,055.9 ty VND EXCEEDING gross profit. Same corrupt-zero scalar this row already owns, now self-counted at 36+ consecutive cycles. No re-mint.")

| .task_board.backlog |= append_note("CLEAN-NOTEBOOK-BYTECAP-3-FILES-UNPRUNABLE-SINGLE-SECTION";
    " || FOLD +3 ba.md envelopes, po triage 2026-08-25T01:07Z: 487b3524 context_bloat_breach (21032B vs 12000B) + 3a836fc3/dd9d8ce3, both a NEW type notebook_undroppable_remainder_over_cap_breach — the renamed successor of notebook_no_valid_drop_candidate_breach (already folded 4x here), same file, same action_required=manual_split_to_archive. That new name has NO Pipeline-A table row yet in triage-signals.md, so it routed via the route-by-`to` fallback (to=claude-manager-helper). USE AS THE FIXTURE: the hook now reports the undroppable REMAINDER — ba.md preamble+sentinel sections alone are 13232B against a 12000B cap, i.e. direct quantitative proof of this row's root cause.")

| .task_board.backlog |= append_note("FIX-CYCLE-SNAPSHOT-PRODUCER-NAMES-BY-WALLCLOCK-CONSUMER-LOOKS-UP-BY-NOMINAL-TICK";
    " || FOLD +1 occurrence, po triage 2026-08-25T01:07Z: cowork-fire envelope a9d6e71d (fire_time 2026-08-25T00:07:51Z, classification FIRE, errors[] empty, 4/4 slots won) self-reports in its own note 'Step 4.7 snapshot written as cycle-snapshot-00:05.json (wall clock) but emit_pressure_state looked up nominal tick 00:00 -> cycle_snapshot_promoted:false, recurring wall-clock-vs-nominal defect'. Exact match for this row's dedup_key cycle_snapshot:wallclock_name_vs_nominal_lookup, now confirmed still firing after the 17-consecutive-tick run this row was minted on. No re-mint.")

| .task_board.backlog |= append_note("FIX-REFINE-PAGECOUNT-ZERO-COVERLETTER-MASK";
    " || CANDIDATE CORROBORATION (linkage NOT yet proven — do not treat as confirmed coverage), po triage 2026-08-25T01:07Z: bctc_signal envelope 2caf1dd4 reports get_bctc_full(DXG) returning 'Chua co du lieu' for the 40th+ CONSECUTIVE cycle despite DXG_2026_Q1 and DXG_2026_Q2 PDFs being on file since 2026-08-01 / 08-03. That is the exact shape this row's root cause predicts (PDFs present, text_status=COMPLETE, refine pass mis-skips them as cover-letter, so nothing ever reaches structured_data). REQUIRED CHECK BEFORE CLOSING THIS ROW AS COVERING DXG: confirm the DXG 2026-Q1/Q2 rows are actually among the 25/25 pending page_count=0 + windows=[] set this row measured. If they are NOT, DXG is a separate, uncovered extraction gap and needs its own row — 40+ silent cycles on a watchlist ticker is not acceptable steady state. PO did not mint one this tick precisely because minting on an unverified linkage is the duplicate-by-symptom trap.")

| .task_board._updated_at = $now
| .task_board._updated_by = "po/triage-20260825T0107Z"
