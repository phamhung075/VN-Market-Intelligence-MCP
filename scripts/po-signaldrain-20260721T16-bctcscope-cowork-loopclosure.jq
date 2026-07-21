# PO signal-drain triage 2026-07-21T16:xxZ — dispatched from dev-team 15:37Z tick.
# Adjudicates devteam-20260721T154949-bctcscopecorr (a)(b)(c) + cow-20260721T153000
# + files the 3 system-auditor rows per router-verified ground truth.
#
# Writes (all additive; no lane moves, no status flips on task rows):
#   1. MINT FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER  (decision b root cause, quantified)
#   2. 15T row      <- AC clause-1 contamination finding (groups 1 and 2 are NOT disjoint)
#   3. census SPIKE <- group-3 serving-plane evidence (decision a: fold, do NOT mint)
#   4. CLEAN-COWORK <- cowork signal triage + 2 corrections to the cowork agent's claims
#   5. signal_queue <- 5 po-addressed NEW rows -> RESOLVED (po-20260720T052606 left NEW: to=unified-agent)
#
# Invoke: jq --arg now "$NOW" -f <this> docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def stamp_backlog($id; $field; $text):
  (.task_board.backlog) |= map(if .id == $id then . + {($field): $text} else . end);

# ---------------------------------------------------------------- 1. MINT
.task_board.backlog += [{
  id: "FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER",
  type: "FIX",
  status: "BACKLOG",
  priority: "high",
  size: "M",
  zone: "cross-service/",
  owner: "po",
  next_agent: "architect",
  plan_only: true,
  supervised: true,
  origin_signal_id: "devteam-20260721T154949-bctcscopecorr",
  created_at: $now,
  created_by: "po-signaldrain-20260721T16",
  title: "PLAN-ONLY: BOUNDED-1 gates correctly WITHHOLD 26 of 31 high-priority backlog rows for a 'router-adjudicated supervised dispatch path' that DOES NOT EXIST — no sweeper ever promotes an owned/supervised backlog row, so gated rows idle indefinitely (15T sat 6 days; 4 ops-owned high rows aged 4-12d)",
  question: "scripts/devteam-backlog-promote-bounded1.jq documents each exclusion gate with 'gated rows still launch normally via the router-adjudicated path'. Which executable actually implements that path? Router dispatch is intent/signal-driven (CLAUDE.md step 2.5) and PO mints rows; neither sweeps .task_board.backlog[] by priority. If no sweeper exists, every gate added to BOUNDED-1 silently converts rows from 'auto-dispatchable' to 'never dispatched' rather than to 'dispatched deliberately'.",
  evidence: "RAW-measured live 2026-07-21T16:xxZ against docs/data/orch/orch-state.json + docs/data/orch/archive/backlog-detail.json by replaying the promote script's own predicates: 31 high-priority BACKLOG rows; 26 gated by >=1 gate; only 5 BOUNDED-1-ELIGIBLE (FB-LAUNCHD-QA-FIRE-VERIFY-DEDUP, QA-COWORK-SLOT-SESSION-DOWN-SURVIVAL, FIX-BCTC-CTG-BALANCE-SHEET-REFINE, FIX-REFINE-PAGECOUNT-ZERO-COVERLETTER-MASK, FEAT-NEWS-GEOPOLITICAL-CLASSIFICATION). Breakdown: 16 gated by NON-DEV-OWNER-unrouted (owner names a deliberate-launch agent AND next_agent empty on BOTH board and detail), 12 by supervised, 11 by plan_only. Concrete casualties: FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T (owner=ops, next_agent absent, no detail entry -> board-fallback -> NON-DEV-OWNER gate, idle 6d) and PDF-AVAIL-02-FIX (detail owner=ops + next_agent=null AND board supervised=true -> double-gated, idle since mint). Also verified the promote script's array-shape ingest is NOT the bug: .items is a 442-element array and scripts/devteam-backlog-promote-bounded1.jq:572-576 already id-keys it defensively (FIX-DEVTEAM-BOUNDED1-DETAIL-ITEMS-ARRAY-INDEX). The gates are working AS DESIGNED — the designed-for destination lane is missing.",
  deliverable: "findings doc + recommendation: (a) build a supervised-dispatch sweeper (priority-ordered, WIP-capped, router- or PO-driven) that consumes exactly the gated set; OR (b) make 'gated' an explicit terminal disposition (HELD) with a required owner+review date so idling is visible instead of silent; OR (c) require next_agent at mint time so NON-DEV-OWNER-unrouted can never fire. Include an aging report so a gated row cannot sit >N days unseen.",
  status_note: "AC: no high-priority backlog row can be simultaneously (i) excluded from BOUNDED-1 and (ii) absent from every dispatch path — proven by an executable that lists gated rows and their assigned dispatch lane, run live, not by flow-doc prose. Priority: high.",
  refs: [
    "project_orch_4loop_wiring_audit_20260721",
    "feedback_file_prior_art_check_before_minting_row",
    "feedback_review_status_stuck_in_inprogress_lane_blocks_wip"
  ],
  related_not_duplicate: "SPIKE-BOUNDED1-ELIGIBILITY-CONTRACT-REVIEW asks whether the gate PREDICATES are correct/consolidatable (are the gates buggy). THIS row asks where gated rows GO (the gates are right; the destination is absent). Complementary, not overlapping — resolve together if architect prefers.",
  note: "Minted from router scope_correction devteam-20260721T154949-bctcscopecorr decision (b): 'why did a high-priority raw-verified row with a named owner sit 6 days undispatched'. Answer: not neglect and not BCTC-specific — a structural hole affecting 84% of the high-priority backlog. supervised:true retained so this row itself is router-adjudicated (and is, deliberately, an instance of its own class)."
}]

