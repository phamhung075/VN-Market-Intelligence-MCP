# Decision Journal — Sprint TOOL-SURFACE-UPGRADE · qa

**Sprint goal:** Registry generated not hand-rotted; parity test catches drift; telemetry, weak-claim verdicts, delta sweep, foreign-flow ingest repair.
**Agent:** qa
**Started:** 2026-06-07T08:30:00Z

---

### STEP qa-S1 · qa · 2026-06-07T08:30:00Z
**task-id:** TSU-DEV-U2-GEN
**what-done:** QA gate for registry generator + parity test (scripts/gen-tool-registry.ts, tool-registry-parity.test.ts, regenerated tool-registry.json, project-stats.json toolCount, gen-project-stats.ts registry-SSOT chaining).
**what-considered:**
- bun test: 8/8 pass (reproduced independently, not relayed from developer badge).
- tsc --noEmit: exit 0 clean.
- Anti-false-green: injected __test_fake_tool__ into alerts group — T-U2-5 (totalCount mismatch 163 vs 162) + T-U2-6 (missing tool name) both FAIL; reverted → 8/8 pass. Fence is real.
- DDD scan: scripts/ + __tests__/ only import node built-ins — zero domain/infra/app imports. PASS.
- Security: no process.env (only process.argv for --dry-run flag), no secrets, no SQL. PASS.
- Generator dry-run: totalCount=162, 12 groups, idempotent output matches committed registry.
- AC-U2-1..9 all verified against committed code. Sequencing note honored: TSU-DEV-U2-PARITY (final count after U3 deregistrations) is a separate downstream task.
**why-decision:** All checks green including independently reproduced anti-false-green injection. No arch concern (pure scripts + test file, no new MCP tool, no cross-service HTTP). APPROVED.
**why-change:** no change from plan.

### STEP qa-S3 · qa · 2026-06-07T12:00:00Z
**task-id:** TSU-DEV-U5
**what-done:** QA gate for foreign flow null holding ratio — DSI compliance gate for fabricated holding_ratio field (VPS API does not return this field; all stored values are ?? 0 fabricated zeros).
**what-considered:**
- bun test TSU-DEV-U5-*.test.ts: 10/10 pass (reproduced independently). 16 expect() calls.
- tsc --noEmit: exit 0 clean (0 errors).
- DDD scan: foreignFlowAnalyzer.ts (domain/services) has zero imports from infrastructure or application. PASS.
- Security scan: no process.env in any of the 3 modified files. No secrets/tokens/passwords. PASS.
- mock-guard.sh exit 0: no fabricated-data patterns in production source.
- No bare catch: both catch blocks typed (err) with err instanceof Error guard.
- Tool description at foreignFlowTools.ts:138-147 does NOT mention "holding ratio change" — AC-U5-3 PASS.
- DSI edge-case analysis (handoff request): heuristic `history.every(r => r.holdingRatio === 0)` is correct. VPS API bgapidatafeed never returns the field — vnstockStore stores ?? 0 for ALL tickers. A genuinely 0% foreign-ownership ticker would also be treated as fabricated (false-null, not false-real). This is the correct conservative DSI posture: displaying 0.00% as real data would be the violation; treating it as unavailable is safe and honest.
- Reasoning string gate: `!isHoldingRatioFabricated && Math.abs(holdingRatioChange5d) > 0.005` at line 154 correctly suppresses the "foreign ownership up/down X% over 5d" append when fabricated. String is honest.
- Commits: c21cec46 (implementation) + 43894aaf (memory). Both on main (branch: task/TSU-U5-foreign-flow-null-ratio was merged).
- AC-U5-1..U5-7: all verified against committed code. T-U5-1..T-U5-8 present in test file.
- Live-verify deferral: sprint-final rebuild per handoff policy. Mark code-approved.
- Concurrency: U3 worker may be active — no contention (separate tool zones, no shared files).
**why-decision:** All code-gate checks green. DSI heuristic is honest and correct for the known architectural constraint (VPS API never provides the field). No arch concern (no new MCP tool, no new domain service, modification is gate logic only). APPROVED (code gate), live-verify pending sprint-final rebuild.
**why-change:** no change from plan.

