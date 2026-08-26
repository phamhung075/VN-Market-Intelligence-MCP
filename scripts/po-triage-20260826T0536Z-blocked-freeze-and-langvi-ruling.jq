# PO triage 2026-08-26T05:36Z — three strands, ONE write.
#
# STRAND 1 — stale-BLOCKED freeze. `status=="BLOCKED"` is not merely one
#   exclusion: NO dev-team consumer's status allowlist admits it. All eight
#   pickers use POSITIVE allowlists —
#     devteam-backlog-promote-bounded1.jq:104              BACKLOG|TODO
#     devteam-backlog-promote-design-router-sweep.jq:128   BACKLOG|TODO
#     devteam-backlog-promote-supervised-lane-sweep.jq:107 BACKLOG|TODO
#     devteam-backlog-claim-ready-lane-consumer.jq:137     READY|TODO
#     devteam-backlog-claim-incident-lane-consumer.jq:121  READY|TODO
#     devteam-backlog-claim-supervised-lane-sweep.jq:168   READY|TODO
#     devteam-review-claim-qa-drain.jq:189/194             REVIEW|DONE
#     devteam-review-claim-secondary-drain.jq:134/139      REVIEW|DONE
#   so BLOCKED is terminal-in-practice in EVERY lane, deps irrelevant.
#   CORRECTION to signal rtr-20260826T0429: devteam-eligibility.jq:117/:160
#   are NOT the gate — they are `wip_in_progress`/`incident_wip_in_progress`,
#   which exclude BLOCKED from the WIP BUDGET (that FREES capacity, it does
#   not block anything). Aiming a fix at those two lines would fix nothing.
#
# STRAND 2 — market-hours gate encoded as a phantom blocker id.
#   `blocked_by:"AC8-MARKET-HOURS-GATE-UNTIL-0900Z-WEEKDAY"` is a CLOCK
#   condition wearing a task id. It resolves to nothing in any lane, hot or
#   cold, so no completion event can ever discharge it. Replaced with the
#   already-defined `next_recheck_not_before` key (devteam-eligibility.jq
#   `gate_not_before_keys` / `is_gated_not_before`). Status stays BLOCKED for
#   now because that key is currently honoured ONLY by the qa-drain consumer
#   — making it honoured fleet-wide is AC-2 of the minted class fix.
#
# STRAND 3 — lang=vi ruling. See M3 below and the decision journal.

def now: $now;
def stamp: . + {updated_at: now, updated_by: "po (triage-20260826T0536Z)"};

# ---- per-row edits, applied by id wherever the row lives ----
def unfreeze($why): stamp + {blocked_by: null, po_unfreeze_20260826T0536Z: $why};

