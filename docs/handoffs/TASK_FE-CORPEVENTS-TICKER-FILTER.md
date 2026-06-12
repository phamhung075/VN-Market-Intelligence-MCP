---
sprint: FE-CORPEVENTS-TICKER-FILTER
branch: task/fe-corpevents-ticker-filter
size: S
zone: apps/frontend/
depends_on: []
blocks: []
---

## TLDR

Add a client-side ticker (stock code) selector to the /dashboard/corporate-events page, populated dynamically from the event payload. The selector should integrate seamlessly with the existing category tabs and days lookback selector; default to "Tất cả" (all). No server-side changes, no hardcoded tickers, no watchlist dependency.

## [PM] Planning Context

**Zone:** apps/frontend/app/routes/dashboard.corporate-events.tsx + test

**PO Ruling (binding):**
- Client-side filter only — payload already has events[].code
- Selector options sourced via `[...new Set(events.map(e=>e.code))].sort()`
- Default: 'Tất cả' (show all tickers)
- NO hardcoded ticker lists, NO watchlist read, NO api parameter change
- Must COMPOSE with existing category tabs + days selector + stale banner (coordinate filters visually)
- Extend existing filterEvents pattern (DRY — mimic how category filter works)

**Acceptance Criteria:**
- [ ] AC-1: Ticker selector `<select>` UI added above or beside category tabs with options: 'Tất cả' + distinct codes from events[], sorted A-Z
- [ ] AC-2: Selector default = 'Tất cả' (show all events, current behavior)
- [ ] AC-3: filterEvents function signature UNCHANGED; new param added (optional tickerCode='Tất cả')
- [ ] AC-4: filterEvents applies tickerCode filter AFTER category filter (cascade: category → ticker)
- [ ] AC-5: Selector onChange re-renders event list instantly (client-side, no server fetch)
- [ ] AC-6: Selector is OPTIONAL — if no events or empty code set, selector still renders but no-op on change
- [ ] AC-7: Unit tests extended in task17-corporate-events-loader.test.ts: (a) filterEvents with ticker 'VNM' returns only VNM events, (b) filterEvents with 'Tất cả' returns all, (c) empty ticker set renders selector with no options (graceful degrade)
- [ ] AC-8: Test suite GREEN (≥95% coverage of filterEvents + new selector paths)
- [ ] AC-9: No /api contract change; no server-side code touched
- [ ] AC-10: Copy/frame is plain Vietnamese (no jargon); selector label matches existing UI language

**Files to read first:**
- apps/frontend/app/routes/dashboard.corporate-events.tsx (lines 1–200, understand filterEvents + category-filter current UX)
- apps/frontend/app/__tests__/task17-corporate-events-loader.test.ts (current test patterns for filterEvents)
- Endpoint contract documented inline at dashboard.corporate-events.tsx:11–27 (events[].code always present)

**Files to create:**
- None (test additions only)

**Files to modify:**
- apps/frontend/app/routes/dashboard.corporate-events.tsx — Add ticker selector UI + filterEvents param + optional new render path
- apps/frontend/app/__tests__/task17-corporate-events-loader.test.ts — Add 3+ new test cases (AC-7)

**Dependencies:** None (client-side only, no layer precedence)

**Knowledge needed:**
- Remix/React patterns (useState, onChange event binding)
- Existing filterEvents implementation (copy pattern, not rewrite)
- docs/policies/dev-standards.md § DDD Layer Rules (UI = interface layer)
- docs/policies/commit-convention.md (AC trailer for commit)

## [Developer] Implementation Notes

### Selector UI structure
```tsx
// Inside the page render (suggested placement: beside category tabs)
const distinctCodes = [...new Set(events.map(e => e.code))].sort();

const [selectedTicker, setSelectedTicker] = useState('Tất cả');

// Selector element
<select 
  value={selectedTicker} 
  onChange={e => setSelectedTicker(e.target.value)}
  className={/* match category tab styling */}
>
  <option value="Tất cả">Tất cả ({events.length})</option>
  {distinctCodes.map(code => (
    <option key={code} value={code}>
      {code} ({events.filter(ev => ev.code === code).length})
    </option>
  ))}
</select>
```

### filterEvents signature
```tsx
export const filterEvents = (
  events: CorporateEvent[],
  selectedCategory: string,
  selectedTicker: string = 'Tất cả'
): CorporateEvent[] => {
  return events
    .filter(e => selectedCategory === 'all' || e.category === selectedCategory)
    .filter(e => selectedTicker === 'Tất cả' || e.code === selectedTicker);
};
```

