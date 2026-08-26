# po-release-20260826T1734Z-pdfx-ac7-gate.jq
#
# ONE-SHOT dated actuator (same class as po-triage-20260826T0536Z-*.jq /
# router-supersede-20260826T0850Z-pdfx-gate-prose.jq). Pointer:
# docs/agents/po/flow/scripts-registry.md.
#
# PURPOSE: release the four PDFX rows frozen behind
# next_recheck_not_before=2026-08-26T17:11:00Z, and record the AC-7 sampler
# RESULT on the row that owns it.
#
# WHY A HAND ACTUATOR: status=BLOCKED is admitted by NO consumer allowlist, and
# next_recheck_not_before is read by exactly one consumer
# (scripts/devteam-review-claim-qa-drain.jq, candidate lanes review[] UNION
# done[]) which never sources backlog[]. So these rows had no automatic release
# path at all. Structural fix is tracked at
# FIX-DEVTEAM-BLOCKED-STATUS-FREEZES-ROWS-NO-CONSUMER-ALLOWLIST-ADMITS-IT.
#
# DISCIPLINE: status=BLOCKED is NOT reinstated anywhere here. Every residual
# gate is re-encoded as a real `depends_on`/`depends` edge, which
# scripts/lib/devteam-eligibility.jq `deps_satisfied()` honours across all four
# pickers and which has a real completion event. No lane moves, no `.head`
# write (INV-GATEWAY-1 — head is the dispatching session's exclusive duty).
#
# Usage:
#   jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" -f scripts/po-release-20260826T1734Z-pdfx-ac7-gate.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def NOW: $now;
def BY:  "po/release-20260826T1734Z";

def release:
  . + { status: "BACKLOG", updated_at: NOW, updated_by: BY }
  | del(.next_recheck_not_before);