def edit_backlog:
  if .id == "TASK-COWORK-CATCHUP-9" then
    (unfreeze("UNFROZEN by po 2026-08-26T05:36Z. Sole blocker TASK-COWORK-DOC-TRUTH-LAYER-INVENTORY is DONE_VERIFIED in done_verified[]; deps_satisfied() already agreed. The freeze was the status flag alone, which no consumer allowlist admits. depends_on cleared alongside blocked_by so the two gates cannot disagree again.")
      + {status: "BACKLOG", depends_on: null})
  elif .id == "VERIFY-FIX-COVERAGE-SWEEP-BLANKET-STAMP-REALDATA" then
    (unfreeze("UNFROZEN by po 2026-08-26T05:36Z. BOTH blockers are DONE_VERIFIED: FIX-COWORK-BASH-GRANT-COVERAGE-STAMP-TRANSPORT in hot done_verified[], and FIX-BDI-SHIPPING-STALE-404-GUARD in the COLD archive docs/data/orch/archive/2026-07.json (it reads ABSENT to any probe that scans only the hot file — that blindness is minted as FIX-PO-DEDUP-SEARCH-BLIND-TO-COLD-MONTHLY-ARCHIVE-FILES this tick).")
      + {status: "BACKLOG", supervised: true})
  elif .id == "FU-CHEF-MARKER-INFLOW" then
    (unfreeze("UNFROZEN by po 2026-08-26T05:36Z. Blocker UC-CCA-P3 is DONE_VERIFIED. Row also carried NO priority and NO next_agent, so clearing the status alone would have left it unspawnable; both are set here in the same write.")
      + {status: "BACKLOG", priority: "P2", next_agent: "developer", dispatch_lane: "developer"})
  elif .id == "VERIFY-FIX-VPS-SSH-TRIGGER-FAIL-LOUD-REALDATA" then
    (unfreeze("UNFROZEN by po 2026-08-26T05:36Z — PHANTOM BLOCKER. blocked_by was [\"user-escalation-vps-restart\"], which is not a task id and resolves to nothing in any hot lane or any cold monthly archive; it was a note about a past event, so no completion event could ever fire. The underlying obligation (CANONICAL:PUSH-AUTONOMY-1 step 5 real-data verify) is unaffected and still stands. supervised=true set so the supervised-lane sweep carries it — next_agent=qa is off the DRS allowlist, exact same routing shape as the sibling VERIFY-FIX-COVERAGE-SWEEP row.")
      + {status: "BACKLOG", supervised: true})
  elif .id == "FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM" then
    (stamp + {blocked_by: null, next_recheck_not_before: "2026-08-26T09:00:00Z",
      po_gate_20260826T0536Z: "STAYS BLOCKED, gate re-encoded. Remaining AC-2/AC-3/AC-6 are memory MEASUREMENT ACs that require RUNNING pdf-extractor, barred 02:00-08:59Z weekdays. The old blocked_by AC8-MARKET-HOURS-GATE-UNTIL-0900Z-WEEKDAY was a clock condition wearing a task id and could never discharge. Real gate now in next_recheck_not_before. UNBLOCK ACTION at/after 2026-08-26T09:00:00Z: set status=BACKLOG, leave next_agent=dev-pdf-extractor. Also corrects po_sequencing_20260826T0116Z, which narrated this row as 'ready[0], next_agent=architect' — it was never moved and architect finished its design pass at 01:53Z; the row is backlog[]/dev-pdf-extractor."})
  elif .id == "FIX-MARKETDB-20260826-RESTORE-DROPPED-12205-FF5M-AND-54-EVIDENCE-ROWS-STILL-RECOVERABLE" then
    (stamp + {blocked_by: null, next_recheck_not_before: "2026-08-26T09:00:00Z",
      po_gate_20260826T0536Z: "STAYS BLOCKED, gate re-encoded — same phantom-blocker substitution as the pdf-extractor row. AC-2 needs live market.db writes, barred 02:00-08:59Z weekdays. UNBLOCK ACTION at/after 2026-08-26T09:00:00Z: set status=BACKLOG, next_agent=ops, dispatch_lane=ops. P0 — this is the highest-priority row behind the gate; do not let it sit past 09:00Z."})
  elif .id == "FIX-PDFOCR-ORIENTATION-CORPUS-79-FILES-312-PAGES-SWEEP-REVERTED-BY-DB-RESTORE" then
    (stamp + {next_recheck_not_before: "2026-08-26T09:00:00Z",
      po_gate_20260826T0536Z: "STAYS BLOCKED. This row had status=BLOCKED with blocked_by=null AND depends_on=null — the vacuous-truth shape where deps_satisfied() is trivially true and NO completion event can ever exist. The real gate is the same market-hours bar (re-OCR of 312 pages must not run 02:00-08:59Z weekdays), now written explicitly. UNBLOCK ACTION at/after 2026-08-26T09:00:00Z: set status=BACKLOG, next_agent=dev-pdf-extractor, dispatch_lane=dev-pdf-extractor."})
  elif .id == "CLEAN-RETIRE-TEAM-TOOL-RECHECK-WRITER" then
    (stamp + {hold_reason: "DELIBERATE PO HOLD, not a stale flag — do NOT auto-clear. Retracted 2026-08-23T12:32Z on a falsified premise; implementing it would stop a job that is running and producing daily. Kept on the board so the citation chain cannot re-form. This row is the live negative control for FIX-DEVTEAM-BLOCKED-STATUS-FREEZES-ROWS-NO-CONSUMER-ALLOWLIST-ADMITS-IT AC-4.",
      po_note_20260826T0536Z: "Code-janitor re-emitted the replace-vs-retire decision request again this tick (cj-20260826T043200 / inbox 04:42Z). No new row: the premise is already falsified here, and the surviving owner of the real defect is FIX-JANITOR-PRUNE-SWEEP-HARDCODED-DEAD-WRITER-PREMISE (backlog[], BACKLOG, P1, next_agent=developer — already dispatchable)."})
  else . end;

def edit_review:
  if .id == "FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT" then
    (unfreeze("UNFROZEN by po 2026-08-26T05:36Z. Blocker FIX-ORCHBACKLOGSTUB-COLD-ITEMS-ARRAY-SHAPE-CRASH-BLOCKS-LANES-MIGRATION is DONE_VERIFIED. Row also had next_agent=null, so status alone would have left it unspawnable; set to architect (the finding is a re-scoping call — it says TE-T15/FIX-BACKLOG-TERMINAL-ROW-DRIFT as scoped evicts ~0 bytes — not an implementation). SECONDARY-Drain gates on status==REVIEW + next_agent!=qa, so it is pickable there now.")
      + {status: "REVIEW", next_agent: "architect", dispatch_lane: "architect"})
  else . end;

