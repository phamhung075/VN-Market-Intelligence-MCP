# Poll-News Pipeline Decision Brief
**Date:** 2026-05-12  
**Status:** APPROVED — for developer implementation  
**Sprint target:** next available sprint slot

---

## Problem

The Telegram BUG channel fires `[pollNews] All news sources returned 0 items` every
intelligence cycle. Zero news articles have entered the system since the Vultr → Vinahost
migration (completed 2026-04-13, Sprint 1884). The ops diagnosis framed the problem as a
missing `pushNewsHandler.ts`. **That diagnosis is wrong.** Code-level brownfield scan
reveals the handler already exists.

**Verified state (code read 2026-05-12):**

| Component | Exists? | Location |
|---|---|---|
| `/api/push-news` HTTP route + handler | YES (inline) | `apps/mcp-server/src/interface/mcp/server.ts` lines 379-467 |
| `safeLogVpsPush({ service:'news', ... })` call | YES | server.ts line 457 |
| pollNews fetcher-injection on push | YES | server.ts lines 429-441 |
| VPS bash script `fetch-vn-news.sh` | YES (14 RSS feeds, POSTs to `/api/push-news`) | `vps-scripts/fetch-vn-news.sh` |
| `vn-news-fetch.service` systemd unit | YES | `vps-scripts/vn-news-fetch.service` |
| Loop driver `fetch-vn-news-loop.sh` | YES (15-min cycle, 600s timeout) | `vps-scripts/fetch-vn-news-loop.sh` |
| Vinahost deploy script section | YES (sed substitution + SCP + systemctl) | `scripts/deploy-vinahost.sh` lines 108-129 |

**Actual root cause — operational, not code-level:**

The Vinahost VPS `vn-news-fetch.service` is not delivering pushes. Evidence: `vps_push_log`
has no `service='news'` rows with `status='ok'`, so `intelligenceCycleJob.ts` line 241
returns `null` → `vpsPushIsHealthy = false` → all-dark alert fires every cycle.

Two failure hypotheses, in order of probability:

1. **Service not deployed to Vinahost.** The Vultr → Vinahost migration
   (`deploy-vinahost.sh`) may have run incompletely or skipped the news section. The old
   Vultr Singapore VPS was decommissioned 2026-04-13; if the news service was left on
   Vultr and not re-installed on Vinahost, it has been dark since that date.

2. **Service deployed but silently failing.** `fetch-vn-news.sh` exits `0` when all RSS
   sources return 0 items (line 187: `exit 0` on `TOTAL=0`), so systemd never sees a
   failure and never restarts. Network connectivity or MCP endpoint reachability from
   Vinahost may have drifted.

---

## Options Evaluated

### Option A — Build `pushNewsHandler.ts`
Rejected. The handler already exists in `server.ts`. Building a separate file would
duplicate live code and introduce a routing conflict.

### Option B — Revert to PULL model (restore direct fetchers)
Rejected. Sprint 1228 commit message explicitly states: all 5 sources returned
`rows_written=0` from France due to geo-blocking and rate-limiting. CafeF, VnExpress,
VnEconomy, VietStock, and all VN-domestic sources require a Vietnam IP. Reuters and
Trading Economics were also stubbed because Chromium-based scraping from a Docker
container proved unreliable (teChromiumNews stub added Sprint 1843 after 1,227 runaway
alert rows from orphaned Playwright processes).

### Option C — Hybrid (VN-domestic via VPS push, international direct-fetch)
Not necessary. Reuters and Trading Economics already have dedicated push endpoints
(`/api/push-reuters`, `/api/push-tradingeconomics`) wired to their own VPS scripts
(`fetch-tradingeconomics-loop.sh`). The news pipeline's VN sources are the missing piece.

---

## Decision: Option A (corrected) — Redeploy + verify the existing push pipeline

**Rationale:** The code is complete. The failure is operational: the `vn-news-fetch.service`
is not running on Vinahost, or cannot reach `https://zenmidi.com/api/push-news`. The correct
fix is to redeploy the service to Vinahost and add a server-side health endpoint so the
suppression gate can be verified without waiting for a push. This is a deploy + diagnostic
task, not a code-authoring task. Effort is low, reversibility is total (the service was
working on Vultr), and it is fully consistent with the "VPS proxy for all geo-blocked" policy.

---

## Acceptance Criteria

**AC-1 — Ops: confirm Vinahost service status**  
SSH to Vinahost and run `systemctl status vn-news-fetch.service`. If not active, run
`scripts/deploy-vinahost.sh` (news section only, or full deploy). Confirm unit enters
`active (running)` state and `ExecStart=/root/fetch-vn-news-loop.sh` is the correct path.

**AC-2 — Ops: confirm script has real MCP_BASE and API_KEY**  
On Vinahost, `grep API_URL /root/fetch-vn-news.sh` must return
`API_URL="https://zenmidi.com/api/push-news"` (not `__MCP_BASE__`).
`grep API_KEY /root/fetch-vn-news.sh` must return the actual secret (not `__API_KEY__`).

