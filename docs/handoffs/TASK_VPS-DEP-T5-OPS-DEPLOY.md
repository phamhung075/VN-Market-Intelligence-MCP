# TASK_VPS-DEP-T5-OPS-DEPLOY — Deploy consolidated deploy-vinahost.sh + verify all 14 feeds

**Owner:** ops  
**Sprint:** VPS-DEPLOY-PLACEHOLDER-GUARD  
**Priority:** HIGH  
**Status:** READY (gates on T1/T2/T3/T4 DONE)  
**Estimated:** 1h  
**Blocks:** T5-QA gate (qa)

---

## Summary

Ops executes the updated deploy-vinahost.sh with all GUARD-1/3 migrations included. This replaces the previous dead deploy-vps-proxy.sh deployer and extends Vinahost to ship all 9 + 1 (article-body) capabilities. Post-deploy, verify all 14 feeds (9 main services + 5 source feeds from news/bctc/prices/sbv/foreign-flow, 14 total data-return touchpoints) return HTTP 200 within the expected cycle windows.

---

## Acceptance Criteria

### AC-1: dev-vps-crawls commits land on main
Before ops starts, confirm git status shows:
- `scripts/deploy-vinahost.sh` modified (T2/T3/T4 changes)
- `scripts/deploy-vps-proxy.sh` deleted
- `.env` modified (VULTR_* removed)
- `.env.example` modified (VULTR_* removed)

**AC-PASS condition:** git log HEAD~4..HEAD shows 4 commits (T1→T2→T3→T4 chain). No uncommitted changes.

### AC-2: Pre-deploy manual check on Vinahost
Before running the new deploy script, SSH to Vinahost and confirm no locks/stuck processes:
```bash
ps aux | grep fetch-
pgrep -fl pip
```
Expected: no stale pip processes; fetch services either active or stopped cleanly (no zombie/defunct).

**AC-PASS condition:** No zombie processes found; services are either running or stopped cleanly.

### AC-3: Execute deploy-vinahost.sh with no errors
Run from project root:
```bash
./scripts/deploy-vinahost.sh
```
All 10 sections (1–10) must complete without `exit 1`. The script will:
- Render 7–8 scripts via sed
- Assert no placeholders via GUARD-1 pre-SCP
- SCP scripts + config to Vinahost
- SSH chmod + systemctl daemon-reload + enable/restart
- Deploy article-body-fetcher + beautifulsoup4 (section 10)
- Post-deploy verify GUARD-1 global check

**AC-PASS condition:** Script exits with status 0. All 10 sections report success echo messages.

### AC-4: Post-deploy systemd status confirms all services
After deploy completes, SSH to Vinahost and run:
```bash
systemctl status vn-price-fetch vn-bctc-fetch vn-news-fetch vn-sbv-fetch vn-foreign-flow vn-ohlcv-backfill vn-bctc-enrich vn-tradingeconomics-fetch vn-vps-proxy
```
Expected: all 9 services report `active (running)` or `active (exited)` (for timers like ohlcv-backfill).

**AC-PASS condition:** systemctl status for all 9 services returns `active` state (not inactive/failed/static).

### AC-5: 14-feed verification — HTTP 200 check
Run a rapid verification across the 14 data touchpoints. Define the 14 as:
1. vn-price-fetch.service — polls VPS API every 60s → pushes to mcp-server /api/push-ohlcv (HTTP 200)
2. vn-bctc-fetch.service — polls PDF queue every 6h → pushes to /api/push-bctc-files (HTTP 200)
3. vn-news-fetch.service → /api/push-news (HTTP 200)
4. vn-sbv-fetch.service → /api/push-macro-data (HTTP 200)
5. vn-foreign-flow.service → /api/push-foreign-flow (HTTP 200)
6–9. Same 5 services each push to at least 1–2 of (VPS API, CafeF, VnExpress, Yahoo, etc.)
10–14. The 5 UPSTREAM sources: VPS API prices, CafeF news/prices, VnExpress news, Vietcombank FX, VIRA foreign-flow

**SIMPLIFIED AC-5:** For the first 12h post-deploy (one full cycle of each service), verify:
- Price fetch: logs show "http=200" or "received=X items" (no http=000)
- BCTC fetch: logs show "found X PDFs" or "no new PDFs" (no connection errors)
- News fetch: logs show "received=X articles" (no http=000 permanent)
- SBV fetch: logs show "rate" or "FX" (no connection errors)
- Foreign flow: logs show "volume" or "flows" (no connection errors)

**AC-PASS condition:** All 5 main services show at least ONE successful poll/push log entry within 2h of deploy. No permanent http=000 errors.

### AC-6: Article-body-fetcher installed + verified
SSH to Vinahost:
```bash
ls -la /root/article-body-fetcher.py
pip3 show beautifulsoup4
```
Expected: file exists, executable; beautifulsoup4 installed.

**AC-PASS condition:** Both commands return clean output (no "not found").

### AC-7: No placeholder leaks remain
Run the GUARD-1 post-deploy verify:
```bash
grep -rl '__[A-Za-z][A-Za-z0-9_]*__' /root/fetch-*.sh /root/*.py
```
Expected: zero matches (empty output).

**AC-PASS condition:** grep returns no matches.

---

## Implementation approach

1. **Confirm** dev-vps-crawls commits are on main (check git log)
2. **Pre-flight check:** SSH Vinahost, run AC-2 (no stale processes)
3. **Execute deploy:** `./scripts/deploy-vinahost.sh` from project root
4. **Monitor:** Watch deploy script output for errors at each step
5. **Post-deploy:** Run systemctl status checks (AC-4)
6. **Verify feeds:** Monitor service logs for 2h (AC-5)
7. **Confirm artifacts:** SSH checks (AC-6, AC-7)
8. **Report:** Post results to WORK channel (Telegram)

---

## Test plan (manual ops)

- **DV-1:** Pre-flight systemd snapshot confirms no zombies
- **DV-2:** Deploy script runs to completion (exit 0)
- **DV-3:** Post-deploy systemctl status: all 9 active
- **DV-4:** 2h feed cycle: all 5 services show successful push log entries
- **DV-5:** article-body-fetcher.py + beautifulsoup4 present
- **DV-6:** GUARD-1 post-verify returns zero matches

---

## Risk flags

| Risk | Mitigation |
|---|---|
| Deploy mid-cycle conflicts with running service | Not a risk (systemctl restart is idempotent; in-flight jobs drain naturally or are killed) |
| Socat dies during deploy | Monitor in parallel; if socat crash detected, restart immediately per VPS-SOCAT-PERSIST memory |
| One service fails to start | systemctl status will show it; escalate to dev-vps-crawls or architect (likely a config/file issue) |
| 14-feed verify incomplete within 2h | Acceptable (first poll cycles stagger; extend verification to 6h if needed) |

---

## Gate rule

**HARD GATE:** After AC-1..AC-7 all pass, ops reports PASS to WORK channel. T5-QA gate is unblocked.

---

## Related docs

- Brief: `docs/architecture-briefs/2026-06-01-vps-deployer-consolidation.md` § Ops redeploy
- Memory: VPS Infrastructure Setup (Vinahost SSH access)
- Memory: VPS-SOCAT-PERSIST (socat fragility + restart)
- Memory: PDF-Extract-Kit integration (socat bridge history)
