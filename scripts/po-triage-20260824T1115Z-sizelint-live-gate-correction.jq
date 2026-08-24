# po-triage-20260824T1115Z-sizelint-live-gate-correction.jq
#
# OWNING FLOW: docs/agents/po/flow/main.md § Step PUSH-BACKSTOP (the push that produced this measurement)
#            + docs/agents/po/flow/triage-signals.md § Pipeline-A `system-issue` "verify the premise" rule
# Invoked as: jq -f scripts/po-triage-20260824T1115Z-sizelint-live-gate-correction.jq \
#               --arg now "<ISO8601Z>" docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# A real `git push origin main` at 2026-08-24T11:1xZ made the pre-push size-lint gate name its own
# offenders. The live pair is NOT the pair every board row and handoff has been naming for three days.
# This corrects the row minted 15 minutes earlier in this same tick and files the true second offender.

def OCR_GATEWAY_MINT:
{
  id: "FIX-SIZELINT-OCRGATEWAY-594L-IS-THE-REAL-SECOND-FLEET-PUSH-BLOCKER",
  type: "FIX",
  title: "apps/pdf-extractor/infrastructure/ocr_gateway.py is 594L against upper=579L in HEAD and worktree and is one of exactly TWO files the live pre-push size-lint gate names — it had no board row, while the P0 everyone has been citing as the blocker (pushBctcLayoutHandler.ts) was fixed to 85L and is no longer an offender at all",
  status: "BACKLOG",
  zone: "apps/pdf-extractor/",
  priority: "P0",
  size: "S",
  owner: "po",
  next_agent: "dev-pdf-extractor",
  depends: [],
  supervised: false,
  plan_only: false,
  baseline_pass: true,
  created_at: $now,
  created_by: "po (triage-20260824T1050Z — measured by an actual `git push origin main`, not by inspection)",
  updated_at: $now,
  updated_by: "po",
  dedup_key: "sizelint_offender:apps/pdf-extractor/infrastructure/ocr_gateway.py",
  files: ["apps/pdf-extractor/infrastructure/ocr_gateway.py"],
  root_cause: "The file grew past its size-lint baseline tolerance and the growth is committed. baseline=527L, actual=594L, upper=579L — 15 lines over the tolerated ceiling. Unlike the working-tree phantoms tracked at FIX-SIZELINT-PREPUSH-SCANS-WORKING-TREE-NOT-PUSH-RANGE, HEAD and the worktree agree exactly (594/594), so this is inside the push range and no scanning-mechanism defect explains it away.",
  evidence: "THE GATE NAMED ITSELF. PO ran a real `git push origin main` at 2026-08-24T11:1xZ (Step PUSH-BACKSTOP) and the pre-push hook printed, verbatim: '[size-lint] FAIL - 2 offending file(s) (scanned 1422): apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts - baseline-tolerance-exceeded (baseline=906L actual=1012L upper=996L); apps/pdf-extractor/infrastructure/ocr_gateway.py - baseline-tolerance-exceeded (baseline=527L actual=594L upper=579L)' followed by '[pre-push] BLOCKED'. That output is the SSOT for what is blocking the fleet, and it is worth more than any file-by-file inspection: it enumerates the complete offender set in one shot. THREE THINGS IT SETTLES. (1) ocr_gateway.py is a real, committed, previously-unrowed offender - `git show HEAD:... | wc -l` = 594 and `wc -l <` = 594. (2) pushBctcLayoutHandler.ts IS NOT AN OFFENDER ANY MORE: it measures 85L in HEAD and worktree, down from the 252L its P0 row is named after, so that fix has already landed and the row (in_progress, dev-mcp-server) is describing a solved condition. (3) The pair blocking the push is therefore {tasksMdJanitorJob.ts, ocr_gateway.py}, NOT the {tasksMdJanitorJob.ts, pushBctcLayoutHandler.ts} pair asserted by the cowork-team system-issue envelope, by the TNB handoff ACK of 01:37Z, and by PO's own row minted 15 minutes before this measurement. `git rev-list --count origin/main..HEAD` = 213 after this tick's own commit; behind = 0. NOTE the near-miss in the record: a cowork tick at 04:45Z emitted SIZELINT-THIRD-OFFENDER-IS-WORKING-TREE-ONLY-PUSH-RANGE-FILE-IS-CLEAN naming this very file as clean in the push range, and RETRACTED it at 05:00Z as FALSE. The retraction was correct and this is its confirmation at the gate.",
  ac: [
    "AC-1 Bring ocr_gateway.py to <=579L by EXTRACTION, not by deleting behaviour. Name which functions moved and where. Coordinate with FIX-OCRGATEWAY-INFLIGHT-BOOKKEEPING-DIVERGES-OS-TRUTH (review, BLOCKED, P0) which edits the SAME file for a different reason - a size split landing under it will conflict.",
    "AC-2 VERIFY BY RUNNING THE ACTUAL GATE, not tsc and not a line count. `git push origin main` must get past [size-lint]. feedback_red_prepush_strands_fleet: the hook has two gates and tsc-green is not hook-green.",
    "AC-3 DISPATCH AS A PAIR OR IT ACHIEVES NOTHING. The sibling FIX-SIZELINT-TASKSMDJANITORJOB-1012L-SECOND-CONCURRENT-OFFENDER-BLOCKS-FLEET-PUSH (P0, dev-mcp-server, apps/mcp-server/) must land in the same window. The two offenders are CONCURRENT and in DIFFERENT zones with DIFFERENT owners, so neither implementer can clear the gate alone. Report `git rev-list --count origin/main..HEAD` before and after; it must reach 0.",
    "AC-4 CLOSE THE STALE CITATION IN THE SAME PASS. FIX-SIZELINT-PUSHBCTCLAYOUTHANDLER-252L-BLOCKS-ENTIRE-FLEET-PUSH (in_progress, P0, dev-mcp-server) names a file now at 85L. Confirm at source and move it out of in_progress rather than leaving a solved P0 absorbing the fleet's attention - three days of handoffs have named it as THE blocker.",
    "AC-5 ROOT-CAUSE THE PATTERN, do not just fix file #4. This is the third consecutive serial offender: pushBctcLayoutHandler.ts was fixed and the gate immediately surfaced two more. Report whether the baseline-tolerance mechanism is generating a permanent treadmill (every file drifting past its own frozen baseline) and, if so, file that as its own row - the fleet cannot afford a one-file-per-day unblock cadence at 213 unpushed commits."
  ],
  po_not_a_duplicate: "Non-terminal lanes swept for the literal 'ocr_gateway' before minting: FIX-PDFX-GENERIC-MD-TABLE-OCR-UNROUTED-GATEWAY (backlog, P3) is about pytesseract call-site routing and FIX-OCRGATEWAY-INFLIGHT-BOOKKEEPING-DIVERGES-OS-TRUTH (review, BLOCKED, P0) is about inflight bookkeeping - neither is about the file's size and neither would have been found by a size-lint sweep. No row anywhere names this file as a size-lint offender."
};

