# Agent Father — Notebook

## c293 · 2026-06-08T00:00Z — FIX-COWORK-GATEWAY-GATE

- Task: FIX-COWORK-GATEWAY-GATE (HIGH, S). Incident: FANOUT-2026-06-08 — market-watcher false-greened (fabricated shipped cycle + coverage-state stamps), news-scout half-failed (prose plan vs BLOCKED exit) when CLI gateway dropped.
- SSOT decision: DRY — gate text is identical for both agents → ONE canonical skill at `.claude/skills/gateway-availability-gate/SKILL.md`. Flow files carry pointer only.
- Gate mirrors bctc-analyst pattern: probe get_system_status → on transport-dead: (a) signal file docs/signals/{agent}-{ts}.json, (b) BLOCKED notebook entry, (c) EXIT. Explicit prohibitions embedded: NEVER stamp coverage-state, NEVER mark cycle complete, NEVER recycle prior data.
- market-watcher: gate inserted as Step 0-GW in cycle.md (before Step 0 bootstrap). 188L→191L. Size-justification updated.
- news-scout: gate inserted as Step 0-GW in cycle.md (before dispatch table). +5L. No size-justification needed (<120L).
- market-watcher/main.md Step 3 existing smoke probe: NOT removed — it covers the dispatcher path (different scope). Step 0-GW covers the per-cycle path. Both coexist without overlap.
- Decision journal: sprint-ORCH-DASH-DECISION-DRILLDOWN-agent-father.md STEP agent-father-S2.
- Files: 3 new/modified (.claude/skills/gateway-availability-gate/SKILL.md, market-watcher/flow/cycle.md, news-scout/flow/cycle.md) + decisions + this notebook.

## c292 · 2026-06-07T21:00Z — DJ-GATE-1: journal-before-DONE gate

- Task: DJ-GATE-1 (sprint WORKFLOW-FLUIDITY). Dashboard shows "No decisions recorded" for DONE tasks.
- SSOT chosen: docs/protocols/agent-chaining-protocol.md § Journal-before-DONE Gate (DJ-GATE-1). Same pattern as BGFAN-1 at L49.
- Primary lever: execute-tier.md spawn-prompt injection (covers all dev-* zone agents via dispatcher). Post-batch merge-gate step 5 also gates before pm flip.
- DONE-flip gate: pm/flow/main.md step 5 (≤4L) + qa/flow/main.md approved section (≤4L) — grep decisions/ for task-id; absent → REVIEW + status_note="journal-missing" + work channel alert.
- Direct-spawn agents: 1-line pointer added to dev-mcp-server, ops, code-janitor, agent-father flow/main.md.
- Cowork/ambient agents excluded (no task_board rows per DJ-GATE-1 scope exclusions).
- Files touched (7): agent-chaining-protocol.md, execute-tier.md, pm/flow/main.md, qa/flow/main.md, dev-mcp-server/flow/main.md, ops/flow/main.md, code-janitor/flow/main.md, agent-father/flow/main.md. Plus journal + notebook.
- Decision journal: sprint-WORKFLOW-FLUIDITY-agent-father.md STEP agent-father-S2.

## c291 · 2026-06-07T09:51Z — BGFAN-1: background fan-out mandate

- Task: BGFAN-1 (operator directive). Encoded run_in_background=true across all dispatcher flows.
- SSOT chosen: docs/protocols/agent-chaining-protocol.md § Background Spawn Mandate (new section). DRY: 6 files carry inline (background) markers + pointer only.
- Files modified (8): agent-chaining-protocol.md, dev-team/flow/main.md, drain-esc-dispatch.md, drain-signals.md, execute-tier.md, cowork-team/flow/main.md, spawn-fanout.md, cron-cowork-team/SKILL.md.
- Gating semantics preserved: background ≠ parallel. Dev-team gated chain (po→…→qa) backgrounds each spawn but awaits notification before next gate. Commit-mutex serialization unchanged.
- spawn-fanout.md is the real cowork fan-out point (not cowork-team/flow/main.md directly) — also patched.
- Decision journal: sprint-WORKFLOW-FLUIDITY-agent-father.md STEP agent-father-S1.

