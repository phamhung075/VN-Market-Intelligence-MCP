# TASK 1395a — Build alertBatchGrouper.ts + server.ts send loop + 11 tests

**Status:** Todo — ready for Developer
**Date:** 2026-04-28
**Sprint:** 1395
**Baseline:** 7946 pass / 0 fail

---

## Scope

Single atomic task. Three deliverables on one branch (`task/1395a-alert-batch-grouper`):

1. CREATE `apps/mcp-server/src/domain/services/alertBatchGrouper.ts`
2. MODIFY `apps/mcp-server/src/interface/mcp/server.ts` — replace lines 774–795 send loop
3. CREATE `apps/mcp-server/src/__tests__/1395-alert-batch-grouper.test.ts` — 11 tests

All three files have no shared dependencies with other open tasks. No DB schema changes. No new cron jobs.

---

## 1. alertBatchGrouper.ts (CREATE)

File path: `apps/mcp-server/src/domain/services/alertBatchGrouper.ts`

### Public interface

```typescript
export interface AlertBatchGroup {
  /** Primary signal type — derived from alert.signals[0].type */
  signalType: string;
  severity: "high" | "critical";
  /** Ticker codes (alert.actionCode) in insertion order */
  tickers: string[];
  /** Alert IDs — used by server.ts to mark notified_telegram = 1 */
  alertIds: string[];
  /** Full alert.message of the first alert — used only when tickers.length === 1 */
  singleMessage: string;
}

/**
 * Groups a flat list of Alert objects by (signal_type, severity)
 * within a single push-prices invocation (same-batch grouping).
 *
 * Pure function — no I/O, no DB.
 *
 * Key = `${alert.signals[0]?.type ?? "unknown"}::${alert.severity}`
 * Map preserves insertion order → deterministic for tests.
 *
 * @param alerts  Pre-filtered list (caller may pass any severity; grouper uses all).
 * @returns       Array of AlertBatchGroup, one per (signal_type, severity) pair.
 */
export function groupAlertsBySignalSeverity(alerts: Alert[]): AlertBatchGroup[];

/**
 * Formats one AlertBatchGroup into the Vietnamese Telegram string.
 *
 * - N=1: `[{SEV_LABEL}] {singleMessage}` (preserves original alert.message exactly)
 * - N>=2: `[{SEV_LABEL}] {signal_type} — {N} mã cùng {verb}\n  • {ticker1}, ticker2, ...`
 *   If N>10: first 10 tickers + ` (+{N-10} mã khác)`
 *
 * Pure function — no I/O.
 */
export function formatBatchGroupMessage(group: AlertBatchGroup): string;
```

### Grouping logic (groupAlertsBySignalSeverity)

```
key = `${alert.signals[0]?.type ?? "unknown"}::${alert.severity}`

For each alert:
  1. Derive key (use "unknown" if signals is empty or undefined).
  2. Look up key in Map<string, AlertBatchGroup>.
  3. If found: push alert.actionCode to tickers, push alert.id to alertIds.
  4. If not found: create new group entry with singleMessage = alert.message.

Return Array.from(map.values()).
```

### Verb and severity label tables

```typescript
const SIGNAL_VERB: Record<string, string> = {
  price_drop:    "giảm mạnh",
  price_surge:   "tăng mạnh",
  volume_spike:  "khối lượng đột biến",
  ta_overbought: "quá mua",
  ta_oversold:   "quá bán",
};
// fallback: "kích hoạt cảnh báo"

const SEV_LABEL: Record<string, string> = {
  critical: "NGHIÊM TRỌNG",
  high:     "QUAN TRỌNG",
};
```

### DDD compliance

- Import `Alert` from `alertGenerator.ts` (domain → domain).
- Zero imports from `infrastructure/`.
- No I/O. No DB. Pure transformation only.

---

## 2. server.ts modification (MODIFY)

File path: `apps/mcp-server/src/interface/mcp/server.ts`

### What to replace

Locate the push-prices handler send loop (approximately lines 774–795). The current code iterates `for (const alert of alerts)` and calls `sendTelegramWork` once per alert.

Replace that loop with:

```typescript
// Step 1 — filter to notifiable (high/critical, dedup guard applied per-alert)
const { groupAlertsBySignalSeverity, formatBatchGroupMessage } =
  await import("../../domain/services/alertBatchGrouper.js");

const notifiable = alerts.filter(
  (a) =>
    (a.severity === "high" || a.severity === "critical") &&
    !shouldSkipAlreadyNotifiedAlert(a.id, db),
);

// Step 2 — group by (signal_type, severity)
const groups = groupAlertsBySignalSeverity(notifiable);

// Step 3 — one Telegram send per group
for (const group of groups) {
  try {
    const msg = formatBatchGroupMessage(group);
    await sendTelegramWork(msg, {
      persist: { from_agent: "push-prices", message_type: "system_alert" },
    });
    // Mark all alerts in the group as notified
    for (const id of group.alertIds) {
      db.prepare("UPDATE alerts SET notified_telegram = 1 WHERE id = ?").run(id);
    }
    log.info("[push-prices] batch alert sent", {
      signalType: group.signalType,
      severity:   group.severity,
      count:      group.tickers.length,
    });
  } catch (tgErr) {
    // No IDs marked — consistent with existing per-alert error policy (EC-4)
    log.warn("[push-prices] Telegram batch send failed", {
      error: tgErr instanceof Error ? tgErr.message : String(tgErr),
    });
  }
}
```

