/**
 * Task 187 — Earnings Calendar domain service
 *
 * Pure domain logic: compute Vietnamese BCTC statutory filing deadlines and
 * classify filing status for a given stock + date combination.
 *
 * Vietnamese BCTC statutory deadlines (calendar days after quarter end):
 *  - Q1 (ends 31 Mar): April 30 of the same year
 *  - Q2 (ends 30 Jun): July 30 of the same year
 *  - Q3 (ends 30 Sep): October 30 of the same year
 *  - Q4/Annual (ends 31 Dec): March 30 of the NEXT year
 *
 * Status labels:
 *  - DA_NOP    → filed, show filing date
 *  - QUA_HAN   → deadline passed, no filing
 *  - SAP_DEN   → deadline within 14 days (inclusive), no filing
 *  - UOC_TINH  → deadline more than 14 days away, no filing (estimated)
 *
 * @module domain/services/earningsCalendar
 */

import { MS_PER_DAY } from "../timeConstants.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type FilingStatusCode = "DA_NOP" | "QUA_HAN" | "SAP_DEN" | "UOC_TINH";

export interface FilingStatus {
  /** Classification result */
  status: FilingStatusCode;
  /** ISO date string of actual filing, only present when status === "DA_NOP" */
  filingDate?: string;
  /** Days until deadline (negative = overdue), undefined for DA_NOP */
  daysUntilDeadline?: number;
}

export interface DeadlineInfo {
  /** Quarter number 1-4 */
  quarter: 1 | 2 | 3 | 4;
  /** Fiscal year of the quarter */
  year: number;
  /** Statutory filing deadline date */
  deadline: Date;
}

