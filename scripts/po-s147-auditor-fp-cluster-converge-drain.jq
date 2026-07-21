# po-s147-auditor-fp-cluster-converge-drain.jq
# ─────────────────────────────────────────────────────────────────────────────
# Single consolidating drain of the recurring system-auditor A-12/A-20/A-30 FP
# cluster + the CONVERGE mint that stops the churn-without-convergence.
#
# ORIGIN 2026-07-21 (po-s147): router CONVERGE directive. 40 NEW system-auditor→po
# signal_queue rows accreted this session (~30 Tier-1 cycles, unchanged evidence),
# dominated by one recurring FP cluster. Fold each to its EXISTING tracked backlog
# home as corroboration (dedup, NO new backlog mint for the folded findings),
# transition drained rows NEW→triaged, and MINT the single convergent predicate-tune
# fix (past the 3rd-consecutive-tick bar — feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn
# + feedback_recurring_bug_escalation).
#
# IDEMPOTENT: M1 guarded by status==NEW; M2..M5 marker-guarded (has(..)|not) /
# unique-append; M6 id-guarded across ALL lanes → re-run mutates 0.
# ALL WRITES route through scripts/orch-apply.sh (Zod + dup-key + conservation + CAS + atomic).
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s147-auditor-fp-cluster-converge-drain.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# ─────────────────────────────────────────────────────────────────────────────

def A20_ROWS: [
  "sys-20260721T031138-141a","sys-20260721T034145-493a","sys-20260721T041225-6b52",
  "sys-20260721T041242-16e5","sys-20260721T044149-461f","sys-20260721T044155-7aaf",
  "sys-20260721T051137-4687","sys-20260721T051144-7ea3","sys-20260721T054221-5597",
  "sys-20260721T054222-6172","sys-20260721T064141-5423","sys-20260721T064146-3c46",
  "sys-20260721T071130-1c22","sys-20260721T074140-6ec7","sys-20260721T081202-1bab",
  "sys-20260721T084140-2d4b","sys-20260721T091226-578a","sys-20260721T101144-7e1c",
  "sys-20260721T104145-0606","sys-20260721T111159-22e6","sys-20260721T114143-01c7",
  "sys-20260721T121212-71e0","sys-20260721T124220-4a57","sys-20260721T131200-4359",
  "sys-20260721T134147-7b2f","sys-20260721T141213-26f0"
];
def A12_ROWS: [
  "sys-20260721T031143-17f5","sys-20260721T034143-2d83","sys-20260721T054134-1fd2",
  "sys-20260721T064152-1453","sys-20260721T091219-684e","sys-20260721T094200-2cae",
  "sys-20260721T141203-40b0"
];
def A30_ROWS: [
  "sys-20260721T121206-39c4","sys-20260721T124212-7cef","sys-20260721T131202-52c1",
  "sys-20260721T134152-6df8","sys-20260721T141218-70cb"
];
def B_ROWS: [ "sys-20260721T063301-43cf","sys-20260721T063307-62d9" ];

def home($id):
  if   (A20_ROWS|index($id)) != null then "PDF-AVAIL-02-FIX"
  elif (A12_ROWS|index($id)) != null then "SPIKE-DASHBOARD-TIER-HEALTH-CURL-ERR-FLAP"
  elif (A30_ROWS|index($id)) != null then "FIX-MCP-MEMORY-CODE-LEAK"
  elif (B_ROWS  |index($id)) != null then "transient-self-resolved"
  else null end;

# ── M1: drain the 40 NEW system-auditor→po rows → triaged (folded to home) ──
.signal_queue.rows |= (map(
  if (.status=="NEW" and .from=="system-auditor" and .to=="po" and (home(.id) != null))
  then . + {
    status:        "triaged",
    triaged_at:    $now,
    triaged_by:    "po-s147-auditor-fp-converge-drain",
    triaged_home:  (home(.id)),
    drain_note: (
      if (home(.id)) == "transient-self-resolved"
      then "single-occurrence data_stale @06:33Z, NOT re-emitted across ~16 subsequent Tier-1 cycles → self-resolved transient (B-06 loosely corroborates the pdf-extractor/VPS degradation window). No mint (resolved transient)."
      else "recurring auditor FP / known-tracked finding folded to " + (home(.id)) + " as corroboration (dedup, no new backlog mint). po-s147 converge drain."
      end)
  }
  else . end
))
| .signal_queue.last_triaged_at = $now
| .signal_queue.last_triaged_by = "po-s147-auditor-fp-converge-drain"
| .signal_queue._updated_at     = $now
| .signal_queue._updated_by      = "po-s147-auditor-fp-converge-drain"

