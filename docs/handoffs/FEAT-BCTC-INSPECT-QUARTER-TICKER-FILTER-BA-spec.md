# BA Spec — FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER
**Task:** FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER
**Sprint:** SPRINT-S (row-level, no `.sprint_goal.entries[]` — PO deliberately did not append, cap already at 16/15)
**BA:** ba · 2026-08-23
**Status:** SPEC COMPLETE — ZERO PO BLOCKERS — HAND OFF TO ARCHITECT

---

## 1. Vision (po, user-request 2026-08-23)

`/dashboard/bctc-inspect` has one flat `<select id="doc-select">` (`apps/mcp-server/src/interface/bctc-inspector.html:871`) listing all 257 BCTC documents unfiltered. User wants two facet dropdowns — reporting quarter, stock ticker — to narrow which document is shown.

★ Stack correction (already verified by PO, BA re-confirms): `apps/frontend/app/routes/dashboard.bctc-inspect.tsx` is a resource route that only proxies `GET {MCP_SERVER_BASE_URL}/api/bctc-inspect` — it renders no JSX. The real UI is `apps/mcp-server/src/interface/bctc-inspector.html`, a 2692L self-contained vanilla-JS/CSS page (`const BASE=""`, plain `<script type="module">`, no bundler, no React/shadcn). Zone = `apps/mcp-server/`, developer = `dev-mcp-server`.

★ No backend work needed. `GET /api/bctc-inspect/docs` already returns `action_code`, `company_name`, `period_type`, `period_year`, `period_quarter` per item (`DocListItem`, `bctcInspectHandler.ts:141-165`) — BA-verified live. This is a pure client-side facet filter over `items[]` already fetched by `loadDocList()` (`bctc-inspector.html:1118-1143`).

---

## 2. Functional Requirements

### FR-1 — Two new facet `<select>` controls
**DDD layer: interface** (`apps/mcp-server/src/interface/bctc-inspector.html`)
Insert `#quarter-filter` (label "Quý") and `#ticker-filter` (label "Mã CK") into the existing `.controls` bar (`bctc-inspector.html:869-881`), positioned BEFORE `#doc-select`. Each carries a default "all" option showing the live total count.
VN-term check (BA-owned per capability charter): "Quý" = GLOSSARY_VI.md canonical translation for Quarter (row 14). "Mã CK" has no GLOSSARY_VI.md row but is the repo-wide convention for ticker/stock-code labels already used in `StockPerformanceTable.tsx:22`, `RecommendationsTable.tsx:17`, `dashboard.kinh-dich-signals.tsx:471` — PO's chosen labels are consistent with existing precedent, no translation blocker.
Verified: neither `#quarter-filter` nor `#ticker-filter` id currently exists in the file — no collision.

### FR-2 — Module-level `items` cache (new client-side state — does not exist today)
**DDD layer: interface**
`loadDocList()` currently keeps `items` as a FUNCTION-LOCAL `const` (line 1124) — nothing outside the function retains the full fetched list; each `<option>` only carries its own item as `opt.dataset.item` JSON (line 1135). AC2's "zero additional network calls" requires a durable reference to the FULL unfiltered set. Introduce a module-level `let allDocs = [];` populated once per `loadDocList()` call, and refactor the inline option-building loop (lines 1127-1137) into a separate `renderDocOptions(items)` function callable both at initial load and on every filter change.
Reading back `select.options[].dataset.item` is NOT sufficient as the working-set source once a prior filter pass has already removed options from the DOM — excluded items become unrecoverable that way. `allDocs` must be the single source of truth.