# ---- the lane-misplaced in_progress row: MOVE ATTEMPTED, REFUSED BY A
#      KNOWN GATE. First attempt of this write moved it in_progress[] ->
#      backlog[] and orch-apply's row-prose-ceiling check aborted the WHOLE
#      write: `live=0B -> candidate=18774B`. The 0B is the bug, not the row —
#      PROSE_CEILING_LANES omits in_progress[], so the pre-move baseline reads
#      as zero and ANY move of an over-ceiling row out of the WIP lane is
#      rejected as if it were fresh prose. Already owned and already
#      dispatchable: TASK-PROSECEILING-LIVE-BASELINE-ALL-LANES (ready[],
#      READY, P1, developer), whose spec note already records "two rows are
#      parked BLOCKED-in-place right now instead of lane-moved because of
#      this". This row is the third. Left in place deliberately; it is
#      harmless where it sits (BLOCKED rows are excluded from wip_in_progress
#      at devteam-eligibility.jq:117, and claimed_by/claimed_at/
#      owner_client_session are all already null, so it holds no claim and
#      consumes no dispatch budget).
def edit_in_progress:
  if .id == "FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS" then
    (stamp + {po_lanefix_20260826T0536Z: "LANE MOVE ATTEMPTED AND REFUSED, po 2026-08-26T05:36Z — recorded so this is not re-attempted blindly. The row is BLOCKED while parked in the WIP lane, the STATUSFLIP-LANEMOVE straggler shape that docs/agents/dev-team/flow/execute-tier.md CANONICAL:SSOT-STATUSFLIP-LANEMOVE(c) says must move out. Moving it in_progress[] -> backlog[] made orch-apply's row-prose-ceiling check abort the entire write: 'live=0B -> candidate=18774B'. The 0B is false — PROSE_CEILING_LANES omits in_progress[], so the pre-move baseline reads zero and the move looks like 18.7KB of brand-new prose. Owning row already exists and is already dispatchable: TASK-PROSECEILING-LIVE-BASELINE-ALL-LANES (ready[], READY, P1, developer). Re-attempt the move only AFTER that lands. Harmless meanwhile: BLOCKED rows are excluded from wip_in_progress (devteam-eligibility.jq:117) and claimed_by/claimed_at/owner_client_session are all null, so it holds no claim and consumes no dispatch budget. Its BLOCKED status is CORRECT, not stale: blocker TASK-COWORK-MUTEX-001 is genuinely still at REVIEW."})
  else . end;

  .task_board.backlog       |= (map(edit_backlog))
| .task_board.review        |= (map(edit_review))
| .task_board.in_progress   |= (map(edit_in_progress))

