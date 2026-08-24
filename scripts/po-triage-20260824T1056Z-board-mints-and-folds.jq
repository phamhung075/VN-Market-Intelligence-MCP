# po-triage-20260824T1056Z-board-mints-and-folds.jq
#
# OWNING FLOW: docs/agents/po/flow/triage-signals.md (Pipeline A + Pipeline B dispositions)
#            + docs/agents/po/flow/manual-dispatch-sweep.md § Step 2 (the stamp at the bottom)
# Invoked as: jq -f scripts/po-triage-20260824T1056Z-board-mints-and-folds.jq \
#               --arg now "<ISO8601Z>" docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# 3 mints + 4 folds + 1 manual-dispatch stamp, from the router hand-dispatch of the 7 stranded
# `to: po` signal_queue rows and the 82-envelope Pipeline-A durable inbox.
# All backlog mints use status "BACKLOG" — LANE_ALLOWED_STATUSES.backlog is {BACKLOG, BLOCKED}.

def MINT_BCTC_EMITTER:
{
  id: "FIX-BCTC-IMGDEG-SIGNAL-SUMMARY-CONTRADICTS-ITS-OWN-LIVE-CONFIDENCES",
  type: "FIX",
  title: "bctc_image_fetch_degraded signals are false about their own subject on two axes: the summary hardcodes 'capped <=0.6 confidence' without ever reading a confidence (live units are 0.65/0.70/0.75), and the rising-edge count===2 fire makes affected_unit_ids a point-in-time snapshot presented as the report's final extent (live truth 3)",
  status: "BACKLOG",
  zone: "apps/mcp-server/",
  priority: "P1",
  size: "S",
  owner: "po",
  next_agent: "dev-mcp-server",
  depends: [],
  supervised: false,
  plan_only: false,
  baseline_pass: true,
  created_at: $now,
  created_by: "po (triage-20260824T1050Z, router hand-dispatch of 7 stranded signal_queue rows)",
  updated_at: $now,
  updated_by: "po",
  dedup_key: "signal_emission_integrity:bctc_image_fetch_degraded",
  origin_signal_id: "bctc-imgdeg-1f53ef33-20260824T090414Z",
  files: [
    "apps/mcp-server/src/infrastructure/signals/bctcImageFetchDegradedSignalWriter.ts",
    "docs/agents/bctc-analyst/flow/table-page.md",
    "docs/agents/bctc-analyst/flow/continuation-stitch.md"
  ],
  root_cause: "THREE defects in one emitter, all in apps/mcp-server/src/infrastructure/signals/bctcImageFetchDegradedSignalWriter.ts. (A) HARDCODED SUMMARY vs LIVE DATA: buildBctcImageFetchDegradedRow() templates the literal string 'capped <=0.6 confidence' unconditionally and never reads a confidence value at all - it only receives reportId + affectedUnitIds. (B) RISING-EDGE COUNT PRESENTED AS FINAL EXTENT: shouldSignalImageFetchDegradation() returns true only on strict equality occurrenceCountIncludingThisPush === threshold (2). That rising edge is deliberate and documented ('never re-fires on the 3rd, 4th, ... occurrence for the same still-open report') - the defect is that nothing ever AMENDS the emitted row, so affected_unit_ids freezes at whatever 2 units existed at fire time while the summary presents it as the report's degradation extent. (C) NO dedup_key emitted, unlike every other longtail type whose triage rule says 'already stamped' - docs/agents/po/flow/triage-signals-longtail.md:21 asserts dedup_key = bctc_image_fetch_degraded:{report_id} is 'already stamped' on the row; it is not, and yesterday's sibling row only carries one because PO hand-stamped it at triage. UNDERLYING, AND LARGER THAN THE EMITTER: the <=0.6 cap the writer's own file header calls 'BY DESIGN' is a prose instruction to the refine_bctc_md subagent in two flow docs, with no server-side clamp anywhere on the push_bctc_refined_unit path. Live data refutes it 3/3.",
  evidence: "ALL MEASURED AT SOURCE 2026-08-24T10:5xZ through the gateway wrapper, not taken from the dispatch. get_bctc_refined(report_id=1f53ef33-8f50-489b-8505-689740692ab0) returns 12 units, of which THREE carry an image_unavailable flag: unit-0004 confidence 0.75 flags [continuation_marker_missing:page7, image_unavailable:pages6-8] refined_at 09:04:04; unit-0005 confidence 0.65 flags [image_unavailable, garbled_ocr_layout] refined_at 09:04:14; unit-0006 confidence 0.70 flags [image_unavailable, ocr_row_alignment_uncertain] refined_at 09:04:24. The emitted signal bctc-imgdeg-1f53ef33-20260824T090414Z names only [unit-0004, unit-0005] and asserts '<=0.6'. Its ts 09:04:14 is unit-0005's refined_at to the second, i.e. the fire happened at the N=2 edge; unit-0006 arrived 10s later and can never be added. NOT ONE OF THE THREE CONFIDENCES IS AT OR BELOW 0.6 - the true range is 0.65-0.75. Yesterday's sibling bctc-imgdeg-69fcd047-20260823T090510Z asserts the identical '2 units <=0.6' sentence, so this is a template, not a coincidence.",
  ac: [
    "AC-1 DERIVE THE SUMMARY FROM MEASURED VALUES, NEVER A TEMPLATE. buildBctcImageFetchDegradedRow() must take the actual confidences (or read them) and state the observed range, e.g. 'N refined units flagged image_unavailable, confidence 0.65-0.75'. Do not merely change 0.6 to another constant - a second hardcoded number is the same defect one measurement later. This is byte-for-byte the same fix as FIX-CCATO-NTG-ROWS-NOT-PRODUCED-BY-EITHER-SANCTIONED-ENGINE-FORGED-WRITER-ID AC-5 in the OTHER emitter (scripts/narrative-truth-gate.sh:421-423); read that row first and keep the two fixes consistent in shape.",
    "AC-2 MAKE THE COUNT HONEST. Either (a) keep the rising-edge single fire but have the row say so explicitly ('>=2 units at fire time; count is a rising-edge snapshot, re-query get_bctc_refined for the current extent'), or (b) amend the existing open row's payload.affected_unit_ids on each later occurrence for the same report_id instead of dropping it. Pick one and say why; do NOT emit one row per occurrence - that would reproduce the CCATO 19.5x amplification in a second emitter.",
    "AC-3 EMIT dedup_key = bctc_image_fetch_degraded:{report_id} at the emitter, since triage-signals-longtail.md:21 already documents it as 'already stamped' and dedups on it. Either ship the field or correct that doc line - a triage rule keyed on a field that never arrives silently degrades to no dedup at all.",
    "AC-4 THE LOAD-BEARING ONE - ENFORCE OR RETIRE THE <=0.6 CAP. Establish at source whether image_unavailable-flagged units are SUPPOSED to be clamped to <=0.6. If yes, clamp server-side on the push_bctc_refined_unit path (a prose instruction to an LLM subagent is a KNOWN-FAILED enforcement mechanism - see FIX-EMITSIGNAL-DEDUPKEY-GRAMMAR-UNVALIDATED-CALLER-FREETEXT-DEFEATS-7D-WINDOW po_retarget). If no, remove the claim from the writer's header comment and from both flow docs. Today the cap is asserted in three places and honoured in none, so any consumer filtering confidence<=0.6 to find image-degraded units returns ZERO for report 1f53ef33 while three degraded units sit in the table.",
    "AC-5 REGRESSION with a NEGATIVE CONTROL: a report whose flagged units genuinely are <=0.6 must still produce a correct summary. A fix validated only on the 0.65-0.75 family is the shape recorded in feedback_fleetwide_gate_validated_on_one_file_optout_allowlist."
  ],
  po_not_a_duplicate: "Checked every non-terminal lane by dedup_key and by keyword (BCTC|IMAGE|IMGDEG|image_unavailable|page_image) before minting. The one near neighbour, FIX-BCTC-PAGE-IMAGE-FETCH-DEGRADED-CONFIDENCE-CAP (backlog, P1, developer), is a DIFFERENT subject and is deliberately kept separate: that row asks WHY the page-image fetch fails (fetch plane - get_bctc_page_image / pdf-extractor / stored PDF) and this row is about the SIGNAL being false about its own subject and the cap being unenforced. Both were folded/updated in the same write; neither subsumes the other. FIX-BCTC-REFINE-PAGE-IMAGE-UNAVAILABLE-CAPS-CONFIDENCE is the SHIPPED fix this writer came from and is not on any open lane.",
  verification_gate: "(a) Paste the live get_bctc_refined output for report 1f53ef33-8f50-489b-8505-689740692ab0 showing the three flagged units and their confidences, then paste the summary the fixed emitter produces for the same input. (b) State the AC-4 ruling explicitly - clamped or claim-removed - with the source you read to decide. (c) READ-ONLY ON EFFECTS: no signal_queue append and no BUG Telegram from any test run."
};

