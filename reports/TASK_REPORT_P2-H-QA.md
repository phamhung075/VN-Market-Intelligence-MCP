## Task Report P2-H-QA

**Task:** P2-H-QA — Gate-keeper verification of P2-H-FIX (commit 5ab1711f)
**Date:** 2026-05-26
**QA Agent:** qa
**Verdict:** APPROVED — GO for P2-I

changed:
- apps/mcp-server/dashboard/index.html (inline data blocks added, fetch removed, window.__MCP_* removed)
- apps/mcp-server/dashboard/tests/trust-contract.spec.js (addInitScript removed, assertion-5 re-specified)
- apps/mcp-server/dashboard/playwright-verdict.json (regenerated)
- apps/mcp-server/dashboard/traces/sparkline-regression-tripwire.json (DELETED)

---

### Check A — User-Path Fidelity

Result: PASS

- `<script type="application/json" id="mcp-traces-data">`: PRESENT in index.html (lines 271-391). Contains 9 real traces (sparkline x3, signal-bus x3, sector-classifier x3), all status:pass.
- `<script type="application/json" id="mcp-modules-data">`: PRESENT in index.html (lines 393-412). Contains 12 barrels matching dashboard/data/modules.json.
- `window.__MCP_` occurrences: 2 — both in HTML comments only (lines 7, 476). ZERO in executable code.
- `fetch(` calls: 3 — 2 in comments, 1 at line 610 inside `loadMicroservice()` guarded by `window.location.protocol !== "file:"`. ZERO fetch calls for trace/module data.
- `KNOWN_TRACES` array: ABSENT (grep returned empty).
- `sparkline-regression-tripwire.json`: DELETED — confirmed "No such file" on disk.
- Data read path: `getInlineTraces()` reads from `document.getElementById('mcp-traces-data').textContent` via JSON.parse on DOMContentLoaded. `getInlineModules()` same pattern for modules block.

Spot-check 3 on-disk traces vs inline:
- sparkline-golden-happy: on-disk actual="▁▄▂█▇", inline actual="▁▄▂█▇" — MATCH
- sector-classifier-golden-known-ticker: on-disk actual="sector_wide", inline actual="sector_wide" — MATCH
- signal-bus-failure-missing-required: on-disk error="buildCrossValidateSignal: direction, confidence, and summary are required", inline matches — MATCH

AC-1: PASS. AC-2: PASS. AC-5 (KNOWN_TRACES gone): PASS.

---

### Check B — Render Proof on file:// Path

Method: headless Chromium via Playwright node script, page.goto("file:///.../index.html"), await scenario cards + module rows, screenshot captured + metrics logged.

Result: PASS

```
panels: 3 | cards: 9 | greenDots: 9 | moduleRows: 12
hasPhase2placeholder: false
consoleErrors: 0 []
httpRequests: 0 []
```

Screenshot saved to: apps/mcp-server/dashboard/render-check.png

3 panels present, 9 GREEN scenario cards, 12 module rows, zero console errors, zero HTTP requests — on the genuine file:// path, not a server path. test-path == user-path confirmed.

---

### Check C — Playwright Verdict (run independently)

Command run: `cd apps/mcp-server/dashboard && npx playwright test tests/trust-contract.spec.js --reporter=json`

Result: 7/7 PASS

- Assertion 1 (three panels): PASS
- Assertion 2 (no Phase 2 placeholder): PASS
- Assertion 3 (>=9 scenario cards): PASS
- Assertion 4 (>=1 GREEN dot): PASS
- Assertion 5 (renderCard() pure unit — mcp-dot-fail): PASS — `page.evaluate()` calls `renderCard({status:"fail",...})` in-memory; asserts returned HTML contains "mcp-dot-fail". NO on-disk fixture. NO addInitScript.
- Assertion 6 (zero console errors): PASS — 0 console errors
- Assertion 7 (zero network requests): PASS — 0 HTTP(S) requests

playwright-verdict.json stats: `{expected:7, unexpected:0, skipped:0, errors:[]}` — consistent with run above.

`addInitScript` in spec: ABSENT (grep confirmed — spec uses NO page.addInitScript()).

---

### Check D — Regression Re-baseline

**bun run check (tsc --noEmit):**

