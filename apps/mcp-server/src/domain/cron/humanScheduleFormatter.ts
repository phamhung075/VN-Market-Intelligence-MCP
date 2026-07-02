/**
 * humanScheduleFormatter.ts — Pure domain: cron expression → human-readable string
 * (DASH-CRON-RECHECK-TABLE Zone 1, TASK-DASH-CRON-1, FR-1.2)
 *
 * Hand-rolled formatter for the common cron-expression shapes present in
 * apps/mcp-server/src/scheduler/cronConfig.ts (daily HH:MM / weekdays HH:MM /
 * every-N-min / every-N-min restricted-hour window / every-N-hour / hourly at
 * :MM / comma-list minutes / weekly-DOW / monthly-DOM / quarterly month-list).
 *
 * NFR-1 (honesty): an unrecognized shape returns the raw expression string
 * passthrough — NEVER a fabricated or misleading description. This is why the
 * function is deliberately NOT a 100%-coverage cron-to-English library; a small
 * set of precise, verified shapes plus an honest fallback beats a plausible-but-
 * wrong guess (architect brief §3, "Deliberately avoids adding a 2nd new
 * dependency (cronstrue)").
 *
 * DDD layer: domain — zero imports, pure function (Fence-A compliant).
 */

const DOW_NAMES: Readonly<Record<string, string>> = {
  "0": "Sunday",
  "1": "Monday",
  "2": "Tuesday",
  "3": "Wednesday",
  "4": "Thursday",
  "5": "Friday",
  "6": "Saturday",
};

function pad2(raw: string): string {
  return raw.padStart(2, "0");
}

/** Returns null when the dow field shape is unrecognized (caller falls back to passthrough). */
function describeDow(dow: string): string | null {
  if (dow === "*") return null;
  if (dow === "1-5") return "weekdays";
  if (dow === "0,6" || dow === "6,0") return "weekends";
  const single = DOW_NAMES[dow];
  if (single) return single;
  if (/^\d+(,\d+)+$/.test(dow)) {
    const names = dow.split(",").map((d) => DOW_NAMES[d] ?? null);
    if (names.every((n): n is string => n !== null)) {
      return names.join("/");
    }
  }
  return null;
}

/**
 * Build a short human-readable description of a 5-field cron expression.
 * Non-5-field or unrecognized shapes are passed through verbatim (NFR-1).
 */
export function buildHumanSchedule(cronExpr: string): string {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) {
    return cronExpr;
  }
  const [minute, hour, dom, month, dow] = parts as [string, string, string, string, string];

  // every-N-min, optionally restricted to an hour window, optionally DOW-restricted
  const minEvery = minute.match(/^\*\/(\d+)$/);
  if (minEvery && dom === "*" && month === "*") {
    const n = minEvery[1]!;
    if (hour === "*") {
      const dowLabel = describeDow(dow);
      return dowLabel ? `every ${n} min, ${dowLabel}` : `every ${n} min`;
    }
    const hourRange = hour.match(/^(\d+)-(\d+)$/);
    if (hourRange) {
      const [, h1, h2] = hourRange as unknown as [string, string, string];
      const dowLabel = describeDow(dow);
      const base = `every ${n} min, ${pad2(h1)}:00-${pad2(h2)}:59 UTC`;
      return dowLabel ? `${base} ${dowLabel}` : base;
    }
  }

  // every-N-hour (fixed minute)
  const hourEvery = hour.match(/^\*\/(\d+)$/);
  if (hourEvery && dom === "*" && month === "*" && /^\d+$/.test(minute)) {
    return `every ${hourEvery[1]} hours`;
  }

  // hourly at a fixed minute (minute fixed, hour="*")
  if (/^\d+$/.test(minute) && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return `hourly at :${pad2(minute)}`;
  }

  // comma-list minutes, hour="*" — N fires per hour
  if (/^\d+(,\d+)+$/.test(minute) && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    const mins = minute.split(",");
    return `${mins.length}x/hour at :${mins.map(pad2).join(", :")} UTC`;
  }

  // fixed HH:MM time-of-day
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour)) {
    const hhmm = `${pad2(hour)}:${pad2(minute)} UTC`;
    const domIsAny = dom === "*";
    const domIsFixed = /^\d+$/.test(dom);
    const monthIsAny = month === "*";

    if (domIsFixed && monthIsAny) {
      return `monthly (day ${dom}) ${hhmm}`;
    }
    if (domIsFixed && !monthIsAny) {
      return `quarterly (day ${dom}) ${hhmm}`;
    }
    // Any other dom shape (range/list, e.g. "25-31") is NOT a covered shape —
    // silently ignoring it here would misrepresent the schedule (NFR-1), so
    // only proceed to the dow-based description when dom is genuinely "*".
    if (domIsAny && monthIsAny) {
      const dowLabel = describeDow(dow);
      if (dowLabel === "weekdays") return `weekdays ${hhmm}`;
      if (dowLabel === "weekends") return `weekends ${hhmm}`;
      if (dowLabel) return `${dowLabel} ${hhmm}`;
      if (dow === "*") return `daily ${hhmm}`;
    }
  }

  // honest passthrough — unrecognized shape (NFR-1, never fabricate)
  return cronExpr;
}