def MINT_SIZELINT:
{
  id: "FIX-SIZELINT-TASKSMDJANITORJOB-1012L-SECOND-CONCURRENT-OFFENDER-BLOCKS-FLEET-PUSH",
  type: "FIX",
  title: "SECOND, CONCURRENT size-lint offender: apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts is 1012L against a 996L cap in HEAD and in the worktree, with no board row — fixing the P0 pushBctcLayoutHandler row alone cannot unblock the fleet push (ahead=212, behind=0)",
  status: "BACKLOG",
  zone: "apps/mcp-server/",
  priority: "P0",
  size: "S",
  owner: "po",
  next_agent: "dev-mcp-server",
  depends: [],
  supervised: false,
  plan_only: false,
  baseline_pass: true,
  created_at: $now,
  created_by: "po (triage-20260824T1050Z, Pipeline-A system-issue envelope 2661e3df from cowork-team)",
  updated_at: $now,
  updated_by: "po",
  dedup_key: "sizelint_offender:apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts",
  files: ["apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts"],
  root_cause: "Commit db0ed7c02 landed a 106-line growth (preceded by 86b31eccd, e109f49f8) that pushed the file from 906L to 1012L, past the 996L size-lint cap, and it is now COMMITTED and inside the push range. The pre-push hook's size-lint gate therefore trips on this file in addition to pushBctcLayoutHandler.ts (252L vs 250L, tracked P0 at FIX-SIZELINT-PUSHBCTCLAYOUTHANDLER-252L-BLOCKS-ENTIRE-FLEET-PUSH). This is the serial-size-lint-offender pattern with a new twist recorded by the reporting agent and confirmed here: the two offenders are CONCURRENT, not sequential, so a one-file sprint cannot clear the gate.",
  evidence: "PREMISE RE-VERIFIED AT SOURCE 2026-08-24T10:4xZ before minting, per triage-signals.md's system-issue 'verify the premise before acting' rule - the envelope's own numbers were NOT trusted. `git show HEAD:apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts | wc -l` = 1012 AND `wc -l < apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts` = 1012 - HEAD and worktree AGREE, so this is NOT another instance of the working-tree-only phantom tracked at FIX-SIZELINT-PREPUSH-SCANS-WORKING-TREE-NOT-PUSH-RANGE (P1). At 02:13Z the same file measured HEAD=906 / worktree=1012 and was correctly diagnosed as that phantom and correctly NOT filed; that diagnosis is now void. NO BOARD ROW EXISTS: a jq sweep of every lane for the literal 'tasksMdJanitor' returns 3 rows, none of which is about this file's size (FIX-TASKKIND-ENUM-NO-GUARD-MARKER-CATEGORY P3, CCATO-MCP-T6-TOOL-REGISTRATION done_verified, FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX blocked). PUSH BACKLOG RE-MEASURED, NOT RELAYED: `git rev-list --count origin/main..HEAD` = 212 and `git rev-list --count HEAD..origin/main` = 0. The envelope said 144 and TNB's 01:37Z ACK said 114 - it is climbing steadily, and 212 commits exist only on this host.",
  ac: [
    "AC-1 Bring tasksMdJanitorJob.ts under the 996L cap by EXTRACTION, not by deleting behaviour - same discipline as the sibling pushBctcLayoutHandler row. State which functions moved and to where.",
    "AC-2 SCOPE BOTH FILES IN ONE PASS. Verify by running the actual pre-push gate (not tsc alone - feedback_red_prepush_strands_fleet records that the hook has TWO gates and tsc-green is not hook-green) that NO size-lint offender remains in the push range. A green on one file while the other is still over means the fleet push is still blocked and this row is not done.",
    "AC-3 Land the push. `git rev-list --count origin/main..HEAD` must reach 0 (or the residual must be named and explained). Report the count before and after.",
    "AC-4 SUPPRESSION HAZARD, do not repeat it: the 02:13Z do-not-file conclusion was written into docs/signals/processed/cowork-team-20260824T021305Z.json and was read and obeyed at least twice after it went stale (~62 minutes). Any future size-lint suppression must run `git show HEAD:<path> | wc -l` against the cap itself rather than trusting a prose note in a prunable directory. Owner of that escalation-step change is agent-father; file it as a follow-up rather than doing it here."
  ],
  po_not_a_duplicate: "Non-terminal lanes swept by dedup_key and by the literal filename before minting. FIX-SIZELINT-PUSHBCTCLAYOUTHANDLER-252L-BLOCKS-ENTIRE-FLEET-PUSH (P0, dev-mcp-server) is a DIFFERENT FILE. FIX-SIZELINT-PREPUSH-SCANS-WORKING-TREE-NOT-PUSH-RANGE (P1, developer) is the scanning-mechanism defect and is explicitly ruled out above by the HEAD==worktree measurement. Neither covers tasksMdJanitorJob.ts. This also closes out the 16 auto-push-abort envelopes in the same inbox: their reason=push-fail premise was re-measured live (ahead=212, behind=0) and is still true, and this row plus its sibling are its root cause, so they fold here rather than minting a 17th row."
};