### STEP qa-S4 · qa · 2026-06-07T12:30:00Z
**task-id:** TSU-DEV-U3
**what-done:** QA gate for 12 weak-claim tool verdicts — 5 deregistered (no-op pattern, handlers retained), 7 integrated (description-only updates), registry regenerated 162→157.
**what-considered:**
- bun test TSU-DEV-U3-weak-claim-tools.test.ts: 12/12 pass (reproduced). bun test tool-registry-parity.test.ts: 8/8 pass (reproduced). tsc --noEmit: exit 0.
- 5 deregistered tools: server.tool() blocks replaced with no-op register* fns. grep confirms no server.tool("read_bctc_pdf|backfill_bctc_scalars|compute_accruals|get_accuracy_context|is_trading_day") anywhere in src/. tool-registry.json: all 5 absent, 5 tools in registry.ts array still call no-op stubs (harmless — they call nothing on server). This is intentional retain-handler pattern per architect verdict.
- 7 integrated tools: all 7 present in tool-registry.json (totalCount=157, computed sum=157). Description updates verified via test assertions (post-hoc/lifecycle/ops-package for mark_alert_outcome; market-wide/per-ticker for get_market_foreign_flow; ops/debug for circuit breakers; label-level for calibration; bctc-analyst/inspect for list_flagged; human-correction for submit_correction).
- DDD: interface→infrastructure imports are permitted per DDD rules (interface layer calling infra). No domain→infra violations. PASS.
- Security: no process.env in any of 12 modified files. No secrets/passwords. mock-guard exit 0.
- AC-U3-13: signal row tsu-u3-tool-deregister-signal-20260607 present in orch-state signal_queue status=NEW.
- readFileSync correctly removed from reports.ts import (readdirSync+statSync retained — still used by list_stored_pdfs). No orphaned imports.
**why-decision:** All 12 tests green (independently reproduced), tsc clean, 5-removal confirmed in registry, 7 integrate confirmed present, signal row confirmed. No arch concern. APPROVED (code gate), live-verify deferred to sprint-final rebuild per handoff policy.
**why-change:** no change from plan.

### STEP qa-S2 · qa · 2026-06-07T08:50:00Z
**task-id:** TSU-DEV-U4
**what-done:** QA gate for direction+delta sweep — Go test suite + go vet + live endpoint + gateway passthrough + additive-only + DDD + security all verified.
**what-considered:**
- go test -count=1 ./...: 12/12 packages pass (application, infrastructure, interface/http, module, 5 primitives). go vet: 0 errors.
- Live POST :5004/snapshot: vnIndexDelta=7.35, vnIndexDirection="up", oil/gold/usdVnd delta=null direction="unknown". Fields present and correct per ops handoff claim.
- Gateway passthrough: MCP JSON-RPC :3000 via Accept: application/json,text/event-stream → same 8 fields present in served payload. TS tool is thin proxy — confirmed passthrough, not a transform layer.
- Additive-only: git diff shows dtos.go = additions only (8 new fields, no renames or removals). AC-U4-7 PASS.
- DDD: domain/ports.go imports only context+time — no infrastructure/application imports. Fence-A clean.
- Security: no hardcoded secrets, no process.env in modified Go files. PASS.
- T-U4-1..T-U4-7 all present in usecases_test.go. Contract test updated with FetchPrevSessionVnIndex stub on both fake adapters.
- mcp-server: Up 2 minutes (healthy), RestartCount=0. "Up 21 seconds" ops note = normal restart from rebuild — not crash-loop.
**why-decision:** All gates green. additive-only confirmed. Gateway passthrough confirmed end-to-end. No arch concern (Go-only change, no new MCP tool, no new domain service). APPROVED.
**why-change:** no change from plan.