# ---- MINTS ----
| .task_board.backlog += [
  {
    id: "FIX-DEVTEAM-BLOCKED-STATUS-FREEZES-ROWS-NO-CONSUMER-ALLOWLIST-ADMITS-IT",
    type: "FIX", size: "M", status: "BACKLOG", priority: "P1",
    zone: "multi", next_agent: "architect", dispatch_lane: "architect",
    supervised: false, plan_only: false, baseline_pass: true,
    created_at: now, created_by: "po/triage-20260826T0536Z",
    updated_at: now, updated_by: "po/triage-20260826T0536Z",
    dedup_key: "devteam-dispatch:blocked-status-is-a-permanent-freeze-across-all-consumer-allowlists",
    files: ["scripts/devteam-backlog-promote-bounded1.jq","scripts/devteam-backlog-promote-design-router-sweep.jq","scripts/devteam-backlog-promote-supervised-lane-sweep.jq","scripts/devteam-backlog-claim-ready-lane-consumer.jq","scripts/devteam-backlog-claim-incident-lane-consumer.jq","scripts/devteam-backlog-claim-supervised-lane-sweep.jq","scripts/devteam-review-claim-qa-drain.jq","scripts/devteam-review-claim-secondary-drain.jq","scripts/lib/devteam-eligibility.jq","docs/agents/dev-team/flow/main.md"],
    depends_on: [], blocked_by: null,
    title: "status==BLOCKED is a PERMANENT freeze in every lane: all eight dev-team pickers gate on a POSITIVE status allowlist (BACKLOG|TODO, READY|TODO, REVIEW|DONE) and BLOCKED is in none of them, so a row whose blockers have all reached DONE_VERIFIED stays unpickable forever while deps_satisfied() reports it satisfied - 6 live rows were frozen this way, one P0",
    mechanism: "POSITIVE allowlists, not a BLOCKED exclusion: devteam-backlog-promote-bounded1.jq:104, devteam-backlog-promote-design-router-sweep.jq:128, devteam-backlog-promote-supervised-lane-sweep.jq:107 (BACKLOG|TODO); devteam-backlog-claim-ready-lane-consumer.jq:137, devteam-backlog-claim-incident-lane-consumer.jq:121, devteam-backlog-claim-supervised-lane-sweep.jq:168 (READY|TODO); devteam-review-claim-qa-drain.jq:189/194 and devteam-review-claim-secondary-drain.jq:134/139 (REVIEW|DONE). Nothing ever writes the status back when a blocker completes.",
    correction: "The originating signal rtr-20260826T0429 named scripts/lib/devteam-eligibility.jq:117 and :160 as the gate. THEY ARE NOT. Those two lines are wip_in_progress and incident_wip_in_progress, which exclude BLOCKED rows from the WIP BUDGET - that frees dispatch capacity and is deliberate (FIX-DEVTEAM-WIP-BUDGET-COUNTS-BLOCKED-INPROGRESS-ROWS). A fix aimed there changes nothing. Do not re-derive the scope from that signal.",
    acceptance: "AC-1 Pick ONE of: (a) a writer that clears status BLOCKED->BACKLOG/READY/REVIEW when the last blocker reaches DONE_VERIFIED, or (b) make each consumer's status gate defer to deps_satisfied() so a deps-satisfied row is never excluded by the status flag alone. Architect rules; do not do both. AC-2 Fold in the time-gate half: next_recheck_not_before is already defined in devteam-eligibility.jq gate_not_before_keys but is consumed ONLY by devteam-review-claim-qa-drain.jq, so a backlog/ready row cannot be time-gated by anything except BLOCKED. Make is_gated_not_before binding in all six backlog/ready consumers. Three live rows depend on this (see AC-6). AC-3 Add an incoherence check for status==BLOCKED with blocked_by==null AND depends_on==null: deps_satisfied() is VACUOUSLY TRUE there, so no completion event can ever exist. Emit a signal row per instance rather than auto-clearing. AC-4 NEGATIVE CONTROL, mandatory: CLEAN-RETIRE-TEAM-TOOL-RECHECK-WRITER is BLOCKED ON PURPOSE (retracted, must never be promoted) and now carries hold_reason. It MUST still be unpickable after this fix. A blanket clear-on-no-blockers fails this test. Same for HOLD-CRON-MARKETWATCHER-NEWSSCOUT-MARKETHOURS-MODES-PRODUCT-DECISION, whose blocked_by is a paragraph of English, not an id. AC-5 Negative control 2: ALPHA-S2-RAG-FTS-REBUILD-CRON has one blocker DONE_VERIFIED (cold archive) and one still BLOCKED - it must stay frozen. AC-6 The three market-hours rows re-encoded this tick (FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM, FIX-MARKETDB-20260826-RESTORE-DROPPED-12205-FF5M-AND-54-EVIDENCE-ROWS-STILL-RECOVERABLE, FIX-PDFOCR-ORIENTATION-CORPUS-79-FILES-312-PAGES-SWEEP-REVERTED-BY-DB-RESTORE) carry next_recheck_not_before=2026-08-26T09:00:00Z and must become dispatchable automatically once AC-2 lands and the clock passes, with NO status edit by any agent. AC-7 zone=multi: architect splits the scripts/ half (developer) from the docs/agents/dev-team/flow/ half (agent-father).",
    evidence: "Verified live 2026-08-26T05:3xZ against docs/data/orch/orch-state.json: 55 rows sit at status BLOCKED. Six had every blocker resolvable to DONE_VERIFIED (hot or cold archive) and were unfrozen by hand this tick, one of them P0 with next_agent=developer. Two more sat at BLOCKED with blocked_by=null and depends_on=null. Hand-clearing does not scale and the next blocker completion re-creates the class.",
    related: ["rtr-20260826T0429-staleblockedstatusfreezesrows","TASK-COWORK-CATCHUP-9","VERIFY-FIX-COVERAGE-SWEEP-BLANKET-STAMP-REALDATA","FU-CHEF-MARKER-INFLOW","FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT","VERIFY-FIX-VPS-SSH-TRIGGER-FAIL-LOUD-REALDATA","CLEAN-RETIRE-TEAM-TOOL-RECHECK-WRITER"],
    dedup_checked: "po 2026-08-26T05:3xZ. Hot lanes scanned by SUBJECT on /BLOCKED|deps_satisfied|eligibility|status.gate/ and by id path (task_board.<lane>[] only, never bare grep - telemetry finding ids share task-row shape). Cold archives docs/data/orch/archive/2026-06.json, 2026-07.json, 2026-08.json scanned for the same. No row owns the status-gate-vs-deps disagreement. FIX-DEVTEAM-MANUAL-DISPATCH-BYPASSES-DEPS-SATISFIED-GATE (backlog, BACKLOG, developer) is the OPPOSITE defect - hand-dispatch ignoring deps - and is not this row."
  },
  {
    id: "FIX-PO-DEDUP-SEARCH-BLIND-TO-COLD-MONTHLY-ARCHIVE-FILES",
    type: "FIX", size: "S", status: "BACKLOG", priority: "P1",
    zone: "scripts/", next_agent: "developer", dispatch_lane: "developer",
    supervised: false, plan_only: false, baseline_pass: true,
    created_at: now, created_by: "po/triage-20260826T0536Z",
    updated_at: now, updated_by: "po/triage-20260826T0536Z",
    dedup_key: "po-dedup:board-dedup-search-scans-hot-lanes-only-not-cold-monthly-archives",
    files: ["scripts/po-board-dedup-search.sh"],
    depends_on: [], blocked_by: null,
    title: "scripts/po-board-dedup-search.sh --all-lanes scans ONLY the hot orch-state.json lanes and never reads docs/data/orch/archive/2026-*.json, so any row cold-evicted to a monthly archive reads as NEVER HAVING EXISTED - this produced two false 'row is lost' claims and one false 'discharge left no trace' claim in a single signal today",
    mechanism: "scripts/po-board-dedup-search.sh:30 - --all-lanes expands to LANES='[\"backlog\",\"ready\",\"in_progress\",\"review\",\"qa\",\"done\",\"done_verified\",\"archive\",\"active_sprints\",\"closed_sprints\"]'. Every member is a key inside the hot docs/data/orch/orch-state.json. The cold monthly files docs/data/orch/archive/2026-06.json / 2026-07.json / 2026-08.json (.done_tasks[]) and docs/data/orch/archive/backlog-detail.json are never opened. The script's own header at :18 advertises --all-lanes as the exhaustive mode, which is what makes the gap dangerous rather than merely incomplete.",
    evidence: "Signal rtr router 2026-08-26T05:26Z asserted OPS-PDFX-REDEPLOY-DEBT-LANG-VI-FIX-INERT-IN-PRODUCTION 'exists in NO board lane and NO archive record (live=0, archive-detail=0)' and that its discharge 'left no trace'. FALSE: it is present at status DONE_VERIFIED in docs/data/orch/archive/2026-08.json. The same run flagged FIX-PDFX-TESSERACT-CONFIDENCE-MEAN-OVER-NONEMPTY-MASKS-TOTAL-PAGE-MISS as a possible real loss - also FALSE, also DONE_VERIFIED in 2026-08.json. Separately, FIX-BDI-SHIPPING-STALE-404-GUARD reads ABSENT to hot-only probes but is DONE_VERIFIED in 2026-07.json, which is what let VERIFY-FIX-COVERAGE-SWEEP-BLANKET-STAMP-REALDATA look permanently blocked. Three false negatives from one blind spot, same day.",
    acceptance: "AC-1 --all-lanes additionally reads every docs/data/orch/archive/*.json, matching .done_tasks[] and any top-level array of task-shaped objects, plus backlog-detail.json items. AC-2 Output labels each hit with its SOURCE FILE and lane so a caller can tell hot from cold - a cold DONE_VERIFIED hit must not be silently formatted like a live row. AC-3 Exit status and result count must change on the three ids in this row's evidence field: each currently returns 0 hits under --all-lanes and must return >=1 after. AC-4 Do NOT widen the default (no-flag) mode - only --all-lanes. AC-5 Cheap regression: a fabricated id that exists nowhere must still return 0 hits from every source.",
    related: ["OPS-PDFX-REDEPLOY-DEBT-LANG-VI-FIX-INERT-IN-PRODUCTION","FIX-PDFX-TESSERACT-CONFIDENCE-MEAN-OVER-NONEMPTY-MASKS-TOTAL-PAGE-MISS","FIX-BDI-SHIPPING-STALE-404-GUARD","FIX-DEVTEAM-BLOCKED-STATUS-FREEZES-ROWS-NO-CONSUMER-ALLOWLIST-ADMITS-IT"],
    dedup_checked: "po 2026-08-26T05:3xZ. Hot lanes scanned by SUBJECT on /dedup|archive|cold.evict|po-board-dedup/ via jq paths rooted at task_board., and all three cold monthly archives scanned for the same. Nearest neighbours read and rejected: FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING (fixes deps_satisfied's archive lookup inside devteam-eligibility.jq, a different consumer and already shipped) and the cold-eviction referential guard in scripts/orch-cold-evict.sh (controls what gets evicted, not what gets searched). No row owns the dedup-search blind spot."
  },
  {
    id: "MEASURE-PDFX-BCTC-QUALITY-TESSERACT-VIE-PRODUCTION-BASELINE",
    type: "SPIKE", size: "M", status: "BLOCKED", priority: "P1",
    zone: "apps/pdf-extractor/", next_agent: "dev-pdf-extractor", dispatch_lane: "dev-pdf-extractor",
    supervised: false, plan_only: false, baseline_pass: true,
    created_at: now, created_by: "po/triage-20260826T0536Z",
    updated_at: now, updated_by: "po/triage-20260826T0536Z",
    blocked_by: null, depends_on: [],
    next_recheck_not_before: "2026-08-26T09:00:00Z",
    timebox: 180,
    dedup_key: "pdfx-ocr:production-bctc-extraction-quality-baseline-on-the-tesseract-vie-default",
    files: ["apps/pdf-extractor/infrastructure/pek_engine_adapter.py","apps/pdf-extractor/infrastructure/ocr_adapter.py","apps/pdf-extractor/infrastructure/ocr_worker.py"],
    title: "There is NO measured production BCTC extraction-quality baseline on the tesseract-vie default that actually serves every extraction today, so no Vietnamese-quality change can ever be shown to have helped - establish one on named exemplars (DXG, FPT p9), and settle whether the PEK table-GRID PaddleOCR instance's lang=vi is genuinely inert",
    po_ruling_20260826T0536Z: "THE ASK AS FILED IS REJECTED AND REPLACED. Signal router 2026-08-26T05:26Z asked for a before/after measurement of production BCTC quality 'post-lang=vi', on the premise that 'production BCTC OCR quality has plausibly moved for the FIRST time'. THAT PREMISE IS FALSE and there is no before/after to measure. Verified read-only this tick, no extractor run: (1) docker exec on the RUNNING container 417febec1a03 dumps five env vars (BCTC_PAGE_TEXT_BACKEND, PADDLE_OCR_BASE_DIR, PDFX_OCR_MAX_CONCURRENCY, PDFX_OCR_PAGE_TIMEOUT_S, PDFX_OCR_QUEUE_WAIT_S) and OCR_TEXT_BACKEND is NOT among them - it is unset. (2) Unset selects TesseractVieBackend (apps/pdf-extractor/__tests__/test_ocr_backends.py:77-78, restated at infrastructure/ocr_orientation.py:34). (3) Two of the three lang=vi sites - ocr_adapter.py:609 and ocr_worker.py:268, note the signal cited :224 - are on the PaddleOCR TEXT path, reachable only when OCR_TEXT_BACKEND is paddleocr or auto. Both off. (4) The third, pek_engine_adapter.py:420, is disclaimed by its own adjacent comment at :412-418: 'select_ocr_backend() defaults to tesseract-vie and OCR_TEXT_BACKEND is unset, so this instance supplies the table GRID, not the cell TEXT.' (5) The one decision that would have switched the path on, DECISION-PDFX-OCR-TEXT-BACKEND-DEFAULT-FLIP-TO-AUTO, was REJECTED AND CANCELLED 2026-08-25T17:52Z on measured evidence (DBC 46% rescue fire against its own 10% rollback trigger; 494 memory.max events against a baseline of 0). CONCLUSION: all three lang=vi sites are DORMANT for production BCTC text quality. Measuring before/after would measure a null change and would manufacture exactly the unfounded improvement claim the signal's own caution field warns against. The signal's two absence claims are also both wrong: OPS-PDFX-REDEPLOY-DEBT-LANG-VI-FIX-INERT-IN-PRODUCTION and FIX-PDFX-TESSERACT-CONFIDENCE-MEAN-OVER-NONEMPTY-MASKS-TOTAL-PAGE-MISS are BOTH present at DONE_VERIFIED in docs/data/orch/archive/2026-08.json - nothing is lost, and the redeploy discharge did leave a trace.",
    why_this_row_exists: "The user's standing goal - Vietnamese language support to improve BCTC extraction quality - is real and is served in production TODAY by tesseract-vie, not by any paddle path. What is missing is not a post-lang=vi delta; it is that this fleet has never held a repeatable quality baseline for the engine that actually runs, which is why every previous quality claim here has been contested and then retracted. Build the baseline first. Then any future Vietnamese-quality change has something to be measured against.",
    acceptance: "AC-1 MARKET-HOURS GATE, binding: run nothing before 2026-08-26T09:00:00Z, and never during 02:00-08:59Z on a weekday. If dispatched inside the window, return immediately without running the extractor. AC-2 Produce a repeatable, scripted quality measurement over a NAMED fixed document set that includes the known-bad exemplars DXG and FPT page 9. Report per-document and per-page: character count, count of pages yielding near-zero text, and a diacritic-presence rate (share of Vietnamese-toned characters among alphabetic characters) - the last is the one that actually tracks the standing goal. AC-3 Record the numbers as the BASELINE for the CURRENT production configuration (OCR_TEXT_BACKEND unset, tesseract-vie), stated with the container image id and git_sha. Do NOT compare against anything; there is no valid prior measurement. AC-4 Settle the narrow open question: with everything else fixed, does pek_engine_adapter.py:420 lang='vi' versus lang='en' change the TABLE GRID (cell count, cell boundaries) on the exemplar set? If the grid is byte-identical, state that the lang=vi change is confirmed 100% inert in the current deployment and say so plainly. If it differs, that difference is a real finding and belongs in a follow-up row, not in this one. AC-5 NO configuration change. Do not set OCR_TEXT_BACKEND, do not rebuild, do not touch docker-compose.yml. This row measures only. AC-6 NOBODY may assert a Vietnamese-quality improvement anywhere on the back of this row - it establishes a baseline, it does not demonstrate a gain. AC-7 Hand the numbers back to po.",
    do_not_conflate: "Does NOT reopen the wholesale tesseract->PaddleOCR swap (REJECTED on a valid lang=vi benchmark: 2.4x latency, pinned at memory.max). Does NOT reopen the auto-mode default flip (REJECTED AND CANCELLED 2026-08-25T17:52Z; its own rollback triggers were breached pre-deployment on the second document measured). Separate live track: the AC-7 rescue-rate sampler series completing ~2026-08-26T17:11Z.",
    gate_note: "status=BLOCKED is the market-hours gate, NOT a dependency - blocked_by and depends_on are both empty by design. next_recheck_not_before=2026-08-26T09:00:00Z is the real condition. BLOCKED is used because next_recheck_not_before is currently honoured only by the qa-drain consumer; AC-2 of FIX-DEVTEAM-BLOCKED-STATUS-FREEZES-ROWS-NO-CONSUMER-ALLOWLIST-ADMITS-IT makes it binding everywhere, after which this row self-releases. UNBLOCK ACTION at/after 2026-08-26T09:00:00Z: set status=BACKLOG.",
    related: ["OCR-PADDLE-VI-LANG-FIX-AND-REBENCH","DECISION-PDFX-OCR-TEXT-BACKEND-DEFAULT-FLIP-TO-AUTO","OPS-PDFX-REDEPLOY-DEBT-LANG-VI-FIX-INERT-IN-PRODUCTION","FIX-PDFX-TESSERACT-CONFIDENCE-MEAN-OVER-NONEMPTY-MASKS-TOTAL-PAGE-MISS","FIX-BCTC-REFINE-DIACRITIC-COLLAPSE-A-BREVE-ACUTE","FIX-PDFOCR-ORIENTATION-CORPUS-79-FILES-312-PAGES-SWEEP-REVERTED-BY-DB-RESTORE"],
    dedup_checked: "po 2026-08-26T05:3xZ. Hot lanes scanned by jq path rooted at task_board. on /lang=vi|lang-vi|vietnamese|diacritic|VIETNAMESE/ - 33 field hits across 13 rows, every row read. Cold archives 2026-06/07/08.json scanned on /OCR_TEXT_BACKEND|PADDLE|LANG-VI|TESSERACT/. Rejected as non-duplicates: OCR-PADDLE-VI-LANG-FIX-AND-REBENCH (done[], the benchmark that produced the swap rejection - measures paddle vs tesseract, holds no production baseline); DECISION-PDFX-OCR-TEXT-BACKEND-DEFAULT-FLIP-TO-AUTO (archive[], CANCELLED - a config decision, not a measurement); PROBE-PDFX-OCR-CONFIDENCE-SECOND-DOCUMENT-MARGIN (archive[], CANCELLED - discriminator margin, not extraction quality); FIX-BCTC-REFINE-DIACRITIC-COLLAPSE-A-BREVE-ACUTE (backlog[], BACKLOG, architect - one specific downstream refine-stage corruption, not a baseline). No row on any lane, hot or cold, holds a production extraction-quality baseline."
  }
]