### FR-3 — Quarter-value normalizer (closes AC9 landmine, TWO independent sites)
**DDD layer: interface**, two files, same ~3-line coercion duplicated (see NFR-4):
- (a) client-side, `bctc-inspector.html` — builds the 11 (not 13) quarter-filter options and the filtered doc-select subset.
- (b) server-side, `buildLabel()` in `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts:167-171` — fixes the mislabeled options at the source (AC9): `Q${row.period_quarter}` on a STRING `"Q1"` produces literal `"HUT Q1 QQ1 2024"` / `"HUT Q1 QQ1 2026"` today.
- BA-verified live: `DocListItem.period_quarter` is typed `number | null` (`bctcInspectHandler.ts:148`) but is the STRING `"Q1"` on 2 of 257 live rows (both ticker HUT) — the type annotation does not match the runtime shape for those 2 rows. Both sites must coerce to an integer 1-4 (e.g. `Number.parseInt(String(row.period_quarter), 10)` or a `Q`-prefix strip) before use — verify the exact string form against the live 2 HUT rows before coding, do not assume every future string write is `"Qn"`-shaped.
- `period_quarter === null` (0 rows today, but type-permitted — e.g. a future ANNUAL row) must be excluded from quarter-facet derivation, not rendered as "Qnull YYYY" — matches `buildLabel()`'s existing null-safe branch (line 169).

### FR-4 — Quarter facet derivation source
**DDD layer: interface**
Derive quarter options ONLY from `period_year` + normalized `period_quarter` (FR-3). Do NOT use `period_type` as the derivation source — BA-verified live: `period_type` holds `'Q1'..'Q4'` per-row (81/65/33/78 counts), never the literal `QUARTERLY`/`ANNUAL`, and zero annual rows exist today. Distinct `Qn YYYY` values, sorted year DESC then quarter DESC (AC3) → 11 options for today's data.

### FR-5 — Ticker facet derivation
**DDD layer: interface**
Distinct `action_code` values from `allDocs`, sorted A→Z (AC4) → 50 options for today's data.

### FR-6 — AND-composition filter + doc-select re-render
**DDD layer: interface**
On change of EITHER `#quarter-filter` or `#ticker-filter`: recompute `allDocs.filter(quarterMatches && tickerMatches)`, call `renderDocOptions(filtered)` (FR-2), update the placeholder text to `— select a document (N) —` with N = filtered count (AC5).

### FR-7 — Selection-preservation guard (AC6) — highest implementation risk in this spec
**DDD layer: interface**
Capture `currentDocId` (already a tracked module-level variable, line 1050) before re-rendering `#doc-select`. After `renderDocOptions(filtered)`:
- If `currentDocId` is present in the filtered subset → re-select it (`select.value = currentDocId`) and STOP — no call into `renderPdf`/`navigateToPage`/`renderTable`/`renderMdTables`, no pane flicker. Implementation risk: the filter-triggered rebuild of `#doc-select` must NOT be implemented by re-triggering the existing `select.addEventListener("change", …)` handler (line 1146) — that handler unconditionally re-fetches PDF/OCR/table/MD (lines 1162-1169) on every fire, which would violate "no refetch, no flicker" even when the resolved doc is unchanged. The two triggers (user manually picks a new doc vs. filter-triggered rebuild that happens to preserve the same doc) must not be conflated — e.g. by not dispatching a synthetic `change` event after `select.value = currentDocId`.
- If `currentDocId` is NOT present in the filtered subset (or is unset) → reset `#doc-select` to the placeholder AND call `resetPanes()` (`bctc-inspector.html:2120-2153`) — matches the existing "no doc selected" contract already used at lines 1148-1151.

### FR-8 — Zero-match state (AC7)
**DDD layer: interface**
When the AND-composed filter yields an empty subset: render a single `<option disabled>— no document matches —</option>` (no crash on empty-array `.map`/`.reduce`), and update `#status-bar` text to name the active filters (e.g. "Quý Q1 2026 × VCB: không có tài liệu khớp"). No `console.error`.

---

## 3. Non-Functional Requirements

### NFR-1 — Perf (AC2)
Filter recompute is a pure in-memory `Array.filter` over `allDocs` (≤257 items today) — zero additional `fetch()` calls, zero new endpoints, zero SQL changes.

