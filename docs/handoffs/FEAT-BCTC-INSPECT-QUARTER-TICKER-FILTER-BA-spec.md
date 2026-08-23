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
