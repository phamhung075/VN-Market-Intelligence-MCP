# Router dev-team — KINHDICH-HOVER-DETAIL dev-frontend DONE (router RAW-verified) -> ops frontend-only rebuild.
# dev-frontend (a3943c17, commit de8d8d0a — router RAW-verified: git show de8d8d0a --stat = EXACTLY 2 files
#   (apps/frontend/app/components/QueName.tsx +39/-4 + dev-frontend.md notebook +10); NO board/orch-state in commit;
#   HEAD==de8d8d0a; .head UNTOUCHED [VN-MACRO chain, next_agent=architect]; diff matches BA spec FR-1..4:
#   import QUE_DETAIL, render coreMeaning + Trạng thái(stateInterpretation) + Thuận(favorable) + Cảnh báo(warning) +
#   marketTrendLabel each conditional, FR-3 fallback desc.hoverSummary??coreMeaning when detail absent, FR-4
#   "Xem chi tiết →" deep-link kept, phases[] OMITTED, max-w-xs->max-w-sm; pnpm/npx tsc --noEmit EXIT 0).
# HONEST: status=done NOT done_verified. QueName.tsx ships in the Remix frontend bundle which is NOT rebuilt here;
#   the enriched tooltip reaches the LIVE :3001 surface only after the frontend container rebuild (ops next).
#   No false-green (passive-health lesson) — done_verified gated on qa served-chunk RAW-verify on :3001.
# This write (ONE atomic temp->rename): on task BA-KINHDICH-HOVER-DETAIL in backlog[] (single lean-chain task,
#   ba->dev-frontend->ops->qa) stamp dev_impl_commit + dev_impl_done_at + router_dev_reverify_verdict, set
#   next_agent=ops, add ops_rebuild_instructions (frontend-only, NEVER kinh-dich-service — the wrong-surface error
#   from parent ENRICH). status stays "done" (BA-done marker preserved; dev-done tracked via dev_impl_commit field).
#   SEPARATE chain from head (head owns VN-MACRO) -> .head NOT touched. 0 new id-lines.
# GUARD: refuse unless BA-KINHDICH-HOVER-DETAIL present in backlog[] AND dev_impl_commit not already set (idempotency).
# Usage: jq --arg now "$NOW" -f scripts/router-d19-kinhdich-hover-detail-dev-done-to-ops-20260614.jq docs/data/orch/orch-state.json
def TASK: "BA-KINHDICH-HOVER-DETAIL";
($ARGS.named.now) as $now
| ([.task_board.backlog[]? | select(type=="object" and ((.id // "")==TASK))][0]) as $t
| if ($t == null) then error("BA-KINHDICH-HOVER-DETAIL not in backlog[] — refuse")
  elif (($t.dev_impl_commit // "") != "") then error("dev_impl_commit already set (\($t.dev_impl_commit)) — already advanced, refuse")
  else . end
| .task_board.backlog = [
    .task_board.backlog[] | if (type=="object" and ((.id // "")==TASK))
      then (. + {
        next_agent: "ops",
        dev_impl_done_at: $now,
        dev_impl_commit: "de8d8d0a",
        dev_agent: "a3943c17",
        router_dev_reverify_verdict: "RAW-RE-VERIFIED INDEPENDENTLY (not the dev badge). git show de8d8d0a --stat = EXACTLY 2 files (apps/frontend/app/components/QueName.tsx +39/-4 + dev-frontend.md notebook +10); NO board/orch-state/signal in commit; HEAD==de8d8d0a; .head UNTOUCHED (VN-MACRO chain next_agent=architect). Diff matches BA spec: import QUE_DETAIL; detail-present branch renders coreMeaning + Trạng thái(stateInterpretation) + Thuận(favorable) + Cảnh báo(warning) + marketTrendLabel each conditional (empty omitted); FR-3 fallback desc.hoverSummary??coreMeaning when detail absent; FR-4 'Xem chi tiết →' deep-link kept unconditionally; phases[] OMITTED; max-w-xs->max-w-sm. npx tsc --noEmit EXIT 0. Compile green; NOT done_verified — frontend bundle not rebuilt, enriched tooltip served on :3001 only after ops rebuild.",
        ops_rebuild_instructions: "REBUILD apps/frontend ONLY (Remix serves the bundled QueName chunk; new QUE_DETAIL tooltip NOT served until rebuilt). Targeted, NEVER docker compose down: `docker compose build frontend && docker compose up -d --no-deps frontend && docker builder prune -f`. Then `docker ps -a` to confirm frontend Up+healthy AND no peer container went down (rebuild-recreate-destroys-peers guard) AND served image ID changed. Do NOT rebuild kinh-dich-service (that was the parent ENRICH wrong-surface error — real surface is Remix :3001). Return: docker ps line for frontend + builder-prune reclaimed + peers-intact confirmation + old->new image ID. On ops-green -> next_agent=qa LIVE served-chunk RAW-verify on :3001."
      })
      else . end
  ]
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
