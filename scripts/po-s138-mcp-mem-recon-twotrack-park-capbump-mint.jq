# po-s138: architect-recon-return TWO-TRACK disposition for a root-cause task
# Origin 2026-07-02 dev-team tick T18:37Z — FIX-MCP-MEMORY-CODE-LEAK phase-0 recon DONE
# (architect, commit d028803e, brief docs/architecture-briefs/2026-07-02-mcp-mem-sawtooth-recon.md).
#
# Reusable pattern: "a recon completes and splits into (1) a cheap immediate mitigation +
# (2) a root-cause code fix gated on a future observation window — PARK the code-fix task on a
# two-condition unpark gate (mitigation-ships AND symptom-persists) and MINT the mitigation to
# ready[], cheapest-sufficient-first". PO does NOT relay track-2 to pm this tick (deferred).
#
# M1: relocate FIX-MCP-MEMORY-CODE-LEAK ready[] -> backlog[] as PARKED
#     (status=BACKLOG + held + hold_reason two-track plan + next_agent=pm for when unparked).
# M2: id-guarded MINT of FIX-MCP-MEM-CAP-BUMP-REBUILD -> ready[] (Track-1 ops mitigation).
# Idempotent: M1 guarded by ready-membership, M2 guarded by presence in ANY lane.
# Conservation: ready net +0 (-1 relocate, +1 mint); backlog +1; total +1 (the mint).
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/po-s138-mcp-mem-recon-twotrack-park-capbump-mint.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def in_any_lane($id):
  ([.task_board[] | select(type=="array") | .[] | select(type=="object") | .id] | index($id)) != null;

# capture the mem-leak row (if present in ready[]) before mutation
(.task_board.ready | map(select(type=="object" and .id=="FIX-MCP-MEMORY-CODE-LEAK")) | .[0]) as $memrow

# ---- M1: park FIX-MCP-MEMORY-CODE-LEAK (ready -> backlog) ----
| (if ($memrow != null) and ((.task_board.backlog | map(select(type=="object" and .id=="FIX-MCP-MEMORY-CODE-LEAK")) | length) == 0)
   then
     (.task_board.ready |= map(select((type != "object") or (.id != "FIX-MCP-MEMORY-CODE-LEAK"))))
     | .task_board.backlog += [ ($memrow
         | .status = "BACKLOG"
         | .next_agent = "pm"
         | .held = true
         | .parked_by = "po"
         | .parked_at = $now
         | .recon_complete = "architect phase-0 recon DONE (commit d028803e) — brief docs/architecture-briefs/2026-07-02-mcp-mem-sawtooth-recon.md. Findings: (a) image 6 commits stale but NONE touch mem-relevant code (rebuild=owed hygiene, not the fix); (b) 2GB cap tight, host has 4.37GiB free -> bump to 3GiB; (c) CONCRETE hotspot: initDatabase() (schema.ts:148) has NO already-init guard, awaited at 68 tool-handler call-sites -> full ~3300-line DDL+backfill sweep every tool call, stacks with per-request McpServer rebuild (server.ts:481)."
         | .hold_reason = "TWO-TRACK. Track-1 (immediate, SEPARATE task FIX-MCP-MEM-CAP-BUMP-REBUILD in ready[]): cap 2g->3g repo edit + rebuild-to-HEAD, user-gated swap. Track-2 (THIS task, next_agent=pm decompose into dev-mcp-server): initDatabase() init-guard (Step-3(i), mirror existing getDb() singleton guard) + optional per-request McpServer reuse (Step-3(ii), MUST preserve Bun-JIT Symbol-corruption workaround). PARKED pending UNPARK-GATE: [Track-1 rebuild+swap SHIPPED] AND [post-swap docker stats re-sampled 24-48h shows sawtooth RECURS at the new 3GiB cap] (expected per source evidence). Cheapest-sufficient-first: do NOT decompose the code fix until the cheaper cap+rebuild is proven insufficient. PO deferred pm-relay this tick.") ]
   else . end)

# ---- M2: mint Track-1 cap-bump + rebuild ops mitigation -> ready[] ----
| (if in_any_lane("FIX-MCP-MEM-CAP-BUMP-REBUILD") then .
   else .task_board.ready += [ {
       "id": "FIX-MCP-MEM-CAP-BUMP-REBUILD",
       "title": "mcp-server mem: cap 2g->3g compose edit (repo) + rebuild-to-HEAD & single-svc swap (user-gated)",
       "type": "FIX",
       "size": "S",
       "priority": "high",
       "status": "READY",
       "zone": "cross-service",
       "owner": "po",
       "next_agent": "ops",
       "created_at": $now,
       "promoted_by": "po",
       "promoted_at": $now,
       "parent": "FIX-MCP-MEMORY-CODE-LEAK",
       "brief_ref": "docs/architecture-briefs/2026-07-02-mcp-mem-sawtooth-recon.md",
       "desc": "TRACK-1 immediate mitigation from architect recon (brief above). (a) REPO EDIT (normal change, ALLOWED, commit now): docker-compose.yml:71 memory: 2g -> 3g AND docker-compose.dev.yml:34 memory: 2g -> 3g (dev-override parity). (b) USER-GATED (emit commands to user, DO NOT execute — container swap is user-gated per hard constraint): docker compose build mcp-server (rebuild-to-HEAD, 6 commits of BCTC/cron-status fixes owed as hygiene), then docker compose up -d --no-deps mcp-server (single-service recreate ONLY — never down/up-all, never --no-deps down). (c) RAW post-verify per brief §User-Gate Commands: docker inspect image ID changed + docker stats mem dropped to low baseline; then re-sample stats over 24-48h — if the sawtooth recurs at 3GiB (expected per source evidence) that satisfies the FIX-MCP-MEMORY-CODE-LEAK Track-2 unpark gate.",
       "acceptance": "compose carries 3g in BOTH docker-compose.yml + docker-compose.dev.yml; user-gate rebuild+swap commands emitted to user (WORK/telegram); ops does NOT run the swap itself. Post-swap: new image ID live + mem baseline reset (RAW-verified).",
       "files": ["docker-compose.yml", "docker-compose.dev.yml"],
       "baseline_pass": true
     } ]
   end)
