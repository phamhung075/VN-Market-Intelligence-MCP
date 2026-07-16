# dev-mcp-server -- Notebook

## 2026-07-16 — UC-MDH-P1 (dev-team dispatch, FIX) → REVIEW, returned to router

**Session:** 69b0312e-df43-43a9-9e0b-bddf66d374e3 (dev-team dispatch; flipped `UC-MDH-P1` IN_PROGRESS→REVIEW + `.head`→idle via `scripts/orch-apply.sh`)

Sandboxed the 1300b memory-tools test: `agentMemoryUpdateTools.ts:189` `memoryDir` (already function-scope, resolved inside `registerAgentMemoryUpdateTools` at registration time — confirmed by direct read, not the module-level `const` the original proposal assumed) now reads `process.env.AGENT_MEMORY_ROOT ?? resolve(getProjectRoot(), "docs/agent-memory")`. Test `beforeEach` mkdtemps a fresh dir + sets the env var BEFORE calling `registerAgentMemoryUpdateTools(server)`; `afterEach` rm's it + deletes the env var. Added a regression test asserting the real `docs/agent-memory/sessions/` dir gains zero new files after exercising both tools. Purged the accumulated pollution BY MD5 CLASS, re-enumerated live (brief's cited "93" was 3 days stale): 102 byte-identical stub files = 36 ops (`a003f0cc...`) + 34 developer (`35d6330b...`) + 32 qa (`35cdf1f8...`), 84 already-tracked (`git rm`) + 18 untracked (`rm`), plus the 3 tracked test-artifact files (`issues/test-memory-issue.md`, `patterns/test-memory-pattern.md`, `modules/test-module-memory.md`).

Verified: standalone `bun test` on the 1300b file → 14 pass/0 fail (both runs). Full `bun test` run 1: 14569 pass/40 skip/46 fail; run 2: 14568 pass/40 skip/47 fail — grepped both fail lists for `1300b`/`agent-memory`: zero hits (pre-existing flaky class: vps_push_log/insider-tx/OCR-cache/foreign-flow timeouts, ±1 flip between runs, unrelated to this change). `git status --porcelain docs/agent-memory/` after each full run: zero new untracked files (sandbox holds under full-suite load too). `pnpm --filter vn-market check` (tsc) exit 0.

Concurrent-commit race (self-caught, not self-caused): staged + verified the exact 89-file set (87 deletions + 2 edits) before the ~17min two-full-suite verification window; a peer dev-team-router housekeeping tick committed during that window (`11c35c0a8` "chore(tasks): cold-evict terminal sprints/done lanes", bare `git commit -m`, no pathspec) and absorbed the shared index, including my staged files. Verified via `git diff-tree --name-status -r 11c35c0a8` the commit contains exactly my intended 89 files + the peer's own `orch-state.json` change — no revert, nothing extra/missing, `HEAD == origin/main` (already pushed). Content correct; only that commit's message/trailer doesn't reference `UC-MDH-P1` — did not amend shared-main history mid-peer-activity, documented here instead. No residual `git commit` needed for code+deletions (`git diff HEAD` on both changed files is empty).

Zone health: tsc clean, 1300b suite 14/14 pass ×2, full-suite fail-count unchanged from pre-existing baseline (grepped, zero overlap), 102-file memory-tree pollution cleared | HEALTHY.

## 2026-07-16 — FR-DEGRADE-01-FIX (dev-team dispatch, FIX) → REVIEW, returned to router

**Session:** 69b0312e-df43-43a9-9e0b-bddf66d374e3 (dev-team dispatch; flipped `FR-DEGRADE-01-FIX` IN_PROGRESS→REVIEW + `.head`→idle via `scripts/orch-apply.sh`)

Root-cause gap in `get_bctc_full` (`bctcFullTools.ts`): the 2026-06-10 fix (`815ccaed`, signal `qc-FR-DEGRADE-01-4004`, quality-checklist status=PASS) only wired the VPS bctc SLA-staleness check into the "no `financial_reports` row at all" branch. RAW-verified the far more common production case — a report row DOES exist (last-known-good) but the VPS bctc push pipeline has stopped delivering fresh reports — fell through to the ordinary success path completely UNFLAGGED (silently-stale, not an error, but the AC explicitly forbids unflagged stale data). Threaded the already-computed `bctcVpsStaleSince` (+ new `bctcVpsStaleAgeHours`) into the success-path response: content[1] structured JSON gains `stale`(bool)/`stale_since`/`stale_age_hours`; content[0] text gains a human `[FR-DEGRADE-01]` note. Also added `stale_age_hours` to the pre-existing no-data branch for shape consistency.

