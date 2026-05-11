# TASK_ops_news_fix — VPS News Service Fix + Reuters Decommission

Date: 2026-04-30
Agent: ops
Status: COMPLETE

---

## Issue 1: vn-news-fetch OOM restart loop (CRITICAL)

### Root Cause

OOM kill confirmed via journalctl:
```
Apr 29 02:25:09 vn-news-fetch.service: A process of this unit has been killed by the OOM killer.
Apr 29 02:25:09 vn-news-fetch.service: Failed with result 'oom-kill'.
```

VPS RAM: 961 MB total, no swap. Playwright/Chromium peak usage: 385 MB.
When other services consume RAM, available drops below what Chromium needs → OOM kill → systemd restart loop.

### Fix Applied

Two-part fix deployed to VPS (125.212.251.27):

**1. `vps-scripts/fetch-vn-news-loop.sh`** — Added `timeout 600` guard:
- Before: `/root/fetch-vn-news.sh`
- After: `timeout 600 /root/fetch-vn-news.sh || echo "... WARN fetch-vn-news timed out or failed"`
- Prevents hung runs (Playwright stall) from propagating non-zero exit to systemd

**2. `vps-scripts/fetch-vn-news.sh`** — Added RAM guard inside `fetch_browser()`:
- Reads `/proc/meminfo` MemAvailable at call time
- If free RAM < 400 MB: logs WARN, falls back to plain `fetch_rss()` curl call
- If free RAM >= 400 MB: proceeds with Playwright as before
- Eliminates OOM condition — curl uses ~2 MB vs Playwright ~385 MB

### Verification

Post-restart CGroup output confirmed:
```
├─ fetch-vn-news-loop.sh
├─ timeout 600 /root/fetch-vn-news.sh   ← guard active
├─ /bin/bash /root/fetch-vn-news.sh
└─ sleep 3
```
Free RAM after restart: 463 MB (above 400 MB threshold — Playwright allowed this cycle).

---

## Issue 2: vn-reuters-fetch.service Decommission (LOW RISK)

### Context

`fetch-reuters.sh` uses dead `feeds.reuters.com` URLs that return empty/no response.
The MCP server fetches Reuters/Google News directly. The VPS proxy is redundant and failing.

`deploy-vinahost.sh` already did NOT include this service — it was never part of the
standard deploy. The service file existed on VPS from an older manual deploy.

### Actions Taken on VPS

1. `systemctl stop vn-reuters-fetch` — service stopped
2. `systemctl disable vn-reuters-fetch` — removed from multi-user.target.wants
3. Confirmed final state: `inactive (dead)`, `disabled`

### Local Files

- `vps-scripts/vn-reuters-fetch.service` — kept for historical reference, not deployed
- `vps-scripts/fetch-reuters.sh` — kept for historical reference
- `scripts/deploy-vinahost.sh` — confirmed: no Reuters section (was never added)

No code changes needed to deploy script — it was already clean.

---

## Files Changed

- `vps-scripts/fetch-vn-news-loop.sh` — timeout 600 guard
- `vps-scripts/fetch-vn-news.sh` — RAM guard in fetch_browser()

## VPS State After Fix

| Service | Status |
|---------|--------|
| vn-news-fetch | active (running), fixed scripts deployed |
| vn-reuters-fetch | inactive (dead), disabled |
