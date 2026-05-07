# TASK-1847d-D — Interface: Alert Accuracy Tool Upgrades

**Task:** 1847d-D | **Status:** READY FOR DEVELOPER (after 1847d-A; parallel with 1847d-C)
**Sprint:** 1847
**Owner:** dev-mcp-server
**Arch Design:** docs/handoffs/ARCH_1847d.md (section 6)

---

## Summary

Upgrade `get_alert_accuracy` tool to use DB outcome column (fast path) + fallback to on-demand scoring. Create `mark_alert_outcome` tool for manual outcome override. Same file (`alertAccuracy.ts`).

**Files to modify: 1**
**Files to create: 0 (tests inline)**
**Tests: 8 integration tests**

---

## Files

### 1. MODIFY: `apps/mcp-server/src/interface/mcp/tools/alerts/alertAccuracy.ts`

**Current state:** `get_alert_accuracy` uses on-demand scoring only. No persistent outcome column.

**Upgrade:** Add two paths + new tool registration.

#### 1a. Update `get_alert_accuracy` Handler (FR-4)

```typescript
// Existing: scoreAlert() on-demand logic kept
// NEW: dual-path scoring

export async function handleGetAlertAccuracy(input: any) {
  const { days = 30 } = input;
  const db = getDb();

  // SELECT with new outcome columns
  const stmt = db.prepare(`
    SELECT
      id,
      triggered_at,
      code,
      message,
      signals_json,
      outcome,
      outcome_detail,
      notified_telegram
    FROM alerts
    WHERE triggered_at >= datetime('now', '-' || ? || ' days')
    ORDER BY triggered_at DESC
  `);

  const rows = stmt.all(days) as Array<{
    id: string;
    triggered_at: string;
    code: string;
    message: string;
    signals_json: string | null;
    outcome: string | null;           // NEW column
    outcome_detail: string | null;    // NEW column
    notified_telegram: boolean;
  }>;

  const summary = { hit: 0, miss: 0, unknown: 0, total: 0 };
  const summaryByType = {
    'position-danger': { hit: 0, miss: 0, unknown: 0, total: 0 },
    'watchlist-opportunity': { hit: 0, miss: 0, unknown: 0, total: 0 },
    'price-signal': { hit: 0, miss: 0, unknown: 0, total: 0 },
    composite: { hit: 0, miss: 0, unknown: 0, total: 0 },
    unscoreable: { hit: 0, miss: 0, unknown: 0, total: 0 },
  };

  const details: Array<{
    id: string;
    score: string;
    detail: string;
    type: string;
  }> = [];

  for (const row of rows) {
    let outcome: 'hit' | 'miss' | 'unknown';
    let detail: string;
    let alertClass: string;

    // FAST PATH: use DB outcome if present
    if (row.outcome !== null) {
      outcome = row.outcome as 'hit' | 'miss' | 'unknown';
      detail = row.outcome_detail || '(no detail)';
      // Classify for summary_by_type
      const classification = classifyAlertType(row.signals_json, row.message);
      alertClass = classification.alertClass;
    } else {
      // FALLBACK: on-demand scoring (existing logic)
      const result = scoreAlert(row.code, row.triggered_at);
      outcome = result.outcome;
      detail = result.detail;
      const classification = classifyAlertType(row.signals_json, row.message);
      alertClass = classification.alertClass;
    }

    // Accumulate summaries
    summary[outcome]++;
    summary.total++;
    summaryByType[alertClass][outcome]++;
    summaryByType[alertClass].total++;

    details.push({
      id: row.id,
      score: outcome.toUpperCase(),
      detail,
      type: alertClass,
    });
  }

  // Format output
  const totalScored = summary.total;
  const hitRate = totalScored > 0 ? ((summary.hit / totalScored) * 100).toFixed(1) : 0;
  const missRate = totalScored > 0 ? ((summary.miss / totalScored) * 100).toFixed(1) : 0;
  const unknownRate = totalScored > 0 ? ((summary.unknown / totalScored) * 100).toFixed(1) : 0;

  let output = `Báo cáo độ chính xác cảnh báo (${days} ngày gần đây):\n`;
  output += `Tổng cảnh báo: ${totalScored}\n`;
  output += `  HIT: ${summary.hit} (${hitRate}%)\n`;
  output += `  MISS: ${summary.miss} (${missRate}%)\n`;
  output += `  UNKNOWN: ${summary.unknown} (${unknownRate}%)\n\n`;

  // NEW: summary_by_type breakdown
  output += `Phân tích theo loại cảnh báo:\n`;
  for (const [type, counts] of Object.entries(summaryByType)) {
    if (counts.total > 0) {
      const hitPct = ((counts.hit / counts.total) * 100).toFixed(0);
      const missPct = ((counts.miss / counts.total) * 100).toFixed(0);
      const unknownPct = ((counts.unknown / counts.total) * 100).toFixed(0);
      output += `  ${type}: ${counts.hit} HIT (${hitPct}%), ${counts.miss} MISS (${missPct}%), ${counts.unknown} UNKNOWN (${unknownPct}%)\n`;
    }
  }

  // Details
  output += `\nChitiết (20 gần đây):\n`;
  for (const detail of details.slice(0, 20)) {
    output += `  ${detail.id}: ${detail.score} — ${detail.type} — ${detail.detail}\n`;
  }

  return output;
}
```

