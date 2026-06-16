# po-s90-gatherer-doublefire-design-umbrella-mint.jq
#
# Single-task DESIGN-UMBRELLA mint: id-guarded MINT of one architect-led design
# umbrella → .task_board.ready[] that decomposes the standing offhours-gatherer
# manual×cloud DOUBLE-FIRE cluster (3 already-HELD roots A/B/C) into ONE coherent
# dedup+defer model, so a developer gets ONE dev-ready spec instead of three
# spec-less stubs. The 3 child FIX rows stay in ready[] with their existing PO
# holds untouched (this umbrella is their unblocker, not a replacement).
#
# WHY a design umbrella and NOT a direct dev dispatch this tick:
#   All 3 cluster members (FIX-GATHERER-DOUBLEFIRE-DISPATCHER / -NEWSSCOUT-SIBLING-
#   DEDUP-CACHE / -MARKETWATCHER-GW-CORROBORATION-GATE) carry held_on=
#   2026-06-16T10:31:48Z held_by=po with fix_spec:ABSENT, files:ABSENT and a hold
#   reason that EXPLICITLY requires "design/BA decomposition before a developer can
#   implement" + "dedup+defer semantics solved ONE way, not three". Dispatching a
#   dev on a thin stub violates the BA-spec-before-code boundary rule AND the hold's
#   own rationale. Routing the umbrella to agents-architect (a DESIGN lane, not a
#   coding WIP lane) does not consume the WIP<=2 coding budget and does not collide
#   with the active apps/mcp-server/ lane (ARCH-CRON-SCHEDULER-RELIABILITY).
#
# Idempotent: if id already present in ANY board array -> mint 0 (re-run no-op).
# Conservation: ready +1, all other lanes byte-unchanged, total +1 (legitimate mint,
# NOT a move — guarded as a pure single append).
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s90-gatherer-doublefire-design-umbrella-mint.jq \
#      docs/data/orch/orch-state.json > /tmp/orch.tmp
#   [ -s /tmp/orch.tmp ] && jq empty /tmp/orch.tmp && mv /tmp/orch.tmp docs/data/orch/orch-state.json
#   (commit orch-state by EXPLICIT PATH; PUSH HELD — PO out-of-band)

def already_present($id):
  [ .task_board | to_entries[] | (.value | if type=="array" then .[]? else empty end) | .id ]
  | any(. == $id);

($ARGS.named.now) as $now
| ("DESIGN-GATHERER-DOUBLEFIRE-DEDUP-CLUSTER") as $id
| if already_present($id) then .
  else
    .task_board.ready += [{
      id: $id,
      type: "SPRINT-S",
      priority: "MEDIUM",
      status: "READY",
      route_to: "agents-architect",
      owner: "po",
      next_agent: "agents-architect",
      zone: "multi",
      title: "Design umbrella: solve the offhours-gatherer manual×cloud DOUBLE-FIRE cluster (roots A/B/C) ONE way — single dedup+defer concurrency model",
      desc: "The standing offhours-gatherer double-fire (manual */15 dispatcher fires on stale last_fired AND cloud backstop independently fires the same pair ~5min later after the staleness check; leader-lock read times out so dispatcher cannot defer; news-scout SELF_SIGNALS_CACHE blind to concurrent sibling -> dup signals; market-watcher false gateway-down) decomposes into 3 HELD roots that SHARE a concurrency/dedup model. Per the existing PO hold (held_on 2026-06-16T10:31:48Z), these MUST be solved ONE way, not three. This umbrella = ONE architect design pass -> ONE BA decomposition that produces dev-ready fix_spec+files for all 3 children, then routes the code work (Root A -> agent-father via cowork-schedule.json brief; Roots B/C -> dev-mcp-server apps/mcp-server/).",
      children: [
        {id: "FIX-GATHERER-DOUBLEFIRE-DISPATCHER", root: "A", zone: "docs/data/cowork-schedule.json", code_route: "agent-father (cowork-schedule.json brief)", problem: "dispatcher DEFER offhours-gatherer fire when leader-lock unreadable AND within :00-:15 cloud-backstop window of a 4h-boundary hour (do not fire on stale last_fired)"},
        {id: "FIX-NEWSSCOUT-SIBLING-DEDUP-CACHE", root: "B", zone: "apps/mcp-server/", code_route: "dev-mcp-server", problem: "SELF_SIGNALS_CACHE concurrent-sibling visibility — dedup blind to a concurrently-firing sibling -> dup signals"},
        {id: "FIX-MARKETWATCHER-GW-CORROBORATION-GATE", root: "C", zone: "apps/mcp-server/", code_route: "dev-mcp-server", problem: "Step-0-GW sibling-success corroboration gate — false gateway-down when a sibling succeeded; pairs with Root B concurrency model"}
      ],
      design_mandate: "Architect produces ONE concurrency/dedup model that covers: (1) defer-on-unreadable-lock within backstop window, (2) cross-sibling concurrent-fire visibility for the dedup cache, (3) sibling-success corroboration before declaring gateway-down. The 3 children inherit that single model — no three divergent dedup schemes. BA then writes per-child fix_spec+files. Cross-references project memory: gatherer-manual-cloud-doublefire + sentinel-discriminator-bootstrap-boundary + false-infra-failure-corroboration-gate.",
      verification_gate: "Simulate: stale last_fired + unreadable leader-lock within :00-:15 backstop window of a 4h-boundary hour -> exactly ONE fire across manual+cloud paths, no dup internal signals, no false gateway-down when a sibling succeeded. Each child carries its own behavioral gate before its own done_verified.",
      size: "S",
      source: "po dev-team tick 2026-06-16T20:26Z — cluster all-3-HELD (no dev-ready spec); unblock via ONE architect/BA design pass per the standing hold reason; supersedes the per-stub dispatch path",
      supersedes_holds: ["FIX-GATHERER-DOUBLEFIRE-DISPATCHER", "FIX-NEWSSCOUT-SIBLING-DEDUP-CACHE", "FIX-MARKETWATCHER-GW-CORROBORATION-GATE"],
      created_at: $now,
      created_by: "po",
      promoted_at: $now,
      promoted_by: "po"
    }]
    | .updated_at = $now
  end
