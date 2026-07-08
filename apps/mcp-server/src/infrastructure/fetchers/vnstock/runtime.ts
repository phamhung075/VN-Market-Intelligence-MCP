/**
 * Infrastructure — vnstock Python-bridge runtime
 *
 * FACTORY-INFRA-split-vnstockBridge: extracted from vnstockBridge.ts. Groups
 * everything the *_SCRIPT templates (now in `./scripts/*.ts`) share at
 * runtime: the rate limiter, rate-limit detection, exponential backoff, ANSI
 * junk detection, the `runPython`/`runPythonWithBackoff` subprocess helpers,
 * and `wrapVnstockScript` (the shared stdout-capture preamble/error-handling
 * template, replacing 9 hand-copied inline copies of the same boilerplate —
 * the FIX-FUNDAMENTALS-REFRESH-CRON-DEAD comment repeated per script was
 * evidence the fix had been hand-applied N times).
 *
 * size-justification: 374L — this is the explicit target named by the
 * FACTORY-INFRA-split-vnstockBridge approach ("move VnstockRateLimiter/
 * runPython/backoff/junk-detection into vnstock/runtime.ts"). These pieces
 * call each other directly (runPythonWithBackoff → runPython →
 * isRateLimitResponse/stripAnsiAndDetectJunk, then calcBackoffMs on retry)
 * and are tested together as one unit (Task 1780, 1776, 1862a). Splitting
 * further would separate tested units from their sole caller for no DDD
 * benefit — same precedent as composition-root.ts / stockAliases.ts
 * (single-file justified modules per docs/policies § size).
 *
 * Layer: infrastructure/fetchers
 */

import { logger } from "../../logger.js";
import { ANSI_JUNK_RE, ANSI_ESCAPE_RE, BOX_DRAWING_RE } from "../../../domain/utils/ansiUtils.js";

// ---------------------------------------------------------------------------
// Python stdout-capture preamble constants (FIX-FUNDAMENTALS-REFRESH-CRON-DEAD)
//
// vnstock added a deprecation-notice banner (box-drawing chars ╭╮│) emitted to
// stdout on every Vnstock().stock() call since 2025-08-31.  isRateLimitResponse()
// uses BOX_DRAWING_RE to detect rate-limiting, so the banner was being mis-detected
// as a rate-limit response — all financial fetches silently returned null.
//
// Fix: inject a compact Python preamble that redirects sys.stdout to a StringIO
// buffer for the duration of the Vnstock() init, then restores it so JSON goes to
// the real stdout. `wrapVnstockScript` below is the single place that now emits
// this preamble — see its docstring for the generated Python shape.
// ---------------------------------------------------------------------------

/**
 * Python preamble that suppresses the vnstock deprecation banner.
 * Exported for unit tests so TC-3 can assert the pattern is present.
 * Superseded at generation-time by `wrapVnstockScript`, which owns the full
 * preamble text; kept as a standalone doc/test constant for backward compat.
 */
export const SUPPRESS_BANNER = `
import io as _io, sys as _sys
_real_stdout = _sys.stdout
_sys.stdout = _io.StringIO()
`;
export const RESTORE_STDOUT = `
_sys.stdout = _real_stdout
`;

// ---------------------------------------------------------------------------
// Global rate limiter — 50 RPM sliding window (Task 1833i)
// ---------------------------------------------------------------------------

export const GLOBAL_RATE_LIMIT_RPM = 80;

/**
 * Sliding-window rate limiter.
 * All Python subprocesses must call acquire() before spawning.
 * At most `rpm` slots available per `windowMs` milliseconds.
 */
export class VnstockRateLimiter {
  private readonly rpm: number;
  private readonly windowMs: number;
  private readonly slots: number[] = [];

  constructor(rpm: number, windowMs = 60_000) {
    this.rpm = rpm;
    this.windowMs = windowMs;
  }

