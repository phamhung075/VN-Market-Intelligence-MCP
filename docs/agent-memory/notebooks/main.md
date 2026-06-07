# Dev Team — Sprint Boundary Notebook

**Written:** 2026-06-07T10:55Z (cycles 20260607T071732Z + re-entry 0817Z — VN Sun, market CLOSED)

## cycle-20260607T0717Z+0817Z — LIVE-DB RECOVERED (integrity_check=ok), 2 P0 BCTC fixes merged, TECH-DEBT-LINTING cleared

- **RECOVER-LIVEDB-INTEGRITY ✅ DONE — the headline.** Two-window saga:
  - Attempt 1 (10:15): `.dump`+reload per runbook → RLI-DEV-2 gate FAILED (800+ malformed INSERTs) → clean rollback 2m07s. Root cause found by architect probe: 12 ghost rowids 493554–493565 = system_logs rows bleeding into pdf_extracted_text B-tree via double-ref page 2533; 7-col data into 8-col schema → NULL in extracted_at NOT NULL.
  - Window 2 (~10:32): revised §8 filtered replay (skip exactly 12 ghost INSERTs) after MANDATORY PRE-SMOKE in-memory gate → all 9 gates PASS, no rollback, stop→healthy ~5min. Live `PRAGMA integrity_check=ok` verified independently by dispatcher AND executor. Baselines exact: 121 codes / 41,265 history / 949 pdf (100% salvaged) / 550,655 system_logs. Corruption had been SPREADING (new double-refs 63221/63160 between 08:14→10:23) — acting Sunday was right.
  - Corrupt original preserved: data/market.db.bak-20260607T103143-CORRUPT-ORIGINAL (+ first backup + dump ≈670MB) — RLI-FORENSICS-CLEANUP backlog row, retention to 2026-06-14.
  - Runbook: docs/architecture-briefs/2026-06-07-livedb-recovery-runbook.md @ 7b088535 (authored 8239d959→merged 9a7f5c07; baselines reconciled 64b989e7; §7 post-mortem + §8 revised 7b088535).
- **NEW LESSONS (memory feedback_backup_structural_smoke):**
  1. Row-count equality ≠ structural integrity — backup of a corrupt file carries the corruption; restore-verification MUST include PRAGMA integrity_check + dump-replay smoke on the copy.
  2. PRE-SMOKE gate: never open a downtime window without an in-memory replay test passing while the service still serves (zero-downtime, catches scope drift).
  3. Baselines must be MEASURED at runbook-authoring time, never inherited from dispatcher prose (1599/3190 were daily_ohlcv 2-day figures; `stock_prices` was a VnDirect API path, never a table — attempt-1 STOP gate caught it).
- **MERGED P0 BCTC fixes** (both live for next re-parse):
  - FIX-BCTC-LIAB-PRIOR-PERIOD → 29245173+04fa26a7: parseSplitBlockBalanceSheet took FIRST date header as separator; HPG parent-company OCR emits prior-period header first. 5 RED→GREEN, 21/21 targeted.
  - FIX-BCTC-STAGE4-CROSS-SECTION-DUP → a058aa2e+e50e7fca: flat dup-map gained statement_section dimension; cross-section dup→YELLOW, same-section stays RED (140/141 ✓), null-section conservative RED. 6 tests, 19/19 targeted. New metrics_json field cross_section_dup_count (additive).
  - **HPG Q4-2025 live re-parse UNBLOCKED** — eligible for bctcReparseJob 14:00 UTC; board row VERIFY-HPG-REPARSE-POST-RECOVERY due next cycle. CTG re-extract same cron (carry-forward).
