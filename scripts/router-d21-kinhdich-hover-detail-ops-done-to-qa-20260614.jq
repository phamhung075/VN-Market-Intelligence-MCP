# Router dev-team — KINHDICH-HOVER-DETAIL ops frontend rebuild DONE (router RAW-verified) -> qa LIVE gate.
# ops (ac42c0d0, notebook commit ba247805) rebuilt apps/frontend ONLY (targeted, no compose down).
# ROUTER INDEPENDENT RAW-VERIFY (not the ops badge):
#   - docker inspect frontend image = sha256:3ed501d2f5c2... (CHANGED from old 8978f8ce — new build deployed)
#   - docker ps frontend = Up healthy 0.0.0.0:3001->3001; 13 containers running (no peer kill cascade)
#   - curl -sI :3001/ = HTTP 200 OK
#   - SERVED-CHUNK LOAD-BEARING PROOF (the done_verified bar): curl :3001/assets/QueName-CweIuF2T.js (67522 bytes,
#     hash changed from prior C7QiQvgn) physically contains: Vietnamese labels "Trạng thái"/"Thuận"/"Cảnh báo"/
#     "Xem chi tiết" ALL FOUND; stateInterpretation x2 + favorable x2 + warning x2 (new QUE_DETAIL render);
#     que-descriptions-detail import x1 -> served data chunk que-descriptions-detail.generated-BvF1P1Ra.js.
#     The enriched "Tra cứu Kinh Dịch" hover tooltip is PHYSICALLY in the browser bundle on LIVE :3001.
# This write (ONE atomic temp->rename): on task BA-KINHDICH-HOVER-DETAIL in backlog[] set next_agent=qa,
#   stamp ops_rebuilt_at + ops_image + ops_commit + router_ops_reverify_verdict (served-chunk proof) +
#   qa_live_verify_checklist. SEPARATE chain from head (head owns VN-MACRO=pm) -> .head NOT touched. 0 new id-lines.
# GUARD: refuse unless BA-KINHDICH-HOVER-DETAIL in backlog[] next_agent=="ops" (ops stage current).
# Usage: jq --arg now "$NOW" -f scripts/router-d21-kinhdich-hover-detail-ops-done-to-qa-20260614.jq docs/data/orch/orch-state.json
def TASK: "BA-KINHDICH-HOVER-DETAIL";
($ARGS.named.now) as $now
| ([.task_board.backlog[]? | select(type=="object" and ((.id // "")==TASK))][0]) as $t
| if ($t == null) then error("BA-KINHDICH-HOVER-DETAIL not in backlog[] — refuse")
  elif (($t.next_agent // "") != "ops") then error("next_agent != ops (\($t.next_agent)) — refuse")
  else . end
| .task_board.backlog = [
    .task_board.backlog[] | if (type=="object" and ((.id // "")==TASK))
      then (. + {
        next_agent: "qa",
        ops_rebuilt_at: $now,
        ops_agent: "ac42c0d0",
        ops_commit: "ba247805",
        ops_image: "3ed501d2f5c2 (was 8978f8ce)",
        router_ops_reverify_verdict: "RAW-RE-VERIFIED INDEPENDENTLY (not the ops badge). docker inspect frontend image=sha256:3ed501d2f5c2 (CHANGED from 8978f8ce — genuine new build deployed); docker ps frontend Up healthy :3001; 13 containers running (no peer kill cascade); curl -sI :3001/ HTTP 200. SERVED-CHUNK LOAD-BEARING PROOF: curl :3001/assets/QueName-CweIuF2T.js (67522 bytes, hash changed from prior C7QiQvgn) physically carries Vietnamese labels 'Trạng thái'/'Thuận'/'Cảnh báo'/'Xem chi tiết' ALL FOUND + stateInterpretation x2 + favorable x2 + warning x2 (new QUE_DETAIL render) + que-descriptions-detail import x1 -> served data chunk que-descriptions-detail.generated-BvF1P1Ra.js. The enriched Tra-cứu-Kinh-Dịch hover tooltip is PHYSICALLY in the LIVE :3001 browser bundle. done_verified technical bar already MET at served layer; qa formalizes with rendered-hover sampling + Task Report.",
        qa_live_verify_checklist: "LIVE-verify on :3001 (NOT container health — RENDER proof). (1) PRIMARY served-chunk proof (router pre-confirmed, corroborate): curl :3001/assets/QueName-CweIuF2T.js -> grep stateInterpretation/favorable/warning + labels Trạng thái/Thuận/Cảnh báo present. (2) Rendered hover: sample quẻ across favorable/neutral/unfavorable trends + a terse one (29 Khảm / 47 Khốn) — tooltip shows coreMeaning + Trạng thái + Thuận + Cảnh báo + trend (NOT just the old one-line summary); phases[] 6-hào table ABSENT (reference-page only). (3) FR-3 fallback: any quẻ lacking a QUE_DETAIL entry still renders desc.hoverSummary??coreMeaning (no crash). (4) FR-4 'Xem chi tiết →' deep-link present + points to dashboard.kinh-dich-reference. (5) NFR-1 layout: 4-clause tooltip at max-w-sm text-xs wraps cleanly, no screen-edge overflow on mobile viewport. (6) Vietnamese readability for non-technical user. Report PASS/FAIL per item + the served-chunk grep result (load-bearing). On qa APPROVE -> po final signoff -> done_verified."
      })
      else . end
  ]
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
