# po-triage-20260826T0821Z — PO Step 0-SIG triage of the 9-envelope durable inbox
# + Pipeline-B .signal_queue row sys-20260826T080003-2786.
#
# Owning flow doc: docs/agents/po/flow/triage-signals.md
# Apply ONLY via:  jq -f <this> docs/data/orch/orch-state.json \
#                    | ORCH_APPLY_DECLARED_INBOX_TRIAGED="<9 csv ids>" bash scripts/orch-apply.sh
#
# 6 FOLDS · 3 MINTS · 2 BACKLOG->READY PROMOTIONS · 1 signal triaged · inbox CLEAR (9 envelope_ids)

def NOW: "2026-08-26T08:28:20Z";
def BY:  "po (triage-20260826T0821Z)";

# ── consumed envelope ids (the 9 read at the top of Step 0-SIG) ────────────────
def CONSUMED: [
  "31000d163852f94da40ccf409affef4ba1c49ed771a9d734f8b409098809c58c",
  "16c8571f771e9ccd76fcadec9d59aeef4d41367d597442fd0cbb303810009336",
  "a137cc211b85a96ff4a6521244ab7e81a0d3228dcc6a56db6a24f8ea115224af",
  "a6bdd3bfa34e8fdcc12ff85e0e385de9f380dddc3e0241e4c2f8502fca55fdad",
  "d126a50afe536008a3edbcdce9d9da96d890082dd9532b9187166d32995c9ed3",
  "e1a31b5db3fff7b6cb53401befa5b7b2f397baf67257ff546ed5e8e0b645bf2f",
  "4cbba1c9dc41aa13e3c8674a2b89dee45b854482f842212275a9ad298b00126f",
  "1962946095a42a4cfd4c52d25e37e4081ccb9781d29745769c39d1ded38ccb91",
  "6ec1cc4d0b8e32cec953ab1a78bb8614eb3aa45cd507d262665a1b733798ea8b"
];