def TASKSMD_CORRECTION:
  "CORRECTION 2026-08-24T11:1xZ, BY THE GATE ITSELF, 15 MINUTES AFTER THIS ROW WAS MINTED. This row's own "
+ "po_not_a_duplicate and AC-2 assert that the OTHER blocking file is pushBctcLayoutHandler.ts. THAT IS WRONG, and it "
+ "was wrong at mint time - PO inherited it from the cowork-team system-issue envelope and from the 01:37Z TNB ACK "
+ "without re-measuring that half. A real `git push origin main` this tick made the pre-push hook enumerate its own "
+ "offender set: '[size-lint] FAIL - 2 offending file(s) (scanned 1422): tasksMdJanitorJob.ts (baseline=906 actual=1012 "
+ "upper=996); apps/pdf-extractor/infrastructure/ocr_gateway.py (baseline=527 actual=594 upper=579)'. "
+ "THIS ROW'S OWN FILE IS CONFIRMED by the gate, unchanged. What changes is the PAIR: pushBctcLayoutHandler.ts now "
+ "measures 85L in HEAD and worktree (down from the 252L its P0 is named after), so it is NOT an offender and its P0 "
+ "row is describing a solved condition. The live blocking pair is {tasksMdJanitorJob.ts, ocr_gateway.py}, filed as the "
+ "new sibling FIX-SIZELINT-OCRGATEWAY-594L-IS-THE-REAL-SECOND-FLEET-PUSH-BLOCKER (P0, dev-pdf-extractor, "
+ "apps/pdf-extractor/). AC-2 of this row still stands verbatim - scope BOTH files - but 'both' means this one and the "
+ "ocr_gateway row, in DIFFERENT ZONES with DIFFERENT OWNERS, so a single dev-mcp-server hop cannot clear the gate. "
+ "METHOD NOTE WORTH KEEPING: PO nearly skipped the push as pointless because the gate was 'known red'. Running it "
+ "anyway is what produced the complete offender set in one line and caught a three-day-old misattribution that four "
+ "separate artifacts were repeating. When a gate can enumerate its own failures, run the gate.";

.task_board.backlog += [ OCR_GATEWAY_MINT ]

| .task_board.backlog |= map(
    if .id == "FIX-SIZELINT-TASKSMDJANITORJOB-1012L-SECOND-CONCURRENT-OFFENDER-BLOCKS-FLEET-PUSH" then
      . + { po_correction_20260824T1115Z: TASKSMD_CORRECTION,
            updated_at: $now,
            updated_by: "po" }
    else . end
  )

| .task_board.in_progress |= map(
    if .id == "FIX-SIZELINT-PUSHBCTCLAYOUTHANDLER-252L-BLOCKS-ENTIRE-FLEET-PUSH" then
      . + { po_measurement_20260824T1115Z: ("THE OFFENDER THIS ROW IS NAMED AFTER IS GONE - MEASURED, NOT INFERRED. `git show HEAD:apps/mcp-server/src/interface/mcp/routes/pushBctcLayoutHandler.ts | wc -l` = 85 and `wc -l <` the worktree copy = 85, against the 252L in this row's own title and the upper=250 it breached. A real `git push origin main` at 2026-08-24T11:1xZ made the pre-push hook enumerate its complete offender set - '[size-lint] FAIL - 2 offending file(s) (scanned 1422)' - and THIS FILE IS NOT IN IT. The two that are: tasksMdJanitorJob.ts (1012/996) and apps/pdf-extractor/infrastructure/ocr_gateway.py (594/579), both now rowed at P0. PO is NOT closing this row - the lane is in_progress and owned by dev-mcp-server, so the close-out and any QA evidence belong to that owner, and PO does not know whether the 252->85 reduction is this row's own shipped work or a side effect of another change. WHAT PO IS ASSERTING: this row must stop being cited as the reason the fleet push is blocked. It has been named as THE blocker by the 01:37Z TNB ACK, by a cowork-team system-issue envelope, by two PO notebook carry-overs and by a row PO itself minted 15 minutes before this measurement. Dispatching it today would fix nothing that is currently red. `git rev-list --count origin/main..HEAD` = 213, behind = 0."),
            updated_at: $now,
            updated_by: "po" }
    else . end
  )
