# TECH-234: VPS Health Dashboard + Data Freshness SLA Enforcement

**status**: APPROVED_BY_ARCHITECT
**req_ref**: REQ-234
**sprint**: 234
**task_count**: 5 (234a–234e)

---

## Overview

VPS health polling (5-minute cadence, 5 endpoints) + data freshness SLA monitoring (30-minute cadence, 5 signal types) with escalation callbacks to Alert Commander. Two new scheduler jobs, two new domain services, two new MCP query tools, and schema extensions to track service health and SLA breaches.

**Key Design Decisions**:
1. **Health polling runs 24/7** (not market-hours-only) — geo-blocked services need continuous availability checks
2. **SLA checker tracks both breach and recovery** — allows Alert Commander to contextualize data quality trends
3. **Escalation via post_agent_signal()** — internal queueing mechanism, not immediate Telegram send (Commander owns user alerting)
4. **Circuit breaker wraps all HTTP calls** — prevents cascading timeouts on unreachable VPS
5. **Database-first observability** — all polls and breaches logged for audit trail and trend analysis

---

## Brownfield Impact

| Impact | Files |
|--------|-------|
| **New files** | `src/__tests__/234-vps-health-sla.test.ts`, `src/domain/services/freshnessSlaChecker.ts`, `src/domain/services/vpsHealthPoller.ts`, `src/scheduler/system/vpsServiceHealthJob.ts`, `src/scheduler/system/freshnessSlaMonitorJob.ts`, `src/interface/mcp/tools/system/vpsHealthTools.ts`, `src/interface/mcp/tools/system/slaStatusTools.ts` |
| **Modified files** | `src/infrastructure/db/schema-system.ts` (line ~370: add 2 tables), `src/scheduler/jobs.ts` (line ~430: register 2 jobs, add imports, add cron schedule entries) |
| **No breaking changes** — existing VPS proxy tables (`vps_push_log`) untouched; new tables isolated |

---

## Architecture Decision

**VPS service observability layer**: Decouple data quality monitoring (health checks) from pipeline monitoring (current watchdog). The existing `vpsProxyWatchdogJob` observes *price staleness* (data-layer symptom). SPRINT 234 adds *service-level health* (infra-layer root cause) + *SLA breach detection* (application-layer policy enforcement).

Flow:
- **5-min health poll** → `vpsServiceHealthJob` → `pollVpsServiceHealth()` → `vps_service_health` table → `get_vps_service_health()` MCP tool
- **30-min SLA check** → `freshnessSlaMonitorJob` → `checkDataFreshnessSla()` → `sla_breach_audit` table + escalation callback → `get_sla_status()` MCP tool

This stacking allows agents (02-financial-analyst, 04-market-watcher) to query health during fallback chain decisions and commanders to track SLA violations without user alerts bleeding into analysis agents.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify | Depends On |
|-----------|-------|-----------|------------|-----------|
| `vpsHealthPoller` | domain | `src/domain/services/vpsHealthPoller.ts` | NEW | `circuitBreakerRegistry`, `rateLimiter`, `mcp.config.json` |
| `freshnessSlaChecker` | domain | `src/domain/services/freshnessSlaChecker.ts` | NEW | `tradingWindowLabel()`, thresholds config |
| `vpsServiceHealthJob` | scheduler | `src/scheduler/system/vpsServiceHealthJob.ts` | NEW | `vpsHealthPoller`, `getDb()`, `recordJobRun` |
| `freshnessSlaMonitorJob` | scheduler | `src/scheduler/system/freshnessSlaMonitorJob.ts` | NEW | `freshnessSlaChecker`, `post_agent_signal()`, `getDb()`, `recordJobRun` |
| VPS health table | infrastructure | `src/infrastructure/db/schema-system.ts:370` | NEW | — |
| SLA breach audit table | infrastructure | `src/infrastructure/db/schema-system.ts:~400` | NEW | — |
| `get_vps_service_health()` tool | interface | `src/interface/mcp/tools/system/vpsHealthTools.ts` | NEW | `vps_service_health` table query |
| `get_sla_status()` tool | interface | `src/interface/mcp/tools/system/slaStatusTools.ts` | NEW | `sla_breach_audit` table query |
| Job registration | scheduler | `src/scheduler/jobs.ts` | MODIFY | import + cron schedule + `startScheduler()` calls |

