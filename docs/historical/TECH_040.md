# TECH-040: Macro Catalyst — Technical Design

status: APPROVED_BY_ARCHITECT
req_ref: REQ-040

---

## Brownfield Impact

### Files created (8 new):
- `src/infrastructure/fetchers/muasamcong.ts` — Public procurement scraper
- `src/infrastructure/fetchers/sscInsider.ts` — SSC insider transaction scraper
- `src/domain/services/creditFlowAnalyzer.ts` — Credit flow → stock impact
- `src/domain/services/leadershipSignal.ts` — Insider transaction → signal classifier
- `src/infrastructure/db/insiderStore.ts` — Insider transactions SQLite store
- `src/interface/mcp/tools/publicInvestmentTools.ts` — get_public_investment_signals
- `src/interface/mcp/tools/creditFlowTools.ts` — get_credit_flow_signals
- `src/interface/mcp/tools/leadershipTools.ts` — get_leadership_signals

### Files modified (6 existing):
- `src/domain/services/signalDetector.ts` — Add 3 SignalType values
- `src/domain/services/cascadeEngine.ts` — Add CAPEX_RULES + CREDIT_RULES
- `src/infrastructure/db/schema.ts` — Add `public_contracts`, `insider_transactions`, `credit_data` tables
- `src/scheduler/jobs.ts` — Add insiderCheckJob (daily 19:00)
- `src/interface/mcp/server.ts` — Register 3 new tools (56 → 59)
- `src/application/usecases/pollNews.ts` — Wire contract detection

### Breaking changes: None

---

## Task Breakdown

### Task 246: Credit Flow Analyzer
**Branch**: `task/246-credit-flow-analyzer`
**Layer**: domain/services
**Files**: `src/domain/services/creditFlowAnalyzer.ts`, `src/__tests__/246-credit-flow.test.ts`

```typescript
export interface CreditData {
  totalCreditTrillion: number;
  reCreditTrillion: number;
  reCreditRatioPct: number;
  yoyGrowthPct: number;
  avgMortgageRatePct: number;
  date: string;
}

export interface CreditSignal {
  direction: ImpactDirection;
  affectedStocks: Array<{ code: string; impact: string }>;
  summary: string;
  severity: Severity;
  confidence: number;
}

export function analyzeCreditFlow(current: CreditData, previous: CreditData): CreditSignal;
```

**Chain logic encoded**:
```typescript
const CREDIT_CHAIN = {
  re_credit_up: [
    { stocks: ["VHM","NVL","KDH"], impact: "Thanh khoản BĐS cải thiện → doanh thu nhận nhà tăng" },
    { stocks: ["VCB","BID","CTG"], impact: "Nợ xấu BĐS giảm → provision thấp → EPS tốt" },
  ],
  re_credit_down: [
    { stocks: ["VHM","NVL","KDH"], impact: "Thanh khoản BĐS giảm → doanh thu chậm" },
    { stocks: ["VCB","BID","CTG"], impact: "Rủi ro nợ xấu BĐS tăng → provision cao" },
  ],
  rate_up: [
    { stocks: ["VCB","BID","CTG"], impact: "NIM mở rộng ngắn hạn → EPS tốt" },
    { stocks: ["VHM","NVL"], impact: "Chi phí vay tăng → khó bán" },
  ],
  rate_down: [
    { stocks: ["VHM","NVL","KDH"], impact: "Chi phí vay giảm → thanh khoản BĐS tăng" },
    { stocks: ["VCB","BID","CTG"], impact: "NIM thu hẹp → nhưng chất lượng tài sản tốt hơn" },
  ],
};
```
**Tests**: 15 tests.

---

### Task 247: Leadership Signal Detector
**Branch**: `task/247-leadership-signal`
**Layer**: domain/services
**Files**: `src/domain/services/leadershipSignal.ts`, `src/__tests__/247-leadership-signal.test.ts`

