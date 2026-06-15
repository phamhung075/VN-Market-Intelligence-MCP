# Router dev-team — F-BOP-ENCODING in_progress->done (router RAW-verified gates GREEN, NOT dev badge) + head dev->ops (REBUILD + LIVE-verify).
# dev-macro-indicators (agent a32657d545b6eb455, commit 400610e5) replaced raw string-concat OData URL with url.Values{}.Encode() in
#   pkg/infrastructure/parsers_vmt_bop.go BuildBOPFetchURL (use-case delegates via BOPURLBuilder iface). 3 files all apps/macro-indicators/**.
# ROUTER INDEPENDENT RAW-VERIFY (not the dev badge):
#   G1 400610e5 on main (NO branches — commit-to-main == merge gate), ancestor of HEAD.
#   G2 git show --name-only = 3 files ALL apps/macro-indicators/** (parsers_vmt_bop.go + 2 tests); NO orch-state; foreign-capture NONE.
#   G3 orch-state NOT captured in commit.
#   G4 independent UNCACHED go build rc=0 + go vet rc=0 + go test -count=1 ./pkg/... ALL 11 packages PASS (re-run, not the dev badge).
#   G5 fix correct+generic: url.Values{} assembles every param ($filter/scopeKey/contentStructureId/pageSize) -> uniform percent-encode of spaces+single-quotes+operators for ANY filter expr. VMT-8 degrade builders + FetchBudgetSec const UNTOUCHED. /goal#2 generic.
#   Unit gate: parsers_vmt_bop_test.go (table-driven Q4-25/Q1-26/Q3-25/Q2-25: no literal space/quote, url.ParseQuery round-trip) + usecases_vmt_bop_test.go (encodingBOPURLBuilder + urlCapturingFetcher end-to-end). PASS.
# CONTEXT: container macro-indicators-1 = pre-400610e5 image c6793a0222e3 -> CODE merge gate satisfied but fix NOT LIVE.
# This write (ONE atomic temp->rename): F-BOP-ENCODING in_progress->done + done markers + router_reverify_verdict; head dev->ops. 0 new id-lines (status flip only).
# GUARD: refuse unless head.next_agent=="dev" AND F-BOP-ENCODING status=="in_progress".
# Usage: jq --arg now "$NOW" -f scripts/router-d40-fbop-done-ops-rebuild-20260615.jq docs/data/orch/orch-state.json
def BOP: "F-BOP-ENCODING";
($ARGS.named.now) as $now
| ([.task_board.ready[]?,.task_board.backlog[]? | select(type=="object" and ((.id // "")==BOP))][0]) as $bop
| if (.head.next_agent != "dev") then error("head.next_agent != dev (\(.head.next_agent)) — refuse")
  elif ($bop == null) then error("F-BOP-ENCODING not found — refuse")
  elif (($bop.status // "") != "in_progress") then error("F-BOP-ENCODING status != in_progress (\($bop.status)) — refuse")
  else . end
| .task_board.ready = [ .task_board.ready[]?
    | if (type=="object" and ((.id // "")==BOP))
        then (. + {status:"done", done_at:$now, done_commit:"400610e5", done_agent:"a32657d545b6eb455",
          router_reverify_verdict:"RAW-VERIFIED (not dev badge) — gates GREEN: 400610e5 on main, ancestor of HEAD; 3 files all apps/macro-indicators/** (parsers_vmt_bop.go + 2 tests), foreign-capture NONE, orch-state NOT captured; independent UNCACHED go build/vet rc=0 + go test -count=1 ./pkg/... all 11 pkgs PASS. Fix: url.Values{}.Encode() in BuildBOPFetchURL -> generic percent-encode of every OData param (spaces/single-quotes/operators); VMT-8 degrade + FetchBudgetSec UNTOUCHED. Tests: parsers_vmt_bop_test (table-driven no-literal-space + ParseQuery round-trip) + usecases end-to-end encoded-URL capture. CODE merge gate satisfied; LIVE-verify pending ops rebuild (container pre-400610e5 image c6793a0222e3)."})
        else . end ]
| .task_board.backlog = [ .task_board.backlog[]?
    | if (type=="object" and ((.id // "")==BOP))
        then (. + {status:"done", done_at:$now, done_commit:"400610e5", done_agent:"a32657d545b6eb455"})
        else . end ]
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: BOP,
    next_agent: "ops",
    note: "F-BOP-ENCODING DONE (dev-macro-indicators a32657d545b6eb455, commit 400610e5, router RAW-verified GREEN: on-main ancestor-of-HEAD; 3 files all apps/macro-indicators/** parsers_vmt_bop.go + 2 tests; foreign-capture NONE; orch-state NOT captured; independent UNCACHED go build/vet rc=0 + go test -count=1 ./pkg/... all 11 pkgs PASS; fix url.Values{}.Encode() in BuildBOPFetchURL = generic percent-encode every OData param; VMT-8 degrade + FetchBudgetSec UNTOUCHED; tests table-driven no-literal-space + end-to-end encoded-URL capture; generic /goal#2). CODE merge gate satisfied BUT NOT LIVE — container macro-indicators-1 holds pre-400610e5 image c6793a0222e3. === -> head dev->ops: FORCE-RECREATE macro-indicators single service (memory: rebuild after dev change; NEVER compose down — kills peers ~21min); verify NEW image ID != c6793a0222e3 + 400610e5 on HEAD + 11 peers stay healthy. Then LIVE-verify via gateway re-probe (NOT badges) ACROSS >=2 TIMING WINDOWS (fast-fail-window trap): get_vn_bop must now return REAL balance-of-payments data WITHIN the gateway deadline — is_estimate=false (real) OR honest-degraded ONLY IF SBV is genuinely down (NO MORE blocked_reason='context deadline exceeded' from a malformed URL — that exact symptom must be GONE). On ops live-result -> ROUTER re-probes get_vn_bop ITSELF across timing (not ops badge) + disambiguates (curl SBV/:3128 if still degraded). If router live-green (real bop data, no deadline-exceeded): promote F-BOP-ENCODING done_verified + RELEASE F-NSO-SELECTOR (sequence_after F-BOP-ENCODING satisfied -> dispatch recon-first to ops-vps-fetch). === SEQUENCED-AFTER (still HELD): F-NSO-SELECTOR (recon-first ops-vps-fetch on NEW NSO WordPress HTML, then dev-macro-indicators; rebase 400610e5). Commit explicit path only."
  }
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
