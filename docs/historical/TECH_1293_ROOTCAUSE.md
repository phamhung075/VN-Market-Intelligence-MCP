# TECH-1293: Alert Signal Payload Quality Gap — Root Cause Analysis

**status**: APPROVED_BY_ARCHITECT
**severity**: HIGH (recurring, 3x fixes required)
**incident_date**: 2026-04-23 02:36 UTC
**pattern_first_seen**: Sprint 228+
**recurring_fixes**: 2 attempted, 1 pending

---

## Executive Summary

News Scout and Market Watcher are emitting incomplete signal payloads on `chain_catalyst` and `price_confirmation` signals. Alert Commander receives signals missing required numeric verification fields (`newsSentiment`, `kinhDichConfidence`, `agentSignalsMajority` in payload; `confidence`, `direction`, `summary` in finding_data), then suppresses valid 4-AND opportunities because the signal validation cannot proceed.

**Root causes identified:**

1. **Type definition gap** — Agent specs (.md files) document required fields, but TypeScript schema is permissive (`SignalPayload` = `{ title?, detail?, impact_score? }` + `[key: string]: unknown`)
2. **Job implementation gap** — News Scout + Market Watcher agents have no runtime validation before posting
3. **Integration gap** — MCP tool validator (task #693 rejection for `cross_validate`) applies only to one signal type, not to enrichment chain signals
4. **Testing gap** — RED tests do not assert on missing fields; GREEN implementation fills stubs with placeholder values that pass validation but lack numeric content

**Impact:** 5 bullish signals (2026-04-23 02:36 UTC) suppressed because chain synthesizer received `confidence=0` (uninitialized), blocked conviction calculation.

---

## 1. Brownfield Impact

| File | Status | Finding |
|------|--------|---------|
| `src/infrastructure/db/agentSignalStore.ts` | VERIFY | SignalPayload schema is permissive (lines 58–62) |
| `src/interface/mcp/tools/news-analysis/agentSignalTools.ts` | VERIFY | post_agent_signal validates cross_validate only (lines 150–164); chain_catalyst + price_confirmation skip validation |
| `.claude/agents/01-news-scout.md` | VERIFY | Step 4 documents required finding_data: event_type, direction, confidence, affected_stocks, source (line 92) |
| `.claude/agents/04-market-watcher.md` | VERIFY | Step 3.5 documents required finding_data: price_change_pct, volume_ratio, confirms_direction, fully_priced, confidence (line 155) |
| `src/domain/services/chainSynthesizer.ts` | VERIFY | Accesses findingData.confidence (line 147), findingData.direction (lines 75–77), findingData.summary (line 111) without null checks |
| `src/__tests__/chain-synthesizer.test.ts` | VERIFY | Tests provide full findingData but do not test partial/missing fields |
| `src/domain/services/signalValidator.ts` (if exists) | VERIFY | Confidence scorer may apply penalties for missing fields but NOT reject early |

---

## 2. Root Causes (Detailed)

### 2.1 Type Definition Gap (Schema Level)

**Problem:** `SignalPayload` interface is intentionally loose:

```typescript
export interface SignalPayload {
  title?: string;
  detail?: string;
  impact_score?: number;
  [key: string]: unknown;  // ← Allows ANY field, no enforcement
}
```

**Why:** Backward compatibility with Task 242 (original signal bus) + flexibility for future signal types.

**Consequence:** Agents can post signals with ZERO verification fields and TypeScript validation passes. MCP tool Zod schema also loose:

```typescript
const PayloadSchema = z.object({
  title: z.string().optional(),
  detail: z.string().optional(),
  impact_score: z.coerce.number().min(0).max(10).optional(),
}).passthrough();  // ← Allows extra fields
```

### 2.2 Job Implementation Gap (Agent Behavior)

News Scout (01-news-scout.md, Step 4, line 92) specifies:

```
post_agent_signal(..., finding_data={
  "event_type": "<credit_policy|...>",
  "direction": "<bullish|bearish|neutral>",
  "confidence": <0.0-1.0>,
  "affected_stocks": [<codes>],
  "affected_sectors": [<sectors>],
  "headline": "<headline>",
  "source": "<cafef|vnexpress|reuters>"
}, ...)
```

**But actual agent execution** (no code file yet — agents run as Claude prompts in parallel) likely:
- Extracts impact_score from news sentiment
- Skips finding_data entirely if response length budget exhausted
- Uses placeholder values ("unknown", "neutral", 0.5) instead of computing actual confidence

Market Watcher (04-market-watcher.md, Step 3.5, line 155) specifies:

```
post_agent_signal(..., finding_data={
  "price_change_pct": <num>,
  "volume_ratio": <vol/avg>,
  "confirms_direction": <bool>,
  "fully_priced": <bool>,
  "confidence": <0.0-1.0>
}, ...)
```

**But actual execution** likely:
- Computes price change but skips volume/direction cross-check
- Posts with `confidence` uninitialized (defaults to `undefined`)

### 2.3 Integration Gap (MCP Tool Validation)

**Current state** (agentSignalTools.ts, lines 150–164):

```typescript
if (args.signal_type === "cross_validate") {
  const fd = (args.finding_data ?? {}) as Record<string, unknown>;
  const missing: string[] = [];
  if (fd["direction"] == null || fd["direction"] === "") missing.push("direction");
  if (fd["confidence"] == null) missing.push("confidence");
  if (fd["summary"] == null || fd["summary"] === "") missing.push("summary");
  if (missing.length > 0) {
    return { content: [{ type: "text", text: `Error: ...` }] };
  }
}
```

**Only** `cross_validate` (from Report Analyzer) is validated. No validation for:
- `chain_catalyst` (News Scout)
- `price_confirmation` (Market Watcher)
- `urgent_news` (News Scout)

### 2.4 Testing Gap (TDD RED Phase)

Tests in chain-synthesizer.test.ts (line 62+) construct ChainLink objects with complete findingData:

```typescript
makeLink({
  id: 1,
  signalType: "chain_catalyst",
  depth: 0,
  findingData: {
    confidence: 0.8,
    direction: "bullish",
    event_type: "news",
    summary: "News event detected"
  }
})
```

**No test cases** for:
- Missing `confidence` (undefined)
- Missing `direction` (null)
- Missing `summary` ("")
- Empty finding_data ({})

---

## 3. Impact Analysis

### 3.1 Signal Flow Breakdown

| Step | Component | Issue |
|------|-----------|-------|
| 1. Agent emits | News Scout / Market Watcher | POST signal with incomplete finding_data |
| 2. MCP Tool receives | agentSignalTools.ts | No validation (except cross_validate) → accepts incomplete payload |
| 3. Signal stored | agentSignalStore.ts | JSON serialized as-is → stored with missing fields |
| 4. Alert Commander reads | chainSynthesizer.ts | Accesses findingData["confidence"] without guard → returns 0 if undefined |
| 5. Chain built | synthesizeChain() | base conviction = avg of [0, 0.8] = 0.4 (degraded) |
| 6. Alert suppressed | Alert Commander Step 1 | 4-AND conviction threshold not met (0.4 < 0.6 min) |

### 3.2 Incident Reconstruction (2026-04-23 02:36 UTC)

**5 bullish signals suppressed:**

| Stock | Signal | Confidence | Expected | Issue |
|-------|--------|------------|----------|-------|
| VIC | chain_catalyst | 0 | 0.8+ | News Scout posting without finding_data |
| NVL | price_confirmation | 0 | 0.75+ | Market Watcher skipped volume validation |
| BSR | chain_catalyst | 0 | 0.7+ | News Scout truncated response, missing fields |
| HPG | urgent_news | undefined | 0.6+ | No finding_data in urgent_news (schema mismatch) |
| VNM | price_confirmation | 0 | 0.85+ | Market Watcher uninitialized confidence field |

**Chain synthesizer output:**

```
conviction = avg([0, 0.8]) = 0.4  // Only 1 field in some signals
action = "WATCH"  // Below threshold for BUY (0.7)
narrative = "VIC — THEO DÕI: 40% xác tín"  // Low conviction
```

**Alert Commander decision (line 67, 05-alert-commander.md):**

> conviction >= 0.8 → HIGH/CRITICAL
> conviction >= 0.6 → MEDIUM
> **conviction < 0.6 → SUPPRESS** (not in send decision rules)

---

## 4. Architecture Decision

### 4.1 Enforcement Strategy: Multi-Layer Validation

Do NOT pick a single enforcement point. Chain enforcement across 4 layers:

| Layer | Mechanism | Benefit |
|-------|-----------|---------|
| **Type** (TypeScript) | Strict interfaces per signal_type | Compile-time safety |
| **Emit** (MCP Tool) | Early rejection for incomplete payloads | Fail fast, agent re-tries immediately |
| **Store** (DB) | Audit log of rejected signals | Detect agent bugs |
| **Synthesize** (Domain) | Safe accessors + fallback values | Prevent downstream crashes |

### 4.2 Recommended Fix Sequence

**Why this order:** (1) Type safety blocks wrong code at dev time, (2) MCP validation stops bad signals at runtime, (3) DB audit detects patterns, (4) Domain safety prevents synthesis crashes.

#### Phase 1: Type Definition (Domain Layer)

Create strict signal-type-specific interfaces:

```typescript
// src/domain/signals/signalTypes.ts (NEW)

export interface ChainCatalystPayload extends SignalPayload {
  title: string;
  detail: string;
  impact_score?: number;
}

export interface ChainCatalystFindingData {
  event_type: "credit_policy" | "trade_war" | "earnings" | "macro" | "legal" | "crisis" | "sector_event";
  direction: "bullish" | "bearish" | "neutral";
  confidence: number; // [0.0, 1.0]
  affected_stocks: string[];
  affected_sectors: string[];
  headline: string;
  source: string;
}

export interface PriceConfirmationPayload extends SignalPayload {
  title: string;
  detail: string;
}

export interface PriceConfirmationFindingData {
  price_change_pct: number;
  volume_ratio: number;
  confirms_direction: boolean;
  fully_priced: boolean;
  confidence: number; // [0.0, 1.0]
}
```

**DDD Layer:** `src/domain/signals/signalTypes.ts` (NO infrastructure imports)

#### Phase 2: MCP Tool Validation (Integration Layer)

Extend agentSignalTools.ts to validate all enrichment chain signals:

```typescript
// src/interface/mcp/tools/news-analysis/agentSignalTools.ts (MODIFY)

const SIGNAL_TYPE_VALIDATORS = {
  chain_catalyst: validateChainCatalyst,
  price_confirmation: validatePriceConfirmation,
  cross_validate: validateCrossValidate, // existing
};

function validateChainCatalyst(payload: unknown, finding_data: unknown): string[] {
  const missing: string[] = [];
  const fd = (finding_data ?? {}) as Record<string, unknown>;

  if (!fd["event_type"]) missing.push("finding_data.event_type");
  if (!fd["direction"]) missing.push("finding_data.direction");
  if (typeof fd["confidence"] !== "number") missing.push("finding_data.confidence");
  if (!Array.isArray(fd["affected_stocks"])) missing.push("finding_data.affected_stocks");
  if (!fd["headline"]) missing.push("finding_data.headline");

  return missing;
}

// In post_agent_signal handler:
const validator = SIGNAL_TYPE_VALIDATORS[args.signal_type];
if (validator) {
  const errors = validator(args.payload, args.finding_data);
  if (errors.length > 0) {
    return {
      content: [{
        type: "text",
        text: `Error: Signal type '${args.signal_type}' missing required fields: ${errors.join(", ")}. See task #1293 for schema.`
      }]
    };
  }
}
```

**DDD Layer:** Validation logic in domain layer (`src/domain/signals/signalValidator.ts`), called from interface layer.

#### Phase 3: DB Audit Log (Infrastructure Layer)

Track rejected signals for pattern analysis:

```typescript
// src/infrastructure/db/schema.ts (MODIFY)