### Composition constraint
The selector must visually group with category tabs + days selector in a logical filter bar (check existing PageHeader styling). Do NOT add a separate row — integrate into the existing filter section.

---

## [Implementer] — dev-frontend

**Zone:** apps/frontend/ — routes + tests

**Files modified:**
1. `apps/frontend/app/routes/dashboard.corporate-events.tsx`
   - Add useState for selectedTicker (default 'Tất cả')
   - Compute distinctCodes from events payload
   - Render ticker selector UI (inline with category tabs)
   - Pass selectedTicker to filterEvents call
   - Update rendered event list to use filtered result

2. `apps/frontend/app/__tests__/task17-corporate-events-loader.test.ts`
   - Test 1: filterEvents with ticker='VNM' → returns only VNM events
   - Test 2: filterEvents with ticker='Tất cả' → returns all events (unfiltered)
   - Test 3: distinctCodes = [] → selector renders but is a no-op
   - Test 4 (optional): onChange handler updates selectedTicker state + re-filters

**AC checklist for implementer:**
- AC-1: Selector visible in UI (inspect: `<select>` present)
- AC-2: Default value = 'Tất cả' (check initial state)
- AC-3: filterEvents signature unchanged (backward compatible call sites)
- AC-4: Filter cascade: category THEN ticker (order matters for test coverage)
- AC-5: onChange is instant (no fetch; setSelectedTicker → re-render)
- AC-6: No crash on empty code set (graceful: selector renders with no options)
- AC-7: Test coverage ≥3 new tests per AC-7a–c
- AC-8: bun test suite GREEN, no tsc errors
- AC-9: Zero /api changes, zero mcp-server zone touches
- AC-10: Label text is plain VN (e.g., "Chọn mã chứng khoán", not "Select ticker")

---

## [Developer] Implementation Record
- **Service:** frontend
- **Zone:** apps/frontend/
- **Build tier:** 4 (feature route — no new API service layer needed; payload already carries events[].code)
- **Files modified:**
  - `apps/frontend/app/routes/dashboard.corporate-events.tsx` — filterEvents gains optional `selectedTicker` param (default 'Tất cả', backward-compat); selectedTicker useState; distinctCodes derived from payload; ticker `<select>` UI integrated into filter bar beside category tabs
  - `apps/frontend/app/__tests__/task17-corporate-events-loader.test.ts` — 31 new test cases across Suite 17 (AC-7 ticker filter), Suite 18 (cascade), Suite 19 (distinctCodes)
- **Tests written:** `task17-corporate-events-loader.test.ts` — 31 new assertions (AC-7a/b/c, cascade category→ticker, distinctCodes dedup+sort), all GREEN. Total 84 pass / 0 fail in this file.
- **Git commits:** `4f0d407a feat(FE-CORPEVENTS-TICKER-FILTER/frontend): FE-CORPEVENTS-TICKER-FILTER ticker selector`
- **Type check:** clean (npx tsc --noEmit — 0 errors)
- **Service tests:** 84 pass / 0 fail (task17 file); full suite 1518 pass / 21 fail (21 pre-existing nav-count failures confirmed out-of-scope per CONTEXT)
- **Playwright render gate:** 4/4 passed (render-check.spec.ts 3/3 + smoke.spec.ts 1/1)
- **Docs updated:** NONE (interface-layer change only; no API contract, no new domain type, no new route)
- **Graphify:** skipped (no docs impacted)

**Vitest summary:** Tests 84 passed (84) — task17-corporate-events-loader.test.ts
**Playwright summary:** 4 passed (4/4)

## [QA] Review Record

*(To be filled by QA after developer closure)*

- [ ] Selector visible in /dashboard/corporate-events page
- [ ] Default = 'Tất cả' + all events shown
- [ ] Selecting a ticker (e.g., 'VNM') filters events to only VNM
- [ ] Selecting 'Tất cả' restores all events
- [ ] Category + ticker filters compose correctly (category THEN ticker)
- [ ] No server-side API calls triggered by selector change
- [ ] Test suite: ≥3 new test cases in task17 file, all GREEN
- [ ] tsc: 0 errors
- [ ] git diff shows ONLY frontend zone (no mcp-server/ops/docs changes)
- [ ] Unit coverage ≥95% for filterEvents paths

---

## [PM] Handoff Summary

**Frontend UX enhancement (client-side only).** Adds a dynamic ticker filter to the corporate-events page by extending the existing filterEvents pattern. Selector is populated from the event payload (SSOT); no server-side contract change. PO ruled client-side filter over server-side /api parameter (DRY + simpler). Pairs with no other sprint tasks. Ready for parallel dev-frontend dispatch.
