# Router dev-team — VN-MACRO-TOOLING VMT-7 Zone-B wave: mark all 6 tasks dispatched (BUNDLED single dev-mcp-server agent).
# DISPATCH JUDGMENT: 7a-e are pm-sequenced parallel (serial_dispatch_order=1) but ALL share the tools/macro/ directory + index.ts
#   (VMT-7-REGISTER owns index.ts+registry.ts). Parallel separate agents on one directory + shared registry = concurrent-commit race
#   (memory: "parallel workers share index; serialize commit") — same hazard the sprint serialized Zone-A A1-A5 for. SAFE dispatch =
#   ONE dev-mcp-server agent implements all 6 in dependency order (5 thin proxy handlers FIRST, then VMT-7-REGISTER wires index.ts) —
#   merge_gate internally satisfied within the single atomic commit; router RAW-verifies the whole bundle at once. WIP=1.
# This write (ONE atomic temp->rename): VMT-7a/7b/7c/7d/7e/VMT-7-REGISTER status TODO->dispatched + dispatch markers. head stays dev
#   (dev work in flight). 0 new id-lines.
# GUARD: refuse unless head.next_agent=="dev" AND all 6 VMT-7 tasks status=="TODO".
# Usage: jq --arg now "$NOW" -f scripts/router-d29-vnmacro-vmt7-dispatch-bundled-20260614.jq docs/data/orch/orch-state.json
def SPRINT: "VN-MACRO-TOOLING";
def is7: ((.id // "") | test("^VMT-7"));
($ARGS.named.now) as $now
| ([.task_board.active_sprints[]? | select(type=="object" and ((.id // "")==SPRINT)) | .tasks[]? | select(is7)]) as $v7
| if (.head.next_agent != "dev") then error("head.next_agent != dev (\(.head.next_agent)) — refuse")
  elif (($v7 | length) < 6) then error("expected >=6 VMT-7 tasks in sprint, found \($v7 | length) — refuse")
  elif (($v7 | map(select((.status // "") != "TODO")) | length) > 0) then error("some VMT-7 task already non-TODO (\($v7 | map(.status) | join(","))) — refuse")
  else . end
| .task_board.active_sprints = [
    .task_board.active_sprints[] | if (type=="object" and ((.id // "")==SPRINT))
      then ( .tasks = [
        .tasks[]
        | if is7
            then (. + {status: "dispatched", dispatched_at: $now, dispatch_agent: "dev-mcp-server",
                       dispatch_note: "VMT-7 Zone-B wave BUNDLED into ONE dev-mcp-server agent (router dispatch judgment: 7a-e share tools/macro/ dir + index.ts, parallel separate agents = concurrent-commit race; bundle = handlers-first then VMT-7-REGISTER, merge_gate internally satisfied in one atomic commit). Implement per this task's dispatch_contract (Zone-A endpoint + live response-DTO key_fields + critical is_estimate/blocked_reason passthrough — NEVER strip). Reuse existing tools/macro/http-proxy/ helper; Zod output schema matches the REAL served Zone-A DTO (contract from live payload). tsc --noEmit green; explicit-path commit (tools/macro/** + index.ts + your notebook ONLY — NEVER git add -A/orch-state). On done+green router RAW-verifies whole bundle (5 handlers + registry wires exactly those 5 + tool-count +5 + is_estimate passthrough)."})
          else . end
      ] )
      else . end
  ]
| .head.updated_at = $now
| .head.updated_by = "dev-team"
| .head.note = ("VMT-7 Zone-B wave DISPATCHED (bundled single dev-mcp-server agent — 7a-e thin MCP proxies + VMT-7-REGISTER index.ts wire, handlers-first dependency order, ONE atomic commit). Each handler carries dispatch_contract: Zone-A endpoint + live response-DTO key_fields + critical is_estimate/blocked_reason passthrough (7d weight_pct=null+weights_is_estimate=true; 7e irs+interbank_1w is_estimate=true PERMANENT+rate_1w_pct=null; 7a bloc_split is_estimate=true; 7b offshore_parked is_estimate=true) — handler must SURFACE these honestly, never strip. http-proxy/ helper reuse; Zod=live served DTO. On done+green router RAW-verify bundle (tsc green, registry wires exactly the 5, MCP tool-count +5) -> VMT-7 wave done -> VN-MACRO-TOOLING sprint near-complete (remaining VMT-3a-PMI blocked-probe5 S&P dev-local). WAVE-2 serial Zone-A CLOSED (A1-A5). pm dup-key hygiene finding logged (router-fixed d28). Commit explicit path only.")
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
