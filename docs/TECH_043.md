# TECH-043: Radar Khủng Hoảng — Technical Design

status: APPROVED_BY_ARCHITECT
req_ref: REQ-043

---

## Brownfield Impact

### Files created (5 new):
- `src/domain/services/crisisPatternDetector.ts` — Velocity-based crisis detector
- `src/domain/services/reputationScorer.ts` — Rolling 30-day reputation score
- `src/infrastructure/db/mentionVelocityStore.ts` — Hourly mention counts
- `src/infrastructure/db/reputationStore.ts` — Daily reputation snapshots
- `src/interface/mcp/tools/crisisTools.ts` — get_crisis_early_warning

### Files modified (5 existing):
- `src/domain/services/signalDetector.ts` — Add `"crisis_event"` to SignalType
- `src/domain/services/sentimentClassifier.ts` — Add crisis keyword class
- `src/application/usecases/pollNews.ts` — Wire mention velocity + crisis check
- `src/infrastructure/db/schema.ts` — Add `mention_velocity`, `reputation_scores` tables
- `src/interface/mcp/server.ts` — Register 1 new tool (62 → 63)

### Breaking changes: None

---

## Task Breakdown

### Task 263: Crisis Pattern Detector
**Branch**: `task/263-crisis-detector`
**Layer**: domain/services
**Files**: `src/domain/services/crisisPatternDetector.ts`, `src/__tests__/263-crisis-detector.test.ts`

```typescript
export type CrisisType =
  | "product_recall" | "environmental" | "workplace_accident"
  | "cyber_breach" | "fraud_scandal" | "executive_scandal" | "regulatory_action";

export interface CrisisIndicator {
  stock: string;
  mentionVelocity: number;
  negativeSentimentRatio: number;
  uniqueSources: number;
  crisisScore: number;
  crisisType: CrisisType;
  topHeadlines: string[];
}

export interface CrisisSignal {
  type: CrisisType;
  severity: Severity;
  stock: string;
  crisisScore: number;
  mentionVelocity: number;
  topHeadlines: string[];
  confidence: number;
}

export function detectCrisis(indicator: CrisisIndicator): CrisisSignal | null;
export function classifyCrisisType(text: string): CrisisType | null;
```

**Vietnamese crisis patterns** (18 patterns):
```typescript
const CRISIS_PATTERNS: Array<{ pattern: RegExp; type: CrisisType }> = [
  { pattern: /thu hồi sản phẩm|product recall/i, type: "product_recall" },
  { pattern: /ngộ độc (thực phẩm)?|food poisoning/i, type: "product_recall" },
  { pattern: /sản phẩm (lỗi|không đạt)/i, type: "product_recall" },
  { pattern: /xả thải|ô nhiễm môi trường/i, type: "environmental" },
  { pattern: /vi phạm môi trường/i, type: "environmental" },
  { pattern: /tràn (dầu|hóa chất)/i, type: "environmental" },
  { pattern: /tai nạn lao động/i, type: "workplace_accident" },
  { pattern: /sập (công trình|giàn giáo)/i, type: "workplace_accident" },
  { pattern: /cháy (nhà máy|kho)/i, type: "workplace_accident" },
  { pattern: /lộ dữ liệu|data breach/i, type: "cyber_breach" },
  { pattern: /tấn công mạng|cyber attack/i, type: "cyber_breach" },
  { pattern: /hack/i, type: "cyber_breach" },
  { pattern: /lừa đảo|gian lận/i, type: "fraud_scandal" },
  { pattern: /bê bối|scandal/i, type: "fraud_scandal" },
  { pattern: /tố cáo|whistleblower/i, type: "fraud_scandal" },
  { pattern: /CEO.{0,30}(từ chức|bị bắt|scandal)/i, type: "executive_scandal" },
  { pattern: /chủ tịch.{0,30}(từ chức|bị bắt)/i, type: "executive_scandal" },
  { pattern: /xử phạt|đình chỉ/i, type: "regulatory_action" },
];
```

**Severity thresholds**:
- CRITICAL: velocity > 5× baseline AND sentiment < -0.6 AND sources ≥ 2
- HIGH: velocity > 3× baseline AND sentiment < -0.4 AND sources ≥ 2
- MEDIUM: velocity > 2× baseline AND sentiment < -0.3

**Tests**: 20 tests.

---

### Task 264: Reputation Scorer
**Branch**: `task/264-reputation-scorer`
**Layer**: domain/services
**Files**: `src/domain/services/reputationScorer.ts`, `src/__tests__/264-reputation-scorer.test.ts`

```typescript
export interface DailySentimentEntry {
  date: string;
  avgSentiment: number;     // -1 to +1
  mentionCount: number;
  crisisCount: number;
}

export interface ReputationScore {
  stock: string;
  score: number;            // 0-100
  trend: "improving" | "deteriorating" | "stable";
  recentCrises: number;
  daysSinceLastCrisis: number;
  riskLevel: "safe" | "watch" | "warning" | "danger";
}

export function computeReputation(stock: string, entries: DailySentimentEntry[]): ReputationScore;
```

**Computation**:
- EWMA of daily sentiment (α = 0.15, recent days weighted more)
- Crisis penalty: CRITICAL = -20, HIGH = -10, MEDIUM = -5
- Recovery: +2/day if no new crisis
- Risk levels: ≥70 safe, 50-69 watch, 30-49 warning, <30 danger

**Tests**: 15 tests.

---

### Task 265: Mention Velocity Store
**Branch**: `task/265-mention-velocity-store`
**Layer**: infrastructure/db
**Files**: `src/infrastructure/db/mentionVelocityStore.ts`, `src/infrastructure/db/reputationStore.ts`, `src/__tests__/265-velocity-store.test.ts`

**SQLite tables**:
```sql
CREATE TABLE IF NOT EXISTS mention_velocity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  hour TEXT NOT NULL,
  mention_count INTEGER NOT NULL DEFAULT 0,
  negative_count INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mention_code_hour ON mention_velocity(code, hour);

CREATE TABLE IF NOT EXISTS reputation_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  date TEXT NOT NULL,
  score REAL NOT NULL,
  trend TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  UNIQUE(code, date)
);
CREATE INDEX IF NOT EXISTS idx_reputation_code ON reputation_scores(code);
```

**Methods**: `recordMention()`, `getVelocity()`, `getBaseline()`, `saveReputation()`, `getReputation()`
**Cleanup**: Auto-delete mention_velocity entries > 30 days.

**Tests**: 12 tests.

---

### Task 266: Signal Integration
**Branch**: `task/266-signal-integration-043`

- Extend `SignalType`: `"crisis_event"`
- Wire mention velocity tracking into `pollNews.ts`
- Crisis signals use shortened cooldown (30 min instead of default)
- Reputation < 50 → add to morning briefing warning section

**Tests**: 8 tests.

---

### Task 267: MCP Tool
**Branch**: `task/267-mcp-tool-043`

1 new tool: `get_crisis_early_warning`
Register in `server.ts`: 62 → 63 tools.

**Tests**: 5 tests.

---

## Dependency Chain

```
263 (crisisPatternDetector — pure, no deps)
264 (reputationScorer — pure, no deps)
265 (mentionVelocityStore — db, no deps)
  ↓
266 (signal integration — depends on 263, 264, 265)
  ↓
267 (MCP tool — depends on all above)
```

Tasks 263, 264, 265 can run in parallel.

## Tool Count: 62 → **63 tools**
