# Router dev-team dispatcher — KINHDICH-HOVER-ENRICH-FE ops-rebuild GREEN (RAW-verified) -> qa LIVE-verify gate.
# ops (acac836d) returned GREEN: frontend image 3a4f33c7->d349d070 (CHANGED = new build deployed, not cached), Up+healthy,
#   :3001 curl 200 OK, builder prune 1.696GB, all peers Up (13 running, none down). Notebook commit 2d6bd720 (explicit-path ops.md).
#   Router RAW-RE-VERIFIED: docker inspect frontend image == d349d070 (!= old 3a4f33c7); docker ps frontend Up+healthy :3001;
#   curl -sI :3001 = HTTP 200; 13 containers running (no peer down). Build genuinely deployed.
# BUT (bidirectional): a NEW image + 200 OK proves the BUILD shipped, NOT that the rendered quẻ hover shows the richer hoverSummary.
#   This is the exact wrong-surface trap that started the re-scope (prior chain went green on a non-user surface). qa MUST verify the
#   SERVED bundle actually carries hoverSummary AND the rendered tooltip displays it — not just container liveness.
# This write (ONE atomic temp->rename): FE stays in in_progress[]; status dev-impl-done->ops-rebuilt; next_agent ops->qa;
#   records ops_rebuild_result + router_ops_reverify_verdict + qa_live_verify_checklist. head -> in_progress/next=qa.
# GUARD: refuse unless FE in in_progress[] with status=="dev-impl-done" and next_agent=="ops".
# Usage: jq --arg now "$NOW" -f scripts/router-d11-kinhdich-fe-ops-to-qa-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ([.task_board.in_progress[]? | select(type=="object" and ((.id // "")=="KINHDICH-HOVER-ENRICH-FE"))][0]) as $fe
| if ($fe == null) then error("KINHDICH-HOVER-ENRICH-FE not in in_progress[] — refuse")
  elif ($fe.status != "dev-impl-done") then error("FE status != dev-impl-done (\($fe.status)) — refuse")
  elif (($fe.next_agent // null) != "ops") then error("FE next_agent != ops (\($fe.next_agent)) — refuse")
  else . end
| .task_board.in_progress = [
    .task_board.in_progress[] | if (type=="object" and ((.id // "")=="KINHDICH-HOVER-ENRICH-FE"))
      then (. + {
        status: "ops-rebuilt",
        next_agent: "qa",
        ops_rebuilt_at: $now,
        ops_rebuild_result: "GREEN (ops acac836d): frontend image 3a4f33c7->d349d070 (CHANGED, new build deployed not cached), Up+healthy :3001, curl 200 OK, builder prune 1.696GB, all peers Up (13 running, none down). Notebook 2d6bd720.",
        router_ops_reverify_verdict: "RAW-RE-VERIFIED: docker inspect frontend image=d349d070 (!= old 3a4f33c7); docker ps frontend Up+healthy 0.0.0.0:3001; curl -sI :3001 HTTP 200; 13 containers running no-peer-down. Build genuinely deployed. NOTE: liveness != render proof — qa must confirm the served bundle carries hoverSummary AND the tooltip renders it (wrong-surface guard).",
        qa_live_verify_checklist: "LIVE-verify on :3001 (NOT container health — RENDER proof): (1) PRIMARY raw-delivery proof — fetch the deployed QueName JS asset from :3001 and grep the SERVED bundle for a known hoverSummary substring (e.g. a distinctive phrase from quẻ 1 or 47 in que-descriptions.generated.ts) to prove the new text is actually in the shipped bundle, not just the source file. (2) Rendered hover: sample quẻ across favorable/neutral/unfavorable + a terse one (e.g. 29 Khảm, 47 Khốn) — tooltip shows the richer ~150-220-char hoverSummary, NOT the old short coreMeaning. (3) Fallback: any quẻ lacking hoverSummary still renders coreMeaning (?? operator). (4) Layout/NFR-3: longest hoverSummary (~210-220 chars) wraps ~4-5 lines at text-xs/max-w-xs with NO screen-edge overflow on mobile viewport. (5) Vietnamese readability for non-technical user (no unexplained jargon/Hán-Việt). Report PASS/FAIL per item + the served-bundle grep result (the load-bearing proof)."
      })
      else . end
  ]
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "KINHDICH-HOVER-ENRICH-FE",
    next_agent: "qa",
    note: "KINHDICH-HOVER-ENRICH-FE ops REBUILD GREEN (acac836d, frontend image 3a4f33c7->d349d070 CHANGED, Up+healthy :3001 200, prune 1.696GB, 13 peers no-down) + router RAW-re-verified (inspect image==d349d070, curl 200). -> qa LIVE-verify gate: PRIMARY = grep the SERVED :3001 QueName bundle for a known hoverSummary substring (raw-delivery proof the new text shipped, the wrong-surface guard); THEN rendered hover shows richer hoverSummary across favorable/neutral/unfavorable + terse quẻ (29/47), coreMeaning fallback intact, no mobile overflow (longest ~210-220 chars), Vietnamese readable. -> po signoff -> done_verified. Single zone apps/frontend. ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15. ARCH-SHIP-WAVE-REAUDIT PARKED. VN-MACRO-TOOLING (PO sprint, macro/mcp) concurrent no-conflict. WIP=1. Commit explicit path only."
  }