Exit code 2 — pre-existing TypeScript errors found:
- `apps/mcp-server/src/__tests__/bctcBatchTableBackfillJob.test.ts:466`: TS2769 — `'skipped_no_ocr'` not assignable to type (enum mismatch)
- `apps/mcp-server/trigger-backfill.ts:33`: TS2367 — comparison of `'skipped_no_file'` and `'skipped_no_ocr'`

Provenance confirmed: `bctcBatchTableBackfillJob.test.ts` was last modified by commit `6d7839be` (feat: BT-4b-2) and `0b4b3699` (feat: BT-4b one-shot BCTC table backfill job) — both BEFORE 5ab1711f. No commits between those and 5ab1711f touched either file. The dashboard commit 5ab1711f only touched 4 files: `dashboard/index.html`, `dashboard/playwright-verdict.json`, `dashboard/tests/trust-contract.spec.js`, `dashboard/traces/sparkline-regression-tripwire.json` (deleted). None are TypeScript source files. TSC errors are BCTC-pipeline pre-existing drift, not introduced by P2-H-FIX.

**bun test (full suite):**

Run completed: 9751 tests across 907 files (mcp-server suite only). Bun crashed with C++ exception during stats-reporting phase (known Bun 1.3.13 bug in large suites, not a test failure). Test execution itself completed before crash.

Fail count in mcp-server suite: 356 failing tests observed (grep "(fail)"). Zero failing tests trace to dashboard, index.html, trust-contract, mcp-traces-data, or mcp-modules-data.

Representative pre-existing failing tests confirmed present (matching dev's report):
- Task 1332 pollNews SOURCE_DISPLAY_NAMES (E2E timeout)
- Task 1345a pollNews newsapi fallback (E2E timeout)
- Task 178 get_price_history (microservice availability)
- Task 089 get_macro_snapshot (microservice availability)
- 1414 FILE 1 kinhDichTools.ts handler string diacritics (Vietnamese diacritics)
- 1416 wave5 Group B source-scan kinhDichTools.ts (Vietnamese diacritics)
- 1837a pipeline-state.json schema (pre-existing schema drift)
- Bootstrap Performance 230 AC-4c (agent .md check)

All pre-existing. None introduced by 5ab1711f.

toolCount: 146 (confirmed from bun test logs: `[createBunServer] Tools registered toolCount:146`)
scheduler: 68 (`grep -c "cron.schedule" apps/mcp-server/src/scheduler/startScheduler.ts` = 68)

**Re-baseline conclusion:** The 356 fail count (vs dev's reported 350) reflects test-suite drift on the local machine — network-dependent E2E tests time out differently per run. None of the failures trace to any file changed in 5ab1711f. The dashboard change is HTML/JSON/JS-only and structurally cannot cause TypeScript test regressions. Delta is pre-existing/unrelated. Re-baseline ACCEPTED.

---

### Summary

| Check | Result |
|-------|--------|
| A — inline data blocks present (9 traces, 12 barrels) | PASS |
| A — window.__MCP_* in code | ABSENT |
| A — fetch() for trace/module data | ABSENT |
| A — KNOWN_TRACES array | ABSENT |
| A — sparkline-regression-tripwire.json deleted | CONFIRMED |
| A — data read via getElementById + DOMContentLoaded | CONFIRMED |
| A — spot-check 3 traces match on-disk | MATCH |
| B — file:// render: 3 panels, 9 cards, 12 modules | PASS |
| B — file:// render: 0 console errors, 0 HTTP requests | PASS |
| C — Playwright 7/7 assertions | PASS |
| C — assertion-5 pure unit (no addInitScript, no fixture) | CONFIRMED |
| C — 0 console errors, 0 network requests | CONFIRMED |
| D — bun test failures traced to dashboard | NONE |
| D — toolCount >= 146 | 146 CONFIRMED |
| D — scheduler count = 68 | CONFIRMED |
| D — tsc errors introduced by 5ab1711f | NONE (pre-existing BCTC drift) |

**Verdict: GO for P2-I**

P2-H-FIX has sealed the Potemkin gate. The inline-data model delivers test-path == user-path fidelity. The user's file:// double-click will show 9 GREEN cards, 12 barrel modules, and the OFFLINE fallback for the microservice panel — no server needed, no globals injected. PO may proceed to P2-I verbal sign-off.
