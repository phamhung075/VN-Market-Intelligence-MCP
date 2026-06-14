# Router dev-team dispatcher — KINHDICH-HOVER-ENRICH ready -> in_progress (dev-kinh-dich IMPL).
# Architect (a2d4eb749aad0f27b) RATIFIED Option C (commits c8ff2287 BA-persist + f02f927d board->ready).
# Router RAW-RE-VERIFIED INDEPENDENTLY (not the architect badge, BIDIRECTIONAL):
#   git show c8ff2287 --stat = EXACTLY 3 files (ba.md +8, orch-state, KINHDICH spec 587L); f02f927d = EXACTLY 3 files
#   (architect sprint-decision, architect.md notebook, orch-state) — explicit-path, NO dirty sweep. 6 M + 3 ?? concurrent-agent
#   dirty tree (tool-usage-stats.json, bctc-analyst/market-watcher/news-scout notebooks, coverage-state.json, cowork-schedule.json
#   + digest-predict session + signals) STILL uncommitted. Board: KINHDICH-HOVER-ENRICH ready owner=dev-kinh-dich;
#   ARCH-KINHDICH-HOVER-ENRICH done; head idle. Single zone apps/kinh-dich-service (no cross-zone split). Weekend-safe (no market).
# WIP: passive ARCH-CRON-SCHEDULER-RELIABILITY (Mon-gate, no active agent) does NOT consume the active slot -> one new active OK.
# This write (ONE atomic temp->rename): KINHDICH-HOVER-ENRICH ready[] -> in_progress[]; status READY->IN_PROGRESS;
#   next_agent -> dev-kinh-dich; impl_dispatched_at + impl_dispatch_note. head -> in_progress/active=KINHDICH-HOVER-ENRICH.
#   ARCH-CRON-SCHEDULER-RELIABILITY (passive) + ARCH-SHIP-WAVE-REAUDIT (PARKED review) untouched. Concurrent dirty tree untouched.
# GUARD: refuse unless task in ready[] with status ready and owner==dev-kinh-dich.
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — ready -> zone owner implements).
# Usage: jq --arg now "$NOW" -f scripts/router-d4-kinhdich-hover-ready-to-dev-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.ready // []) as $rd
| ([$rd[] | select(type=="object" and ((.id // "")=="KINHDICH-HOVER-ENRICH"))][0]) as $t
| if $t == null then error("KINHDICH-HOVER-ENRICH not in ready[] — refuse")
  elif ($t.status != "ready") then error("status != ready (\($t.status)) — refuse")
  elif (($t.owner // null) != "dev-kinh-dich") then error("owner != dev-kinh-dich (\($t.owner)) — refuse")
  else . end
| .task_board.ready = [$rd[] | select((type=="object" and ((.id // "")=="KINHDICH-HOVER-ENRICH")) | not)]
| .task_board.in_progress = ((.task_board.in_progress // []) + [
    ($t + {
      status: "IN_PROGRESS",
      next_agent: "dev-kinh-dich",
      impl_dispatched_at: $now,
      impl_dispatched_by: "dev-team",
      impl_dispatch_note: "Architect-ratified Option C (new dedicated hoverSummary localized field — terse coreMeaning stays intact for QUE-TOOLTIP-DRY + React/MCP consumers). IMPLEMENT 3-file change wholly inside apps/kinh-dich-service: (1) pkg/module/reading_composer/hexagram_reference.go — add `HoverSummary localized` field (JSON tag hoverSummary) to queReference struct (L27-42, mirror CoreMeaning/Warning), add `hoverSummary localized` as 5th positional localized param to the build() closure (L105), thread the new arg through ALL 64 call sites with the pre-authored VI+EN strings from docs/handoffs/KINHDICH-HOVER-ENRICH-BA-spec.md (Quẻ 1->64; transcribe verbatim, do NOT re-author; VI plain non-technical, no unexplained Hán-Việt). (2) regen apps/kinh-dich-service/dashboard/que-reference.js via `CGO_ENABLED=0 go run ./cmd/sandbox -emit-reference` (AUTO-GENERATED — never hand-edit). (3) apps/kinh-dich-service/dashboard/index.html ~L2501 swap hover render `loc(q.coreMeaning)` -> `loc(q.hoverSummary)` ONLY (leave L2504 loc(q.warning) + the expanded-detail coreMeaning at L2508+ untouched). VERIFY post-impl: `grep -c '\"hoverSummary\"' apps/kinh-dich-service/dashboard/que-reference.js` == 64; zero-short-strings python check (every hoverSummary.vi 80-220 chars, none equal to coreMeaning). REBUILD REQUIRED: the Go binary serves the static dashboard — flag in commit message that ops must `docker compose build kinh-dich-service && up -d --no-deps kinh-dich-service && docker builder prune -f` so the new que-reference.js is served (qa LIVE-verifies the running container, not file-inspect). Commit ONLY the 3 impl files + your dev notebook by EXPLICIT PATH — the concurrent dirty tree (tool-usage-stats.json, bctc-analyst/market-watcher/news-scout notebooks, coverage-state.json, cowork-schedule.json, digest-predict session, signals) must NOT be captured; never git add -A; `git status --short` after to confirm preserved. RETURN: raw before/after of the struct field add + ONE sample call site + the index.html swap, the grep count, the commit SHA, and the ops-rebuild flag."
    })
  ])
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "KINHDICH-HOVER-ENRICH",
    next_agent: "dev-kinh-dich",
    note: "Architect ratified Option C (commits c8ff2287 + f02f927d, router RAW-re-verified explicit-path 3+3 files, dirty tree not swept). Dispatch ready->in_progress (dev-kinh-dich): add HoverSummary localized field + 64 pre-authored VI/EN strings to hexagram_reference.go, regen que-reference.js via emit-reference, swap index.html L2501 hover loc(q.coreMeaning)->loc(q.hoverSummary). REBUILD kinh-dich-service required (Go serves static dashboard). -> qa LIVE-verify hover shows richer text in running container -> po signoff -> done_verified. Single zone apps/kinh-dich-service, weekend-safe. ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15 G1/G2/G3 (G1 open: aggregator stale 06-12). ARCH-SHIP-WAVE-REAUDIT PARKED. WIP=1 active. Commit explicit path only."
  }
