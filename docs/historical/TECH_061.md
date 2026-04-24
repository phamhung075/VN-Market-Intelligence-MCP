# TECH-061: Foreign Flow VPS Pipeline — Activate Smart-Money Signals

status: APPROVED_BY_ARCHITECT
req_ref: REQ-061

---

## Brownfield Impact

- **Files modified:**
  - `src/infrastructure/db/vnstockStore.ts` — add `upsertForeignFlow` function (targeted DO UPDATE SET)
  - `src/interface/mcp/server.ts` — add `POST /api/push-foreign-flow` endpoint block
  - `src/interface/mcp/tools/registry.ts` — add `registerForeignFlowTools` import and entry
  - `src/scheduler/jobs.ts` — add `CRONS.foreignFlowAlert` entry + cron registration block
  - `docs/data/tool-registry.json` — update toolCount 89 → 90
  - `docs/data/cron-registry.json` — update cronCount 26 → 27
  - `docs/data/project-stats.json` — update toolCount + schedulerFileCount

- **Files created:**
  - `src/interface/mcp/tools/foreignFlowTools.ts` — `get_foreign_flow` MCP tool
  - `src/scheduler/foreignFlowAlertJob.ts` — daily 16:30 VN scan

- **Files deleted:** none

- **Breaking changes:** no — all changes are purely additive. `storeTradingStats` is untouched. The new `upsertForeignFlow` function writes a disjoint set of columns using `ON CONFLICT DO UPDATE SET`, so it cannot overwrite the price/financial columns written by `storeTradingStats`.

- **VPS side (not in repo):** `fetch-prices.sh` and `fetch-prices-loop.sh` on the Singapore VPS at path `/opt/vn-price-fetch/` — extended to poll foreign flow and POST to `/api/push-foreign-flow`. Task 1135 is gated on Blocker B1.

---

## Architecture Decision

The foreign flow pipeline is an activation sprint, not a rewrite. `foreignFlowAnalyzer.ts` is pure domain and must not be touched. All new I/O lives at the correct DDD boundary: the `upsertForeignFlow` store function at infrastructure, the push endpoint at interface, the alert job at scheduler, and the MCP tool at interface. The targeted `ON CONFLICT DO UPDATE SET` form is mandatory (not `INSERT OR REPLACE`) because `storeTradingStats` independently owns the `avg_volume_2w`, `high_52w`, `low_52w`, `pct_from_*` columns on the same row; a full replace on conflict would zero those out every time the VPS push runs (every ~5 min), which is five minutes of data loss per price column.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| `upsertForeignFlow` store fn | infrastructure | `src/infrastructure/db/vnstockStore.ts` | MODIFY |
| `POST /api/push-foreign-flow` endpoint | interface | `src/interface/mcp/server.ts` | MODIFY |
| `foreignFlowAlertJob` scheduler | scheduler | `src/scheduler/foreignFlowAlertJob.ts` | NEW |
| `CRONS.foreignFlowAlert` registration | scheduler | `src/scheduler/jobs.ts` | MODIFY |
| `get_foreign_flow` MCP tool | interface | `src/interface/mcp/tools/foreignFlowTools.ts` | NEW |
| Tool registration | interface | `src/interface/mcp/tools/registry.ts` | MODIFY |
| VPS script extension | infrastructure (VPS) | `/opt/vn-price-fetch/fetch-prices.sh` on Singapore VPS | MODIFY (off-repo) |
| Tool count update | data | `docs/data/tool-registry.json` | MODIFY |
| Cron count update | data | `docs/data/cron-registry.json` | MODIFY |
| Project stats | data | `docs/data/project-stats.json` | MODIFY |

---

## Interface Contracts

### Task 1131 — `upsertForeignFlow` in `src/infrastructure/db/vnstockStore.ts`