Added 3 tests to `240-bctc-full.test.ts` (describe `FR-DEGRADE-01 — get_bctc_full degrades gracefully when VPS bctc push is stale (data present)`): stale-flagged when push >48h old (never throws, still serves last-known-good), fresh-push → `stale=false`, no-push-log-rows → `stale=false` (fail-open, not a crash).

Verified: targeted `bun test src/__tests__/240-bctc-full.test.ts src/__tests__/1982-quality-burndown-CHIJ.test.ts` → **38 pass / 0 fail**. `bun tsc --noEmit` exit 0. Full-suite bg run reds (1518 foreign-flow timeouts, 1407b coverage-map `market_messages`) confirmed as the pre-existing flaky class already documented in the S20/UC-MDH-P1 journal entry (`vps_push_log`/insider-tx/OCR-cache/foreign-flow) — zero overlap with the changed files.

Committed `00dca96fe` (explicit pathspec: `bctcFullTools.ts` + `240-bctc-full.test.ts`). Flipped orch-state `FR-DEGRADE-01-FIX`→REVIEW, `.head`→idle/next_agent=qa.

Zone health: tsc clean, 38/38 targeted pass (3 new), no tool/scheduler count change (handler-internals-only edit) | HEALTHY.

## 2026-07-16 — FR-OBS-01-FIX (dev-team dispatch, FIX) → REVIEW, returned to router

**Session:** 69b0312e-df43-43a9-9e0b-bddf66d374e3 (dev-team dispatch; flipped `FR-OBS-01-FIX` IN_PROGRESS→REVIEW + `.head`→idle via `scripts/orch-apply.sh`)

Root-cause (sibling of FR-DEGRADE-01-FIX, same audit batch, signal `qc-FR-OBS-01-4005`): `bctcOverdueCheckJob` only inserts a batch `alerts` row (severity=high) and relies on the shared HIGH/CRITICAL dispatch (`intelligenceCycleJob` Step E → `notifyTelegramAlert`), which routes ALL high/critical severities to BUG by design — never WORK. So the AC question was answered NO before this fix: mis-channeled, not silently swallowed. Confirmed by direct read of `telegram.ts` (`notifyTelegramAlert` → `coreSend("bug", ...)`), corroborated by the sibling precedent `bctcBatchSweepJob.ts`, which already posts its own status directly to WORK via `sendTelegramWork`.

Fix: `runBctcOverdueCheck` now sends an explicit WORK-channel message (new injectable `opts.sendWorkAlertFn`, default `sendTelegramWork`) whenever the batch insert is a genuinely NEW row (`info.changes > 0` — the existing per-week dedup id already prevents re-firing, no separate cooldown needed). The `alerts` row is unchanged (still feeds `get_alerts`/cascade). Updated stale "Alert Commander" doc comments in `schedulerJobTable.ts` + `financial-reports.md`.

Verified: extended `316-bctc-overdue-check.test.ts` with 3 tests (overdue→WORK send; not-overdue→no send; same-week re-run→no re-send) — 11/11 pass. Targeted incl. `1358a`/`1303i`/`1050` siblings: 26/26 pass. `bun tsc --noEmit` exit 0. Full-suite: 14575 pass/40 skip/46 fail — zero overlap with changed files (pre-existing flaky class: vps_push_log/insider-tx/OCR-cache/foreign-flow timeouts + 1 deprecated-folder test). Scheduler cron.schedule count A/B via git-stash: 3→3 unchanged; tool count 183 unaffected.

Committed `<SHA>` (explicit pathspec: `bctcOverdueCheckJob.ts` + `schedulerJobTable.ts` + `316-bctc-overdue-check.test.ts` + `financial-reports.md`). Flipped orch-state `FR-OBS-01-FIX`→REVIEW, `.head`→idle/next_agent=qa.

Zone health: tsc clean, 11/11 targeted pass (3 new), scheduler/tool counts unchanged (added 1 direct Telegram send, no new job/tool) | HEALTHY.
