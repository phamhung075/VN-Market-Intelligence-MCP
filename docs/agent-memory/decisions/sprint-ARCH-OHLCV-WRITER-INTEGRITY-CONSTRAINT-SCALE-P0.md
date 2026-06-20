# Decision Journal — FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0 · architect

**Sprint goal:** Multi-zone P0 writer-integrity fix — close-outside-[low,high] + 1000x scale anomaly
**Agent:** architect
**Started:** 2026-06-20T08:09:11Z

---

### STEP architect-S1 · architect · 2026-06-20T08:30Z
**task-id:** FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0
**what-done:** Brownfield full writer audit + root cause mapping for 835-violation + DFF-1000x
**what-considered:**
- Zone 2 (apps/stock-price/): scanned all Go files — fetchers.go only reads daily_ohlcv (SELECT, Tier-3 cache). CLEARED.
- Writer F (priceBackfillService.ts): live INSERT OR IGNORE with LOCAL stub guard missing normalizeOhlcvToVnd + correct validateOhlcvUnit. GAP-1.
- Writer H (server.ts push-ohlcv-history): string-typed high/low coerced to `open` before guard — guard never sees real values. GAP-2.
- Schema CHECK approach (D-1): ALTER ADD CHECK blocked on existing table; SQLite table rebuild required; unsafe for P0.
**why-decision:** Both gaps are shallow (1-function replacements), no DDD violation for Writer F (domain→domain import allowed), and the existing guard infrastructure (validateOhlcvUnit Rule 5) already has the correct invariant — only the two bypass paths lack it.
**why-change:** no change from plan — gaps confirmed via raw code read; solution follows established Writer E reference pattern.

### STEP architect-S2 · architect · 2026-06-20T08:35Z
**task-id:** FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0
**what-done:** DFF 1000x root attributed to pre-guard era + mixed-unit VNDirect input; ABSORB decision for FIX-OHLCV-CLASS3-COLD-START-EXCHANGE-SEED-P2
**what-considered:**
- Option A: add prevClose>0 cold-start detection guard — REJECTED: existing guard correctly skips when no prevClose (safe behaviour); new guards protect forward, not backward.
- Option B: attribute DFF violations to historical residue + trust existing HILO_RATIO_MAX guard to catch mixed-unit input from VNDirect — CHOSEN.
- FIX-OHLCV-CLASS3-COLD-START-EXCHANGE-SEED-P2: root matches, no independent code fix needed → SUPERSEDED in board.
**why-decision:** HILO ratio guard (Rule 4: ratio > HILO_RATIO_MAX=5) catches mixed-unit DFF input (0.5/500 open/high → ratio=1000 after ×1000 normalization). No new logic required.
**why-change:** no change from plan.

### STEP architect-S3 · architect · 2026-06-20T08:40Z
**task-id:** FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0
**what-done:** Zone split confirmed: single Zone 1 (apps/mcp-server/), Zone 2 cleared
**what-considered:** only path: Go service has no write path to daily_ohlcv (confirmed by grep — only SELECT at fetchers.go:315 and INSERT to market_prices_cache at :359). No task needed in apps/stock-price/.
**why-decision:** Zone 2 read-only confirmed; PM creates all sub-tasks under apps/mcp-server/ specialist (dev-mcp-server).
**why-change:** no change from plan.

### STEP po-S1 · po · 2026-06-20T09:27Z
**task-id:** FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0
**what-done:** Re-triage tick to "drive the P0 to dispatch dev-mcp-server" — verified the request premise is STALE; took NO board mutation (correct disposition).
**what-considered:**
- Brief premise: P0 sits UNPROMOTED in backlog ~4h, WIP=0 → promote ready + set .head in_progress/dev-mcp-server to dispatch. CHECKED against live board: FALSE on all three counts as of 2026-06-20.
- Ground truth (board + git): the full pipeline already ran today — po-mint 8d4f3d2d → architect blueprint 867445e9 → pm decompose e343ebd9 (WIC-1 Writer F guard + WIC-2 Writer H parse-reject) → dev fix **aeacdb25** (write-time OHLC-invariant + scale guard MERGED) → dev→qa 2f5b0df1 → **QA APPROVED a22c037c** (tsc 0err, WIC-1 8/8 + WIC-2 10/10 isolation, test-realness REAL: injected close>high + h=l=0 + 1000x assert reject/repair). Both subtasks status=DONE. Parent status=REVIEW, done_verified:false.
- The NEW write-time CONSTRAINT guards the brief asks for ARE the ones shipped in aeacdb25 — NOT pre-existing from the done ARCH-OHLCV-WRITER-SSOT-DURABLE / FIX-OHLCV-SCALE-X1000 cluster. Confirmed not-superseded AND not-duplicate AND already-built.
- Single remaining gate = MONDAY 2026-06-22 cron-db-data-integrity LIVE re-sweep (0 new violations) post container REBUILD. Market closed Sun 06-20 → this is a TIME gate, not a dispatch gate. Router note: "NOT a code gap."
- Canonical .head currently in_progress on a DIFFERENT live P1 (FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH, db3 sibling), wip=1.
- CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR: real, in backlog, correctly blocked_by + depends on the P0 (must stay gated until P0 done_verified — else purge-defeated-by-backfill-seeder regression per memory). Already correctly sequenced; no change needed.
**why-decision:** Promoting→ready + repointing .head at the P0 would RE-DISPATCH dev to re-write already-merged QA-approved code (verify-raw-not-board-badge / don't-re-run discipline) AND derail the active vnindex head (wip would breach). The board is already at the correct terminal-pre-gate state. Correct PO action = NO mutation; let the Monday live-sweep gate flip done_verified, after which CLEAN auto-unblocks.
**why-change:** Hard reversal of the requested mutation — the request was authored against the 06-14 board snapshot; the 06-20 live board shows the work already drove itself to dispatch + completion. Acting on the stale premise would be a regression, not progress.
**parallel-auditor:** system-auditor DB-sweep re-confirmed SAME 835/129 breach (db-integrity-history.json scan_ts 10:30Z) — expected (residue persists until Mon rebuild+CLEAN); it wrote only signal_queue/history, orch-state.json mtime UNCHANGED (no task_board contention, no CAS conflict).