def MINT_SWEEP_STAMP_DEFECT:
{
  id: "FIX-PO-MANUAL-DISPATCH-SWEEP-STAMP-REJECTED-BY-PROSE-CEILING-ON-ITS-OWN-TOP-CANDIDATE",
  type: "FIX",
  title: "manual-dispatch-sweep's Step-2 stamp is UNEXECUTABLE on its own #1 candidate: the four po_manual_dispatch_* fields are absent from the prose-ceiling STRUCTURAL_FIELDS set, so stamping any already-over-ceiling row is net-new growth and orch-apply hard-aborts — the sweep's 'exactly ONE row per invocation' rule then wedges on that row forever, starving 105 other candidates",
  status: "BACKLOG",
  zone: "cross-service/",
  priority: "P1",
  size: "S",
  owner: "po",
  next_agent: "developer",
  depends: [],
  supervised: false,
  plan_only: false,
  baseline_pass: true,
  created_at: $now,
  created_by: "po (triage-20260824T1050Z, manual-dispatch-sweep pre-check)",
  updated_at: $now,
  updated_by: "po",
  dedup_key: "proseceiling_structural_field_gap:po_manual_dispatch_stamp",
  files: [
    "scripts/orch-row-prose-ceiling-check.mjs",
    "docs/agents/po/flow/manual-dispatch-sweep.md"
  ],
  root_cause: "scripts/orch-row-prose-ceiling-check.mjs's STRUCTURAL_FIELDS set (37 entries) excludes coordination metadata from the prose measurement - id, status, owner, claimed_at/claimed_by, secondary_claimed_at/secondary_claimed_by/secondary_dispatch_target/dispatch_target, promoted_at/promoted_by, dispatch_lane, and so on. The four fields docs/agents/po/flow/manual-dispatch-sweep.md § Step 2 writes - po_manual_dispatch_flagged_at, po_manual_dispatch_flagged_by, po_manual_dispatch_class, po_manual_dispatch_note - are NOT in that set, so they are measured as author-written prose. Stamping a row that is already over ORCH_ROW_PROSE_CEILING_BYTES=12000 is therefore net-new growth past ceiling and exit 1 / hard abort at orch-apply Stage 2.5. This is EXACTLY the defect class already fixed once for a sibling stamp family: FIX-PROSECEILING-SECONDARY-CLAIM-STAMP-FIELDS-MISSING-FROM-STRUCTURAL-EXCLUDE-SET (2026-08-15) added the secondary_claimed_* family for the identical reason and its own header calls the result a 'deterministic livelock'. The po_manual_dispatch_* family was missed in that same pass.",
  evidence: "REPRODUCED LIVE 2026-08-24T10:5xZ against the real file, not a fixture. Ran manual-dispatch-sweep § Step 1 verbatim (byte-identical predicates from scripts/lib/po-manual-dispatch-eligibility.jq): 106 candidates, sorted [rank, idx]. Top candidate = FIX-PO-TRIAGE-SIGNALS-AGENT-FLOW-DEFECT-TYPE-UNROUTED (P0, DRS-STRANDED-OFF-ALLOWLIST, next_agent=agent-father, reflag=false, po_manual_dispatch_flagged_at=null). Ran Step 2's stamp jq verbatim against it and piped to scripts/orch-apply.sh: '[orch-row-prose-ceiling-check] ABORTED - 1 row(s) with net new inline growth past ORCH_ROW_PROSE_CEILING_BYTES=12000' followed by '[orch-apply] ABORTED: row prose ceiling check exit 1 - live file untouched'. Post-probe re-read confirms po_manual_dispatch_flagged_at is still null. That row's prose is 34589B - the prose-ceiling checker itself WARNs about it as grandfathered on every unrelated write - so it can never be stamped, and because flag_reentrant() only excludes rows with a FRESH stamp, an unstampable row stays permanently eligible at rank 1. Step 2's own contract is 'Select ONE top-priority candidate' and Step 1 sorts deterministically, so every future sweep tick re-selects the same unstampable row. Live starvation set: 105 other candidates including a second P0 (FIX-PO-TRIAGE-INBOX-CLEAR-ECHO-PIPE-MANGLES-JSON-UNDER-ZSH-SILENT-NOOP) and a third (FIX-TRIAGESIGNALS-PIPELINEA-UNROUTED-RECURRINGBUG-AND-SPRINTREGISTRY-DANGLING-IDS).",
  ac: [
    "AC-1 REGRESSION FIRST (must FAIL before, PASS after): replay the Step-2 stamp jq verbatim against a fixture row whose prose exceeds 12000B. Pre-fix, orch-apply must exit non-zero with the prose-ceiling ABORT and leave the fixture untouched. Post-fix it must apply.",
    "AC-2 PRIMARY FIX - add po_manual_dispatch_flagged_at, po_manual_dispatch_flagged_by, po_manual_dispatch_class and po_manual_dispatch_note to STRUCTURAL_FIELDS in scripts/orch-row-prose-ceiling-check.mjs, with the same inline rationale comment the secondary_claimed_* family carries. These are coordination metadata written by a picker, not author prose - identical in kind to claimed_at/claimed_by, which are already excluded.",
    "AC-3 SWEEP THE WHOLE FAMILY, opt-IN allowlist (feedback_fleetwide_gate_validated_on_one_file_optout_allowlist). This is the SECOND stamp family found missing from the same set. Enumerate every field any picker/sweeper writes onto an existing row (grep docs/agents/**/flow/*.md and scripts/*.jq for `|= (. + {`) and report the full list with a keep/exclude ruling for each. Do not fix only the four fields named above.",
    "AC-4 SECONDARY, INDEPENDENT OF AC-2 - make the sweep's selection resilient. docs/agents/po/flow/manual-dispatch-sweep.md § Step 2 must not be able to wedge on one row: if the stamp write is rejected, fall through to the next candidate in the Step-1 list and record the skip, rather than ending the tick having stamped nothing. AC-2 alone fixes today's four fields; AC-4 is what stops the third family from wedging the sweep again.",
    "AC-5 State plainly in the RETURN whether any row was actually stamped and dispatched as a result, with the id. The failure mode this row exists to close is a sweep that reports success having actuated nothing."
  ],
  po_not_a_duplicate: "Non-terminal lanes swept for proseceiling|prose_ceiling|manual_dispatch|manual-dispatch before minting. FIX-PROSECEILING-SECONDARY-CLAIM-STAMP-FIELDS-MISSING-FROM-STRUCTURAL-EXCLUDE-SET is the 2026-08-15 precedent for a DIFFERENT field family and is not on an open lane. FIX-PO-MANUAL-DISPATCH-SWEEP-FLAG-WITHOUT-DISPATCH-STRANDS-ROW (2026-07-31) is the closest in subject but its cause is the opposite: a row that WAS stamped and then not dispatched, cured by the flag_reentrant staleness window. This row is a stamp that CANNOT LAND AT ALL, and flag_reentrant is what converts it from a one-tick miss into permanent starvation."
};

