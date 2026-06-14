# Router dev-team — VN-MACRO-TOOLING VMT-7 wave: RECONCILE pm duplicate-key bug + advance head pm->dev.
# pm (agent a380126d, commit ba48c277) did CORRECT sequencing of the 6 VMT-7 tasks (7a-e parallel serial_dispatch_order=1; VMT-7-REGISTER serial_dispatch_order=2 merge_gate=[5 handlers]) AND attached rich per-handler dispatch_contract (Zone-A endpoint + response DTO key_fields + critical is_estimate/blocked invariants) — BUT wrote them as 6 NEW DUPLICATE tasks into .task_board.backlog[] instead of editing the EXISTING VMT-7 tasks in active_sprints[VN-MACRO-TOOLING].tasks[].
# ROUTER RAW-VERIFY (not the pm badge):
#   git show ba48c277 --name-only = EXACTLY 2 files (pm.md notebook + orch-state.json) — explicit-path hygiene HELD; head UNTOUCHED (next_agent stays pm — pm correctly did NOT advance the pipeline).
#   DUP DETECTED: id-line count 722->728 (+6); VMT-7a-e + VMT-7-REGISTER present in BOTH backlog[] (sequenced) AND active_sprints[].tasks[] (stale, serial_dispatch_order=null) = split SSOT (SSOT duplicate-key class).
#   pm SEQUENCING CONTENT is CORRECT and load-bearing — only the CONTAINER was wrong. Router reconciles in-place (does NOT kick back a cycle): overlay pm's additive fields onto the canonical in-sprint tasks, drop the backlog dups.
# This write (ONE atomic temp->rename):
#   (1) Overlay pm's new fields {serial_dispatch_order, merge_gate, dispatch_contract, mcp_tool, zone_a_endpoint, zone_a_response_dto} (null-dropped) from each backlog VMT-7 dup ONTO the matching active_sprints[VN-MACRO-TOOLING].tasks[] task (preserves original schema: type/wave/blocks/files_create/files_modify/title/note).
#   (2) Remove the 6 VMT-7 duplicate tasks from backlog[]. Net id-line delta = -6 (728 -> 722, back to baseline).
#   (3) Advance head pm->dev: VMT-7 Zone-B wave now correctly sequenced in-sprint -> dev-mcp-server dispatch (7a-e parallel WIP-gated wave-1; VMT-7-REGISTER gated wave-2). Record pm dup-bug as hygiene finding.
# GUARD: refuse unless head.next_agent=="pm" AND >=6 VMT-7 dups in backlog AND active VMT-7a serial_dispatch_order==null (un-reconciled).
# Usage: jq --arg now "$NOW" -f scripts/router-d28-vnmacro-vmt7-dedup-reconcile-pm-to-dev-20260614.jq docs/data/orch/orch-state.json
def SPRINT: "VN-MACRO-TOOLING";
def is7: ((.id // "") | test("^VMT-7"));
($ARGS.named.now) as $now
| ([.task_board.backlog[]? | select(type=="object" and ((.id // "") | test("^VMT-7")))]) as $dups
| ($dups
    | map({key: .id,
           value: ({serial_dispatch_order, merge_gate, dispatch_contract, mcp_tool, zone_a_endpoint, zone_a_response_dto}
                   | with_entries(select(.value != null)))})
    | from_entries) as $ov
| ([.task_board.active_sprints[]? | select(type=="object" and ((.id // "")==SPRINT)) | .tasks[]? | select((.id // "")=="VMT-7a-TRADE-BALANCE-HANDLER")][0]) as $a7a
| if (.head.next_agent != "pm") then error("head.next_agent != pm (\(.head.next_agent)) — refuse")
  elif (($dups | length) < 6) then error("expected >=6 VMT-7 backlog dups, found \($dups | length) — refuse")
  elif ($a7a == null) then error("active_sprints VMT-7a not found — refuse")
  elif (($a7a.serial_dispatch_order // null) != null) then error("active VMT-7a already sequenced (\($a7a.serial_dispatch_order)) — already reconciled, refuse")
  else . end
| .task_board.active_sprints = [
    .task_board.active_sprints[] | if (type=="object" and ((.id // "")==SPRINT))
      then ( .tasks = [ .tasks[] | if is7 then (. + ($ov[(.id // "")] // {})) else . end ] )
      else . end
  ]
| .task_board.backlog = [ .task_board.backlog[] | select((type=="object" and ((.id // "") | test("^VMT-7"))) | not) ]
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "BA-VN-MACRO-TOOLING",
    next_agent: "dev",
    note: "VN-MACRO-TOOLING VMT-7 Zone-B wave SEQUENCED (pm a380126d, commit ba48c277) + router-reconciled. pm breakdown CONTENT correct: 7a-e (get_vn_trade_balance/get_vn_bop/get_vn_macro_indicators/get_cpi_components/get_vn_liquidity_state) serial_dispatch_order=1 PARALLEL (separate handler files in tools/macro/, no shared file among them; reuse existing http-proxy/ helper), each carries dispatch_contract with Zone-A endpoint + live response-DTO key_fields + critical is_estimate/blocked_reason passthrough invariants (7d weight_pct=null + weights_is_estimate=true; 7e irs+interbank_1w is_estimate=true PERMANENT + rate_1w_pct=null Decision B/DD-6; 7a bloc_split is_estimate=true Decision A; 7b offshore_parked is_estimate=true); VMT-7-REGISTER serial_dispatch_order=2 merge_gate=[7a,7b,7c,7d,7e] (shared index.ts+registry.ts, runs AFTER all 5). HYGIENE FINDING (non-blocking, router-fixed): pm wrote the 6 sequenced tasks as DUPLICATES into backlog[] (SSOT dup-key class, id-line 722->728) instead of editing the in-sprint tasks; router overlaid pm's additive fields onto canonical active_sprints[].tasks[] and dropped the 6 backlog dups (id-line back to 722) — pm must edit in-place next time, not re-create in backlog. -> head pm->dev: dispatch VMT-7a-e in PARALLEL to dev-mcp-server (WIP=2 pipeline), then VMT-7-REGISTER on merge_gate satisfied. CONTRACT FROM LIVE PAYLOAD: each handler's TS Zod output must match the real served Zone-A DTO + surface is_estimate/blocked_reason honestly (never strip). WAVE-2 serial Zone-A chain CLOSED (A1-A5 done). VMT-3a-PMI blocked-probe5 (S&P dev-local). Commit explicit path only."
  }
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
