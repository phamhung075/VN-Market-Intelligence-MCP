# po-s110 — single-task BACKLOG MINT (idempotent): get_agent_signals all-producers null-strip
#
# Mints FIX-AGENTSIGNALS-ALLPRODUCERS-NULLSTRIP into .task_board.backlog[] as status:BACKLOG.
# DO NOT promote (WIP occupied by in-flight FIX-PRED-CLAIMS-EXCLUDED-SERVE-DISPLAY).
# Idempotent: skipped entirely if the id already exists in ANY board array (re-run mints 0).
#
# Origin 2026-06-21 health-recheck 3286 BUG-6 (MEDIUM). Distinct from the done_verified
# FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT (that made `agent` optional + added the inbox guard,
# but relies on from_agent===null literally surviving transport — this is the residual
# transport-robustness gap). Distinct from the stale-superseded FIX-AGENTSIGNALS-FROMAGENT-SCHEMA
# (sender-history required-param bug, already fixed by the contract task).
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/po-s110-agentsignals-allproducers-nullstrip-mint.jq \
#   docs/data/orch/orch-state.json
# (atomic temp -> [ -s ] -> jq empty -> conservation -> rename; commit by EXPLICIT PATH).

def all_ids:
  [.task_board | (.backlog // [], .ready // [], .in_progress // [], .review // [], .done // [], .done_verified // [])[] | objects | .id];

def already_present:
  (all_ids | index("FIX-AGENTSIGNALS-ALLPRODUCERS-NULLSTRIP")) != null;

if already_present then
  .
else
  .task_board.backlog += [{
    "id": "FIX-AGENTSIGNALS-ALLPRODUCERS-NULLSTRIP",
    "type": "FIX",
    "status": "BACKLOG",
    "priority": "P3",
    "zone": "apps/mcp-server/",
    "owner": "dev-mcp-server",
    "next_agent": "dev-mcp-server",
    "size": "S",
    "rebuild_required": true,
    "title": "get_agent_signals all-producers mode broken when MCP transport strips from_agent:null -> undefined (falls into inbox-mode error branch)",
    "files": [
      "apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts",
      "docs/agents/market-watcher/flow/main.md",
      "docs/agents/news-scout/flow/stage-bootstrap.md",
      "docs/agents/tools/list/get_agent_signals.md"
    ],
    "root_cause": "All-producers mode keys on `args.from_agent === null` (agentSignalTools.ts L512). If the MCP transport strips from_agent:null -> undefined in transit, the call falls through L512 and hits the inbox-mode branch (L527 `from_agent===undefined && !agent`) -> returns the inbox-mode error instead of the all-producers window query. Live code RAW-read by PO confirms the two branches exist exactly as the report describes (L512 all-producers, L527 inbox-error). DISTINCT from done_verified FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT (commit 8a6b798c made `agent` optional + added the L527 inbox guard, but still relies on from_agent===null surviving transport) and from the stale-superseded FIX-AGENTSIGNALS-FROMAGENT-SCHEMA (sender-history required-param, already fixed).",
    "router_unconfirmed_caveat": "ROUTER RAW-VERIFY CAVEAT: from the ROUTER's gateway path, get_agent_signals({from_agent:null,hours_back:0.25}) WORKS — returns all-producers (1 signal). So null SURVIVES the router transport; the failure is COWORK-CALLER-transport-specific and is NOT reproducible from the router. Treat the report's 'transport strips null' as plausible-but-router-UNCONFIRMED. The dev MUST RAW-verify in the actual cowork-call path (or just apply the defensive flag, which is correct regardless of whether the strip reproduces).",
    "impact": "2 callers, cloud-backstop path ONLY (both are cowork agents that are gateway-blind when locally spawned, so this only bites on the cloud-backstop path — bounds urgency): market-watcher/flow/main.md:54 (sibling-corroboration gate -> if all-producers errors, false gateway-down alarms go unsuppressed) + news-scout/flow/stage-bootstrap.md:57 (SIBLING_WINDOW_CACHE dedup silently disabled).",
    "fix_spec": "Defensive, transport-robust: add `all_producers: z.boolean().optional()` to the Zod schema; when all_producers===true, take the cross-producer window path (getRecentSignals) REGARDLESS of from_agent value. Update the 2 caller flow docs to pass all_producers:true instead of (or alongside) from_agent:null. NOTE: an alternative already exists — the dedicated get_recent_signals tool (agentSignalTools.ts L559+) bypasses the null-path entirely; the dev may prefer routing the 2 callers to it instead of adding the flag. Either is acceptable if transport-robust.",
    "generic_mandate": "Fix must not depend on null surviving transport for ANY caller; the all-producers contract becomes explicit (flag or dedicated tool), not keyed on a falsy-coercible sentinel.",
    "verification_gate": "LIVE: the 2 callers' exact arg shape returns the all-producers window (not the inbox-mode error) even if from_agent is stripped to undefined; sibling-dedup + corroboration gate re-enabled on the cloud-backstop path. Dev RAW-verifies in the cowork-call path OR confirms the defensive flag/tool makes the strip moot.",
    "agent_md_factory_note": "Editing the 2 flow .md files (market-watcher/flow/main.md, news-scout/flow/stage-bootstrap.md) requires the agent-md-factory discipline — invoke .claude/skills before editing.",
    "dedup_note": "DISTINCT from: FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT (done_verified, agent-optional+inbox-guard, relies on null surviving), FIX-AGENTSIGNALS-FROMAGENT-SCHEMA (stale-superseded sender-history required-param), DMS-DOUBLEFIRE-SIBLING-DEDUP-CORROBORATION + FIX-NEWSSCOUT-SIBLING-DEDUP-CACHE (the CONSUMERS — done/superseded), FIX-MARKET-WATCHER-DOC-PARAM-DRIFT (ticker->code doc examples). BUG-5 orphan-lock already RESOLVED by router (no task minted for it).",
    "source_report": "3286",
    "source_signal": "health-recheck 2026-06-21T20:07Z BUG-6 (MEDIUM)",
    "created_at": $now,
    "created_by": "po-s110",
    "minted_by": "po-s110",
    "minted_at": $now
  }]
end
