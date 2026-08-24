# BA — Notebook

**Last updated:** 2026-08-23 | **Sprint:** COWORK-GUARANTEED-SLOT-CATCHUP

## UC-MDH-P2 · 2026-08-23

Design-Router dispatch (SPRINT-S, but routed to ba anyway per promotion_note): remove dead
append-session-record skill+tool, full consumer sweep + TE-T05 de-confliction. Re-verified the
"9+ consumers" claim at source instead of trusting the note: real count is **13** live files
(4 more than named — mcp-tools.md, both smart-compact-protocol docs, system-map.json). Found
digest-predict/market-analyst's actual FLOW files already don't call the tool (post-TE-T05
migration to end-0-cowork/notebook-write) — only their init.md/tools-package docs are stale, but
a genuine fresh stub (`sessions/archive/2026-08-07-developer.md`, non-test md5) proves that stale
instruction still fires occasionally. TE-T05 de-confliction is MOOT: it's DONE_VERIFIED
2026-08-08 and gone from the live board entirely (0 matches, full lane scan) — its own commit
already excluded append-session-record from scope, nothing left to orch-apply. Also found the
1300b test sandbox fix (AGENT_MEMORY_ROOT) already landed 2026-07-16 (commit 11c35c0a8),
pre-dating this dispatch — only the test-case deletion (deploy-coupled) remains. Wrote FR-1..FR-7
splitting safe-now doc work (skill delete, catalog fix, 13-file consumer sweep, stub cleanup)
from deploy-gated code work (MCP deregistration, registry regen, 1300b case delete — must land
atomically). 3 PO blockers (doc/deploy-gate split reading, agent-father file-ownership split,
deploy-window executor). Spec-only pass — every target file is agent/flow/knowledge-file class,
outside ba's forbidden_outputs; no code/docs/orch-state touched. Spec:
`docs/handoffs/UC-MDH-P2-BA-spec.md`. Recommended next_agent=architect (B1 to po in parallel).
Decision journal STEP ba-S7.

## FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER · 2026-08-23

