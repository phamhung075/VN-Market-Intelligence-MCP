# ops-vps-fetch — Notebook

**Last updated:** 2026-06-16 19:00 UTC | **Sprint:** FIX-FOREIGN-FLOW-INTEGRITY-BREAK + FIX-MARKET-BREADTH-MISSING + FIX-MARKET-LIQUIDITY-MISSING-TOOL (triple recon)

---

## Active Sources Under Watch

| Source | Last recon | Status | Anti-bot |
|--------|-----------|--------|---------|
| vps-prices | 2026-05-13 | healthy (upstream) / MCP push broken | none |
| cafef-index | 2026-05-13 | healthy | none |
| vn-news-rss | 2026-06-09 | healthy (upstream+push). Two bugs: Bug A=false-UNHEALTHY (dev-zone fix needed in vpsHealthPoller.ts); Bug B=cursor jump (VPS fix applied 2026-06-09) | none |
| sbv-rates | 2026-05-13 | healthy | none (Akamai present, not blocking) |
| hsx-bctc | 2026-05-13 09:17 | FIXED (HNX params corrected) / HSX SPA unchanged | none |
| hsx-bctc (api.hsx.vn) | 2026-05-15 04:45 | BLOCKER — /n/ JSON REST endpoints unreachable from VPS. Envoy route-level block, not geo-IP. | Envoy route table |
| ssc-bctc-newsearch | 2026-06-16 12:40 | FUNCTIONAL — afrLoop+HNX session fixed; remaining queue = genuine non-filers. Transient 503 at ~12:00Z UTC daily. | none |
| hnx-bctc-post-api | 2026-06-16 12:40 | FIXED — session warmup GET deployed; both NY+UPCOM warmup OK in live probes | ASP.NET session |

---

## Recon Digest

Key historical context (full recon docs in `docs/vps-sources/*/recon.md`):
- afrLoop rollover fix (c014): regex `r"(\d{15,18})"`, HNX session warmup GET deployed
- SSC 503 ~12:00Z UTC daily maintenance window (c016): no retry = cycle burn; needs 1-retry + 60s backoff
- Foreign flow integrity issue (c017): dual-writer conflict on vnstock_trading_stats; dev-mcp-server owns fix

---

## c018 · 2026-06-19T16:20Z · P0 INCIDENT FIX-VPS-BCTC-FETCH-RESTART — False Unhealthy: Queue Empty, Service Healthy

Trigger: Dev-team router dispatched P0 incident — 12 consecutive health-recheck reports claiming vn-bctc-fetch UNHEALTHY, zero pushes since 2026-06-16T18:02Z.

**VERDICT: SERVICE IS NOT CRASHED. Misdiagnosis by health monitors.**

**Evidence:**
- `systemctl status vn-bctc-fetch` → active (running) since Jun 11 00:22:03 +07 (8+ days continuous).
- `journalctl` shows only systemd-level start/stop events — script logs go to `/var/log/vn-bctc-fetch.log`.
- Script loops every 6h, currently in `sleep 21600` (PID 2994744).
- Log confirms the service ran every 6h and completed normally on Jun 18 and Jun 19.

**Root cause of zero pushes since 2026-06-16T18:02Z:**

The `bctc-fetch-queue?skip_enrichment=true` endpoint returned `{"queue":[],"total":0}` starting 2026-06-18T00:11Z. The queue was legitimately exhausted:
- Jun 16 18:02Z: last push — ACV Q1/2026 SUCCESS (HTTP 200).
- Jun 17: 9 items in queue (BDI, DAG, DLC, JSH, SIS, VDC, VNH, VEA Q1/2026, VEA Q4/2025) — ALL SKIPPED every cycle: genuine non-filers on HNX/UPCOM/SSC. All three sources return no matching rows for these tickers.
- Jun 18 00:11Z onward: queue dropped to 0. The MCP server side marked those 9 items as exhausted/expired (likely max-retry or TTL exceeded server-side).
- Jun 18–Jun 19: 7 consecutive fetch cycles → queue=0 each time → "Nothing to fetch -- exit". Not a crash — correct behavior.

**Why health monitors reported UNHEALTHY:**
The health-recheck reporter keys on "last successful push timestamp". Last push was ACV at Jun 16 18:02Z. With no new pushes (because queue=0), the freshness check flagged SLA breach after 360min. The monitor cannot distinguish "queue empty = nothing to do" from "crashed = can't push". This is a health-monitor false-alarm class.

