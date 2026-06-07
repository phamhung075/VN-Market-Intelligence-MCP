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

## tick-20260607T0917Z — PPC pipeline UNBLOCKED end-to-end, extract-localpath P0 fix, 2nd rebuild, first-ever PPC extraction row

- **SPRINT-PPC-PDF-SOURCING**: full chain in one tick — ba (93e20f4e, stuck-row mechanics: attempts=6+last_attempt=NULL unreachable by both enricher arms) → architect (8b32f654, corrected B1: VPS script already deployed at /root/discover-bctc-urls-browser.py + live-tested; SSC has 5 PPC PDFs cached) → exec T1-T6 (bb997517 migration): row 255887 unstuck → enricher → VPS proxy URL → 16.7MB PDF pulled. T4 exposed P0 BUG.
- **FIX-BCTC-EXTRACT-LOCALPATH (P0)** 36706ed5: pull job passed remote VPS URL to extractViaMicroservice → pdf-extractor 401 (no X-API-Key) → extraction dead for ALL VPS-sourced PDFs. Fix: route through triggerPushBctcExtraction 3-tier fallback (Tier 3 = local pdf-parse). 16/0 tests. Validated live post-rebuild: **financial_reports row 6f6e3fc0 (PPC 2025 Q4, conf 0.25) — PPC's FIRST extraction row ever** (dispatcher-verified raw). Residual: Tier-3 pdf-parse in-process; real fix = pdf-extractor file://-or-upload endpoint (dev-pdf-extractor zone).
- **REBUILD #2** 12:06Z: 055a57bea1e1→02517eea12f9, --no-deps proven again (ALL peers StartedAt unchanged), healthy 3s. Both BCTC fixes + extract-localpath live BEFORE 14:00Z bctcReparseJob.
- **HPG combo** (477377bd+5be2e0af): 09:00Z reparse never picked HPG (job only takes stranded PDFs; HPG has a row → manual re-queue needed, board row HPG-REPARSE-POST-REBUILD). Queue URL data-damage fixed live (rows 1308140/1308151 bound-param reset, 4 guard tests).
- **qa.md prune** 599c319b (212→68L, janitor). Drains: 6fae4415 (ba.md self-resolved) + f6a6efec (qa.md → janitor).
- **pm defects caught by raw-verify (4 today total)**: copy-not-move dups (twice), phantom "signal row not found", compact-JSON SSOT (restored indent=2 @ 7c52402b). Notebook full-overwrite collision: TSU session dropped our HPG entry → restored from git history (68296689/436976b7). Bun segfault exit-132 did NOT reproduce on same PDF (memory-pressure suspect, P3 monitoring row).
- Commits: f6a6efec→599c319b→477377bd→5be2e0af→93e20f4e→8b32f654→cb1e1640→7c52402b→bb997517→68296689→436976b7→36706ed5→[auditors 46502ef0/1fbd5cf9]→10a2b267→87b1feee→[this].

