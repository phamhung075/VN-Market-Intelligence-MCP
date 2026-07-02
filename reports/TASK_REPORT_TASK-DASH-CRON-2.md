## Task Report TASK-DASH-CRON-2

changed: apps/frontend/app/routes/api.cron-status.tsx (new, 31L) | apps/frontend/app/routes/dashboard.orchestration.tsx (+335/-10) | apps/frontend/app/__tests__/TASK-DASH-CRON-2-cron-recheck-table.test.ts (new, 357L) | docs/data/frontend-data-coverage-map.json (+13/-2) | docs/handoffs/TASK-DASH-CRON-2.md (+49)
tests: 41/0 (named suite, RAW-run) | full suite 2047 pass / 2 fail (both pre-existing QUE-TOOLTIP, confirmed unrelated) | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: exit 0 PASS | Playwright G12: 4/4 PASS (RAW-run on fresh `PLAYWRIGHT_PORT=3012` server, independent of dev's run)
verdict: APPROVED (round 1)

### Evidence (independently reproduced, not relayed)

- `apps/frontend/app/routes/api.cron-status.tsx` — byte-for-byte structural mirror of `api.orchestration.tsx` (diffed both files side by side; only string literals differ: `/api/cron-status` vs `/api/orchestration`, `label`).
- `apps/frontend/app/routes/dashboard.orchestration.tsx:1318-1322` — `<CronRecheckTable .../>` is rendered AFTER the `{state ? (...) : (...)}` block closes (block spans 1284-1316) — confirms AC-16/AC-25 (renders independent of `/api/orchestration` outcome) by construction, not just by comment.
- `dashboard.orchestration.tsx` `normalizeCronStatusB(_raw)` (unconditional `return "SESSION_SCOPED"`) — AC-14/NFR-7 holds even under adversarial upstream input; confirmed by source read + 6 dedicated tests (MISSED/STALE/LATE/null/undefined/123 all → SESSION_SCOPED).
- `dashboard.orchestration.tsx` `<FreshnessBadge dataAsof={cronStatus.fetched_at || null} .../>` — `||` (not `??`) correctly folds the empty-shape DTO's `fetched_at: ""` to `null`, avoiding an `Invalid Date` edge case in `FreshnessBadge.tsx:146`'s `dataAsof === null` guard that `?? null` would have missed.
- `npx vitest run app/__tests__/TASK-DASH-CRON-2-cron-recheck-table.test.ts` → 41/41 PASS (RAW).
- `npx tsc --noEmit` → 0 errors (RAW).
- `npx vitest run` (full suite) → 2047 pass / 2 fail; both failures are `QUE-REFERENCE-PAGE-detail.test.ts` / `QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.tsx` (`QUE_DESCRIPTIONS[i]` has 3 own keys not 2) — neither file touched by this diff, matches dev's claimed baseline exactly.
- `bash scripts/audits/mock-guard.sh --files "apps/frontend/app/routes/api.cron-status.tsx apps/frontend/app/routes/dashboard.orchestration.tsx"` → exit 0 PASS.
- DDD/security greps on both modified production files → 0 hits for `infrastructure`/`application` imports, 0 hits for secrets; `process.env` usage is the pre-existing byte-identical guard pattern from `api.orchestration.tsx` (accepted precedent, e.g. cycle-353 notebook).
- `PLAYWRIGHT_PORT=3012 npx playwright test` (own RAW run, independent of dev's) → 4/4 PASS (`smoke.spec.ts` ×1 + `render-check.spec.ts` ×3) against a genuinely fresh local Vite server — confirmed port 3001 is bound by the live stale-image `frontend` Docker container (per dispatch caveat), not touched/restarted.
- Independent 3rd manual verification: spun up `PORT=3013 npm run dev` (own throwaway instance, killed after), `curl http://localhost:3013/dashboard/orchestration` → HTTP 200. Rendered HTML contains "Kiểm Tra Lịch Cron", "Kiểm tra lại", "Cron máy chủ", "Cron phiên làm việc", both layers show "Không có dữ liệu." (empty-shape degrade — `/api/cron-status` confirmed live 404, matches Zone-1 container-rebuild-pending caveat exactly), honest error banner "Không thể tải trạng thái cron — upstream 404" rendered (not fabricated/hidden). `/api/orchestration` independently confirmed HTTP 200 on the same server (AC-23 no regression) and all 4 existing sections (Head/Task Board/Signal Queue/Sprint Goal/Narrative) render with zero "Application Error"/"Internal Server Error" strings (AC-24).
- `docs/data/frontend-data-coverage-map.json` — independently recomputed via python3/json: `summary.rows=50` (actual row count 50 ✓), `summary.LIVE=40` (actual LIVE-status count 40 ✓), new row carries the mandatory `route: "/dashboard/orchestration"` field the BA's own FR-6 example had omitted.
- `grep -n "slice\|limit\|paginat"` on the cron-table render code → 0 hits (AC-17: no truncation/pagination).

### AC map (all in scope, all PASS)
AC-16 (renders even if `/api/orchestration` down) · AC-17 (no truncation) · AC-18 (Layer-A/B visually distinct sub-sections) · AC-19 (Layer-B always blue, never red/amber) · AC-20 (null `last_fire` → "Chưa từng chạy") · AC-21 (RECHECK → `revalidator.revalidate()`, no full reload) · AC-22 (FreshnessBadge wired to real `fetched_at`, never client-now) · AC-23 (`/api/orchestration` unchanged, still 200) · AC-24 (no new JS error in existing sections) · AC-25 (independent Promise.all fetches, no shared mutable state) · AC-28 (plain Vietnamese copy, no raw enum tokens) · AC-14/NFR-7 (Layer-B forced SESSION_SCOPED even under malformed upstream) — all PASS.

Board: TASK-DASH-CRON-2 moved `task_board.review` → `task_board.done` (`docs/data/orch/orch-state.json`), `qa_verdict` round=1 APPROVED. head → idle.

Journal: `docs/agent-memory/decisions/sprint-DASH-CRON-RECHECK-TABLE-qa.md` STEP qa-S4.
Handoff: `docs/handoffs/TASK-DASH-CRON-2.md` § [QA] Review Record.
