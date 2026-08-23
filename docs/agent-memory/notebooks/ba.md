# BA — Notebook

**Last updated:** 2026-08-22 | **Sprint:** COWORK-GUARANTEED-SLOT-CATCHUP

## FIX-GHOSTZONE-P0-PAIR · 2026-08-22

po triage-dispatch: 2 of 5 minted "ghost zone" rows (P0, shared regression shape — "what the API
serves must match MAX(date) in the table"), both `apps/mcp-server/`, zero file overlap. (1)
CONVICTION-ASC-LIMIT-TRUNCATES-NEWEST: `ORDER BY date ASC LIMIT 2000` on a 3942-row table keeps the
OLDEST rows, not newest — 48% invisible, frozen 64d. Fix = newest-N select, but MUST re-wrap ASC
before returning: `convictionHistoryHandler.ts`'s `buildSnapshot`/`buildSeries` silently assume ASC
input (last-write-per-symbol-wins, full-ASC-series contract, AC-2/AC-5 in
`TASK17-CONVICTION-conviction-history-endpoint.test.ts`) — a naive DESC flip ships correct freshness
but corrupts every symbol's score to its OLDEST value, undetected by any existing test. (2)
FOREIGN-FLOW-MAXDATE-MISSING-NONNULL-GUARD: `MAX(date)` subquery in `foreignFlowHandler.ts` omits
the `foreign_volume IS NOT NULL` guard its OWN docstring (line 8) mandates — a NULL-only day (e.g.
41 rows all NULL 2026-08-22) gets picked as latest, then the outer guard wipes it to zero. One-line
fix: push the guard into the subquery, keep the outer guard too (partial-null days still need it).
Both specs written independently (no shared file, no conflict) — 0 PO blockers on either (fix
directions already ratified in po's own ticket text; only open item is an architect-owned trade-off,
not a business call). Specs: `docs/handoffs/FIX-GHOSTZONE-CONVICTION-ASC-LIMIT-TRUNCATES-NEWEST-BA-spec.md`,
`docs/handoffs/FIX-GHOSTZONE-FOREIGN-FLOW-MAXDATE-MISSING-NONNULL-GUARD-BA-spec.md`. Both rows
updated in place in `backlog[]` (no lane move, matches BA-ANALYSIS-QUALITY-CONVERGENCE precedent):
`ba_spec_complete`, `ba_handoff`, `ba_completed_at`, `next_agent=agents-architect`, via
`orch-apply.sh` (conservation 715↔715). Decision journal STEP ba-S16/ba-S17. Session had no MCP
tool binding (gateway/vn-market `call_tool` absent) — Read/Edit/Write/Bash only, same known
limitation as 2026-08-12/08-14 cycles; no `task_claim`/`send_telegram` executed.

## Archive

UC-CCA-P2 (08-14): auto-dropped from live notebook by `notebook-auto-prune.sh`'s byte-cap gate (same session — landing UC-ASL-P3's section pushed the file over the 12000B cap; hook correctly picked the oldest dated section but, per the known `FIX-NOTEBOOK-AUTOPRUNE-ROLLING-SECTIONS-BYTE-COUNTED-BUT-UNDROPPABLE` bug, left no archive pointer — added here manually so the content stays discoverable). Design-Router dispatch (SPRINT-S/P1, RESCOPE — DMS-2 escalation-ladder absorption into gateway-availability-gate + 5-flow extension); 6 FRs, 0 PO blockers, 3 architect open questions. Full text in git history (this file, commit `db38e3bb5`); decision journal STEP ba-S14; handoff `docs/handoffs/UC-CCA-P2-BA-spec.md`.

TASK-COWORK-MUTEX-001 (08-14): auto-dropped from live notebook by `notebook-auto-prune.sh`'s byte-cap gate (same session — landing UC-CCA-P2's section pushed the file over the 12000B cap; hook correctly picked the oldest dated section but, per the known `FIX-NOTEBOOK-AUTOPRUNE-ROLLING-SECTIONS-BYTE-COUNTED-BUT-UNDROPPABLE` bug, left no archive pointer — added here manually so the content stays discoverable). Prior-art triage, verdict REFUTED (NOT shipped, 0% of Step 2.4 exists); routed directly to developer (BA/architect/PM chain already complete and current, re-planning avoided). Full text in git history (this file, commit `effb12572`); decision journal STEP ba-S13; handoff `docs/handoffs/TASK-COWORK-MUTEX-001.md` § [BA] Prior-art triage.

