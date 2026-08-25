# dev-mcp-server -- Notebook

## 2026-08-24 — CCATO-MCP-T7-SKILL-DUAL-PATH (RLC dispatch) → review[]

**Session:** 7fd9c60a-9854-4589-9e98-e4c5e7e9168d. Depends on T6-TOOL-REGISTRATION (DONE_VERIFIED) — read T5/T6's shipped artifacts + the architect brief (`docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md` §3.4) as spec source since the board row carried no `detail_ref`.

**Fix (docs-only, no `apps/mcp-server/` code touched):** `.claude/skills/claim-truth-gate/SKILL.md` rewritten into an explicit Path A (MCP-native `call_tool(server="vn-market", tool="narrative_truth_gate", ...)` — primary for the 5 no-Bash cowork agents) / Path B (`scripts/narrative-truth-gate.sh`, unchanged, TNB-only per brief §6 R-5) contract, replacing the old single-path bash-exit-code invocation. Swapped the 5 T3 anchors named in brief §3.4 — `fb-market-poster/flow/daily.md` STEP 4d, `unified-agent/flow/chef-dish.md` Rule AF-3, `market-watcher/flow/cycle.md` Step 4f, `alert-commander/flow/stage-dispatch-log.md` Step 4a-pre, `digest-predict/flow/daily-predict.md` P-5.5 — from `GATE_EXIT = skill ...` (bash exit-code idiom, 0/1/2) to `GATE_VERDICT = call_tool(...)` (text-verdict idiom, PASS/FAIL(N)/CONFIG_ERROR), relabeling only the invocation call + the 3 outcome-bullet headers. Self-correct protocol steps and time-sensitivity override prose left byte-identical in all 5, per brief §3.4 ("anchor points... already correct and do not move"). `tran-ngoc-bau/flow/audit-market.md` (Path B/TNB) deliberately untouched.

**Scope note:** original T3 wiring (2026-07-11) also touched `fb-market-poster/main.md` + `unified-agent/chef.md`, but a later split (TE-T26/TE-T16, 2026-08-06) moved the live anchors into `daily.md`/`chef-dish.md` — confirmed via live grep across `docs/agents/**` for the current anchor locations, not the stale commit paths. `qa-responder/flow/cycle.md` + `digest-predict/flow/{daily,weekly,monthly}.md` also reference this skill but were never part of T3's/brief §3.4's named 5 — left untouched (still functionally correct post-edit, they only pointer-reference the skill, no local stale exit-code prose).

**Verified:** re-ran `CCATO-MCP-T6-TOOL-REGISTRATION.test.ts` (10/10 pass, 16 expect calls) confirming the tool this task now documents as primary is intact. No `apps/mcp-server/` source changed this task, so the G12 two-gate (bun test / tsc / tool-count / scheduler-count) does not apply — doc-only change, zero code delta.

**NOT shipped this pass (explicitly out of scope):** `docs/agents/tools/list/INDEX.md` + `narrative_truth_gate.md` stub regen — flagged by T6 as agent-father's exclusive zone, a separate follow-up. Path A's own full (a)-(e) DoD replay is CCATO-MCP-T8's scope (in `ready[]`, not started per dispatch instruction).

**Board:** `in_progress[]` → `review[]` (`status:REVIEW`, `next_agent:qa`) via `orch-apply.sh`, `.head` reset idle in the same write.

**Evidence:** commit (SKILL.md + 5 flow files, explicit pathspec) + decision-journal STEP `dev-mcp-server-S3` in `sprint-SPRINT-CCATO-TRUTHGATE-MCP-NATIVE-dev-mcp-server.md`.

Zone health: no code touched, all 5 named anchors verified present + swapped via post-edit grep, TNB/Path B correctly left alone (R-5), stale-path scope confusion (main.md/chef.md vs daily.md/chef-dish.md) caught before editing rather than after | HEALTHY.

## 2026-08-24 — CCATO-MCP-T8-DOD-HARNESS (dispatch-claimed, session 7fd9c60a) → review[]

**Session:** 7fd9c60a-9854-4589-9e98-e4c5e7e9168d. Row title's "§5.2" disambiguated by the dispatch prompt as brief §5 item 2 ("Integration DoD") sub-items (a)-(e), not a literal `### 5.2` heading. Depends on T5-USECASE + T6-TOOL-REGISTRATION (both DONE_VERIFIED) — read all of T1/T4/T5/T6's shipped artifacts before writing anything, test-only row, zero T1-T7 production code touched.

**Fix (new file only):** `apps/mcp-server/src/__tests__/CCATO-MCP-T8-DOD-HARNESS.test.ts` — 7 tests. Discovered a structural gap first: the production `narrativeTruthGateTool.ts` handler calls `runNarrativeTruthGate({post_body, agent_id, cache})` with ZERO deps overrides (always the REAL `DEFAULT_ORCH_STATE_PATH` + REAL network-calling probe adapters) — CCATO-MCP-T6-TOOL-REGISTRATION.test.ts's own header already documents this as the reason it deliberately never exercises a FAIL verdict end-to-end. T8's DoD (e) explicitly requires FAIL+signal-emit against an injectable fixture, which is structurally impossible through the real registered tool as shipped. Resolved with a test-file-local `callTool()` harness — a byte-for-byte clone of the production handler's Zod schema + response-shaping, parameterized by `RunNarrativeTruthGateDeps` — calling the real, unmodified `runNarrativeTruthGate` (T5) and `formatGateReport` (T6); zero business logic reimplemented, only deps plumbing added.

