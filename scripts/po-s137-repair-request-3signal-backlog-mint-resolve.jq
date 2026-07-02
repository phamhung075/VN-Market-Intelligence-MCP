# po-s137 — repair_task_request drain triage (dev-team tick 2026-07-02T02:37Z)
#
# Single-pass DUAL-mutation, idempotent:
#   M1  id-guarded MINT of 3 repair_task_request backlog rows → .task_board.backlog[]
#       (skip any id already present in ANY task_board array lane).
#   M2  RESOLVE their 3 source signal rows in .signal_queue.rows[] (status-guard:
#       only NEW/READ flip → RESOLVED, so re-run mutates 0). RESOLVED (not TRIAGED)
#       is the cold-evictable terminal per signal-dashboard PRUNE criteria.
#
# Reusable pattern: "N repair_task_request signals drained → mint each as a
# PLAN-ONLY backlog FIX (po→ba→pm→dev chain) + resolve its source row, atomic".
# Per docs/agents/po/flow/triage-signals.md § repair_task_request routing row.
#
# Atomic write is done by scripts/orch-apply.sh (Zod + dup-key + CAS-mtime + rename).
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s137-repair-request-3signal-backlog-mint-resolve.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

# --- existing ids across every task_board array lane (dedup guard) ---
([.task_board | to_entries[] | select(.value | type == "array") | .value[]
  | select(type == "object") | .id]) as $ids

# --- candidate mints (PLAN-ONLY backlog FIX rows) ---
| ([
    {
      id: "FIX-SIGNAL-ROUTING-ROWS-COVERAGE-GAP-DEEPDIVE",
      title: "FIX — add routing rows for signal types data-coverage-gap (→ops) + deep_dive_result (→po) in drain-signals.md §0a-3 + po/triage-signals.md (both currently hit the generic catch-all)",
      owner: "po",
      status: "BACKLOG",
      zone: "cross-service",
      priority: "low",
      type: "FIX",
      next_agent: "agent-father",
      created_at: $now,
      status_note: "AC: docs/agents/dev-team/flow/drain-signals.md §0a-3 AND docs/agents/po/flow/triage-signals.md each carry an explicit routing row for type=data-coverage-gap (route→ops) and type=deep_dive_result (route→po) with a defined action. A live deep_dive_result signal (bca-ddres-20260630T2258) already hit the catch-all — no silent loss but no automated action. Priority: INFO/low. Source signal: qa-followup-signal-routing-rows-20260702 (dev-team/qa-gate). Route: agent-father (agent-flow-doc edit)."
    },
    {
      id: "FIX-BCTC-ANALYST-STAGELOG-NOTIFY-NO-BASH",
      title: "FIX — bctc-analyst stage-log-notify.md L39-49 (wc -l AC-5 check + git add/commit) are Bash blocks the no-Bash analyst package cannot run; routine notebook-commit stage silently unexecutable",
      owner: "po",
      status: "BACKLOG",
      zone: "cross-service",
      priority: "low",
      type: "FIX",
      next_agent: "agent-father",
      created_at: $now,
      status_note: "AC: docs/agents/bctc-analyst/flow/stage-log-notify.md carries ZERO Bash blocks — convert L39-42 (wc -l AC-5 sanity), L45-49 (git add/commit stage 5d), and the date -u idiom (L12-14) to Read/Write/call_tool steps OR reassign the notebook-commit stage to a Bash-capable path. DISTINCT from DONE FIX-BCTC-ANALYST-ESCALATION-DISPATCH-NO-BASH (that fixed escalation-dispatch, NOT the routine notebook commit). Latent defect predates 881e38f1. Priority: INFO/low. Source signal: qa-followup-stagelog-bash-nobash-agent-20260702 (dev-team/qa-gate). Route: agent-father (agent-flow-doc + tool-package)."
    },
    {
      id: "FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP",
      title: "FIX — rag-service chronic clean-exit restart loop: RestartCount=226 (~10/day, 3-week container life); ExitCode=0 OOMKilled=false → process self-exits + restart-policy relaunches; passive health masks churn. RECURRING (prior watch signals @100/@A21)",
      owner: "ops",
      status: "BACKLOG",
      zone: "apps/rag-service/",
      priority: "medium",
      type: "FIX",
      next_agent: "ops",
      created_at: $now,
      status_note: "AC: root-cause WHY the rag-service main process exits cleanly (ExitCode=0) ~10x/day and STOP the climb (fix the self-exit OR make the exit intentional+documented so RestartCount stabilizes); surface the churn past passive health checks. RECURRING: prior watch-only signals router-20260620T113917Z-rag-restart-watch + sau-c369-A21-rag-restart-100 (RestartCount=100) both TRIAGED with no root-cause task — count grew 100→226. DISTINCT from FU-RAG-DEPLOY-MEMORY (deploy-vs-16GB tradeoff, architect decision) + RAG-SERVICE-AVAIL-01-FIX (undeployed-by-design identification) — do NOT change rag deploy status here. Priority: WARN/medium. Source signal: rag-service-crashloop-restartcount-20260702 (dev-team/router-verify)."
    }
  ] | map(select(.id as $id | ($ids | index($id)) | not))) as $mints

# --- source signal ids to resolve ---
| (["qa-followup-signal-routing-rows-20260702",
    "qa-followup-stagelog-bash-nobash-agent-20260702",
    "rag-service-crashloop-restartcount-20260702"]) as $resolve_ids

# --- M1: append id-guarded mints to backlog + stamp board metadata ---
| .task_board.backlog += $mints
| .task_board._updated_at = $now
| .task_board._updated_by = "po"

# --- M2: resolve source signals (status-guard NEW/READ → RESOLVED; idempotent) ---
| .signal_queue.rows |= map(
    if (.id as $rid | ($resolve_ids | index($rid))) and (.status == "NEW" or .status == "READ")
    then .status = "RESOLVED" | .resolved_by = "po" | .resolved_at = $now
    else . end
  )
| .signal_queue._updated_at = $now
| .signal_queue._updated_by = "po"
| .signal_queue.last_triaged_at = $now
| .signal_queue.last_triaged_by = "po"
