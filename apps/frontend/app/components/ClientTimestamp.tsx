/**
 * ClientTimestamp — client-only time formatting to eliminate React hydration errors.
 *
 * Problem: `toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })` produces
 * different output on the server (Node, no locale data) vs. the browser (V8 with
 * full ICU). The mismatch propagates up the React tree and triggers
 * "the entire root will switch to client rendering".
 *
 * Solution: SSR renders a neutral placeholder ("..."). After mount, useEffect
 * fires on the client and sets the locale-formatted string. No mismatch possible.
 * No suppressHydrationWarning needed anywhere.
 *
 * Exports:
 *   ClientTimestamp — full date + time via toLocaleString("vi-VN", {timeZone})
 *   ClientTimeString — time-only via toLocaleTimeString("vi-VN", {timeZone})
 */

import { useState, useEffect } from "react";

const TIMEZONE = "Asia/Ho_Chi_Minh";
const LOCALE = "vi-VN";
const PLACEHOLDER = "...";

// --------------------------------------------------------------------------
// ClientTimestamp
// --------------------------------------------------------------------------

interface ClientTimestampProps {
  /** ISO 8601 date-time string from loader data. */
  iso: string;
  /** Optional Tailwind class names forwarded to the wrapping <span>. */
  className?: string;
}

/**
 * Renders a full locale date-time string (toLocaleString) only after client mount.
 * Server render produces "..." — no hydration mismatch.
 */
export function ClientTimestamp({ iso, className }: ClientTimestampProps) {
  const [display, setDisplay] = useState<string | null>(null);

  useEffect(() => {
    if (!iso) {
      setDisplay(PLACEHOLDER);
      return;
    }
    try {
      setDisplay(
        new Date(iso).toLocaleString(LOCALE, { timeZone: TIMEZONE }),
      );
    } catch {
      setDisplay(iso);
    }
  }, [iso]);

  return <span className={className}>{display ?? PLACEHOLDER}</span>;
}

// --------------------------------------------------------------------------
// ClientTimeString
// --------------------------------------------------------------------------

interface ClientTimeStringProps {
  /** ISO 8601 date-time string from loader data. */
  iso: string;
  /** Optional Tailwind class names forwarded to the wrapping <span>. */
  className?: string;
}

/**
 * Renders a time-only string (toLocaleTimeString) only after client mount.
 * Server render produces "..." — no hydration mismatch.
 */
export function ClientTimeString({ iso, className }: ClientTimeStringProps) {
  const [display, setDisplay] = useState<string | null>(null);

  useEffect(() => {
    if (!iso) {
      setDisplay(PLACEHOLDER);
      return;
    }
    try {
      setDisplay(
        new Date(iso).toLocaleTimeString(LOCALE, { timeZone: TIMEZONE }),
      );
    } catch {
      setDisplay(iso);
    }
  }, [iso]);

  return <span className={className}>{display ?? PLACEHOLDER}</span>;
}
