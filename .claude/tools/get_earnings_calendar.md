---
name: get_earnings_calendar
type: tool
package: financial-analysis, report-analysis
related_tools: get_bctc_full, get_earnings_calendar
complexity: simple
---

# get_earnings_calendar

Show **BCTC (quarterly financial report) filing deadlines and statuses** for all watchlist stocks. For each stock, displays the next quarterly filing deadline and one of:
- **ĐÃ NỘP** (filed — report available for analysis)
- **QUÁ HẠN** (overdue — report is late, may indicate issues)
- **SẮP ĐẾN** (due within 14 days — imminent filing)
- **(ước tính)** (estimated — deadline > 14 days away)

## Arguments

- **include_historical** (boolean) — optional, default: false
  - If true, include past filing dates (for trend analysis). If false, return only upcoming deadlines.

- **urgent_only** (boolean) — optional, default: false
  - If true, return only stocks with SẮP ĐẾN or QUÁ HẠN status.

## Return Type

```typescript
{
  success: boolean,
  earnings_calendar: Array<{
    stock_code: string,
    quarter: string,  // "2026-Q1", "2026-Q2", etc.
    filing_deadline: string,  // ISO date
    status: "ĐÃ NỘP" | "QUÁ HẠN" | "SẮP ĐẾN" | "ước tính",
    days_until_deadline: number,  // Negative if overdue
    filed_date?: string,  // If ĐÃ NỘP
    filing_url?: string
  }>,
  upcoming_deadlines: {
    [quarter: string]: Array<string>  // Stock codes due that quarter
  },
  overdue_reports: Array<{
    stock_code: string,
    quarter: string,
    days_overdue: number
  }>,
  timestamp: string
}
```

## Example Usage

### Financial Analyst — Quarterly BCTC Tracking
```typescript
const calendar = await call_tool("vn-market", "get_earnings_calendar", {
  include_historical: false,
  urgent_only: false
});

// Identify imminent filings (SẮP ĐẾN)
const imminentFilings = calendar.earnings_calendar.filter(e => e.status === "SẮP ĐẾN");
console.log(`Earnings due within 14 days: ${imminentFilings.length} stocks`);

// Check overdue reports
if (calendar.overdue_reports && calendar.overdue_reports.length > 0) {
  console.log("⚠️ OVERDUE BCTC Reports:");
  for (const overdue of calendar.overdue_reports) {
    console.log(`  ${overdue.stock_code} (${overdue.quarter}): ${overdue.days_overdue} days late`);

    // Overdue reports signal potential issues (audit delays, regulatory problems)
    await call_tool("vn-market", "post_agent_signal", {
      agent: "alert-commander",
      signal_type: "legal_risk",
      confidence: 0.60,
      data: {
        stock: overdue.stock_code,
        issue: `BCTC ${overdue.quarter} filing overdue by ${overdue.days_overdue} days. May signal: audit issues, regulatory investigation, or delay in consolidation.`,
        risk_level: "medium"
      }
    });
  }
}

// Schedule deep-dive analysis for imminent filings
for (const filing of imminentFilings) {
  console.log(`\n📅 ${filing.stock_code} (${filing.quarter}) due in ${filing.days_until_deadline} days`);

  // Prepare analysis for when report lands
  // (BCTC fetch will be available once filing_status = "ĐÃ NỘP")
}
```

### Report Analyzer — Post-Filing BCTC Extraction
```typescript
const calendar = await call_tool("vn-market", "get_earnings_calendar", {
  urgent_only: false
});

// Check for newly filed reports (status changed from SẮP ĐẾN to ĐÃ NỘP)
const newlyFiled = calendar.earnings_calendar.filter(e => e.status === "ĐÃ NỘP" && e.filed_date);

for (const report of newlyFiled) {
  // If report is <= 1 day old, it's newly available
  const filedDate = new Date(report.filed_date);
  const ageHours = (Date.now() - filedDate.getTime()) / (1000 * 3600);

  if (ageHours <= 24) {
    console.log(`🆕 Fresh BCTC available: ${report.stock_code} (${report.quarter})`);

    // Fetch and analyze immediately
    const bctc = await call_tool("vn-market", "get_bctc_full", {
      stock: report.stock_code,
      quarter: report.quarter
    });

    // Extract key metrics and post signal
    await call_tool("vn-market", "post_agent_signal", {
      agent: "alert-commander",
      signal_type: "verified_chain",  // BCTC data is high-confidence
      confidence: 0.90,
      data: {
        stock: report.stock_code,
        quarter: report.quarter,
        revenue_growth: bctc.report.revenue_growth_yoy,
        profit_growth: bctc.report.profit_growth_yoy,
        recommendation: bctc.report.revenue_growth_yoy > 1.15 ? "bullish" : "neutral"
      }
    });
  }
}
```

