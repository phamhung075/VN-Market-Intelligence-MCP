# po-s107 — promote 2 schema-vs-caller contract FIX tasks backlog→ready (WIP=0 → ≤2)
#
# Single-pass dual-promote triage for the dev-team cron tick 20260619T003100Z, run with WIP=0
# (ready=0, in_progress=0). Both tasks are the SAME CLASS: a live Zod schema requires a param
# the SSOT tool-doc marks optional/auto, every-cycle callers omit it → -32602 reject, disabling
# a data feed. Router RAW-probe + PO on-disk schema read confirmed both bugs are real.
#
# M1 — FIX-INSIDER-OUTSTANDINGSHARES-SCHEMA-DOC: backlog→ready (direct dev-mcp-server FIX).
#   Board row had WRONG zone (cross-service/) + WRONG files (the two flow .md, not the schema).
#   GROUND TRUTH (apps/mcp-server/src/interface/mcp/tools/sector/leadershipTools.ts L110-115):
#     code: z.string()             → REQUIRED
#     outstandingShares: z.number()→ REQUIRED (NO .optional)  ← doc get_insider_signals.md:18 says No/auto-fetch = LIES
#     windowDays, transactions     → optional
#   Both callers reject: eod.md:59 get_insider_signals(code="{TICKER}") omits outstandingShares;
#   stage-analyze.md:49 get_insider_signals() omits BOTH. Handler (L40-53) reads input.outstandingShares
#   with NO derive/fallback, and there is NO shares-lookup in mcp-server outside leadershipSignal.ts,
#   so the doc's "auto-fetch from BCTC" is UNWIRED. recon_first: dev confirms wire-auto-fetch vs
#   make-optional+reconcile-doc. Correct zone=apps/mcp-server/, files=schema+doc, priority P3→P2.
#
# M2 — FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT: backlog→ready as-is (SPRINT-S→architect).
#   GROUND TRUTH (agentSignalTools.ts L461-490): agent: z.string() REQUIRED even in the
#   sender-history/sibling-window mode where the tool description + doc L31 L-4 example OMIT it
#   (get_agent_signals(from_agent="news-scout",...)) → doc INTERNALLY contradictory → genuine
#   schema-vs-caller ambiguity → architect decides direction. owner=architect already set.
#   Promote to ready; router locks+spawns architect (recon_first).
#
# Both promotions idempotent (skipped if id already in ANY non-backlog lane).
# Harness: CONSERVATION (backlog −2, ready +2, in_progress/review/done/done_verified byte-stable,
#          total unchanged) + each promoted once + correct lane/status.
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" \
#          -f scripts/po-s107-insider-agentsignals-schema-contract-promote.jq \
#          docs/data/orch/orch-state.json
#        (atomic temp→[ -s ]→jq empty→conservation→rename; commit orch-state by EXPLICIT PATH).

def in_nonbacklog($id):
  ([ .task_board.ready[]?, .task_board.in_progress[]?, .task_board.review[]?,
     .task_board.done[]?, .task_board.done_verified[]? ]
   | map(.id // .task_id) | index($id)) != null;

def promote_insider:
  if in_nonbacklog("FIX-INSIDER-OUTSTANDINGSHARES-SCHEMA-DOC") then .
  else
    ( [ .task_board.backlog[] | select((.id // .task_id) == "FIX-INSIDER-OUTSTANDINGSHARES-SCHEMA-DOC") ][0] ) as $row
    | if $row == null then . else
        .task_board.backlog |= map(select((.id // .task_id) != "FIX-INSIDER-OUTSTANDINGSHARES-SCHEMA-DOC"))
        | .task_board.ready += [ $row
            + { status: "READY",
                priority: "P2",
                zone: "apps/mcp-server/",
                next_agent: "dev-mcp-server",
                recon_first: true,
                files: [
                  "apps/mcp-server/src/interface/mcp/tools/sector/leadershipTools.ts",
                  "apps/mcp-server/src/domain/services/leadershipSignal.ts",
                  "docs/agents/tools/list/get_insider_signals.md",
                  "docs/agents/market-watcher/flow/eod.md",
                  "docs/agents/bctc-analyst/flow/stage-analyze.md"
                ],
                desc: "get_insider_signals (pure classifier, leadershipTools.ts) — live Zod schema REQUIRES code AND outstandingShares (L110-115, NEITHER .optional), but tool-doc get_insider_signals.md:18 marks outstandingShares optional/'auto-fetch from BCTC'. Doc LIES → every-cycle -32602 reject. Confirmed callers: market-watcher/flow/eod.md:59 get_insider_signals(code=...) omits outstandingShares; bctc-analyst/flow/stage-analyze.md:49 get_insider_signals() omits BOTH code+outstandingShares. Handler L40-53 reads input.outstandingShares with NO derive/fallback; NO shares-lookup exists in mcp-server outside leadershipSignal.ts so the doc's auto-fetch is UNWIRED. ALSO callers pass no transactions[] → classifier returns empty anyway (mis-use of pure classifier; the DB-backed get_insider_transactions is the real fetch). RECON-FIRST then choose ONE direction: (A) make outstandingShares .optional + wire a shares lookup so auto-fetch is real, OR (B) make it optional + reconcile doc to state transactions[]+outstandingShares are caller-supplied and update both flows to pipe get_insider_transactions output. Either way reconcile the doc to the chosen contract. DoD: both flow call sites pass live Zod validation (no -32602); doc param table matches schema. agent-md-factory before editing flow .md.",
                generic_mandate: "Fix the contract at the SOURCE (schema + doc reconciliation) so no future caller hits the doc-vs-schema drift; do not leave the doc lying.",
                verification_gate: "LIVE: get_insider_signals called exactly as eod.md:59 + stage-analyze.md:49 call it returns 200 (no -32602); doc param table self-consistent with leadershipTools.ts schema.",
                triaged_at: $now,
                triaged_by: "po",
                promoted_at: $now,
                promoted_by: "po-s107",
                promote_note: "WIP=0 → promote; corrected zone cross-service/→apps/mcp-server/, files flow-md→schema source, priority P3→P2 (2 confirmed callers Zod-reject every cycle, health-recheck 3244 rates P1)."
              } ]
      end
  end;

def promote_agent_signals:
  if in_nonbacklog("FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT") then .
  else
    ( [ .task_board.backlog[] | select((.id // .task_id) == "FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT") ][0] ) as $row
    | if $row == null then . else
        .task_board.backlog |= map(select((.id // .task_id) != "FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT"))
        | .task_board.ready += [ $row
            + { status: "READY",
                next_agent: "architect",
                promoted_at: $now,
                promoted_by: "po-s107",
                promote_note: "WIP=0 → promote as SPRINT-S→architect; schema-vs-caller contract direction is a real decision (agent z.string() REQUIRED even in sender-history mode where description+doc L31 example omit it — doc internally contradictory). RAW-re-confirmed live schema agentSignalTools.ts L461-490. Router locks + spawns architect."
              } ]
      end
  end;

promote_insider
| promote_agent_signals
| .task_board.updated_at = $now
| .task_board.updated_by = "po-s107"
| .updated_at = $now
| .updated_by = "po-s107"
