# Router dev-team dispatcher — KINHDICH-HOVER-ENRICH-FE qa APPROVED (router RAW-re-verified served-bundle proof) -> po final signoff.
# qa (a28441fe, commit a68d5d3f explicit-path: qa.md + sprint-KINHDICH-HOVER-ENRICH-FE-qa.md) returned APPROVED. PRIMARY load-bearing
#   proof (the wrong-surface guard): both known hoverSummary substrings (quẻ1 "Giai đoạn năng lượng mạnh nhất", quẻ47 "kiệt sức và
#   bị bóp nghẹt") FOUND in the SERVED :3001 bundle /assets/QueName-C7QiQvgn.js (loaded by /dashboard/kinh-dich-signals + /analysis —
#   the REAL user tooltip surface; the prior wrong-surface dashboard.kinh-dich-reference uses QUE_DETAIL w/ no hoverSummary). 64
#   hoverSummary in bundle, fallback operator present, 172-224 char range avg 194 (old coreMeaning ~40-70), plain VN readable.
# Router RAW-RE-VERIFIED THE LOAD-BEARING PROOF INDEPENDENTLY (bidirectional — this is THE gate the re-scope hinged on):
#   curl :3001/assets/QueName-C7QiQvgn.js (66763 bytes) -> quẻ1 substring hit=1, quẻ47 hit=1, hoverSummary token x65, hoverSummary?? x1.
#   The richer VN text is PHYSICALLY in the browser bundle. Wrong-surface error corrected + live-verified at the served layer.
# This write (ONE atomic temp->rename): FE stays in in_progress[]; status ops-rebuilt->qa-approved; next_agent qa->po;
#   records qa_verdict + qa_commit + router_qa_reverify_verdict. head -> in_progress/next=po.
# GUARD: refuse unless FE in in_progress[] with status=="ops-rebuilt" and next_agent=="qa".
# Usage: jq --arg now "$NOW" -f scripts/router-d12-kinhdich-fe-qa-to-po-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ([.task_board.in_progress[]? | select(type=="object" and ((.id // "")=="KINHDICH-HOVER-ENRICH-FE"))][0]) as $fe
| if ($fe == null) then error("KINHDICH-HOVER-ENRICH-FE not in in_progress[] — refuse")
  elif ($fe.status != "ops-rebuilt") then error("FE status != ops-rebuilt (\($fe.status)) — refuse")
  elif (($fe.next_agent // null) != "qa") then error("FE next_agent != qa (\($fe.next_agent)) — refuse")
  else . end
| .task_board.in_progress = [
    .task_board.in_progress[] | if (type=="object" and ((.id // "")=="KINHDICH-HOVER-ENRICH-FE"))
      then (. + {
        status: "qa-approved",
        next_agent: "po",
        qa_approved_at: $now,
        qa_commit: "a68d5d3f",
        qa_verdict: "APPROVED (qa a28441fe). PRIMARY served-bundle proof PASS: hoverSummary substrings (quẻ1, quẻ47) FOUND in served :3001 /assets/QueName-C7QiQvgn.js (real tooltip surface, loaded by /dashboard/kinh-dich-signals + /analysis). 64 hoverSummary in bundle, fallback hoverSummary??coreMeaning present, 172-224 char range avg 194 (old coreMeaning ~40-70), NFR-3 wraps 4-5 lines no overflow, plain VN readable (quẻ29/47 spot-checked) — addresses the 'too short/complicated' complaint. Browser-E2E not drivable headless; served-bundle proof is authoritative.",
        router_qa_reverify_verdict: "RAW-RE-VERIFIED THE LOAD-BEARING PROOF INDEPENDENTLY: curl :3001/assets/QueName-C7QiQvgn.js (66763 bytes) -> quẻ1 substring hit=1, quẻ47 hit=1, hoverSummary token x65, hoverSummary?? fallback x1. Richer VN text PHYSICALLY in the browser bundle. Wrong-surface error corrected + verified at the served layer. qa commit a68d5d3f explicit-path (qa.md + decision journal), no foreign sweep. READY for po final signoff -> done_verified."
      })
      else . end
  ]
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "KINHDICH-HOVER-ENRICH-FE",
    next_agent: "po",
    note: "KINHDICH-HOVER-ENRICH-FE qa APPROVED (a28441fe, commit a68d5d3f) + router RAW-re-verified the LOAD-BEARING served-bundle proof INDEPENDENTLY: curl :3001/assets/QueName-C7QiQvgn.js -> hoverSummary substrings quẻ1+quẻ47 FOUND, token x65, fallback x1. Richer VN hover text physically in the browser bundle on the REAL user surface (/dashboard/kinh-dich-signals + /analysis). Wrong-surface error CORRECTED + live-verified. Chain po->BA->architect->dev-frontend->ops->qa ALL GREEN+RAW-verified (commits c5ee21ae, 067e484d, d349d070 img, a68d5d3f). -> po FINAL SIGNOFF -> done_verified (close to done[], record product acceptance: user complaint 'que hover too short/cryptic' resolved with 64 richer 150-224char VI hoverSummary). PO: fresh-read orch-state, explicit-path commit, do NOT touch concurrent VN-MACRO-TOOLING tasks. ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15. ARCH-SHIP-WAVE-REAUDIT PARKED. WIP=1. Commit explicit path only."
  }
