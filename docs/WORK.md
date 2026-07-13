
---
## [Developer] 2026-05-18 — Task 1941a: cashFlowTool OCF API-bridge preference fix

`get_cash_flow` now reads `operating_cash_flow` (vnstock API bridge) before `operating_cf` (OCR/PDF). VCB Layer-7 ratio fixed: 1.23e15 → 9,947,260 triệu VND, OCF/NI ratio = 1.15 (passes guard). FPT OCF fixed (4,108,450); ratio still suppressed due to separate NI OCR extraction bug. 17 cashflow tests pass. Docker rebuilt.

---
## [Digest & Predict] 2026-05-05 21:32 UTC — DAILY digest ABORTED (bootstrap unreachable)

**Trigger**: scheduled `vn-digest-writer` (daily 15:30 UTC slot, fired ~6h late at 21:32 UTC).
**Flow**: `.claude/flows/digest-predict/daily.md` step 0 (cycle-bootstrap).
**Status**: STOPPED at step 0 per fail-loud protocol. No digest sent. No predictions emitted. No Telegram traffic on `market` or `bug` channels.

**Blocker — MCP unreachable from scheduler runtime**:
- `https://zenmidi.com/mcp` → DNS resolves to `127.0.0.1`, port 443 connection refused.
- Project `.mcp.json` is `{"mcpServers": {}}` — no servers registered for the gateway.
- Tried `call_tool` against candidate server names {`zenmidi`, `vn-mcp`, `vn-market-intelligence`, `market-intelligence`, `default`, `meta`}: all returned `unknown server`.
- Consequence: `get_cycle_bootstrap`, `get_market_summary`, `send_telegram`, and `submit_feedback` are all unreachable. Cannot even fail-loud to `bug` channel via Telegram.

**Pipeline state**: `docs/pipeline-state.json` was `idle` at run start (last update 2026-05-05 06:30 UTC by `dev-team-cron`). Not modified by this run — no agent chained.

**Notes / reasonable choices made autonomously**:
- Did NOT fabricate Nhân Hòa score, regime signals, VN-Index level, FX/commodity values, Kinh Dịch hexagrams, or chain findings. The flow is built around real market context; synthetic numbers would corrupt the prediction track record and violate `cycle-bootstrap/SKILL.md` ("stale context produces worse signals than silence").
- Did NOT spawn `ops` — interdiction allows it, but no agent-spawn mechanism is wired into a cowork scheduled-task runtime; the dispatch table in `CLAUDE.md` assumes an interactive PO loop. Recording the blocker in WORK.md is the only sink reachable here.
- Did NOT touch `pipeline-state.json` — keeping it `idle` is correct; this run made no progress toward any task.

**Next action required (for next live human/PO cycle)**:
1. Verify `zenmidi.com/mcp` is actually serving from the runtime that hosts the scheduler (not just from a developer workstation).
2. Either populate `.mcp.json` with the correct server entry for the VN MCP, or wire the scheduled-task runtime to the same gateway the interactive cowork session uses.
3. Re-run the daily flow once bootstrap responds; the Mon-prediction window is missed for this week unless the Monday flow ran independently.


- **Fired**: 1 (GAS price_anomaly signal_id=1654 ✓)
- **Pending Schema Fix**: 4 (VIC, FPT chain_catalyst; HPG cross_validate; Gold urgent_news)
- **Watchlist hits**: 8 stocks across 5 sectors
  - **Bullish**: VIC (+6.88% | Pyn Elite fund top holding), FPT (Intel partnership), HPG (leadership call)
  - **Bearish**: GAS (-3.07% | fuel retail margin pressure), Gold sector (fund liquidation cascade)
- **Market context**: VN open (05:50 UTC), 4 alerts pending, real estate + banking strong
- **Next**: Market event trigger or 05:45 UTC cycle continues

---
## [PO] 2026-04-28 — TASK-1380 reclassified