def BCTC_FOLD_NOTE:
  "OCCURRENCE 2 (2026-08-24T10:56Z, po triage-20260824T1050Z). Second distinct report in two days: "
+ "signal bctc-imgdeg-1f53ef33-20260824T090414Z, report_id 1f53ef33-8f50-489b-8505-689740692ab0 (VIC Q1-2026), "
+ "refined 09:03-09:05Z today. This is no longer a one-off - re-scope from 'report 69fcd047' to the recurring class. "
+ "USE THIS REPORT AS THE AC-1 REPRO TARGET INSTEAD OF 69fcd047: it is 30 hours fresher and has THREE affected units, "
+ "so it discriminates better. VERIFIED AT SOURCE this tick via get_bctc_refined through the gateway wrapper: "
+ "unit-0004 conf 0.75 flags [continuation_marker_missing:page7, image_unavailable:pages6-8]; "
+ "unit-0005 conf 0.65 flags [image_unavailable, garbled_ocr_layout]; "
+ "unit-0006 conf 0.70 flags [image_unavailable, ocr_row_alignment_uncertain]. "
+ "CORRECTION TO THIS ROW'S OWN PREMISE, carried over from the 08-23 mint: the title and root_cause both say the units are "
+ "'capped at <=0.6 confidence'. That is FALSE on today's report and is a template string, not a measurement - the true range "
+ "is 0.65-0.75 and no image_unavailable unit observed on either report is at or below 0.6. Whoever picks this row must not "
+ "search for <=0.6 rows to find the affected units; filter on the image_unavailable flag instead. The emitter-side half of "
+ "this (false summary, rising-edge count frozen at 2, no dedup_key, and the unenforced cap itself) is now split out to "
+ "FIX-BCTC-IMGDEG-SIGNAL-SUMMARY-CONTRADICTS-ITS-OWN-LIVE-CONFIDENCES - deliberately a separate row, since this one owns the "
+ "fetch-plane question (WHY the image is unavailable) and that one owns the reporting question.";

