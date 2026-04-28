# TASK_REPORT_1404 — vn-news-fetch: Diagnose and Fix All RSS Sources

**Status:** DONE
**Date:** 2026-04-28
**Agent:** ops
**Fix log ID:** 199

---

## Summary

`vn-news-fetch.service` on the Vinahost VPS was returning 0 items from 3 of 14 RSS sources per cycle. The underlying service was running and pushing 181 items from the remaining 11 sources. After fixes, all 14 sources now return items and the total per cycle jumped from 181 to 240 unique items.

---

## Symptoms Observed

- `vn-news-fetch` service health: **unhealthy** (MCP health check showed 0 response time)
- SLA: **CRITICAL breach** (78 min at time of first check — just past the 30-min threshold)
- Proxy push log showed 181 items per cycle (not 0 — the handoff description was partially inaccurate)
- 3 specific sources were returning 0 items per cycle:
  - `cafef-market` — 0 items (permanently blocked after 3 UA attempts)
  - `vnexpress` — 0 items (permanently blocked after 3 UA attempts)
  - `vneconomy-finance` — 0 items (Playwright/Chromium failing)

---

## Root Cause Analysis

### Bug 1: False-Positive Block Detection (cafef-market, vnexpress)

**File:** `/root/fetch-vn-news.sh`, `vps-scripts/fetch-vn-news.sh`
**Line 47 (before fix):**
```
echo "$body" | grep -qi "captcha\|robot\|cloudflare\|access denied\|..."
```

The bare keyword `robot` matched Vietnamese article titles in the RSS content:
- cafef: article "Cong ty robot cua ong Pham Nhat Vuong bat tay MobiFone Solutions"
- vnexpress: article about Tesla's AI, robot, and chip spending

Both feeds returned valid RSS XML with HTTP 200, but the block detection classified them as permanently blocked. All 3 UA rotation attempts hit the same content, so all 3 failed.

**Fix:** Replace `robot` with specific bot-challenge phrases `are you a robot\|not a robot`. These phrases only appear in actual CAPTCHA/bot-challenge pages.

### Bug 2: TasksMax=32 Starving Playwright Threads (vneconomy-finance)

**File:** `/etc/systemd/system/vn-news-fetch.service`

The service unit had `TasksMax=32`. Playwright/Chromium requires 80+ OS threads to launch and render pages. When `fetch_browser.py` was called for `vneconomy-finance`, the kernel rejected `pthread_create` with `Resource temporarily unavailable (11)`.

Log evidence:
```
[pid=3482958][err] pthread_create: Resource temporarily unavailable (11)
```

Chromium fell back to `--single-process` but still exceeded the 32-task limit, causing `BrowserType.launch: Target page, context or browser has been closed`.

**Fix:** Raise `TasksMax` from 32 to 128.

### Bug 3: MemoryMax=128M vs 512M in Repo (historic OOM kills)

**File:** `/etc/systemd/system/vn-news-fetch.service`

The VPS deployment had `MemoryMax=128M` while the repo canonical config specifies 512M. This caused 7,625+ OOM kills between April 21 02:32 and April 21 04:41 (visible in journalctl). The issue resolved itself once Playwright calls happened to succeed within the limit, but this was fragile.

**Fix:** Deploy canonical `MemoryMax=512M` from repo config.

---

## Changes Applied

### VPS (live, immediate)

1. `/root/fetch-vn-news.sh` line 47:
   - Before: `grep -qi "captcha\|robot\|cloudflare\|..."`
   - After: `grep -qi "captcha\|are you a robot\|not a robot\|cloudflare\|..."`
   - Backup: `/root/fetch-vn-news.sh.bak.<timestamp>`

2. `/etc/systemd/system/vn-news-fetch.service`:
   - `TasksMax`: 32 → 128
   - `MemoryMax`: 128M → 512M
   - Added: `MemorySwapMax=0`, `StartLimitIntervalSec=300`, `StartLimitBurst=5`
   - Backup: `/etc/systemd/system/vn-news-fetch.service.bak`

3. `systemctl daemon-reload && systemctl restart vn-news-fetch` — confirmed active

### Local Repo (synced)

- `vps-scripts/fetch-vn-news.sh`: same is_blocked() fix
- `vps-scripts/vn-news-fetch.service`: TasksMax 32 → 128

---

## Verification

First cycle after fix (cycle 1 of new service instance, 2026-04-29T02:25:23+07):

| Source | Before | After |
|--------|--------|-------|
| cafef-market | 0 items | 20 items |
| cafef-biz | 20 items | 20 items |
| vnexpress | 0 items | 20 items |
| vneconomy-stocks | 20 items | 20 items |
| vneconomy-finance | 0 items | 20 items |
| vietstock-stocks | 20 items | 20 items |
| vietstock-insider | 10 items | 10 items |
| vietstock-macro | 10 items | 10 items |
| vietnambiz | 20 items | 20 items |
| vnbusiness | 20 items | 20 items |
| tuoitre | 20 items | 20 items |
| nhandan-economy | 20 items | 20 items |
| nhandan-stocks | 10 items | 10 items |
| nld | 20 items | 20 items |
| **Total pushed** | **181 items** | **240 items** |

Push confirmed: `PUSH 240 items → /api/push-news http=200 dur=943ms resp={"ok":true,"received":240}`

---

## Notes for Developer

- The `is_blocked()` heuristic should use more precise bot-challenge fingerprints. Consider checking for `<title>Just a moment...</title>` (Cloudflare), `<noscript>` with challenge content, or HTTP 403/429 only. The current keyword approach is fragile when news articles discuss topics like "robots", "captcha", or "cloudflare" in their titles.
- `vneconomy-finance` browser fetch now returns 20 items (previously 0 due to thread starvation). Monitor if Playwright memory usage stays within 512M.
- The MCP health check showing "unhealthy" / 0 response time may be a false alarm since the proxy push log showed healthy 181-item pushes. The health poll may have a timing/connection issue separate from actual news flow. Worth investigating the health check implementation separately.

