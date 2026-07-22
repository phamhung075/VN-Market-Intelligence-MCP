# ops-vps-fetch — Notebook

**Last updated:** 2026-07-22 16:15 UTC | **Sprint:** vps-plane-stale-sources-audit — 3/4 push sources root-caused (systemd StartLimitBurst lockout), 2 measurement bugs pinpointed, handed to ops + dev-mcp-server (see c024)

---

## Active Sources Under Watch

| Source | Last recon | Status | Anti-bot |
|--------|-----------|--------|---------|
| vps-prices / vps-foreign-flow / vps-sbv | 2026-07-22 | **DEAD since 2026-07-21 ~03:05-09 UTC** — systemd StartLimitBurst lockout, no `StartLimitIntervalSec=0` on these 3 units (unlike news/reuters/tradingeconomics). No auto-recovery in 36h+; VPS itself unreachable via SSH this cycle so no manual restart possible. See c024. | none — infra, not anti-bot |
| cafef-index | 2026-05-13 | healthy | none |
| vn-news-rss (vn-news-fetch.service) | 2026-07-22 | Still healthy/pushing continuously (control for c024's diagnosis) | none |
| sbv-rates | 2026-07-22 | VPS push dead 36h+ (see above); `get_vps_service_health` falsely reports healthy — masked by local 4h VCB-fallback job sharing the same DB row (Measurement Bug B, c024) | none |
| hsx-bctc | 2026-05-13 09:17 | FIXED (HNX params corrected) / HSX SPA unchanged | none |
| hsx-bctc (api.hsx.vn) | 2026-05-15 04:45 | BLOCKER — /n/ JSON REST endpoints unreachable from VPS. Envoy route-level block, not geo-IP. | Envoy route table |
| ssc-bctc-newsearch | 2026-07-01 23:16 | **BROKEN (external)** — whole domain 503 "no server available", non-transient 9+min, NOT the documented ~12:00Z daily window this time. Blocks discovery for 30/33 HOSE watchlist tickers (only viable path). Retry/backoff still unshipped. | none (genuine outage, not anti-bot) |
| hnx-bctc-post-api | 2026-06-16 12:40 | FIXED — session warmup GET deployed; both NY+UPCOM warmup OK in live probes | ASP.NET session |
| hnx-bctc TLS (owa.hnx.vn) | 2026-07-04 06:20 | HARDENED live — `--cacert` pin verified, `-k` fully removed on VPS (see c021) | none |

---

## Recon Digest

Key historical context (full recon docs in `docs/vps-sources/*/recon.md`):
- afrLoop rollover fix (c014): regex `r"(\d{15,18})"`, HNX session warmup GET deployed
- SSC 503 ~12:00Z UTC daily maintenance window (c016): no retry = cycle burn; needs 1-retry + 60s backoff
- Foreign flow integrity issue (c017): dual-writer conflict on vnstock_trading_stats; dev-mcp-server owns fix
- systemd StartLimitBurst lockout (c024): `Restart=always` alone is not self-healing — any unit without `StartLimitIntervalSec=0` hits systemd's default 5-crashes/10s lockout and dies for good.

---

## c022 · 2026-07-07T17:03Z · FIX-NEWS-VPS-CRASH-LOOP recon #2 — crash-loop DISPROVEN, real Cloudflare Tunnel outage found instead

Trigger: dev-team dispatch, task nearly a month old, dispatcher pre-check AMBIGUOUS (blank uptime col, 1 fresh push after multi-day gap).

**VERDICT: NOT a systemd crash-loop.** `vn-news-fetch.service`: active 26d+ (since Jun 11), `NRestarts=0`, `Tasks: 2/32`. Last real oom-kill was Apr 21 (one-time, restart-counter 7625 in 15min) + one residual Apr 29 — zero crash events since, incl. zero restarts at all in the board-cited Jun 7/9 window. The 2026-06-09 alarm was already recon'd same-day: false-UNHEALTHY (Bug A, `vpsHealthPoller.ts` lexicographic-MAX bug) + cursor-jump (Bug B) — both fixes confirmed still live (commit `b3d3022c6`; VPS script mtime Jun11, 0 cap-triggers since).

**Real finding:** `/var/log/vn-news-fetch.log` push step (`POST zenmidi.com/api/push-news`) failed **95–100%** of cycles 2026-07-04T19:47Z→07-07T16:46Z (`error 1033`/502, Cloudflare Tunnel unreachable) — Jul5/Jul6 = 0/90 success both full days. **Not news-specific**: `vn-sbv-fetch.log` and `vn-foreign-flow.log` show the identical signature same window — shared Cloudflare Tunnel / mcp-server-side receiving-path issue, out of VPS-script scope. Recovering as of recon (last 2 cycles = http=200; live probe from VPS → 401 reachable). Full detail: `docs/vps-sources/vn-news-rss/recon.md` § Incident 07-07.

**Recommendation:** close FIX-NEWS-VPS-CRASH-LOOP done_verified/NO-CHANGE-NEEDED (crash-loop hyp. disproven); open separate `ops`-owned (local-infra) task for the Tunnel outage if dispatcher wants root-cause on the receiving side — no VPS script bug to fix.

---

## c023 · 2026-07-07T18:36Z · OPS-OHLCV-VPS-BACKFILL-STALL-NONWATCHLIST — pipeline-wide push failure ROOT-CAUSED

Trigger: dev-mcp-server found queue-done-without-push pipeline-wide during Monday-gap backfill (queue rows 559/561); escalated to ops-vps-fetch for SSH recon (out of dev-mcp-server's zone).

**VERDICT: root cause confirmed, NOT related to the Cloudflare Tunnel outage — predates it by 2.5 months.** `scripts/deploy-vinahost.sh` § 6 has never deployed `/root/fetch-ohlcv-backfill.sh` (only ships `ohlcv-backfill-poll.sh` + systemd units, since commit `68263eb6b`, 2026-04-17). Two phases, both confirmed live on VPS: **Phase A** (Apr17→Jun30, 466/541 poll cycles) — script absent, poller's `not found` skip-path unconditionally POSTs `ohlcv-backfill-done` anyway (by design, to unblock the server). **Phase B** (Jun30→present, 75/541 cycles) — script manually `scp`'d outside the sed-substitution+GUARD-1 pipeline as a side effect of the OHLCV-DEPTH-SUBTASK-A hardening commits, leaving literal `__MCP_BASE__`/`__API_KEY__` unsubstituted live on the VPS → every curl call fails DNS resolution. `grep -c "inserted\|OK \[" /var/log/ohlcv-backfill-poll.log` → **0** across the poller's entire 2026-04-17→present history. Full evidence: `docs/vps-sources/ohlcv-backfill-pipeline-stall/recon.md`.

**Boundary:** read-only SSH recon only (systemctl status, log tail/grep, `ls -la`/`stat`, live `grep` of file content, `git log`/`git show` on repo history) — no VPS file edited, no service restarted, no repo code changed. Fix (VPS re-deploy + `scripts/deploy-vinahost.sh` patch, exact diff proposed in recon.md) requires "local infra" changes = `ops`'s job per `not_my_job`, not mine. **Signal:** `docs/signals/ops-20260707T183607Z.json` → `ops`.

---

## c024 · 2026-07-22T16:10Z · vps-plane-stale-sources-audit — 3/4 push sources ROOT-CAUSED (systemd lockout), 2 measurement bugs pinpointed, VPS itself UNREACHABLE this cycle

Trigger: router dispatch — prices/sbv/bctc stale (news = control, healthy), 2 known measurement-bug classes suspected, VPS cron/timer plane never inventoried (router's + mcp-server's SSH both structurally broken).

**VERDICT: prices/foreign-flow/sbv crashed simultaneously 2026-07-21 ~03:05-09 UTC and never recovered — systemd `StartLimitBurst` lockout, git-corroborated.** Commit `42e8448ce` (2026-05-02) hardened news/reuters/tradingeconomics with `StartLimitIntervalSec=0` for a Playwright-OOM issue, explicitly leaving "6 services (bctc, price, foreign-flow, sbv, vps-proxy, ohlcv-backfill, bctc-enrich)... unchanged" believing they "had no burst limit" — wrong: no override means systemd's own default (5 crashes/10s) applies, stricter than what was just removed. Any `Restart=always` unit that crash-loops past that burst is marked `failed` and never self-restarts. Matches every fact: 3 services dead in a 4-min window, 36h+ zero recovery, `news` (already hardened) unaffected. Original trigger (what caused the first crash burst) unconfirmed — needs `journalctl`, VPS unreachable. bctc: VPS push itself last succeeded 2026-07-20 01:26:41 (62h, matches router exactly); separate 144-row `enrich_failed` backlog is a downstream/server-side issue, out of scope, cross-referenced against `FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP-ops-part1.md`.

**2 measurement bugs pinpointed with live DB evidence, NOT fixed (recon-only boundary, precedent c023):** (A) `vpsProxyTools.ts`'s off-hours suppression discards `isStale()`'s already-grace-aware verdict; `vpsHealthPoller.ts`'s `marketHoursOnly` gate has zero grace at all (confirmed live: `vn-price-fetch`/`vn-foreign-flow` show `idle` right now despite 36h dead). (B) `sbv_rates` PK=`source`, both the VPS push handler AND a local 4h VCB-fallback job (`sbvRatesJob.ts`) write the same hardcoded `source='sbv'` row via `storeSbvSnapshot()` — confirmed live: only row has `is_estimate=1` (proves local fallback, not VPS), refreshed seconds before this recon, masking the VPS pipe's true 36h+ death from `get_vps_service_health`.

**VPS cron/timer plane:** 0 crontab (100% systemd), 11 units inventoried from repo/`deploy-vinahost.sh` cross-check. 2 units (`vn-agm-plan.service`, `vn-reuters-fetch.service`) never wired into the deploy script — same dead-code class as c023's OHLCV gap. **Zero live systemctl/journalctl obtained** — SSH/HTTP(8765/443/80)/ICMP to `125.212.251.27` all timed out this cycle (traceroute dies at Vinahost's own edge, hop 14); crucially this does NOT mean the VPS is down — `news` is provably still pushing live, so this is an inbound-only reachability gap (firewall/allowlist), stacking on top of the already-known `sshExec.ts` break — net effect: **no remote path currently exists to un-stick the 3 failed units.**

Full evidence: `docs/vps-sources/vps-push-plane-stale-2026-07-22/recon.md`. **Signals:** `docs/signals/dev-mcp-server-20260722T161000Z.json` → dev-mcp-server (2 measurement bugs, exact diffs); `docs/signals/ops-20260722T161000Z.json` → ops (systemd hardening + manual restart once reachable + reachability investigation).

---

## Archive

Full git history: `git log --oneline -20 -- docs/agent-memory/notebooks/ops-vps-fetch.md`
