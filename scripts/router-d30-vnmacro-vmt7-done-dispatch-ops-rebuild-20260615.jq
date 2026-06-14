# Router dev-team — VN-MACRO-TOOLING VMT-7 Zone-B wave DONE (router RAW-verified) -> dispatch ops to REBUILD mcp-server + live-verify.
# dev-mcp-server (agent a6f068af, commit 5c2f4f63) implemented all 6 VMT-7 tasks BUNDLED: 5 thin MCP proxy handlers
#   (tradeBalanceTools/bopTools/macroIndicatorsVnTools/cpiComponentsTools/liquidityStateTools) + VMT-7-REGISTER (registry.ts wire).
# ROUTER INDEPENDENT RAW-VERIFY (not the dev badge — 8 gates ALL GREEN):
#   G1 HEAD==5c2f4f63 on main (NO branches: commit-to-main == merge gate satisfied).
#   G2 git show 5c2f4f63 --name-only = EXACTLY 8 files: 5 handlers + http-proxy/index.ts + registry.ts + dev-mcp-server notebook.
#   G3 FOREIGN-CAPTURE GUARD passed (grep -vE tools/macro|registry.ts|dev-notebook = NONE; no orch-state/ops.md/signal sweep) — hygiene HELD.
#   G4 independent `bunx tsc --noEmit` exit 0 (re-run, not the dev badge).
#   G5 registry.ts wires EXACTLY the 5 registrar fns: imports L120-124 + registrar-array entries L246-250 (array terminated `];` L251),
#      dependency order, all inside the SAME executed TOOL_REGISTRARS array (VMT-7-REGISTER merge_gate satisfied in one atomic commit).
#   G6 FAIL-CLOSED is_estimate/blocked invariants RAW-confirmed at cited lines (contract from live payload, never strip):
#      7a tradeBalanceTools BlocShareSchema is_estimate=z.boolean() PERMANENT (ARCH Decision A);
#      7b bopTools OffshoreParkedSchema is_estimate always true (L57) + fx_incidence is_estimate=false primary (L50);
#      7d cpiComponentsTools weight_pct=z.number().nullable() (L41, null preserved, NO coerce) + weights is_estimate=z.boolean();
#      7e liquidityStateTools rate_1w_pct=z.number().nullable() (L82 ALWAYS null) + is_estimate=z.boolean() PERMANENT (L84, Decision B)
#         + blocked_reason=z.string() REQUIRED on all paths (L86); IRS is_estimate boolean; OMO blocked_reason optional (omitempty parse-fail only).
#   G7 tool-count baseline project-stats.json toolCount=157 -> expect 162 LIVE after rebuild (+5).
#   G8 NO hardcoded base URL in handlers (genericity /goal #2): only JSDoc mentions http://; resolution = getMacroBaseUrl()
#      reading Bun.env.MACRO_INDICATORS_URL at call-time (macroHttpClient.ts:15-16, fallback localhost:5004) — env-driven, deploy-generic.
#   bun test 13037/0-fail (dev badge, corroborative). VMT-7 merge gate SATISFIED for ALL 6.
# This write (ONE atomic temp->rename):
#   (1) VMT-7a/7b/7c/7d/7e/VMT-7-REGISTER status dispatched->done + done markers + shared router_dev_reverify_verdict.
#   (2) head dev->ops: code merge gate satisfied but the 5 tools are NOT yet LIVE (container holds pre-VMT-7 image) -> ops REBUILD
#       mcp-server (memory: rebuild after dev change; NEVER compose down — force-recreate single service) + live-verify tool-count 157->162
#       + probe one new tool live via gateway. On ops live-green -> router updates project-stats.json toolCount->162 + PO closes sprint (done_verified).
#   0 new id-lines (VMT-7 tasks already exist; status flip only).
# GUARD: refuse unless head.next_agent=="dev" AND all 6 VMT-7 status=="dispatched".
# Usage: jq --arg now "$NOW" -f scripts/router-d30-vnmacro-vmt7-done-dispatch-ops-rebuild-20260615.jq docs/data/orch/orch-state.json
def SPRINT: "VN-MACRO-TOOLING";
def is7: ((.id // "") | test("^VMT-7"));
($ARGS.named.now) as $now
| ([.task_board.active_sprints[]? | select(type=="object" and ((.id // "")==SPRINT)) | .tasks[]? | select(is7)]) as $v7
| if (.head.next_agent != "dev") then error("head.next_agent != dev (\(.head.next_agent)) — refuse")
  elif (($v7 | length) < 6) then error("expected >=6 VMT-7 tasks, found \($v7 | length) — refuse")
  elif (($v7 | map(select((.status // "") != "dispatched")) | length) > 0) then error("some VMT-7 task not dispatched (\($v7 | map(.status) | join(","))) — refuse")
  else . end
| .task_board.active_sprints = [
    .task_board.active_sprints[] | if (type=="object" and ((.id // "")==SPRINT))
      then ( .tasks = [
        .tasks[]
        | if is7
            then (. + {status: "done", done_at: $now, done_commit: "5c2f4f63", done_agent: "a6f068af",
                       router_dev_reverify_verdict: "RAW-VERIFIED bundle (not the dev badge) — 8 gates GREEN: HEAD==5c2f4f63 on main; git show --name-only EXACTLY 8 files (5 handlers + http-proxy/index.ts + registry.ts + dev notebook); foreign-capture guard passed (no orch-state/ops/signal sweep); independent bunx tsc --noEmit exit 0; registry.ts wires EXACTLY 5 registrar fns (imports L120-124 + array L246-250 inside terminated TOOL_REGISTRARS — VMT-7-REGISTER merge gate satisfied in one atomic commit); fail-closed invariants confirmed at cited lines (7a BlocShare is_estimate PERMANENT Decision A; 7b OffshoreParked is_estimate always L57; 7d weight_pct nullable L41 null-preserved no coerce; 7e rate_1w_pct nullable L82 ALWAYS null + is_estimate PERMANENT L84 + blocked_reason required L86 Decision B); NO hardcoded base URL — getMacroBaseUrl() reads Bun.env.MACRO_INDICATORS_URL call-time (macroHttpClient.ts:15-16) env-generic; bun test 13037/0-fail. Merge gate SATISFIED. LIVE-verify (tool responds post-rebuild) pending ops."})
          else . end
      ] )
      else . end
  ]
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "BA-VN-MACRO-TOOLING",
    next_agent: "ops",
    note: "VN-MACRO-TOOLING VMT-7 Zone-B wave DONE (dev-mcp-server a6f068af, commit 5c2f4f63, router RAW-verified 8 gates GREEN: HEAD on main, 8-file scope, foreign-capture clean, independent tsc exit 0, registry wires EXACTLY 5 in terminated TOOL_REGISTRARS array, fail-closed is_estimate/blocked_reason invariants confirmed at cited lines 7a/7b/7d/7e, NO hardcoded URL getMacroBaseUrl()+MACRO_INDICATORS_URL env-generic, bun test 13037/0). All 6 VMT-7 (7a get_vn_trade_balance / 7b get_vn_bop / 7c get_vn_macro_indicators / 7d get_cpi_components / 7e get_vn_liquidity_state + VMT-7-REGISTER) status->done. CODE merge gate satisfied BUT 5 tools NOT YET LIVE (mcp-server container holds pre-VMT-7 image). === WAVE-2 serial Zone-A CLOSED (A1-A5) + Zone-B VMT-7 code DONE. === -> head dev->ops: REBUILD mcp-server (memory: rebuild after dev change; force-recreate single service, NEVER compose down — kills peers) + LIVE-VERIFY tool-count 157->162 (project-stats.json baseline) + probe one new tool live via gateway call_tool(server=vn-market, tool=get_vn_trade_balance). On ops live-green -> router updates project-stats.json toolCount->162 + PO final signoff (done_verified). Remaining open: VMT-3a-PMI blocked-probe5 (S&P Global dev-local). Commit explicit path only."
  }
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