def CCATO_EXPEDITE_20260824T1056Z:
  "P1->P0 2026-08-24T07:37Z. RE-MEASURED 10:56Z: 78 rows, 13 batches, EMITTER STILL LIVE. Batch 13 (6 rows: -62a037 "
+ "-d6f9e8 -94f891 -d47330 -1adb71 -1704ab) landed between commits 22429c27e (08:53:31Z, ntg=72) and c637f9e69 (08:59:31Z, "
+ "ntg=78) - 8h45m AFTER this row was minted and 7h20m after the expedite; a set-diff of those two commits returns exactly "
+ "those 6 ids. Git-traced counts: 0(08-23T22:32Z) 18 36 42 48 54 66 72 78(08-24T08:59Z). All 78 still carry ts "
+ "2026-08-24T00:00:00Z to the second across 10h27m of wall clock, so AC-7's not-a-clock-read proof is 13 batches strong, "
+ "not 3. Grouping on payload.returned_value still gives the SAME 4 findings ('not found in database', 60, 61, 62.1): "
+ "4 findings, 78 rows, 19.5x amplification, zero dedup_key on any of them. 13 inverted rows now RETRACTED (7 at 00:2x, "
+ "5 at 07:37Z, 1 at 10:56Z). AC-8's figure is stale a second time: 65 rows to collapse, not 60 or 35. No ntg-* row is "
+ "age-evictable before 2026-08-25T00:00Z.";

