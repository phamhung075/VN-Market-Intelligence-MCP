---
sprint: SPRINT-S
branch: none
size: M
zone: apps/mcp-server/
depends_on: []
blocks: []
---

## TLDR

Implement 2 client-side facet filters (quarter + ticker) on the BCTC inspector page's doc dropdown. Feature is 100% in `bctc-inspector.html`: extract the existing doc-render loop into a reusable `renderDocOptions()` function, add quarter/ticker normalizer + filter state, and wire both filter dropdowns to call `applyFilters()` to rebuild the doc list in-memory without network calls or page refetch.

## [PM] Planning Context

- **Zone:** `apps/mcp-server/src/interface/`
- **Acceptance Criteria:**
  - [ ] AC1: Two `<select>` in `.controls` before `#doc-select` — `#quarter-filter` (label "Quý") + `#ticker-filter` (label "Mã CK"), each with default all-option carrying live count
  - [ ] AC2: All options derived from already-fetched `items[]` — zero additional network calls
  - [ ] AC3: Quarter options = distinct "Qn YYYY", year DESC then quarter DESC; normalizer yields exactly 11 options (not 13) on today's data
  - [ ] AC4: Ticker options = distinct `action_code` sorted A-Z; 50 for today's data
  - [ ] AC5: AND-composed filters; either filter change re-renders `#doc-select` + updates placeholder count
  - [ ] AC6: Selection preservation — survives filter → stay selected, no refetch/flicker; does not survive → placeholder reset + `resetPanes()`
  - [ ] AC7: Zero-match state — single disabled "— no document matches —" option (MUST carry both `disabled` AND `selected` attrs), status-bar text naming active filters, no console error
  - [ ] AC8: No regression — `select.addEventListener("change", …)` handler, header page-nav, overlay toggle, all 6 right-pane tabs unchanged; 5 named test files stay green

- **Files to read first:**
  - `apps/mcp-server/src/interface/bctc-inspector.html:869-881` (`.controls` bar — placeholder selection)
  - `apps/mcp-server/src/interface/bctc-inspector.html:1050-1071` (module-level state block — add `allDocs`, `quarterFilter`, `tickerFilter` refs here)
  - `apps/mcp-server/src/interface/bctc-inspector.html:1118-1143` (`loadDocList()` — extract option-loop into `renderDocOptions(items)`)
  - `apps/mcp-server/src/interface/bctc-inspector.html:1146-1170` (`select.addEventListener("change", …)` — DO NOT route filter changes through this handler; mutate `select.value` directly to avoid refetch)
  - `apps/mcp-server/src/interface/bctc-inspector.html:2120-2153` (`resetPanes()` — idempotent, safe to call unconditionally on "did not survive" branch)
  - `apps/mcp-server/src/__tests__/1976-bctc-inspector-page-nav.test.ts:1-42` (mirrored pure-function test convention — model for new test file)

- **Files to create:**
  - `apps/mcp-server/src/__tests__/FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER.test.ts` — new pure-function unit tests (mirrored convention, not DOM-rendered):
    - `normalizeQuarter()` covering: number passthrough, `"Q1"`-shaped string coercion, `null`, malformed string → `null`
    - AND-filter predicate: quarter-only match / ticker-only match / both match / neither match
    - `resolveSelectionAfterFilter(currentDocId, filteredIds)` resolver returning `{action:"keep"}` or `{action:"reset"}`

