---
tool: get_cron_health
category: alerts
agents: [system-auditor, unified-agent]
---

# `get_cron_health`

**Category:** alerts | **Used by:** System Auditor, Unified Coordinator
**Description:** Returns per-job health summary: success rate, total runs, avg duration, last status for the past N days. Use job_name to filter to a single job.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| days | number (1-90, integer) | ❌ | 7 | Rolling window in days to aggregate stats over (default: 7, max: 90) |
| job_name | string | ❌ | — | Filter to a single job by its canonical scheduler name (e.g. 'pollNewsJob'). Omit to return all jobs. |

## Returns

Formatted plain-text report:

```
=== CRON JOB HEALTH (last 7 day(s)) ===

pollNewsJob
  last_run:      2026-05-05T08:32:00
  last_status:   success
  last_error:    (none)
  success_rate:  0.87 (87%)
  total_runs:    23
  avg_duration:  412 ms

taAlertScanJob
  last_run:      2026-05-05T09:15:00
  last_status:   success
  last_error:    (none)
  success_rate:  0.95 (95%)
  total_runs:    46
  avg_duration:  892 ms
```

## Usage

```json
{
  "tool_name": "get_cron_health",
  "input": {
    "days": 7,
    "job_name": "pollNewsJob"
  }
}
```

## Notes

- Success rate is percentage of runs that completed without error
- Average duration includes all runs in the window
- Useful for detecting jobs that are failing or running slow
- Last error field shows most recent failure message (if any)
