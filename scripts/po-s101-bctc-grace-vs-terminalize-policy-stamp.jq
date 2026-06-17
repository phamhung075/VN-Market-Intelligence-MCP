# po-s101-bctc-grace-vs-terminalize-policy-stamp.jq
#
# Single-mutation PO PRODUCT-POLICY stamp (NO new task, NO lane move, WIP untouched):
# Attach a `po_policy_decision` object to the in_progress FIX-BCTC row resolving the
# grace-retry-vs-terminalize fork the dev-mcp-server agent was told to escalate.
# The two writers (TASK-1943a grace-period auto-reset vs FIX-BCTC terminalize) are
# mutually contradictory BY DESIGN — this is a product-policy call PO owns, not a
# code-only refactor. Records the binding stance so dev-mcp-server implements without
# guessing; keeps next_agent=dev-mcp-server (still their lane, still CHANGES_REQUESTED).
#
# Idempotent: guarded by absence of .po_policy_decision on the row (re-run mutates 0).
# Harness: CONSERVATION (all lane lengths byte-stable — pure in-place field add to ONE
#   in_progress row) + PLACEMENT (row stays in_progress, status CHANGES_REQUESTED,
#   next_agent dev-mcp-server) + IDEMPOTENCY (re-run delta 0).
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s101-bctc-grace-vs-terminalize-policy-stamp.jq \
#      docs/data/orch/orch-state.json
#   (atomic temp -> [ -s ] -> jq empty -> conservation -> placement -> rename;
#    commit orch-state by EXPLICIT PATH; PUSH HELD — PO out-of-band)

def TARGET: "FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH";

(.task_board.in_progress |= map(
  if (.id == TARGET) and (has("po_policy_decision") | not)
  then . + {
    po_policy_decision: {
      decided_at: $now,
      decided_by: "po-s101",
      question: "grace-retry (TASK-1943a auto-reset url_not_found->pending) vs terminalize (FIX-BCTC) — mutually contradictory by design; dev-mcp-server escalated as possible policy fork.",
      verdict: "TERMINALIZE WINS. Genuinely-absent rows MUST stay terminal. The grace-period's only legitimate purpose is a filing that appears LATE — that is served by a BOUNDED retry window, NOT by infinite re-pending. TASK-1943a's blanket 'reset Q1-2026 url_not_found rows to pending' defeats the entire SLA and is the live root of the unbounded consecutive_zero_cycles=235 oscillation.",
      directives: [
        "1. BOUND the grace-period: a row may be auto-reset url_not_found->pending at most a FINITE number of times (default: grace_max_resets=2) AND only within a finite age window (default: grace_window_days=14 from first_attempt). Track per-row grace_reset_count.",
        "2. RESPECT terminal at exhaustion: once a row hits MAX enricher attempts AND grace exhausted (grace_reset_count>=grace_max_resets OR age>grace_window_days), it stays url_not_found TERMINAL. No further reset. This is the correct steady state for a genuinely-absent filing.",
        "3. The enricher terminalize branch (verified executing) is CORRECT — do NOT change it. The fix is to the CONFLICTING WRITER (TASK-1943a reset path: bctcQueueEnricherJob.ts Arm2 :270/:426 + schema-financial-reports.ts:695): gate its reset on the bounded counter/window above.",
        "4. GENERALIZE the date-literal: TASK-1943a hardcodes 'Q1-2026'. Replace with the current-quarter computed at runtime (no date literal) — /goal#2.",
        "5. SECONDARY (separate from policy): de-conflict the enricher DOUBLE-FIRE (each ticker logged 2x/cycle). This is the ARCH-CRON node-cron silent-misfire class (sibling in_progress lane ARCH-CRON-SCHEDULER-RELIABILITY) — if a quick per-job same-UTC-cycle dedup guard closes it in-zone, do it here; otherwise note it for the ARCH-CRON lane and do not block this fix on it."
      ],
      bounded_defaults_rationale: "grace_max_resets=2 and grace_window_days=14 are PO defaults (filings that slip past their due date almost always appear within 2 weeks). dev-mcp-server may surface these as config constants; do NOT make them infinite. A genuinely-absent row terminalizing is the CORRECT outcome, not a failure.",
      done_verified_gate: "Live DB: the 8 rows (BDI,DAG,DLC,JSH,SIS,VDC,VNH,VEA) reach url_not_found and STAY terminal across >=3 consecutive enricher cycles (no oscillation back to pending/attempts=0); consecutive_zero_cycles stops climbing / bctc SLA no longer FALSE-CRITICAL.",
      ownership: "Code implementation stays dev-mcp-server (next_agent unchanged). This stamp removes the policy ambiguity ONLY — no architect needed; the scheduler double-fire is the only architect-adjacent piece and is already tracked in the ARCH-CRON lane."
    }
  }
  else . end
))

# placement assertion — fail closed if the row drifted out of in_progress / lost its status
| ( [ .task_board.in_progress[] | select(.id == TARGET) ] ) as $t
| if ($t | length) != 1
  then error("PLACEMENT: target not uniquely in in_progress (found \($t|length))")
  elif ($t[0].status != "CHANGES_REQUESTED")
  then error("PLACEMENT: status drifted from CHANGES_REQUESTED -> \($t[0].status)")
  elif ($t[0].next_agent != "dev-mcp-server")
  then error("PLACEMENT: next_agent drifted from dev-mcp-server -> \($t[0].next_agent)")
  elif ($t[0] | has("po_policy_decision") | not)
  then error("PLACEMENT: po_policy_decision not present after stamp")
  else . end