  async acquire(): Promise<void> {
    while (true) {
      const now = Date.now();
      while (this.slots.length > 0 && now - this.slots[0]! >= this.windowMs) {
        this.slots.shift();
      }
      if (this.slots.length < this.rpm) {
        this.slots.push(now);
        return;
      }
      const waitMs = this.windowMs - (now - this.slots[0]!);
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs + 1));
    }
  }
}

const _rateLimiter = new VnstockRateLimiter(GLOBAL_RATE_LIMIT_RPM);

// ---------------------------------------------------------------------------
// Rate-limit detection and exponential backoff (Task 1780)
// ---------------------------------------------------------------------------

/**
 * Returns true when the raw Python stdout looks like a vnstock rate-limit
 * response — i.e. it contains box-drawing characters from the `rich` UI.
 *
 * Distinct from generic errors (AttributeError, etc.) which are NOT rate-limit.
 * Empty or "null" strings are NOT rate-limit (they are legitimate null results).
 *
 * Exported for unit tests.
 */
export function isRateLimitResponse(raw: string): boolean {
  if (!raw || raw.trim() === "null") return false;
  // Strip ANSI escape sequences only (keep box-drawing chars so we can detect them)
  const stripped = raw.replace(ANSI_ESCAPE_RE, "");
  return BOX_DRAWING_RE.test(stripped);
}

/** Options for calcBackoffMs. */
export interface BackoffOptions {
  baseMs: number;
  jitterMs: number;
  maxMs: number;
}

/**
 * Exponential backoff with random jitter.
 * Formula: min(baseMs * 2^attempt + rand(0, jitterMs), maxMs)
 *
 * Exported for unit tests.
 */
export function calcBackoffMs(attempt: number, opts: BackoffOptions): number {
  const exponential = opts.baseMs * Math.pow(2, attempt);
  const jitter = Math.random() * opts.jitterMs;
  return Math.min(exponential + jitter, opts.maxMs);
}

const BACKOFF_OPTS: BackoffOptions = { baseMs: 2_000, jitterMs: 1_000, maxMs: 30_000 };
const MAX_RATE_LIMIT_RETRIES = 3;

// ---------------------------------------------------------------------------
// ANSI / junk detection helper (exported for unit tests)
// ---------------------------------------------------------------------------

/** Result of stripping ANSI and checking whether stdout is valid JSON. */
export interface JunkCheckResult {
  /** True when the cleaned output cannot be JSON (ANSI pollution, non-JSON prefix, etc.). */
  junk: boolean;
  /** True when the value is empty or the literal string "null" — caller should return null. */
  isNull: boolean;
  /** The cleaned (ANSI-stripped) string, ready for JSON.parse. Empty when junk/isNull. */
  cleaned: string;
}

/**
 * Strip ANSI escape sequences and Unicode box-drawing characters that vnstock's
 * `rich` progress bar emits to stdout, then validate that what remains looks
 * like JSON before passing it to JSON.parse.
 *
 * Exported so unit tests can exercise the logic without spawning Python.
 */
export function stripAnsiAndDetectJunk(raw: string, label: string): JunkCheckResult {
  // Strip ESC sequences (colors, cursor moves) and Unicode box-drawing / Braille ranges
  // used by the `rich` library's progress bar and spinner components.
  const cleaned = raw.replace(ANSI_JUNK_RE, "").trim();

  // Empty or literal "null" — legitimate empty result, not junk.
  if (!cleaned || cleaned === "null") {
    return { junk: false, isNull: true, cleaned: "" };
  }

  // First non-whitespace char must be '{' or '[' for valid JSON.
  if (cleaned[0] !== "{" && cleaned[0] !== "[") {
    logger.warn(`[vnstock:${label}] non-JSON stdout — possible rate-limit or ANSI output`, {
      preview: cleaned.slice(0, 120),
    });
    return { junk: true, isNull: false, cleaned: "" };
  }

  return { junk: false, isNull: false, cleaned };
}

// ---------------------------------------------------------------------------
// Python helper: run script and parse JSON
// ---------------------------------------------------------------------------

