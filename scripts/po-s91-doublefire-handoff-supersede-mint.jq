# po-s91-doublefire-handoff-supersede-mint.jq
# Single-pass dev-team :27-tick triage for the gatherer-doublefire-dedup-cluster
# IMPLEMENTATION HANDOFF (architecture brief 5bced686 routed PO→agent-father+dev-mcp-server),
# combined with a TNB-audit-handoff HIGH finding mint.
#
# Context: the DESIGN umbrella (DESIGN-GATHERER-DOUBLEFIRE-DEDUP-CLUSTER) reached
# architect_done_at + next_agent:agent-father; the brief materialised AF-1 (agent-father
# leader-lock.md doc edit) + DMS-1/DMS-2 (dev-mcp-server apps/mcp-server/). The 3 prior
# point-fix stubs (Root A/B/C) sat in ready[] held-no-spec; the brief subsumes_hold's each.
#
# Mutations (all atomic, idempotent):
#  M1 SUPERSEDE-COLLAPSE: relocate the 3 superseded Root A/B/C ready[] stubs → done[]
#     (status:SUPERSEDED, done_verified:false, superseded_by:DESIGN umbrella + folded_into the
#     brief's AF-1/DMS child). They are NOT verified-done — they are folded into the umbrella's
#     children. Removed from ready[]. Guarded by superseded_by presence (re-run = no-op).
#  M2 MINT AF-1 → ready[] : agent-father MAINTENANCE lane (leader-lock.md flow-doc edit).
#     Does NOT consume a coding WIP slot. next_agent:agent-father. id-guarded.
#  M3 MINT combined DMS-1+DMS-2 → backlog[] HELD: dev-mcp-server, zone apps/mcp-server/ —
#     COLLIDES with active ARCH-CRON-SCHEDULER-RELIABILITY (same zone). Held BEHIND it; do not
#     open a 2nd concurrent apps/mcp-server lane. next_agent:dev-mcp-server. id-guarded.
#  M4 MINT FIX-BCTC-BANK-SCALAR-MAPPING → backlog[]: TNB c97 HIGH finding (bank B02-TCTD
#     scalar summarizer net_margin_pct=229157% / total_assets=0; CTG cycle-34 CRITICAL).
#     Route ba→architect SPIKE→dev-pdf-extractor/dev-mcp-server. id-guarded.
#  M5 HEAD: set top-level .head → dispatch AF-1's agent-father (the one immediately-dispatchable
#     non-colliding lane this tick). Idempotent (re-set to same value).
#
# Harness (caller): CONSERVATION (ready net -2 [-3 collapse, +1 AF-1]; done +3; backlog +2;
# in_progress/review/done_verified byte-stable; total += 2 net) + PLACEMENT (3 stubs in done with
# SUPERSEDED, AF-1 in ready maintenance, DMS+SCALAR in backlog held) + IDEMPOTENCY (re-run delta 0).
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s91-...jq docs/data/orch/orch-state.json
# (atomic temp→[ -s ]→jq empty→conservation→placement→idempotency→rename; commit orch-state by EXPLICIT PATH; PUSH HELD — PO out-of-band)

def umbrella: "DESIGN-GATHERER-DOUBLEFIRE-DEDUP-CLUSTER";
def brief: "docs/architecture-briefs/2026-06-16-gatherer-doublefire-dedup-cluster.md";

# --- supersede-fold map: stub id -> the brief child it folds into ---
def folded_child:
  { "FIX-GATHERER-DOUBLEFIRE-DISPATCHER": "AF-1 (agent-father leader-lock.md Backstop-Window Defer Gate)",
    "FIX-NEWSSCOUT-SIBLING-DEDUP-CACHE": "DMS-1 (dev-mcp-server get_recent_signals 900s dedup window)",
    "FIX-MARKETWATCHER-GW-CORROBORATION-GATE": "DMS-2 (dev-mcp-server Step-0-GW corroboration gate)" };

def superseded_ids: ["FIX-GATHERER-DOUBLEFIRE-DISPATCHER","FIX-NEWSSCOUT-SIBLING-DEDUP-CACHE","FIX-MARKETWATCHER-GW-CORROBORATION-GATE"];

# id-presence guard across ALL board arrays
def on_board($id):
  ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done,.task_board.done_verified,.task_board.backlog]
   | flatten | map(.id) | index($id)) != null;

. as $root
| ($now) as $NOW