### NFR-2 — Regression safety + testability convention (AC8)
All 5 named test files must stay green: `1976-bctc-inspector-page-nav.test.ts`, `1273-bctc-inspect-overlay.test.ts`, `PI3-bctc-inspect.test.ts`, `PI3-bctc-inspect-reopen2.test.ts`, `1271-bctc-inspect-md.test.ts` — BA-confirmed all 5 exist. BA-verified these tests exercise PURE FUNCTIONS MIRRORED from `bctc-inspector.html` logic (`clampPage`, `navLabel`, `shouldSkipKeyboard`), NOT a jsdom-rendered page — `1976-bctc-inspector-page-nav.test.ts:4-10` docstring states DOM-level wiring "is NOT unit-testable in bun (no jsdom) — verified live by QA." New pure logic this feature introduces (quarter normalizer, AND-filter predicate, selection-preservation resolver) SHOULD follow the same convention — small named functions inside the `<script>` block, mirrored into a new or existing test file as pure-function unit tests. Recommendation, not a hard AC; architect to pick target test file (new vs. extend one of the 5).

### NFR-3 — Dual-origin verification (AC10)
Must be manually verified through BOTH `http://localhost:3000/...` (direct mcp-server serving path) AND `http://localhost:3001/dashboard/bctc-inspect` (Remix resource-route proxy — the user's actual entry point per PO's stack-correction note).

### NFR-4 — Duplication risk, flag only, non-blocking
FR-3's quarter-normalizer logic necessarily exists in TWO places (bctc-inspector.html client-side + bctcInspectHandler.ts server-side `buildLabel()`) because the HTML page has no build step / no shared-module import mechanism with the TS backend (plain `<script type="module">`, no bundler — confirmed). Accepted, unavoidable duplication given this page's existing zero-build-step architecture — not a defect to fix in this S-size ticket, and there is no shared-import mechanism to fix it with. Flag to architect only so the two ~3-line coercions don't drift apart in review; do not invent a shared module for this task.

---

## 4. Edge Cases

| Case | Handling |
|---|---|
| `period_quarter` type landmine (2/257 rows, ticker HUT, string `"Q1"` vs number) | FR-3 normalizer, both surfaces (client facet + server `buildLabel()`) |
| `period_quarter === null` (0 rows today, type-permitted, e.g. future ANNUAL row) | Excluded from quarter facet, never rendered as "Qnull YYYY" — matches `buildLabel()`'s existing null-safe branch |
| Zero-match AND-combination (any quarter × ticker pair with 0 docs) | FR-8 — disabled placeholder option + status-bar message naming active filters, no console error |
| Selection survives filter change (happy path) | FR-7 — no refetch, no pane flicker, stay selected |
| Selection does NOT survive filter change | FR-7 — placeholder reset + `resetPanes()`, no stale PDF/OCR/table left on screen |
| `allDocs` module-level state does not exist today | FR-2 — must be introduced; build-time/implementation risk, not a data edge case |
| Id collision on `#quarter-filter`/`#ticker-filter` | Verified none exists in the file today — no collision |
| `dataset.item` payload drift between filtered vs. unfiltered render paths | Avoided by FR-2 routing BOTH paths through the same `renderDocOptions()` function |

---

## 5. DDD Layer Map

| Requirement | DDD Layer | Zone |
|---|---|---|
| FR-1 Two new `<select>` controls | Interface | `apps/mcp-server/src/interface/bctc-inspector.html` |
| FR-2 `allDocs` cache + `renderDocOptions()` refactor | Interface | same file |
| FR-3a Client-side quarter normalizer | Interface | same file |
| FR-3b Server-side `buildLabel()` coercion (AC9) | Interface | `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts:167-171` |
| FR-4 Quarter facet derivation source | Interface | `bctc-inspector.html` |
| FR-5 Ticker facet derivation | Interface | `bctc-inspector.html` |
| FR-6 AND-composition filter engine | Interface | `bctc-inspector.html` |
| FR-7 Selection-preservation guard | Interface | `bctc-inspector.html` |
| FR-8 Zero-match state | Interface | `bctc-inspector.html` |
| NFR-2 Regression tests | Interface (test) | `apps/mcp-server/src/__tests__/` (new or extended, architect to decide) |