## c289 · 2026-06-07T05:08Z — FIX-AUDITOR-DB-LIVENESS

- Task: FIX-AUDITOR-DB-LIVENESS (HIGH). Signal row: rtr-auditor-db-stale-path-20260607T0512Z.
- Root: `apps/mcp-server/data/market.db` on host is stale orphan (market_messages=0, daily_ohlcv=0). Live DB in named volume `vn-market-intelligence-mcp_market_data` at `/app/data` inside container. All Tier-2/Tier-3 sqlite3 checks → false-RED.
- Fix: replaced ALL `sqlite3 "file:apps/mcp-server/data/...?mode=ro"` with `docker exec "$MCP_CTR" bun -e "import {Database} from 'bun:sqlite'; ..."` readonly pattern. Added dynamic container-name resolution step (`docker ps --format '{{.Names}}' | grep mcp-server | head -1`) — never hardcode compose-prefixed name.
- Fixed docker exec name literals: Tier-3 Container Tooling (A-22–A-24), Inter-Service (A-25–A-28), EPIPE (A-31), BCTC PDF (B-08) — all now use `"$MCP_CTR"` var.
- Also fixed: Tier-2 C-06/C-07/B-09/B-13 + Step-5 WAL check + integrity check.
- C-13 table entry updated: host-side `stat` → container `statSync` via bun exec.
- Files modified: 1 (docs/agents/system-auditor/flow/main.md 565L→620L). agent-md-factory P-1–P-6 + Q-1–Q-5 applied.
- Live validation: C-01=1599 codes, C-02=3190 rows (max_date=2026-06-05), C-06=0 (off-hours), C-14=0.2%, integrity_check=non-ok (DB corruption found — real signal, not false-RED). WAL=3.1MB via container statSync.
- Orphan disposition: `apps/mcp-server/data/market.db` is test-fixture artifact — NEVER delete (code-janitor decision); flag as stale orphan in return.

## c288 · 2026-06-07 — FIX-AUDITOR-FLOW-RESIDUALS (4 sub-items)

- Task: FIX-AUDITOR-FLOW-RESIDUALS. Files modified: 2 (docs/agents/system-auditor/flow/main.md 523→565L; .claude/skills/agent-md-factory/SKILL.md created 90L).
- (d) agent-md-factory skill MISSING from disk — RESTORED. Reconstructed from feedback_agent_md_factory.md + architecture-briefs contract. Pre-edit (P-1–P-6: SSOT, DRY, lazy-load, tree-DAG, frontmatter) + post-edit (Q-1–Q-5: re-grep, broken-ref, size-cap, MEMORY index, caveman) checklists. Path: `.claude/skills/agent-md-factory/SKILL.md`. Resolution: RESTORE (not de-reference) — rule is live across 22+ references in architecture-briefs and handoffs; de-referencing would break all callers.
- (a) C-01/C-02/C-14 weekend-aware: added DOW-based `<WINDOW>` guard above C-01–C-16 table. `'-3 day'` on Sat/Sun, `'-1 day'` Mon–Fri. C-14 also uses `<WINDOW>` and skips on NULL. Proven semantic: freshnessSlaChecker.ts `lastExpectedWindowEnd()`.
- (b) Tier-2 docker-exec sqlite3 residuals: C-06/C-07/B-09/B-13 and step-5 WAL check converted to host-side `sqlite3 "file:...?mode=ro"`. Schema also corrected: `news_articles`→`market_messages`, `bctc_queue`→`bctc_vps_queue`, `url`→`source_url`. Now consistent with Tier-3 C-01–C-16 pattern.
- (c) L438 signal_queue skip root-cause: trailing "Anomaly Reporting" section was read as optional. FIX: embedded signal_queue row write (Step E-3) directly into Tier-2 emit block and Tier-3 emit block. Added ANTI-SKIP: write failure → BUG Telegram, never silent-continue. Added OUTPUT-CONTRACT echo in RETURN block — `[OUTPUT-CONTRACT] signals_posted=N|...` is mandatory; omission = detectable violation.

## c287 · 2026-06-07 — Fix system-auditor Tier-3 DB checks (FIX-AUDITOR-DB-CHECKS-HOSTSIDE)