```typescript
export interface InsiderTransaction {
  code: string;
  insiderName: string;
  position: "CEO" | "CFO" | "Chairman" | "Board" | "Other";
  type: "buy" | "sell";
  volume: number;
  registeredVolume: number;
  price: number;
  date: string;
}

export interface LeadershipSignal {
  type: "insider_buy" | "insider_sell" | "leadership_change" | "mass_insider_buy";
  severity: Severity;
  code: string;
  insiderName: string;
  position: string;
  volumePctOutstanding: number;
  direction: ImpactDirection;
  confidence: number;
  reasoning: string;
}

export function classifyInsiderTransaction(tx: InsiderTransaction, outstandingShares: number): LeadershipSignal;
export function detectMassInsiderBuy(txs: InsiderTransaction[], windowDays: number): LeadershipSignal | null;
```

**Classification rules**:
- CEO/CFO buy >0.5% outstanding → HIGH BULLISH
- Multiple insiders buy within 30 days → HIGH BULLISH (mass_insider_buy)
- CEO/CFO sell 100% holdings → CRITICAL BEARISH
- Board sell >50% → HIGH BEARISH
- Small transactions (<0.1% outstanding) → filtered out

**Tests**: 18 tests.

---

### Task 248: Muasamcong Fetcher
**Branch**: `task/248-muasamcong-fetcher`
**Layer**: infrastructure/fetchers
**Files**: `src/infrastructure/fetchers/muasamcong.ts`, `src/__tests__/248-muasamcong.test.ts`

Cheerio HTML scraper targeting `muasamcong.mof.gov.vn`.
- Circuit breaker + rate limiter
- Never throw → return `[]`
- Browser User-Agent
- Contract-to-stock mapping embedded in fetcher output

**Tests**: 8 tests.

---

### Task 249: SSC Insider Fetcher
**Branch**: `task/249-ssc-insider`
**Layer**: infrastructure/fetchers
**Files**: `src/infrastructure/fetchers/sscInsider.ts`, `src/infrastructure/db/insiderStore.ts`, `src/__tests__/249-ssc-insider.test.ts`

Cheerio scraper targeting SSC insider disclosure page.
- SQLite table `insider_transactions`:
```sql
CREATE TABLE IF NOT EXISTS insider_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  insider_name TEXT NOT NULL,
  position TEXT NOT NULL,
  type TEXT NOT NULL,
  volume INTEGER NOT NULL,
  registered_volume INTEGER,
  price REAL,
  transaction_date TEXT NOT NULL,
  disclosure_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_insider_code ON insider_transactions(code);
CREATE INDEX IF NOT EXISTS idx_insider_date ON insider_transactions(transaction_date);
```

**Tests**: 10 tests.

---

### Task 250: Signal Integration + Cascade Rules
**Branch**: `task/250-signal-integration-040`
**Layer**: domain + application + scheduler

- Extend `SignalType`: `"public_contract" | "credit_flow" | "insider_trading"`
- Add `CAPEX_RULES` + `CREDIT_RULES` to cascadeEngine
- Add `insiderCheckJob` to scheduler (daily 19:00 M-F)
- Wire public contract detection into `pollNews.ts`

**Tests**: 10 tests.

---

### Task 251: MCP Tools (3 tools)
**Branch**: `task/251-mcp-tools-040`
**Layer**: interface/mcp/tools

3 new tools: `get_public_investment_signals`, `get_credit_flow_signals`, `get_leadership_signals`
Register in `server.ts`: 56 → 59 tools.

**Tests**: 9 tests.

---

## Dependency Chain

```
246 (creditFlowAnalyzer — pure, no deps)
247 (leadershipSignal — pure, no deps)
248 (muasamcong — infra, no deps)
249 (sscInsider — infra + db, no deps)
  ↓
250 (signal integration — depends on 246, 247)
  ↓
251 (MCP tools — depends on all above)
```

Tasks 246, 247, 248, 249 can run in parallel.

## Tool Count: 56 → **59 tools**