TASK-1380 updated: [DATA] → [BUG]. Root cause confirmed by ops: alert_engine fires change_pct calculations during pre-open window (00:00–02:00 UTC) against an inconsistent reference price. GAS feed is fresh and VPS is healthy — no data loss, no stale feed. Bug logged as log_fix id 193. Fix: suppress change_pct alerts outside VN trading window (02:00–09:00 UTC) or validate reference price matches prior session close before firing. Recurrence check: 0 prior alert_engine pre-open commits — first occurrence, no ARCH REVIEW flag.

---
## [News Scout] 01:37 UTC — 1 signal analyzed
- Fired: 1 (VIC fundamental_validation)
- Suppressed: 2 (FPT earnings, OIL macro — schema validation pending)
- Analysis chains traced: 3 (FPT, VIC, OIL)
- Watchlist impact hits: 8 stocks across 4 sectors
- **Next**: Continue 15-min cycle at market open (02:00 UTC)

---
## [News Scout] 01:36 UTC — 30 items analyzed
  Fired: 2 signals (1 chain_catalyst: "Sell in May" macro warning + 1 urgent_news: BVH earnings)
  Suppressed: 0 | Pending validation: 1 (existing VIC price_drop from market-watcher)
  Regime: NEUTRAL + FII_OUTFLOW_RISK (hot money risk flagged)
  Next: 01:45 UTC (15-min cycle) | Watchlist: 34 tickers monitored

## [Developer] 2026-05-14 — 1916a-vps-part: add GET /proxy/bctc-discover/:ticker to vps-proxy-server.js — deployed to VPS 125.212.251.27:8765, 200+[] with key / 401 without key — branch task/1916a-vps-discover-route commit 1b8f8cd5

## [Developer] 2026-05-22 — 1970-ta-ohlcv: taOhlcvBackfillJob added — daily 01:30 UTC cron, INSERT OR REPLACE heals 1972-era low=0 corrupt rows, TA_MIN_ROWS=35, 10 tests GREEN, tsc clean — apps/mcp-server

## [Developer] 2026-07-10 — D4-BACKLOG-HYGIENE-ORCH-COLD-EVICT-EXTEND: scripts/orch-cold-evict.sh new Pass-1 category scans flat lanes {backlog,review,qa,in_progress,ready} for terminal-status rows, cold sink = dormant .backlog_detail[] archive field, --exclude-ids safety valve added — 27/27 GREEN new scripts/test/orch-cold-evict-tests.sh, no live-file execution (D1's job)

## [Developer] 2026-07-10 — D1-BACKLOG-HYGIENE-SWEEP-EXECUTE: BLOCKED, not executed. D0's persisted triage_result only holds aggregate counts (73/4/11) + 2 named exceptions — 3 of 4 exclude IDs and all 11 relabel IDs are unrecoverable from any repo artifact (verified via git show 26ffe7567 + repo-wide grep). Dry-run confirms 55 rows would auto-evict on 1-of-15 known protections. D1's own board row flipped BACKLOG→BLOCKED with remedy note (commit d45c03f1a) instead of guessing IDs.

## [Developer] 2026-07-10 — D1-BACKLOG-HYGIENE-SWEEP-EXECUTE retry: EXECUTED LIVE (eviction sub-scope only). D0B (98d26dc01) closed the gap above; re-verified triage_result.exceptions[] independently before use. orch-cold-evict.sh --exclude-ids run live — evicted 2 done[] + 15 done_verified[] + 55 flat-lane rows (54 backlog + 1 review) to archive/2026-07.json, all 4 excludes confirmed still hot post-write. Conservation-guard OK (task_total 545→473, exact match; signal_total 2→0). Coherence warnings 72→16. Commit 42e565c7b. Close-exception + 10-row RELABEL relocation (D1's own remaining sub-scopes) still NOT started — held out of scope this cycle by router.