### Market Watcher — Sector Earnings Season Monitoring
```typescript
const calendar = await call_tool("vn-market", "get_earnings_calendar", {
  include_historical: false
});

// Group by quarter to track "earnings season" momentum
const byQuarter = {};
for (const report of calendar.earnings_calendar) {
  if (!byQuarter[report.quarter]) byQuarter[report.quarter] = { filed: 0, pending: 0, overdue: 0 };
  if (report.status === "ĐÃ NỘP") byQuarter[report.quarter].filed += 1;
  else if (report.status === "QUÁ HẠN") byQuarter[report.quarter].overdue += 1;
  else byQuarter[report.quarter].pending += 1;
}

// Report earnings season progress
const earningsReport = `
📊 **Earnings Calendar Status**

${Object.entries(byQuarter)
  .map(([q, stats]) => `${q}: ${stats.filed} filed, ${stats.pending} pending, ${stats.overdue} overdue`)
  .join("\n")}

Next major filing deadline: ${calendar.upcoming_deadlines[Object.keys(calendar.upcoming_deadlines)[0]]?.[0]} (${Object.keys(calendar.upcoming_deadlines)[0]})
`;

await call_tool("vn-market", "send_telegram", {
  channel: "work",
  message: earningsReport
});
```

### Risk Monitor — Overdue BCTC Alert
```typescript
const calendar = await call_tool("vn-market", "get_earnings_calendar", {
  urgent_only: false
});

// Flag any overdue reports
if (calendar.overdue_reports.length > 0) {
  const overdueAlert = calendar.overdue_reports
    .sort((a, b) => b.days_overdue - a.days_overdue)
    .slice(0, 5);  // Top 5 most overdue

  const alertMsg = `⚠️ **BCTC Filing Overdue**\n${overdueAlert
    .map(o => `• ${o.stock_code} (${o.quarter}): ${o.days_overdue} days late`)
    .join("\n")}`;

  await call_tool("vn-market", "submit_feedback", {
    agent: "financial-analyst",
    title: `${overdueAlert.length} BCTC reports overdue — possible regulatory/audit issues`,
    category: "data_error",
    detail: `Overdue reports: ${overdueAlert.map(o => `${o.stock_code}-${o.quarter}`).join(", ")}. These stocks may have reporting/regulatory issues.`,
    priority: "high",
    to: "@ops"
  });
}
```

## When to Use

- **Daily check** — Financial Analyst checks calendar for newly filed reports
- **Weekly review** — Market Watcher tracks earnings season progress
- **Pre-analysis** — Set alerts for upcoming deadlines (SẮP ĐẾN) so you're ready when report lands
- **Risk monitoring** — Flag overdue reports (QUÁ HẠN) as potential red flags
- **NOT intraday** — Filing dates are known in advance; check daily, not hourly

## Related Tools

| Tool | Use Case |
|------|----------|
| `get_bctc_full` | Fetch actual BCTC data once status = "ĐÃ NỘP" |
| `post_agent_signal` | Post verified_chain signals when new BCTC becomes available |
| `submit_feedback` | Flag overdue reports to @ops or @dev for investigation |

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `earnings_calendar: []` | No watchlist stocks have earnings data | Proceed; unusual but possible for new stocks |
| `filing_url: null` | URL not found even though status = "ĐÃ NỘP" | Manual lookup on VSD website |
| `overdue_reports: many` | Large number of overdue filings | May indicate: market-wide delay (holidays), or data sync issue |

## Notes

- **Filing deadline vs. actual:** Vietnamese companies have deadline (e.g., 45 days after Q-end), but filings may come early or late.
- **Status transitions:** SẮP ĐẾN → ĐÃ NỘP (when available) → can trigger immediate analysis workflow.
- **Quarters:** Vietnam uses calendar quarters: Q1 (Jan-Mar, deadline ~mid-May), Q2 (Apr-Jun, ~mid-Aug), Q3 (Jul-Sep, ~mid-Nov), Q4 (Oct-Dec, ~mid-Mar next year).
- **Regulatory requirement:** All Ho SE + Ha NX companies must file audited/reviewed BCTC within statutory window.
- **Integration with fetching:** Monitor this calendar → when status changes to ĐÃ NỘP, automatically fetch via `get_bctc_full()`.

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — arguments, 4 workflow examples, overdue detection, earnings season tracking)