# ------------------------------------------- 2. 15T AC contamination finding
| stamp_backlog(
    "FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T";
    "po_ac_contamination_20260721T16";
    "AC CLAUSE-1 CONTAMINATED — groups (1) and (2) are NOT disjoint (PO signal-drain 2026-07-21T16:xxZ, RAW-verified via gateway get_earnings_calendar + get_bctc_full this tick). This row's AC clause 1 is 'get_earnings_calendar(Q1-2026) no longer reports QUA HAN for all 15'. LIVE NOW: 13 of the 15 already show DA NOP — DBC 07-20, DGC 07-19, DXG 07-20, FRT 07-19, GEX 07-19, KDC 07-19, KDH 07-20, MSN 07-20, PDR 07-20, SAB 07-19, SHB 07-20, VJC 07-19, VND 07-19. Only HUT and PLX remain QUA HAN. Those submission dates 07-19/07-20 are EXACTLY the NGAY-NOP-flip window of FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP, so clause 1 was satisfied by the CORRUPTION, not by any fix. Corroborated on the serving plane: MSN now shows DA NOP 2026-07-20 yet get_bctc_full(MSN,2026,Q1) still returns 'Chua co du lieu BCTC'. CONSEQUENCES: (i) the reparse corruption has SPREAD INTO this row's 15-ticker cohort — the correction signal's 16/15/4 decomposition is not a partition and must not be treated as one; (ii) clause 1 is no longer evidence of anything and MUST NOT be scored on its own — the conjunctive AND with clause 2 (get_bctc_full non-empty for MSN/SAB/PLX) is the only thing preventing a 13/15 false-green today; (iii) do NOT rewrite the AC to drop clause 2, and do NOT close this row on calendar status alone. RECOMMEND ops re-derive the cohort membership from the SERVING plane (get_bctc_full result) rather than from calendar QUA HAN, which is now a corrupted discriminator. Refs: feedback_nonzero_values_need_plausibility_check, feedback_passive_health_masks_dead_data."
  )

