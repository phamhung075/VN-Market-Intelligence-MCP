# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa

**Sprint goal:** Make cowork `guaranteed:true` an honored contract — bounded catch-up firing for elapsed guaranteed slots, or a structured (non-silent) miss.
**Agent:** qa
**Started:** 2026-08-13T20:29:36Z
**Continuation of:** sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-19.md (CAP-REACHED, byte cap 36000 breached at 43649B/200L — dual-axis cap, line count was under 600 but byte density over)

---

### STEP qa-S113 · qa · 2026-08-13T20:27:00Z
**task-id:** FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT
**what-done:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `branch:null`). Both commits `78f945fb2`/`abd890ef1` confirmed ancestors of `main`; `git show --stat` matches every claimed file. Read `getSlaThreshold("bctc")` at source, not trusted from review_note prose — confirmed it branches ONLY on `isBctcEarningsWindowActive(now)` (boolean) → `cfg.earningsWindowThresholdMinutes`(1440)/`cfg.defaultThresholdMinutes`(10080), zero `minutesSinceX(now)` age term remains.
**what-considered:**
- AC-5: pulled `docs/data/system-map.json` `.project.data_sources["bctc-discover"].sla` myself, diffed against `DEFAULT_SLA_CONFIG`'s bctc entry — byte-match (168h/10080min default, 24h/1440min earnings-window), independent of the row's own citation.
- AC-4: grep-confirmed `marketHoursThresholdMinutes`/`offHoursThresholdMinutes` gone from `SignalSlaConfig`/`DEFAULT_SLA_CONFIG`; only surviving hit is the new test's own `toBeUndefined()` guard.
- Widened test scope beyond the claimed 8-file/107 count in 3 rings: ring1 (7 named files) 110/0; ring2 (+9 more bctc/SLA files found via grep) 140/0; ring3 (full 18-file set importing `freshnessSlaChecker`/`freshnessSlaConfig`) 271/0 — zero fixture-ripple missed. `tsc --noEmit` 0 errors, `mock-guard.sh` PASS, DDD/security greps clean.
- AC-2 (fixed-across-3-emissions, both regimes) and AC-3 (bidirectional clear+fire+recovery) read line-by-line in the new dedicated test file, not summary-trusted — both genuinely exercised.
- Did NOT re-run the full 14870-test suite (609s cost judged out of proportion — the 18-file direct-importer ring is exhaustive for this change's actual blast radius).
**why-decision:** vc-approved, DONE_VERIFIED. Zero ISSUE — commits real, root-cause fix matches claim exactly at source (not paraphrase), config values SSOT-verified independently, bidirectional proof genuinely present and passing, no fixture-ripple missed.
**why-change:** none — verdict matches dev agent's own claim. Appended `[QA] Review Record` to the row's `review_note` field (row had no `status_note`); attached `verification.raw_probe` on the retry after validator flagged its absence on the first write attempt.

### STEP qa-S114 · qa · 2026-08-13T22:35:00Z
**task-id:** FIX-COVERAGE-STAMP-TTL-30-BELOW-SCHEMA-MIN-60-FAILS-CLOSED
**what-done:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `qa[]` row, `branch:null`). Did NOT trust the row's own note (router "RAW-verified" claim) at face value — independently re-derived all 3 ACs from source.
**what-considered:**
- AC1: `git show a63ab8b0d~1:scripts/agents-flow/coverage-stamp.sh | sed -n 150,165p` — confirmed pre-fix line 158 literal was exactly `ttl_seconds:30`. Post-fix on `main`, ancestor-confirmed, same literal now `900`. `origin/main` HEAD == local `main` (524e1239d) — commit genuinely pushed, not just local.
- AC2: grepped ALL of `scripts/` (`.sh`/`.js`/`.mjs`/`.ts`/`.py`/`.jq`) for `task_claim`+`ttl_seconds` literals: every other call site is either a fixed literal ≥60 (600/900/1800/5400/120/60/180/1000/3600) or an env-overridable var with a safe ≥60 default (`auditor-notebook-commit.sh` `$MUTEX_TTL` default 90; `emit-dashboard-row.sh` literal 90). No second offender found — matches commit message's own grep claim.
- AC3 (the hard gate — refused lint/grep-only close): live `docs/data/coverage-state.json` (uncommitted working-tree write, `git status -M`, pre-existing committed baseline still 2026-07-25) shows 34-watchlist-ticker `last_covered_news_scout`=`last_covered_market_watcher`≈2026-08-13T20:12:5x/06Z — genuinely after fix commit's UTC ts (21:28:58+02:00 = 19:28:58Z). Cross-checked against BOTH agents' own notebooks, not the row's prose: news-scout c262 (12:11Z, pre-fix) explicitly logged `Coverage-state update SKIPPED — ttl_seconds=30 < schema min=60` (reproduces the bug); c264 (20:10:26Z start, post-fix) shows no skip, ends "Coverage-state update via coverage-stamp.sh (tickers in impact set: FPT,VIC,HPG,+34-stock chain)" — matches the exact tickers/timestamps now in the live file. market-watcher's 20:11Z cycle carries a structured (non-prose) metrics-table field `coverage_state_updated | yes`, `Stocks: 34` matching the 34 fresh-stamped tickers. Ran `coverage-stamp.test.sh` myself (stubbed-mcp regression, unaffected by TTL value either way) — 29/29 pass. `mock-guard.sh --files coverage-stamp.sh` PASS (bash, no prod-source scan scope).
- Noted but non-blocking: c263 (16:10Z, still pre-fix) narrates "Coverage-state update completed" with no SKIPPED caveat, yet the live file has zero trace of an Aug-13-16:xxZ write — that specific cycle's claim looks unverified/inaccurate (known `feedback_auditor_resumed_run_narrates_writes_never_executed` class), but does not affect this row's own AC3 evidence chain since c264+market-watcher (post-fix, structurally corroborated by file content) independently satisfy it.
**why-decision:** vc-approved, DONE_VERIFIED. All 3 ACs hold under my own independent re-derivation (commit diff, exhaustive grep, live file + dual-agent notebook cross-check) — not the row's own note. Genuine post-fix fleet cycle write observed, matches `verification_gate=coverage_state_write_observed_after_fix` literally.
**why-change:** none — followed verify-committed sub-flow exactly, including its explicit "do not close on lint/grep alone" instruction for AC3.
