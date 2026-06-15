# Router dev-team — F-NSO-SELECTOR code-done finalize (router RAW-verified GREEN, NOT dev badge) + head dev->ops (REBUILD + LIVE-verify).
# dev-macro-indicators (agent aee85909d3cb4954b, commit 74dfdb0a) fixed reBaiTop absolute-URL regex + simplified extractLatestPressURL; CA intermediate baked in-image (0608f6aa).
# The dev agent itself moved F-NSO ready->done in the working tree (dev-agent board mutation — router re-authors authoritatively here; content RAW-verified correct, no concurrent CI orch-state edit in diff).
# ROUTER INDEPENDENT RAW-VERIFY (not the dev badge):
#   G1 74dfdb0a on main HEAD (NO branches — commit-to-main == merge gate).
#   G2 git show --name-only = 2 files, BOTH apps/macro-indicators/pkg/infrastructure/{cache_vmt_nso.go,cache_vmt_nso_selector_test.go}; NO orch-state in commit; foreign-capture NONE.
#   G3 working tree: orch-state dirty = ONLY the macro agent's F-NSO done-move (+ the OTHER lane's in-flight mcp-server test edits, untouched here); no dangling macro .go.
#   G4 independent UNCACHED go build rc=0 + go vet ./pkg/... rc=0 + go test -count=1 ./pkg/infrastructure PASS 8.9s (re-run, not the dev badge).
#   G5 fix correct+generic: reBaiTop = href="(https://www\.nso\.gov\.vn/bai-top/(\d{4})/(\d{2})/[^"]+)" captures [1]=abs URL [2]=YYYY [3]=MM for ANY month (no hardcode); extractLatestPressURL FindSubmatch, rePeriod + relative-fallback REMOVED. /goal#2 generic.
#   CA: GlobalSign RSA OV SSL CA 2018 intermediate baked in-image via Dockerfile COPY certs/globalsign-rsa-ov-ssl-ca-2018.pem + RUN update-ca-certificates (0608f6aa) — durable across container/VPS restart, NO /tmp.
# CONTEXT: container macro-indicators-1 holds pre-74dfdb0a image -> CODE merge gate satisfied but fix NOT LIVE (regex + CA cert both need the new image).
# This write (ONE atomic temp->rename): F-NSO-SELECTOR done + router fields; head dev->ops. 0 new id-lines (status already done; adds done_commit/verdict).
# GUARD: refuse unless F-NSO-SELECTOR exists, status=="done", AND done_commit==null (not yet router-finalized — idempotency).
# Usage: jq --arg now "$NOW" -f scripts/router-d43-fnso-done-ops-rebuild-20260615.jq docs/data/orch/orch-state.json
def NSO: "F-NSO-SELECTOR";
($ARGS.named.now) as $now
| ([.. | objects | select(.id?==NSO)][0]) as $n
| if ($n==null) then error("F-NSO-SELECTOR not found — refuse")
  elif (($n.status//"")!="done") then error("F-NSO-SELECTOR status != done (\($n.status//"missing")) — refuse")
  elif ($n.done_commit != null) then error("F-NSO-SELECTOR already router-finalized (done_commit=\($n.done_commit)) — refuse")
  else . end
| ("RAW-VERIFIED (router independent re-verify, NOT dev badge): G1 74dfdb0a on main HEAD; G2 commit = 2 files apps/macro-indicators/pkg/infrastructure/{cache_vmt_nso.go,cache_vmt_nso_selector_test.go} ONLY, foreign-capture NONE, orch-state NOT in commit; G3 working tree clean of dangling macro .go; G4 independent UNCACHED go build rc=0 + go vet ./pkg/... rc=0 + go test -count=1 ./pkg/infrastructure PASS 8.9s; G5 fix correct+generic — reBaiTop absolute-URL regex captures [1]=URL [2]=YYYY [3]=MM for ANY month (no hardcode), extractLatestPressURL FindSubmatch with rePeriod + relative-fallback REMOVED. CA: GlobalSign RSA OV SSL CA 2018 intermediate baked in-image via Dockerfile COPY certs/globalsign-rsa-ov-ssl-ca-2018.pem + update-ca-certificates (0608f6aa) — durable, no /tmp. CODE merge gate satisfied; LIVE-verify pending ops rebuild (container holds pre-74dfdb0a image; both regex + CA cert need the new image).") as $verdict
| walk(if (type=="object" and (.id?==NSO))
        then (. + {done_at:$now, done_commit:"74dfdb0a", done_agent:"aee85909d3cb4954b", router_reverify_verdict:$verdict})
        else . end)
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: NSO,
    next_agent: "ops",
    note: "F-NSO-SELECTOR CODE DONE (dev-macro-indicators aee85909d3cb4954b, commit 74dfdb0a, router RAW-verified GREEN: on-main; 2 files all apps/macro-indicators/pkg/infrastructure; foreign-capture NONE; independent UNCACHED go build/vet rc=0 + go test -count=1 ./pkg/infrastructure PASS; reBaiTop absolute-URL regex generic [1]=URL/[2]=YYYY/[3]=MM, rePeriod + relative-fallback removed; CA GlobalSign intermediate baked in-image 0608f6aa durable no-/tmp; /goal#2 generic). CODE merge gate satisfied BUT NOT LIVE — container macro-indicators-1 holds pre-74dfdb0a image (regex + CA cert both need new image). === -> head dev->ops: FORCE-RECREATE macro-indicators single service (memory: rebuild after dev change; NEVER compose down — kills peers ~21min); verify new image ID + 74dfdb0a on HEAD + peers stay healthy. Then LIVE-verify via gateway re-probe (NOT badges) ACROSS >=2 TIMING WINDOWS (fast-fail-window trap): get_vn_trade_balance + get_vn_macro_indicators + get_cpi_components must each return REAL data (status NOT degraded, is_estimate=false, real numeric fields) — this is the ACCURACY gate (the whole point: NSO selector now matches absolute URLs + CA cert lets the HTTPS fetch complete). On ops live-result -> ROUTER re-probes each tool ITSELF across timing (not ops badge) + disambiguates proxy-down (curl :3128) vs upstream-empty. If router live-green (REAL data, not degraded): promote F-NSO-SELECTOR done_verified + UNBLOCK F-BOP-QUERY-RECON (sequence_after=F-NSO-SELECTOR -> ops-vps-fetch recon next) + release SF-1. If still degraded/empty after rebuild: keep done, WITHHOLD done_verified, route accuracy root to ops-vps-fetch LIVE recon (NOT a dev guess) — same symptom-peel discipline as F-BOP-ENCODING. === OTHER LANE (in flight, untouched): CI-RED-d20468c0-FIX in_progress/dev-mcp-server (agent ad7c357d49c10d38e) — on its return router RAW-verify gates (on-main, files in-zone apps/mcp-server, foreign-capture none, independent uncached bun test 4-files green) -> head dev->ops REBUILD mcp-server (force-recreate single svc, NEVER compose down) -> live CI re-verify (push SHA != d20468c0 turns origin GitHub Actions green) -> done_verified. === F-BOP-ENCODING stays done (done_verified WITHHELD pending F-BOP-QUERY-RECON real-data restoration). HELD (unchanged): S2 07-06 methodology brief (agent-father); F3 cronJobCount (dev-mcp-server low); VMT-3a-PMI blocked-probe5; FIX-SBV-FX-VPS-FETCHER-UNHEALTHY + FIX-NEWS-VPS-CRASH-LOOP + OPS-POLLNEWS-NIGHT-ZERO + tinyproxy ACL-open hardening (ops/infra lane); 2x context-bloat (maintenance lane); FIX-FB-POSTER-NOARG-MARKET-TOOLS; Monday 2026-06-15 market-day gate (ARCH-CRON G1/G2/G3 + F-EOD LIVE re-verify); release batch CTG/VCB/D2D BLOCKED on undeployed bug #2776 (signal #6120). Commit explicit path only."
  }
| ._updated_at = $now
| ._updated_by = "dev-team"
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