---

## Data Flow

```
┌──────────────────────┐
│  vpsServiceHealthJob │  every 5min
└──────────┬───────────┘
           │
           ├─> pollVpsServiceHealth()
           │   ├─> circuit breaker check (5 endpoints in parallel)
           │   ├─> GET http://$VINAHOST_IP:8001/health/* (5s timeout each)
           │   └─> parse JSON { status, lastRun, uptime, error }
           │
           └─> INSERT vps_service_health (service, health_status, response_time_ms, ...)
               └─> recordJobRun(db, 'vpsServiceHealthJob', ...)

┌──────────────────────────────┐
│  freshnessSlaMonitorJob       │  every 30min
└──────────┬────────────────────┘
           │
           ├─> checkDataFreshnessSla()
           │   ├─> for each signal type (price, bctc, news, sbv_fx, foreign_flow):
           │   │   ├─> query MAX(created_at) from source table
           │   │   ├─> compute age = NOW - created_at
           │   │   ├─> compare age vs SLA threshold (market-hours-aware for BCTC)
           │   │   └─> check 60-min escalation cooldown
           │   │
           │   └─> return { breaches: [...], recoveries: [...] }
           │
           ├─> for each breach: INSERT sla_breach_audit (breach_open, escalation_callback_sent=false)
           │   └─> call escalateToCommander(signal_type, age, threshold, severity)
           │       └─> post_agent_signal() to Alert Commander queue
           │       └─> UPDATE sla_breach_audit (escalation_callback_sent=true)
           │
           ├─> for each recovery: UPDATE sla_breach_audit (recovered, recovered_at=now)
           │
           └─> recordJobRun(db, 'freshnessSlaMonitorJob', ...)

┌────────────────────────────┐
│  Agent Query Layer         │
├────────────────────────────┤
│ get_vps_service_health()   │ → agents (02, 04, 06) query during analysis
│ get_sla_status()           │ → Alert Commander contextualizes escalations
└────────────────────────────┘
```

---

## Interface Contracts

### Domain Service: vpsHealthPoller

```typescript
// src/domain/services/vpsHealthPoller.ts

export interface VpsServiceConfig {
  name: string;                // 'vn-price-fetch', 'vn-bctc-fetch', etc.
  healthCheckUrl: string;      // http://$VINAHOST_IP:8001/health/prices
  timeoutMs: number;           // 5000
}

export interface VpsHealthResponse {
  status: 'ok' | 'error';
  lastRun?: string;            // ISO-8601 from VPS
  uptime?: number;             // seconds
  error?: string;              // when status='error'
}

export interface HealthPollResult {
  serviceName: string;
  polledAt: string;            // ISO-8601
  healthStatus: 'healthy' | 'unhealthy' | 'unreachable';
  responseTimeMs: number;
  lastSuccessfulRun?: string;  // from VPS payload
  uptimeSeconds?: number;
  errorMessage?: string;
}

/**
 * Poll all VPS services in parallel, record results.
 * Returns array of results (one per service, even if poll failed).
 * Never throws — wraps all errors into healthStatus='unreachable'.
 */
export async function pollVpsServiceHealth(): Promise<HealthPollResult[]>

/**
 * Single service poll with circuit breaker + timeout.
 * Exported for unit testing.
 */
export async function pollOneService(
  config: VpsServiceConfig,
): Promise<HealthPollResult>
```

### Domain Service: freshnessSlaChecker

```typescript
// src/domain/services/freshnessSlaChecker.ts

export interface SlaThreshold {
  signalType: 'price' | 'bctc' | 'news' | 'sbv_fx' | 'foreign_flow';
  thresholdMinutes: number;   // 10, 120, 30, 30, 10
  marketHoursThreshold?: number; // BCTC only: 120 (2h) during market hours
  overnightThreshold?: number;   // BCTC only: 360 (6h) overnight
}

export interface SlaCheckResult {
  signalType: string;
  ageMinutes: number;
  thresholdMinutes: number;
  status: 'ok' | 'breached';   // breached if age > threshold
  severity?: 'HIGH' | 'CRITICAL'; // if age > threshold × 1.5 → CRITICAL
  affectedSources?: string[];
}

/**
 * Check all 5 signal types for SLA violations.
 * Returns results for each type, with 60-min cooldown enforcement.
 * Never throws — logs errors to app console.
 */
export async function checkDataFreshnessSla(
  db: Database,
): Promise<{
  breaches: SlaCheckResult[];
  recoveries: SlaCheckResult[];
}>

/**
 * Compute active SLA threshold for BCTC (market-hours-aware).
 * Exported for testing.
 */
export function getBctcThreshold(nowVn: Date): number
```

