# TASK_1334a — RED: Failing tests for signal filter + CEO broadcast

Sprint 1334 | Size S | Layer: infrastructure/db + domain/services

---

## Test A — stock_code="unknown" must not enter agent_signals

**File:** `apps/mcp-server/src/__tests__/1334a-signal-filter.test.ts`

```typescript
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { postSignal, getSignals } from "../infrastructure/db/agentSignalStore.js";

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL, to_agent TEXT NOT NULL,
      signal_type TEXT NOT NULL, stock_code TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'unread',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
  `);
  return db;
}

describe("Task 1334a — market-wide signal filter", () => {
  it('postSignal with stockCode="unknown" → stock_code stored as NULL', () => {
    const db = makeDb();
    const id = postSignal(db, {
      fromAgent: "market-watcher",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "unknown",          // agent literal string — must be normalized to null
      payload: { title: "VN-Index bearish" },
      ttlMinutes: 60,
    });
    const row = db.query<{ stock_code: string | null }, [number]>(
      "SELECT stock_code FROM agent_signals WHERE id = ?"
    ).get(id);
    expect(row).not.toBeNull();
    expect(row!.stock_code).toBeNull();   // RED: currently stores "unknown"
  });

  it('postSignal with stockCode=undefined → stock_code stored as NULL', () => {
    const db = makeDb();
    const id = postSignal(db, {
      fromAgent: "market-watcher",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: undefined,
      payload: { title: "VN-Index falls" },
      ttlMinutes: 60,
    });
    const row = db.query<{ stock_code: string | null }, [number]>(
      "SELECT stock_code FROM agent_signals WHERE id = ?"
    ).get(id);
    expect(row!.stock_code).toBeNull();   // already passes — regression guard
  });

  it('postSignal with stockCode=null → stock_code stored as NULL', () => {
    const db = makeDb();
    const id = postSignal(db, {
      fromAgent: "market-watcher",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: null,
      payload: { title: "Macro event" },
      ttlMinutes: 60,
    });
    const row = db.query<{ stock_code: string | null }, [number]>(
      "SELECT stock_code FROM agent_signals WHERE id = ?"
    ).get(id);
    expect(row!.stock_code).toBeNull();   // already passes — regression guard
  });

  it('valid stock code "VCB" is preserved as-is', () => {
    const db = makeDb();
    const id = postSignal(db, {
      fromAgent: "market-watcher",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VCB",
      payload: { title: "VCB earnings beat" },
      ttlMinutes: 60,
    });
    const row = db.query<{ stock_code: string | null }, [number]>(
      "SELECT stock_code FROM agent_signals WHERE id = ?"
    ).get(id);
    expect(row!.stock_code).toBe("VCB");  // must not normalize real tickers
  });
});
```

**Expected RED:** test 1 fails — currently `"unknown"` is stored verbatim.

---

## Test B — DSC CEO bearish warning triggers BEARISH market-wide broadcast

**File:** `apps/mcp-server/src/__tests__/1334b-ceo-broadcast.test.ts`

```typescript
import { describe, it, expect } from "bun:test";
import { buildCausalChain } from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";

const DSC_ARTICLE: AnalysisEntry = {
  id: "dsc-ceo-bearish",
  level: "country",
  sourceTitle: "Tổng Giám đốc DSC: Những nhịp điều chỉnh của VN-Index nếu xảy ra có thể sẽ rất sâu và đau",
  summary: "Tổng Giám đốc DSC cảnh báo nhà đầu tư rằng thị trường chứng khoán có thể điều chỉnh sâu và đau. Những nhịp điều chỉnh sâu nếu xảy ra có thể khiến VN-Index rất sâu và đau.",
  sentiment: "bearish",
  impactScore: 4,         // below default broadcastMinImpact=6 — must still broadcast via analyst-warning path
  affectedDomains: ["securities"],
  tags: [],
  url: "",
  publishedAt: new Date().toISOString(),
};

const WATCHLIST = [
  { actionCode: "VCB", domain: "banking" as const, exchange: "HOSE" },
  { actionCode: "VNM", domain: "consumer_goods" as const, exchange: "HOSE" },
  { actionCode: "SSI", domain: "securities" as const, exchange: "HOSE" },
];

describe("Task 1334b — CEO bearish analyst warning broadcast", () => {
  it("DSC CEO warning article triggers market-wide broadcast to all watchlist stocks", () => {
    const chain = buildCausalChain(DSC_ARTICLE, WATCHLIST);

    const broadcastCodes = chain.watchlistImpacts.map((w) => w.actionCode);
    // Must reach VCB and VNM (not just SSI from direct domain match)
    expect(broadcastCodes).toContain("VCB");   // RED: currently missing
    expect(broadcastCodes).toContain("VNM");   // RED: currently missing
  });

  it("broadcast entries from CEO warning carry BEARISH sentiment", () => {
    const chain = buildCausalChain(DSC_ARTICLE, WATCHLIST);

    const vcbImpact = chain.watchlistImpacts.find((w) => w.actionCode === "VCB");
    expect(vcbImpact).toBeDefined();
    // Impact direction must be negative (bearish cascade)
    expect(vcbImpact!.impactDirection).toBe("negative");  // RED: not present
  });

  it("broadcast entries use analyst-warning path reasoning marker", () => {
    const chain = buildCausalChain(DSC_ARTICLE, WATCHLIST);

    const entries = chain.entries.filter(
      (e) => e.level === "action" && e.affectedActions.includes("VCB")
    );
    expect(entries.length).toBeGreaterThan(0);
    // Reasoning must mention analyst-warning cascade path
    expect(entries[0].reasoning).toMatch(/analyst.warning.*cascade|market-wide cascade/i); // RED
  });
});
```

**Expected RED:** all 3 sub-tests fail — DSC CEO article at impactScore=4 does not currently broadcast beyond `securities` domain.

---

## Insertion points (for TASK_1334b)

### Fix A
- **File:** `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts`
- **Function:** `postSignal()` — line ~254 where `stockCode` is destructured
- **Change:** normalize sentinel: `const resolvedStockCode = (!stockCode || stockCode === "unknown") ? null : stockCode;`
- Use `resolvedStockCode` in every INSERT branch instead of bare `stockCode`

### Fix B
- **File:** `apps/mcp-server/src/domain/services/cascadeEngine.ts`
- **Function:** `isMarketWide()` — lines 2343–2379
- **Change:** add criterion (d) — analyst warning pattern:

```typescript
// (d) Analyst bearish-warning pattern (CEO/analyst market-warning, e.g. "điều chỉnh sâu")
const ANALYST_WARNING_PATTERNS = [
  "dieu chinh sau",   // "điều chỉnh sâu" (deep correction)
  "rat sau va dau",   // "rất sâu và đau"
  "canh bao nha dau tu",  // "cảnh báo nhà đầu tư"
];
if (ANALYST_WARNING_PATTERNS.some((p) => normText.includes(p))) return true;
```

Add before the final `return false;` in `isMarketWide()`.