**No restart performed:** Restarting would accomplish nothing — the service is already running. There is no crash to fix at the VPS level.

**No new push will occur until the MCP server's bctc-fetch-queue is repopulated** — i.e., when new BCTC filings for BDI/DAG/DLC/JSH/SIS/VDC/VNH/VEA become available on HNX or when new tickers are added to the watch queue.

**Follow-on issues (pre-existing, no new code bugs):**
1. Health monitor: cannot distinguish empty-queue vs crash — needs "queue_size=0 AND service_running = IDLE (not UNHEALTHY)" differentiation. Follow-on: FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH.
2. SSC 503 ~12:00Z UTC daily maintenance window: service skips all items for that cycle (no retry). Pre-existing risk noted in c016.
3. Queue server-side TTL/expiry for genuinely-not-filed tickers: those 9 tickers dropped off at Jun 18 — if they file Q1 later, they need to be re-enqueued manually or via upstream re-scan.

Disk: 6.0G/25G (26%) — healthy. No OOM. No disk full.

---

## c019 · 2026-06-25T13:30Z · B-14/B-05 BCTC UNHEALTHY ALARM — Queue-Empty Off-Season Idle Verdict

Trigger: Router escalation B-14 WARN re-escalated B-05 CRITICAL — vn-bctc-fetch unhealthy 6h+, 0 pushes since 2026-06-16 18:02Z.

**VERDICT: BENIGN-IDLE. Service fully operational. Zero evidence of crash, geo-block, TLS failure, or broken fetch path.**

**Evidence collected (SSH root@125.212.251.27, read-only):**

- `systemctl status vn-bctc-fetch`: `active (running)` since Jun 11 00:22:03 +07 — 14 days continuous, no restarts, no OOM.
- Current process tree: PID 1417640 `/bin/bash /root/fetch-bctc-loop.sh` → child `sleep 21600` (6h idle between runs). Normal between-cycle state.
- Memory: 1.5M current / 256M cap. No memory pressure.
- `/var/log/vn-bctc-fetch.log` last lines (Jun 25 06:11Z): "Queue: 0 items pending → Nothing to fetch -- exit". Same pattern every 6h from Jun 18 through Jun 25 = 28 consecutive clean exits.
- No ERROR / FAIL / HTTP 4xx / TLS / geo-block entries in log since Jun 17.
- Last actual push: ACV Q1/2026, Jun 16 18:02Z, HTTP 200 SUCCESS (15,511,143B PDF).
- Queue exhaustion sequence: Jun 17 — 9 remaining items (BDI/DAG/DLC/JSH/SIS/VDC/VNH/VEA) all SKIP (genuine non-filers on HNX/UPCOM/SSC). Jun 18 00:11Z — MCP server-side TTL/expiry dropped them to total=0. Queue has been 0 ever since.
- `vn-bctc-enrich.timer`: active (waiting), fires every 6h. Today's runs: Jun 25 00:24Z, 06:24Z, 12:24Z — all exit status=0/SUCCESS in 102ms. The enricher also finds 0 items to enrich (correct off-season state).
- No crash history in journalctl: only clean systemd start/stop events (last restart was Jun 11 — a code-deploy, not a crash).

**Why health probe reads UNHEALTHY:**
Health check keys on last-successful-push-age vs a fixed threshold (360min from c016/c018 prior findings). Last push was Jun 16 18:02Z — now 9 days stale. No push = SLA breach in monitor's logic. Monitor cannot distinguish "queue empty = nothing to do (IDLE)" from "crashed/blocked = can't push (BROKEN)". This is the same false-alarm class documented in c018.

**Off-season context confirmed:**
BCTC is quarterly; Q2 filings (earnings months 4/7/10) arrive mid-to-late July. It is June 25. Zero pushes in the Jun 18–Jun 25 window is structurally expected — no new filings have been published on any monitored source (HOSE/HNX/UPCOM/SSC) for the 30-ticker watchlist.

**38 backlog rows:** These are the url_not_found/enrich_failed items (BDI, DAG, DLC, JSH, SIS, VDC, VNH, VEA sub-variants). They are genuine non-filers or SSC-invisible tickers. Not time-sensitive off-season. Will re-enter fetch cycle automatically when Q2 filings appear in July.

**B-14/B-05 classification: FALSE-CRITICAL.** Both alerts are health-monitor artifacts, not VPS failures.

---

## Archive

Full git history: `git log --oneline -20 -- docs/agent-memory/notebooks/ops-vps-fetch.md`