- **Files to modify:**
  - `apps/mcp-server/src/interface/bctc-inspector.html` — primary scope:
    - FR-1: Add 2 new `<select id="quarter-filter">` + `<select id="ticker-filter">` to `.controls` bar before `#doc-select` (lines 869-881)
    - FR-2: Declare module-level `let allDocs = [];` in state block (lines 1050-1071); declare refs `let quarterFilter, tickerFilter` (also here)
    - FR-2/refactor: Extract `loadDocList()`'s option-loop (lines 1127-1137) into standalone `renderDocOptions(items)` function; call it at load time and from `applyFilters()`
    - FR-3a: Implement `normalizeQuarter(val)` — coerce string `"Q1"` → number `1`, null → null, malformed → null (reused by both facet derivation + FR-7 selection resolver)
    - FR-4/FR-5: Implement `populateFilterOptions()` or similar — derive 11 distinct quarter + 50 ticker options from `allDocs`, render into the filter dropdowns
    - FR-6/FR-7: Implement `applyFilters()` function (per architect's D-3 pseudo-code in spec):
      - Read `#quarter-filter.value` + `#ticker-filter.value`
      - Filter `allDocs` using AND predicate
      - Call `renderDocOptions(filtered)`
      - If `currentDocId` in filtered → `select.value = currentDocId` (NO synthetic `change` event — must not refetch)
      - Else → call `resetPanes()` to clear stale panes
    - FR-8: Inside `renderDocOptions()` — when filtered array is empty, render single `<option value="" disabled selected>— no document matches —</option>` (explicit `selected` is load-bearing per architect D-4)
    - Wire both filter dropdowns to call `applyFilters` on change
    - Cosmetic (non-blocking per architect D-5): style `.filter-select { min-width: 140px; }` on `#quarter-filter` + `#ticker-filter` to avoid the generic `select { min-width: 320px; }` stretching them unnecessarily

- **Dependencies:** none

- **Knowledge needed:**
  - `docs/policies/dev-standards.md` (commit convention)
  - Architect spec [Architect] Brownfield Findings § D-2 (cache placement), D-3 (applyFilters pseudo-code), D-4 (zero-match option attrs)
  - BA spec FR-1..FR-8, NFR-2 (test strategy)
  - Live verify via both `http://localhost:3000/api/bctc-inspect` (direct mcp-server) AND `http://localhost:3001/dashboard/bctc-inspect` (frontend proxy — user's actual entry point per AC10)

## Implementation Notes (from architect design)

**D-2 — allDocs cache placement:** Must live at module scope (outside `loadDocList()`), not inside the function, to survive across calls per AC2.

**D-3 — applyFilters() design (pseudocode from spec):**
```js
function applyFilters() {
  const qVal = quarterFilter.value;  // "" | "YYYY-Q"
  const tVal = tickerFilter.value;   // "" | action_code
  const filtered = allDocs.filter((item) => {
    if (qVal) {
      const q = normalizeQuarter(item.period_quarter);
      if (q === null || `${item.period_year}-${q}` !== qVal) return false;
    }
    return !tVal || item.action_code === tVal;
  });
  renderDocOptions(filtered);  // browser defaults selectedIndex to option 0 (placeholder) — "reset" for free
  if (currentDocId && filtered.some((i) => i.doc_id === currentDocId)) {
    select.value = currentDocId;   // re-select WITHOUT "change" event dispatch — no refetch (FR-7)
  } else if (currentDocId) {
    resetPanes();                  // idempotent with placeholder render
  }
  statusBar.textContent = filtered.length === 0
    ? `${[qVal && `Quý ${qVal.split("-")[1]} ${qVal.split("-")[0]}`, tVal].filter(Boolean).join(" × ")}: không có tài liệu khớp`
    : `${filtered.length} document(s) loaded.`;
}
quarterFilter.addEventListener("change", applyFilters);
tickerFilter.addEventListener("change", applyFilters);
```
Never dispatch a synthetic `change` event — the existing handler (line 1146) unconditionally refetches, violating AC6/AC8.

**D-4 — Zero-match option:** MUST carry BOTH `disabled` and `selected` attributes or the closed `<select>` renders BLANK. Explicit `selected` is honored at parse time regardless of `disabled` status.

---

## Regression Test Coverage

All 5 named test files must stay green (confirmed by architect — BA verified they exist):
- `apps/mcp-server/src/__tests__/1976-bctc-inspector-page-nav.test.ts` — page nav functions
- `1273-bctc-inspect-overlay.test.ts` — zone overlay toggle
- `PI3-bctc-inspect.test.ts` — server response shape (do not touch AC-14 line 361 here — that is TASK-BCTC-INSPECT-LABEL-FIX's job)
- `PI3-bctc-inspect-reopen2.test.ts` — document reopen behavior
- `1271-bctc-inspect-md.test.ts` — markdown pane rendering

AC8 states: doc-select change handler, header page-nav, overlay toggle, all 6 right-pane tabs unchanged → all 5 tests must stay green without modification **in this task**.

---

## Task: Verify Manual

After landing, verify through BOTH origins per AC10:
1. `http://localhost:3000/api/bctc-inspect` — direct mcp-server serving
2. `http://localhost:3001/dashboard/bctc-inspect` — frontend proxy (user's actual entry point)

Spot-check: quarter filter shows 11 options, ticker shows 50, AND logic works (pick Q1 2025 + VCB → only docs matching both), zero-match shows the disabled placeholder + status message.

---

## Related

- **Paired task:** TASK-BCTC-INSPECT-LABEL-FIX (server-side AC9 label fix + PI3 test assertion update)
- **Parent:** FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER (decomposed from this parent, sibling of TASK-BCTC-INSPECT-LABEL-FIX)

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/interface/bctc-inspector.html` — `.controls` bar (FR-1: `#quarter-filter`/`#ticker-filter` selects before `#doc-select`), `.filter-select` CSS (D-5), module-scope `allDocs` cache (D-2), `normalizeQuarter()`/`renderDocOptions()`/`populateFilterOptions()`/`applyFilters()` (FR-3a/FR-4/FR-5/FR-6/FR-7/FR-8), 2 new `change` listeners. `loadDocList()` refactored to populate `allDocs` + call the two new render functions (option-loop extracted, zero behavior change on first load). `select.addEventListener("change", …)` handler and `resetPanes()` untouched.
- **Files created:**
  - `apps/mcp-server/src/__tests__/FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER.test.ts` — 18 pure-function assertions (normalizeQuarter, AND-filter predicate incl. live HUT string-quarter quirk, resolveSelectionAfterFilter keep/reset), mirrors `1976-bctc-inspector-page-nav.test.ts` convention (no jsdom).
- **Docs updated:** `docs/architecture/microservice/mcp-server/financial-reports.md` — new `## FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER` section (state/functions/tests), matching the file's existing per-feature subsection style.
- **Tests written:** FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER.test.ts — 18 assertions, GREEN.
- **Git commits:** `2e66153fd` feat(mcp-server): BCTC inspector quarter + ticker facet filters
- **Type check:** clean (`bun tsc --noEmit`, 0 errors)
- **bun test — target scope:** 5 named regression files + new test file = 145 pass / 0 fail (`1976-bctc-inspector-page-nav`, `1273-bctc-inspect-overlay`, `PI3-bctc-inspect`, `PI3-bctc-inspect-reopen2`, `1271-bctc-inspect-md`, `FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER`). Also spot-verified `AIT-DEV-1`/`HC-DEV-7-layout`/`HC-DEV-6-inspector-panel` (structural `doc-select` assertions) — 170 pass / 0 fail.
- **bun test — full suite:** 15359 pass / 40 skip / 50 fail / 48482 expect() calls across 1278 files. **All 50 failing tests confirmed pre-existing and unrelated** — grepped by name: `1844a get_backtest_runs`, `FIX 2/1858c logVpsPush`, `Task 1146 get_insider_transactions`, `TSU-DEV-U5 get_company_profile`, `1875c record_signal_outcome`, `1892a handlePushNews`, `FIX-B-2 get_market_cap`, `Task 251 MCP Tool Registration /sse`, `task_heartbeat/task_release Zod schema`, `Task 1193 push-prices`, `VPS Proxy Health` (×6), `Task 1518 get_foreign_flow`, `VPT-1 handleVpsProxyHealth` — zero touch bctc-inspector/filter/quarter/ticker code. Many carry 5000ms timeouts (network/DB-contention signature from concurrent live agents in this shared dev host), structurally decoupled from this task's additive-only static-HTML + new-test-file changeset.
- **Server startup (Gate 2b):** `PORT=3099 bun run src/index.ts` → `/health` 200 `{"status":"ok","toolCount":183}`; live-fetched `/api/bctc-inspect` confirms `id="quarter-filter"`/`id="ticker-filter"` present in served HTML; `/api/bctc-inspect/docs` returned 268 live rows (11 distinct quarters, 50 distinct tickers — matches AC3/AC4 exactly).
- **Tool count:** 183 (unaffected — no tool registration touched).
- **Scheduler count:** 88 (unaffected — no scheduler code touched).
- **Dashboard circular-dep check:** `/api/bctc-inspect` 200, `/dashboards/news-fetch/` 200 (against local :3099 build).
- **Simplicity gate:** PASS — Q1 scope clean (every function maps 1:1 to an FR/D pointer), Q2 no single-use abstractions beyond what the spec explicitly requested (D-2/D-3 extraction), Q3 senior-test clean (no Manager/Handler wrappers), Q4 ratio <50% overhead (entire diff is AC-driven).
- **REBUILD_REQUIRED:** true — `apps/mcp-server/src/` is baked into the Docker image at build time (not live-synced). The live container on :3000/:3001 still serves the pre-change HTML (verified: `id="quarter-filter"` absent from the live-container response, present in the local :3099 build). PO/ops must rebuild+restart `mcp-server` before the AC10 dual-origin manual verify (localhost:3000 direct + localhost:3001 frontend proxy) can show real results.
- **Graphify:** skipped — single-file per-feature subsection addition to an existing doc, not a new doc/structural change.
