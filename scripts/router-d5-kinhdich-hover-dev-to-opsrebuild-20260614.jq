# Router dev-team dispatcher — KINHDICH-HOVER-ENRICH dev-impl-GREEN -> ops-rebuild gate (then qa-live).
# dev-kinh-dich (ad03fd88916802d25) returned DONE (commit 47fe36e8). Router RAW-RE-VERIFIED INDEPENDENTLY (not the dev badge):
#   git show 47fe36e8 --stat = EXACTLY 3 impl files (index.html +2/-... , que-reference.js +260, hexagram_reference.go +68) —
#     NO dev notebook, NO concurrent dirty sweep. grep -c '"hoverSummary"' que-reference.js = 64. index.html L2501 =
#     loc(q.hoverSummary) (coreMeaning removed from hover line; expanded-detail coreMeaning + L2504 warning untouched).
#     HoverSummary field present in hexagram_reference.go (struct + build() param + json tag). Concurrent dirty tree preserved.
#   ONE VI string 224 chars (spec 80-220) — 4-char overrun = MORE detail, serves intent, non-blocking (qa may flag tooltip wrap).
# REBUILD GATE: Go binary serves the static dashboard files -> new que-reference.js NOT served until kinh-dich-service rebuilt.
#   ops MUST: docker compose build kinh-dich-service && up -d --no-deps kinh-dich-service && docker builder prune -f (codified flow).
# This write (ONE atomic temp->rename): KINHDICH-HOVER-ENRICH stays in in_progress[]; status IN_PROGRESS->dev-impl-done;
#   next_agent dev-kinh-dich->ops; records dev_impl_commit + router_dev_reverify_verdict + ops_rebuild_instructions.
#   head -> in_progress/next=ops. ARCH-CRON-SCHEDULER-RELIABILITY (passive Mon-gate) + ARCH-SHIP-WAVE-REAUDIT (PARKED) untouched.
#   Concurrent dirty tree untouched.
# GUARD: refuse unless task in in_progress[] with status IN_PROGRESS and next_agent=="dev-kinh-dich".
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — dev-green -> ops-rebuild -> qa-live for runtime-affecting change).
# Usage: jq --arg now "$NOW" -f scripts/router-d5-kinhdich-hover-dev-to-opsrebuild-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.in_progress // []) as $ip
| ([$ip[] | select(type=="object" and ((.id // "")=="KINHDICH-HOVER-ENRICH"))][0]) as $t
| if $t == null then error("KINHDICH-HOVER-ENRICH not in in_progress[] — refuse")
  elif ($t.status != "IN_PROGRESS") then error("status != IN_PROGRESS (\($t.status)) — refuse")
  elif (($t.next_agent // null) != "dev-kinh-dich") then error("next_agent != dev-kinh-dich (\($t.next_agent)) — refuse")
  else . end
| .task_board.in_progress = [
    ($ip[] | if (type=="object" and ((.id // "")=="KINHDICH-HOVER-ENRICH"))
      then (. + {
        status: "dev-impl-done",
        next_agent: "ops",
        dev_impl_done_at: $now,
        dev_impl_commit: "47fe36e8",
        dev_impl_verdict: "DONE (dev-kinh-dich ad03fd88, commit 47fe36e8): added HoverSummary localized field to queReference struct + 6th build() param, populated 64 pre-authored VI/EN strings; index.html L2501 hover render coreMeaning->hoverSummary; regen que-reference.js via emit-reference. go build PASS.",
        router_dev_reverified_at: $now,
        router_dev_reverify_verdict: "RAW-RE-VERIFIED INDEPENDENTLY (not the dev badge). git show 47fe36e8 --stat = EXACTLY 3 impl files (index.html, que-reference.js +260, hexagram_reference.go +68); no notebook, no concurrent dirty sweep. grep -c '\"hoverSummary\"' que-reference.js = 64. index.html L2501 = loc(q.hoverSummary) (coreMeaning removed from hover; expanded-detail + warning untouched). HoverSummary in Go SSOT struct+build+tag. Concurrent dirty tree preserved. One VI string 224 chars (spec 80-220) — 4-char overrun = more detail, non-blocking.",
        ops_rebuild_instructions: "REBUILD kinh-dich-service (Go binary serves the static dashboard; new que-reference.js NOT served until rebuilt). Targeted, NEVER docker compose down: `docker compose build kinh-dich-service && docker compose up -d --no-deps kinh-dich-service && docker builder prune -f`. Then `docker ps -a` to confirm kinh-dich-service Up + healthy AND no peer container went down (rebuild-recreate-destroys-peers guard). Confirm the served image ID changed (new build). Return: docker ps line for kinh-dich-service + builder-prune reclaimed + peers-intact confirmation. On ops-green -> next_agent=qa LIVE-verify the running dashboard hover."
      })
      else . end)
  ]
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "KINHDICH-HOVER-ENRICH",
    next_agent: "ops",
    note: "KINHDICH-HOVER-ENRICH dev-impl DONE (dev-kinh-dich ad03fd88, commit 47fe36e8) + router RAW-re-verified INDEPENDENTLY (3 impl files, hoverSummary x64 in que-reference.js, index.html L2501 loc(q.hoverSummary), Go SSOT field present, dirty tree not swept). -> ops REBUILD gate: build+up -d --no-deps kinh-dich-service + builder prune (Go serves static dashboard, JS not served till rebuilt); docker ps -a peers-intact + image-id-changed. -> qa LIVE-verify hover shows richer hoverSummary in running container (sample quẻ 47/29/1, EN<->VI toggle, coreMeaning still in expanded-detail). -> po signoff -> done_verified. Single zone apps/kinh-dich-service, weekend-safe. ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15. ARCH-SHIP-WAVE-REAUDIT PARKED. WIP=1 active. Commit explicit path only."
  }
