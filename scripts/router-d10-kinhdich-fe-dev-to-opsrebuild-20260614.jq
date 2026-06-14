# Router dev-team dispatcher — KINHDICH-HOVER-ENRICH-FE dev-frontend GREEN -> ops frontend-rebuild gate (then qa-live).
# dev-frontend (adf783cd) returned DONE (commit 067e484d). Router RAW-RE-VERIFIED INDEPENDENTLY (not the dev badge):
#   git show 067e484d --stat = EXACTLY 3 impl files + notebook (QueName.tsx 1-line, que-descriptions.generated.ts +66,
#     scripts/gen-que-descriptions.ts +6, dev-frontend.md) — NO foreign sweep (concurrent PO-sprint skills/flows preserved).
#   FR-1: gen-que-descriptions.ts L102 hoverSummary = entry.hoverSummary.vi.replace(/`/g,"\\`") + L108 emit + L71/L125 type.
#   FR-2: generated.ts hoverSummary x64 (all >=80 chars, 0 short via char-accurate node check), coreMeaning x64 intact,
#     AUTO-GENERATED header preserved. FR-3: QueName.tsx:75 = {desc.hoverSummary ?? desc.coreMeaning} (coreMeaning fallback);
#     marketTrendLabel L76-78 + withDetailLink L79-86 untouched. tsc --noEmit = zero errors.
#   QA NOTE: longest hoverSummary ~210-220 chars -> ~4-5 lines at text-xs/max-w-xs; confirm no mobile screen-edge overflow on live hover.
# REBUILD GATE: Remix frontend container serves the bundled generated.ts -> new hoverSummary NOT served until apps/frontend rebuilt.
#   ops MUST (targeted, NEVER docker compose down): `docker compose build frontend && docker compose up -d --no-deps frontend &&
#   docker builder prune -f`. NOT kinh-dich-service (that was the wrong surface). Then `docker ps -a` peers-intact + image-id-changed.
# This write (ONE atomic temp->rename): FE stays in in_progress[]; status in-progress->dev-impl-done; next_agent dev-frontend->ops;
#   records dev_impl_commit + router_dev_reverify_verdict + ops_rebuild_instructions. head -> in_progress/next=ops.
# GUARD: refuse unless FE in in_progress[] with status=="in-progress" and next_agent=="dev-frontend".
# Usage: jq --arg now "$NOW" -f scripts/router-d10-kinhdich-fe-dev-to-opsrebuild-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ([.task_board.in_progress[]? | select(type=="object" and ((.id // "")=="KINHDICH-HOVER-ENRICH-FE"))][0]) as $fe
| if ($fe == null) then error("KINHDICH-HOVER-ENRICH-FE not in in_progress[] — refuse")
  elif ($fe.status != "in-progress") then error("FE status != in-progress (\($fe.status)) — refuse")
  elif (($fe.next_agent // null) != "dev-frontend") then error("FE next_agent != dev-frontend (\($fe.next_agent)) — refuse")
  else . end
| .task_board.in_progress = [
    .task_board.in_progress[] | if (type=="object" and ((.id // "")=="KINHDICH-HOVER-ENRICH-FE"))
      then (. + {
        status: "dev-impl-done",
        next_agent: "ops",
        dev_impl_done_at: $now,
        dev_impl_commit: "067e484d",
        router_dev_reverify_verdict: "RAW-RE-VERIFIED INDEPENDENTLY (not the dev badge). git show 067e484d --stat = EXACTLY 3 impl files + notebook, NO foreign sweep (concurrent PO-sprint skills/flows preserved uncommitted). FR-1 gen-que-descriptions.ts L102 hoverSummary backtick-escaped + L108 emit + L71/L125 type. FR-2 generated.ts hoverSummary x64 all >=80 chars (0 short), coreMeaning x64 intact, header preserved. FR-3 QueName.tsx:75 {desc.hoverSummary ?? desc.coreMeaning}, marketTrendLabel+withDetailLink untouched. tsc --noEmit zero errors. QA: longest ~210-220 chars ~4-5 lines, confirm no mobile overflow.",
        ops_rebuild_instructions: "REBUILD apps/frontend ONLY (Remix serves bundled que-descriptions.generated.ts; new hoverSummary NOT served until rebuilt). Targeted, NEVER docker compose down: `docker compose build frontend && docker compose up -d --no-deps frontend && docker builder prune -f`. Then `docker ps -a` to confirm frontend Up+healthy AND no peer container went down (rebuild-recreate-destroys-peers guard) AND served image ID changed. Do NOT rebuild kinh-dich-service (that was the wrong-surface error). Return: docker ps line for frontend + builder-prune reclaimed + peers-intact confirmation. On ops-green -> next_agent=qa LIVE-verify :3001 quẻ hover shows richer hoverSummary."
      })
      else . end
  ]
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "KINHDICH-HOVER-ENRICH-FE",
    next_agent: "ops",
    note: "KINHDICH-HOVER-ENRICH-FE dev-frontend DONE (adf783cd, commit 067e484d) + router RAW-re-verified INDEPENDENTLY (3 impl files+notebook, hoverSummary x64 all>=80chars in generated.ts, QueName.tsx:75 {desc.hoverSummary ?? desc.coreMeaning}, codegen backtick-escaped, tsc green, no foreign sweep). -> ops REBUILD gate: build+up -d --no-deps FRONTEND (NOT kinh-dich-service — wrong surface) + builder prune; docker ps -a peers-intact + image-id-changed. -> qa LIVE :3001 quẻ hover shows richer hoverSummary (sample favorable/neutral/unfavorable + terse quẻ e.g. 29/47, fallback id shows coreMeaning). -> po signoff -> done_verified. Single zone apps/frontend, weekend-safe. ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15. ARCH-SHIP-WAVE-REAUDIT PARKED. VN-MACRO-TOOLING (PO sprint, macro/mcp zone) concurrent no-conflict. WIP=1 active KINHDICH-FE. Commit explicit path only."
  }