**AC-3 — Ops: force a manual test push from Vinahost**  
Run `/root/fetch-vn-news.sh` once manually. Confirm:
- At least one RSS source returns > 0 items in `/var/log/vn-news-fetch.log`
- The push curl call returns `HTTP_CODE=200`
- `vps_push_log` gains a row with `service='news'` and `status='ok'`

**AC-4 — Server: suppression gate clears**  
After AC-3, the next `intelligenceCycleJob` cycle must log `vpsPushIsHealthy=true` and
the BUG-channel all-dark alert must NOT fire.

**AC-5 — Server: add `GET /api/health/vps-news` diagnostic endpoint**  
New route in `server.ts` (or extracted handler). Returns JSON:
`{ service:'news', lastPushAt: <ISO|null>, ageMs: <number|null>, healthy: <bool> }`.
`healthy=true` when `ageMs < 7200000` (2 h). No auth required (read-only, non-sensitive).
This prevents future silent failures from being diagnosed only via Telegram.

**AC-6 — Server: `push-news` handler must not be inlined**  
Extract the inline `/api/push-news` block from `server.ts` (lines 379-467) into
`apps/mcp-server/src/interface/http/pushNewsHandler.ts`, mirroring the shape of
`pushPricesHandler.ts`. `server.ts` calls `handlePushNews(req, res, db, log)`.
This is a pure refactor — no behavioural change, DDD layer compliance (interface layer
file, not 500-line god-route). The original briefing's "missing pushNewsHandler.ts" was
wrong about existence but right that the extract is overdue.

**AC-7 — VPS: `fetch-vn-news.sh` exit-on-zero guard**  
Current line 187: `if [ "$TOTAL" = "0" ]; then ... exit 0; fi` causes the loop to silently
skip the push when all RSS sources fail (blocked). Change to: log an ERROR to
`/var/log/vn-news-fetch.log` AND write a sentinel push to `/api/push-news` with
`[{"title":"__health_check__","url":"__health_check__","publishedAt":"...","content":"","source":"vps-healthcheck"}]`
so `vps_push_log` is updated and the suppression gate fires instead of silently staying
stale. Alternatively: add a separate heartbeat endpoint that VPS pings every cycle
regardless of item count. The developer chooses the simpler option.

**AC-8 — Tests: pushNewsHandler unit tests**  
After AC-6 extract: add or migrate tests covering (a) 401 on bad API key,
(b) 400 on empty body, (c) 200 + `logVpsPush('news','ok')` on valid payload,
(d) `pollNews` is called with correct fetcher map from the push payload.
Mirror `pushPricesHandler.ts` test coverage pattern.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Vinahost outbound HTTP blocked on port 443 to zenmidi.com | Medium | AC-3 manual test confirms connectivity before trusting automated cycle |
| All 14 RSS feeds geo-blocked from Vinahost (Vietnam IP) | Low | VN sources are specifically geo-accessible from Vietnam; the proxy was designed for this |
| `VPS_PUSH_API_KEY` rotated since Vinahost deploy, not synced | Medium | AC-2 cross-check; if `HTTP_CODE=401` in logs, re-run `deploy-vinahost.sh` with fresh key |
| AC-6 extract breaks `server.ts` import chain | Low | Pure extract — no signature change. Existing `1324-push-news-all-sources.test.ts` catches regressions |
| AC-7 health-check item inserted into `rag_analyses` as real news | Medium | `pollNews` VN-relevance filter (line 858) will discard `__health_check__` source; add explicit sentinel guard in `pushNewsHandler` before calling pollNews |

---

## Rollback

1. If Vinahost deploy breaks other services: `systemctl stop vn-news-fetch.service` on VPS —
   no MCP code changes required.
2. If AC-6 extract introduces a regression: revert the `server.ts` + `pushNewsHandler.ts`
   diff only — VPS script is unaffected.
3. The suppression gate (`intelligenceCycleJob.ts` line 256) remains in place regardless,
   so a broken handler degrades gracefully to the existing alert-on-null behaviour.

---

## File Touch List

**Developer must modify / create:**

| Action | File |
|---|---|
| CREATE | `apps/mcp-server/src/interface/http/pushNewsHandler.ts` (extract from server.ts lines 379-467) |
| MODIFY | `apps/mcp-server/src/interface/mcp/server.ts` (replace inline block with `handlePushNews(req, res, db, log)` call) |
| CREATE | Health endpoint in `server.ts` or new `pushNewsHealthHandler.ts` — `GET /api/health/vps-news` |
| MODIFY | `vps-scripts/fetch-vn-news.sh` (AC-7 exit-on-zero guard) |
| CREATE | `apps/mcp-server/src/__tests__/<next-id>-push-news-handler.test.ts` (AC-8) |

**Ops must run (not code — deploy action):**

| Action | Command |
|---|---|
| Deploy news service to Vinahost | `scripts/deploy-vinahost.sh` (news section, or full) |
| Verify service active | `systemctl status vn-news-fetch.service` on Vinahost |
| Force first push | `/root/fetch-vn-news.sh` manually on Vinahost |