Probe strategy chosen per assertion, real code path wherever the test env allows it: (a) `get_technical_indicators` stubbed (the only dimension with no offline path — `computeTAIndicators` always makes a live HTTP call, R-3, verified by reading `infrastructure/microservices/clients.ts`); (b) `get_foreign_flow` REAL (`getForeignFlowHistory`/`analyzeForeignFlow` against 2 seeded in-memory `vnstock_trading_stats` rows); (c) `compare_financials` REAL against an empty `financial_reports` table. (c) deliberately does NOT use foreign_flow's own 1-row "insufficient" branch — verified empirically that its message ("Insufficient foreign flow data for X: only N row(s) found") does not contain any `tool_null_markers` substring (case-insensitive) and would misclassify NON_NULL/FAIL, the exact false-positive DoD (c) exists to rule out. Flagging this as a real latent defect in the already-shipped T3 probe adapter, not fixed here (test-only row).

**Tests:** all 5 lettered assertions (a)-(e) pass, plus a bonus end-to-end test against the real `docs/social/fb-post-2026-06-30.md` fixture (confirmed present per brief R-6) reproducing CCATO-MCP-T1's already-proven 2-candidate set (`technical_indicators::VNM` + `foreign_flow::foreign_flow`, both ticker VNM — verified empirically via a standalone `scanClaimCandidates` probe before writing the test) all the way through probe→classify→signal-emit, which T1's scanner-only parity AC never exercised. 7/7 pass, 31 expect() on first run, no flakes. `bun tsc --noEmit` clean. Full `apps/mcp-server` suite: 64 fail / 18 files (mapped by nearest-preceding stack-trace file path per fail line, not the unreliable "src/... header" grep — bun only prints a file header when that file emits console output during its run) vs. the documented ~50/15 baseline (drifts upward under fleet load, 52/17 measured same-day per handoff note) — zero overlap with anything CCATO/narrativeTruthGate-related; the 18 failing files are pre-existing (VPS proxy health, insider transactions, BCTC fallback/timeout, push-news, telegram routing, MCP tool registration, OCR fallback, backtest retrieval, foreign-flow-ohlcv-source, market-cap tool, task_heartbeat/task_release Zod optional-params). Gate 2: tsc clean, server boots on `PORT=3099` (`/health` → `toolCount:184`), tool count 184 / cron count 88 unchanged from pre-task baseline (test-only row, zero tool/cron registration touched).

**Docs updated:** `docs/architecture/microservice/mcp-server/testing.md` — added the T8 row to the Signal & Alert test table (sibling T1/T2/T3/T4/T5 rows already there; T6/T7 rows were never added by their own tasks — out of this task's scope to backfill).

**Board:** `in_progress[]` → `review[]` (`status:REVIEW`, `next_agent:qa`) via `orch-apply.sh`, explicit `commit` stamp on the row.

**Evidence:** commit `14048b9dc` (new test file only, explicit pathspec, `apps/mcp-server/` only — no commit-mutex claim, per INV-GATEWAY-1).

Zone health: bun test 7/7 pass on the new file (isolated + in full suite), tsc clean, 184 tools / 88 cron jobs intact, full-suite failing-file-set has zero overlap with this task's change | HEALTHY.

## 2026-08-25 — FIX-REAPER-ORPHAN-MINT-KEYS-ON-TTL-ONLY-NO-SESSION-LIVENESS-CHECK (dev-team BOUNDED-1 auto-pickup) → review[]

**Session:** 036ceaf1-bf34-46cd-92e4-8c6b213ff4bb. PO confirmed the defect at source (triage 2026-08-25T01:07Z): `gcExpiredLocks()`'s Phase-1 pre-GC scan (`coordinationStore.ts`) keyed orphan-signal minting on lock TTL expiry alone, never consulting `task_kind='session-presence'` — a live, presence-registered session's long-running task was falsely orphaned the instant its TTL lapsed.

**Fix:** added one correlated `NOT EXISTS` subquery to the existing Phase-1 SELECT — SUPPRESS-ONLY, never assert-dead: presence row PRESENT+unexpired for the row's `owner_client_session` → suppress the mint; presence ABSENT (no match, or `owner_client_session IS NULL`) → fall through to exactly today's behaviour (an undercounting roster can only make the guard weaker, never wrong). Self-join on `task_locks`, same transaction, zero schema change. Phase-2 DELETE unaffected — the expired lock still GCs either way.

**Tests:** 5 new cases added to `task-lock-coordination-store.test.ts`'s AC-11 block: AC-1 (suppress on live presence match), AC-2 (polarity, load-bearing — absent presence still emits exactly as today), AC-2b (expired presence row does NOT suppress), AC-3 (NULL-safety, no spurious NULL=NULL match), AC-4 (regression repro of the live incident — short-TTL sprint-task + long-TTL presence row survives GC with zero signal minted, lock still deleted). Targeted 4-file suite 89/89 pass (baseline was 84/0). `bun tsc --noEmit` clean. Tool count 184 / cron count 88 unchanged (infra-only change).

**Board:** `in_progress[]` → `review[]` (`status:REVIEW`, `next_agent:qa`), `.head` idle-reset in the same write.

**Evidence:** commit `0f6891872` (`coordinationStore.ts` + test file, explicit pathspec) + decision-journal STEP `dev-mcp-server-S93` in `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server-6.md`.

Zone health: bun test 89/89 pass (5 new, 0 regressed), tsc clean, 184 tools / 88 cron jobs intact, guard is structurally suppress-only (polarity cannot invert by accident since suppression requires an actual EXISTS match, never an absence) | HEALTHY.