### Scheduler Job: vpsServiceHealthJob

```typescript
// src/scheduler/system/vpsServiceHealthJob.ts

export type PollFn = () => Promise<HealthPollResult[]>;

/**
 * Main entry point. Called by cron every 5 minutes.
 * Stores results in vps_service_health table.
 *
 * @param pollFn - Injected for testing; defaults to pollVpsServiceHealth()
 */
export async function runVpsServiceHealthJob(
  pollFn?: PollFn,
): Promise<void>

/**
 * Store poll results in database.
 * Used internally; exported for testing.
 */
export async function storePollResults(
  db: Database,
  results: HealthPollResult[],
): Promise<void>
```

### Scheduler Job: freshnessSlaMonitorJob

```typescript
// src/scheduler/system/freshnessSlaMonitorJob.ts

export type CheckFn = (db: Database) => Promise<{
  breaches: SlaCheckResult[];
  recoveries: SlaCheckResult[];
}>;

export type EscalateFn = (
  signalType: string,
  ageMinutes: number,
  thresholdMinutes: number,
  severity: 'HIGH' | 'CRITICAL',
) => Promise<void>;

/**
 * Main entry point. Called by cron every 30 minutes.
 *
 * @param checkFn - Injected for testing; defaults to checkDataFreshnessSla()
 * @param escalateFn - Injected for testing; defaults to escalateToCommander()
 */
export async function runFreshnessSlaMonitorJob(
  checkFn?: CheckFn,
  escalateFn?: EscalateFn,
): Promise<void>

/**
 * Post escalation signal to Alert Commander queue.
 * Used internally; exported for testing.
 */
export async function escalateToCommander(
  signalType: string,
  ageMinutes: number,
  thresholdMinutes: number,
  severity: 'HIGH' | 'CRITICAL',
): Promise<void>
```

### MCP Tool: get_vps_service_health

```typescript
// src/interface/mcp/tools/system/vpsHealthTools.ts

server.tool(
  "get_vps_service_health",
  "Query VPS service health status (latest poll for each of 5 endpoints).",
  {
    service_name: z
      .enum(['all', 'vn-price-fetch', 'vn-bctc-fetch', 'vn-news-fetch', 'vn-sbv-fetch', 'vn-foreign-flow'])
      .optional()
      .default('all'),
  },
  async ({ service_name }) => {
    // Returns formatted table:
    // Service         | Status        | Last Poll      | Response(ms) | VPS Uptime
    // ────────────────|───────────────|────────────────|──────────────|──────────
    // vn-price-fetch  | healthy       | 2 min ago      | 142          | 25d 3h 20m
    // ...
  }
)
```

### MCP Tool: get_sla_status

```typescript
// src/interface/mcp/tools/system/slaStatusTools.ts

server.tool(
  "get_sla_status",
  "Query data freshness SLA status (current age vs threshold for each signal type).",
  {
    signal_type: z
      .enum(['all', 'price', 'bctc', 'news', 'sbv_fx', 'foreign_flow'])
      .optional()
      .default('all'),
  },
  async ({ signal_type }) => {
    // Returns formatted table:
    // Signal Type | Age (min) | SLA (min) | Status    | Severity
    // ────────────|-----------|-----------|-----------|──────────
    // price       | 8         | 10        | ok        | -
    // bctc        | 25        | 120       | ok        | -
    // news        | 32        | 30        | breached  | HIGH
    // ...
  }
)
```

---

## Test Strategy (TDD)

### RED Phase: `src/__tests__/234-vps-health-sla.test.ts` (12 assertions)