- Change: Rewrote `### DB Write Integrity Checks (C-01 through C-16)` in `docs/agents/system-auditor/flow/main.md`. All 16 checks now run host-side via `sqlite3 "file:apps/mcp-server/data/<db>.db?mode=ro"` — no docker exec, no write-mode open. Schema corrected: `stock_prices`→`daily_ohlcv(code,date)`, `ticker`→`action_code`, `updated_at`→`parsed_at/sent_at/fetched_at`, `bctc_queue`→`bctc_vps_queue`, `url`→`source_url`, `news_articles`→`market_messages`, `indicator_key`→`country`, `pdf_extractions`→`pdf_documents`, `completed`→`done`, `alerts` confirmed in market.db (not alert_engine.db — 0-byte file). C-12 now skips 0-byte DBs. C-13 uses host `stat` not docker ls. Size-justification updated to reflect host-side rewrite + all main-side content preserved (PLAN-ONLY invariant, SLA resolver, D-BCTC-EVAL, signal_queue L438 mandate, RAW-CITE GATE, settled-write).
- Files modified: 1 (docs/agents/system-auditor/flow/main.md, 519L→523L after rebase merge)
- Before/after: 6/16 checks executable → 16/16 checks (all execute without docker exec sqlite3)
- Rebase note: Prior run (commit 97090bc0) branched from origin/main 691 commits stale — cherry-pick conflicted. Rebase onto current main: preserved all main-side additions (PLAN-ONLY block, tier-early-exit logic, SLA resolver, D-BCTC-EVAL orch-state signal_queue emit, RAW-CITE gate) and applied host-side C-01–C-16 rewrite on top.
- Commit: see git log (rebased onto main)

## c286 · 2026-06-07T — WF-3-IMPL: INV-GATEWAY-1 documentation (WORKFLOW-FLUIDITY last task)

- Task: WF-3-IMPL (FIX, S). Implements architect ruling §5+§7 sub-tasks A+B.
- Sub-task A: fail-loud-protocol.md step 0 annotation updated — "WF-3 resolved 2026-06-07: Option III" + INV-GATEWAY-1 label.
- Sub-task B: 7 specialist flow files updated — removed commit-mutex/task_claim skill invocations; replaced with direct-commit + INV-GATEWAY-1 comments. Scope: developer/flow/main.md, microservice-main.md, dev-frontend/flow/main.md, dev-mcp-server/flow/main.md, qa/flow/main.md, developer/flow/feature-spike.md. commit-mutex SKILL.md received DISPATCHER-ONLY header note.
- FU-MCP-GATEWAY-DEV-FRONTEND closed by reference (same root cause — dev-frontend no longer contains mutex skill invocation).
- WF-3-IMPL status: TODO → REVIEW. .head set idle.
- Handoff: docs/handoffs/WF-3-IMPL.md
- Files touched: 9. NEXT: qa.

## c285 · 2026-06-05T21:56Z — REFINE-CRON-ARM: add refine_bctc_md to cowork schedule

- Task: REFINE-CRON-ARM (UNBLOCK, S). 7 BCTC reports stuck PENDING/PARTIAL — no schedule slot.
- Root: refine_bctc_md/init.md declared "fleet cron orchestrator (NOT auto-cron)" but cowork-schedule.json had zero refine entries. dev-team listed it on-demand-only. Nothing ever picked up reports.
- Fix: added 2 slots to docs/data/cowork-schedule.json: refine-bctc-slot-1 (09:00 UTC) + refine-bctc-slot-2 (14:00 UTC). Both off-market, outside OFF-HOSE window, clear of bctc-analyst (15/18/21/00h) and chef-evening (19:45h). Each slot calls get_bctc_pending_refine limit:1, picks OLDEST row, includes CV_CBTT/page_count<=4 skip guard per CTG sequencing requirement.
- Updated refine_bctc_md/init.md: added trigger.schedule_slots block pointing at both slots, updated inter_agent.recv to show cowork-dispatcher as caller entry-point, killed "NOT auto-cron" ambiguity in not_my_job.
- Wired cowork-team/flow/main.md boundary list: added refine_bctc_md to scheduled set.
- Commit: aec3a3d8 (3 files; solo — wip=0)
- Cowork refresh REQUIRED (flow file cowork-team/flow/main.md changed).

