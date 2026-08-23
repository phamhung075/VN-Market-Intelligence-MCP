# Task Report: FIX-COVERAGE-SWEEP-BLANKET-STAMP-DEAD-TRIGGER

date: 2026-08-23
outcome: APPROVED / DONE_VERIFIED (Direct-Commit Verify, branch:null; row carried a prior QA CHANGES_REQUESTED from 2026-08-06 — re-ran that same close-gate live, 18 days later)

changed: scripts/agents-flow/coverage-stamp.sh, coverage-stamp.test.sh, docs/agents/news-scout/flow/stage-log-notify.md + stage-sentiment.md, docs/agents/market-watcher/flow/cycle.md.

Re-ran the row's own 2026-08-06 QA CLOSE-GATE (G1/G2/G3) live rather than trusting the frozen prior verdict:
- G1 (transport): still holds.
- G2 (live invocation): NOW HOLDS — coverage-state.json `_updated_at` moved to 2026-08-22T20:11:18Z (was frozen 2026-07-25T16:14:39Z); per-ticker stamp groups no longer a single blanket group — news_scout groups=[23,34], market_watcher groups=[23,31,3].
- G3 (sweep_config): NOW HOLDS — key present, correct defaults {max_staleness_hours:48, sweep_batch_size:3}, not clobbered; market-watcher's own notebook shows `sweep_tickers_forced=3` matching config — rotation is actively firing, not just structurally present.

tests: `coverage-stamp.test.sh`: 29 pass / 0 fail (re-run). Flow-doc wiring confirmed in all 4 sites.

verdict: APPROVED

### Issues
None. All 3 gates that failed in the 2026-08-06 CHANGES_REQUESTED now independently hold on fresh live evidence.

Merge Status: DONE_VERIFIED, no merge (already on main). Board write: orch-state.json commit `90162fc4e`.