def DRAIN_FOLD_NOTE:
  "CORROBORATION 2026-08-24T10:56Z (po, Pipeline-A repair_task_request envelope ad6fafbc, check_id "
+ "DRAIN-SHAPE-BLIND-TO-HANDAUTHORED-FINDINGS, from dev-team router tick 04:07Z). Folded here, not minted - same predicate "
+ "(isDrainableShape() at scripts/agents-flow/drain-signals.js:84), same file. It adds a SPLIT this row does not have: of 26 "
+ "stragglers, 14 are hand-authored findings that SHOULD drain (rich self-invented schema: event/evidence/hypothesis/"
+ "impact_severity/recommendation, or detected_at/detected_by/finding_N) and 12 are dispatcher tick telemetry that is "
+ "CORRECTLY litter. 0 of the 14 are in signals.db; --count-drainable reports 2, so the MANDATORY PERSIST GUARD reads the "
+ "inbox as near-empty. Oldest 27 days. CONSTRAINT FOR THE IMPLEMENTER: do NOT widen the predicate to accept any object - "
+ "that sweeps the 12 telemetry files in too. Recognise the finding schema (event|finding|finding_1|detected_by) or make "
+ "producers stamp from/type. price_anomaly_* is a separate DELIBERATE by-path family (BY_PATH_CONSUMER_FAMILIES), not part "
+ "of this. Named stranded findings include a refine_bctc_md diacritic corruption above the 0.50 ESC-5 threshold with empty "
+ "flags[] (2 reports, 07-29).";