### STEP qa-S7 · qa · 2026-06-07T14:00:00Z
**task-id:** TSU-DEV-U2-PARITY
**what-done:** QA FINAL gate — four-count parity verification: gen-tool-registry re-run, /health runtime, parity test isolated, project-stats dry-run. All return 157. Bun crash provenance confirmed pre-existing.
**what-considered:**
- bun test tool-registry-parity.test.ts: 8/8 pass, 24 expect() calls (QA-reproduced, 157ms).
- bun scripts/gen-tool-registry.ts: totalCount=157, groups=12 (QA-reproduced, output matches committed registry.json).
- curl http://localhost:3000/health: status=ok, toolCount=157 (runtime confirmed).
- bun scripts/gen-project-stats.ts --dry-run: toolCount=157 (QA-reproduced).
- Four-count delta=0. Registry totalCount=157, _maintained_by header locked. project-stats.json toolCount=157 (3 locations).
- 5 deregistered tools confirmed absent: read_bctc_pdf, backfill_bctc_scalars, compute_accruals, get_accuracy_context, is_trading_day — none in registry.json tool lists.
- tsc --noEmit: exit 0 (QA-reproduced). DDD/security: N/A (JSON data files only, no TS source modified).
- Smart-Skip: mock-guard N/A (no production TS source modified, only docs/data/ JSON files).
- Bun crash provenance: archive qa-2026-05-13.md + dev-mcp-server-archive-2026-05-13.md both document "full suite Bun OOM crash is pre-existing (9273+ tests, peak 1.6–2.7GB RSS, Bun 1.3.13)". First documented 2026-05-13, multiple sprints before TOOL-SURFACE-UPGRADE. Crash is post-completion teardown, does NOT mask any test failure in the parity/U1/U3/U5/U6 suites.
- U1/U3/U5/U6 suites individually re-run: 8+12+10+17=47 pass / 0 fail. No regression.
- BCTC eval gate: N/A (no BCTC report_id in task scope).
- Concurrency: U6 confirmed DONE in orch-state. No active contention.
**why-decision:** All four probes return 157 with delta=0. All 6 ACs met. Bun crash definitively pre-dates sprint. No arch concern (terminal verification task, no new code, no new tool, no cross-service HTTP). APPROVED.
**why-change:** no change from plan.

### STEP qa-S8 · qa · 2026-06-13T17:13:00Z
**task-id:** TSU-DEV-U4
**what-done:** QA gate cycle-2 for 56822e4a — test-only seed-date-rot fix in repositories_test.go (T-U4-5 class).
**what-considered:**
- go test ./... -count=1: 12/12 packages green (own uncached run; no "(cached)" output).
- Live POST :5004/snapshot: vnIndexDelta=-6.960 vnIndexDirection="down"; oil/gold/usdVnd delta=null direction="unknown". Matches U4 spec exactly.
- grep 20[0-9][0-9]-[0-9][0-9]-[0-9][0-9] repositories_test.go: 4 hits (lines 198/225/271/278) are `2026-05-26` fixture timestamps for FetchVNIndex primary/secondary resolution tests — NOT relative-window seeds; NOT T-U4 tests; NOT the seed-date-rot class. T-U4-5 block (lines 838-841/875/913-914) confirmed 100% time.Now().AddDate() — zero calendar literals.
- git show --stat 56822e4a: 1 file only (repositories_test.go, 39 lines). Runtime dtos.go/usecases.go/repositories.go absent.
- Adverse-date proof: d0=now-2, d1=now-1, d2=now; ORDER BY date DESC → d2,d1,d0; OFFSET 1 = d1; assertion *got==1220.5 holds for ANY run date. Math: now-2 < now-1 < now always true in UTC.
- DSI null intent: oil/gold/usdVnd have no daily history table; null+unknown is the correct honest response.
**why-decision:** All 6 gate checks pass. Test-only scope confirmed. No prod-code change. No arch concern. APPROVED.
**why-change:** no change from plan.

### STEP qa-S6 · qa · 2026-06-07T13:30:00Z
**task-id:** TSU-DEV-U6
**what-done:** QA gate for description-only updates across 6 files, 10 tools, 5 TSH leftover pairs (commits 3dd0d7bd + ac1043a4 on main).
**what-considered:**
- bun test U6: 17/17 pass (QA-reproduced). bun test parity: 8/8 pass. Combined U3+U5+U6+parity: 47/47 pass.
- tsc --noEmit: exit 0 (QA-reproduced). DDD: PASS (interface→infra permitted; no domain→infra violations). Security: PASS (no process.env, no secrets).
- mock-guard exit 0. Smart-Skip applied: description-only change, no logic, no mock risk.
- AC verification: all 7 ACs confirmed against committed source. Factual accuracy spot-checked: news handler has zero ticker params (AC-U6-3 NO tickers); insider_signals handler uses _testData??[] (no DB call, AC-U6-6 accurate); tool-registry.json totalCount=157 unchanged.
- marketTools.ts + technicalIndicatorTools.ts not in commit diff — pre-existing descriptions confirmed passing via T-U6-1/T-U6-2 (handoff note "already present" verified accurate).
- Gateway live spot-check: not available in specialist sub-session (INV-GATEWAY-1); ops already verified get_market_summary + trigger_news_vps_fetch; source-code evidence authoritative for remaining pairs.
**why-decision:** All pipeline checks green. No logic change, no arch concern (description-only, no new tool, no cross-service HTTP). Tool count 157 preserved. APPROVED.
**why-change:** no change from plan.