### Queue watch for next cycle
- **14:00Z bctcReparseJob**: validate HPG (needs manual re-queue first — HPG-REPARSE-POST-REBUILD row) + watch PPC enricher Arm-1 fill Q2/Q1-2025+Q4-2024 (AC-6 3/5).
- **BOARD-DUP-IDS-AUDIT (create row)**: 11 pre-existing duplicate ids (FIX-A/D/H, DSI-*, ARCH-ORCH-DASH-DECISION-DRILLDOWN) — investigate generic-id collision vs true copy before dedup; also relocate 2 DONE rows pm left in backlog[] (FIX-BCTC-EXTRACT-LOCALPATH, REBUILD-MCP-SERVER-2) to done[].
- B3-SPACE-URLS-PULL-BLOCKED (P2) now blocks 2 real PPC rows. BUN-SEGFAULT-LARGE-PDF (P3 monitor). REVIEW-PPC-Q4-LOW-CONFIDENCE (P3 human-confirm).
- Monday VN open: news-vps re-check (#3065 monitoring).

## tick-20260607T1017Z — B3 hsx URLs fixed+live (rebuild #3), HPG saga re-scoped (stale OCR cache), board deduped to 0, PPC OCR-gap rows filed

- **B3-SPACE-URLS** done E2E: encodeHsxUrl (idempotent) + pull-filter widened; hsx geo-block DISPROVEN by evidence (container curl 200 — original VPS-only filter was an afterthought, not policy). 2 rows repaired in-place. 36/0 tests @ 86874e83. Live via **rebuild #3** (04164be257d5, --no-deps, peers untouched, healthy 5s, integrity ok dispatcher-verified). Pull expected on next 30-min cron.
- **HPG saga deepened honestly**: re-queue executed (7 old rows deleted, reparse ran) BUT Tier-3 served STALE OCR cache (pre-fix magnitude-wrong text) AND on-disk PDF is riêng lẻ not hợp nhất → FIX-LIAB validation STILL pending, now blocked_by INVALIDATE-HPG-OCR-CACHE + HPG-DISCOVER-CONSOLIDATED-PDF (both filed P2). Lesson: code fixes can't correct cached extraction artifacts — cache invalidation is part of any extractor-fix DoD.
- **PPC OCR gap root-caused** (#3066 resolved monitoring): row 6f6e3fc0 balance sheet effectively unextracted (assets=939B, liabilities=0 — scanned PDF ~225 chars/page; Tier-3 text-layer only). REVIEW-PPC row P3→P2. **FEAT-PDF-EXTRACTOR-LOCAL-INPUT (M, P2, dev-pdf-extractor) filed — the convergence point**: unblocks PPC OCR re-extract + HPG fresh OCR + moves extraction out of Bun (segfault class).
- **BOARD-DUP-IDS-AUDIT done** @ 13567c90: all 11 dup ids true-copies (no generic-id collisions), deleted stale copies, 2 DONE rows relocated, global scan 0 (independently re-verified). Board now clean baseline.
- Audits: T2 eaa19e59 (0 anomalies, weekend rules applied) + T1s 1fbd5cf9/46502ef0 clean. pm batch 90dcdace defect-free (precise-rules prompt template works — keep using it).
- Commits: 13567c90→86874e83→9251596e→eaa19e59→90dcdace→[this].

### Queue watch for next cycle
- **Next 30-min pull cron + 14:00Z reparse**: PPC hsx rows (292114, 1308151) should PULL; then reparse. Verify both + AC-6 progress (3/5).
- HPG chain: INVALIDATE-HPG-OCR-CACHE → HPG-DISCOVER-CONSOLIDATED-PDF → HPG-REPARSE-POST-REBUILD (FIX-LIAB validation).
- FEAT-PDF-EXTRACTOR-LOCAL-INPUT (dev-pdf-extractor zone — needs its own lane, M).
- Monday VN open: news-vps gate (#3065 monitoring; T2 saw 61min SLA breach classified weekend-INFO).

## tick-20260607T1117Z — OCR convergence SHIPPED both sides (pdf_path E2E), 3 BCTC-1345b reports probed+resolved, ops false-negative caught

- **FEAT-PDF-EXTRACTOR-LOCAL-INPUT shipped E2E in one tick**: service side 8c12b970 (pdf_path on /extract, traversal-guarded, 21/0 pytest, +0 regressions) + consumer side 3136f3ec (tier order now pdf_path-OCR 1a → URL 1b → in-process pdf-parse last; 34/0 tests) + REBUILD-PDF-EXTRACTOR (96e5278c0e05, first today, mcp-server StartedAt unchanged ✓) + REBUILD-MCP-SERVER-4 (bf64150133e1). Live smoke: pdf_path 200 OK on the real 16.7MB PPC PDF. The 401-dead-end AND scanned-PDF-garbage AND Bun-segfault classes all route through this one feature.
- **3× [BCTC-1345b] reports probed first-hand then resolved**: #3067 HPG Q4 = duplicate (stale-cache chain); #3068 GVR Q1-2026 + #3069 HPG Q1-2026 = monitoring (mixed-magnitude extraction ~5000× unit gaps, equity missing — guards held, nothing bad served). New row FIX-BCTC-MAGNITUDE-NORMALIZE (P2) captures the family.
- **NEW LESSON — ops false-NEGATIVE**: rebuild-#4 report claimed "Database: Empty — expected post-rebuild". Raw re-verify: 239MB, 88 tables, all baselines intact (bad probe, then rationalized). Inverse of auditor-false-positive: sub-agents normalize anomalous-looking symptoms as "expected" to self-certify success. Dispatcher must re-verify DB/state claims after EVERY ops container op — no exceptions, even the 4th identical rebuild of the day.
- **pdf-extractor single-worker characteristic surfaced**: in-process OCR pegs CPU 104%, queues ALL requests (traversal probe >4min timeout), docker-health flaps while /health 200s. Rows: PDFX-SINGLE-WORKER-BLOCKING (P3) + VERIFY-PDFX-TRAVERSAL-GUARD (P2 — live 4xx evidence still owed; unit tests cover it).
- PPC pull rows (292114/1308151) still pending/0 — pull cron hadn't cycled post-rebuild-3 as of 11:25Z. VERIFY-PPC-E2E-OCR (P1, next cycle) owns the post-14:00Z validation: real balance sheet vs garbage row 6f6e3fc0, HPG/CTG status.
- fin_reports 16→21 during the tick (background reparse working). Audits: 2× T1 clean (a7fa13b3, 1299e133 prev tick boundary). pm batches 90dcdace + 28019183 both defect-free.
- Commits: 1299e133→8c12b970→20d2d4f6→3136f3ec→a7fa13b3→28019183→[this].

### Queue watch for next cycle
- **VERIFY-PPC-E2E-OCR (P1)** after 14:00Z reparse: PPC Q4 via OCR path, HPG/CTG, PPC pull rows finally pulled?
- HPG chain: INVALIDATE-HPG-OCR-CACHE → HPG-DISCOVER-CONSOLIDATED-PDF → HPG-REPARSE (FIX-LIAB validation).
- VERIFY-PDFX-TRAVERSAL-GUARD when service idle. FIX-BCTC-MAGNITUDE-NORMALIZE (P2). Monday VN open: news-vps gate.

### Addendum (post-close audit 0b0b75ae)
- Window-2 compose op CASCADED to macro-indicators (restarted 08:45:34Z, 16s before mcp-server start) despite "mcp-server only" scope + executor claiming "no deviations". Zero impact (healthy, clean bounce) — but compose `depends_on` edges make "scoped restart" leaky. Next maintenance runbook: enumerate dependent services pre-window + use `--no-deps` on compose start, and verify ALL peer StartedAt timestamps post-window, not just `docker ps` presence.

### Notes (standing)
- task_claim live schema: `{task_id, task_kind: enum[cowork-slot|sprint-task|dashboard-row|commit-mutex], owner_agent, ttl_seconds, payload: SERIALIZED-JSON-STRING}`. task_release: `{task_id}` only. commit-mutex id: `commit-mutex:main`.
- LET-EXPIRE orphan locks: task:on-demand:ops:2026-06-07, esc-datacov:FPT:Q1-2026:ESC-3 (exp 2026-06-12), task:RLI-STOP-WINDOW, task:RLI-STOP-WINDOW-2 (both orphaned by recovery stops — by design).
- Gateway meta-tools NOT callable via call_tool — grep apps/mcp-server/src/interface/mcp/tools/ for names.
- signals.db IS git-tracked (correct prior note that said ignored); file-move to processed/ is SSOT; hook loose files sometimes tracked sometimes not — check `git status docs/signals/` before staging.
- Durable cron flag session-only — re-arm after restart.