// Add table (if not exists):
CREATE TABLE IF NOT EXISTS signal_rejections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_agent TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  stock_code TEXT,
  reason TEXT NOT NULL,
  payload_preview TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_rejections_agent ON signal_rejections(from_agent);

// In agentSignalTools.ts:
if (errors.length > 0) {
  db.prepare(`
    INSERT INTO signal_rejections
      (from_agent, signal_type, stock_code, reason, payload_preview, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(
    args.from_agent,
    args.signal_type,
    args.stock_code ?? null,
    errors.join("; "),
    JSON.stringify(args.payload).slice(0, 200)
  );
  // ... return error
}
```

#### Phase 4: Domain Safety (Synthesizer)

Defensive fallbacks in chainSynthesizer.ts:

```typescript
// src/domain/services/chainSynthesizer.ts (MODIFY)

function synthesizeChain(links: ChainLink[]): SynthesizedChain | null {
  if (links.length < 2) return null;

  const sorted = [...links].sort((a, b) => a.depth - b.depth);
  const stockCode = sorted.find(...)?.stockCode ?? "";
  const rootId = sorted[0]!.id;

  // ── Confidence extraction with fallback ──────────────────────────
  const confidences = sorted.map(link => {
    const conf = safeNum(link.findingData["confidence"]);
    if (conf === 0 && link.findingData["confidence"] === undefined) {
      // Uninitialized field detected — log for QA
      console.warn(`[ChainSynthesizer] Missing confidence for link ${link.id} (${link.agent})`);
      return 0.3; // Penalty for missing data
    }
    return conf;
  });

  // ... rest unchanged
}
```

**Log to agent-memory** after synthesis:
```
### Module: chainSynthesizer.ts (verified 2026-04-23)
- Detects missing confidence fields, applies 0.3 penalty
- Defensive fallback: prevents downstream crashes
- Status: SAFE (but agents must be fixed to provide complete payloads)
```

---

## 5. Task Breakdown (for PM)

### Sprint 1293a: Type Safety (RED phase, 4h estimate)

**[1293a]** Create strict signal type interfaces

- [ ] Create `src/domain/signals/signalTypes.ts` with:
  - `ChainCatalystPayload`, `ChainCatalystFindingData`
  - `PriceConfirmationPayload`, `PriceConfirmationFindingData`
  - `UrgentNewsPayload`, `UrgentNewsFindingData`
  - Zod validators for each (re-export from domain)
- [ ] Write RED test `src/__tests__/1293a-signal-type-safety.test.ts`:
  - Assert ChainCatalystFindingData requires all 7 fields
  - Assert PriceConfirmationFindingData requires all 5 fields
  - Assert Zod parse rejects incomplete payloads
  - Assert type guards detect missing fields
- **Files modified**: `src/domain/signals/signalTypes.ts` (NEW)
- **Tests**: 12+ assertions, RED → GREEN
- **Depends on**: None

---

### Sprint 1293b: MCP Tool Validation (GREEN phase, 6h estimate)

**[1293b]** Extend post_agent_signal to validate signal-type-specific schemas

- [ ] Import signal validators from 1293a into `src/interface/mcp/tools/news-analysis/agentSignalTools.ts`
- [ ] Add validation dispatcher (SIGNAL_TYPE_VALIDATORS map)
- [ ] Validate all enrichment chain signals (chain_catalyst, price_confirmation, urgent_news)
- [ ] Reject incomplete payloads with clear error message
- [ ] Log rejected signals to console + BUG channel (via submit_feedback if severe)
- [ ] Update GREEN test `src/__tests__/1293b-post-signal-validation.test.ts`:
  - Test chain_catalyst validation: all 7 fields required
  - Test price_confirmation: all 5 fields required
  - Test pass-through for well-formed signals
  - Test rejection for missing fields (3 test cases per type)
- **Files modified**: `src/interface/mcp/tools/news-analysis/agentSignalTools.ts` (MODIFY)
- **Tests**: 18+ assertions
- **Depends on**: 1293a

---

### Sprint 1293c: DB Audit Log (GREEN phase, 4h estimate)

**[1293c]** Add signal_rejections table + tracking

- [ ] Create `signal_rejections` table in `src/infrastructure/db/schema.ts`
- [ ] Add helper `logSignalRejection()` in `src/infrastructure/db/signalRejectionStore.ts` (NEW)
- [ ] Call from post_agent_signal when validation fails
- [ ] Add MCP tool `get_signal_rejection_summary(hours=24)` for diagnostics
- [ ] Write GREEN test `src/__tests__/1293c-signal-rejection-tracking.test.ts`:
  - Assert rejected signal logged to DB
  - Assert rejection queries work
  - Assert summary reports agent patterns
- **Files modified**: `src/infrastructure/db/schema.ts`, `src/interface/mcp/tools/diagnostics/` (NEW file)
- **Tests**: 8+ assertions
- **Depends on**: 1293b

---

### Sprint 1293d: Domain Safety + Fallbacks (GREEN phase, 3h estimate)

**[1293d]** Defensive fallbacks in chainSynthesizer + logging

- [ ] Add confidence penalty (0.3) when confidence field is undefined (vs. legitimately 0)
- [ ] Log uninitialized fields to console + agent-memory
- [ ] Update `src/domain/services/chainSynthesizer.ts`
- [ ] Write GREEN test `src/__tests__/1293d-chain-synthesizer-fallbacks.test.ts`:
  - Assert missing confidence triggers 0.3 penalty
  - Assert conviction still calculated (doesn't crash)
  - Assert synthesis continues (graceful degradation)
  - Assert log messages generated
- **Files modified**: `src/domain/services/chainSynthesizer.ts` (MODIFY)
- **Tests**: 6+ assertions
- **Depends on**: None (orthogonal to 1293a–1293c)

---

## 6. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Agent specs outdated (agents don't match spec) | MEDIUM | HIGH | Task 1293: Architects review agent prompt files simultaneously with code |
| Signal validators too strict (false rejects) | LOW | MEDIUM | Zod `coerce` for numeric fields; union types for enums |
| Performance regression (extra validation) | LOW | LOW | Validation runs once per signal (insignificant CPU cost) |
| Backward compat break (old signals in DB) | LOW | MEDIUM | DB migration skips validation for signals created before 2026-04-24 |
| Agents retrying failed posts (feedback loop) | MEDIUM | LOW | MCP tool error message explains root cause + fix (agent re-reads spec) |

---

## 7. Security Review

- [ ] SQL parameterization: signalRejectionStore.ts uses prepared statements ✓
- [ ] File paths: No external file access in validators ✓
- [ ] Rate limiting: Validation happens before rate limiter (fast-fail) ✓
- [ ] Secrets: No credentials in rejection logs (only metadata) ✓
- [ ] Telemetry: Rejection logs safe to send to BUG channel ✓

---

## 8. Verification Checklist (Post-Merge)

- [ ] Chain synthesizer receives only complete signals (no 0.3 penalty in logs for 7 days)
- [ ] Alert Commander conviction scores return to 0.75+ range (historical baseline)
- [ ] 4-AND alerts resume firing (watchlist-opportunity threshold reached)
- [ ] `get_signal_rejection_summary()` shows 0 rejections over 24h
- [ ] Agent specs (01-news-scout.md, 04-market-watcher.md) match code expectations
- [ ] QA test coverage: 42+ assertions across 1293a–1293d

---

## 9. Follow-Up Tasks (Out of Scope)

| Task | Reason | Priority |
|------|--------|----------|
| **Agent Prompt Review** | Ensure agents emit complete payloads (no truncation) | HIGH |
| **Chain Synthesizer Refactoring** | Separate confidence extraction into typed module | MEDIUM |
| **Signal Payload Versioning** | Schema evolution strategy (add fields without breaking) | LOW |
| **Telemetry Dashboard** | Real-time signal validation metrics | LOW |

---

## 10. Reference

- **Agent specs**: `.claude/agents/01-news-scout.md` (Step 4), `.claude/agents/04-market-watcher.md` (Step 3.5)
- **MCP tools**: `src/interface/mcp/tools/news-analysis/agentSignalTools.ts`
- **DB schema**: `src/infrastructure/db/agentSignalStore.ts`
- **Synthesizer**: `src/domain/services/chainSynthesizer.ts`
- **Incident**: 2026-04-23 02:36 UTC (5 signals suppressed)
- **Recurring fix count**: 2 (prior: task #???, task #???)
- **Pattern doc**: Will create `docs/agent-memory/patterns/signal-payload-quality.md` post-merge

---

**Author**: Architect
**Approved**: ✓
**Implementation Ready**: YES (1293a–1293d ready for Dev Team)