- **TECH-DEBT-LINTING ✅ done off-deferred-list** (f01942c8): pre-push tsc gate blocked user-requested push → fixer dropped 3× `done: undefined` (TS2379 exactOptionalPropertyTypes), 44/0 tests. Sweep commit 00f9fd8a (54 files accumulated session artifacts) pushed with it.
- **FIX-NEWS-VPS-PROBE: FALSE ALARM** (edaa5bd7) — service up 5 days, pure bash+curl (no Chromium), stale-112min = Saturday RSS cadence; push resumed 07:20Z verified first-hand via /api/fetch-status. #3065 resolved monitoring (msg 2704 deleted) — re-check Monday VN open.
- **Audits:** 3× T1 this span (c6ec4c5d, ef9793fb, 071573cf) — all 0 anomalies; maintenance-window suppression briefs worked (auditor correctly classified stopped mcp-server as skipped-maintenance, no false-positive remediation).
- **Drains:** 0717Z (1 loose context-bloat dev-mcp-server.md → janitor pruned 219L→84L @ 919211ee) + 0817Z (2 loose ba.md context-bloat self-resolved 179L<cap @ 6fae4415).
- **Concurrent-session traffic on main** (expected, cherry-pick fallback used): edaa5bd7 ops notebook, af0b354a tool-surface 162→161, bd5d0fec/10f6849e/b8c73852 TOOL-SURFACE sprint, 5d4fbcc7 BGFAN-1 (NOTE: captured pm's uncommitted orch-state write — cross-session commit-capture hazard; content was verified correct).
- **Sub-agent gateway truth:** MCP gateway unavailable in ALL backgrounded sub-agents (not just worktrees) — INV-GATEWAY-1 generalizes; main terminal owns all task_claim/release/telegram/process_telegram_report. Put "main terminal handles MCP" in every agent prompt instead of mutex patterns.
- Commits this span: 0151dea6→919211ee→b02cc42a→edaa5bd7→9a7f5c07→[concurrent: 6ffe85ff/bd5d0fec/af0b354a]→f01942c8→00f9fd8a→[5d4fbcc7/10f6849e/b8c73852]→29245173→04fa26a7→ef9793fb→64b989e7→a058aa2e→e50e7fca→071573cf→6fae4415→7b088535→[pm closeout pending].

### Queue watch for next cycle's po triage
- VERIFY-HPG-REPARSE-POST-RECOVERY (XS) — confirm bctcReparseJob 14:00 UTC picked HPG Q4-2025 + CTG; verify FIX-LIAB+FIX-STAGE4 produce correct values + YELLOW (not RED) on live.
- news-vps monitoring pair — if stale again at Monday VN open → real outage escalation (else close quietly).
- rtr-bctc-playwright-thread-202606061545 (READ, standing — awaiting Q1/2026 queue-drain proof).
- P1 sprints now dispatchable (dev lanes free, recovery done): SPRINT-PPC-PDF-SOURCING, SPRINT-HPG-QUEUE-URL-FIX.

### Carry-forward (unchanged lanes)
- Parked: FIX-FETCH-VERYSTALE-LABEL. Deferred: FIX-BLOAT-HOOK-JUSTIFY-SUPPRESS. (TECH-DEBT-LINTING cleared this cycle.)
- RLI-FORENSICS-CLEANUP (P3) — 2026-06-14, only after fresh integrity_check=ok re-confirm.
- STALE-ORPHAN marker candidate for apps/mcp-server/data/market.db (NEVER delete — 4.1MB dev seed, exonerated by reconcile probe: 2-row market_prices, no relation to prod).
- Baseline drift: project-stats toolCount 162→161 (af0b354a) BUT live /health still reports toolCount:162 — reconcile at next dev-mcp-server lane touch.
- worktree.baseRef=head still set — verify before worktree-parallel dispatch.

### Addendum (post-close audit 0b0b75ae)
- Window-2 compose op CASCADED to macro-indicators (restarted 08:45:34Z, 16s before mcp-server start) despite "mcp-server only" scope + executor claiming "no deviations". Zero impact (healthy, clean bounce) — but compose `depends_on` edges make "scoped restart" leaky. Next maintenance runbook: enumerate dependent services pre-window + use `--no-deps` on compose start, and verify ALL peer StartedAt timestamps post-window, not just `docker ps` presence.

### Notes (standing)
- task_claim live schema: `{task_id, task_kind: enum[cowork-slot|sprint-task|dashboard-row|commit-mutex], owner_agent, ttl_seconds, payload: SERIALIZED-JSON-STRING}`. task_release: `{task_id}` only. commit-mutex id: `commit-mutex:main`.
- LET-EXPIRE orphan locks: task:on-demand:ops:2026-06-07, esc-datacov:FPT:Q1-2026:ESC-3 (exp 2026-06-12), task:RLI-STOP-WINDOW, task:RLI-STOP-WINDOW-2 (both orphaned by recovery stops — by design).
- Gateway meta-tools NOT callable via call_tool — grep apps/mcp-server/src/interface/mcp/tools/ for names.
- signals.db IS git-tracked (correct prior note that said ignored); file-move to processed/ is SSOT; hook loose files sometimes tracked sometimes not — check `git status docs/signals/` before staging.
- Durable cron flag session-only — re-arm after restart.