Zero domain layer touch — `financial_reports` table / `DocListItem` type are read-only inputs. Zero application layer touch — no new use case, no query object. Zero infrastructure layer touch — `LIST_SQL` unchanged, no new indices, no new endpoints. This entire feature collapses into the interface layer by construction (client-side facet filter + one cosmetic label fix at the HTTP boundary) — flagging explicitly since BA's charter maps across 4 layers by default and 3 of 4 are N/A here.

---

## 6. Scope Out (per PO's note — confirmed sound, do not widen)

- New or changed API endpoints; server-side filtering/pagination.
- URL query-param deep-linking (deferred — record as follow-up candidate).
- Porting this page to Remix/shadcn.
- Fixing the WRITE path that stores a string into `financial_reports.period_quarter` — AC9 is display-side only; separate follow-up candidate, do not absorb.
- Building a shared client/server module to de-duplicate FR-3's coercion logic (NFR-4) — accepted duplication, not in scope.

---

## 7. Files to Change (developer/architect checklist)

| File | Change |
|---|---|
| `apps/mcp-server/src/interface/bctc-inspector.html` | FR-1 (2 new `<select>` in `.controls`), FR-2 (`allDocs` cache + `renderDocOptions()` refactor), FR-3a (quarter normalizer), FR-4/FR-5 (facet derivation), FR-6 (AND-filter engine), FR-7 (selection-preservation guard), FR-8 (zero-match state) |
| `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` | FR-3b — `buildLabel()` quarter coercion fix (AC9), ~3 lines, lines 167-171 |
| `apps/mcp-server/src/__tests__/` (new or extended file, architect to decide) | NFR-2 — pure-function unit tests for quarter normalizer + AND-filter predicate + selection-preservation resolver |

---

## 8. Acceptance Criteria (QA gate — restates PO's AC1-AC10 verbatim, already precise)