def PIPELINEA_UNROUTED_ADDENDUM:
  "\n\n[po/triage-20260824T1056Z] THE UNROUTED PIPELINE-A SET HAS GROWN 2 -> 9 IN 17 HOURS, AND MOST OF THE GROWTH IS A "
+ "DIFFERENT SUB-CLASS THAN THE TWO TYPES THIS ROW WAS MINTED FOR. Re-derived by hand-replaying the guard's two read-only "
+ "extractors (pipeline_a_section + extract_type_column) WITHOUT executing the script, exactly as the 18:07Z measurement did: "
+ "ROUTED_A=28 unchanged, live inbox types=14, unrouted_A = [agent-output-contract-violation, auditor_cycle_missing, "
+ "auditor_probe_anomaly, cron_fire_gap, db_integrity_breach, narrative_contradiction, recurring-bug, "
+ "sprint_registry_dangling_ids, system_issue]. TWO SUB-CLASSES, DO NOT FIX THEM THE SAME WAY. (a) NO RULE ANYWHERE (4): "
+ "recurring-bug and sprint_registry_dangling_ids (this row's original pair, still unrouted) plus "
+ "agent-output-contract-violation and auditor_probe_anomaly. (b) RULE EXISTS BUT ON THE OTHER PIPELINE (5): "
+ "narrative_contradiction, cron_fire_gap, db_integrity_breach and auditor_cycle_missing all have full Pipeline-B rows, and "
+ "system_issue is the underscore twin of the routed hyphen system-issue. Sub-class (b) is a direct consequence of the "
+ "deliberate per-pipeline scoping added 2026-08-22 (guard fix #2, 'a type routed on B does not count as routed on A') - "
+ "correct as a detector, but it means every cross-pipeline type needs an explicit bridge row. The doc already carries TWO "
+ "such bridges by hand (Pipeline-A system-issue, Pipeline-B audit-handoff), which is the pattern to follow or to replace. "
+ "SCOPE GUIDANCE, unchanged in kind: adding 9 hand-written bridge rows is a tactical unblock; the structural answer stays "
+ "with FIX-SIGNALTYPE-OPEN-NAMESPACE-VS-CLOSED-ALLOWLIST-5TH-INSTANCE (architect, plan_only) and "
+ "TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY (review, P0). HOLD-BACK REPEATED AND WIDENED THIS TICK: PO cleared 55 of 82 inbox "
+ "envelopes and deliberately HELD BACK all 27 whose type is in the unrouted set above (narrative_contradiction 10, "
+ "cron_fire_gap 6, system_issue 3, recurring-bug 2, db_integrity_breach 2, sprint_registry_dangling_ids 1, "
+ "auditor_probe_anomaly 1, auditor_cycle_missing 1, agent-output-contract-violation 1), so CI stays honestly red until the "
+ "rows land. Clearing them would turn the guard green with the routing table untouched.";