# --------------------------------- 3. census SPIKE <- decision (a) evidence
| stamp_backlog(
    "SPIKE-BCTC-Q1-2026-SERVABILITY-CENSUS";
    "po_decision_a_20260721T16";
    "PO DECISION (a) — group (3) {NVL SSI VCI HCM} gets NO new row; it FOLDS into this SPIKE (PO signal-drain 2026-07-21T16:xxZ). RAW evidence gathered this tick via gateway get_bctc_full(2026,Q1): NVL, SSI, VCI, HCM all return the literal string 'Chua co du lieu BCTC' — BYTE-IDENTICAL to MSN, which is a confirmed member of the mode-2 cohort FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T. By contrast VNM and VIC return '[CORRUPT DATA — SKIP] ... total_assets=0', the mode-1 signature. So the serving plane cleanly separates mode-1 from {mode-2, mode-3} but CANNOT separate mode-2 (row absent) from mode-3 (row present but API-gated) — exactly as this SPIKE's own method section already states. Minting a 4th row for group (3) would therefore mint a row whose failure mode is UNMEASURED and is indistinguishable at the serving layer from an existing row's cohort — the same duplicate-mint class the router self-corrected for. Group (3) is instead added to this SPIKE's census input set; the DB-plane probe this SPIKE already owns is what decides fold-vs-new. A new row is warranted ONLY if the DB plane shows a genuine 4th mode. ALSO NOTE for the census: VNM and VIC carry the mode-1 signature but are not named in the reparse row's 16-ticker title — treat the 16 as a lower bound and re-enumerate mode-1 from the serving plane too. SEQUENCING CORRECTION to router_refinement_20260721T1549: that note says to run this SPIKE AFTER pdf-extractor recovery because serving-path probes are unreliable during the outage. That is NOT correct and would needlessly block the measurement — get_bctc_full SERVES from the database and is demonstrably reliable right now (this tick it returned full servable statements for HPG and FPT, the corrupt-skip banner for VNM/VIC, and the absent banner for NVL/SSI/VCI/HCM/MSN — three cleanly distinguishable outcomes). pdf-extractor is required for INGEST/re-extraction, not for serving. This SPIKE is therefore UNBLOCKED and may run NOW, in parallel with the pdf-extractor deploy gate; only the two remediation FIX rows need pdf-extractor healthy."
  )

# ------------------------------ 4. CLEAN-COWORK <- cowork signal + corrections
| (.task_board.ready) |= map(
    if .id == "CLEAN-COWORK-DISPATCHER-TELEMETRY-DRAIN-DIR"
    then . + {po_cowork_signal_triage_20260721T16:
      "TRIAGE of cow-20260721T153000 (MED, cowork-team) — root cause CONFIRMED at the mechanism level, but TWO of the signal's claims are CORRECTED and its recommended fix is INSUFFICIENT ALONE (PO signal-drain 2026-07-21T16:xxZ, RAW-verified). CONFIRMED: the drain skip is shape-driven, and scripts/agents-flow/drain-signals.js:77 is the exact predicate — a file is skipped iff it is an array OR has NONE of from/source/type/signal_type; line 78 logs 'leaving in inbox' and never moves or unlinks. Live shape census: all 47 top-level cowork-team-*.json are flat (0 enveloped), while 121 of 125 cowork files already in processed/ ARE enveloped — shape predicts drain success almost perfectly. So this row's acceptance clause (1) (redirect/fix the telemetry writer) is the right root-cause fix and is already correctly specified. CORRECTION 1 — the signal's '96 files/day of pure accretion at */15' is NOT supported and should not be used to size the work: the stuck floor is 43/47 a single stale 2026-07-10..07-11 batch, and cowork telemetry has drained NORMALLY since 07-14 (14 on 07-14, 14 on 07-15, 29 on 07-16, 31 on 07-17, 19 on 07-18, 5 on 07-21 all reached processed/). Exactly ONE flat file accreted on 07-21. Real accretion of NON-drainable files is ~1/week, not 96/day. The Step 6.1 skip-on-silent condition may still be worth honoring, but it is a hygiene nit, not a 96/day flood — do not prioritize it as one. CORRECTION 2 — the signal frames Option A as a one-line writer change that 'makes existing prune machinery work'. It does not, for the files that already exist: because the skip path never removes anything, the 47 accumulated files are permanently inert regardless of what the writer does from now on. The one-time sweep (this row's acceptance clause 2) is therefore REQUIRED, not optional, and is the ONLY clause that actually clears the >50 guard today (47 removed leaves ~6, well under the threshold). Writer fix prevents recurrence; sweep restores the detector. SCOPE NOTE for the implementer: the drain needs only ONE of from/source/type/signal_type, so the minimal unblock is narrower than the full envelope — but emit the full enveloped schema per docs/agents/cowork-team/flow/telemetry.md:5 anyway, since that INVARIANT is what the processed/ corpus already follows. NO NEW ROW MINTED: acceptance clauses (1)(2)(3)(4) on this row already cover the writer fix, the sweep, the shape-aware guard count, and quarantining. Signal RESOLVED into this row. Also acknowledged: the cowork dispatcher RETRACTED cow-20260721T152500 this tick after finding it had queried .task_board.rows[], a key that does not exist — correct self-catch of the empty-read-as-evidence class; no action needed."}
    else . end
  )

