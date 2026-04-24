# TECH-228: fix(foreign-flow): root-cause parse errors + add defensive validation

**status:** DRAFT
**req_ref:** REQ-228
**sprint:** 228

---

## Brownfield Impact

**Files modified:**
- `src/interface/mcp/server.ts` (line 677–735: JSON.parse error context + truncation detection)
- `src/infrastructure/db/vpsPushLogStore.ts` (extend VpsPushLogEntry + logVpsPush signature)
- `src/infrastructure/db/schema-system.ts` (extend vps_push_log table schema)

**Files created:**
- `src/domain/services/market-data/foreignFlowValidator.ts` (strict schema validation service)
- `src/__tests__/1566-foreign-flow-parse-hardening.test.ts` (TDD RED: 5 failing assertions)

**Files unchanged (integration points only):**
- `src/infrastructure/circuitBreakerRegistry.ts` (reuse existing `foreignFlow` breaker or create new one)
- `src/infrastructure/db/vnstockStore.ts` (upsertForeignFlow; no interface change needed)

**Breaking changes:** None — VPS push endpoint signature remains 100% compatible with current `fetch-foreign-flow.sh` payload format.

---

## Architecture Decision

SPRINT-228 hardens the foreign flow pipeline against recurring parse errors (784 errors/24h, 3740 total in sprint 214–227). The root cause is a three-layer problem:

1. **Input validation gap** — JSON.parse() fails silently on truncated payloads (e.g., network timeouts mid-transmission). Error messages hide actual issue (position, truncation vs. malformed).
2. **Schema validation gap** — Items with missing mandatory fields (code, date) are coerced to empty/zero instead of rejected with item index + field name for VPS debugging.
3. **Observable logging gap** — vps_push_log table lacks structured fields to track truncation, schema errors, and retry state. Observability is limited to binary ok/error.

**Design strategy:**
- **Layer 1 (domain):** Introduce `foreignFlowValidator.ts` — pure type guards + coercion logic. Distinguish mandatory fields (code, date) from coercible fields (numeric, default to 0). Return detailed error list with item indices and field names.
- **Layer 2 (interface):** Enhance server.ts POST handler — detect truncation before JSON.parse (body size + last char check), add explicit error context after parse failure (JSON.SyntaxError position), call validator after successful parse, log all errors with circuit breaker state.
- **Layer 3 (infrastructure):** Extend vps_push_log schema to capture `truncation_detected`, `schema_errors_count`, `failed_item_indices`, parse/validation/db timing, and circuit breaker state. Support async logging to avoid blocking upsert.
- **Layer 4 (circuit breaker):** Reuse existing `circuitBreaker` infrastructure. Register or create a dedicated `foreignFlow` breaker with 5-error threshold and 30s reset timeout (per REQ-228 FR-3). Track state in logs.

This design separates concerns cleanly: domain logic is pure and zero-IO, interface layer orchestrates HTTP + CB, infrastructure persists metrics.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify | Responsibility |
|---|---|---|---|---|
| ForeignFlowValidator | domain | `src/domain/services/market-data/foreignFlowValidator.ts` | NEW | Type guards + coercion. Pure logic, zero I/O. |
| POST /api/push-foreign-flow handler | interface | `src/interface/mcp/server.ts:677–735` | MODIFY | HTTP context, truncation detection, CB integration, error orchestration. |
| foreignFlow circuit breaker | infrastructure | `src/infrastructure/circuitBreakerRegistry.ts` | MODIFY (add breaker) | Rate limit / circuit state for foreign-flow push endpoint. |
| vps_push_log schema extension | infrastructure | `src/infrastructure/db/schema-system.ts` | MODIFY | Add columns: `truncation_detected`, `schema_errors_count`, `failed_item_indices`, `parse_time_ms`, `validation_time_ms`, `db_time_ms`, `circuit_breaker_state`. |
| VpsPushLogEntry + logVpsPush | infrastructure | `src/infrastructure/db/vpsPushLogStore.ts` | MODIFY | Extend interface + function signature to accept new fields. |
| Validator tests (RED) | test-only | `src/__tests__/1566-foreign-flow-parse-hardening.test.ts` | NEW | 5 assertions: malformed JSON, truncation, schema mismatch, retry, idempotence. |