```typescript
export interface ForeignFlowUpsertItem {
  code: string;
  date: string;           // "YYYY-MM-DD"
  foreign_volume: number;
  foreign_room: number | null;
  holding_ratio: number | null;
  fetched_at: string | null; // ISO 8601 UTC; null → server uses datetime('now')
}

/**
 * Upsert foreign flow columns only.
 *
 * Uses INSERT INTO ... ON CONFLICT(code, date) DO UPDATE SET to write only
 * the four foreign-flow-specific columns. The price/financial columns written
 * by storeTradingStats (avg_volume_2w, high_52w, low_52w, pct_from_*,
 * max_holding_ratio) are intentionally omitted from the DO UPDATE clause and
 * are therefore NEVER overwritten by this function.
 *
 * Normalises holding_ratio: if value > 1.0 it is divided by 100 (VPS API
 * sometimes returns percentage form, e.g. 48.87 instead of 0.4887).
 *
 * @returns number of rows affected (inserted + updated)
 */
export function upsertForeignFlow(
  items: ForeignFlowUpsertItem[],
  db?: Database,
): number
```

**SQL shape (single prepared statement, run in a transaction):**

```sql
INSERT INTO vnstock_trading_stats
  (code, date, foreign_volume, foreign_room, current_holding_ratio, fetched_at)
VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
ON CONFLICT(code, date) DO UPDATE SET
  foreign_volume         = excluded.foreign_volume,
  foreign_room           = excluded.foreign_room,
  current_holding_ratio  = excluded.current_holding_ratio,
  fetched_at             = excluded.fetched_at
```

Notes:
- The `UNIQUE(code, date)` constraint already exists on `vnstock_trading_stats` (schema.ts line 1057).
- Production databases that have the old schema without a `date` column will fail the INSERT (no `date` column). The existing `tradingStatsHasDate()` helper in `vnstockStore.ts` must be reused: when the `date` column is absent, fall back to a date-less `ON CONFLICT(code)` variant (matching the legacy `storeTradingStats` fallback). See implementation note below.
- `holding_ratio` normalisation: apply `if (item.holding_ratio != null && item.holding_ratio > 1.0) item.holding_ratio /= 100` before binding.
- All bindings are positional `?` — no string interpolation of user input.

**Legacy-schema fallback (no `date` column):**

```sql
INSERT INTO vnstock_trading_stats
  (code, foreign_volume, foreign_room, current_holding_ratio, fetched_at)
VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')))
ON CONFLICT(code) DO UPDATE SET
  foreign_volume         = excluded.foreign_volume,
  foreign_room           = excluded.foreign_room,
  current_holding_ratio  = excluded.current_holding_ratio,
  fetched_at             = excluded.fetched_at
```

---

### Task 1132 — `POST /api/push-foreign-flow` in `src/interface/mcp/server.ts`

Add a new endpoint block immediately after the existing `push-prices` block (currently ending around line 619). The block follows the exact same structural pattern: auth guard → body read → JSON parse → validation → DB call → logVpsPush → response.

**Request payload TypeScript type:**

```typescript
interface ForeignFlowPushItem {
  code: string;
  date: string;
  foreign_volume: number;
  foreign_room?: number | null;
  holding_ratio?: number | null;
  fetched_at?: string | null;
}
```

**Endpoint logic (pseudocode with exact SQL):**

```
if (method === "POST" && pathname === "/api/push-foreign-flow") {
  // 1. Auth — identical pattern to push-prices
  const apiKey = process.env.VPS_PUSH_API_KEY;
  const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
  if (!apiKey || authHeader !== apiKey) → 401

  // 2. Read body
  let body = ""; for await (const chunk of req) body += chunk;

  // 3. Parse + validate
  if (!body.trim()) → 400 { error: "Empty request body" }
  const items: ForeignFlowPushItem[] = JSON.parse(body);
  if (!Array.isArray(items) || items.length === 0) → 400 { error: "Expected non-empty array" }

  // 4. Upsert via upsertForeignFlow (imported from vnstockStore)
  const db = getDb();
  const count = upsertForeignFlow(items.map(i => ({
    code: i.code,
    date: i.date,
    foreign_volume: i.foreign_volume,
    foreign_room: i.foreign_room ?? null,
    holding_ratio: i.holding_ratio ?? null,   // upsertForeignFlow normalises >1
    fetched_at: i.fetched_at ?? null,
  })), db);

  // 5. Logging + response
  logVpsPush({ service: "foreign-flow", itemsCount: count, status: "ok" });
  → 200 { ok: true, upserted: count }

  // On JSON parse error:
  logVpsPush({ service: "foreign-flow", itemsCount: 0, status: "error", errorMsg: ... });
  → 400 { error: "Invalid JSON" }
}
```