.task_board.backlog |= map(
  if .id == "MEASURE-PDFX-BCTC-QUALITY-TESSERACT-VIE-PRODUCTION-BASELINE" then
    release
    | .depends_on = ((.depends_on // []) + ["UNBLOCK-PDFX-OPS-DEPLOY-AND-BURST-MEASUREMENT"] | unique)
    | .po_release_20260826T1734Z =
        ("RELEASED — BLOCKED->BACKLOG. 17:11Z gate DISCHARGED: AC-7 series complete/intact (148 samples 05:11:30Z-17:25:12Z, container 417febec1a03, RestartCount=0) and VN market shut. depends_on FIX-PDFX-PEK-EXTRACT-202 verified DONE_VERIFIED. NEW REAL DEP, replacing the dead BLOCKED freeze: UNBLOCK-PDFX-OPS-DEPLOY-AND-BURST-MEASUREMENT. Reason, binding: AC-3 must name the image id + git_sha, and po_correction_20260826T0604Z requires the baseline to name the BCTC_MAX_PADDLE_RESCUE_FIRES_PER_DOCUMENT in force. That constant ships in 1db5f9f81, which is NOT in the running image — so a baseline measured today would describe a configuration (unbounded rescue fires, git_sha label 'unknown') that ceases to exist at the next rebuild, and would not be comparable with DECIDE's AC-3/AC-4 which mandate a post-1db5f9f81 image on the SAME document set. Rebuild first, then measure. AC-1's 09:00Z floor is spent; the 02:00-08:59Z weekday bar is PERMANENT and no picker can see it — do not dispatch inside it.")
  elif .id == "DECIDE-PDFX-OCRWORKER-PAGE-RESCUE-LIVE-UNMEASURED-QUALITY-PATH" then
    release
    | .po_release_20260826T1734Z =
        ("RELEASED — BLOCKED->BACKLOG. The clock gate is spent; the REAL gate is and always was depends_on MEASURE-PDFX-BCTC-QUALITY-TESSERACT-VIE-PRODUCTION-BASELINE, which deps_satisfied() enforces on its own. DEFERRED-NOT-DECLINED stands unchanged: PO still cannot rule on whether the rescue stays or what the fire budget should be, because the measurement does not exist. NEW HARD INPUT for AC-5/AC-6, measured this window, do not re-derive: an ordinary concurrent BCTC workload (POST /extract burst 14:02-14:15Z with 8x 429 Too Many Requests, plus a 61-page pek-extract at 14:46:18Z) drove cgroup memory.current to 2,681,626,624 B at 14:04:15Z — 2,727,936 B (2.6 MiB) under the 2,684,354,560 B cap, i.e. 99.90%. 894 memory.events.max increments, all inside 14:04-14:49Z; oom=0 and oom_kill=0 on all 148 samples; anon fully returned (1.384 GiB at 14:54Z, below the 1.577 GiB pre-burst rest). Read it correctly: zero OOM kills is NOT headroom. Measured headroom for any NEW in-container allocator on the current image is ~2.6 MiB at peak, so AC-5 must sweep against that ceiling, not against a nominal 2.5 GiB. STALE PREMISE, do not re-import: 'ocr_worker.py emits zero log lines' was RETRACTED BY ITS OWN PRODUCER (signal rtr-20260826T0639-ocrworkerloggingnotobservable); logging is configured at infrastructure/lifespan.py:37 and the module is IDLE, not dark.")
  elif .id == "FIX-PDFOCR-ORIENTATION-CORPUS-79-FILES-312-PAGES-SWEEP-REVERTED-BY-DB-RESTORE" then
    release
    | .depends = ((.depends // []) + ["FIX-SQLITE-DOCKER-VIRT-CORRUPTION-ROOT-CAUSE-INVESTIGATION"] | unique)
    | .po_release_20260826T1734Z =
        ("RELEASED FROM THE CLOCK, STILL GATED ON DB HEALTH — and the DB gate is now honest. blocked_reason gate (2) VN MARKET HOURS: spent for today, permanent for 02:00-08:59Z weekdays. blocked_reason gate (1) DB HEALTH: NOT discharged. The restore row FIX-MARKETDB-20260826-RESTORE-... is status=DONE (not DONE_VERIFIED) in done[], so deps_satisfied() already holds this row; more importantly the substantive bar is the CORRUPTION QUESTION, and the restore row's own status_note hands that off — 'Next: architect investigates FIX-SQLITE-DOCKER-VIRT-CORRUPTION root cause'. That row is READY, next_agent=developer, OPEN. This sweep firing many back-to-back write transactions in a 4-minute window is the probable proximate trigger of the 2026-08-26 corruption, so re-running it before the root cause is known risks a second corruption of a database restored only hours ago. FIX-SQLITE-DOCKER-VIRT-CORRUPTION-ROOT-CAUSE-INVESTIGATION is therefore ADDED to .depends — a real edge with a real completion event, replacing a status=BLOCKED freeze that had none. This row must NOT be dispatched on the clock alone.")
  elif .id == "FIX-BCTC-CTG-BALANCE-SHEET-REFINE" then
    release
    | del(.blocked_on)
    | .po_release_20260826T1734Z =
        ("RELEASED — BLOCKED->BACKLOG, and its two stale gates are both discharged on live evidence. (1) blocked_on 'gateway-blind defect — fresh agentic-refine pass requires mcp__gateway__call_tool to be reliably available' (filed 2026-07-10) is DEAD: probed live 2026-08-26T17:32Z through mcp__gateway__call_tool(server=vn-market), got a real payload back. Field DELETED so no reader can re-honour it; this note is the provenance. (2) depends_on TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD resolves DONE_VERIFIED and is KEPT, not stripped. It is absent from every live task_board lane but present in docs/data/orch/archive/2026-07.json .done_tasks[181], and dep_status_map($archive) has resolved cold-archived deps since FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING (2026-07-28); all four pickers thread --slurpfile archive. Verified by running the real scripts/lib/devteam-eligibility.jq: deps_satisfied=true. Pointing at an archived id is CORRECT here — stripping it would destroy provenance for zero mechanical gain. RESIDUAL, unchanged: verifying a CTG balance-sheet refine means running the extractor, so the permanent 02:00-08:59Z weekday bar applies and no picker can see it.")
  else . end
)

| .task_board.ready |= map(
  if .id == "UNBLOCK-PDFX-OPS-DEPLOY-AND-BURST-MEASUREMENT" then
    . + { next_agent: "ops", updated_at: NOW, updated_by: BY }
    | .po_ac7_result_20260826T1734Z =
        ("AC-7 WINDOW CLOSED — RESULT (po 2026-08-26T17:34Z; this row's non_goals says measurement results belong here). SERIES COMPLETE AND INTACT: 148 samples 05:11:30Z-17:25:12Z (12h13m >= the required 12h), container 417febec1a03 on every row, RestartCount=0, StartedAt 00:33:39Z predates sample 1 — no 5th recreation. NUMBERS, cgroup only: memory.current 1,689,071,616 B -> 2,288,406,528 B; PEAK 2,681,626,624 B at 14:04:15Z = 2,727,936 B under the 2,684,354,560 B cap (99.90%). memory.events.max 1645 -> 2539, and ALL +894 increments fall in 14:04:15Z-14:49:30Z — flat before, flat after: one episode, not a ramp. oom=0, oom_kill=0 on all 148. Anon returned fully (1.384 GiB at 14:54Z, under the 1.577 GiB pre-burst rest). CAUSE, from the container log: POST /extract burst 14:02-14:15Z with 8x 429 Too Many Requests (concurrency semaphore saturated) plus POST /pek-extract 14:46:18Z on 61-page CTG_2025_Q4. The window was therefore NOT passive — it captured a real concurrent workload, which makes it more informative than specified. RULING: 0 OOM kills is NOT evidence of headroom; an ordinary workload reached 99.90% of cap on the CURRENT image, leaving ~2.6 MiB at peak. REBUILD AUTHORISED as of 17:11Z, scope per po_rebuild_scope_20260826T0604Z (must carry 1db5f9f81). BEFORE rebuilding, kill scripts/pdf-extractor-cgroup-sampler.sh (PID 86980): it is `while true` with NO stop condition and re-resolves the container id every loop, so it will silently follow the new container into the same CSV. Analyse rows <= 2026-08-26T17:25:12Z only. next_agent po->ops: AC-1 is a rebuild and this row's own title says Docker/infra is out of the dev charter; owner was already ops. AC-6 unchanged — ops hands the numbers back and PO closes.")
  else . end
)