### Import path rule

`../../domain/services/alertBatchGrouper.js` — must use `.js` extension (ESM rule).

### Touch surface

Only the send loop (~22 lines → ~28 lines). No other lines in server.ts are touched.

---

## 3. Test file (CREATE)

File path: `apps/mcp-server/src/__tests__/1395-alert-batch-grouper.test.ts`

Import only from `alertBatchGrouper.ts`. All tests are pure (no DB, no Telegram).

| # | Test description | Function |
|---|-----------------|----------|
| T1 | 8 alerts with same `price_drop/high` → 1 group, 8 tickers | `groupAlertsBySignalSeverity` |
| T2 | Mixed types `price_drop/high` x2 + `volume_spike/high` x1 → 2 groups | `groupAlertsBySignalSeverity` |
| T3 | Mixed severities `price_drop/critical` x1 + `price_drop/high` x1 → 2 groups | `groupAlertsBySignalSeverity` |
| T4 | Single-alert input → 1 group, tickers.length = 1 | `groupAlertsBySignalSeverity` |
| T5 | Empty input → empty array | `groupAlertsBySignalSeverity` |
| T6 | Alert with empty signals array → group key uses `"unknown"` | `groupAlertsBySignalSeverity` |
| T7 | N=1 group → single-ticker format, returns singleMessage text verbatim | `formatBatchGroupMessage` |
| T8 | N=8 `price_drop/high` → correct header + all 8 tickers on bullet line | `formatBatchGroupMessage` |
| T9 | N=12 group → first 10 visible + `(+2 mã khác)` suffix | `formatBatchGroupMessage` |
| T10 | `volume_spike/critical` → verb "khối lượng đột biến", label "NGHIÊM TRỌNG" | `formatBatchGroupMessage` |
| T11 | Unknown signal type → verb fallback "kích hoạt cảnh báo" | `formatBatchGroupMessage` |

Test file header:
```typescript
// apps/mcp-server/src/__tests__/1395-alert-batch-grouper.test.ts
import { describe, it, expect } from "bun:test";
import {
  groupAlertsBySignalSeverity,
  formatBatchGroupMessage,
} from "../domain/services/alertBatchGrouper.js";
```

---

## 4. Edge Cases (from BA spec)

| EC | Handling |
|----|----------|
| EC-1 Mixed signal types | Each (signal_type, severity) pair → own group → own Telegram message |
| EC-2 Mixed severities | Same signal type but different severity → separate groups |
| EC-3 Single ticker for a pair | N=1 → single-ticker format (no grouping header) |
| EC-4 Telegram send fails | No IDs marked as notified_telegram = 1 (catch block does nothing) |
| EC-5 dedup guard | shouldSkipAlreadyNotifiedAlert() applied before grouping; excluded alerts not in any group |
| EC-6 Empty group after dedup | No message sent for that group (silent skip) |
| EC-7 Vietnamese characters | Pass through sendTelegramWork unchanged; no HTML/Markdown changes in scope |

---

## 5. What Must Not Change

- `alertGrouper.ts` — not touched
- `assembleAlertDigest.ts` — not touched
- `alerts` table schema — no new columns
- `storeAlerts` call — all alerts still stored before grouping step

---

## 6. Acceptance Criteria

| # | Criterion |
|---|-----------|
| AC-1 | 8 `price_drop/high` alerts from one VPS push produce exactly 1 Telegram message |
| AC-2 | The grouped message lists all 8 ticker codes |
| AC-3 | `notified_telegram = 1` set on all 8 alert rows after successful send |
| AC-4 | Telegram send fails → `notified_telegram` remains 0 on all rows |
| AC-5 | Single-ticker batch → original single-alert format preserved |
| AC-6 | Mixed signal types in one batch → separate messages (one per type) |
| AC-7 | Mixed severities for same signal type → separate messages |
| AC-8 | Alerts already marked `notified_telegram = 1` excluded from grouped send |
| AC-9 | `storeAlerts` still called before any Telegram send (persistence unchanged) |
| AC-10 | Existing tests for `alertGrouper.ts` and `assembleAlertDigest.ts` continue to pass |
| AC-11 | All 11 new tests in `1395-alert-batch-grouper.test.ts` pass |
| AC-12 | Full suite: >= 7946 pass / 0 fail |

---

## 7. Branch and Commit

```
Branch: task/1395a-alert-batch-grouper

Commit message:
feat(1395a): alertBatchGrouper — group real-time push-prices alerts by (signal_type, severity)

- alertBatchGrouper.ts: pure domain service, groupAlertsBySignalSeverity + formatBatchGroupMessage
- server.ts: replace per-alert send loop with batch-group loop (EC-4 error policy preserved)
- 1395-alert-batch-grouper.test.ts: 11 tests (T1–T11), all pure, no DB/Telegram
```
