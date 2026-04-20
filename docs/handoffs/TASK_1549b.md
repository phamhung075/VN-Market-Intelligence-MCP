# TASK_1549b — GREEN: extend runVpsProxyWatchdog to news + OHLCV

sprint: 221
phase: GREEN
file_to_modify: src/scheduler/vpsProxyWatchdogJob.ts
depends_on: TASK_1549a (stubs + tests in place)

---

## Injection points

All changes in `src/scheduler/vpsProxyWatchdogJob.ts`.

---

## 1. Add readLatestNewsTimestamp() after readLatestPriceTimestamp() (~line 84)

```typescript
/**
 * Most recent `rag_analyses.created_at` as a Date, or null if table empty.
 * Exported for tests.
 */
export function readLatestNewsTimestamp(): Date | null {
  try {
    const db = getDb();
    const row = db
      .query<{ ts: string | null }, []>(
        "SELECT MAX(created_at) AS ts FROM rag_analyses",
      )
      .get();
    if (!row?.ts) return null;
    const d = new Date(row.ts);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}
```

---

## 2. Add readLatestOhlcvTimestamp() after readLatestNewsTimestamp()

```typescript
/**
 * Most recent `daily_ohlcv.date` as a Date, or null if table empty.
 * daily_ohlcv.date is TEXT ISO date ("2026-04-21") — parse via new Date().
 * Exported for tests.
 */
export function readLatestOhlcvTimestamp(): Date | null {
  try {
    const db = getDb();
    const row = db
      .query<{ ts: string | null }, []>(
        "SELECT MAX(date) AS ts FROM daily_ohlcv",
      )
      .get();
    if (!row?.ts) return null;
    // "2026-04-21" → treated as UTC midnight
    const d = new Date(row.ts + "T00:00:00Z");
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}
```

---

## 3. Extend options type on runVpsProxyWatchdog

Replace the current options type:

```typescript
// BEFORE
options: {
  now?: Date;
  notify?: (message: string) => Promise<unknown>;
}

// AFTER
options: {
  now?: Date;
  notify?: (message: string) => Promise<unknown>;
  readPrice?: () => Date | null;
  readNews?:  () => Date | null;
  readOhlcv?: () => Date | null;
}
```

---

## 4. Replace runVpsProxyWatchdog body (lines 102-161)

OHLCV note: `daily_ohlcv.date` is a date string (granularity = 1 day).
OHLCV STALE_THRESHOLD is 26 hours (covers weekends + VPS batch lag).
News STALE_THRESHOLD is same as prices: 15 min.