# ── helper: apply f to the row with the given id inside a lane ────────────────
def touch($lane; $id; f):
  .task_board[$lane] |= map(if (.id // "") == $id then (f | .updated_at = NOW | .updated_by = BY) else . end);

# ═══════════════════════════════════════════════════════════════════════════════
# FOLD 1 — envelope [0] tooling_defect 07:19:50Z  ->  ready[] FIX-NOTBEFORE-...
#   Duplicate: this row was minted at 07:29:40Z FROM THIS EXACT SIGNAL FILE.
# ═══════════════════════════════════════════════════════════════════════════════
touch("ready"; "FIX-NOTBEFORE-DEFERRAL-GATE-ENFORCED-BY-ONE-OF-FOUR-DISPATCH-PICKERS";
  .po_fold_20260826T0821Z =
    ("DUPLICATE ENVELOPE FOLDED, NO RE-MINT. Inbox envelope 31000d163852 (dev-team->po, tooling_defect, HIGH, "
   + "createdAt 2026-08-26T07:19:50Z) is the SAME emission this row was already minted from at 07:29:40Z — its "
   + "source_signal field names the identical file. No new evidence; call counts unchanged. "
   + "DOUBLE-COVERAGE WARNING (act on this before scoping): backlog[] "
   + "FIX-DEVTEAM-BLOCKED-STATUS-FREEZES-ROWS-NO-CONSUMER-ALLOWLIST-ADMITS-IT (promoted to ready[]/P0 this tick) "
   + "carries AC-2 = 'make is_gated_not_before binding in all six backlog/ready consumers', which is THIS ROW'S "
   + "WORK stated a second time on a different row. Whoever picks either row FIRST must claim both or explicitly "
   + "descope the other's clause — do not implement it twice. This row is the narrower/claim-plane statement "
   + "(4 pickers); that row's AC-2 is the wider one (6 consumers) and also covers the BLOCKED release actuator.")
)

# ═══════════════════════════════════════════════════════════════════════════════
# FOLD 2 + PROMOTE — envelope [2] tooling_defect 07:42:56Z -> qa[]-has-no-picker
# ═══════════════════════════════════════════════════════════════════════════════
| touch("backlog"; "FIX-DEVTEAM-QA-LANE-STALE-AGE-WATCHDOG-BLIND";
    .status = "READY"
  | .po_fold_20260826T0821Z =
      ("FOLD (no re-mint) of inbox envelope a137cc211b85 (dev-team->po, tooling_defect, HIGH, 07:42:56Z) + "
     + "BACKLOG->READY PROMOTION. Its `depends` FIX-QA-VC-LANEMOVE-PROSE-ONLY-NO-ORCHAPPLY-ACTUATOR reached "
     + "done_verified[27], so the stated 'land that first' precondition is SATISFIED and this backstop is now "
     + "the live gap. NEW EVIDENCE beyond the 2026-08-25T21:47Z status_note: THREE qa[] arrivals in 36 minutes "
     + "on 2026-08-26 — (a) 07:32Z FIX-PDFX-PEK-EXTRACT-202-... moved ready[]->qa[] directly by dev-pdf-extractor "
     + "on return, no claimed_by stamp, no qa ever dispatched; (b) the router hand-dispatched qa for it AND for "
     + "FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED at 07:42:56Z under task: locks — an out-of-band "
     + "rescue, not a fix; (c) 08:18:27Z the drain moved FIX-RCVERIF-GRANDFATHER-EXEMPTION-IGNORES-RETRACTION-"
     + "VOID-MARKERS into qa[], which strands identically if that qa session does not complete its own lane-move. "
     + "The 08-14 P0 has now been stranded 12 days. "
     + "TWO CORRECTIONS TO CARRY INTO SCOPING — do NOT re-derive from the older note: "
     + "(1) CAP IS NOT THE BUG. QA_CAP=10 (dev-team main.md :953 and :1279); the 'qa[] < 1' comment at "
     + "scripts/devteam-review-claim-qa-drain.jq:123 is STALE since the 08-23 retune. With qa[]=2 the drain had "
     + "headroom 8, so the review lane was NOT dammed. Do not re-file or re-scope this as cap saturation. "
     + "(2) VERIFICATION METHOD. `grep -l 'task_board.qa'` scores this GREEN today because it matches the drain's "
     + "own MUTATION TARGET (:215) and devteam-qadrain-skip-revert.jq's revert path. Assert on a per-file count of "
     + "SELECTORS that READ qa[] as a dispatch source — currently zero — never on the string's presence. "
     + "Dispatch coupling to nail in the fix: the caller derives $picked_batch by re-reading qa[] for rows carrying "
     + "THIS invocation's claimed_at/claimed_by (main.md :966-968, :1291-1293), so dispatch can only ever fire for "
     + "rows the drain itself just moved. AC-5's null-claimed_at requirement is load-bearing for path (a) above.")
)
| ( [ .task_board.backlog[] | select((.id // "") == "FIX-DEVTEAM-QA-LANE-STALE-AGE-WATCHDOG-BLIND") ] ) as $qawatch
| .task_board.backlog |= map(select((.id // "") != "FIX-DEVTEAM-QA-LANE-STALE-AGE-WATCHDOG-BLIND"))
| .task_board.ready += $qawatch

# ═══════════════════════════════════════════════════════════════════════════════
# FOLD 3 + PROMOTE — envelope [3] tooling_defect 07:48:09Z -> BLOCKED-freeze row
# ═══════════════════════════════════════════════════════════════════════════════
| touch("backlog"; "FIX-DEVTEAM-BLOCKED-STATUS-FREEZES-ROWS-NO-CONSUMER-ALLOWLIST-ADMITS-IT";
    .status = "READY"
  | .priority = "P0"
  | .po_fold_20260826T0821Z =
      ("FOLD (no re-mint) of inbox envelope a6bdd3bfa34e (dev-team->po, tooling_defect, HIGH, 07:48:09Z) + "
     + "BACKLOG->READY PROMOTION + P1->P0. This row already owns the defect: AC-1 is the missing release actuator, "
     + "AC-2 the not-before half, AC-3 the blocked_by==null incoherence check. The envelope adds no new mechanism — "
     + "it adds SCOPE and URGENCY: "
     + "(1) A SECOND GATE COHORT EXISTS. AC-6 + router_note_ac6_undercount enumerate FOUR rows at "
     + "next_recheck_not_before=2026-08-26T09:00:00Z. A separate batch of FOUR was frozen at 06:51:41Z with "
     + "next_recheck_not_before=2026-08-26T17:11:00Z: MEASURE-PDFX-BCTC-QUALITY-TESSERACT-VIE-PRODUCTION-BASELINE, "
     + "DECIDE-PDFX-OCRWORKER-PAGE-RESCUE-LIVE-UNMEASURED-QUALITY-PATH, "
     + "FIX-PDFOCR-ORIENTATION-CORPUS-79-FILES-312-PAGES-SWEEP-REVERTED-BY-DB-RESTORE, "
     + "FIX-BCTC-CTG-BALANCE-SHEET-REFINE. AC-6's instruction to SELECT BY next_recheck_not_before rather than by "
     + "id was already correct and is now proven necessary — there are at least 8 rows, in 2 cohorts, not 4. "
     + "(2) WHY P0. The first two of that cohort are the entire dependency chain of the user's STANDING GOAL "
     + "(replace tesseract with Vietnamese PaddleOCR for BCTC quality). They are frozen behind a clock with no "
     + "reader, and the stall is SILENT — the rows read as deliberately managed, not stuck. The only actuator "
     + "today is an in-memory session cron (00545d31, armed for 17:13Z) that dies with the CLI session. "
     + "(3) LIVE AC-3 INSTANCE, already costing a fix: UC-CDC-P1 (backlog[], pm) is status=BLOCKED with "
     + "blocked_by=null AND depends_on=null — vacuously deps-satisfied, no completion event can ever exist. It "
     + "owns calendar_status server-side computation, and the cowork dispatcher has now reported "
     + "calendar_status=open for the 52nd+ consecutive tick. A frozen row is silently owning a 52x-recurring defect. "
     + "(4) BOARD-WIDE POPULATION IS NOT 38 DEFECTS — do not bulk-unfreeze. 49 rows now carry status=BLOCKED and "
     + "only 11 carry any blocked_by, but only the 4-row 06:51:41Z batch was individually inspected; the rest may "
     + "encode a real gate in prose exactly as those four do (their gate_note says so verbatim). AC-3's "
     + "'emit a signal row per instance rather than auto-clearing' is the correct disposition and AC-4/AC-5's "
     + "negative controls stay mandatory. PO's freeze itself was DELIBERATE and CORRECT; only the release path is missing.")
)
| ( [ .task_board.backlog[] | select((.id // "") == "FIX-DEVTEAM-BLOCKED-STATUS-FREEZES-ROWS-NO-CONSUMER-ALLOWLIST-ADMITS-IT") ] ) as $blockedrow
| .task_board.backlog |= map(select((.id // "") != "FIX-DEVTEAM-BLOCKED-STATUS-FREEZES-ROWS-NO-CONSUMER-ALLOWLIST-ADMITS-IT"))
| .task_board.ready += $blockedrow

# ═══════════════════════════════════════════════════════════════════════════════
# FOLD 4 — envelope [6] bug-escalation (STRING payload, [notebook-immutability-guard])
#   FIRST REPRODUCIBLE OCCURRENCE in this class's history.
# ═══════════════════════════════════════════════════════════════════════════════
| touch("review"; "FIX-NOTEBOOK-COMPOSE-REWRITES-RETAINED-PRIOR-SECTIONS";
  .po_fold_20260826T0821Z =
    ("FOLD of inbox envelope 4cbba1c9dc41 (commit-sweep-guard->po, bug-escalation, high, 08:09:32Z) — "
   + "[notebook-immutability-guard] WARN on docs/agent-memory/notebooks/alert-commander.md, retained section "
   + "'## c284 . 2026-08-26T07:53:49Z (slot=alert-commander-market, tick=07:51)'. "
   + "THIS IS THE FIRST OCCURRENCE OF THIS CLASS THAT IS REPRODUCIBLE AFTER THE FACT. Every prior triage of a "
   + "[notebook-immutability-guard] fire was recorded INCONCLUSIVE because the guard compares INDEX vs HEAD and "
   + "the index state is unreconstructable once the agent has committed (see triage-20260805T0837Z-po.md, "
   + "triage-20260812T1700Z-po.md). Here the mutation survived INTO a commit, so it is visible as a plain "
   + "HEAD-to-HEAD diff and needs no index reconstruction: "
   + "`git show ad48ac043 -- docs/agent-memory/notebooks/alert-commander.md` (the c285 write) deletes the phrase "
   + "' and newsSentiment not <-0.5' from the Position-danger bullet of the ALREADY-COMMITTED c284 section "
   + "(committed one cycle earlier as a22866d88). The same diff also drops the whole c282 section, which IS "
   + "authorized under AC-2a — the violation is exclusively the in-place edit of retained c284. "
   + "MECHANISM SIGNAL FOR THE FIX: post-edit, c284's Position-danger line is byte-identical to c285's, i.e. the "
   + "compose step appears to have REGENERATED the retained section from the current cycle's template rather than "
   + "carrying its bytes forward — that is a stronger and more testable hypothesis than 'trimmed to pay for cap "
   + "pressure', and it predicts silent convergence of retained sections toward the newest one. A regression test "
   + "can now pin a real fixture (a22866d88 -> ad48ac043) instead of a synthetic one. "
   + "Threshold note: triage-signals.md's do-not-mint-per-occurrence rule stands (base rate of interleaved-cycle "
   + "false positives is high) — this is a fold, not a mint, but it is a CONFIRMED true positive, not a volume tick.")
)

# ═══════════════════════════════════════════════════════════════════════════════
# FOLD 5 — envelopes [4][5][7][8] cowork-fire: all to=dev-team, not to=po
# ═══════════════════════════════════════════════════════════════════════════════
| touch("backlog"; "FIX-DEVTEAM-DRAIN-ROUTES-NON-PO-ENVELOPES-TO-PO-STEP0SIG";
  .po_occurrence_20260826T0821Z =
    ("RE-MEASURED LIVE, 2026-08-26T08:21Z inbox: 4 of 9 envelopes (44%) carry to='dev-team', not 'po' — all four "
   + "are cowork-team cowork-fire telemetry (07:22:29Z, 07:36:40Z, 07:52:00Z, 08:06:33Z). Consistent with this "
   + "row's original 12/29 = 41% measurement, so the rate is stable, not a one-off. All four dispositioned by PO "
   + "as routine per triage-signals.md's cowork-fire rule (errors[] empty, silent=false, classification=FIRE on "
   + "every one) — pendingObservations only, no mint.")
)

# ═══════════════════════════════════════════════════════════════════════════════
# FOLD 6 — Pipeline-B signal sys-20260826T080003-2786 (auditor_cycle_missing tier2)
# ═══════════════════════════════════════════════════════════════════════════════
| touch("backlog"; "FIX-AUDITOR-DCYCLE2-COMPLETION-EVIDENCE-PREDICATE-CANNOT-SEE-COMPLETED-CYCLES";
  .po_occurrence_20260826T0821Z =
    ("FOLD of .signal_queue row sys-20260826T080003-2786 (system-auditor->po, auditor_cycle_missing, WARN, "
   + "08:00:03Z, dedup_key auditor-cycle-missing:tier2:2026-08-26T08:00Z): 'auditor tier-2 cycle possibly missing "
   + "- no completion evidence in 9h (cadence 4h)'. New WINDOW, same tier-2 arm this row already indicts, so "
   + "consolidated here rather than minted per-window. "
   + "AMBIGUITY THE FIX MUST RESOLVE — do not assume this fire is a pure false positive: the corroborating markers "
   + "are ALSO stale. docs/data/auditor-tier2-last-healthy.json = 2026-08-25T22:47:57Z (9.6h, 2.4x cadence) and "
   + "auditor-tier3-last-healthy.json = 2026-08-25T02:41:51Z (29.7h), while tier-1 is demonstrably alive "
   + "(auditor-tier1-last-trigger.json, fire_tick 2026-08-26T08:00Z, ALL_GREEN 6/6). But a *-last-healthy file is "
   + "only written on a HEALTHY outcome, so its age cannot discriminate 'tier-2 never ran' from 'tier-2 ran and "
   + "was not healthy' — that is the same probe-coarser-than-the-phenomenon trap this row exists to fix, one level "
   + "up. Whoever implements the tier-2/3 notebook fallback must ALSO give the tiers a ran-at marker distinct from "
   + "healthy-at, or the new fallback inherits the identical blind spot. "
   + "NOT re-run: the tier-1 probe MUTATES the spawn_decision it reports, so no confirmation pass was attempted.")
)

# ═══════════════════════════════════════════════════════════════════════════════
# MINT 1 — envelope [1] task_proposal P3 (dev-pdf-extractor -> dev-mcp-server)
# ═══════════════════════════════════════════════════════════════════════════════
| .task_board.backlog += [{
    id: "FIX-MCPSERVER-BCTCRECONCILE-20WIDE-REFIRE-NO-PACING-NO-MARKETHOURS-GATE",
    type: "FIX",
    size: "S",
    status: "BACKLOG",
    priority: "P3",
    zone: "apps/mcp-server/",
    owner: "dev-mcp-server",
    next_agent: "dev-mcp-server",
    dispatch_lane: "dev-mcp-server",
    baseline_pass: true,
    supervised: false,
    plan_only: false,
    created_at: NOW,
    created_by: BY,
    updated_at: NOW,
    updated_by: BY,
    dedup_key: "mcpserver-bctcreconcile:20wide-refire-no-pacing-no-client-side-market-hours-gate",
    files: [
      "apps/mcp-server/src/scheduler/financial-reports/bctcExtractReconcileJob.ts",
      "apps/mcp-server/src/__tests__/bctc-extract-reconcile-job.test.ts"
    ],
    title: ("bctcExtractReconcileJob re-fires its whole still-pek_triggered batch (DEFAULT_BATCH_SIZE=20) every "
          + "30min with no inter-request pacing and no client-side market-hours gate, so up to 19 requests queue "
          + "behind pdf-extractor's deliberate single extraction slot"),
    origin_signal: "dev_team_idle_chain envelope 16c8571f771e (dev-pdf-extractor->po, task_proposal, P3, 2026-08-26T07:27:21Z)",
    po_scope_note:
      ("WHY THE CALLER AND NOT THE SERVER — settled upstream, do not re-open: pdf-extractor's "
     + "threading.Semaphore(1) in PekEngineAdapter was chosen deliberately (REQ-PEK-9d/AC-PEK-4d, "
     + "docs/architecture-briefs/2026-05-26-pek-integrate-design.md) to stop two concurrent model instances "
     + "doubling RAM against that container's --memory 2.5g cap; its own code comment measures +845.4 MiB RSS per "
     + "extraction. Raising server concurrency risks OOM-kill. Raising PEK_SEMAPHORE_WAIT_SECONDS was explicitly "
     + "ruled out as a non-fix by PO on the origin row (po_ruling_20260826T0650Z). "
     + "MEASURED: 43 POST /pek-extract requests arrived in the 01Z hour on 2026-08-26 against 1 server-side slot. "
     + "01Z is OUTSIDE the 02:00-07:59 UTC block window, so those requests were ACCEPTED and queued — that is the "
     + "contention half, and it is fixed by pacing, not by any market-hours gate."),
    acceptance:
      ("AC-1 PACING (the load-bearing half): inter-request and inter-batch pacing such that a 20-row re-fire pass "
     + "cannot place more than a small bounded number of requests in pdf-extractor's queue at once. Assert on "
     + "concurrent in-flight count, not on wall-clock sleep duration. "
     + "AC-2 HONOR THE 503's OWN detail.retry_after field, which the response already carries and this job "
     + "currently discards. "
     + "AC-3 CLIENT-SIDE MARKET-HOURS GATE, but ONLY as a round-trip/log-noise saving — it does not fix AC-1. "
     + "REUSE the canonical helper isVnMarketHours(now) from "
     + "apps/mcp-server/src/domain/services/freshnessSlaChecker.ts; do NOT write new market-hours math. Precedent "
     + "to copy, including its test shape: FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD (DONE_VERIFIED 2026-07-10, commit "
     + "f8b4b3d50) added exactly this guard — TO bctcPdfPullJob.ts. It is a DIFFERENT job and this one was never "
     + "covered; grep-verified at source 2026-08-26T08:2xZ: bctcExtractReconcileJob.ts has ZERO isVnMarketHours "
     + "references and zero retry_after handling. This is a second uncovered call site, NOT a re-ship of shipped work. "
     + "AC-4 NEGATIVE CONTROL, MANDATORY — this is the trap: read this job's own module doc comment, section "
     + "'Re-fire-vs-passive decision'. It ADOPTED unconditional re-fire precisely BECAUSE the DB column folds all "
     + "four /pek-extract outcomes (202 / 503 market-hours / 502 error / 502 unreachable) into one 'pek_triggered' "
     + "status, so a row whose only attempt got a 503 can reach a real result ONLY via an active re-fire. A gate or "
     + "pacing skip must therefore NOT consume a reconcile_attempt, or it silently converts deferred rows into "
     + "enrich_failed WITHOUT EVER HAVING RETRIED — reintroducing the exact silent-failure class D3B/D3C exist to "
     + "close. Interacts with FIX-BCTC-VPSINGEST-REQUEUE-NO-RECONCILE-COUNTER-RESET (backlog, dev-mcp-server). "
     + "AC-5 tests pin `now` explicitly (opts.now pattern already used by runBctcPdfPullJob) so no assertion "
     + "becomes wall-clock-flaky inside 02:00-07:59 UTC."),
    related: [
      "FIX-PDFX-PEK-EXTRACT-202-ACCEPTED-THEN-SILENTLY-DROPPED-SEMAPHORE-1800S",
      "FIX-PEK-EXTRACT-SEMAPHORE-CONTENTION-BOUNDED-QUEUE",
      "FOLLOWUP-PEK-EXTRACT-CONTENTION-PACING-CAPACITY-24H-WINDOW",
      "FIX-PDFX-MARKET-HOURS-GUARD-ONLY-ON-PEK-EXTRACT-FOUR-OCR-ROUTES-UNGUARDED",
      "FIX-BCTC-VPSINGEST-REQUEUE-NO-RECONCILE-COUNTER-RESET"
    ],
    dedup_checked:
      ("po 2026-08-26T08:2xZ via scripts/po-board-dedup-search.sh on /bctcExtractReconcile|pek-extract|reconcile|"
     + "pacing/ over NON-TERMINAL LANES *and* --all-lanes, plus a direct id+title scan of the cold archives "
     + "docs/data/orch/archive/2026-06.json, 2026-07.json, 2026-08.json and backlog-detail.json (archive-blind "
     + "dedup has re-shipped shipped work before). Two archive near-misses examined and RULED OUT as coverage: "
     + "FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD (DONE_VERIFIED, guards bctcPdfPullJob.ts — different job) and "
     + "FIX-PEK-EXTRACT-SEMAPHORE-CONTENTION-BOUNDED-QUEUE (DONE_VERIFIED, the pdf-extractor SERVER-side half; "
     + "its own title names this caller's 20-wide re-fire as the load it was absorbing). Live near-miss ruled out: "
     + "FOLLOWUP-PEK-EXTRACT-CONTENTION-PACING-CAPACITY-24H-WINDOW is a MEASUREMENT row in "
     + "zone apps/pdf-extractor/, owner dev-pdf-extractor — the other side of the wire. No row owns the mcp-server "
     + "caller.")
  }]

# ═══════════════════════════════════════════════════════════════════════════════
# MINT 2 — structural defect found WHILE triaging: polymorphic inbox payload
# ═══════════════════════════════════════════════════════════════════════════════
| .task_board.ready += [{
    id: "FIX-TRIAGE-INBOX-PAYLOAD-POLYMORPHIC-STRING-ABORTS-JQ-ITERATION-HIDES-TAIL",
    type: "FIX",
    size: "S",
    status: "READY",
    priority: "P1",
    zone: "cross-service/",
    owner: "developer",
    next_agent: "developer",
    dispatch_lane: "developer",
    baseline_pass: true,
    supervised: false,
    plan_only: false,
    created_at: NOW,
    created_by: BY,
    updated_at: NOW,
    updated_by: BY,
    dedup_key: "pending_triage_inbox:payload-is-string-or-object|defect:jq-iteration-aborts-and-truncates-listing",
    files: [
      "docs/data/orch/orch-state.json",
      "scripts/agents-flow/drain-signals.js",
      "docs/agents/po/flow/triage-signals.md",
      "apps/mcp-server/src/infrastructure/orchStateSchema.ts"
    ],
    title: ("dev_team_idle_chain.pending_triage_inbox[].payload is polymorphic (object for most emitters, bare "
          + "STRING for commit-sweep-guard), so any `.payload.<field>` read over the inbox throws mid-iteration "
          + "and SILENTLY TRUNCATES the listing at the first string payload — every envelope after it is invisible"),
    reproduced_at_source:
      ("REPRODUCED LIVE by PO 2026-08-26T08:2xZ against the 9-envelope inbox, exact command: "
     + "`jq -r '.dev_team_idle_chain.pending_triage_inbox[] | \"\\(.type) :: \\(.payload.title // \\\"-\\\")\"' "
     + "docs/data/orch/orch-state.json`. Result: 6 of 9 rows printed to stdout, then "
     + "`jq: error (at ...:25022): Cannot index string with string \"title\"`, exit 5. Envelopes [6][7][8] never "
     + "printed. The `// \"-\"` alternative operator does NOT save it — the error is a type error on the index "
     + "operation itself, raised before the alternative is evaluated. "
     + "WHY THIS IS DANGEROUS RATHER THAN MERELY UNTIDY: the error goes to stderr while the PARTIAL result goes to "
     + "stdout with a non-zero exit, so any caller that pipes stdout and does not check $? sees a plausible, "
     + "well-formed, SHORT inbox and no indication anything was dropped. Ordering is arbitrary (envelope arrival "
     + "order), so a string payload at index 0 hides ALL nine. This tick it hid 3 of 9, one of which was the "
     + "bug-escalation itself. Confirmed to have actually happened this tick: the router's first listing of the "
     + "inbox stopped at [5] for exactly this reason."),
    acceptance:
      ("AC-1 Decide and enforce ONE shape at the producer. Preferred: envelope payload is ALWAYS an object; a "
     + "string-only emitter is wrapped as {text: \"<string>\"} at write time. Enforce in "
     + "orchStateSchema.ts so a non-conforming envelope is rejected on write, not tolerated on read. "
     + "AC-2 Migrate/normalize any string payloads already resident in the inbox at deploy time — do not leave a "
     + "mixed population behind a new schema. "
     + "AC-3 CONSUMER SIDE, mandatory even if AC-1 lands: every reader of this inbox uses a type-safe accessor "
     + "(e.g. `(.payload | if type==\"object\" then .title else null end)`). Sweep the known readers: "
     + "docs/agents/po/flow/triage-signals.md Step 0-SIG, docs/agents/dev-team/flow/drain-signals.md, "
     + "scripts/agents-flow/drain-signals.js. "
     + "AC-4 FAIL-LOUD, not fail-short: a consumer that cannot parse an envelope must report that envelope by "
     + "envelope_id and CONTINUE, never abort the iteration. Assert the count of envelopes processed equals the "
     + "count present. "
     + "AC-5 REGRESSION FIXTURE using this tick's real data: a 9-envelope inbox whose index 6 payload is the bare "
     + "string beginning '[notebook-immutability-guard] WARN:' must yield 9 rows out, not 6. "
     + "AC-6 NEGATIVE CONTROL: the commit-sweep-guard emitter keeps working end-to-end after the change — its "
     + "payload is genuinely a human-readable message with no object structure to impose, so the fix must not "
     + "require it to invent fields."),
    po_scope_note:
      ("Found by PO while triaging, not reported by any detector — which is itself the point: nothing in the "
     + "fleet notices this, because the failure mode is a short-but-plausible answer. "
     + "NOT a duplicate of FIX-DURABLE-INBOX-INLINES-FULL-SIGNAL-PAYLOAD-INTO-HOT-ORCHSTATE (backlog, "
     + "developer) — that row is about payload SIZE bloating the hot file; this is about payload TYPE breaking "
     + "iteration. They touch the same field and should be scoped together if one agent takes both, but neither "
     + "fix implies the other."),
    dedup_checked:
      ("po 2026-08-26T08:2xZ via scripts/po-board-dedup-search.sh on /pending_triage_inbox|payload.*schema|"
     + "envelope.*payload|triage inbox/ --all-lanes. Nearest live rows examined and ruled out: "
     + "FIX-DURABLE-INBOX-INLINES-FULL-SIGNAL-PAYLOAD-INTO-HOT-ORCHSTATE (size, not type), "
     + "TASK-DEVTEAM-IDLE-CHAIN-5-CONSERVATION-DOCS (conservation-check coverage for the inbox, not payload shape), "
     + "FIX-DEVTEAM-DRAIN-ROUTES-NON-PO-ENVELOPES-TO-PO-STEP0SIG (the `to` field, not `payload`). Cold archives "
     + "2026-06/07/08 + backlog-detail scanned by subject: only FIX-DEVTEAM-PAYLOAD-COMMENT-DRIFT (2026-06, "
     + "dispatcher-wrap payload COMMENTS vs string schema — a doc-drift row, different plane).")
  }]

# ═══════════════════════════════════════════════════════════════════════════════
# MINT 3 — SPIKE: the class behind three of this tick's four defects
# ═══════════════════════════════════════════════════════════════════════════════
| .task_board.backlog += [{
    id: "SPIKE-BOARD-CONTRACT-FIELDS-AND-LANES-READER-COUNT-AUDIT",
    type: "SPIKE",
    mode: "spike",
    size: "M",
    status: "BACKLOG",
    priority: "P2",
    zone: "cross-service/",
    owner: "architect",
    next_agent: "architect",
    dispatch_lane: "architect",
    baseline_pass: true,
    supervised: false,
    plan_only: true,
    timebox: 120,
    created_at: NOW,
    created_by: BY,
    updated_at: NOW,
    updated_by: BY,
    dedup_key: "board-contract:advertised-guarantee-with-zero-or-one-implementing-reader",
    files: [
      "scripts/lib/devteam-eligibility.jq",
      "docs/agents/dev-team/flow/main.md",
      "docs/standards/task-schema.md"
    ],
    title: ("SPIKE: enumerate every task_board field and lane that agents treat as a binding guarantee, and count "
          + "its actual READERS — three separate defects filed in ONE dev-team tick were all the same class, "
          + "'advertised board-wide, implemented on zero or one path'"),
    question: ("Which task_board fields and lanes does the fleet WRITE as if they were contracts, and how many "
             + "dispatch/consumer paths actually READ each one? Rank by (agents-who-rely) x (paths-that-honor = 0 or 1)."),
    po_scope_note:
      ("TRIGGER — four known instances, three of them filed within 29 minutes of one another on 2026-08-26 by the "
     + "same router tick, which is why this is a class and not a coincidence: "
     + "(1) not-before gate: qa_not_before / next_recheck_not_before / qa_new_window_earliest_d1_close are honored "
     + "by 1 of 4 pickers; all four IMPORT devteam-eligibility.jq, only the qa-drain CALLS is_gated_not_before "
     + "(FIX-NOTBEFORE-DEFERRAL-GATE-ENFORCED-BY-ONE-OF-FOUR-DISPATCH-PICKERS, ready[]). "
     + "(2) task_board.qa[]: a mutation TARGET with zero selectors — a well-behaved agent parking a row there to "
     + "mean 'awaiting QA' strands it (FIX-DEVTEAM-QA-LANE-STALE-AGE-WATCHDOG-BLIND, promoted to ready[] this tick; "
     + "cost: one P0 stranded 12 days). "
     + "(3) status=BLOCKED as a clock-based deferral: no consumer allowlist admits it and nothing releases it "
     + "(FIX-DEVTEAM-BLOCKED-STATUS-FREEZES-ROWS-NO-CONSUMER-ALLOWLIST-ADMITS-IT, promoted to ready[]/P0 this tick). "
     + "(4) architect_handoff: a write-only field with zero readers fleet-wide "
     + "(FIX-ARCHITECTHANDOFF-DEAD-FIELD-ZERO-READERS-STRANDS-EVERY-ARCHITECT-BRIEF, backlog[]). "
     + "This SPIKE does not re-do any of the four; they own their own fixes. It asks whether instance five already "
     + "exists and nobody has hit it yet."),
    acceptance:
      ("AC-1 Output is a findings doc listing, per field/lane: writers, readers, and the reader count. "
     + "AC-2 METHOD IS THE DELIVERABLE, and the naive method is known-wrong: `grep -l '<field>'` scores qa[] GREEN "
     + "today because it matches the drain's own mutation target and a revert script. Count call sites of the "
     + "PREDICATE / selection sites of the LANE, and treat an import or a write as NOT evidence of enforcement. "
     + "AC-3 Rank findings; anything at reader-count 0 or 1 that ANY flow doc or agent prompt advertises as "
     + "binding is a candidate row. Do not mint rows for the four already-tracked instances above. "
     + "AC-4 NEGATIVE CONTROL: at least one field verified to have MANY readers must appear in the output, so a "
     + "method that reports 0 for everything is visibly falsified. "
     + "AC-5 Explicitly distinguish from SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP (ready[], developer), which "
     + "covers count-threshold gates whose input has a permanent floor above the threshold — a gate that ALWAYS "
     + "fires. This SPIKE covers a gate that is NEVER read. Sibling failure modes, disjoint populations."),
    related: [
      "FIX-NOTBEFORE-DEFERRAL-GATE-ENFORCED-BY-ONE-OF-FOUR-DISPATCH-PICKERS",
      "FIX-DEVTEAM-QA-LANE-STALE-AGE-WATCHDOG-BLIND",
      "FIX-DEVTEAM-BLOCKED-STATUS-FREEZES-ROWS-NO-CONSUMER-ALLOWLIST-ADMITS-IT",
      "FIX-ARCHITECTHANDOFF-DEAD-FIELD-ZERO-READERS-STRANDS-EVERY-ARCHITECT-BRIEF",
      "SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP"
    ],
    dedup_checked:
      ("po 2026-08-26T08:2xZ via scripts/po-board-dedup-search.sh on /reader count|zero readers|no reader|"
     + "advertised.*reader|write-only field|SATURATED-COUNT-THRESHOLD/ --all-lanes. No row owns the CLASS-level "
     + "sweep; FIX-ARCHITECTHANDOFF-... is a single instance of it and SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP "
     + "is the sibling-but-disjoint failure mode named in AC-5.")
  }]

# ═══════════════════════════════════════════════════════════════════════════════
# Pipeline-B signal row -> triaged
# ═══════════════════════════════════════════════════════════════════════════════
| .signal_queue.rows |= map(
    if (.id // "") == "sys-20260826T080003-2786" then
      .status = "triaged"
      | .triaged_at = NOW
      | .triaged_by = "po"
      | .disposition = ("FOLD onto FIX-AUDITOR-DCYCLE2-COMPLETION-EVIDENCE-PREDICATE-CANNOT-SEE-COMPLETED-CYCLES "
                      + "(backlog[], P1, developer) — that row already indicts the tier-2/3 arms for having no "
                      + "notebook fallback. Not minted per-window. Corroborating-marker ambiguity recorded on the "
                      + "row: tier2-last-healthy is 9.6h stale and tier3-last-healthy 29.7h, but last-HEALTHY "
                      + "cannot discriminate 'never ran' from 'ran unhealthy', so this is NOT closed as a clean "
                      + "false positive.")
    else . end
  )

# ═══════════════════════════════════════════════════════════════════════════════
# Durable-inbox CLEAR — subtract by envelope_id (never a blind = [])
# ═══════════════════════════════════════════════════════════════════════════════
| .dev_team_idle_chain.pending_triage_inbox |=
    map(select(.envelope_id as $i | (CONSUMED | index($i)) | not))
| .dev_team_idle_chain._updated_at = NOW
| .dev_team_idle_chain._updated_by = "po"
| .task_board.last_triaged_at = NOW
| .task_board.last_triaged_by = BY
| ._updated_at = NOW
| ._updated_by = BY
