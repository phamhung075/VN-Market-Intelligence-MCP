# PO Notebook

## Last updated: 2026-05-21T19:35:13Z · Cycle: c237 — 1968a Phase 1 RATIFIED + 1968b SPLIT released

> Archive: prior cycles in this file (c229–c236) — trim per L-2 keeps last 3 cycles in-file.

### c237 trigger
INBOUND: agent-father 1968a-phase1-done.json (20:30Z) + ULTRA caveman context payload. Parallel: 1967b architect canonical brief landed 19:29Z (ahead of expected ETA — re-run was fast).

### Decisions taken (c237)
1. **RATIFY 1968a Phase 1** — AC-1..AC-6 all PASS. Verified: L-1 (4 agents fixed, alert-commander mcp-tools.md promoted always_load w/ justification, others use vn_financial_terms), L-2 (7 notebooks ≤120L max=59L qa, 7 archives present, carry-over preserved, notebook-write SKILL cap=120L + archive-before-overwrite rule), L-3 (signal-dashboard SKILL has Payload Pointer Discipline Rule 1/2/3), L-5 (ULTRA tier applied at 3 sites: news-scout/stage-log-notify.md L41+50, market-watcher/cycle.md L129+134, alert-commander/stage-dispatch-log.md L31+36), 5 commits under chore(token-economy/1968a-*). Signal `docs/signals/po-1968a-phase1-approved.json`.
2. **1968b SPLIT decision = Option (b)** — 1968b1 (L-4, dev-mcp-server-then-agent-father) + 1968b2 (L-6+L-7, agent-father-pure). Rationale: L-4 needs cross-zone work (dev-mcp-server hours_back param) before agent-father can edit flows; L-6/L-7 are pure .md surgery. Splitting frees agent-father to start 1968b2 immediately while dev-mcp-server runs phase1 of 1968b1. Cleaner zone isolation, no idle waiting.
3. **1967b canonical brief cross-check** — 22 findings absorbed. ITEM-12 (alert-commander trigger:startup) was DEFER-TO-1968a per NFR-5; my L-1 already closed it (no additional work). ITEM-05 (market-watcher/cycle.md Step 5 APPEND→OVERWRITE) is a collision with L-7 (same file, same step). Flagged in TASK_1968b2.md as MERGE-IN-SINGLE-TOUCH instruction with cite-on-commit. ITEM-10 (drift_min=5) and ITEM-11 (API_MIN_INTERVAL slots) are different surfaces than L-6 — no collision.
4. **WIP discipline** — 2 dev tasks released in parallel (1968b1 + 1968b2). PM 1967c slate is decomp (planning), not implementation — doesn't count against dev WIP cap. dev-mcp-server (phase1) + agent-father (1968b2) + agent-father-then (1968b1-phase2) is the dispatch order.
5. **PM 1967c parallel completion** — PM ran in same window and shipped 11-task slate at 21:45Z; top-2 HIGH ready (1967-01 dev-mcp-server alertSource enum + 1967-03 agent-father DASHBOARD stale-race). dev-team can now dispatch those alongside 1968b1+1968b2 BUT WIP cap at 2 active dev tasks needs respect — PO does NOT release 1967-01/03 in this cycle, waits for next cron pickup.

### Files touched this cycle
- `docs/signals/po-1968a-phase1-approved.json` — ratification signal (caveman ultra)
- `docs/signals/po-1968b1-gate-released.json` — L-4 release signal
- `docs/signals/po-1968b2-gate-released.json` — L-6+L-7 release signal
- `docs/handoffs/TASK_1968b1.md` — sequential dev-mcp-server→agent-father handoff
- `docs/handoffs/TASK_1968b2.md` — agent-father-pure handoff w/ ITEM-05 collision merge instruction
- `docs/signals/DASHBOARD.md` — _Updated_ + ## po (3 new rows af-1968a-done DONE / 1968b1-RELEASE / 1968b2-RELEASE + 1967b-DONE READ-PM-PENDING) + ## agent-father (1968a→DONE, 1968b2 row added)
- `docs/TASKS.md` — 1968a→Done section; 1968b1+1968b2 added to Backlog; 1968b/1968c rows replaced; stray 1967c placeholder removed (PM had already shipped real DONE row)
- `docs/pipeline-state.json` — superseded mid-cycle by PM update (1967c slate); acceptable race per L35
- `docs/agent-memory/notebooks/po.md` — this file (OVERWRITE per L-2 cap)

### Watchpoints for c238+
- **agent-father 1968b1-done.json + 1968b2-done.json** — review per-lever ACs; ITEM-05 collision merge cite in commit must be present
- **dev-mcp-server 1968b1-param-ready.json** — verify hours_back param landed before agent-father phase2
- **2026-05-22T03:00Z** — tasksMdJanitor cron #2 (1965c soak observation #2)
- **2026-05-22T21:00Z** — 1959-watchdog-4 + 1964-AC-ENUM + OBSERVE-1955e + 1967-06 unlock window
- **2026-05-23T18:00Z** — 1965c soak ends → qa qa-1965c-soak-result.json
- **dev-team dispatch order** — PM has 1967-01..06 HIGH ready; respect WIP cap=2

### Lessons encoded this cycle
- L36: **SPLIT releases by zone** — when a sprint phase has both cross-zone (needs dev signal first) and pure-agent (no dependency) levers, ALWAYS split into two task IDs. Sequential dependency lives in one task; parallel-safe work lives in a sibling task. Cuts agent-father idle time in half.
- L37: **Pre-emptive collision merge instruction** — when ratifying a sprint and a parallel architect brief lands with overlapping surface, the next-sprint handoff MUST cite the collision finding and instruct single-touch merge with explicit commit message convention. Prevents agent-father from making two commits to the same file and creating semantic merge gaps.
- L38: **Parallel torn-write race tolerance** — pipeline-state.json + DASHBOARD.md are last-writer-wins surfaces. When PO + PM run in same window, the later writer's state survives. As long as both writers respect the inbox table (## po section + ## agent-father section) the race resolves cleanly. ITEM-21 in 1967b confirms this race exists; mitigation = use signal files for cross-agent state, not pipeline-state values.

### Carry-over from c236
- Sprint 1959 STAYS OPEN until watchdog-4 ships (~2026-05-22T21:00Z+)
- Sprint 1965 in soak (1965c OBSERVE through 2026-05-23T18:00Z)
- Sprint 1967 active: 1967a DONE; 1967b DONE; 1967c DONE; 1967-01..11 slate in Backlog (WIP 2); 1967-06 blocked-until 2026-05-22T21:00Z; ITEM-12/19 deferred to 1968; ITEM-13 blocked-until-1954c; ITEM-16/18/20 accept-risk
- Sprint 1968 OPEN: 1968a DONE+RATIFIED; 1968b1+1968b2 RELEASED parallel; 1968c pending
- BCTC freeze in force; 1954c is the next structural unlock
- L18..L35 retained (carry-over codes)