1. AC1 — Two `<select>` in `.controls`, before `#doc-select`: `#quarter-filter` ("Quý"), `#ticker-filter` ("Mã CK"), each with a default all-option carrying the live count.
2. AC2 — Options derived from already-fetched `items[]` — zero additional network calls.
3. AC3 — Quarter options = distinct `Qn YYYY`, sorted year desc then quarter desc; normalizer yields exactly 11 options (not 13) on today's data.
4. AC4 — Ticker options = distinct `action_code` sorted A-Z; 50 for today's data.
5. AC5 — Filters AND-compose; either change re-renders `#doc-select` from the filtered subset and updates the placeholder count.
6. AC6 — Selection preservation: survives-filter → keep selected, no refetch/flicker; does-not-survive → placeholder reset + `resetPanes()`.
7. AC7 — Zero-match: single disabled "— no document matches —" option + status-bar text naming active filters, no console error.
8. AC8 — No regression: doc-select change handler, header page-nav, zone-overlay toggle, all 6 right-pane tabs unchanged; all 5 named tests stay green.
9. AC9 — `buildLabel()` (`bctcInspectHandler.ts:167-171`) applies the same coercion so the option label reads "HUT Q1 2024" (not "HUT Q1 QQ1 2024").
10. AC10 — Verified through `http://localhost:3001/dashboard/bctc-inspect` (frontend proxy, the user's actual entry point), not `:3000` only.

---

## 9. Blockers

NONE. PO's row note already resolves feature priority (P1), VN labels ("Quý"/"Mã CK", BA-confirmed consistent with existing repo convention), data-source availability (zero backend work, endpoint already serves the needed fields), and explicitly descopes the two candidate follow-ups (deep-linking, WRITE-path fix) rather than leaving them open. No question in this spec requires a business call — NFR-4 (duplication) and the selection-preservation implementation risk (FR-7) are engineering/design notes for architect, not blockers.

**Recommended chain (per PO's own note):** ba → architect → pm → dev-mcp-server → qa.

---

## 10. Decision Journal

**task_id:** FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER
- what-considered: "only path: pure client-side facet filter over already-fetched items[], no new endpoint — PO's note already forecloses server-side filtering/pagination as out of scope, and BA's own live verification (LIST_SQL, DocListItem, buildLabel()) confirms all needed fields are already served"
- why-decision: "FR-7 selection-preservation is the one nontrivial design risk — flagged explicitly (do not conflate filter-triggered doc-select rebuild with the user-driven change-handler that unconditionally refetches PDF/OCR/table/MD) so architect/developer do not ship a naive re-render that flickers or double-fetches on every filter change"
- why-change: "no change from PO's ticket direction; this spec adds FR-2 (module-level allDocs cache, does not exist today — required to satisfy AC2's zero-network-call constraint) and FR-7's implementation-risk detail, which PO's note did not fully specify at the code level"

---

## [Architect] Brownfield Findings

**Scope correction (found this cycle, widens AC9's fix surface — same 2 files, no new files):** BA's FR-3/AC9 framing ("2/257 rows, HUT, type coercion") understates the bug. `buildLabel()` was executed live (`node -e`) before designing, not just read:
```
buildLabel({action_code:"VCB", period_type:"Q1", period_quarter:1, period_year:2025})  →  "VCB Q1 Q1 2025"   (duplicate — ALL 255 normal rows, today)
buildLabel({action_code:"HUT", period_type:"Q1", period_quarter:"Q1", period_year:2024}) →  "HUT Q1 QQ1 2024"  (the 2 rows BA flagged)
```
Root cause: `period_type` already holds `'Q1'..'Q4'` on every live row (BA's own FR-4 finding), but `buildLabel()`'s comment (`// e.g. "VCB Q1 2025"`) assumes `period_type` would be a `QUARTERLY`/`ANNUAL` literal and unconditionally appends a 2nd `` ` Q${period_quarter}` `` token. BA's literal FR-3b prescription (parseInt-coerce `period_quarter` only) does NOT reach AC9's own stated target — it only turns `"QQ1"` into a 2nd `"Q1"`, still `"HUT Q1 Q1 2024"`, not `"HUT Q1 2024"`. Fix scope stays inside `buildLabel()` (`bctcInspectHandler.ts:167-171`) — no new file, no wider blast radius, ~8 net lines.

- **Zone:** `apps/mcp-server/`

- **Verified paths (read this cycle):**
  - `apps/mcp-server/src/interface/bctc-inspector.html:869-881` — `.controls` bar; flat `select { min-width: 320px; }` CSS rule (line 81-90) applies to ALL selects incl. the 2 new ones.
  - `apps/mcp-server/src/interface/bctc-inspector.html:1050-1071` — module-level state block (`let currentDocId = null; ...`) — FR-2's `allDocs` and the 2 new DOM refs land here.
  - `apps/mcp-server/src/interface/bctc-inspector.html:1118-1143` — `loadDocList()`; option-building loop (1127-1137) is the exact body to extract into `renderDocOptions(items)`.
  - `apps/mcp-server/src/interface/bctc-inspector.html:1146-1170` — `select.addEventListener("change", …)` — unconditionally calls `renderPdf`/`navigateToPage`/`renderTable`/`renderMdTables` on every fire (lines 1163-1169). Confirmed: FR-7 MUST NOT route through this listener or dispatch a synthetic `change` event — mutate `select.value` directly.
  - `apps/mcp-server/src/interface/bctc-inspector.html:2120-2153` — `resetPanes()` — no `select` element touch inside it; safe to call unconditionally on the "did not survive" branch (idempotent even if nothing was selected).
  - `apps/mcp-server/src/interface/bctc-inspector.html:2689` — `await loadDocList();` sole init call, bottom of `<script type="module">` — confirms `resetPanes` (declared later, line 2120) is safely callable earlier via function-hoisting (module-scope `function` statements).
  - `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts:83-102` (`FinancialReportRow`), `:125-139` (`LIST_SQL`, unchanged), `:141-165` (`DocListItem`), `:167-171` (`buildLabel()`) — confirmed zero SQL/type-shape change needed; `period_quarter` stays `number | null` in the type (the 2/257 string-runtime rows are a pre-existing, BA-declared-out-of-scope type/runtime mismatch — `normalizeQuarter()` below is defensive regardless of the declared type).
  - `apps/mcp-server/src/__tests__/PI3-bctc-inspect.test.ts:19,223-256,348-362` — `isDecimalShiftAnomaly`/`isValidUuid` are real EXPORTED-function unit tests (not mirrored) — the precedent for testing `normalizeQuarter()` the same way. **Line 361 hardcodes `expect(body.items[0]!.label).toBe("VCB Q1 Q1 2025")` — the CURRENT BUGGY value.** This assertion MUST change to `"VCB Q1 2025"` in the same commit as the `buildLabel()` fix — an in-scope correction, not a regression to preserve (NFR-2's "stay green" reading only holds once this one line is updated to match AC9's own target).
  - `apps/mcp-server/src/__tests__/1976-bctc-inspector-page-nav.test.ts:1-42` — confirmed the "mirrored pure function, no jsdom" convention (docstring + `clampPage`/`navLabel`/`shouldSkipKeyboard`) for the client-side HTML logic this feature adds.
  - `apps/mcp-server/src/__tests__/1273-bctc-inspect-overlay.test.ts`, `PI3-bctc-inspect-reopen2.test.ts`, `1271-bctc-inspect-md.test.ts` — grepped for `label`/`period_quarter`/`period_type`: no other assertion on the label string; only `PI3-bctc-inspect.test.ts:361` needs the AC9-driven update.

- **Reuse patterns:**
  - `renderDocOptions(items)` — extract from `loadDocList()`'s existing loop, called from BOTH the initial full load and every filter re-render (closes BA's edge-case row "dataset.item payload drift between filtered vs. unfiltered render paths").
  - `normalizeQuarter()` — one new EXPORTED function in `bctcInspectHandler.ts` (same pattern as `isDecimalShiftAnomaly`/`isValidUuid`), reused by `buildLabel()`; a SEPARATE, mirrored (not imported — NFR-4, no build step) copy inside `bctc-inspector.html` for the client-side facet derivation. Accepted duplication per BA.
  - Placeholder-with-count pattern already live on `#doc-select` (`— select a document (N) —`) reused verbatim for `#quarter-filter`/`#ticker-filter` (AC1).

- **Design decisions:**
  - **D-1 (`buildLabel()` fix — corrects FR-3b's mechanism, not its file/line target):**
    ```ts
    export function normalizeQuarter(periodQuarter: number | string | null): number | null {
      if (periodQuarter === null || periodQuarter === undefined) return null;
      const n = typeof periodQuarter === "number"
        ? periodQuarter
        : Number.parseInt(String(periodQuarter).replace(/^Q/i, ""), 10);
      return Number.isFinite(n) ? n : null;
    }
    const QUARTERLY_PERIOD_TYPE_RE = /^Q[1-4]$/i;
    function buildLabel(row: FinancialReportRow): string {
      // period_type already holds 'Q1'..'Q4' for every live quarterly row (verified — never
      // the 'QUARTERLY'/'ANNUAL' literal this fn's original comment assumed). Only append a
      // quarter suffix when period_type does NOT already encode it (reserved for a future
      // ANNUAL row that also carries a period_quarter) — prevents the duplicate/garbled token.
      const q = QUARTERLY_PERIOD_TYPE_RE.test(row.period_type) ? null : normalizeQuarter(row.period_quarter);
      const quarter = q !== null ? ` Q${q}` : "";
      return `${row.action_code} ${row.period_type}${quarter} ${row.period_year}`;
    }
    ```
    Verified output: normal row → `"VCB Q1 2025"`; the 2 HUT string rows → `"HUT Q1 2024"` (AC9's exact literal target); a hypothetical future `ANNUAL`+quarter row → unchanged null-safe branch preserved.
  - **D-2 (FR-2 cache placement):** `let allDocs = [];` declared in the existing state block (`:1050-1071`), NOT inside `loadDocList()` — must survive across calls per FR-2/AC2.
  - **D-3 (FR-6/FR-7 merge — one `applyFilters()` function, no synthetic event):**
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
      renderDocOptions(filtered);  // rebuilds <select>; browser defaults selectedIndex to the new option 0 (placeholder) — this IS the "reset to placeholder" FR-7 wants, for free
      if (currentDocId && filtered.some((i) => i.doc_id === currentDocId)) {
        select.value = currentDocId;   // re-select WITHOUT dispatching "change" — no refetch, no flicker (FR-7)
      } else if (currentDocId) {
        resetPanes();                  // does not touch `select` itself — safe alongside the fresh placeholder render
      }
      statusBar.textContent = filtered.length === 0
        ? `${[qVal && `Quý ${qVal.split("-")[1]} ${qVal.split("-")[0]}`, tVal].filter(Boolean).join(" × ")}: không có tài liệu khớp`
        : `${filtered.length} document(s) loaded.`;
    }
    quarterFilter.addEventListener("change", applyFilters);
    tickerFilter.addEventListener("change", applyFilters);
    ```
    Never calls `select.dispatchEvent(...)` — the existing `select.addEventListener("change", …)` handler (`:1146-1170`) is untouched, closing AC8/AC6's highest-risk item exactly as BA flagged it.
  - **D-4 (FR-8 zero-match option MUST carry `selected`, not just `disabled`):** `<option value="" disabled>` alone risks the closed `<select>` rendering BLANK — HTML's default-selection algorithm skips disabled options when picking the initially-selected one, and with only one (disabled) option present, no option becomes selected (`selectedIndex=-1`). Use `<option value="" disabled selected>— no document matches —</option>` — the explicit `selected` attribute is honored at parse/innerHTML-assignment time regardless of `disabled`. Flag for QA visual verification (AC7/AC10) either way.
  - **D-5 (cosmetic, non-blocking):** the generic `select { min-width: 320px; }` rule will make the 2 new small filters unnecessarily wide. Suggest `.filter-select { min-width: 140px; }` on `#quarter-filter`/`#ticker-filter`. Developer discretion — not an AC.

- **Files to create/modify:**
  | # | File | Layer | Change |
  |---|------|-------|--------|
  | 1 | `apps/mcp-server/src/interface/bctc-inspector.html` (EDIT) | interface | FR-1 (`.controls` 2 new `<select>` before `#doc-select`, `.filter-select` CSS per D-5), FR-2 (`allDocs` state + DOM refs), FR-2/refactor (`renderDocOptions()` extracted from `loadDocList()`), FR-3a/FR-4/FR-5 (mirrored `normalizeQuarter()` + `populateFilterOptions()`), FR-6/FR-7 (`applyFilters()` per D-3), FR-8 (zero-match branch in `renderDocOptions()` per D-4) |
  | 2 | `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` (EDIT) | interface | FR-3b/AC9 — new exported `normalizeQuarter()` + corrected `buildLabel()` per D-1, `:167-171` |
  | 3 | `apps/mcp-server/src/__tests__/PI3-bctc-inspect.test.ts` (EDIT) | test | Update AC-14 (`:361`) `"VCB Q1 Q1 2025"` → `"VCB Q1 2025"`; add a new `normalizeQuarter()` unit-test block next to the existing `isDecimalShiftAnomaly`/`isValidUuid` blocks (real import, not mirrored) |
  | 4 | `apps/mcp-server/src/__tests__/FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER.test.ts` (NEW) | test | NFR-2 — mirrored pure-function tests for the client-side `normalizeQuarter()`, the AND-filter predicate, and the selection-preservation resolver, same convention as `1976-bctc-inspector-page-nav.test.ts` |

- **DDD layer assignment:** 100% interface layer, matches BA's own map exactly — confirmed independently this cycle (LIST_SQL untouched, `DocListItem`/`FinancialReportRow` shapes untouched, no new SQL, no new endpoint, no new usecase). Zero domain/application/infrastructure files touched.

- **Test strategy:**
  - `PI3-bctc-inspect.test.ts` — extend (server-side, real imports): fix AC-14's frozen value, add `describe("normalizeQuarter()")` covering `number` passthrough, `"Q1"`-shaped string coercion, `null`, and a malformed-string defensive case (e.g. `"ABC"` → `null`, never `NaN` leaking into a label).
  - `FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER.test.ts` — new (client-side, mirrored per NFR-2/1976's convention): `normalizeQuarter()` (mirror of the same cases), the AND-filter predicate (quarter-only / ticker-only / both / neither match), and a `resolveSelectionAfterFilter(currentDocId, filteredIds)` pure resolver mirroring D-3's branch (returns `{action:"keep"}` vs `{action:"reset"}` — extract this decision as its own named pure function so it's independently testable without DOM).
  - AC8 regression: existing 5 named test files require no code change (confirmed — `select.addEventListener("change", …)` untouched); AC10 dual-origin (`:3000` direct + `:3001` proxy) stays a manual QA verification step, not unit-testable.

- **Standard Detection:** `BUILD-STANDARD: lean` (`apps/mcp-server/` already exists; this is a NEW FEATURE — 2 facet filters — within an existing service, not a new service). Ref: `docs/standards/microservice-build-standard.md`.

- **Risk flags:**
  1. **AC9 fix-surface correction (D-1, above)** — the single highest-value finding: implementing BA's FR-3b literally (type coercion only) would ship code that still fails AC9's own stated acceptance value for every non-HUT row. Any implementer working from the BA spec section alone (without this Architect section) would under-scope the fix.
  2. **PI3-bctc-inspect.test.ts:361 must be edited, not merely "kept green"** — flagged so the developer doesn't (a) skip the `buildLabel()` fix to avoid touching a "must stay green" test, or (b) get a red suite and assume a regression.
  3. **FR-8's `disabled`-without-`selected` footgun (D-4)** — a plausible naive implementation of BA's literal FR-8 text renders a blank closed `<select>` instead of the intended message; verify visually.
  4. **No security/DDD violations found** — pure client-side filter over already-served data + one cosmetic server-side label fix; no new SQL, no new auth surface, no new writer.
  5. **`DocListItem.period_quarter: number | null` still does not match the 2/257 live string-runtime rows** — pre-existing, BA-declared out of scope (write-path fix is a separate follow-up); `normalizeQuarter()` is defensive regardless, so this is safe to leave as-is. Not re-flagging as new scope.
- **Scan clean:** true ✓

## RETURN (architect)
DONE: Technical design complete — FR-1..FR-8/NFR-1..NFR-4 fully designed against live-read code (2 files: `bctc-inspector.html`, `bctcInspectHandler.ts`) + 1 existing test file's frozen assertion identified as needing an in-scope update + 1 new test file. Corrected AC9's fix mechanism (D-1: BA's literal type-coercion prescription does not reach AC9's own target; root cause is `buildLabel()` unconditionally double-appending a quarter token onto a `period_type` that already encodes it, affecting all 255 normal rows, not just the 2 HUT rows) — same 2 files, no scope/file-count change. FR-7 selection-preservation designed with zero synthetic-event risk (D-3). FR-8 zero-match option needs `selected` alongside `disabled` (D-4) — flagged for developer + QA.
ZONE: apps/mcp-server/
NEXT: pm — break FR-1..FR-8 into dev-mcp-server task(s) per the file table above; BA's own SPRINT-S sizing (~80-100 net lines, 1 domain, no domain-boundary crossing) still holds despite the widened AC9 root-cause fix (same file/line target, not a bigger diff) — PM's call on 1 vs 2 atomic tasks (html file vs handler+tests).
HANDOFF: docs/handoffs/FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER-BA-spec.md
PIPELINE: continue