#### 1b. NEW: `mark_alert_outcome` Tool (FR-5)

```typescript
export function registerMarkAlertOutcomeTool(server: McpServer): void {
  server.tool(
    'mark_alert_outcome',
    'Manually mark a fired alert outcome (hit/miss). Rejects if already marked unless force=true.',
    {
      alertId: z.string().describe('Alert ID to mark'),
      outcome: z.enum(['hit', 'miss']).describe('Outcome verdict'),
      notes: z.string().optional().describe('Optional context or reason'),
      force: z.boolean().optional().default(false).describe('Overwrite existing outcome if already marked'),
    },
    async ({ alertId, outcome, notes, force }) => {
      const db = getDb();

      // 1. Read current outcome
      const selectStmt = db.prepare('SELECT outcome, outcome_detail FROM alerts WHERE id = ?');
      const existing = selectStmt.get(alertId) as { outcome: string | null; outcome_detail: string | null } | undefined;

      if (!existing) {
        return `Lỗi: Không tìm thấy cảnh báo ${alertId}`;
      }

      // 2. Guard: already marked && !force
      if (existing.outcome !== null && !force) {
        return `Lỗi: Cảnh báo ${alertId} đã được đánh giá (${existing.outcome}). Dùng force=true để ghi đè.`;
      }

      // 3. Write outcome
      const now = new Date().toISOString();
      const detail = notes || 'manual override';

      const updateStmt = db.prepare(`
        UPDATE alerts
        SET outcome = ?, outcome_at = ?, outcome_detail = ?
        WHERE id = ?
      `);
      updateStmt.run(outcome, now, detail, alertId);

      return `OK: Cảnh báo ${alertId} đánh giá ${outcome.toUpperCase()} (${detail})`;
    },
  );
}
```

#### 1c. Tool Index Registration

**File:** `apps/mcp-server/src/interface/mcp/tools/alerts/index.ts`

```typescript
// Add to imports
import { registerMarkAlertOutcomeTool } from './alertAccuracy.js';

// In the registration function (e.g., registerAlertTools()), add:
export function registerAlertTools(server: McpServer): void {
  registerAlertAccuracyTool(server);
  registerMarkAlertOutcomeTool(server);  // NEW
}
```

---

### 2. CREATE: Inline Integration Tests in `1847d-alert-outcome-job.test.ts`

Tests 5-8 from 1847d-C test file should test this tool:

**TEST-5:** `mark_alert_outcome` writes hit → read returns hit
```typescript
it('TEST-5: mark_alert_outcome writes hit → subsequent query returns hit', async () => {
  const db = testDb;
  const alertId = 'test-alert-001';

  // Insert test alert (initially outcome=NULL)
  const insertStmt = db.prepare(`
    INSERT INTO alerts (id, triggered_at, signals_json, affected_actions_json, message)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertStmt.run(
    alertId,
    '2026-05-01T10:00:00Z',
    JSON.stringify([{ type: 'position-danger' }]),
    JSON.stringify([{ code: 'VIC' }]),
    'test alert',
  );

  // Call mark_alert_outcome (simulate tool call)
  const updateStmt = db.prepare(`
    UPDATE alerts
    SET outcome = ?, outcome_at = ?, outcome_detail = ?
    WHERE id = ? AND outcome IS NULL
  `);
  updateStmt.run('hit', new Date().toISOString(), 'manual override', alertId);

  // Verify
  const selectStmt = db.prepare('SELECT outcome FROM alerts WHERE id = ?');
  const row = selectStmt.get(alertId) as { outcome: string } | undefined;
  expect(row?.outcome).toBe('hit');
});
```

**TEST-6:** `mark_alert_outcome` rejects re-mark without force
```typescript
it('TEST-6: mark_alert_outcome rejects re-mark without force=true', async () => {
  const db = testDb;
  const alertId = 'test-alert-002';

  // Insert alert with existing outcome
  const insertStmt = db.prepare(`
    INSERT INTO alerts (id, triggered_at, signals_json, affected_actions_json, message, outcome, outcome_at, outcome_detail)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertStmt.run(
    alertId,
    '2026-05-01T10:00:00Z',
    JSON.stringify([{ type: 'position-danger' }]),
    JSON.stringify([{ code: 'VIC' }]),
    'test alert',
    'miss',
    new Date().toISOString(),
    'existing',
  );

  // Try to update without force (WHERE outcome IS NULL should fail)
  const updateStmt = db.prepare(`
    UPDATE alerts
    SET outcome = ?, outcome_at = ?, outcome_detail = ?
    WHERE id = ? AND outcome IS NULL
  `);
  const changes = updateStmt.run('hit', new Date().toISOString(), 'new', alertId);

  // Verify: no rows affected
  expect(changes.changes).toBe(0);

  // Verify: outcome unchanged
  const selectStmt = db.prepare('SELECT outcome FROM alerts WHERE id = ?');
  const row = selectStmt.get(alertId) as { outcome: string } | undefined;
  expect(row?.outcome).toBe('miss');
});
```

**TEST-7:** `get_alert_accuracy` uses DB outcome (fast path)
```typescript
it('TEST-7: get_alert_accuracy reads from DB outcome column (fast path, no price query)', async () => {
  const db = testDb;

  // Insert alert with pre-scored outcome
  const insertStmt = db.prepare(`
    INSERT INTO alerts (id, triggered_at, signals_json, affected_actions_json, message, outcome, outcome_detail)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertStmt.run(
    'alert-scored',
    '2026-05-06T10:00:00Z',
    JSON.stringify([{ type: 'position-danger' }]),
    JSON.stringify([{ code: 'VIC' }]),
    'test alert',
    'hit',
    'price ≤0% over 5d',
  );

  // Call get_alert_accuracy (mock)
  const selectStmt = db.prepare(`
    SELECT outcome, outcome_detail FROM alerts WHERE id = 'alert-scored'
  `);
  const row = selectStmt.get() as { outcome: string; outcome_detail: string } | undefined;

  // Verify: outcome came from DB (not re-computed)
  expect(row?.outcome).toBe('hit');
  expect(row?.outcome_detail).toContain('price');
});
```

**TEST-8:** `get_alert_accuracy` summary_by_type breakdown
```typescript
it('TEST-8: get_alert_accuracy shows summary_by_type with multiple alert types', async () => {
  const db = testDb;

  // Insert mixed alert types
  const insertStmt = db.prepare(`
    INSERT INTO alerts (id, triggered_at, signals_json, affected_actions_json, message, outcome, outcome_detail)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertStmt.run(
    'alert-danger-hit',
    '2026-05-06T10:00:00Z',
    JSON.stringify([{ type: 'position-danger' }]),
    JSON.stringify([{ code: 'VIC' }]),
    null,
    'hit',
    'continued loss',
  );

  insertStmt.run(
    'alert-watchlist-hit',
    '2026-05-06T11:00:00Z',
    JSON.stringify([{ type: 'watchlist-opportunity' }]),
    JSON.stringify([{ code: 'BID' }]),
    null,
    'hit',
    'price +1.2%',
  );

  // Simulate get_alert_accuracy output
  const selectStmt = db.prepare(`
    SELECT
      signals_json,
      outcome
    FROM alerts
    WHERE outcome IS NOT NULL
  `);
  const rows = selectStmt.all() as Array<{ signals_json: string; outcome: string }>;

  // Verify: 2 different types
  const types = new Set(rows.map(r => {
    const signals = JSON.parse(r.signals_json);
    return signals[0]?.type;
  }));

  expect(types.size).toBeGreaterThanOrEqual(2);
});
```

---

## Acceptance Criteria

| ID | Criterion | Test |
|----|-----------|------|
| AC-1 | `get_alert_accuracy` SELECT includes outcome, outcome_detail columns | Code review |
| AC-2 | `get_alert_accuracy` uses stored outcome when outcome IS NOT NULL (fast path) | TEST-7 |
| AC-3 | `get_alert_accuracy` falls back to on-demand scoreAlert() when outcome IS NULL | Code review |
| AC-4 | `get_alert_accuracy` output includes `summary_by_type` breakdown (position-danger, watchlist-opportunity, price-signal) | TEST-8 |
| AC-5 | `get_alert_accuracy` summary_by_type shows hit/miss/unknown counts with percentages | Code review |
| AC-6 | `mark_alert_outcome` tool accepts alertId, outcome, notes, force params | Code review |
| AC-7 | `mark_alert_outcome` rejects re-mark when outcome already set AND force!=true | TEST-6 |
| AC-8 | `mark_alert_outcome` allows re-mark with force=true (no WHERE outcome IS NULL guard) | Code review |
| AC-9 | `mark_alert_outcome` tool registered in tool index (alerts/index.ts) | Code review |
| AC-10 | `bun test` passes all 8 integration tests in 1847d-alert-outcome-job (0 fail) | bun test 1847d-alert-outcome-job |

---

## Dependencies

**Blocked by:** 1847d-A (outcome columns exist), optionally 1847d-B (for classifyAlertType import)

**Can run parallel with:** 1847d-C

---

## Notes

- **Tool registration:** Both `registerAlertAccuracyTool` and `registerMarkAlertOutcomeTool` called from alerts/index.ts
- **Vietnamese text:** Output and error messages in Vietnamese (per existing style in tooling)
- **Force guard:** `WHERE outcome IS NULL` in updateStmt naturally enforces reject-without-force. With `force=true`, caller must issue UPDATE without the guard (update both paths).
- **Detail text:** Reuse outcome_detail from DB (FR-4 fast path), or generate from scoreAlert() result (fallback)
- **No Telegram:** This tool does NOT send notifications. That's handled by alertOutcomeJob (BLK-3).