/** Default per-call wall-clock budget for any python subprocess. */
const PYTHON_TIMEOUT_MS = 45_000;

export async function runPython<T>(script: string, label: string): Promise<T | null> {
  try {
    await _rateLimiter.acquire();
    const proc = Bun.spawn(["python3", "-c", script], {
      stdout: "pipe",
      stderr: "pipe",
    });

    // Local hard timeout: vnstock occasionally hangs on slow VCI responses.
    // We want a clean SIGTERM with a clear log line instead of letting an
    // outer step-timeout kill us with no attribution (the source of the
    // mysterious "exit code 143" reports — Loop #29).
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill(); } catch { /* already exited */ }
    }, PYTHON_TIMEOUT_MS);

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    clearTimeout(timer);

    // Python libs (vnstock, pandas, urllib) routinely emit DeprecationWarnings
    // and progress bars to stderr even on successful runs. Only surface stderr
    // as a warning when the process actually failed — otherwise demote to debug
    // to keep RECENT ERRORS actionable.
    // exit code 143 = SIGTERM (killed by our local timer or an outer step
    // timeout). Always benign — demote to debug so RECENT ERRORS stays clean.
    const killedBySignal = exitCode === 143 || timedOut;

    if (stderr.trim()) {
      if (exitCode !== 0 && !killedBySignal) {
        logger.warn(`[vnstock:${label}] stderr`, { stderr: stderr.slice(0, 300) });
      } else {
        logger.debug(`[vnstock:${label}] stderr (non-fatal)`, { stderr: stderr.slice(0, 300) });
      }
    }

    if (timedOut) {
      logger.debug(`[vnstock:${label}] timeout after ${PYTHON_TIMEOUT_MS}ms — killed (SIGTERM)`);
      return null;
    }

    if (exitCode !== 0) {
      if (killedBySignal) {
        logger.debug(`[vnstock:${label}] exit code ${exitCode} (SIGTERM, benign)`);
      } else {
        logger.warn(`[vnstock:${label}] exit code ${exitCode}`);
      }
      return null;
    }

    const trimmed = stdout.trim();

    // Detect rate-limit (box-drawing) response BEFORE generic junk check.
    // Rate-limit = VCI is throttling us → back off and retry (handled by caller loop).
    // Generic junk (non-JSON text) = Python error → no point retrying immediately.
    if (isRateLimitResponse(trimmed)) {
      return "RATE_LIMITED" as unknown as T;
    }

    const check = stripAnsiAndDetectJunk(trimmed, label);
    if (check.isNull || check.junk) return null;
    return JSON.parse(check.cleaned) as T;
  } catch (err) {
    logger.warn(`[vnstock:${label}] error`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Sentinel returned by runPython when the VCI API returns a rate-limit response. */
const RATE_LIMITED = "RATE_LIMITED" as const;

/**
 * Wraps runPython with exponential backoff on RATE_LIMITED responses.
 * On each rate-limit detection, logs WARN with {label, attempt, wait_ms}
 * and waits before retrying. Gives up after MAX_RATE_LIMIT_RETRIES.
 */
export async function runPythonWithBackoff<T>(script: string, label: string): Promise<T | null> {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    const result = await runPython<T | typeof RATE_LIMITED>(script, label);

    if (result !== RATE_LIMITED) {
      return result as T | null;
    }

    // Rate-limited — log and back off (unless this was the last attempt)
    if (attempt < MAX_RATE_LIMIT_RETRIES) {
      const wait_ms = Math.round(calcBackoffMs(attempt, BACKOFF_OPTS));
      logger.warn(`[vnstock:${label}] RATE_LIMITED — backing off before retry`, {
        label,
        attempt,
        wait_ms,
      });
      await new Promise((resolve) => setTimeout(resolve, wait_ms));
    } else {
      logger.warn(`[vnstock:${label}] RATE_LIMITED — max retries exhausted, giving up`, {
        label,
        attempts: MAX_RATE_LIMIT_RETRIES + 1,
      });
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// wrapVnstockScript — the shared stdout-capture + error-handling preamble
// ---------------------------------------------------------------------------

/** Options for `wrapVnstockScript`. */
export interface VnstockScriptOptions {
  /** Stock ticker symbol interpolated into `Vnstock().stock(symbol=...)`. */
  symbol: string;
  /**
   * Python statement(s) that populate `resultVar` (default `df`) from the
   * `stock` object, e.g. `"df = stock.company.officers()"`. Runs right after
   * the second stdout-suppression reset. A multi-statement fetch (e.g. two
   * sequential vnstock calls) may embed its own inline
   * `sys.stdout = _io.StringIO()` resets between calls — continuation lines
   * must self-indent 4 spaces to stay inside the `try:` block.
   */
  fetch: string;
  /** Variable name checked for None/empty after the fetch. Default: "df". */
  resultVar?: string;
  /** Extra pre-try variable initialisation, e.g. `"ratio = None"` (finance.ts — two result vars). */
  extraInit?: string;
  /** Label used in stderr error messages, e.g. "officers", "balance_sheet". */
  errorLabel: string;
  /** Python literal printed on fetch error / empty result: "null" or "[]". */
  emptyValue: "null" | "[]";
  /**
   * Python code for the non-empty success path. Must be pre-indented 8
   * spaces (nested under `else:`/`try:`), assume `resultVar` is bound and
   * non-empty, and end with `print(json.dumps(...))` on success. Wrapped in
   * its own try/except that falls back to `emptyValue` on transform error.
   */
  body: string;
}

/**
 * Owns the FIX-FUNDAMENTALS-REFRESH-CRON-DEAD stdout-suppression preamble —
 * previously hand-copied into 9 of the 11 *_SCRIPT templates in
 * vnstockBridge.ts (evidenced by the same fix-comment repeated verbatim in
 * each one). Redirects sys.stdout to a throwaway StringIO for the duration of
 * `Vnstock().stock()` init + the data fetch (suppressing the vnstock
 * deprecation banner and community-edition notices that would otherwise be
 * mis-detected as a rate-limit response by `isRateLimitResponse`), restores
 * it before any print(), then emits the caller-supplied `body` guarded by the
 * same error/empty/exception handling every script needs.
 *
 * PRICE_SCRIPT (multi-symbol loop) and EVENTS_SCRIPT (bypasses Vnstock().stock()
 * entirely — imports vnstock.explorer.vci.company.Company directly to dodge a
 * vnstock v4 viz-import bug) have genuinely different control flow and are
 * NOT built through this wrapper — see scripts/prices.ts and scripts/events.ts.
 */
export function wrapVnstockScript(opts: VnstockScriptOptions): string {
  const resultVar = opts.resultVar ?? "df";
  const extraInit = opts.extraInit ? `${opts.extraInit}\n` : "";
  return `
import json, sys, io as _io
# FIX-FUNDAMENTALS-REFRESH-CRON-DEAD: capture stdout around ALL vnstock API calls
_real_stdout = sys.stdout
${resultVar} = None
${extraInit}_fetch_err = None
try:
    sys.stdout = _io.StringIO()
    from vnstock import Vnstock
    stock = Vnstock().stock(symbol='${opts.symbol}', source='VCI')
    sys.stdout = _io.StringIO()
    ${opts.fetch}
except Exception as e:
    _fetch_err = e
finally:
    sys.stdout = _real_stdout
if _fetch_err is not None:
    sys.stderr.write(f'vnstock ${opts.errorLabel} error: {_fetch_err}\\n')
    print('${opts.emptyValue}')
elif ${resultVar} is None or len(${resultVar}) == 0:
    print('${opts.emptyValue}')
else:
    try:
${opts.body}
    except Exception as e:
        sys.stderr.write(f'vnstock ${opts.errorLabel} error: {e}\\n')
        print('${opts.emptyValue}')
`;
}