# ---- M1: collapse the 3 superseded ready stubs → done[] (status SUPERSEDED) ----
| ([.task_board.ready[] | select((.id | IN(superseded_ids[])) and (.superseded_by == null))]) as $to_collapse
| .task_board.done = (
    .task_board.done +
    ($to_collapse | map(
       . + { status: "SUPERSEDED",
             done_verified: false,
             superseded_by: umbrella,
             folded_into: (.id as $sid | $root | ($sid | folded_child) ),
             superseded_at: $NOW,
             superseded_by_tick: "po-s91 2026-06-16T21:27Z dev-team",
             resolution: "folded into the doublefire design umbrella's brief child — work tracked there, NOT independently done" }
    ))
  )
| .task_board.ready = ([.task_board.ready[] | select((.id | IN(superseded_ids[]) | not) or (.superseded_by != null))])

# ---- M2: mint AF-1 → ready[] (agent-father maintenance lane) ----
| (if (. | on_board("AF-1-LEADER-LOCK-BACKSTOP-DEFER")) then . else
    .task_board.ready += [{
      id: "AF-1-LEADER-LOCK-BACKSTOP-DEFER",
      type: "FIX",
      lane: "maintenance",
      consumes_coding_wip: false,
      priority: "p2",
      status: "READY",
      owner: "agent-father",
      next_agent: "agent-father",
      route_to: "agent-father",
      zone: "docs/agents/cowork-team/flow/leader-lock.md",
      brief_path: brief,
      brief_task_id: "AF-1",
      subsumes_hold: "FIX-GATHERER-DOUBLEFIRE-DISPATCHER",
      title: "AF-1: Backstop-Window Defer Gate in leader-lock.md (Root A of gatherer double-fire)",
      desc: "Per brief §Primitive 1: add an error-branch at the top of the task_claim block in docs/agents/cowork-team/flow/leader-lock.md — when LEADER_CLAIM call errors/times-out AND UTC.hour ∈ {0,4,8,12,16,20} AND UTC.minute < 15 → EXIT (defer one tick); outside that window → PROCEED. Doc-only flow-file edit (agent-father zone, mutex-wrapped on dispatch). Does NOT consume a coding WIP slot.",
      ac: "Simulate leader-lock tool error within :00-:15 backstop window of a 4h-boundary hour → dispatcher defers (EXIT); same error outside window → dispatcher proceeds. No double-fire across manual+cloud paths.",
      verification_gate: "Branch present with the exact BOUNDARY_HOURS guard; agent-md-factory invoked before edit (flow-doc, not agent .md); no regression to the existing ORPHAN-RECOVERY path.",
      size: "S",
      source: "po-s91 dev-team tick 2026-06-16T21:27Z — implementation handoff of brief 5bced686 (agents-architect→agent-father)",
      created_at: $NOW, created_by: "po", promoted_at: $NOW, promoted_by: "po"
    }]
  end)

# ---- M3: mint combined DMS-1+DMS-2 → backlog[] HELD behind ARCH-CRON-SCHEDULER-RELIABILITY ----
| (if (. | on_board("DMS-DOUBLEFIRE-SIBLING-DEDUP-CORROBORATION")) then . else
    .task_board.backlog += [{
      id: "DMS-DOUBLEFIRE-SIBLING-DEDUP-CORROBORATION",
      type: "FIX",
      priority: "p2",
      status: "BACKLOG",
      held: true,
      owner: "dev-mcp-server",
      next_agent: "dev-mcp-server",
      route_to: "dev-mcp-server",
      zone: "apps/mcp-server/",
      brief_path: brief,
      brief_task_ids: ["DMS-1","DMS-2"],
      subsumes_holds: ["FIX-NEWSSCOUT-SIBLING-DEDUP-CACHE","FIX-MARKETWATCHER-GW-CORROBORATION-GATE"],
      held_on: "ARCH-CRON-SCHEDULER-RELIABILITY",
      hold_reason: "ZONE COLLISION: DMS-1/DMS-2 touch apps/mcp-server/ which is the active in_progress lane of ARCH-CRON-SCHEDULER-RELIABILITY. Sequence BEHIND it — do NOT open a 2nd concurrent apps/mcp-server lane (WIP ≤2 coding lanes; in_progress=1, headroom is for a NON-colliding lane only). Promote to ready[] when ARCH-CRON-SCHEDULER-RELIABILITY reaches review/done and the zone is free.",
      title: "DMS-1+DMS-2: news-scout sibling-dedup window + market-watcher corroboration gate (Roots B/C of gatherer double-fire)",
      desc: "Per brief §Primitive 2+3 (share ONE get_recent_signals(window_seconds=900) helper against signal_bus on named-volume market.db). DMS-1: replace news-scout SELF_SIGNALS_CACHE=[] with the 900s window query; content-hash dedup key (signal_type, ticker_normalised, title_normalised); GENERIC — no allowlist by signal_type. DMS-2: replace market-watcher Step-0-GW immediate-BUG-on-2x-failure with the corroboration gate — after 2x probe failure, query get_recent_signals(900); sibling signals present → EXIT gracefully (no BUG); none → file gateway-down BUG. May ship as ONE combined dev-mcp-server sprint.",
      ac: "DMS-1: two concurrent news-scout fires within the same minute produce 0 duplicate internal signals. DMS-2: timeout with sibling success in window → no BUG filed; timeout with no sibling success → BUG filed.",
      verification_gate: "Live: two concurrent sibling fires → 0 dup signal_bus rows (RAW-probe named-volume market.db, not self-built test schema); timeout+sibling-success → no BUG row. Rebuild required (mcp-server code change). Cross-ref same-db-tools-diverge-rowcount + false-infra-failure-corroboration-gate.",
      size: "S",
      source: "po-s91 dev-team tick 2026-06-16T21:27Z — implementation handoff of brief 5bced686 (agents-architect→dev-mcp-server), HELD on zone collision",
      created_at: $NOW, created_by: "po"
    }]
  end)