**Import addition at top of server.ts:**

```typescript
import { upsertForeignFlow } from "../../infrastructure/db/vnstockStore.js";
```

---

### Task 1133 — `src/scheduler/foreignFlowAlertJob.ts` (new file)

```typescript
/**
 * Task 1133 — foreignFlowAlertJob
 *
 * Runs daily at 16:30 GMT+7 (09:30 UTC), weekdays only.
 * Scans all watchlist stocks for HIGH-severity foreign flow signals.
 * For each HIGH signal:
 *   (a) Inserts an alert row (INSERT OR IGNORE, type="foreign_flow")
 *   (b) Calls insertEvidenceFragment with evidence_type="foreign_flow_institutional"
 * Sends a single WORK channel digest summarising all HIGH signals (or a
 * "no HIGH signals today" line if none).
 * Never sends to MARKET — Alert Commander escalates from alert rows.
 *
 * Layer: scheduler — imports from infrastructure and domain.
 * Domain invariant: analyzeForeignFlow is never called with all-zero data.
 */

export interface ForeignFlowAlertResult {
  stocksScanned: number;
  stocksSkipped: number;      // insufficient history (< 2 rows)
  highSignals: number;
  alertsInserted: number;
  evidenceFragmentsWritten: number;
}

export async function runForeignFlowAlertJob(db?: Database): Promise<ForeignFlowAlertResult>
```

**Internal flow:**

```
1. db = opts.db ?? getDb()
2. codes = db.prepare("SELECT code FROM watchlist ORDER BY code").all()
3. For each code:
   a. history = getForeignFlowHistory(code, 10)          // vnstockStore
   b. if history.length < 2 → stocksSkipped++; continue
   c. // Zero-detection: if all foreignVolume === 0, analyzeForeignFlow
      // would return severity="low" on flat deltas — skip to avoid noise
      if (history.every(r => r.foreignVolume === 0)) → continue
   d. signal = analyzeForeignFlow(history)               // domain (pure)
   e. if (signal === null || signal.severity !== "high") → continue
   f. INSERT OR IGNORE alert row (see SQL below)
   g. insertEvidenceFragment(db, { ... })                // infrastructure
   h. push to highSignalsList for digest
4. Build WORK digest and send via sendTelegramWork (dynamic import, same
   pattern as calibrationReportJob.ts line 358)
5. await recordJobRun(db, "foreignFlowAlertJob", async () => { ... })
```

**Alert row INSERT:**

```sql
INSERT OR IGNORE INTO alerts
  (id, triggered_at, severity, signals_json, affected_actions_json,
   analysis_ids_json, message, read, user_note, sent_by)
VALUES
  (?, ?, ?, ?, ?, NULL, ?, 0, NULL, 'server')
```

- `id` — deterministic: `foreign-flow-${code}-${utcDay}` (one alert per stock per UTC day, deduped by PRIMARY KEY)
- `triggered_at` — ISO 8601 UTC now
- `severity` — `"high"`
- `signals_json` — `JSON.stringify([{ type: "foreign_flow", severity: "high", message: signal.reasoning }])`
- `affected_actions_json` — `JSON.stringify([{ code }])`
- `message` — `"[DÒNG TIỀN NGOẠI] ${code}: ${signal.reasoning}"`
- `sent_by` — `"server"`

**Evidence fragment call:**

```typescript
insertEvidenceFragment(db, {
  stock: code,
  evidence_type: "foreign_flow_institutional",
  direction: signal.netFlowDirection === "net_buy" ? "bullish" : "bearish",
  magnitude: 0.8,
  confidence: 0.75,
  source_agent: "foreignFlowAlertJob",
  ttl_days: 5,
});
```

Only called when `signal.netFlowDirection !== "neutral"`. Per the REQ spec, HIGH severity + neutral direction is logically impossible (the analyzer requires a directional streak for HIGH), but adding the guard is correct defensive coding.

**WORK digest format:**

```
[foreignFlowAlertJob] {YYYY-MM-DD} 16:30 VN
HIGH foreign flow signals: {N} stocks

{CODE}: {signal.reasoning}
...

Alert rows inserted. Alert Commander should escalate HIGH signals to MARKET.
```

When 0 HIGH signals:

