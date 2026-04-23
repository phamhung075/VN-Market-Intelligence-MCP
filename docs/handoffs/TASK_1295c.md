# Task Context — 1295c: Signal Quality Audit Service

## TLDR (read this first — complete for simple tasks)
change: `src/application/services/signalQualityAudit.ts` — CREATE audit service with queryRejectionStats() + generateAuditReport() | `src/scheduler/audits/monthlySignalQualityJob.ts` — CREATE monthly cron job (1st month at 00:00 UTC) with threshold alert
test: `src/__tests__/1295c-signal-quality-audit.test.ts` — 10+ assertions on audit stats aggregation + alert logic
branch: task/1295c-audit-service
depends: 1295a (builders must exist, audit tracks rejections from incomplete signals)
knowledge_needed: [bundle-developer, alert-policy]

---

sprint: 1295
branch: task/1295c-audit-service
status: todo
req_ref: none
tech_ref: TECH-1295

---

## [PM] Planning Context

layer: application + scheduler
depends_on: [1295a ✓ builders exist]

files_to_read:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/signalRejectionStore.ts # BCTC rejection audit table (1293c) — schema reference
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/services/index.ts # Barrel export pattern
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/audits/ # Existing audit job structure (reference)
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/knowledge/alert-policy.md # Alert firing rules + Telegram channel policy

files_to_create:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/services/signalQualityAudit.ts # NEW: QueryRejectionStats + GenerateAuditReport
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/audits/monthlySignalQualityJob.ts # NEW: Cron job, runs 1st of month
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1295c-signal-quality-audit.test.ts # NEW: 10+ assertions

files_to_modify:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/services/index.ts # Export signalQualityAudit service
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/cron-registry.ts # Add monthlySignalQualityJob entry

test_file: src/__tests__/1295c-signal-quality-audit.test.ts

acceptance_criteria:
- Given: signal_rejections table with mock rejection records
- When: queryRejectionStats(timeWindowDays=7) is called
- Then: Returns {fromAgent: string, signalType: string, rejectCount: number, topReason: string}[] aggregated by agent + signal type
- When: generateAuditReport() is called after populating rejections
- Then: Returns markdown string with:
  - Total rejection count in time window
  - Rejection rate per 1000 signals (requires signal_count estimate)
  - Top 3 rejecting agents (by count)
  - Top 3 rejection reasons
  - Metrics table with agent × signal type cross-tabulation
- When: monthlySignalQualityJob runs with rejection_rate > 2%
- Then: Sends alert to WORK channel with metric summary
- When: Tests run (bun test 1295c-signal-quality-audit.test.ts)
- Then: 10+ assertions PASS, audit aggregation correct, alert triggered correctly

---

## Implementation Guidance

### signalQualityAudit.ts Structure

```typescript
import { getDB } from "@infrastructure/db";
import { SendTelegramRequest, send_telegram } from "@interface/mcp";

export interface RejectionStat {
  fromAgent: string;
  signalType: string;
  rejectCount: number;
  topReason: string;
}

export class SignalQualityAudit {
  async queryRejectionStats(timeWindowDays: number): Promise<RejectionStat[]> {
    const db = getDB();
    const since = new Date(Date.now() - timeWindowDays * 86400000);

    // Query signal_rejections table
    const results = db.prepare(`
      SELECT from_agent, signal_type, COUNT(*) as reject_count, reason
      FROM signal_rejections
      WHERE created_at > ?
      GROUP BY from_agent, signal_type, reason
      ORDER BY reject_count DESC
    `).all(since.toISOString());

    return results.map((row: any) => ({
      fromAgent: row.from_agent,
      signalType: row.signal_type,
      rejectCount: row.reject_count,
      topReason: row.reason,
    }));
  }

  async generateAuditReport(): Promise<string> {
    const stats = await this.queryRejectionStats(30); // Last 30 days
    const totalRejections = stats.reduce((sum, s) => sum + s.rejectCount, 0);

    // Estimate signal_count from agent_signals table
    const db = getDB();
    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM agent_signals
      WHERE created_at > datetime('now', '-30 days')
    `).get() as { total: number };

    const rejectionRate = countResult.total > 0
      ? totalRejections / countResult.total
      : 0;

    // Generate markdown report
    let report = `# Signal Quality Audit Report\n\n`;
    report += `- Total rejections (30d): ${totalRejections}\n`;
    report += `- Total signals (30d): ${countResult.total}\n`;
    report += `- Rejection rate: ${(rejectionRate * 100).toFixed(2)}%\n\n`;

    // Top agents
    const topAgents = stats.sort((a, b) => b.rejectCount - a.rejectCount).slice(0, 3);
    report += `## Top Rejecting Agents\n\n`;
    topAgents.forEach(s => {
      report += `- ${s.fromAgent}: ${s.rejectCount} rejections (${s.signalType})\n`;
    });

    return report;
  }
}

export async function createSignalQualityAudit(): Promise<SignalQualityAudit> {
  return new SignalQualityAudit();
}
```

### monthlySignalQualityJob.ts Structure

```typescript
import { SignalQualityAudit } from "@application/services";
import { send_telegram } from "@interface/mcp";

export async function runMonthlySignalQualityJob(): Promise<void> {
  const audit = new SignalQualityAudit();
  const report = await audit.generateAuditReport();

  // Parse rejection rate from report
  const rateMatch = report.match(/Rejection rate: (\d+\.?\d*)%/);
  const rejectionRate = rateMatch ? parseFloat(rateMatch[1]) / 100 : 0;

  // Alert if above threshold (2%)
  if (rejectionRate > 0.02) {
    await send_telegram(
      channel="work",
      text=`⚠️ Signal Quality Alert: ${(rejectionRate*100).toFixed(2)}% rejection rate detected.\n\n${report}`
    );
  }

  // Store audit result in DB for historical tracking
  const db = getDB();
  db.prepare(`
    INSERT INTO signal_quality_audits (run_date, report, rejection_rate)
    VALUES (?, ?, ?)
  `).run(new Date().toISOString(), report, rejectionRate);
}

// Export for cron registry
export const monthlySignalQualityJobConfig = {
  name: "monthlySignalQuality",
  schedule: "0 0 1 * *", // 1st of month at 00:00 UTC
  handler: runMonthlySignalQualityJob,
};
```

### Test Scenarios

1. **Scenario 1**: Insert 5 rejection records for News Scout, query 7d → returns aggregated stats
2. **Scenario 2**: Insert 10 rejection records for Market Watcher, generateAuditReport() → includes correct totals
3. **Scenario 3**: Rejection rate > 2% → monthly job sends alert to WORK channel
4. **Scenario 4**: Rejection rate < 2% → monthly job does NOT send alert
5. **Scenario 5**: Empty rejections table → report shows 0 rejections, 0% rate

---

## Notes

- **Database table**: signal_quality_audits (new, tracks monthly audit records)
- **Cron schedule**: `0 0 1 * *` (1st of month, 00:00 UTC)
- **Alert channel**: "work" (WORK channel, not MARKET)
- **Rejection threshold**: 2% (configurable in code)
- **Backward compat**: Old signals in signal_rejections table still tracked (no migration needed)

---

## QA Sign-Off

Task complete when:
- `bun test 1295c-signal-quality-audit.test.ts` → 10+ assertions PASS
- signalQualityAudit service exported in src/application/services/index.ts
- monthlySignalQualityJob registered in cron-registry.ts
- `bun tsc --noEmit` → 0 TS errors
- Audit job can be triggered manually + verified in test DB