---

## Interface Contracts

### New domain service: ForeignFlowValidator

```typescript
// src/domain/services/market-data/foreignFlowValidator.ts

/** Validation error for a single item in a batch */
export interface ValidationError {
  itemIndex: number;
  field: string;
  reason: string;
  originalValue: unknown;
}

/** Result of batch validation */
export interface ValidationResult {
  valid: ForeignFlowUpsertItem[];
  errors: ValidationError[];
}

/**
 * Type guard: is obj a structurally valid ForeignFlowUpsertItem?
 * Checks mandatory fields (code: string; date: YYYY-MM-DD string) are present.
 * Does NOT coerce — used for early rejection.
 */
export function isForeignFlowUpsertItem(obj: unknown): obj is ForeignFlowUpsertItem;

/**
 * Validate and coerce a batch of raw items from VPS payload.
 *
 * @param items - Array of unknown objects (JSON-parsed payload)
 * @returns { valid, errors } — valid items are coerced and ready to upsert;
 *          errors list details all validation failures (mandatory field missing, unparseable number, etc.)
 *
 * Business rules:
 * - Mandatory: `code` (string, non-empty), `date` (YYYY-MM-DD or absent → today UTC)
 * - Coercible: `foreign_volume`, `foreign_room`, `holding_ratio`, `fetched_at` (numeric, default 0/null on error)
 * - If coercible field is string/"123", parse to number; if unparseable (e.g., "abc"), set to 0 and log warning in error list.
 * - If `holding_ratio` > 1.0 after coercion, flag as invalid (will be normalized in upsertForeignFlow, but validator detects anomaly).
 */
export function validateForeignFlowPayload(items: unknown[]): ValidationResult;

/**
 * Coerce numeric field: parse string/"123" to number, detect NaN/Infinity.
 *
 * @returns { value, error? } — if parseable, value is number + error is undefined;
 *          if unparseable, value is 0 + error describes the issue.
 */
export function coerceNumericField(
  value: unknown,
  fieldName: string,
): { value: number; error?: string };
```

### Enhanced server.ts POST handler

```typescript
// src/interface/mcp/server.ts:677–735 (POST /api/push-foreign-flow)

// Pseudo-code logic (not full implementation):

const startTime = Date.now();
const parseStartTime = Date.now();

// FR-1: Truncation detection guard
if (body.length >= MAX_PAYLOAD_SIZE && !body.endsWith(']')) {
  logVpsPush({
    service: "foreign-flow",
    itemsCount: 0,
    status: "error",
    errorMsg: "Payload appears truncated...",
    truncation_detected: true,
    vps_response_size_bytes: body.length,
  });
  return res.writeHead(400), res.end(JSON.stringify({ error: "Payload appears truncated" }));
}

let rawItems: unknown[];
try {
  rawItems = JSON.parse(body);
} catch (parseErr) {
  const position = (parseErr as any).offset ?? -1;
  logVpsPush({
    service: "foreign-flow",
    itemsCount: 0,
    status: "error",
    errorMsg: `Invalid JSON at position ${position}`,
    parse_time_ms: Date.now() - parseStartTime,
  });
  return res.writeHead(400), res.end(JSON.stringify({ error: "Invalid JSON at position X" }));
}

// FR-2: Schema validation
const validationStartTime = Date.now();
const { valid, errors } = validateForeignFlowPayload(rawItems);

if (errors.length > 0) {
  const errorSummary = errors.map(e => `Item ${e.itemIndex}: ${e.field}`).join("; ");
  logVpsPush({
    service: "foreign-flow",
    itemsCount: 0,
    status: "error",
    errorMsg: errorSummary,
    schema_errors_count: errors.length,
    failed_item_indices: errors.map(e => e.itemIndex),
    validation_time_ms: Date.now() - validationStartTime,
  });
  return res.writeHead(400), res.end(JSON.stringify({ error: `Item X: missing required field 'Y'` }));
}

// FR-3: Circuit breaker check
const breaker = breakers.foreignFlow;
if (breaker.state === "open") {
  logVpsPush({
    service: "foreign-flow",
    itemsCount: 0,
    status: "error",
    circuit_breaker_state: "open",
  });
  return res.writeHead(503), res.end(JSON.stringify({ error: "Service temporarily unavailable" }));
}

// Upsert + timing
const dbStartTime = Date.now();
try {
  const upserted = upsertForeignFlow(valid);
  breaker.recordSuccess();
  logVpsPush({
    service: "foreign-flow",
    itemsCount: upserted,
    status: "ok",
    parse_time_ms: Date.now() - parseStartTime,
    validation_time_ms: Date.now() - validationStartTime,
    db_time_ms: Date.now() - dbStartTime,
    circuit_breaker_state: "closed",
  });
  return res.writeHead(200), res.end(JSON.stringify({ ok: true, upserted }));
} catch (dbErr) {
  breaker.recordFailure();
  logVpsPush({
    service: "foreign-flow",
    itemsCount: 0,
    status: "error",
    errorMsg: dbErr instanceof Error ? dbErr.message : String(dbErr),
    db_time_ms: Date.now() - dbStartTime,
    circuit_breaker_state: breaker.state,
  });
  // If circuit breaker opened, return 503 on next attempt
  return res.writeHead(500), res.end(JSON.stringify({ error: "Database error" }));
}
```

