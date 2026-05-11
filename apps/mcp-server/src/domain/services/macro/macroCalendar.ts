/**
 * Domain Service — Macro Calendar
 *
 * Pure function. No DB access. Returns next N days of macro events
 * (FOMC meetings, GSO data releases, Vietnam PMI, SBV meetings)
 * with pivot-window detection for months 3, 6, 9, 12.
 *
 * Task 1423e
 *
 * @module domain/services/macro/macroCalendar
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface MacroEvent {
  /** YYYY-MM-DD */
  date: string;
  /** Human-readable event name, e.g. "GSO CPI Release" */
  name: string;
  type: "CPI" | "GDP" | "PMI" | "FOMC" | "SBV" | "OTHER";
  /** "GSO" | "S&P Global" | "Fed" | "SBV" */
  source: string;
  /** true if event month is 3, 6, 9, or 12 */
  isPivotWindow: boolean;
  description: string;
}

export interface MacroCalendarResult {
  /** Events within the requested window, sorted ascending by date */
  events: MacroEvent[];
  currentMonthIsPivotWindow: boolean;
  /** e.g. "June 2026" */
  nextPivotWindow: string;
  /** Non-null when within 14 days of a pivot month start */
  pivotWindowWarning: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Static calendar data — 2026
// ─────────────────────────────────────────────────────────────────────────────

/** Months that are pivot windows (quarter-end reporting months). */
const PIVOT_MONTHS = new Set([3, 6, 9, 12]);

interface RawEvent {
  date: string; // YYYY-MM-DD
  name: string;
  type: MacroEvent["type"];
  source: string;
  description: string;
}

/**
 * Static seed calendar for 2026.
 * Dates are approximate and should be updated annually.
 */
const STATIC_EVENTS_2026: RawEvent[] = [
  // ── FOMC meetings ──────────────────────────────────────────────────────────
  {
    date: "2026-01-29",
    name: "FOMC Meeting",
    type: "FOMC",
    source: "Fed",
    description:
      "Federal Open Market Committee rate decision. Impacts USD/VND and global risk sentiment.",
  },
  {
    date: "2026-03-19",
    name: "FOMC Meeting",
    type: "FOMC",
    source: "Fed",
    description:
      "Federal Open Market Committee rate decision. Pivot window — elevated VN market sensitivity.",
  },
  {
    date: "2026-05-07",
    name: "FOMC Meeting",
    type: "FOMC",
    source: "Fed",
    description: "Federal Open Market Committee rate decision.",
  },
  {
    date: "2026-06-18",
    name: "FOMC Meeting",
    type: "FOMC",
    source: "Fed",
    description:
      "Federal Open Market Committee rate decision. Pivot window — Q2 close, elevated sensitivity.",
  },
  {
    date: "2026-07-30",
    name: "FOMC Meeting",
    type: "FOMC",
    source: "Fed",
    description: "Federal Open Market Committee rate decision.",
  },
  {
    date: "2026-09-17",
    name: "FOMC Meeting",
    type: "FOMC",
    source: "Fed",
    description:
      "Federal Open Market Committee rate decision. Pivot window — Q3 close.",
  },
  {
    date: "2026-10-29",
    name: "FOMC Meeting",
    type: "FOMC",
    source: "Fed",
    description: "Federal Open Market Committee rate decision.",
  },
  {
    date: "2026-12-10",
    name: "FOMC Meeting",
    type: "FOMC",
    source: "Fed",
    description:
      "Federal Open Market Committee rate decision. Pivot window — year-end, elevated sensitivity.",
  },

  // ── GSO CPI — first week of each month ────────────────────────────────────
  {
    date: "2026-01-05",
    name: "GSO CPI Release",
    type: "CPI",
    source: "GSO",
    description:
      "General Statistics Office monthly CPI release. Impacts SBV rate expectations and retail sector.",
  },
  {
    date: "2026-02-05",
    name: "GSO CPI Release",
    type: "CPI",
    source: "GSO",
    description:
      "General Statistics Office monthly CPI release.",
  },
  {
    date: "2026-03-05",
    name: "GSO CPI Release",
    type: "CPI",
    source: "GSO",
    description:
      "General Statistics Office monthly CPI release. Pivot window — Q1 close.",
  },
  {
    date: "2026-04-06",
    name: "GSO CPI Release",
    type: "CPI",
    source: "GSO",
    description: "General Statistics Office monthly CPI release.",
  },
  {
    date: "2026-05-06",
    name: "GSO CPI Release",
    type: "CPI",
    source: "GSO",
    description: "General Statistics Office monthly CPI release.",
  },
  {
    date: "2026-06-04",
    name: "GSO CPI Release",
    type: "CPI",
    source: "GSO",
    description:
      "General Statistics Office monthly CPI release. Pivot window — Q2 close.",
  },
  {
    date: "2026-07-06",
    name: "GSO CPI Release",
    type: "CPI",
    source: "GSO",
    description: "General Statistics Office monthly CPI release.",
  },
  {
    date: "2026-08-05",
    name: "GSO CPI Release",
    type: "CPI",
    source: "GSO",
    description: "General Statistics Office monthly CPI release.",
  },
  {
    date: "2026-09-04",
    name: "GSO CPI Release",
    type: "CPI",
    source: "GSO",
    description:
      "General Statistics Office monthly CPI release. Pivot window — Q3 close.",
  },
  {
    date: "2026-10-06",
    name: "GSO CPI Release",
    type: "CPI",
    source: "GSO",
    description: "General Statistics Office monthly CPI release.",
  },
  {
    date: "2026-11-05",
    name: "GSO CPI Release",
    type: "CPI",
    source: "GSO",
    description: "General Statistics Office monthly CPI release.",
  },
  {
    date: "2026-12-04",
    name: "GSO CPI Release",
    type: "CPI",
    source: "GSO",
    description:
      "General Statistics Office monthly CPI release. Pivot window — Q4 close.",
  },

  // ── GSO GDP — ~15th of Jan/Apr/Jul/Oct ────────────────────────────────────
  {
    date: "2026-01-15",
    name: "GSO GDP Release",
    type: "GDP",
    source: "GSO",
    description:
      "General Statistics Office quarterly GDP release (Q4 prior year). Key macro growth indicator.",
  },
  {
    date: "2026-04-15",
    name: "GSO GDP Release",
    type: "GDP",
    source: "GSO",
    description:
      "General Statistics Office quarterly GDP release (Q1). Growth data for banking and construction.",
  },
  {
    date: "2026-07-15",
    name: "GSO GDP Release",
    type: "GDP",
    source: "GSO",
    description:
      "General Statistics Office quarterly GDP release (Q2). Mid-year growth assessment.",
  },
  {
    date: "2026-10-15",
    name: "GSO GDP Release",
    type: "GDP",
    source: "GSO",
    description:
      "General Statistics Office quarterly GDP release (Q3). Pivot window — Q3 close.",
  },

  // ── Vietnam PMI — ~2nd business day of each month ─────────────────────────
  {
    date: "2026-01-05",
    name: "Vietnam PMI Release",
    type: "PMI",
    source: "S&P Global",
    description:
      "S&P Global Vietnam Manufacturing PMI. Leading indicator for industrial output and exports.",
  },
  {
    date: "2026-02-03",
    name: "Vietnam PMI Release",
    type: "PMI",
    source: "S&P Global",
    description: "S&P Global Vietnam Manufacturing PMI.",
  },
  {
    date: "2026-03-03",
    name: "Vietnam PMI Release",
    type: "PMI",
    source: "S&P Global",
    description:
      "S&P Global Vietnam Manufacturing PMI. Pivot window — Q1 close.",
  },
  {
    date: "2026-04-02",
    name: "Vietnam PMI Release",
    type: "PMI",
    source: "S&P Global",
    description: "S&P Global Vietnam Manufacturing PMI.",
  },
  {
    date: "2026-05-05",
    name: "Vietnam PMI Release",
    type: "PMI",
    source: "S&P Global",
    description: "S&P Global Vietnam Manufacturing PMI.",
  },
  {
    date: "2026-06-02",
    name: "Vietnam PMI Release",
    type: "PMI",
    source: "S&P Global",
    description:
      "S&P Global Vietnam Manufacturing PMI. Pivot window — Q2 close.",
  },
  {
    date: "2026-07-02",
    name: "Vietnam PMI Release",
    type: "PMI",
    source: "S&P Global",
    description: "S&P Global Vietnam Manufacturing PMI.",
  },
  {
    date: "2026-08-04",
    name: "Vietnam PMI Release",
    type: "PMI",
    source: "S&P Global",
    description: "S&P Global Vietnam Manufacturing PMI.",
  },
  {
    date: "2026-09-02",
    name: "Vietnam PMI Release",
    type: "PMI",
    source: "S&P Global",
    description:
      "S&P Global Vietnam Manufacturing PMI. Pivot window — Q3 close.",
  },
  {
    date: "2026-10-02",
    name: "Vietnam PMI Release",
    type: "PMI",
    source: "S&P Global",
    description: "S&P Global Vietnam Manufacturing PMI.",
  },
  {
    date: "2026-11-03",
    name: "Vietnam PMI Release",
    type: "PMI",
    source: "S&P Global",
    description: "S&P Global Vietnam Manufacturing PMI.",
  },
  {
    date: "2026-12-02",
    name: "Vietnam PMI Release",
    type: "PMI",
    source: "S&P Global",
    description:
      "S&P Global Vietnam Manufacturing PMI. Pivot window — Q4 close.",
  },

  // ── SBV meetings — quarterly (Mar, Jun, Sep, Dec) ─────────────────────────
  {
    date: "2026-03-25",
    name: "SBV Monetary Policy Meeting",
    type: "SBV",
    source: "SBV",
    description:
      "State Bank of Vietnam quarterly policy meeting. Rate decisions impact VCB, BID, CTG, TCB.",
  },
  {
    date: "2026-06-24",
    name: "SBV Monetary Policy Meeting",
    type: "SBV",
    source: "SBV",
    description:
      "State Bank of Vietnam quarterly policy meeting. Pivot window — Q2 close.",
  },
  {
    date: "2026-09-23",
    name: "SBV Monetary Policy Meeting",
    type: "SBV",
    source: "SBV",
    description:
      "State Bank of Vietnam quarterly policy meeting. Pivot window — Q3 close.",
  },
  {
    date: "2026-12-23",
    name: "SBV Monetary Policy Meeting",
    type: "SBV",
    source: "SBV",
    description:
      "State Bank of Vietnam quarterly policy meeting. Pivot window — Q4/year-end close.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns true if the 1-based month number is a pivot window (3, 6, 9, 12). */
export function isPivotMonth(month: number): boolean {
  return PIVOT_MONTHS.has(month);
}

/**
 * Returns a human-readable label for the next pivot month after the given date.
 * e.g. "June 2026"
 */
export function nextPivotWindowLabel(referenceDate: Date): string {
  const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  let month = referenceDate.getMonth() + 1; // 1-based
  let year = referenceDate.getFullYear();

  // Advance past the current month to find the NEXT pivot
  month += 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }

  // Walk forward until we land on a pivot month
  while (!isPivotMonth(month)) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * Returns a warning string if the reference date is within 14 days of the
 * start of the next pivot month, otherwise null.
 */
export function buildPivotWindowWarning(referenceDate: Date): string | null {
  const DAYS_14_MS = 14 * 24 * 60 * 60 * 1000;

  let month = referenceDate.getMonth() + 1;
  let year = referenceDate.getFullYear();

  // Find the start of the next pivot month (same logic as nextPivotWindowLabel)
  month += 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  while (!isPivotMonth(month)) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  const nextPivotStart = new Date(year, month - 1, 1); // first day of pivot month
  const msUntilPivot = nextPivotStart.getTime() - referenceDate.getTime();

  if (msUntilPivot >= 0 && msUntilPivot <= DAYS_14_MS) {
    const MONTH_NAMES = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const label = `${MONTH_NAMES[month - 1]} ${year}`;
    const daysLeft = Math.ceil(msUntilPivot / (24 * 60 * 60 * 1000));
    return `Entering pivot window ${label} in ${daysLeft} day${daysLeft === 1 ? "" : "s"} — heightened macro sensitivity expected`;
  }

  return null;
}

/** Format a Date as YYYY-MM-DD in local time. */
function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns macro calendar events within the next `days` days from referenceDate.
 *
 * @param referenceDate - Start of the window (defaults to today).
 * @param days          - Window length in days (default 60).
 */
export function getMacroCalendar(
  referenceDate?: Date,
  days = 60,
): MacroCalendarResult {
  const ref = referenceDate ?? new Date();

  // Window boundaries (inclusive on both ends, compared as date strings)
  const startStr = toDateString(ref);

  const endDate = new Date(ref);
  endDate.setDate(endDate.getDate() + days - 1);
  const endStr = toDateString(endDate);

  // Filter and annotate events
  const events: MacroEvent[] = STATIC_EVENTS_2026.filter(
    (e) => e.date >= startStr && e.date <= endStr,
  )
    .map((e) => {
      const eventMonth = parseInt(e.date.slice(5, 7), 10);
      return {
        date: e.date,
        name: e.name,
        type: e.type,
        source: e.source,
        isPivotWindow: isPivotMonth(eventMonth),
        description: e.description,
      } satisfies MacroEvent;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const currentMonth = ref.getMonth() + 1;
  const currentMonthIsPivotWindow = isPivotMonth(currentMonth);
  const nextPivotWindow = nextPivotWindowLabel(ref);
  const pivotWindowWarning = buildPivotWindowWarning(ref);

  return {
    events,
    currentMonthIsPivotWindow,
    nextPivotWindow,
    pivotWindowWarning,
  };
}