## [Developer] 2026-07-10 — D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING (sprint-closing task): scripts/orch-validate.mjs Stage-1b (lane coherence) flipped warn-print-only → hard-fail (process.exit(2)). Negative-path proof (throwaway fixture, IN_PROGRESS in backlog[]) → exit 2 confirmed. Live orch-state.json re-validated clean (exit 0, 0 issues). orchStateSchema.test.ts 104/104 GREEN, orch-apply-wrapper-tests.sh 31/31 GREEN — no regression. Closed SHG-2/3/4/5 → DONE_VERIFIED (original code landed commit 46eba4b33/41d925d8c; only the coherence+hard-fail gate was outstanding). Discovered (reported, not fixed — out of scope): orch-cold-evict.sh's --exclude-ids feature now conflicts with hard-fail coherence (8/27 scripts/test/orch-cold-evict-tests.sh regressed, causally confirmed via git-stash baseline) — latent, not live-exercised (no cron; D1's 4 live excludes are lane-coherent BLOCKED status). Recommend follow-up backlog task. This closes BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP (D0→D0B→D1→D2.5→D3→D4→D5 + SHG-1..5, all terminal).

## [Developer] 2026-07-12 — FIX-NOTEBOOK-AUTOPRUNE-REGEX-HEADING-MISMATCH: scripts/agents-flow/notebook-auto-prune.sh's timestamp regex widened to match ALL real notebook heading conventions (compact `cycle-YYYYMMDDTHHMMZ`, dashed-no-seconds `Tick YYYY-MM-DDTHH:MMZ`, dashed-with-seconds/ms suffix, date-only) via one ERE with optional dash/colon separators, normalized to a fixed 17-char zero-padded numeric sort key so mixed-precision formats compare correctly; sort restricted to `-k2,2 -s` (was unbounded `-k2`, which silently fell back to alphabetical heading-text comparison on sentinel ties). Added a detection-only duplicate-consecutive-heading tripwire (pre-cap + post-prune) after code-auditing + git-archaeology PROVED the drop-oldest loop cannot itself fabricate a duplicate line (only ever removes) — real root cause identified as upstream: `docs/agents/dev-team/flow/post-cycle.md` Step 4.5 writes main.md without the notebook-write skill's AC-3 compose-then-single-write discipline (signal filed, out of zone). 5 regression tests (2 new real-format cases + 1 duplicate-tripwire case), all GREEN. Live-verified against 100%-real prepend-style main.md content (current HEAD + reinstated real historical section) inflated past 200L: oldest correctly dropped, newest retained, ≤200L, zero duplicate headings in output. Also manually deduped a live duplicate heading found active in main.md during this task (unrelated occurrence, same bug class) — apps/mcp-server not touched (bash-only fix).

## [Developer] 2026-07-13 — TE-T01 (token-economy audit T-01): `.claude/skills/cron-cowork-team/SKILL.md` CronCreate prompt now runs `scripts/agents-flow/cowork-tick-preflight.sh` first (mirrors dev-team Job 1 WU-2), skipping the 15,916-byte `main.md` read on SILENT/LOST_ELECTION/DEFER ticks (~80% of 96 fires/day, ~300k tok/day). Prompt-only, zero flow-logic/cadence/script change. Commits 48c73f784 (SKILL.md) + d9a850e95 (board move REVIEW). QA next; router owes POST-CLOSE `/cron-cowork-team` re-arm after DONE_VERIFIED.

## [Developer] 2026-07-13 — TE-T04 (token-economy audit T-04): deleted the `## Example Invocation` tail (100-170L each) from all 6 high-cadence cowork tool packages (market-watcher/news-scout/alert-commander/unified-agent/qa-responder/digest-predict, ~150k tok/weekday), replacing each with 1 pointer line to `docs/agents/tools/list/<tool_name>.md`. Tool tables byte-identical pre/post (row-count verified). Also removed the brief's flagged stale WRONG example (market-watcher's `get_price_history` call used `tickers: [...]`, not the real `code: string` param). Docs-only. Commits 2c29f8e73 (6 packages) + 30f8a3c77 (board move REVIEW). QA next.