```
[foreignFlowAlertJob] {YYYY-MM-DD} — no HIGH foreign flow signals today.
```

**Imports required:**

```typescript
import type { Database } from "bun:sqlite";
import { getDb } from "../infrastructure/db/schema.js";
import { getForeignFlowHistory } from "../infrastructure/db/vnstockStore.js";
import { insertEvidenceFragment } from "../infrastructure/db/evidenceFragmentStore.js";
import { recordJobRun } from "../infrastructure/db/cronJobRunStore.js";
import { analyzeForeignFlow } from "../domain/services/foreignFlowAnalyzer.js";
import { logger } from "../infrastructure/logger.js";
```

The `sendTelegramWork` function is obtained via dynamic import (same pattern as calibrationReportJob.ts):

```typescript
const { sendTelegramWork } = await import("../infrastructure/telegram.js");
```

---

### Task 1134 — `src/interface/mcp/tools/foreignFlowTools.ts` (new file)

```typescript
/**
 * Task 1134 — get_foreign_flow MCP tool
 *
 * On-demand foreign flow signal for a stock code.
 * Reads history from vnstockStore, calls analyzeForeignFlow (domain),
 * and formats the result.
 *
 * DDD invariant: this file may import from infrastructure/db and domain/services.
 * It does NOT import from scheduler or application layers.
 *
 * Zero-detection: if all foreignVolume values in history are 0, the tool
 * returns the "no data" message WITHOUT calling analyzeForeignFlow.
 * This prevents misleading neutral/low output in the pre-deploy state.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { z } from "zod";
import { getForeignFlowHistory } from "../../../infrastructure/db/vnstockStore.js";
import { analyzeForeignFlow } from "../../../domain/services/foreignFlowAnalyzer.js";
import { getDb } from "../../../infrastructure/db/schema.js";

export function registerForeignFlowTools(server: McpServer, db?: Database): void {
  const resolveDb = () => db ?? getDb();

  server.tool(
    "get_foreign_flow",
    "Get the latest foreign flow signal for a VN stock. Returns institutional " +
      "smart-money direction (net_buy / net_sell / neutral), severity (high / medium / low), " +
      "consecutive streak count, net volume over 3d and 5d windows, holding ratio change, " +
      "and reasoning. HIGH severity = 3+ consecutive days same direction AND |net_vol_3d| >= 100k shares. " +
      "Data is pushed every ~5 min during VN market hours by the VPS Singapore proxy. " +
      "Returns no-data message if VPS push not yet deployed or stock has no foreign flow history.",
    {
      code: z.string().describe("Stock ticker, e.g. 'VNM'"),
      days: z
        .number()
        .int()
        .min(2)
        .max(30)
        .optional()
        .default(10)
        .describe("History window in trading days, default 10, max 30"),
    },
    async ({ code, days = 10 }) => {
      const database = resolveDb();
      const history = getForeignFlowHistory(code.toUpperCase(), days);

      if (history.length < 2) {
        return {
          content: [{
            type: "text",
            text:
              `Insufficient foreign flow data for ${code}. ` +
              "Data starts accumulating from first VPS push after deploy. " +
              `Currently have ${history.length} row(s) — need at least 2.`,
          }],
        };
      }

      // Zero-detection: all-zero means VPS push not yet deployed
      if (history.every((r) => r.foreignVolume === 0)) {
        return {
          content: [{
            type: "text",
            text:
              `Foreign Flow — ${code}: no data available.\n` +
              "All foreign_volume values are zero — VPS push not yet deployed " +
              "or no data for this stock.\n" +
              "Run get_foreign_flow after the VPS script update is deployed " +
              "and at least one trading session has completed.",
          }],
        };
      }

      const signal = analyzeForeignFlow(history);
      if (!signal) {
        return {
          content: [{
            type: "text",
            text: `Foreign Flow — ${code}: analysis returned null (insufficient delta data).`,
          }],
        };
      }

      const text = formatForeignFlowOutput(code, signal, history);
      return { content: [{ type: "text", text }] };
    },
  );
}
```

**`formatForeignFlowOutput` helper (in the same file):**