UC-CDC-P1 (08-14): pruned from live notebook 2026-08-14 (byte-cap discipline, adding UC-CCA-P2) — Design-Router dispatch (SPRINT-M/P1, calendar_status server-side compute). Split scope: WP-A (5 FRs, ready) shipped to architect; WP-B (decouple stale_warning) explicitly BLOCKED on UC-SDF-P2. Full text: `docs/handoffs/UC-CDC-P1-BA-spec.md`; decision journal STEP ba-S12.

Cycle FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T (08-13): pruned from live notebook 2026-08-14 (byte-cap discipline, adding UC-CDC-P1) — escalated BLOCKED to po (2 stale premises: shipped blocker treated as open, un-adjudicated architect census reclassified 6/7 of its tickers). Full text in git history (this file, pre-2026-08-14 revision); row detail at `docs/data/orch/orch-state.json` `.task_board.review[]` field `ba_triage_note_20260813T1226Z`; decision journal at `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-ba.md`.

Cycle TICK-PREFLIGHT-USAGE-INSTRUMENTATION (08-12): same known rolling-heading-byte-counted-but-undroppable over-drop fired again, same-cycle (`FIX-NOTEBOOK-AUTOPRUNE-ROLLING-SECTIONS-BYTE-COUNTED-BUT-UNDROPPABLE`, still BACKLOG, not re-filed) — the section was the ONLY dated section present when added, confirming again it is a byte-cap overage, not a section-count cap. Full content (3 source-verified findings: `exit_code`-not-at-choke-point, `elapsed_ms` BSD-date-`%N` landmine, WU-3's 2-of-3-sites double-log risk) is NOT lost — it lives in `docs/handoffs/TICK-PREFLIGHT-USAGE-INSTRUMENTATION-BA-spec.md` §1 and `docs/agent-memory/decisions/sprint-TICK-PREFLIGHT-USAGE-INSTRUMENTATION-ba.md`, neither of which was ever committed to this notebook, so no git-history recovery is needed either.

Cycles FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING + UC-RDL-P7 (08-12): both dated sections auto-dropped by the auto-prune hook 2026-08-12 same cycle (writing FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING's section pushed the file over the 12000-byte cap even with only 2 dated sections present — same known rolling-heading-byte-counted-but-undroppable over-drop, `FIX-NOTEBOOK-AUTOPRUNE-ROLLING-SECTIONS-BYTE-COUNTED-BUT-UNDROPPABLE`, still BACKLOG, not re-filed) — FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING's full text lives in `docs/handoffs/FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING-BA-spec.md` (never committed to this notebook, so no git-history recovery needed); UC-RDL-P7's full text is in git history (this file, pre-2026-08-12-second-write revision); decision journal at `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-ba.md`.

Pre-2026-06-24 specs (FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION, FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER, FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH, FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367, FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0, FIX-ERRAUDIT-W1-PEK-P0, FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE, FIX-ERRAUDIT-W1-MCP-P0, Cycle-2026-06-05-THRU-14): See `docs/archive/notebooks/ba-2026-05-21.md` and git history (commits 4b13a23–9a1e5e8; prior notebook revisions pre-2026-07-01). Cycles 2026-06-24 through 2026-06-30 (FIX-MACRO-SNAPSHOT-DELTAS-NULL, FRONTEND-FRESHNESS-TRANSPARENCY, FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT, FEAT-NEWS-DECISION-RESUME, MARKET-INDICATOR-DEPTH-P0, DEFERRED-TASK-SCHEDULER-MVP, BA-IND-P1-MOMENTUM-RS, BA-PREDICTION-EVIDENCE-REVIVAL): pruned from live notebook 2026-07-02 (200L cap discipline) — full text in git history (commit history for this file, pre-2026-07-02 revision). Cycles 2026-07-01 through 2026-08-08 (BA-FIX-BCTC-BANK-SUMMARY-MAPPING through IVC-ARCH-BLUEPRINT): pruned across successive cycles under the same 3-section/byte-cap discipline — full text in git history (this file, pre-2026-08-08 revisions); decision journals at `docs/agent-memory/decisions/sprint-{ULTRACODE-AUDIT-FIXALL,COWORK-GUARANTEED-SLOT-CATCHUP,COWORK-RELIABILITY}-ba.md`.

## Known patterns / preferences

- Error format all MCP tools: `{ error: '...' }` JSON, never throw.
- apps/macro-indicators is standalone Hono service port 5004, NOT part of mcp-server.
- apps/mcp-server zone = dev-mcp-server; kinh-dich-service zone = separate dev owner (port 5005).
- mark_alert_outcome → SQLite `alerts` table; write_alert_verdict → `docs/data/alert-verdicts.json` file store. DISTINCT.
- OHLCV date column is TEXT YYYY-MM-DD (string-sortable).
- TASKS.md cap = 80L; notebook cap = 200L — check wc -l before adding rows.
- Live DB probe pattern: `docker exec <mcp-server-container> bun -e "import {Database} from 'bun:sqlite'; ..."` against `/app/data/market.db` (named volume) — no sqlite3 CLI in container; sqlite3 CLI not installed, use bun:sqlite inline.
- Frontend route-file precedent: page routes may colocate DTO+parser+formatter+fetcher+component in ONE file (dashboard.momentum.tsx, dashboard.money-radar.tsx) and cross-import from sibling route files (momentum imports formatZScore from dashboard.indicator-gauges.tsx) — no shared lib/ module is required for page-scoped logic.
- cowork guaranteed-slot crons are ALL "MM H * * *" shape (MM≠0) — `snapToCronBoundary` (cowork-match-slots.js) has no snap branch for this shape; schedule-level `isSuppressedByBoundaryDedup` is provably always-false for these 8 slots. The `published:<slot_id>:<VN-date>` task_claim marker (via `task_list_held`) is the only real dedup/delivery-evidence source — never trust `last_fired` for delivery confirmation (stamped at spawn-dispatch only, cowork-team/flow/last-fired.md Step 5b). 6 flow files implement this gate today (chef.md, alert-commander, bctc-analyst, fb-market-poster, digest-predict, tran-ngoc-bau) — bctc-analyst's copy uniquely uses `task_kind:"sprint-task"` instead of `"cowork-slot"`, an inconsistency (UC-CCA-P3, 08-08).
- macro-indicators `usecases.go`: `vnIndexDelta`'s baseline is `prevVnIndex` (`resolvePrevSessionVnIndex`/`daily_ohlcv`), NOT `prevFetchedAt` — that field is the oil/gold/usdVnd commodity anchor only, name-collision risk. `computeDelta()` already null-guards (returns nil when its own `prev` is nil). `market_context` is a 3-way name collision: the `get_market_context()` MCP tool (no VNINDEX today), chef-synthesis's own field of the same name (shares macro_snapshot's tier-4 pipeline, not independent), and `market_prices.VNINDEX` (the real independent tier-1/2 plane, same value `get_market_snapshot` serves) — always disambiguate which is meant before wiring a cross-plane check.
- **Notebook-auto-prune hook over-drop, CORRECTION to my own 2026-08-06 theory:** reproduced again 2026-08-07 (adding a 3rd dated section dropped TE-T05 from the working tree, recovered via `git show HEAD`). My 2026-08-06 signal (`ba-2026-08-06T18:53:30Z-gateway-blind`, routed-to-po) claimed the hook "counts ALL `## ` headings toward a 3-section cap." **PO already read the script and ruled that theory WRONG** (`FIX-NOTEBOOK-AUTOPRUNE-ROLLING-SECTIONS-BYTE-COUNTED-BUT-UNDROPPABLE`, BACKLOG, owner=po→developer): there is no 3-section cap in `notebook-auto-prune.sh` at all — the real mechanism is the INVERSE: rolling headings (`Archive`/`Known patterns`) carry a MAX sentinel key so they can never be the drop CANDIDATE, yet their bytes still count toward the byte/line-cap overage, so every breach gets paid for by deleting a real dated section while the actual bloat (the rolling headings) is untouched. Do not re-file my debunked theory — the correct root cause + a concurrency-guard remediation (`FIX-NOTEBOOK-WRITE-AC7-SKILL`) are already tracked; nothing new to escalate here, just don't trust my own prior framing.
- Session-level MCP tool availability is NOT guaranteed for every BA invocation — verify the tool surface before assuming `task_claim`/`task_release`/`send_telegram` are reachable; a router-issued "release the lock yourself" instruction can outrun the actual tool grant bound to a given spawn (2026-08-12/2026-08-14, gateway/vn-market `call_tool` absent, Read/Edit/Write/Bash only).