.task_board.backlog += [ MINT_BCTC_EMITTER, MINT_SIZELINT, MINT_SWEEP_STAMP_DEFECT ]

| .task_board.backlog |= map(
    if .id == "FIX-BCTC-PAGE-IMAGE-FETCH-DEGRADED-CONFIDENCE-CAP" then
      . + { occurrence_count: 2,
            po_occurrence_20260824T1056Z: BCTC_FOLD_NOTE,
            updated_at: $now,
            updated_by: "po" }
    elif .id == "FIX-CCATO-NTG-ROWS-NOT-PRODUCED-BY-EITHER-SANCTIONED-ENGINE-FORGED-WRITER-ID" then
      ( del(.po_expedite_20260824T0737Z)
        + { po_expedite_20260824T1056Z: CCATO_EXPEDITE_20260824T1056Z,
            updated_at: $now,
            updated_by: "po" } )
    elif .id == "FIX-TRIAGESIGNALS-PIPELINEA-UNROUTED-RECURRINGBUG-AND-SPRINTREGISTRY-DANGLING-IDS" then
      . + { status_note: (.status_note + PIPELINEA_UNROUTED_ADDENDUM),
            updated_at: $now,
            updated_by: "po" }
    elif .id == "FIX-PO-TRIAGE-INBOX-CLEAR-ECHO-PIPE-MANGLES-JSON-UNDER-ZSH-SILENT-NOOP" then
      . + { po_manual_dispatch_flagged_at: $now,
            po_manual_dispatch_flagged_by: "po (manual-dispatch-sweep)",
            po_manual_dispatch_class: "DRS-STRANDED-OFF-ALLOWLIST",
            po_manual_dispatch_note: "po (manual-dispatch-sweep) surfaced DRS-STRANDED-OFF-ALLOWLIST candidate — folding into this tick's BATCH. NOT the rank-1 candidate: rank-1 (FIX-PO-TRIAGE-SIGNALS-AGENT-FLOW-DEFECT-TYPE-UNROUTED) is prose-frozen at 34589B and its Step-2 stamp hard-aborts at the prose-ceiling gate — reproduced live this tick and minted as FIX-PO-MANUAL-DISPATCH-SWEEP-STAMP-REJECTED-BY-PROSE-CEILING-ON-ITS-OWN-TOP-CANDIDATE. Selected rank-2 instead, and the skip is recorded here rather than left silent.",
            updated_at: $now,
            updated_by: "po" }
    else . end
  )

| .task_board.ready |= map(
    if .id == "FIX-SIGNAL-INBOX-NON-DRAINABLE-ENVELOPE-50-OF-51-FILES-SILENTLY-CLASSED-LITTER" then
      . + { po_corroboration_20260824T1056Z: DRAIN_FOLD_NOTE,
            updated_at: $now,
            updated_by: "po" }
    else . end
  )