```typescript
describe('TECH-234 VPS Health & SLA', () => {
  // AC-1: VPS health polling
  test('pollVpsServiceHealth: all 5 services polled in parallel', async () => {
    // expect(results.length).toBe(5)
    // expect(results.every(r => ['healthy','unhealthy','unreachable'].includes(r.healthStatus))).toBe(true)
  })

  // AC-2: Schema creation
  test('initSystemTables: vps_service_health table exists with correct schema', async () => {
    // expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vps_service_health'").get()).toBeDefined()
    // expect(db.prepare("PRAGMA table_info(vps_service_health)").all()).toHaveLength(8) // id, service_name, polled_at, ...
  })

  // AC-3: SLA checker — price threshold
  test('checkDataFreshnessSla: price age > 10min → breached', async () => {
    // Setup: insert market_prices row with created_at 15min ago
    // expect(results.breaches.some(b => b.signalType === 'price')).toBe(true)
    // expect(results.breaches[0].severity).toBe('HIGH')
  })

  // AC-3: SLA checker — BCTC threshold (market hours)
  test('checkDataFreshnessSla: BCTC age > 2h during market hours → breached', async () => {
    // Inject market-hours clock
    // expect(results.breaches.some(b => b.signalType === 'bctc')).toBe(true)
  })

  // AC-4: SLA breach escalation callback
  test('freshnessSlaMonitorJob: breach detected → escalateToCommander called', async () => {
    // Mock escalateFn
    // expect(escalateFn).toHaveBeenCalledWith('price', expect.any(Number), 10, 'HIGH')
  })

  // AC-5: SLA recovery detection
  test('freshnessSlaMonitorJob: age returns to normal → sla_breach_audit updated to recovered', async () => {
    // Setup: insert old breach record
    // Update source age to be fresh
    // Run job
    // expect(db.prepare("SELECT * FROM sla_breach_audit WHERE status='recovered'").get()).toBeDefined()
  })

  // AC-6: Health poll tool returns latest results
  test('get_vps_service_health: returns formatted table with latest poll', async () => {
    // Call tool
    // expect(output).toMatch(/vn-price-fetch.*healthy/)
    // expect(output).toMatch(/Response\(ms\)/) // headers
  })

  // AC-7: SLA status tool returns age + threshold
  test('get_sla_status: returns table with age, threshold, status', async () => {
    // Call tool
    // expect(output).toMatch(/price.*10.*ok/)
  })

  // AC-8: No domain → infrastructure imports
  test('DDD: freshnessSlaChecker.ts has no infrastructure imports', async () => {
    // grep -L "from.*infrastructure" src/domain/services/freshnessSlaChecker.ts
  })

  // AC-9: Circuit breaker used
  test('vpsHealthPoller: HTTP call wrapped in circuit breaker', async () => {
    // Spy on circuitBreakerRegistry.getOrCreateBreaker()
    // expect(spy).toHaveBeenCalled()
  })

  // AC-9: Cooldown enforcement
  test('escalateToCommander: 60-min cooldown prevents duplicate escalations', async () => {
    // Call escalate at T=0
    // Call escalate at T=30min (same signal_type)
    // expect(escalations).toHaveLength(1) // second call should not escalate
  })

  // AC-9: Partial failure handling
  test('freshnessSlaMonitorJob: one source stale, others OK → escalate only breached type', async () => {
    // Make only news source stale
    // expect(escalations).toEqual([{ signalType: 'news', ... }])
  })
})
```

### GREEN Phase Implementation

1. **vpsHealthPoller** (domain service)
   - Import `mcp.config.json` via `loadMcpConfig()`
   - For each service in `vpsServices[]` array:
     - Get circuit breaker: `circuitBreakerRegistry.getOrCreateBreaker(serviceUrl)`
     - Fire GET request with 5s timeout; catch all errors (network, timeout, JSON parse)
     - Parse response JSON; extract `status`, `lastRun`, `uptime`
     - Return `HealthPollResult` with status mapped: HTTP 200 + `status: 'ok'` → `healthStatus: 'healthy'`; any error → `'unreachable'`

2. **freshnessSlaChecker** (domain service)
   - Query `MAX(created_at)` from each source table (market_prices, financial_reports, rag_analyses, macro_indicators, market_prices foreign_flow columns)
   - For BCTC: use `tradingWindowLabel()` helper to determine active SLA threshold (market hours = 120 min, overnight = 360 min)
   - Check cooldown: query last breach in `sla_breach_audit` with same signal_type; skip escalation if last breach < 60 min ago
   - Return breaches + recoveries

