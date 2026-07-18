# PO Notebook

_Last: 2026-07-18T19:38Z (triage tick — MINT SPRINT-XS Tier-4 D-FLEET LANE-B prerequisite, non-blocking)_

## Tick 2026-07-18T19:38Z — MINT: CWO-T4-P0-TUSTATS-PERAGENT (P3, size XS, apps/mcp-server/)

### Trigger
- agents-architect brief `2026-07-18-cron-workflow-optimize-tier4-fleet-audit.md` §2c + §8 Phase-0, handoff signal `cron-workflow-optimize-tier4-fleet-audit-20260718T192722Z.json`. Note: "raise it to po/pm as SPRINT-XS for dev-mcp-server; do NOT attempt directly" — LANE-B, out of agent-father's apps/** zone.

### RAW-verify (did NOT trust brief alone)
- Confirmed no caller-identity channel exists: `grep _callerAgent apps/mcp-server/src` = 0 hits. All 3 cited files exist (perCallCounterStore.ts 1731B, server.ts 70KB, trackSessionToolUsageJob.ts). Prior art = TSU-DEV-U1 (`docs/handoffs/TASK_TSU-DEV-U1.md`) built exactly this substrate — this extends it (compound key + error counter + byAgent schema).
- Current stats schema is global-only: `{generatedAt,uniqueTools,toolCounts}`, gen'd 8h by trackSessionToolUsageJob. No agent dimension anywhere in path (gateway dials fresh SSE per call, drops it — root cause TSU-DEV-U1).
- No board-row collision (grep tool-usage/callerAgent/byAgent over board = 0 rows).

### Decision — MINT backlog row, P3, NOT immediate BATCH
- Priority P3 (low): brief §2c says pilot runs in tool-usage-stats DEGRADED mode (global-only, gap-labeled) — NOT a blocker. Only the §7-G5 graduation gate for a future permanent-cron-cadence ask. Must not jump live P0 rows (UC-CCA-P3, UC-RDL-P1).
- size XS honors "SPRINT-XS" framing; type SPRINT-S (nearest valid batch enum; XS not a type). 5 files, single domain, additive/back-compat each.
- zone apps/mcp-server/ (single, NOT multi): the 2 docs/standards files document THIS server's own tool-call contract; dev-mcp-server owns the unit.
- Encoded MANDATORY QA gate-proof in note: inject wrong-agentId call, prove NO silent misattribution (anchors: wrong-arg=silent-always-false, no-fake-data).

### Board write (via orch-apply.sh gate)
- Appended CWO-T4-P0-TUSTATS-PERAGENT → backlog[] (P3, XS, next_agent:ba). Zod+dupkey PASS, conservation +1 (543→544). Fixed a `mcp/mcp/server.ts` path typo pre-apply.

### Return to dispatcher
- Row minted, non-blocking follow-up. No BATCH dispatch, .head untouched. Routes normal dev-team chain BA→architect→pm→dev-mcp-server→qa in priority order when a coding slot frees.

### Dedup drain (same-cycle follow-up)
- agent-father raced the SAME router batch, dropped duplicate signal `agent-father-tier4-phase0-toolstats-backlog-20260718T194216Z.json` (to:po, brief_complete, §2c/§8) requesting the identical Phase-0 work. Dispatch race, not a new request. Drained → `docs/signals/processed/…-dup-of-CWO-T4-P0-TUSTATS-PERAGENT` (git mv R100, committed c222d7b4c). NO second row minted. Verified my mint 433ea4420 + row survived agent-father's interleaved Phase-1 commit 89943bd5b (no clobber).

## Carry-over
- CWO-T4-P0-TUSTATS-PERAGENT is BACKLOG P3 — promote to ready only when WIP<cap AND a permanent-Tier-4-cron ask is imminent (G5). Do NOT re-mint; annotate existing row. Pilot Run #1 legitimately runs WITHOUT this (degraded mode) — don't treat its absence as a pilot blocker.
- FIX-CI-GOLANGCI-CONFIG-VERIFY-NETWORK-FLAKE still BACKLOG plan-only P2 (prior tick) — promote via normal groom; don't re-mint on 3rd obs.
- Session: 95ab3ca8-b51f-4863-b8a6-95d5f33d2a2c (po triage). Commit MY paths only (orch-state mint + notebook + journal). Do NOT push (fleet-push launchd timer owns push).
