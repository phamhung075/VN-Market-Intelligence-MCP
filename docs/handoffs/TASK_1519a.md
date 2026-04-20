# TASK_1519a — RED: france-summary-bctc-deadlines failing tests

sprint: 204
phase: RED (TDD — write failing tests only, no impl)
test_file: src/__tests__/1519-france-summary-bctc-deadlines.test.ts

## Injection points (pre-confirmed, verify adjacent only)

- `src/scheduler/franceSummaryJob.ts:48` — add `upcomingDeadlines?: BctcDeadlineRow[]` to `FranceSummaryResult`
- `src/scheduler/franceSummaryJob.ts:66` — add `getUpcomingDeadlinesFn?: (db: Database, now: Date) => BctcDeadlineRow[]` to `FranceSummaryOptions`
- `src/scheduler/franceSummaryJob.ts:352-439` — `formatFranceSummaryVI` signature extension (Section 4.5)
- `src/scheduler/franceSummaryJob.ts:456` — `runFranceSummary` impl extension

## Stubs required in franceSummaryJob.ts (for RED to compile)

Add to `FranceSummaryResult` (line 48 area):
```typescript
upcomingDeadlines?: BctcDeadlineRow[]
```

Add to `FranceSummaryOptions` (line 66 area):
```typescript
getUpcomingDeadlinesFn?: (db: Database, now: Date) => BctcDeadlineRow[]
```

Extend `formatFranceSummaryVI` signature (add 9th param):
```typescript
upcomingDeadlines?: BctcDeadlineRow[]
```
Body: do NOT implement Section 4.5 yet — stub returns without rendering it.

`runFranceSummary`: do NOT populate `upcomingDeadlines` yet — stub returns `upcomingDeadlines: []` or omitted.

Add import at top of franceSummaryJob.ts:
```typescript
import type { BctcDeadlineRow } from "../application/usecases/assembleBriefing.js"
```

## DB schema for tests

```sql
CREATE TABLE IF NOT EXISTS financial_reports (
  id TEXT PRIMARY KEY,
  action_code TEXT NOT NULL,
  period_year INTEGER,
  period_quarter INTEGER,
  period_type TEXT,
  parsed_at TEXT
);
CREATE TABLE IF NOT EXISTS watchlist (
  code TEXT PRIMARY KEY,
  domain TEXT NOT NULL DEFAULT 'other'
  -- ... other cols as per 1516 pattern
);
```

Reuse `setupTestDb()` pattern from 1516 test — add `financial_reports` + `watchlist.domain` to the shared helper.

## Acceptance criteria → exact assertions

### AC-1 — FranceSummaryResult has upcomingDeadlines field

```typescript
describe("1519 AC-1 — FranceSummaryResult has upcomingDeadlines field", () => {
  it("result.upcomingDeadlines key exists", async () => {
    const db = setupTestDb();
    const result = await runFranceSummary({
      db,
      sendFn: async () => true,
      nowFn: () => new Date("2026-04-20T06:00:00Z"),
      getUpcomingDeadlinesFn: () => [],
    });
    // RED: upcomingDeadlines not in FranceSummaryResult yet
    expect("upcomingDeadlines" in result).toBe(true);
  });
});
```

### AC-2 — getUpcomingDeadlinesFn injectable

```typescript
describe("1519 AC-2 — getUpcomingDeadlinesFn injectable", () => {
  it("calls getUpcomingDeadlinesFn with (db, now) and populates result", async () => {
    const db = setupTestDb();
    let calledWith: [unknown, unknown] | null = null;
    const now = new Date("2026-04-20T06:00:00Z");
    const MOCK: BctcDeadlineRow[] = [
      { code: "VCB", domain: "banking", quarter: 1, year: 2026,
        deadline: "2026-05-15", daysUntilDeadline: 25, status: "SAP_DEN" },
    ];
    await runFranceSummary({
      db,
      sendFn: async () => true,
      nowFn: () => now,
      getUpcomingDeadlinesFn: (_db, _now) => { calledWith = [_db, _now]; return MOCK; },
    });
    // RED: fn not called yet
    expect(calledWith).not.toBeNull();
    expect(calledWith![1]).toBe(now);
  });

  it("result.upcomingDeadlines equals value returned by fn", async () => {
    const db = setupTestDb();
    const MOCK: BctcDeadlineRow[] = [
      { code: "VCB", domain: "banking", quarter: 1, year: 2026,
        deadline: "2026-05-15", daysUntilDeadline: 25, status: "SAP_DEN" },
    ];
    const result = await runFranceSummary({
      db,
      sendFn: async () => true,
      nowFn: () => new Date("2026-04-20T06:00:00Z"),
      getUpcomingDeadlinesFn: () => MOCK,
    });
    // RED: not populated yet
    expect(result.upcomingDeadlines).toHaveLength(1);
    expect(result.upcomingDeadlines![0]!.code).toBe("VCB");
  });
});
```