```typescript
function formatForeignFlowOutput(
  code: string,
  signal: ForeignFlowSignal,
  history: DailyForeignFlow[],
): string {
  const lines: string[] = [
    `Foreign Flow — ${code} (last ${history.length} days)`,
    "",
    `Direction: ${signal.netFlowDirection} | Severity: ${signal.severity.toUpperCase()} | Consecutive days: ${signal.consecutiveDays}`,
    `Net volume 3d: ${fmtNetVol(signal.totalNetVolume3d)} shares | Net volume 5d: ${fmtNetVol(signal.totalNetVolume5d)} shares`,
    `Holding ratio change 5d: ${fmtPct(signal.holdingRatioChange5d)}`,
    "",
    `Reasoning: ${signal.reasoning}`,
    "",
    "Daily history (most recent first):",
    ...history.map((r) =>
      `  ${r.date}: held=${r.foreignVolume.toLocaleString()}  room=${r.foreignRoom.toLocaleString()}  ratio=${(r.holdingRatio * 100).toFixed(2)}%`,
    ),
    "",
    `Data source: VPS Singapore proxy | Last updated: ${history[0]?.date ?? "unknown"}`,
  ];
  return lines.join("\n");
}
```

---

### Cron registration addition to `src/scheduler/jobs.ts`

**CRONS entry (add after `calibrationReport`):**

```typescript
/** Foreign flow alert scan: weekdays 09:30 UTC = 16:30 GMT+7 — task 1133, Sprint 061 */
foreignFlowAlert: Bun.env.CRON_FOREIGN_FLOW_ALERT ?? '30 9 * * 1-5',
```

**Import addition:**

```typescript
import { runForeignFlowAlertJob } from './foreignFlowAlertJob.js'
```

**Cron registration block (add after calibrationReport block, before the closing `log` line):**

```typescript
// Weekdays 09:30 UTC (16:30 GMT+7) — Foreign flow alert scan — task 1133
// Runs 1 hour after VN market close (15:30 VN = 08:30 UTC) to ensure
// VPS has delivered final session data before the scan runs.
cron.schedule(CRONS.foreignFlowAlert, async () => {
  try {
    const r = await runForeignFlowAlertJob();
    if (r.highSignals > 0) {
      log(`[foreign-flow-alert] highSignals=${r.highSignals} alertsInserted=${r.alertsInserted} evidenceFragments=${r.evidenceFragmentsWritten}`);
    }
  } catch (err) {
    log(`[foreign-flow-alert] uncaught: ${err instanceof Error ? err.message : String(err)}`);
  }
}, { timezone: 'UTC' })
```

---

### Registry addition to `src/interface/mcp/tools/registry.ts`

Add after the `registerCalibrationTools` line:

```typescript
import { registerForeignFlowTools } from "./foreignFlowTools.js";
```

And in the `toolRegistry` array:

```typescript
registerForeignFlowTools,     // Task 1134: get_foreign_flow (+1 tool → 90)
```

---

### VPS Script Extension — Task 1135

**Blocker B1 resolution (Architect finding):** The VPS `bgapidatafeed.vps.com.vn` API endpoint `GET /getliststockdata/{comma-separated-symbols}` already returns foreign flow fields in each stock object. Based on the existing price-push script behaviour and known VPS API shape, the fields are:

- `fRoom` — foreign room remaining (integer, shares)
- `fBuy` — cumulative foreign buy volume today (integer, shares). **Note: this is NOT net position — it is today's gross buy side.**
- `fSell` — cumulative foreign sell volume today (integer, shares)
- `foreignPercent` — current foreign ownership as a decimal (e.g. `0.4887`)