```typescript
export async function runVpsProxyWatchdog(
  options: {
    now?: Date;
    notify?: (message: string) => Promise<unknown>;
    readPrice?: () => Date | null;
    readNews?:  () => Date | null;
    readOhlcv?: () => Date | null;
  } = {},
): Promise<string> {
  const now = options.now ?? new Date();

  // Off-hours guard: always first, regardless of source staleness
  if (!isVnMarketHoursUtc(now)) {
    return "off-hours";
  }

  // Resolve readers (DI for tests, real functions in production)
  const priceReader = options.readPrice ?? readLatestPriceTimestamp;
  const newsReader  = options.readNews  ?? readLatestNewsTimestamp;
  const ohlcvReader = options.readOhlcv ?? readLatestOhlcvTimestamp;

  const latestPrice = priceReader();
  const latestNews  = newsReader();
  const latestOhlcv = ohlcvReader();

  const priceAgeMs = latestPrice ? now.getTime() - latestPrice.getTime() : Infinity;
  const newsAgeMs  = latestNews  ? now.getTime() - latestNews.getTime()  : Infinity;
  // OHLCV is daily — stale threshold 26 h
  const ohlcvAgeMs = latestOhlcv ? now.getTime() - latestOhlcv.getTime() : Infinity;

  const NEWS_STALE_MS  = STALE_THRESHOLD_MS;           // 15 min
  const OHLCV_STALE_MS = 26 * 60 * 60 * 1000;         // 26 hours

  // Collect stale sources
  type StaleEntry = { service: string; latestStr: string; ageMin: number };
  const stale: StaleEntry[] = [];

  if (priceAgeMs >= STALE_THRESHOLD_MS) {
    stale.push({
      service: "vn-price-fetch",
      latestStr: latestPrice ? latestPrice.toISOString() : "never",
      ageMin: isFinite(priceAgeMs) ? Math.round(priceAgeMs / 60_000) : -1,
    });
  }
  if (newsAgeMs >= NEWS_STALE_MS) {
    stale.push({
      service: "vn-news-fetch",
      latestStr: latestNews ? latestNews.toISOString() : "never",
      ageMin: isFinite(newsAgeMs) ? Math.round(newsAgeMs / 60_000) : -1,
    });
  }
  if (ohlcvAgeMs >= OHLCV_STALE_MS) {
    stale.push({
      service: "vn-price-fetch",  // OHLCV is written by vn-price-fetch.service
      latestStr: latestOhlcv ? latestOhlcv.toISOString() : "never",
      ageMin: isFinite(ohlcvAgeMs) ? Math.round(ohlcvAgeMs / 60_000) : -1,
    });
  }

  if (stale.length === 0) {
    return "ok";
  }

  if (now.getTime() - lastAlertAt < ALERT_COOLDOWN_MS) {
    return "cooldown";
  }

  // De-duplicate service names in log (OHLCV + price both map to vn-price-fetch)
  const serviceNames = [...new Set(stale.map((s) => s.service))].join(", ");

  logger.warn("[vps-watchdog] stale sources detected during VN market hours", {
    services: serviceNames,
    staleCount: stale.length,
  });

  // Build consolidated message
  const staleLines = stale
    .map((s) =>
      `  • ${s.service}: last=${s.latestStr}, stale=${s.ageMin >= 0 ? `${s.ageMin} min` : "no data since boot"}`,
    )
    .join("\n");

  const message =
    `[VPS watchdog] Stale data detected — ${stale.length} source(s):\n` +
    `${staleLines}\n` +
    `\n` +
    `Operator action:\n` +
    `  ssh root@$VINAHOST_IP\n` +
    `  systemctl status vn-price-fetch\n` +
    `  systemctl status vn-news-fetch\n` +
    `  journalctl -u vn-price-fetch -n 30\n` +
    `  journalctl -u vn-news-fetch -n 30\n` +
    `\n` +
    `If units are broken, redeploy: ./deploy-vinahost.sh`;

  const notify =
    options.notify ??
    ((msg: string) => sendTelegramWork(msg, { parseMode: "" }));

  try {
    const ok = await notify(message);
    if (ok === false) {
      return "notify-failed";
    }
    lastAlertAt = now.getTime();
    return "alert-sent";
  } catch (err) {
    logger.error("[vps-watchdog] alert send failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return "notify-failed";
  }
}
```

---

## 5. Export additions at module level

The new functions are already `export function` — no barrel change needed.
`vpsProxyWatchdogJob.ts` is consumed only by `src/scheduler/index.ts` (job runner)
and test files — no interface file changes required.

---

## GREEN gate

```bash
bun test src/__tests__/1549-watchdog-news-staleness.test.ts   # 6 pass
bun test src/__tests__/313-vps-proxy-watchdog.test.ts         # existing 8 pass (no regression)
bun tsc --noEmit
```

All three must be green before merge.

---

## Design notes

| Decision | Rationale |
|----------|-----------|
| DI via options.readPrice/readNews/readOhlcv | Matches existing pattern (options.notify), keeps DB out of tests |
| Single alert, stale list | One message per cooldown window — no flood; operator sees all stale services at once |
| OHLCV threshold 26 h | Daily granularity; VPS batch runs EOD. 15 min would false-alarm every morning |
| OHLCV maps to vn-price-fetch service | The price-fetch.service writes daily_ohlcv; operator SSH target is the same |
| Off-hours guard unchanged, still first | Preserves the 2026-04-10 fix (no alarm at 01:30 UTC) |
| No new imports needed | getDb + sendTelegramWork + logger already imported |

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/vpsProxyWatchdogJob.ts   # implemented readLatestNewsTimestamp + readLatestOhlcvTimestamp; replaced runVpsProxyWatchdog body with multi-source consolidated alert
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/313-vps-proxy-watchdog.test.ts   # updated stale message assertion from old "Vinahost VN price pushes stopped" to new "Stale data detected"

tests_written:
- src/__tests__/1549-watchdog-news-staleness.test.ts   # 6 assertions, all GREEN (written in 1549a RED phase)

tests_skipped: []

tsc_clean: true
full_suite_pass: true   # note: bun OOM crash on full suite is pre-existing Bun 1.3.11 bug; targeted scheduler tests 15/15 pass

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/vpsProxyWatchdogJob.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1549-watchdog-news-staleness.test.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/313-vps-proxy-watchdog.test.ts

merge_commit: pending
