# Agent Father — Notebook



## c256 · 2026-05-22T12:45Z

**Sprint:** 1967c | **Task:** 1967-08 (dispatcher-wrap try/finally)

**ITEM-17 + ITEM-22 FIXED:**
- execute-tier.md: Step 1 claim-loop now populates `spawned_batch[]` (claimed tasks only). Steps 2+3 wrapped in `try/finally` — release loop in `finally` block reachable on ALL exit paths (success + exception).
- dev-team/main.md pipeline-resume (S2): `Agent(nextAgent)` now wrapped in `try/finally` — `task_release(resume_key)` in `finally` block.
- Both sites now match cowork-team/main.md reference pattern (CORRECT).
- AC-1..AC-5 PASS. AC-6 (tsc): markdown-only zone, 0 .ts touched.

**Signal emitted:** docs/signals/agent-father-1967-08-done.json → NEXT=qa, QUALITY=smart-skip

## c257 · 2026-05-22T06:37Z

**Sprint:** 1967c | **Task:** 1967-09 (signal protocol fixes — ITEM-14 + ITEM-11 + ITEM-10)

**ITEM-14 (AC-1/AC-2):** mcp-tools.md Signal Bus section added with full naming contract rule (`{from}-{ISO-8601-timestamp}.json`). anti-pattern examples included. Cross-link to agent-chaining-protocol.md added.

**ITEM-11 (AC-4):** cowork-schedule.json — 4 API_MIN_INTERVAL dead slots disabled (handoff said 3; audit found 4: news-scout-market, market-watcher-market, market-watcher-prepost, alert-commander-market). All set `enabled=false` + `_disabled_by` field.

**ITEM-10 (AC-5) + ITEM-14 (AC-3):** cowork-team/main.md — `## §drift-min` section anchor added above Step 3b. Drift envelope threshold table (safe ≤10 / caution 11-14 / risk ≥15) added. size-justification comment updated to ~300L. po/main.md — signal write rule added with ISO-8601 timestamp enforcement instruction.

**Collision discipline:** §drift-min anchor scoped to drift commentary only. Spawn-guard region (Steps 4.6+) untouched — reserved for TASK_1967-10.

**Signal emitted:** docs/signals/agent-father-1967-09-done.json → NEXT=qa, QUALITY=smart-skip

## c258 · 2026-05-22T13:00Z

**Sprint:** 1967c | **Task:** 1967-10 (miscellaneous MED/LOW bundle)

**ITEM-06:** news-scout.md + market-watcher.md responsibilities L22 updated — "all watchlist tickers" → "reactive, event-driven tickers". 1-line edit per file. agent-md-factory applied.

**ITEM-16:** spawn-guard documentation notes added. dev-team/main.md: comment after NEVER-spawn line. cowork-team/main.md: comment at L115+ (pre-Step-4.6), §drift-min (L64-90) untouched per collision constraint. cowork-team now 303L (under 310L flag threshold).

**ITEM-18:** DEFERRED — apps/mcp-server is dev-mcp-server zone, out of agent-father scope. Flagged in handoff.

**ITEM-20:** NO ACTION — TTL analysis confirmed safe, documented as analysis-only finding.

**ITEM-21:** D-N dimension added to docs/agents/system-auditor/audit-dimensions.md. DN-W1 + DN-W2 checks for TASKS.md + pipeline-state.json mtime 15-min bucket detection. WORK alert + DASHBOARD po-row on violation. Tier-3 03:00Z alongside D4.

**Commits:** f47ed0bf (ITEM-06+16), c8b053d8 (ITEM-21)
**Signal:** docs/signals/agent-father-1967-10-done.json → NEXT=qa

## Carry-over

- OQ-1: get_financial_summary — needs qa verification against live tool list
- OQ-2: macro_* naming convention — needs qa verification
- 1968c-P01/P02: await qa ratification (AC-6..8 pending)
- 1968d-P01/P02: QA APPROVED, DONE (Round-2 verified)
- 1968d-P03: DONE — awaiting qa approval
- 1967-07: IMPL_DONE — awaiting smart-skip qa
- 1967-08: IMPL_DONE — awaiting smart-skip qa
- 1967-09: IMPL_DONE — awaiting smart-skip qa
