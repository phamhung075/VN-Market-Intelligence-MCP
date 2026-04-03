# TECH-039: Lớp Bảo Vệ Vốn — Technical Design

status: APPROVED_BY_ARCHITECT
req_ref: REQ-039

---

## Brownfield Impact

### Files created (8 new):
- `src/domain/services/legalRiskDetector.ts` — Pure legal risk pattern matcher
- `src/domain/services/policyImpactMapper.ts` — Pure policy-to-sector mapper
- `src/domain/services/bondMaturityTracker.ts` — Bond maturity calendar
- `src/infrastructure/fetchers/congbao.ts` — Công Báo scraper
- `src/infrastructure/fetchers/sbvCircular.ts` — NHNN circular scraper
- `src/infrastructure/mcp/tools/legalRiskTools.ts` — get_legal_risk_signals
- `src/interface/mcp/tools/policyTools.ts` — get_policy_signals
- `src/interface/mcp/tools/bondMaturityTools.ts` — get_bond_maturity_calendar

### Files modified (7 existing):
- `src/domain/services/signalDetector.ts` — Add 3 SignalType values
- `src/domain/services/sentimentClassifier.ts` — Add legal risk keyword class
- `src/domain/services/cascadeEngine.ts` — Add POLICY_RULES + LEGAL_RISK_RULES
- `src/application/usecases/pollNews.ts` — Wire legal risk detection post-normalization
- `src/infrastructure/db/schema.ts` — Add `bond_maturity` + `policy_events` tables
- `src/interface/mcp/server.ts` — Register 3 new tools (53 → 56)
- `src/scheduler/jobs.ts` — Add policyCheckJob cron

### Breaking changes: None
Adding to `SignalType` union is additive. No exhaustive switch patterns exist.

---

## Task Breakdown

### Task 240: Legal Risk Detector
**Branch**: `task/240-legal-risk-detector`
**Layer**: domain/services
**Files**: `src/domain/services/legalRiskDetector.ts`, `src/__tests__/240-legal-risk.test.ts`

```typescript
// Interface
export type LegalRiskType =
  | "prosecution" | "tax_penalty" | "license_revocation"
  | "anti_dumping" | "litigation" | "asset_freeze" | "investigation";

export interface LegalRiskSignal {
  riskType: LegalRiskType;
  severity: Severity;
  matchedPatterns: string[];
  stockCodes: string[];
  confidence: number;
  originalText: string;
}

export function detectLegalRisk(text: string, watchlistCodes: string[]): LegalRiskSignal[];
```

**Pattern groups** (16 patterns, 7 risk types):
```typescript
const LEGAL_PATTERNS: Array<{ pattern: RegExp; riskType: LegalRiskType; severity: Severity }> = [
  { pattern: /khởi tố/i, riskType: "prosecution", severity: "critical" },
  { pattern: /bắt (tạm )?giam/i, riskType: "prosecution", severity: "critical" },
  { pattern: /phong tỏa tài sản/i, riskType: "asset_freeze", severity: "critical" },
  { pattern: /kê biên/i, riskType: "asset_freeze", severity: "critical" },
  { pattern: /truy thu thuế/i, riskType: "tax_penalty", severity: "high" },
  { pattern: /phạt vi phạm thuế/i, riskType: "tax_penalty", severity: "high" },
  { pattern: /thu hồi giấy phép/i, riskType: "license_revocation", severity: "high" },
  { pattern: /đình chỉ hoạt động/i, riskType: "license_revocation", severity: "high" },
  { pattern: /chống bán phá giá|anti.?dumping/i, riskType: "anti_dumping", severity: "high" },
  { pattern: /thua kiện/i, riskType: "litigation", severity: "medium" },
  { pattern: /bồi thường thiệt hại/i, riskType: "litigation", severity: "medium" },
  { pattern: /cưỡng chế thi hành/i, riskType: "litigation", severity: "medium" },
  { pattern: /điều tra/i, riskType: "investigation", severity: "medium" },
  { pattern: /vi phạm pháp luật/i, riskType: "investigation", severity: "medium" },
  { pattern: /xử phạt hành chính/i, riskType: "investigation", severity: "medium" },
  { pattern: /thanh tra/i, riskType: "investigation", severity: "medium" },
];
```

**Stock resolution**: Uses `detectStocksInText()` from existing `stockAliases.ts`.
**Tests**: 20 tests — each pattern, stock resolution, false positive filtering, empty input.

---

### Task 241: Policy Impact Mapper
**Branch**: `task/241-policy-impact-mapper`
**Layer**: domain/services
**Files**: `src/domain/services/policyImpactMapper.ts`, `src/__tests__/241-policy-mapper.test.ts`

```typescript
export type PolicyType =
  | "credit_policy" | "tax_change" | "industrial_zone" | "energy_policy"
  | "real_estate_policy" | "trade_policy" | "monetary_policy";

export interface PolicySignal {
  policyType: PolicyType;
  affectedSectors: DomainType[];
  affectedStocks: string[];
  direction: ImpactDirection;
  summary: string;
  confidence: number;
}

export function classifyPolicy(title: string, body: string): PolicySignal | null;
```

