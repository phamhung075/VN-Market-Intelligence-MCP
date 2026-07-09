/**
 * D-7b: Flag overdue BCTC filings (task 310 / report #689 + #699).
 *
 * Walks the watchlist, computes the current statutory deadline per stock
 * (banking/insurance get 45 days, others 30 days), and flags any stock
 * with no financial_reports row for the current quarter when the deadline
 * is past. Surfaces as agent_feedback so the next dev cron loop can act.
 *
 * Split from dataAuditJob.ts (FACTORY-SCHEDULER-split-dataAuditJob) — SQL
 * and finding shape verbatim.
 */

import { Database } from "bun:sqlite";
import { getCurrentDeadline } from "../../../domain/services/financial-reports/earningsCalendar.js";
import { AuditFinding, insertFeedbackIfNew } from "../dataAuditShared.js";

export function checkBctcFilingOverdue(db: Database): AuditFinding[] {
  try {
    const today = new Date();
    const watchlistRows = db
      .query<{ code: string; domain: string }, []>(
        "SELECT code, domain FROM watchlist",
      )
      .all();

    const overdueStocks: string[] = [];
    for (const w of watchlistRows) {
      const dl = getCurrentDeadline(today, w.domain);
      if (dl.deadline.getTime() >= today.getTime()) continue;
      const filed = db
        .query<{ cnt: number }, [string, number, number]>(
          `SELECT COUNT(*) AS cnt FROM financial_reports
           WHERE action_code = ? AND period_year = ? AND period_quarter = ?`,
        )
        .get(w.code, dl.year, dl.quarter);
      if ((filed?.cnt ?? 0) === 0) {
        overdueStocks.push(`${w.code} (Q${dl.quarter}-${dl.year})`);
      }
    }

    const finding: AuditFinding = {
      table: "financial_reports",
      check: "bctc_filing_overdue",
      severity: overdueStocks.length > 0 ? "warning" : "info",
      rowsAffected: overdueStocks.length,
      action: overdueStocks.length > 0 ? "flagged" : "none",
      detail:
        overdueStocks.length > 0
          ? `Overdue BCTC: ${overdueStocks.join(", ")}`.slice(0, 480)
          : "No overdue BCTC filings",
    };
    if (overdueStocks.length > 0) insertFeedbackIfNew(db, finding);
    return [finding];
  } catch (err) {
    return [{
      table: "financial_reports",
      check: "bctc_filing_overdue",
      severity: "warning",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    }];
  }
}