# ---- M4: mint FIX-BCTC-BANK-SCALAR-MAPPING → backlog[] (TNB c97 HIGH finding) ----
| (if (. | on_board("FIX-BCTC-BANK-SCALAR-MAPPING")) then . else
    .task_board.backlog += [{
      id: "FIX-BCTC-BANK-SCALAR-MAPPING",
      type: "FIX",
      priority: "high",
      status: "BACKLOG",
      owner: "po",
      next_agent: "ba",
      route_to: "ba",
      zone: "multi",
      zone_hint: "apps/pdf-extractor/ + apps/mcp-server/ (scalar summarizer layer — architect SPIKE to split)",
      title: "FIX-BCTC-BANK-SCALAR-MAPPING: bank B02-TCTD scalar summarizer garbage (net_margin_pct=229157%, total_assets=0)",
      desc: "TNB audit c97 HIGH finding (F-BCTC-BANK-SCALAR-MAPPING). Follow-on from FIX-BCTC-BANK-PDF-OCR-RASTERIZE done_verified (raw extraction now correct, 55 real varied rows for CTG/VCB) — the scalar-mapping layer that derives net_margin_pct/total_assets from the raw B02-TCTD table is still broken: accounting identity violated (net_margin_pct=229157%, total_assets=0). CTG cycle-34 still CRITICAL (bug #2776 assets=0) until shipped. Route: ba spec → architect SPIKE (split pdf-extractor vs mcp-server scalar layer) → dev. Pairs with TNB F9 business-context gap.",
      ac: "Bank (B02-TCTD) scalar summary obeys the accounting identity: total_assets > 0 and equals sum of asset lines; net_margin_pct in a plausible band (not 5-digit). CTG/VCB live scalar summary (RAW-probe named-volume market.db) shows real varied plausible values, not 0/garbage.",
      verification_gate: "Live RAW-probe of CTG + VCB scalar summary on named-volume market.db: total_assets>0, accounting identity holds, net_margin_pct plausible. Non-zero is the floor not the bar — sanity-check magnitudes (nonzero-values-need-plausibility-check). bctc-analyst next-cycle CTG status flips off DATA_CORRUPT.",
      size: "M",
      source: "po-s91 dev-team tick 2026-06-16T21:27Z — TNB audit-handoff c97 HIGH finding (docs/handoffs/tnb-audit-latest.md). Board had NO matching task despite TNB 'minted' note — minted here.",
      tnb_finding: "F-BCTC-BANK-SCALAR-MAPPING (c97 HIGH)",
      created_at: $NOW, created_by: "po"
    }]
  end)

# ---- M5: head → dispatch AF-1's agent-father (sole non-colliding dispatchable lane this tick) ----
| .head = {
    status: "dispatch",
    updated_at: $NOW,
    updated_by: "po-s91",
    active_task_id: "AF-1-LEADER-LOCK-BACKSTOP-DEFER",
    next_agent: "agent-father",
    note: "po-s91 triage 2026-06-16T21:27Z: dispatch AF-1 (leader-lock.md Backstop-Window Defer Gate, agent-father maintenance lane, no coding WIP slot). DMS-1+DMS-2 HELD in backlog behind ARCH-CRON-SCHEDULER-RELIABILITY (apps/mcp-server zone collision). 3 Root A/B/C stubs folded into the doublefire umbrella's brief children. FIX-BCTC-BANK-SCALAR-MAPPING minted (TNB c97 HIGH). PUSH HELD."
  }

| .updated_at = $NOW