### Extended vps_push_log table schema

```sql
-- src/infrastructure/db/schema-system.ts

ALTER TABLE vps_push_log ADD COLUMN IF NOT EXISTS truncation_detected INTEGER DEFAULT 0;
ALTER TABLE vps_push_log ADD COLUMN IF NOT EXISTS schema_errors_count INTEGER DEFAULT 0;
ALTER TABLE vps_push_log ADD COLUMN IF NOT EXISTS failed_item_indices TEXT;  -- JSON array ["0", "2"]
ALTER TABLE vps_push_log ADD COLUMN IF NOT EXISTS parse_time_ms INTEGER;
ALTER TABLE vps_push_log ADD COLUMN IF NOT EXISTS validation_time_ms INTEGER;
ALTER TABLE vps_push_log ADD COLUMN IF NOT EXISTS db_time_ms INTEGER;
ALTER TABLE vps_push_log ADD COLUMN IF NOT EXISTS vps_response_size_bytes INTEGER;
ALTER TABLE vps_push_log ADD COLUMN IF NOT EXISTS circuit_breaker_state TEXT;  -- "open", "closed", "half-open"
```

### Extended VpsPushLogEntry interface

```typescript
// src/infrastructure/db/vpsPushLogStore.ts

export interface VpsPushLogEntry {
  service: VpsService;
  itemsCount: number;
  status: "ok" | "error";
  errorMsg?: string;
  durationMs?: number;
  // ─ NEW fields (FR-4) ─
  truncation_detected?: boolean;
  schema_errors_count?: number;
  failed_item_indices?: number[];
  parse_time_ms?: number;
  validation_time_ms?: number;
  db_time_ms?: number;
  vps_response_size_bytes?: number;
  circuit_breaker_state?: "open" | "closed" | "half-open";
}

export function logVpsPush(entry: VpsPushLogEntry, db?: Database): void {
  const d = db ?? getDb();
  d.prepare(
    `INSERT INTO vps_push_log (
       service, items_count, status, error_msg, duration_ms,
       truncation_detected, schema_errors_count, failed_item_indices,
       parse_time_ms, validation_time_ms, db_time_ms,
       vps_response_size_bytes, circuit_breaker_state
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.service,
    entry.itemsCount,
    entry.status,
    entry.errorMsg ?? null,
    entry.durationMs ?? null,
    entry.truncation_detected ? 1 : 0,
    entry.schema_errors_count ?? null,
    entry.failed_item_indices ? JSON.stringify(entry.failed_item_indices) : null,
    entry.parse_time_ms ?? null,
    entry.validation_time_ms ?? null,
    entry.db_time_ms ?? null,
    entry.vps_response_size_bytes ?? null,
    entry.circuit_breaker_state ?? null,
  );
}
```

### Circuit breaker registry update

```typescript
// src/infrastructure/circuitBreakerRegistry.ts

