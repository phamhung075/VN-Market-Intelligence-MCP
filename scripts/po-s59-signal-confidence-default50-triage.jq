# po-s59-signal-confidence-default50-triage.jq
# Single-task FIX triage: id-guarded PROMOTE of FIX-SIGNAL-CONFIDENCE-DEFAULT-50
# into .task_board.ready[] with full spec (root_cause/fix_spec/generic_mandate/
# verification_gate/recon mandate). Skipped if id already present in ANY board array.
#
# Origin: 2026-06-15 user BUG report — dashboard "SIGNALS (LAST 10)" shows
# Confidence=50% on EVERY row across every source. Router RAW-verified root cause:
# confidence_score is a schema-backed column (DEFAULT 50) but ~12 of 13 signal
# producers post WITHOUT wiring their already-computed confidence → constant 50.
# Smoking gun: intelligenceCycleJob.ts:1290 posts verified_chain with chain.conviction
# >=0.7 in scope yet omits confidence_score from the postSignal call.
#
# Class: "computed-but-not-wired default never overridden -> non-empty but wrong".
#
# Usage:
#   NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
#   jq --arg now "$NOW" -f scripts/po-s59-signal-confidence-default50-triage.jq \
#     docs/data/orch/orch-state.json > /tmp/orch.new \
#     && [ -s /tmp/orch.new ] && jq empty /tmp/orch.new \
#     && mv /tmp/orch.new docs/data/orch/orch-state.json
# Commit orch-state by EXPLICIT PATH.

def already_present($id):
  [.task_board[]? | arrays | .[]? | objects | .id] | any(. == $id);

if already_present("FIX-SIGNAL-CONFIDENCE-DEFAULT-50") then .
else
  .task_board.ready += [{
    id: "FIX-SIGNAL-CONFIDENCE-DEFAULT-50",
    type: "FIX",
    priority: "P1",
    status: "READY",
    route_to: "dev-mcp-server",
    zone: "apps/mcp-server/",
    mode: "recon-first",
    title: "Signal confidence_score frozen at default 50 for ~12 of 13 producers",
    desc: "Dashboard SIGNALS(LAST 10) shows Confidence=50% on every row across every source (verified_decision, cascade, news, BCTC, kinh-dich) and every direction/date. confidence_score is a real schema-backed column but producers post without wiring their already-computed confidence -> stored literal default 50. The metric is dead (constant 50).",
    root_cause: {
      class: "computed-but-not-wired: default never overridden -> non-empty but wrong",
      default_sites: [
        "apps/mcp-server/src/infrastructure/db/agentSignalStore.ts:341 — _postSignalInner destructures confidence_score = 50",
        "apps/mcp-server/src/infrastructure/db/schema-news.ts:104 — ALTER TABLE agent_signals ADD COLUMN confidence_score INTEGER DEFAULT 50",
        "apps/mcp-server/src/interface/mcp/server.ts:1393 — dashboard read: confidence_score: row.confidence_score ?? 50"
      ],
      only_correct_producer: "apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts:361 (confidence_score: confidence) — 1 of 13",
      smoking_gun: "apps/mcp-server/src/scheduler/news-analysis/intelligenceCycleJob.ts:1290 — posts verified_chain when chain.conviction>=0.7 but omits confidence_score; conviction is in scope (logged on adjacent lines)."
    },
    recon_mandate: "recon-first: dev MUST read each of the ~13 postSignal/postSignalWithCriticGate call sites AND the existing confidence source available at each producer BEFORE editing. Enumerate via grep for postSignal( / postSignalWithCriticGate / PostSignalInput across apps/mcp-server/src (exclude __tests__).",
    fix_spec: "Wire each producer's already-computed confidence into confidence_score on post, normalized to the column's 0-100 INTEGER scale. Known sources: cascade.confidence (cascadeExecutor ~0.53), news sentiment.confidence (pollNews/newsSentimentHandler), BCTC extraction_confidence / signalToBctcMapper, kinh-dich confidence (kinhDichSignalsHandler), conviction score (convictionScorer.ts / chain.conviction in intelligenceCycleJob). Normalize 0..1 floats *100 -> round to int; pass-through already-0..100 ints.",
    generic_mandate: "GENERIC (/goal#2 — MUST hold): EVERY signal producer computes & passes its real confidence. NO per-source allowlist, NO per-ticker literal, NO leaving any producer on the default. If a producer genuinely has no confidence source, that must be surfaced explicitly (not silently defaulted to 50).",
    verification_gate: {
      goal1_plausibility: "/goal#1 (done_verified gate, NOT the floor): after fix + REBUILD, live SIGNALS-last-10 must show a SPREAD of confidences that vary by source AND signal strength (exact-match BCTC high, weak-context low, neutral mid) — NOT a column of 50.",
      raw_verify: "Verify against the LIVE named-volume market.db (NOT host ./data decoy — see live-db-named-volume lesson) via keinos/sqlite3 sidecar: SELECT confidence_score, from_agent, signal_type FROM agent_signals ORDER BY created_at DESC LIMIT 10 — confirm variance. PLUS a live get-signals tool call, RAW, not relayed.",
      rebuild: "Code change -> ops REBUILD mcp-server container; verify image .Created > commit time before live-verify."
    },
    source: "user BUG report 2026-06-15 via router RAW-verify",
    size: "M",
    minted_by: "po",
    minted_at: $now
  }]
end