## c284 · 2026-06-04 — DSI-CONSUMER-HONORS-ISESTIMATE: carry provenance guard in chef + fb-market-poster

- Task: DSI-CONSUMER-HONORS-ISESTIMATE (P1). Root: consumers recomputed spread from raw fedFundsRate/vndDepositRate even after serve layer suppressed carrySpread=null + is_estimate=true.
- chef.md Step 6.5 L193: replaced hardcoded `FII_OUTFLOW_RISK`/`carry -33bp` example with neutral gap example. Added carry provenance rule: carry/FII narrative ONLY when `carry.is_estimate=false AND carrySpread!=null`; else insert `[gap: carry regime unavailable]`, never recompute from raw rate fields.
- fb-market-poster/flow/main.md STEP 1b: added `get_macro_snapshot` call + `$carry_usable` flag derivation. STEP 3 hard rules: added carry/FII provenance rule keyed on `$carry_usable`; blocks rate-differential + FII-outflow thesis when flag false.
- Size-justifications updated: chef.md 308→321L, fb-market-poster 465→489L.
- orch-state DSI-CONSUMER-HONORS-ISESTIMATE → DONE. head updated.
- Commits: see main commit.

## c290 · 2026-06-07 — FIX-REFINE-FLOW-FAILED-RETRY: Phase 0 is_first guard for FAILED reports

- Task: FIX-REFINE-FLOW-FAILED-RETRY (follow-up Action 3 from UNBLOCK-CTG-REFINE-DRAIN).
- Root (Layer 2): Phase 2 `is_first = (pushed_ids.size == 0)` — for FAILED report (e.g. CTG 49c11ce2, 56 FAILED units), pushed_ids has 56 IDs → chunk always empty → finalize FAILED again → infinite stall loop.
- Fix: `is_first = (pushed_ids.size == 0 OR report.refine_status == 'FAILED')`. Also updated Phase 0 step 1 inline schema comment to expose `refine_status` field (confirmed returned by getBctcPendingRefineTool.ts line 70/202).
- Verified: tool source returns `refine_status`; live DB confirms CTG 49c11ce2 refine_status='FAILED'; Layer 1 fix already in 00bf7648.
- Line count: 110 → 112. agent-md-factory P-1–P-6 + Q-1–Q-5 applied. No size-justification comment needed (<120L).
- Files: docs/agents/refine_bctc_md/flow/main.md (only). Scope: worktree branch (not main directly).

## c283 · 2026-06-03 — NB-FLOW-SETTLED-WRITE: migrate APPEND-class consumers to AC-3 settled-write invariant

- Task: NB-FLOW-SETTLED-WRITE (HIGH, root-cause fix). Closes notebook-bloat class.
- Root cause: skill SSOT (NB-WRITE-ATOMIC 948b6ed0 + NB-SKILL-CAP 2b42931f) mandates compose-in-memory then ONE Write/Edit (AC-3). chef.md and 4 peers never migrated — still encoded forbidden append-then-trim multi-Edit sequence.
- Live evidence: chef ran 08:49Z after 06:12Z skill commit → appended onto 186L base → 219L → context-bloat backstop fired 08:52Z.
- Files changed (5 flow/handler files, commit 04b20c87):
  - `docs/agents/unified-agent/flow/chef.md` — Steps 8b-8e replaced with compose-in-memory (8b) + single settled Write (8c) + AC-5 sanity-only check (8d); size-justification updated 289→308L
  - `docs/agents/news-scout/flow/stage-log-notify.md` — Stage 4 notebook block migrated
  - `docs/agents/bctc-analyst/flow/stage-log-notify.md` — Steps 5a-5c migrated
  - `docs/agents/agents-architect/handlers.md` — Brief-Commit Invariant Step 2 migrated
  - `docs/agents/digest-predict/flow/monday.md` — P-6 notebook commit migrated
- Audit verdict (6 agents): fb-market-poster=CORRECT (OVERWRITE class, defers to skill); digest-predict daily/weekly/monthly=CORRECT (defer to cowork-end-cycle→skill); all 5 above=FLOW-ORPHAN now fixed.
- Commit: 04b20c87