# ------------------------------------------------- 5. signal_queue dispositions
| (.signal_queue.rows) |= map(
    if .id == "devteam-20260721T154949-bctcscopecorr" then
      . + {status: "RESOLVED",
           po_disposition: "ADJUDICATED (PO signal-drain 2026-07-21T16:xxZ). (a) group (3) folds into SPIKE-BCTC-Q1-2026-SERVABILITY-CENSUS, no new row — serving plane cannot separate mode-2 from mode-3, see po_decision_a_20260721T16. (b) root cause is NOT BCTC-specific and NOT neglect: BOUNDED-1 gates withhold 26/31 high-priority backlog rows for a supervised dispatch path that has no sweeper — minted FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER. (c) sequencing SPLIT rather than serialized: the census SPIKE is UNBLOCKED and runs now (get_bctc_full serves from the DB and is reliable during the outage — proven live this tick); the two remediation FIX rows DO need pdf-extractor healthy, and PDF-AVAIL-02-FIX is the long pole whose remaining action is a USER-GATED rebuild of an already-committed fix (c78839c6c) that PO cannot authorize — router should surface that deploy gate to the user. Additional finding the escalation did not have: the 16/15/4 decomposition is NOT a partition — the reparse corruption has already flipped 13 of the 15 ingest-stall tickers to DA NOP, contaminating that row's AC clause 1 (see po_ac_contamination_20260721T16)."}
    elif .id == "cow-20260721T153000" then
      . + {status: "RESOLVED",
           po_disposition: "Root cause CONFIRMED at drain-signals.js:77; absorbed into CLEAN-COWORK-DISPATCHER-TELEMETRY-DRAIN-DIR (already READY, acceptance clauses 1-4 cover it). Two claims corrected: the 96 files/day accretion figure is unsupported (43/47 of the floor is one stale 07-10/07-11 batch; drain has worked since 07-14), and the writer fix alone cannot clear the existing 47 (skip path never removes files) so the one-time sweep is required. No new row. See po_cowork_signal_triage_20260721T16."}
    elif .id == "sys-20260721T154233-68d8" then
      . + {status: "RESOLVED",
           po_disposition: "pdf-extractor A-20 — REAL, and the root cause of the api-gateway health signal filed alongside it. CORROBORATION ONLY, no re-mint: already tracked by PDF-AVAIL-02-FIX (recurring_bug_count HELD at 6 — same continuous ~21h episode, not a new one). Code fix COMMITTED c78839c6c; the rebuild/deploy is USER-GATED and PO cannot authorize it, so auditor A-20 re-emits every Tier-1 cycle are expected and are NOT the fix failing (it has not run anywhere yet). DO NOT restart — re-wedges on the next long PDF. See po_sequencing_gate_20260721T16."}
    elif .id == "sys-20260721T154251-4eb8" then
      . + {status: "RESOLVED",
           po_disposition: "NOT an independent api-gateway defect — downstream symptom of the pdf-extractor outage (sys-20260721T154233-68d8). Router raw-verified: localhost:4000/health returns HTTP 200 with {status:degraded, services:{pdf:down}}, pdf latency 2001ms, all 8 other services ok; the endpoint is UP and correctly self-reporting degraded. Filing this as its own row would mint a duplicate. Closed against PDF-AVAIL-02-FIX. NB the auditor was RIGHT here — an earlier router probe of port 3001 (the frontend) rather than 4000 (api-gateway) produced a false-positive dismissal that the router self-corrected; the summary-line 'HTTP CURL_ERR' remains imprecise but the finding is sound."}
    elif .id == "sys-20260721T154239-695f" then
      . + {status: "RESOLVED",
           po_disposition: "mcp-server A-30 memory 98.70% — REAL but a re-emit of triage the ROUTER already holds; no row minted and NO rebuild dispatched by PO (rebuild decisions are user-gated and the router is holding this one pending a live dev-mcp-server report). Context recorded for whoever picks it up: mcp-server 2.973GiB/3GiB; rag-service 731MiB/768MiB and restarted 15:22:12Z with RestartCount=2, ExitCode=0, OOMKilled=FALSE — a CLEAN exit, not an OOM kill — then climbed back to ~95% of cap within 22 minutes, so the restart did not durably relieve pressure. FP-reemit convergence is tracked by FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE; the underlying leak by FIX-MCP-MEMORY-CODE-LEAK."}
    else . end
  )

| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "po-signaldrain-20260721T16"