export interface ClassifyInput extends DeadlineInfo {
  /** ISO date string of existing filing, or null if no filing found */
  filingDate: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Days-before-deadline threshold for SAP_DEN classification */
const SAP_DEN_WINDOW_DAYS = 14;

/**
 * Domains that have a 45-day filing deadline instead of the standard 30 days.
 * Per Vietnamese regulations, banks and insurance companies file within 45 days.
 */
const EXTENDED_DEADLINE_DOMAINS = new Set(["banking", "insurance"]);

// ─────────────────────────────────────────────────────────────────────────────
// Core functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the statutory BCTC filing deadline for a given fiscal quarter.
 *
 * Standard deadline: 30 days after quarter end.
 * Banking/Insurance: 45 days after quarter end (Vietnamese regulation).
 *
 * @param year    - Fiscal year of the quarter (e.g. 2024)
 * @param quarter - Quarter number: 1, 2, 3, or 4
 * @param domain  - Optional sector domain; banking/insurance get 45-day deadline
 * @returns Date object set to midnight UTC of the deadline day
 */
export function getDeadlineForQuarter(year: number, quarter: 1 | 2 | 3 | 4, domain?: string): Date {
  const extended = domain ? EXTENDED_DEADLINE_DOMAINS.has(domain) : false;

  // Q4 = annual report: 90 days after fiscal year end (standard) / 105 days (banking/insurance)
  // Q1-Q3 = quarterly report: 30 days (standard) / 45 days (banking/insurance)
  if (quarter === 4) {
    // Annual: Dec 31 + 90 days = Mar 31 next year (standard), +105 days = Apr 15 (extended)
    const qEnd = new Date(`${year}-12-31`);
    qEnd.setDate(qEnd.getDate() + (extended ? 105 : 90));
    return qEnd;
  }

  const quarterEndDates: Record<number, string> = {
    1: `${year}-03-31`,
    2: `${year}-06-30`,
    3: `${year}-09-30`,
  };
  const qEnd = new Date(quarterEndDates[quarter]!);
  qEnd.setDate(qEnd.getDate() + (extended ? 45 : 30));
  return qEnd;
}

/**
 * Determine the most relevant upcoming deadline as of `today`.
 *
 * Logic: find the first deadline (in chronological order) that is strictly
 * after today. This is the *next* quarter companies must file for.
 *
 * @param today - Reference date (usually current date)
 * @returns DeadlineInfo for the next upcoming filing deadline
 */
export function getNextDeadline(today: Date, domain?: string): DeadlineInfo {
  const candidates = _buildCandidates(today, domain);

  // Return the first deadline that is strictly after today
  for (const candidate of candidates) {
    if (today.getTime() < candidate.deadline.getTime()) {
      return candidate;
    }
  }

  // Fallback: return next year Q2 (should never happen in practice)
  const year = today.getFullYear();
  return {
    quarter: 2,
    year: year + 1,
    deadline: getDeadlineForQuarter(year + 1, 2, domain),
  };
}

/**
 * Determine the most recently due (last passed or just-expired) deadline as
 * of `today`. This is the quarter whose filing is currently most relevant to
 * track — it may already be past its deadline.
 *
 * Use this when you want to show the *current accountability quarter*:
 * - If today < first-ever deadline: returns the upcoming one (same as getNextDeadline)
 * - Otherwise: returns the last deadline that has already passed (or today)
 *
 * @param today - Reference date (usually current date)
 * @returns DeadlineInfo for the most recently relevant filing deadline
 */
export function getCurrentDeadline(today: Date, domain?: string): DeadlineInfo {
  const candidates = _buildCandidates(today, domain);
  const todayMs = today.getTime();

  // Find the last candidate whose deadline <= today
  let last: DeadlineInfo | null = null;
  for (const candidate of candidates) {
    if (candidate.deadline.getTime() <= todayMs) {
      last = candidate;
    }
  }

  // If no deadline has passed yet, return the first upcoming
  if (!last) {
    return candidates[0] ?? getNextDeadline(today, domain);
  }

  return last;
}

/**
 * Build the ordered chronological list of deadline candidates around `today`.
 * Internal helper used by getNextDeadline and getCurrentDeadline.
 */
function _buildCandidates(today: Date, domain?: string): DeadlineInfo[] {
  const year = today.getFullYear();
  return [
    // Previous year Q4 (deadline in current year)
    { quarter: 4 as const, year: year - 1, deadline: getDeadlineForQuarter(year - 1, 4, domain) },
    // Current year quarters
    { quarter: 1 as const, year, deadline: getDeadlineForQuarter(year, 1, domain) },
    { quarter: 2 as const, year, deadline: getDeadlineForQuarter(year, 2, domain) },
    { quarter: 3 as const, year, deadline: getDeadlineForQuarter(year, 3, domain) },
    { quarter: 4 as const, year, deadline: getDeadlineForQuarter(year, 4, domain) },
    // Next year Q1
    { quarter: 1 as const, year: year + 1, deadline: getDeadlineForQuarter(year + 1, 1, domain) },
  ];
}

/**
 * Classify the filing status of a single stock for a given quarter/deadline.
 *
 * Priority rules (order matters):
 *  1. If filingDate is set → DA_NOP (filed, regardless of timing)
 *  2. If today > deadline  → QUA_HAN (overdue)
 *  3. If days until deadline <= SAP_DEN_WINDOW_DAYS → SAP_DEN (imminent)
 *  4. Otherwise            → UOC_TINH (far deadline, estimated)
 *
 * @param today - Reference date for classification
 * @param input - Deadline info + optional filing date
 * @returns FilingStatus with status code and contextual fields
 */
export function classifyFilingStatus(today: Date, input: ClassifyInput): FilingStatus {
  const { filingDate, deadline } = input;

  // Rule 1: filed
  if (filingDate !== null && filingDate !== undefined) {
    return { status: "DA_NOP", filingDate };
  }

  // Compare calendar dates (YYYY-MM-DD) to avoid time-of-day bias.
  // Raw millisecond subtraction causes off-by-one: a UTC-midnight deadline
  // becomes negative once any wall-clock time has elapsed on the same day.
  const todayDate = today.toISOString().slice(0, 10);
  const deadlineDate = deadline.toISOString().slice(0, 10);
  const todayUTC = Date.UTC(
    parseInt(todayDate.slice(0, 4), 10),
    parseInt(todayDate.slice(5, 7), 10) - 1,
    parseInt(todayDate.slice(8, 10), 10),
  );
  const deadlineUTC = Date.UTC(
    parseInt(deadlineDate.slice(0, 4), 10),
    parseInt(deadlineDate.slice(5, 7), 10) - 1,
    parseInt(deadlineDate.slice(8, 10), 10),
  );
  const daysUntilDeadline = Math.round((deadlineUTC - todayUTC) / MS_PER_DAY);

  // Rule 2: overdue — deadline calendar date is strictly before today calendar date
  if (daysUntilDeadline < 0) {
    return { status: "QUA_HAN", daysUntilDeadline };
  }

  // Rule 3: imminent (within 14 days, inclusive)
  if (daysUntilDeadline <= SAP_DEN_WINDOW_DAYS) {
    return { status: "SAP_DEN", daysUntilDeadline };
  }

  // Rule 4: far deadline
  return { status: "UOC_TINH", daysUntilDeadline };
}