3. **vpsServiceHealthJob** (scheduler)
   - Import `pollVpsServiceHealth()`
   - Call and receive results array
   - Insert each result into `vps_service_health` table
   - Call `recordJobRun()` with status='success'

4. **freshnessSlaMonitorJob** (scheduler)
   - Call `checkDataFreshnessSla()` → breaches + recoveries
   - For each breach: insert `sla_breach_audit` row (status='breach_open'), call `escalateToCommander()`
   - For each recovery: update matching breach row (status='recovered')
   - Call `recordJobRun()` with status='success'

5. **escalateToCommander** (application logic, inline in job or separate file)
   - Build signal object: `{ type: 'sla_breach', signal_type, age, threshold, severity, timestamp }`
   - Call `post_agent_signal(signal)` → queues to 05-alert-commander input
   - Update `sla_breach_audit.escalation_callback_sent = true`

6. **MCP Tools**
   - `get_vps_service_health()`: query `SELECT * FROM vps_service_health ORDER BY polled_at DESC LIMIT 1 GROUP BY service_name`; format as ASCII table with relative timestamps + VPS uptime formatting
   - `get_sla_status()`: for each signal type, compute age from source tables + threshold from config; format as ASCII table

---

## Injection Points (Exact Line Numbers)

### schema-system.ts: Line ~370

Insert two new tables after scheduler_locks (line ~316):

```typescript
// ── VPS Service Health (TECH-234) ──────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS vps_service_health (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    service_name          TEXT NOT NULL,
    polled_at             TEXT NOT NULL DEFAULT (datetime('now')),
    health_status         TEXT NOT NULL CHECK(health_status IN ('healthy','unhealthy','unreachable')),
    response_time_ms      INTEGER,
    last_successful_run   TEXT,
    uptime_seconds        INTEGER,
    error_message         TEXT
  )
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_vps_health_service_ts
    ON vps_service_health(service_name, polled_at DESC)
`);

// ── SLA Breach Audit (TECH-234) ────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS sla_breach_audit (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    signal_type              TEXT NOT NULL CHECK(signal_type IN ('price','bctc','news','sbv_fx','foreign_flow')),
    threshold_minutes        INTEGER NOT NULL,
    actual_age_minutes       INTEGER NOT NULL,
    status                   TEXT NOT NULL DEFAULT 'breach_open' CHECK(status IN ('breach_open','escalated','recovered')),
    breached_at              TEXT NOT NULL DEFAULT (datetime('now')),
    recovered_at             TEXT,
    affected_sources         TEXT,
    escalation_callback_sent BOOLEAN NOT NULL DEFAULT 0
  )
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_sla_breach_signal_type
    ON sla_breach_audit(signal_type)
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_sla_breach_breached_at
    ON sla_breach_audit(breached_at DESC)
`);
```

### jobs.ts: Cron schedules + registration

**Line ~152** (after `priceUpdateWatchdog`):

```typescript
  /** VPS service health polling: every 5 min 24/7 (TECH-234, Sprint 234) */
  vpsServiceHealthPoll: Bun.env.CRON_VPS_SERVICE_HEALTH_POLL ?? '*/5 * * * *',
  /** Data freshness SLA monitoring: every 30 min 24/7 (TECH-234, Sprint 234) */
  freshnessSlaMonitor:  Bun.env.CRON_FRESHNESS_SLA_MONITOR ?? '*/30 * * * *',
```

**Line ~62 (imports section, after `priceUpdateWatchdog`):**

```typescript
import { runVpsServiceHealthJob } from './system/vpsServiceHealthJob.js'
import { runFreshnessSlaMonitorJob } from './system/freshnessSlaMonitorJob.js'
```

**Line ~500+ (in `startScheduler()`, after `priceUpdateWatchdog` cron block):**

```typescript
  // Every 5 min — VPS service health polling (TECH-234)
  cron.schedule(CRONS.vpsServiceHealthPoll, async () => {
    await recordJobRun(getDb(), 'vpsServiceHealthJob', async () => {
      await runVpsServiceHealthJob()
    })
  })

  // Every 30 min — Data freshness SLA monitoring (TECH-234)
  cron.schedule(CRONS.freshnessSlaMonitor, async () => {
    await recordJobRun(getDb(), 'freshnessSlaMonitorJob', async () => {
      await runFreshnessSlaMonitorJob()
    })
  })
```