### AC-3 — formatFranceSummaryVI renders "BCTC sắp đến" section

```typescript
describe("1519 AC-3 — formatFranceSummaryVI renders BCTC sắp đến section", () => {
  const SAP_DEN_ROW: BctcDeadlineRow = {
    code: "VCB", domain: "banking", quarter: 1, year: 2026,
    deadline: "2026-05-15", daysUntilDeadline: 25, status: "SAP_DEN",
  };
  const QUA_HAN_ROW: BctcDeadlineRow = {
    code: "HPG", domain: "other", quarter: 4, year: 2025,
    deadline: "2026-03-31", daysUntilDeadline: -20, status: "QUA_HAN",
  };

  it("contains 'BCTC sắp đến' header", () => {
    const msg = formatFranceSummaryVI(
      "20/04/2026", [], [], [], null, null, null, undefined, [SAP_DEN_ROW],
    );
    // RED: Section 4.5 not implemented yet
    expect(msg).toContain("BCTC sắp đến");
  });

  it("SAP_DEN row renders code + quarter + year + days", () => {
    const msg = formatFranceSummaryVI(
      "20/04/2026", [], [], [], null, null, null, undefined, [SAP_DEN_ROW],
    );
    expect(msg).toContain("VCB");
    expect(msg).toContain("Q1/2026");
    expect(msg).toContain("25");
  });

  it("QUA_HAN row renders 'QUÁ HẠN' label + abs days", () => {
    const msg = formatFranceSummaryVI(
      "20/04/2026", [], [], [], null, null, null, undefined, [QUA_HAN_ROW],
    );
    expect(msg).toContain("HPG");
    expect(msg).toContain("QUÁ HẠN");
    expect(msg).toContain("20");
  });

  it("omits section when upcomingDeadlines is empty array", () => {
    const msg = formatFranceSummaryVI(
      "20/04/2026", [], [], [], null, null, null, undefined, [],
    );
    expect(msg).not.toContain("BCTC sắp đến");
  });

  it("omits section when upcomingDeadlines is undefined", () => {
    const msg = formatFranceSummaryVI(
      "20/04/2026", [], [], [], null, null, null, undefined, undefined,
    );
    expect(msg).not.toContain("BCTC sắp đến");
  });
});
```

### AC-4 — upcomingDeadlines alone satisfies hasContent guard

```typescript
describe("1519 AC-4 — upcomingDeadlines alone satisfies hasContent guard", () => {
  it("sends digest when only upcomingDeadlines present (no movers/alerts/TA)", async () => {
    const db = setupTestDb();
    const MOCK: BctcDeadlineRow[] = [
      { code: "VCB", domain: "banking", quarter: 1, year: 2026,
        deadline: "2026-05-15", daysUntilDeadline: 25, status: "SAP_DEN" },
    ];
    const result = await runFranceSummary({
      db,
      sendFn: async () => true,
      nowFn: () => new Date("2026-04-20T06:00:00Z"),
      getUpcomingDeadlinesFn: () => MOCK,
    });
    // RED: hasContent guard does not include upcomingDeadlines yet
    expect(result.sent).toBe(true);
  });
});
```

### AC-5 — omit when all stocks already filed (empty deadlines from default path)

```typescript
describe("1519 AC-5 — default path: empty when all filed", () => {
  it("upcomingDeadlines is empty array when fn returns [] (all filed)", async () => {
    const db = setupTestDb();
    const result = await runFranceSummary({
      db,
      sendFn: async () => true,
      nowFn: () => new Date("2026-04-20T06:00:00Z"),
      getUpcomingDeadlinesFn: () => [],
    });
    expect(result.upcomingDeadlines).toBeDefined();
    expect(result.upcomingDeadlines).toHaveLength(0);
  });
});
```

## Expected RED outcome

All 9 assertions fail because:
- `upcomingDeadlines` absent from `FranceSummaryResult` type and returned object
- `getUpcomingDeadlinesFn` absent from `FranceSummaryOptions`
- `formatFranceSummaryVI` has no 9th param, no Section 4.5
- `hasContent` guard does not include `upcomingDeadlines`

Stubs added to franceSummaryJob.ts make it compile — tests fail at runtime.

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/franceSummaryJob.ts   # added BctcDeadlineRow import; upcomingDeadlines? field to FranceSummaryResult; getUpcomingDeadlinesFn? to FranceSummaryOptions; 9th _upcomingDeadlines? param to formatFranceSummaryVI (stub, no Section 4.5 impl)

tests_written:
- src/__tests__/1519-france-summary-bctc-deadlines.test.ts   # 10 assertions: 8 RED (fail), 2 correct negatives (pass)

tests_skipped: []   # Section 4.5 impl + hasContent guard wiring deferred to GREEN phase (1519b)

tsc_clean: true
full_suite_pass: false   # RED phase — 8 assertions intentionally failing