po dispatch: bctc-inspect page (`apps/mcp-server/src/interface/bctc-inspector.html`, 2692L vanilla-JS,
NOT Remix — `apps/frontend`'s `dashboard.bctc-inspect.tsx` is a pure resource-route proxy) has one flat
257-option doc-select; add 2 client-side facet dropdowns (quarter, ticker) over `items[]` already
fetched by `loadDocList()` — zero backend change, `GET /api/bctc-inspect/docs` already serves
`action_code`/`period_type`/`period_year`/`period_quarter` per item. Decomposed into 8 FRs + 4 NFRs,
all interface-layer (zero domain/application/infra touch — a pure client facet filter + one cosmetic
server-side label fix collapse the whole feature into 1 layer). Live-verified landmine:
`DocListItem.period_quarter` (typed `number|null`) is the STRING `"Q1"` on 2/257 rows (both HUT) —
`buildLabel()` (`bctcInspectHandler.ts:167-171`) renders "HUT Q1 QQ1 2024"/"...2026" today; unnormalized
this ALSO inflates the quarter-facet option count 13→11 (not label-only, as PO's note first framed it).
Flagged FR-2 (module-level `allDocs` cache does not exist today — `loadDocList()`'s `items` is
function-local, needed for AC2's zero-network-call constraint) and FR-7 (selection-preservation on
filter change must NOT route through the existing doc-select change handler, which unconditionally
refetches PDF/OCR/table/MD — would break "no refetch, no flicker"). `period_type` holds `'Q1'..'Q4'`
per-row (never `QUARTERLY`/`ANNUAL` literal, 0 annual rows live) — quarter facet must derive from
`period_year`+normalized `period_quarter`, never `period_type`. 0 PO blockers — PO's own note already
forecloses backend work/deep-linking/WRITE-path fix as explicit out-of-scope. Spec:
`docs/handoffs/FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER-BA-spec.md`. Row updated in place (`backlog[]`):
`ba_spec_complete`, `ba_handoff`, `ba_completed_at`, `next_agent=architect` via `orch-apply.sh`
(conservation 767↔767). Decision journal STEP ba-S18.

## UC-SDF-P6 · 2026-08-23

Design-Router dispatch (P1, cross-service/): router's own note already flagged the title
("generate cron-registry.json") as stale (file exists since 07-15, self-demoted to
system-map.json via its own `_ssot`); re-verified live and found 4 NEW findings beyond the
note. Root cause of the 69-vs-70 internal self-contradiction: `1190-pipeline-watchdog.
test.ts:301` hardcodes `expect(schedulerFileCount).toBe(69)`. cron-registry.json/system-
map.json share length=70 today by COINCIDENCE — content diff shows 6 name-level divergences
+1 stray null entry, not interchangeable. Live-recomputed project-stats.json's 88
(61 table-driven + 22 bespoke + 5 summaryJobs call-sites) matches `gen-project-stats.ts`'s
own generator exactly — confirms 88-vs-70 is a genuine counting-UNIT divergence (call-sites
vs distinct-job-names), not drift. "fix gen-project-stats stale probe" (row's own note) already
shipped (c9e7ed717) — dropped from scope. Consumer-footprint check inverts the file's own
`_ssot` claim: cron-registry.json has 3 live test consumers, system-map.json's crons[] has 0.
Wrote FR-1..FR-7 (all infrastructure/tooling layer) + 4 PO blockers (Q1 canonical direction,
Q2 counting-unit ruling, Q3 recommend splitting `po_scope_expansion_20260722`'s session-
CronCreate liveness-plane content into its own row — sibling to 2 still-BACKLOG parts of the
same 3-part ruling, structurally different open-design problem — Q4 FR-7 sits in agent-father's
exclusive `docs/agents/**` zone). Spec: `docs/handoffs/UC-SDF-P6-BA-spec.md`. Row moved
`in_progress[]`→`backlog[]` (status BLOCKED, next_agent=po), `.head` reset idle, same
`orch-apply.sh` write per router's explicit terminal-shape constraint. Decision journal STEP
ba-S19.

## Archive

FIX-GHOSTZONE-P0-PAIR (08-22): auto-dropped from live notebook by `notebook-auto-prune.sh`'s byte-cap gate (same session — landing FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER's section pushed the file over cap; hook correctly picked the oldest dated section but, per the known `FIX-NOTEBOOK-AUTOPRUNE-ROLLING-SECTIONS-BYTE-COUNTED-BUT-UNDROPPABLE` bug, left no archive pointer — added here manually so the content stays discoverable). PO triage-dispatch: 2 of 5 minted "ghost zone" rows (P0, shared regression shape — "what the API serves must match MAX(date) in the table"), both `apps/mcp-server/`, zero file overlap — (1) CONVICTION-ASC-LIMIT-TRUNCATES-NEWEST (newest-N select + ASC-rewrap, avoids corrupting `buildSnapshot`/`buildSeries`), (2) FOREIGN-FLOW-MAXDATE-MISSING-NONNULL-GUARD (push `NOT NULL` guard into the `MAX(date)` subquery). 0 PO blockers on either. Full text in git history (this file, commit `7df31bd34` and earlier); specs still live at `docs/handoffs/FIX-GHOSTZONE-CONVICTION-ASC-LIMIT-TRUNCATES-NEWEST-BA-spec.md` and `docs/handoffs/FIX-GHOSTZONE-FOREIGN-FLOW-MAXDATE-MISSING-NONNULL-GUARD-BA-spec.md`; decision journal STEP ba-S16/ba-S17.

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
- **`emit_pressure_state` "success" is NOT evidence of a promote** (UC-SDF-P2, 2026-08-24). `promoteCycleSnapshot`'s file-not-found branch is `emitPressureStateTool.ts:264` `return {promoted:false, stale:false}` — so `success:true` + `cycle_snapshot_promoted:false` + `stale_warning:false` IS the silent-failure signature, not a healthy no-op. The freshness gate (`:291-293`, the ONLY thing that can set `stale:true`) sits DOWNSTREAM of that `existsSync`, so it never even sees a candidate. Producer names the file by wall clock (`tick-snapshot.md:34,37` `date -u +%H:%M`), consumer looks it up by nominal tick (`:398-401` regex off `tick_id`) — they can never agree. When auditing any tool with a "never throws" contract, enumerate its early-return branches BEFORE reading its return value as a verdict.
- **Three claims on the UC-SDF-P2 row were stale/wrong and cost re-derivation — verify row prose at source.** (a) "the on-grid file carries none of fetchedAt/created_at/macro_snapshot.fetchedAt so the gate refuses it anyway" is FALSE: `tick-snapshot.md:53` has passed `--arg created_at` since before the gate landed, and `emitPressureStateTool.ts:274-279` reads it second — fixing the filename alone WOULD promote. (b) the row's own requested gate `calendar_status != closed` is a NO-OP since TASK_2008a: `vnTradingCalendar.ts:30 SESSION_STATUSES` has no `"closed"` member and out-of-domain overrides are discarded (`:426-434`) — implement `∈ {open, half_day}` instead. (c) "restore the regime_status writer" only half-applies: `regime_status` is a wrong-key bug (real path `.macro_snapshot.data.signals.carry.regime`), but `volatility_level` matches ZERO paths and has no producer anywhere — repointing the regime key alone leaves `volatility_tier` pinned `low` at `cadence-policy.js:101-102`.
- **Flow-doc bash fences DO execute, but the dispatcher substitutes variables unreliably.** Live proof: `cycle-snapshot-03:02.json` (wall-clock filename) carries `tick:"2026-08-24T03:00:00Z"` (a nominal tick_id) — the fence ran but `--arg tick "$FILE_TICK"` got an LLM-supplied value. Same drift produced the anomalous nominal-named `cycle-snapshot-00:00.json` that is the ONLY reason `cycle-snapshot-latest.json` ever advanced. Corollary for any flow-doc hardening: put the logic in `scripts/` and pass ZERO interpolated values — derive state from on-disk files instead. Note `cowork-tick-postflight.sh` is NOT the alternate producer: it has zero live call sites (only a `dev-standards.md:1896` pointer + its own test).