### registry.ts: Tool registration

**Line ~74 (after `registerCycleBootstrapTool`):**

```typescript
import { registerVpsHealthTools } from "./system/vpsHealthTools.js";
import { registerSlaStatusTools } from "./system/slaStatusTools.js";
```

**Line ~140+ (in `toolRegistry` array, after `registerCycleBootstrapTool`):**

```typescript
  registerVpsHealthTools,
  registerSlaStatusTools,
```

---

## Risk Assessment & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| VPS endpoint response varies; JSON parse fails | Medium | Medium | Wrap in try-catch; record `healthStatus='unreachable'` + error message; never throw |
| Circuit breaker trips → no health checks for 5–30 min | Low | Medium | Exponential backoff is auto-reset by node-cron; monitor via `cron_job_runs` status='success' |
| SLA threshold queries timeout on large tables | Low | Medium | Add indexes on (created_at DESC); SLA checker query has <500ms target; if exceeded, log warning + skip that signal type |
| Escalation spam (same signal_type → 100+ alerts in short window) | Medium | High | **60-min cooldown enforced in sla_breach_audit** — query last breach; skip if < 60 min old |
| Market-hours SLA logic wrong → BCTC falsely alerts overnight | Low | Medium | **Test with injected clock** in RED phase; validate `tradingWindowLabel()` helper from existing codebase |
| Agents call `get_sla_status()` during breach, get stale snapshot | Low | Low | Tool queries live tables; no caching — always fresh |
| Partial failure: price healthy, news stale → escalate both or just news? | Medium | High | **Escalate only breached types** — check loop filters to only include signal_type with age > threshold |

---

## Security & DDD Compliance

- [ ] **SQL injection**: All queries use parameterized bindings (database.prepare + ?.get/all)
- [ ] **File path validation**: No user input; config loaded from mcp.config.json only
- [ ] **HTTP timeouts**: 5s per VPS endpoint, circuit breaker prevents runaway requests
- [ ] **Domain → infrastructure**: Domain services (`vpsHealthPoller`, `freshnessSlaChecker`) have **zero infrastructure imports**; all DB queries happen in scheduler jobs (interface layer) or tools (interface layer)
- [ ] **Circular dependencies**: None — fresh services, no cross-layer feedback loops
- [ ] **Escalation control**: `escalateToCommander()` only posts signals; Alert Commander owns final user alerting decision

---

## Task Breakdown (for PM)

**Suggested atomic ordering** (each depends on ✓ previous):

1. **234a — TDD RED**: Write failing test file with 12 assertions (1–2h)
   - Depends on: none
   - Deliverable: `src/__tests__/234-vps-health-sla.test.ts` with `describe()` + `test()` skeletons + function stubs that fail

2. **234b — GREEN Implementation**: Core logic (3–4h)
   - Depends on: 234a ✓
   - Deliverable: `vpsHealthPoller`, `freshnessSlaChecker`, `vpsServiceHealthJob`, `freshnessSlaMonitorJob`, `escalateToCommander()` — all tests pass

3. **234c — Integration**: Schema + registry + job registration (1–2h)
   - Depends on: 234b ✓
   - Deliverable: Schema tables created, jobs registered in `jobs.ts`, tools registered in `registry.ts`, `bun test` all 12 assertions pass

4. **234d — Agent Queries**: Integration with 02-financial-analyst + 04-market-watcher (2–3h)
   - Depends on: 234c ✓
   - Deliverable: Agents call `get_vps_service_health()` + `get_sla_status()` in fetch decision logic; fallback chains now VPS-aware

5. **234e — QA Verification** (1–2h)
   - Depends on: 234d ✓
   - Deliverable: Full test suite green, e2e verify polling + SLA detection, escalation callback fires, MCP tool output formatted correctly

---

## References

- **alert-policy.md**: Alert Commander exclusivity; SLA breaches are escalation signals, not user alerts
- **cron-jobs.md**: VPS service intervals (prices 60s, BCTC 6h, news 15min, SBV 30min, foreign-flow 60s)
- **ARCHITECTURE.md**: VPS proxy design; circuit breaker integration; two-team AI separation
- **mcp.config.json**: `vpsServices[]` array + `slaThresholds{}` config (pre-configured by PO)
