---
name: delete_backtest_run
type: tool
package: unified-coordination
related_tools: get_backtest_run, export_backtest_run_csv
complexity: simple
---

# delete_backtest_run

Delete a completed backtest run from the database. Frees storage for table bloat prevention. Returns confirmed deletion with affected record count (trades deleted, settings archived).

**Lifecycle management:** After running `run_backtest()` and analyzing results, delete runs you no longer need to keep the runs table from growing unbounded.

## Arguments

- **run_id** (string) — **required**
  - Backtest run ID (from `run_backtest()` response or `get_backtest_run()` list)

- **archive_before_delete** (boolean) — optional, default: true
  - If true, save results to archive file (JSON) before deletion. Enables offline analysis later.

- **force** (boolean) — optional, default: false
  - If true, delete even if run is still in progress. Use only for cleanup of stale runs.

## Return Type

```typescript
{
  success: boolean,
  run_id: string,
  deletion_status: "completed" | "archived_only",
  records_deleted: {
    trades: number,
    settings: number,
    metrics: number
  },
  archive_path?: string,  // If archive_before_delete=true
  timestamp: string
}
```

## Example Usage

### Analyst — Cleanup After Analysis
```typescript
// After analyzing backtest results and deciding strategy isn't viable
const deleted = await call_tool("vn-market", "delete_backtest_run", {
  run_id: "bt_2026050401_strategy-fpt-breakout-v3",
  archive_before_delete: true,  // Save to archive in case we revisit
  force: false
});

console.log(`✅ Run deleted: ${deleted.records_deleted.trades} trades, ${deleted.records_deleted.settings} settings archived`);

if (deleted.archive_path) {
  console.log(`📁 Archived to: ${deleted.archive_path}`);
}
```

### PO — Monthly Cleanup (Prevent Table Bloat)
```typescript
// At month-end, delete old runs to keep storage reasonable
const allRuns = await call_tool("vn-market", "get_backtest_run", {
  limit: 100
});

// Keep only last 10 runs; delete older ones
const toDelete = allRuns.runs.slice(10);

for (const run of toDelete) {
  const deleted = await call_tool("vn-market", "delete_backtest_run", {
    run_id: run.run_id,
    archive_before_delete: true
  });

  console.log(`Deleted ${run.run_id}: ${deleted.records_deleted.trades} trades`);
}

console.log(`✅ Cleanup complete. Freed storage for ${toDelete.length} old runs.`);
```

### Ops — Disk Space Recovery
```typescript
// If database disk space is high, aggressive cleanup
const health = await call_tool("vn-market", "get_pipeline_health", {});

if (health.summary.db_disk_pct > 80) {
  console.log("🔴 DB disk > 80%. Aggressive cleanup...");

  // Delete all runs older than 30 days
  const allRuns = await call_tool("vn-market", "get_backtest_run", {
    limit: 1000  // Get all
  });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const oldRuns = allRuns.runs.filter(r => new Date(r.created_at) < thirtyDaysAgo);

  let freedTrades = 0;
  for (const run of oldRuns) {
    const deleted = await call_tool("vn-market", "delete_backtest_run", {
      run_id: run.run_id,
      archive_before_delete: false  // No archive; old data
    });

    freedTrades += deleted.records_deleted.trades;
  }

  console.log(`Freed ${freedTrades} trade records from ${oldRuns.length} old runs`);
}
```

## When to Use

- **After analysis** — Keep only runs you're actively studying
- **Monthly cleanup** — Prevent runs table from growing unbounded
- **Disk space pressure** — Aggressive deletion of old runs
- **Never use** — If run is in-progress (wait for completion first)

## Related Tools

| Tool | Use Case |
|------|----------|
| `get_backtest_run` | List runs; identify which to delete |
| `export_backtest_run_csv` | Export before deletion if you need trade-level data later |
| `compare_backtest_runs` | Compare runs before deleting one |

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `run_id not found` | Run already deleted or ID wrong | Check run IDs via get_backtest_run |
| `deletion_status: "in_progress"` | Run still running | Wait for completion or use force=true |
| `archive_path: null` | Archive write failed | Proceed with deletion anyway; data lost |

## Notes

- **Archive storage:** Archives saved to `docs/data/backtest-archives/` (not in main DB). Infinite retention.
- **Cascading delete:** Deleting run also deletes all associated trades, metrics, settings. Non-reversible.
- **Force flag:** Use sparingly. If run is stuck in-progress, investigate why before forcing deletion.
- **Lifecycle:** Expected flow: run_backtest → get_backtest_run → export_backtest_run_csv → delete_backtest_run

## Last Updated

Generated: 2026-05-04 (new tool, Sprint 1846)
Enriched: 2026-05-04 (v1 — arguments, 3 workflow examples, cleanup patterns, lifecycle management)