# ── M2..M5: fold corroboration into the EXISTING backlog homes (in-place, marker-guarded) ──
| .task_board.backlog |= (map(
    if .id=="PDF-AVAIL-02-FIX" and (has("po_corroboration_20260721_pm")|not)
    then . + {po_corroboration_20260721_pm: ("HIGH-WATER CORROBORATION (PO converge-drain po-s147 " + $now + "): +26 more A-11/A-15/A-20 pdf-extractor event-loop-stall rows this session 2026-07-21T03:11Z..14:12Z (0/3 multi-probe, HTTP 000). SAME continuous outage — recurring_bug_count HELD at 6 (same episode, not a new one). Fix COMMITTED c78839c6c; DEPLOY user-gated (PO cannot authorize the rebuild). VPS-side B-06 '3/5 down' @06:33Z = single-occurrence VPS view of the same wedge (not re-emitted). DO NOT restart (re-wedges on next long PDF). Detection-only — no infra action.")}

    elif .id=="FIX-MCP-MEMORY-CODE-LEAK" and (has("po_corroboration_20260721")|not)
    then . + {po_corroboration_20260721: ("CORROBORATION / high-water (PO converge-drain po-s147 " + $now + "): 5 A-30 mcp-server MemPerc samples this session 94.43→90.58→88.38→88.53→88.81% — reclaimed from peak, WITHIN the documented 85–93% GC-sawtooth band, NO OOM, tripwire UNtripped (no OOMKilled, no >93%-no-dip, no >97%-sustained). Benign leak episode already tracked here → NO new mint. DO NOT escalate to ops; DO NOT recommend a restart (would destroy trajectory evidence for zero OOM-risk benefit — feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn).")}

    elif .id=="SPIKE-DASHBOARD-TIER-HEALTH-CURL-ERR-FLAP"
    then ( (.origin_signal_ids = (((.origin_signal_ids // []) + A12_ROWS) | unique))
           | (if (has("po_corroboration_20260721")|not)
              then . + {po_corroboration_20260721: ("CORROBORATION (PO converge-drain po-s147 " + $now + "): +7 more A-12 frontend:3001 / api-gateway:4000 CURL_ERR health-probe flaps this session 03:11Z..14:12Z, still CURL_ERR (transport error, NOT HTTP-5xx) while the MCP serving path (gateway→vn-market) stayed healthy every tick → strengthens the probe-side-FP hypothesis this SPIKE exists to isolate. 7 origin ids appended. Still plan-only, supervised.")}
              else . end) )

    elif .id=="FIX-SIGNALQUEUE-DUP-ID-GUARD" and (has("scope_extension_20260721")|not)
    then . + {scope_extension_20260721: ("SCOPE FOLD — improvement_proposal home (PO converge-drain po-s147 " + $now + "): route the auditor signal_queue COLLAPSE-to-single-upserted/last-seen-bumped row (for persistent findings, instead of N append-always NEW→po rows) + the auditor [OUTPUT-CONTRACT] rows_written SELF-TALLY-FIX (non-deterministic 0-when-actually-2 — feedback_auditor_signalqueue_append_always_telegram_only_dedup) into this row's scope. NON-URGENT: data is correct; the append-always E-3 ledger contract is PRESERVED (never skip row-minting) — only persistent-finding rows collapse/upsert for queue readability + PO triage load, and the self-report count is made honest. Route as improvement_proposal to agents-architect at implementation.")}

    else . end
  ))

# ── M6: MINT the single convergent predicate-tune fix (id-guarded across ALL lanes) ──
| ( ( [ .task_board | (.backlog,.ready,.review,.done,.done_verified,.in_progress,.qa)[]? | select(type=="object") | .id ]
      + [ .task_board.active_sprints[]?.tasks[]? | select(type=="object") | .id ]
      + [ .task_board.closed_sprints[]?.tasks[]? | select(type=="object") | .id ] ) ) as $allids
| if ($allids | index("FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE")) != null
  then .
  else .task_board.backlog += [ {
    id: "FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE",
    type: "FIX",
    status: "BACKLOG",
    priority: "high",
    size: "M",
    zone: "multi",
    owner: "architect",
    next_agent: "architect",
    plan_only: true,
    supervised: true,
    created_at: $now,
    created_by: "po-s147-auditor-fp-converge-drain",
    title: "FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE — tune system-auditor health-check predicates so benign A-12/A-21/A-30 conditions stop re-emitting as fresh NEW→po signals every Tier-1 cycle (churn-without-convergence stopper)",
    problem: "A-12/A-20/A-30 (+A-21) re-emit as fresh NEW system-auditor→po signal_queue rows EVERY ~30min Tier-1 cycle all session with unchanged evidence — ~40 NEW rows accreted this session over ~30 cycles, well past the 3rd-consecutive-tick convergence bar. Folding an Nth time = churn-without-convergence. This mint STOPS the FP re-emission at the DETECTION source.",
    scope: [
      "A-30 (mcp-server MemPerc): raise the WARN threshold above the documented 85–93% GC-sawtooth band AND gate on LOSS-OF-RECLAMATION / OOMKilled — NOT a single MemPerc snapshot. Model on the multi-probe reclamation check (07-19 RAW verify: 6 probes/65s caught GC dips). A benign in-band sawtooth must produce NO anomaly row.",
      "A-12/A-04/A-13 (frontend:3001 / api-gateway:4000 health CURL_ERR): DEBOUNCE / flap-suppress — require N-consecutive failed probes before classifying a CURL_ERR (transport error, not HTTP-5xx) as a degradation. A single transient transport flap must not route a NEW→po signal.",
      "A-21 (mcp-server RestartCount): WINDOWED / crash-only — RestartCount is CUMULATIVE-since-creation, not a crashloop. Model on mcp-server's own restartCadenceAlertJob.ts (rate-in-window, LastExitCode/OOMKilled gate).",
      "dedup-ledger SUPPRESSES RE-EMISSION: for a finding whose dedup_key already holds an open ledger entry AND a tracked backlog home exists, the auditor must NOT re-route it as a fresh actionable NEW→po signal each cycle — bump a last-seen/high-water field on the existing row instead."
    ],
    hard_constraint: "PRESERVE the E-3 append-always observation-ledger contract (docs/agents/system-auditor/init.md:38 / flow/main.md:632 — 'Always append to signal_queue regardless of dedup'). This fix reduces FALSE-POSITIVE firing + collapses persistent-finding re-emission; it must NEVER instruct the auditor to skip minting a GENUINE new anomaly (feedback_auditor_signalqueue_append_always_telegram_only_dedup). The queue collapse-to-single-row + rows_written tally readability part is SEPARATE — folded into FIX-SIGNALQUEUE-DUP-ID-GUARD (non-urgent).",
    genuine_tripwire_preserved: "A-30 MUST still fire on OOMKilled=true OR mem >~93% baseline with NO reclamation dips across all samples OR peak sustained >97% with no reclaim (mcp-server OOM = fleet-wide gateway outage). A-12 MUST still fire on a sustained (debounced) real outage. A-20 pdf-extractor wedge is a GENUINE persistent finding (tracked PDF-AVAIL-02-FIX) — NOT in scope to suppress its detection, only to collapse its re-emission.",
    acceptance: "After the tune: a full Tier-1 cycle with mcp-server mem in-band (85–93% sawtooth, reclaiming) + a single transient A-12 CURL_ERR + cumulative-but-stable A-21 RestartCount produces ZERO new NEW→po signal_queue rows for those checks, WHILE a synthetic OOMKilled / >97%-no-reclaim / N-consecutive-A-12-fail still emits.",
    verification_gate: "≥3 consecutive live Tier-1 cycles show 0 new A-12/A-21/A-30 NEW→po rows in signal_queue (jq delta) AND a synthetic OOMKilled/sustained-no-reclaim probe still emits an A-30 anomaly. Detection-only fix — NO deploy/restart of any monitored service by this task.",
    refs: [
      "feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn",
      "feedback_auditor_signalqueue_append_always_telegram_only_dedup",
      "feedback_recurring_bug_escalation",
      "project_systemic_review_0704_churn_without_convergence"
    ],
    recurring_bug_count: 3,
    note: "Minted on the explicit router CONVERGE directive (3rd+ consecutive-tick re-emit; PO recorded these plan-only twice prior and did NOT mint — this converge mint ends that cycle). supervised:true blocks BOUNDED-1 idle auto-pickup; owner=architect designs the predicate + dedup-suppression across the auditor flow-doc thresholds + any mcp-server health-job code, then agent-father/dev implements. PO does NOT write the predicate code. Detection-only — no deploy."
  } ]
  end
