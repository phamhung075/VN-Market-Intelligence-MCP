# Router dev-team dispatcher — KINHDICH-HOVER-ENRICH ops-rebuild GREEN but WRONG-SURFACE discovered -> escalate to PO re-scope.
# ops (a029277a5cec35216) returned GREEN: image d0dfa1b5ec86->ebf5048ffff0, builder prune 470.1MB, 11 peers all Up+healthy,
#   /health + /market 200. ops itself = clean (rebuild-recreate-destroys-peers guard held; image id changed; prune ran).
# BUT ops also flagged: "kinh-dich-service does not serve static dashboard HTML/JS — JSON APIs only." Router RAW-VERIFIED that flag
#   INDEPENDENTLY (BIDIRECTIONAL — a GREEN rebuild is worthless if the enriched JS reaches no browser):
#   (1) curl :5005 GET / , /dashboard/ , /que-reference.js , /index.html = ALL 404 text/plain.
#   (2) docker exec ls /app = {server, api, data} — NO /app/dashboard in image. Dockerfile COPYs only /app/server + /app/api.
#       cmd/server has zero http.FileServer/static route; only cmd/sandbox (dev -emit-reference writer) touches dashboard/.
#   => kinh-dich-service container NEVER serves the dashboard. The architect-ratified premise ("Go binary serves the static
#      dashboard -> rebuild ships the new que-reference.js") is FACTUALLY FALSE. The rebuild was a NO-OP for the user complaint.
#   (3) apps/kinh-dich-service/dashboard/index.html = a DEV-ONLY file:// G9 trust-contract sandbox (pilot-status-kinh-dich.json:
#       "opens file://...dashboard/index.html via headless chromium"). The non-technical user never opens it.
#   (4) THE REAL USER-FACING que hover = Remix frontend (:3001) apps/frontend/app/components/QueName.tsx -> Radix Tooltip ->
#       QUE_DESCRIPTIONS from apps/frontend/app/lib/que-descriptions.generated.ts, which carries coreMeaning (65x), NOT
#       hoverSummary. Codegen scripts/gen-que-descriptions.ts maps ONLY coreMeaning.vi -> QueDescription.coreMeaning.
#   NET: dev enriched the SSOT (hoverSummary in hexagram_reference.go + que-reference.js = GOOD reusable groundwork) but swapped
#   the WRONG render surface (file:// dev sandbox) and never touched the codegen/QueName path that actually reaches the browser.
#   The task done-bar ("user sees richer hover") is NOT met. Wrong-surface error propagated BA->architect->dev->ops.
# PRODUCT RE-DECISION REQUIRED (PO): compounded by QUE-TOOLTIP-DRY design (terse coreMeaning tooltip BY DESIGN + deep-link to a
#   full-detail reference page dashboard.kinh-dich-reference.tsx). Does enriching the :3001 QueName tooltip to hoverSummary
#   (80-220 char middle summary) align, or does it regress the deliberate terse-tooltip contract? Is the frontend delivery path
#   (extend gen-que-descriptions.ts to emit hoverSummary -> QueName.tsx render w/ coreMeaning fallback -> rebuild frontend) in
#   scope for THIS task or a follow-up? PO rules; may re-engage BA/architect.
# This write (ONE atomic temp->rename): KINHDICH-HOVER-ENRICH stays in in_progress[]; status dev-impl-done->"ops-green-wrong-surface";
#   next_agent ops->po; records ops_rebuild_result + router_ops_reverify_verdict + po_rescope_request. head -> in_progress/next=po.
#   ARCH-CRON-SCHEDULER-RELIABILITY (passive Mon-gate) + ARCH-SHIP-WAVE-REAUDIT (PARKED) untouched. Concurrent dirty tree untouched.
# GUARD: refuse unless task in in_progress[] with status "dev-impl-done" and next_agent=="ops".
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — ops-result -> router re-verify -> escalate PO on premise-fail).
# Usage: jq --arg now "$NOW" -f scripts/router-d6-kinhdich-hover-ops-to-po-wrongsurface-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.in_progress // []) as $ip
| ([$ip[] | select(type=="object" and ((.id // "")=="KINHDICH-HOVER-ENRICH"))][0]) as $t
| if $t == null then error("KINHDICH-HOVER-ENRICH not in in_progress[] — refuse")
  elif ($t.status != "dev-impl-done") then error("status != dev-impl-done (\($t.status)) — refuse")
  elif (($t.next_agent // null) != "ops") then error("next_agent != ops (\($t.next_agent)) — refuse")
  else . end
| .task_board.in_progress = [
    ($ip[] | if (type=="object" and ((.id // "")=="KINHDICH-HOVER-ENRICH"))
      then (. + {
        status: "ops-green-wrong-surface",
        next_agent: "po",
        ops_rebuild_done_at: $now,
        ops_rebuild_result: "GREEN (ops a029277a): kinh-dich-service image d0dfa1b5ec86->ebf5048ffff0, Up+healthy, builder prune 470.1MB, all 11 peers Up+healthy (no peer recreate), /health+/market 200. Rebuild action itself clean.",
        router_ops_reverified_at: $now,
        router_ops_reverify_verdict: "BLOCK-PROMOTE — ops rebuild clean BUT WRONG-SURFACE root cause confirmed RAW. curl :5005 GET / //dashboard/ //que-reference.js //index.html = ALL 404; docker exec ls /app = {server,api,data}, NO /app/dashboard (Dockerfile copies only server+api; cmd/server has no FileServer route). kinh-dich-service container NEVER serves the dashboard -> architect premise 'Go binary serves static dashboard -> rebuild ships JS' is FALSE; rebuild was a no-op for the user complaint. index.html = dev-only file:// G9 sandbox (pilot-status), not user-facing. REAL user que hover = Remix :3001 QueName.tsx -> Tooltip -> que-descriptions.generated.ts (carries coreMeaning x65, NOT hoverSummary; codegen gen-que-descriptions.ts maps only coreMeaning.vi). Dev enriched SSOT (hoverSummary in hexagram_reference.go + que-reference.js = good groundwork) but swapped the wrong render surface + never touched the codegen/QueName delivery path. Done-bar 'user sees richer hover' NOT met.",
        po_rescope_request: "RE-SCOPE: (a) SSOT enrichment (hoverSummary in que-reference.js, 64x) is DONE + reusable — keep. (b) REMAINING user-facing path = extend scripts/gen-que-descriptions.ts to emit hoverSummary into apps/frontend/app/lib/que-descriptions.generated.ts + update apps/frontend/app/components/QueName.tsx to render hoverSummary (fallback coreMeaning) + rebuild frontend container (:3001). (c) TENSION: QUE-TOOLTIP-DRY made the tooltip terse BY DESIGN (coreMeaning) + deep-links to full-detail reference page dashboard.kinh-dich-reference.tsx — does enriching the tooltip to an 80-220 char hoverSummary align with the user's 'too short' complaint, or should the richer text live only on the reference page with the tooltip staying terse? PO RULES the product direction + whether the frontend delivery is THIS task (extend) or a NEW follow-up task; may re-engage BA/architect (their index.html surface ID was wrong). Revert/keep the file:// index.html L2501 swap is PO's call (harmless either way — sandbox only). Recommend: KEEP SSOT groundwork, OPEN follow-up KINHDICH-HOVER-ENRICH-FE for the codegen+QueName+rebuild path, route the wrong-surface lesson to memory."
      })
      else . end)
  ]
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "KINHDICH-HOVER-ENRICH",
    next_agent: "po",
    note: "KINHDICH-HOVER-ENRICH: ops rebuild GREEN (image ebf5048ffff0, prune 470MB, peers intact) BUT router RAW-re-verify caught WRONG-SURFACE root cause — kinh-dich-service :5005 serves JSON only (GET / //dashboard//que-reference.js//index.html ALL 404; no /app/dashboard in image; Dockerfile copies server+api only). Architect premise 'Go binary serves dashboard -> rebuild ships JS' FALSE; index.html = dev file:// G9 sandbox, not user-facing. REAL user hover = Remix :3001 QueName.tsx -> que-descriptions.generated.ts (coreMeaning, not hoverSummary). Dev enriched SSOT (hoverSummary x64 in que-reference.js = good groundwork) but wrong render surface + missing codegen/QueName delivery. Done-bar NOT met. -> ESCALATE PO re-scope: keep SSOT, decide frontend delivery (gen-que-descriptions.ts emit hoverSummary + QueName render + frontend rebuild) THIS-task-or-follow-up, resolve QUE-TOOLTIP-DRY terse-tooltip-vs-reference-page tension; may re-engage BA/architect. ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15. ARCH-SHIP-WAVE-REAUDIT PARKED. WIP=1. Commit explicit path only."
  }