**Policy-sector map** (static, extendable):
```typescript
const POLICY_SECTOR_MAP: Record<string, { sectors: DomainType[]; stocks: string[]; keywords: string[] }> = {
  credit_policy: { sectors: ["banking"], stocks: ["VCB","BID","CTG","TCB"], keywords: ["room tín dụng","lãi suất điều hành","tăng trưởng tín dụng"] },
  tax_change: { sectors: ["beverages","automotive"], stocks: ["SAB","VBL","VEA"], keywords: ["thuế TTĐB","thuế nhập khẩu","thuế xuất khẩu"] },
  industrial_zone: { sectors: ["industrial_zone"], stocks: ["IDC","KBC","SZC"], keywords: ["khu công nghiệp","KCN","phê duyệt KCN"] },
  energy_policy: { sectors: ["oil_gas","renewable"], stocks: ["GEG","REE","PC1"], keywords: ["quy hoạch điện","FIT","năng lượng tái tạo"] },
  real_estate_policy: { sectors: ["real_estate"], stocks: ["VHM","NVL","KDH"], keywords: ["siết tín dụng BĐS","luật đất đai","quy hoạch đô thị"] },
  trade_policy: { sectors: ["steel","seafood"], stocks: ["HPG","MPC","ANV"], keywords: ["FTA","thuế quan","hàng rào thương mại"] },
  monetary_policy: { sectors: ["banking"], stocks: ["VCB","BID","CTG"], keywords: ["lãi suất","tỷ giá","dự trữ bắt buộc"] },
};
```
**Tests**: 15 tests.

---

### Task 242: Congbao + SBV Circular Fetchers
**Branch**: `task/242-policy-fetchers`
**Layer**: infrastructure/fetchers
**Files**: `src/infrastructure/fetchers/congbao.ts`, `src/infrastructure/fetchers/sbvCircular.ts`, `src/__tests__/242-policy-fetchers.test.ts`

Both fetchers follow the same pattern as `vneconomy.ts`:
- Cheerio HTML scraper
- Circuit breaker via `circuitBreakerRegistry`
- Rate limiter via `rateLimiter`
- Never throw → return `[]`
- Browser User-Agent header

**Tests**: 10 tests (5 per fetcher — success, empty, error, rate limited, circuit open).

---

### Task 243: Bond Maturity Tracker
**Branch**: `task/243-bond-maturity`
**Layer**: domain/services + infrastructure/db
**Files**: `src/domain/services/bondMaturityTracker.ts`, `src/infrastructure/db/bondMaturityStore.ts`, `src/__tests__/243-bond-maturity.test.ts`

```typescript
export interface BondMaturityEvent {
  issuer: string;
  issuerCode: string;
  amount: number;          // billion VND
  maturityDate: string;    // ISO 8601
  couponRate: number;      // %
  status: "upcoming" | "due" | "defaulted" | "extended";
}

export function getUpcomingMaturities(months: number): BondMaturityEvent[];
export function checkMaturityAlerts(events: BondMaturityEvent[]): Signal[];
```

**SQLite table**:
```sql
CREATE TABLE IF NOT EXISTS bond_maturity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issuer TEXT NOT NULL,
  issuer_code TEXT NOT NULL,
  amount_billion REAL NOT NULL,
  maturity_date TEXT NOT NULL,
  coupon_rate REAL,
  status TEXT NOT NULL DEFAULT 'upcoming',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bond_maturity_date ON bond_maturity(maturity_date);
CREATE INDEX IF NOT EXISTS idx_bond_maturity_code ON bond_maturity(issuer_code);
```

**Initial seed data**: Known TPDN for VHM, NVL, KDH, PDR, DIG (from public HNX bond data).
**Tests**: 12 tests.

---

### Task 244: Signal Integration + Cascade Rules
**Branch**: `task/244-signal-integration-039`
**Layer**: domain + application
**Files**: Modify existing files, `src/__tests__/244-signal-integration.test.ts`

- Extend `SignalType` in `signalDetector.ts`: `"legal_risk" | "policy_change" | "bond_maturity"`
- Add `LEGAL_RISK_RULES` + `POLICY_RULES` to `cascadeEngine.ts`
- Wire `detectLegalRisk()` into `pollNews.ts` (after sentiment classification pass)
- Add `policyCheckJob` to `scheduler/jobs.ts` (daily at 07:30)

**Tests**: 10 tests.

---

### Task 245: MCP Tools (3 tools)
**Branch**: `task/245-mcp-tools-039`
**Layer**: interface/mcp/tools
**Files**: `src/interface/mcp/tools/legalRiskTools.ts`, `src/interface/mcp/tools/policyTools.ts`, `src/interface/mcp/tools/bondMaturityTools.ts`, `src/__tests__/245-mcp-tools-039.test.ts`

3 new tools registered in `server.ts`:
1. `get_legal_risk_signals` — input: `{ stock?: string, days?: number }`
2. `get_policy_signals` — input: `{ sector?: string, days?: number }`
3. `get_bond_maturity_calendar` — input: `{ months?: number }`

**Tests**: 9 tests (3 per tool).

---

## Dependency Chain

```
240 (legalRiskDetector — pure, no deps)
241 (policyImpactMapper — pure, no deps)
242 (fetchers — infra, no deps)
243 (bondMaturityTracker — domain + db, no deps)
  ↓
244 (signal integration — depends on 240, 241, 243)
  ↓
245 (MCP tools — depends on 240, 241, 243, 244)
```

Tasks 240, 241, 242, 243 can run in parallel.
Task 244 depends on 240 + 241 + 243.
Task 245 depends on 244.

---

## Tool Count

53 (Sprint 036) + 3 (legal risk + policy + bond maturity) = **56 tools**.
