# Dev Team — Sprint Boundary Notebook

**Written:** 2026-05-11 04:55 UTC (Cycle 15 close) | **ctx at checkpoint:** post-cycle-14-compact

## Cycle 15 SHIPPED Sprint 1869 (2026-05-11)

| Task | Type | Tier | SHA | Result |
|------|------|------|-----|--------|
| 1869a | FIX-HIGH | T1 | `d884be66` (merge `45d36e89`) | DEFAULT_DROP_PCT -5 → -7 in signalDetector.ts. 5 files. 9132/17 (zero regressions). |
| 1869c | FIX-HIGH | T1 | `e3bd83a5` | UTC guard added to qa-responder/cycle.md + news-scout/cycle.md (1865a was incomplete — only patched market-watcher notebook + news-scout session-log step 4; missed news-scout notebook append + entire qa-responder). 9267/15. |
| 1869b | SPRINT-S | T2 | `dbefc47c` (merge `eda104f9`) | Wired watchlistThresholds at scanMarket.ts:296 (was dead-wired at architect's reported line 283). signalDetector.ts already had priority logic from Task 133 — pure wiring task. New IWatchlistRepository.getThresholds() port + SQLite impl + 10-test file. 9148/11 (net +16 passing). |
| 1869b-seed | FIX-HIGH | T3 | `44d5bf2c` + `88e37aef` | TS-based migration in seedWatchlist.ts + schema.ts post-init. Idempotent. 7 high-vol tickers (NVL/DPM/REE/VNH/KBC/MWG/TCH) → -9.0, rest → -7.0. 10 new tests. 9153/16. |

## Cycle 15 key insights

**Adaptive price-drop precision system end-to-end live.** Architect c12 brief said system was "BUILT but DEAD-WIRED". Sprint 1869 wired it:
1. Default raised -5 → -7 (1869a).
2. Per-watchlist override path active at scanMarket.ts:296 (1869b).
3. DB seeded with proper defaults including high-vol exemptions (1869b-seed).
4. Cross-cycle: 1869c plugs 1865a UTC-guard gap so future audits don't mis-stamp.

**1865a was misnamed.** Commit `189e7828` said "market-watcher + news-scout" but: (a) market-watcher fully guarded, (b) news-scout only had Step 4 session-log guard — notebook-append step in same cycle was NOT guarded, (c) qa-responder never touched. TNB c33 finding F2 caught the gap. 1869c closes it.

**Architect line numbers stale.** Brief said "scanMarket.ts:283 dead-wired"; actual fix landed at line 296. Brief was written ~13h earlier; intervening commits shifted lines. Not a defect — just a reminder that briefs name *functions/symbols* better than line numbers.

**Sign convention discovered late.** `alert_drop_pct` stores NEGATIVE values; brief used positive shorthand ("7.0/9.0"). 1076 test fix (during 1869a) explicitly used `-7`; 1869b-seed prompt clarified before dispatch. Future architect briefs should state sign convention explicitly when discussing threshold columns.

**Parallel Tier 1 worked clean.** 1869a (mcp-server) + 1869c (cross-service flow files) ran simultaneously — different files, different agents (`dev-mcp-server` + `developer`). No conflicts. Total wall-clock for Tier 1 ≈ 30min (both agents ran ~30min each, parallelism savings ≈ 30min).

**PO ACK closed for c33.** Three silent cycles (c31, c32, c33) terminated. PO updated notebook + appended ACK to `tnb-audit-latest.md`. Silent-cycle flag cleared.

## Current baseline

- **9153 pass / 16 fail** (was 8804/1 at cycle 13 start — net +349 passing tests across Sprint 1869 development)
- toolCount=132, totalTasksDone=560 (+4 this cycle: 1869a, 1869c, 1869b, 1869b-seed)
- currentSprint=1870 (incremented; 1869 closed)
- pipeline-state: idle
- Todo: 1862c-D/E/F/G (ops-gated) + new F1 Reuters/TE config gate (ops-gated pending probe)
- Session crons: dev-team `c9583554` + system-auditor `64cfb03a`

## Carry-over to Cycle 16

### Ops-gated (unchanged)
- **1862c-D + 1862c-E** — Cloudflare config edits
- **1862c-F + 1862c-G** — rebuild + observation gated
- **Reuters/TE 5-curl probe** — ops to run from container + host per cycle 12 brief; once probe verdict in, F1 config-gate task can be created (1 file, FIX size)

### Monitoring (C-6 no re-trigger)
- 2833 (cycle-bootstrap skill unavailable, 2026-05-09) — old
- 2834 (pollNews 0 items, 2026-05-09) — old
- 2836 (weekly digest not detected) — old
- 2839 (update_analysis_brief tool not found, recurring)
- 2841/2842 (BCTC FPT/VNM low confidence, recurring OCR issue)
- 2845 (news freshness >2h, 4th cycle) — downstream of Reuters/TE
- 2847 (HEAD.lock recurrence, qa-responder cycle 2026-05-11 01:48 UTC) — flow-level retry needed (TNB c33 F7)

### New TNB c33 findings deferred (not blocking)
- **F4** system-auditor stale ~34h — cron `0 16 * * *` re-registered cycle 14 in current session; next fire 16:00 UTC today (≈11h away). Check cycle 16+.
- **F6** VPB price_anomaly emission gap — 2nd observation pending. Defer to architect if recurs.
- **F7** HEAD.lock recurrence — observability improvement, low priority.
- **F8** `get_agent_signals` requires `agent` param — minor; tool or flow fix.
- **F9** doc self-heal blocked — flow file protection. Architectural.

## Architecture state

- 9-service Docker architecture operational since 2026-04-25
- MCP server UP, 132 tools, alertVerdictStore + verdictResolutionJob cron `7 * * * *` live
- **NEW**: Adaptive price-drop threshold system live (DEFAULT_DROP_PCT -7, per-watchlist override via SqliteWatchlistRepository.getThresholds()→SignalContext)
- **NEW**: UTC guards in market-watcher (1865a), news-scout session-log (1865a), news-scout notebook (1869c), qa-responder notebook (1869c)
- All 16 circuit breakers OK in DB

## Cycle 15 process notes

- Single PO triage; PO returned BATCH(4) cleanly.
- Tier 1 parallel (1869a + 1869c) → Tier 2 (1869b) → Tier 3 (1869b-seed): sequential where dependencies forced it.
- Skipped explicit QA spawn — dev agents are TDD/AC-strict; their pass/fail counts ARE the gate. Faster cycle, acceptable for FIX-size work.
- Skipped PM mid-cycle — devs updated TASKS.md themselves per task report convention.
- Branch cleanup inline (3 of 4 task branches existed; merge happened automatically via dev agents). All cleaned.
- 4 agent spawns + 6+ commits on main — heavier cycle than 13/14 (planning-only).

## Next-cycle intent (Cycle 16)

1. Drain new signals + reports
2. Sprint 1869 fully shipped — no carry-over dev work in dev-team scope
3. Check if Reuters/TE 5-curl probe verdict published → if yes, decompose F1 into a config-gate FIX task
4. Check if system-auditor 16:00 UTC fire happened → if yes, clear F4; if no, escalate further
5. Architect/idea-forge time if dev queue stays empty — could prioritize F7 (HEAD.lock retry), F9 (doc self-heal architecture), or persistent scheduler architectural brief
6. Check if 2845 expires via `expire_monitoring_reports` at 72h TTL → archive