# ---- signal_queue dispositions ----
| .signal_queue.rows |= (map(
    if .id == "rtr-20260826T0429-staleblockedstatusfreezesrows" then
      . + {status: "READ", po_disposition_20260826T0536Z: "ACTIONED WITH ONE CORRECTION. Five frozen rows unfrozen by hand (TASK-COWORK-CATCHUP-9 P0, VERIFY-FIX-COVERAGE-SWEEP-BLANKET-STAMP-REALDATA, FU-CHEF-MARKER-INFLOW, FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT, VERIFY-FIX-VPS-SSH-TRIGGER-FAIL-LOUD-REALDATA) and the class fix minted as FIX-DEVTEAM-BLOCKED-STATUS-FREEZES-ROWS-NO-CONSUMER-ALLOWLIST-ADMITS-IT. CORRECTION: devteam-eligibility.jq:117/:160 are NOT the gate - they are wip_in_progress/incident_wip_in_progress, which exclude BLOCKED from the WIP BUDGET and therefore FREE capacity. The real gate is eight POSITIVE status allowlists in the consumer scripts; the minted row carries the exact line references."}
    elif .id == "rtr-20260826T0431-invarianttestmissedretainedgoliterals" then
      . + {status: "READ", po_disposition_20260826T0536Z: "DEFERRED THIS TICK, NOT DECLINED. Real defect, but it is a kinh-dich zone matter with two named owning rows already on the board (FACTORY-KINHDICH-extract-hexagram-data, FACTORY-KINHDICH-add-data-invariant-test) and this tick's budget went to the BLOCKED-freeze class and the lang=vi ruling. Next PO tick: mint the dev-kinh-dich follow-up widening the invariant test to mapTrendToEnum's retained Go literals plus a golden-output assertion on /hexagram/N/explain, and flag qa that the first refactor commit was NOT lossless."}
    elif .id == "cj-20260826T043200" then
      . + {status: "RESOLVED", po_disposition_20260826T0536Z: "NO NEW ROW - premise already falsified on the board. The replace-vs-retire decision was made and then RETRACTED 2026-08-23T12:32Z: team-tool-recheck was REPLACED on 2026-08-06 by CHORE-TEAM-TOOL-RECHECK-LOCAL-CRON and is producing daily (docs/agents/agent-father/flow/team-tool-recheck.md on agent-father's 23 14 * * * cron). Surviving owner of the real defect is FIX-JANITOR-PRUNE-SWEEP-HARDCODED-DEAD-WRITER-PREMISE (backlog[], BACKLOG, P1, next_agent=developer, already dispatchable), whose AC1 gates the escalation on measured writer liveness. Re-emission of this signal is itself evidence for that row."}
    elif .id == "rtr-20260826T0435-datatiercyclewrotenorecord" then
      . + {status: "READ", po_disposition_20260826T0536Z: "DEFERRED THIS TICK, NOT DECLINED. HIGH severity and a genuine false-green of the detection layer, but it lands on an existing owner: FIX-AUDITOR-DATATIER-DURABLE-TRAIL-NARRATED-NUMBERS-CONTRADICT-OWN-EVIDENCE. Fold there rather than mint a fourth auditor-data-tier row - this is the third signal in the same family today (with rtr-20260826T0234, rtr-20260826T0336). Next PO tick: widen that row's ACs to cover replay-of-prior-entry-as-current, or mint one row that supersedes all three."}
    elif .id == "rtr-20260826T0505-dbintegrityhistorydoubleappend" then
      . + {status: "READ", po_disposition_20260826T0536Z: "DEFERRED THIS TICK, NOT DECLINED. Same family as rtr-20260826T0435; the row's own related field already names FIX-DBINTEGRITY-HISTORY-FINDINGS-MEMBERSHIP-FREE-JUDGMENT-AND-MULTITABLE-TABLE-FIELD as the owner. The double-append is chronic (6 sub-60s pairs in 200 entries, including a triple) and deserves a per-cycle idempotency guard, but it corrupts a trail, not production data. Bundle with the data-tier auditor cluster next tick."}
    elif .id == "rtr-20260826T0530-bugchannelnotifyonceabsent" then
      . + {status: "READ", po_disposition_20260826T0536Z: "DEFERRED THIS TICK, NOT DECLINED. Arrived mid-triage. Agreed on the framing - do NOT close by fixing the underlying push block, which is separately owned by FIX-PREPUSH-SIZELINT-BCTCSCALARAGGREGATOR-1206L-STRANDS-117-COMMITS. The notify-once/backoff contract is a real cross-cowork gap; next PO tick mints it as a single shared-contract row, not per-agent."}
    else . end))

# ---- durable inbox CLEAR (PO owns this unconditionally, main.md line 19) ----
| .dev_team_idle_chain.pending_triage_inbox = []
| .dev_team_idle_chain.pending_triage_inbox_cleared_at = now
| .dev_team_idle_chain.pending_triage_inbox_cleared_by = "po (triage-20260826T0536Z, 23 envelopes read)"

| .task_board.last_triaged_at = now
| .task_board.last_triaged_by = "po (triage-20260826T0536Z)"
| ._updated_at = now
| ._updated_by = "po (triage-20260826T0536Z)"