export const breakers = {
  // ... existing breakers ...
  foreignFlow: new CircuitBreaker("foreignFlow", {
    failureThreshold: 5,
    resetTimeoutMs: 30_000, // 30 seconds per FR-3
  }),
} as const;
```

---

## Error Taxonomy

Design a discriminated union `ForeignFlowPushError` to tag error types:

```typescript
export type ForeignFlowPushError =
  | { tag: "truncation"; reason: string; lastChar: string; bodySize: number }
  | { tag: "malformed_json"; position: number; cause: string }
  | { tag: "schema_validation"; itemIndex: number; field: string; reason: string }
  | { tag: "database"; constraint?: string }
  | { tag: "circuit_breaker_open" };
```

Use this in tests to assert on specific error types rather than string matching.

---

## Task Breakdown (for PM)

Suggested atomic tasks in dependency order:

| ID | Title | Dependencies | Estimate |
|---|---|---|---|
| 1566a | [Dev] TDD RED — `1566-foreign-flow-parse-hardening.test.ts` with 5 failing assertions | None | 2h |
| 1566b | [Dev] Domain: `foreignFlowValidator.ts` — type guards + coercion logic + validation result | None (parallel) | 2h |
| 1566c | [Dev] Interface: Extend server.ts POST handler (FR-1 truncation + error context) | 1566b | 1.5h |
| 1566d | [Dev] Infrastructure: Extend vps_push_log schema + logVpsPush signature | None (parallel) | 1h |
| 1566e | [Dev] Infrastructure: Add `foreignFlow` circuit breaker to registry | None (parallel) | 0.5h |
| 1566f | [Dev] Interface: Integrate CB + retry logic into POST handler (FR-3) | 1566c, 1566e | 1.5h |
| 1566g | [Dev] GREEN — all tests pass, ensure no regressions in 1131–1134 | 1566a–f | 1h |
| 1568 | [QA] Verify: parse errors <10/day, test suite green, signal latency ≤2s, no truncation in logs | All dev tasks | 2h |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Backward compatibility break with VPS script | Low | High | Verify POST endpoint signature unchanged. Test with current `fetch-foreign-flow.sh` payload format in acceptance tests. |
| Truncation detection false positives (valid large payloads rejected) | Medium | High | Set MAX_PAYLOAD_SIZE to 1 MB (typical payload ~10–50 KB). Add test case with valid large payload. |
| Circuit breaker is too aggressive (false-open due to network flake) | Medium | Medium | Use 5-error threshold + 30s reset (per REQ spec). Add test for half-open → closed transition. |
| Performance regression: validation latency adds delay | Low | Medium | Validate that coercion + type guards ≤50 ms for 100 items. Async logging does not block response. |
| Schema extension (ALTER TABLE) blocks production DB | Low | High | Use `ALTER TABLE IF NOT EXISTS` pattern. Schema extension is backward-compatible (optional fields). |
| Retry queue complexity (FR-3 mentions retry, but scope unclear) | Medium | Low | Current design is in-memory only (no persistence). If server restarts, retry is lost — acceptable per requirements. |

---

## Security Review

- **SQL parameter binding:** logVpsPush uses parameterized INSERT (all fields passed as `?`). ✓
- **File paths:** No file I/O in foreign flow handler. ✓
- **External HTTP:** POST /api/push-foreign-flow is inbound HTTP from VPS (internal network only, no user input). Circuit breaker protects against cascading failures. ✓
- **Secrets:** API key validation (VPS_PUSH_API_KEY) is responsibility of HTTP auth middleware (already in place). ✓
- **Input size limits:** MAX_PAYLOAD_SIZE check (FR-1) prevents unbounded JSON parse attempts. ✓
- **Type safety:** TypeScript strict mode enforced; type guards reject `unknown` without narrowing. ✓

---

## Testing Strategy

**TDD approach:**
1. Write `src/__tests__/1566-foreign-flow-parse-hardening.test.ts` with 5 RED assertions (all fail initially).
2. Implement `foreignFlowValidator.ts` (domain pure logic) — assertions 1–3 should pass (schema validation).
3. Implement server.ts POST handler enhancements (truncation, CB) — assertions 4–5 should pass (retry, idempotence).
4. Verify no regressions in existing tests (1131–1134).

**Test harness:**
- Use in-memory SQLite + Bun's built-in HTTP test utilities (no mock framework needed).
- Mock circuit breaker state transitions (no live network needed).
- Parametrize truncation detection tests with edge cases: body size at boundary, last char variations.

**Acceptance test payload templates:**
```typescript
// Malformed JSON
'[{code:"VNM",...'