**Critical field mapping note:** The REQ spec expects `foreign_volume` to be "cumulative foreign volume held" (the total position), not today's delta. The VPS `getliststockdata` endpoint does NOT directly expose the total cumulative holding — only `fBuy`/`fSell` for today's session. However, the `foreignPercent * totalShares` gives the position if total shares are available. Alternative approach: treat `fBuy - fSell` (today's net) as the daily delta and accumulate into a running total. This is architecturally complex for a bash script.

**Recommended implementation for the VPS script:**

Use `foreign_volume = fBuy` (daily gross buy volume) as the proxy field pushed to the endpoint. This is consistent across days, non-zero during active sessions, and sufficient for the `analyzeForeignFlow` delta computation (which needs `curr.foreignVolume - prev.foreignVolume` to detect direction). The delta of daily-buy-volume is a weaker signal but does not require state on the VPS side.

**Stronger alternative (preferred if feasible):** Fetch from a dedicated endpoint that exposes the total held position. VPS also exposes `GET /getliststockdata/{symbol}` (single stock) which may return richer data. Architect recommends the Developer confirm the exact field names by doing a live GET from the Singapore server before writing the script:

```bash
curl -s "https://bgapidatafeed.vps.com.vn/getliststockdata/VNM" | python3 -m json.tool | grep -i "foreign\|fBuy\|fSell\|fRoom\|fCurrent\|totalRoom"
```

**B1 is unblocked for tasks 1131–1134.** Task 1135 requires the Developer to confirm field names on the VPS before writing the script (the bash curl above takes 30 seconds from the Singapore server).

**VPS script deployment procedure:**

```bash
# SSH into VPS Singapore
ssh ubuntu@<VPS_IP>

# Edit the loop script
sudo nano /opt/vn-price-fetch/fetch-prices-loop.sh
# OR
sudo nano /opt/vn-price-fetch/fetch-prices.sh

# After editing, restart the service
sudo systemctl restart vn-price-fetch.service
sudo systemctl status vn-price-fetch.service

# Verify push is arriving at France server
curl -s http://localhost:3000/health  # on France server, check last vpsPushLog entries
```

**Script extension pattern (bash pseudocode):**

```bash
# After each price-fetch loop iteration, fetch foreign flow for same stock list
# Only run during VN market hours to avoid redundant polls
fetch_foreign_flow() {
  local codes="$1"   # comma-separated codes, e.g. "VNM,FPT,VCB"
  local date
  date=$(TZ="Asia/Ho_Chi_Minh" date +%Y-%m-%d)

  # Fetch from VPS API (same host as prices)
  local response
  response=$(curl -s --max-time 10 \
    "https://bgapidatafeed.vps.com.vn/getliststockdata/${codes}" 2>/dev/null)

  if [ -z "$response" ]; then
    echo "[foreign-flow] API call failed or timed out" >&2
    return 0   # do NOT abort — price loop continues
  fi

  # Parse response and build push payload
  # Extract fRoom, fBuy (or confirmed field), foreignPercent per stock
  # Build JSON array conforming to ForeignFlowPushItem schema
  local payload
  payload=$(echo "$response" | python3 /opt/vn-price-fetch/parse_foreign_flow.py "$date")

  if [ -z "$payload" ] || [ "$payload" = "[]" ]; then
    echo "[foreign-flow] empty payload — skipping push" >&2
    return 0
  fi

  # POST to France MCP server
  local push_response
  push_response=$(curl -s --max-time 15 \
    -X POST \
    -H "Content-Type: application/json" \
    -H "x-api-key: ${VPS_PUSH_API_KEY}" \
    "${MCP_SERVER_URL}/api/push-foreign-flow" \
    -d "$payload" 2>/dev/null)

  echo "[foreign-flow] push response: ${push_response}" >&2
}
```

The python helper `parse_foreign_flow.py` (or jq inline) translates the VPS JSON to the `ForeignFlowPushItem[]` schema. Using Python for JSON parsing in bash is correct — jq availability on the VPS should be confirmed.

**Error handling invariant:** the foreign flow fetch must be wrapped in a function that always returns 0. Any failure (timeout, parse error, HTTP error) logs to stderr and does not abort the outer price-fetch loop. Price continuity is mandatory; foreign flow is secondary.

---

## Task Breakdown (for PM)

| ID | Title | Layer | Size | Depends On | AC |
|----|-------|-------|------|------------|----|
| 1131 | `upsertForeignFlow` in `vnstockStore.ts` — targeted `ON CONFLICT DO UPDATE SET`, holding_ratio normalisation, legacy-schema fallback | infrastructure | S | — | AC-1, AC-3 |
| 1132 | `POST /api/push-foreign-flow` in `server.ts` — auth + validation + call upsertForeignFlow + logVpsPush | interface | S | 1131 | AC-1, AC-2, AC-3 |
| 1133 | `foreignFlowAlertJob.ts` — daily 16:30 VN scan, alert rows, evidence fragments, WORK digest, recordJobRun | scheduler | M | 1131 | AC-7, AC-8, AC-9 |
| 1134 | `foreignFlowTools.ts` + registry entry — `get_foreign_flow` tool, zero-detection, format helper (+1 tool → 90) | interface | S | 1131 | AC-4, AC-5, AC-6, AC-10 |
| 1135 | VPS script extension — poll foreign flow per stock, parse fields, POST to `/api/push-foreign-flow` (gates on B1 field-name confirmation) | infrastructure (VPS) | M | B1 resolved + 1132 deployed | — |

**Dependency chain:**

```
Batch A (no dependencies):  1131
Batch B (after 1131):       1132, 1133, 1134  (parallel)
Batch C (after B deployed + B1 confirmed):  1135
```

**Test file naming convention:** `src/__tests__/1131-upsert-foreign-flow.test.ts`, `src/__tests__/1132-push-foreign-flow-endpoint.test.ts`, `src/__tests__/1133-foreign-flow-alert-job.test.ts`, `src/__tests__/1134-get-foreign-flow-tool.test.ts`

Each test file covers the ACs assigned to its task. The existing `src/__tests__/vnstock-foreign-flow.test.ts` (16 tests for the domain analyzer) must remain untouched and green — no modifications to `foreignFlowAnalyzer.ts` are permitted.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| VPS API field names differ from expected (`fBuy`/`fSell`/`foreignPercent`) | Medium | Medium | B1 investigation with live curl before 1135 starts; degradation is silent (zero values) — no crashes |
| `INSERT OR REPLACE` accidentally used instead of `ON CONFLICT DO UPDATE SET` | Low | High | Code review gate in Task 1131: AC-1 explicitly tests that non-foreign columns are NOT zeroed out after a push |
| `foreignFlowAlertJob` sends to MARKET instead of WORK | Low | High | Unit test in 1133 must assert `sendTelegramWork` was called, `sendTelegramMarket` was NOT called |
| `analyzeForeignFlow` called on all-zero data → misleading neutral signal | Low | Medium | Zero-detection guard in both `foreignFlowTools.ts` and `foreignFlowAlertJob.ts`; test in AC-5 |
| `holding_ratio > 1.0` stored in DB without normalisation | Low | Medium | Normalisation in `upsertForeignFlow` (not in the endpoint): single place, tested by AC-3 |
| `storeTradingStats` and `upsertForeignFlow` race on the same `(code, date)` row | Low | Low | `ON CONFLICT DO UPDATE SET` is atomic in SQLite; last writer wins on the touched columns only; no row can be partially updated |
| VPS service restart during deployment of Task 1135 causes missing data for that session | Low | Low | `foreignFlowAlertJob` requires `< 2 rows` guard and skips gracefully; one missed session does not break streak detection |
| Test file naming collides with future sprint tasks (1131–1135 range) | Very Low | Very Low | Follow existing naming convention strictly: `NNN-kebab-name.test.ts` |

---

## Security Review

- [x] SQL parameterized? Yes — `upsertForeignFlow` uses positional `?` bindings in a prepared statement inside a transaction. The endpoint never interpolates `code`, `date`, or any user input into SQL strings.
- [x] File paths validated (no `../`)? N/A — no file I/O in these components.
- [x] External HTTP rate-limited? N/A — this sprint only receives data (passive endpoint). The VPS script calls an external API, but that is on the VPS side (Singapore), not the France server.
- [x] Secrets via `Bun.env` / `process.env` only? Yes — `VPS_PUSH_API_KEY` is read via `process.env.VPS_PUSH_API_KEY` (existing pattern in server.ts).
- [x] `holding_ratio` bounds check? Yes — normalisation guard `if value > 1.0 → divide by 100` prevents storing ratios like `48.87` that would corrupt downstream calculations.

---

## Tool Count Verification

Current count per `docs/data/project-stats.json`: **89**
Sprint 061 adds: `get_foreign_flow` (+1)
Post-sprint count: **90**

## Scheduler File Count Verification

Current count per `docs/data/project-stats.json`: **26**
Sprint 061 adds: `foreignFlowAlertJob.ts` (+1)
Post-sprint count: **27**

Sprint 060 (`calibrationReportJob.ts`) was confirmed as +1 in `project-stats.json` (value is currently 26, which is correct pre-061).