// Truncated (no closing bracket)
'[{code:"VNM",...},{code:"VCB",...'

// Schema mismatch (missing code in item 1)
'[{code:"VNM",...}, {foreignBuyVol: 1000}, {code:"VCB",...}]'

// Large valid payload
const largePayload = Array.from({ length: 100 }, (_, i) => ({
  code: `STOCK${i}`,
  foreignBuyVol: 1000 + i,
  foreignSellVol: 500 + i,
  foreignRoom: 50000 + i,
}));
```

---

## Logging & Observability

**Log events:**
1. **On truncation detected:** `[push-foreign-flow] truncation detected: body size 102400 (at max), last char: '{'`
2. **On JSON parse error:** `[push-foreign-flow] invalid JSON at position 512: unexpected token ']'`
3. **On schema validation error:** `[push-foreign-flow] schema validation failed: Item 2 missing required field 'code', Item 5 unparseable foreignBuyVol 'abc'`
4. **On circuit breaker state change:** `[push-foreign-flow] circuit breaker transitioned: closed → open (5 failures in 60s)`
5. **On success:** `[push-foreign-flow] upserted 42 items in 87ms (parse 5ms, validation 12ms, db 70ms)`

**Metrics (vps_push_log):**
- Parse latency (ms) — detect parsing bottleneck.
- Validation latency (ms) — detect schema complexity.
- Database latency (ms) — detect write contention.
- Truncation count — monitor VPS timeout frequency.
- Circuit breaker state — track service health.

---

## Notes for Developer

1. **Validator implementation:** Pure functions, zero I/O. Use explicit type guards (e.g., `typeof x === "number"`). No database calls. This keeps domain logic testable without DB setup.

2. **Server.ts integration:** The POST handler is the orchestration layer. It calls:
   - Truncation check (sync)
   - JSON.parse (sync)
   - validateForeignFlowPayload (sync)
   - Circuit breaker check (sync)
   - upsertForeignFlow (sync, DB)
   - logVpsPush (sync, DB write — consider async if performance target is missed)

   Keep all error paths calling logVpsPush before returning response.

3. **Backward compatibility:** Current handler normalizes VPS payload (camelCase → snake_case). Validator receives raw JSON after parse; normalization happens in the same map() logic that currently exists (lines 692–705). Validator must work on raw shape first, then normalization applies.

4. **Testing foreign-flow validator without DB:** Inject a mock `upsertForeignFlow` in tests. Validator itself is pure and DB-free.

5. **VPS script audit (Task 228c):** After implementation, connect to Vinahost VPS and capture:
   ```bash
   ssh root@$VINAHOST_IP tail -100 /var/log/vn-foreign-flow.log
   ssh root@$VINAHOST_IP systemctl status vn-foreign-flow.service
   ```
   Look for evidence of truncation (incomplete payloads, timeout markers, curl errors). Typical payload size should be 5–50 KB for 30 items.

---

## References

- REQ-228 (this sprint requirement spec)
- Prior fixes: sprint 214 (TASK-1491), sprint 215 (TASK-1491 followup)
- VPS script: `vps-scripts/fetch-foreign-flow.sh` (lines 80–113)
- Current server handler: `src/interface/mcp/server.ts` (lines 655–737)
- ForeignFlowUpsertItem type: `src/infrastructure/db/vnstockStore.ts:344–354`
- Circuit breaker: `src/infrastructure/circuitBreaker.ts` + `circuitBreakerRegistry.ts`
- Existing foreign flow tests: 1131, 1132, 1133, 1134, 1517, 1518
