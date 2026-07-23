# ops-vps-fetch — Notebook

**Last updated:** 2026-07-23 16:25 UTC | **Sprint:** FFLOW-STALE-0723-A-VPS-FIX — foreign-flow clock-drift ROOT-CAUSED + FIXED, corrects c024's crash-loop hypothesis (see c025)

---

## Active Sources Under Watch

| Source | Last recon | Status | Anti-bot |
|--------|-----------|--------|---------|
| vps-foreign-flow | 2026-07-23 | **FIXED** — VM hypervisor-pause (Vinahost non-payment suspension) froze guest clock ~2d13h; NTP force-resynced, service restarted+enabled, live fetch+push proven (HTTP 200). Was NEVER crash-looped (`NRestarts=0` throughout) — corrects c024. 07-22 unrecoverable (snapshot-only API); 07-23 partial (1 manual push). See c025. | none — infra, not anti-bot |
| vps-prices / vps-sbv | 2026-07-22 | Same VM-wide clock fixed in c025 (shared host) — both `NRestarts=0`, never crash-looped either; not independently re-verified end-to-end post-fix, flagged as follow-up. | none — infra, not anti-bot |
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
- News crash-loop DISPROVEN (c022): real cause was a Cloudflare Tunnel outage 07-04→07-07, not systemd — same "assumed crash, actually infra-adjacent" pattern later repeated in c024/c025.
- systemd StartLimitBurst lockout (c024) — **CORRECTED by c025**: live evidence (`NRestarts=0` on all 3 units) disproves the crash-loop hypothesis; real cause was a hypervisor VM-pause clock-drift (see c025). c024's Measurement Bug A/B (off-hours masking, sbv dual-writer) and cron/timer inventory findings are unaffected and still stand.

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

## c025 · 2026-07-23T16:25Z · FFLOW-STALE-0723-A-VPS-FIX — root cause was VM hypervisor-pause clock-drift, NOT c024's crash-loop; FIXED live

Trigger: user-escalated, `get_market_foreign_flow` stuck at 07-21. Premise: Vinahost non-payment suspension, now paid/resumed.

**VERDICT: `vn-foreign-flow.service` (+ `vn-price-fetch`/`vn-sbv-fetch`) never crashed — `NRestarts=0`, `active running` continuously since before the incident (Jul 08/08/10 resp.).** This disproves c024's `StartLimitBurst` hypothesis for these 3 units (built without SSH access). **Real cause: Vinahost suspended the VM via a hypervisor pause/freeze (not shutdown, not network-only block)** — `uptime` shows 98 days no reboot, but the guest clock froze during the pause and resumed ~2d13h behind real time (`timedatectl` falsely claimed "synchronized: yes"). Corroboration: `journalctl -u systemd-timesyncd` shows zero poll activity between `Jul 17 18:30:51` and my manual restart (a network-only block would still show repeated "Timed out" retries — silence means the guest's own timers were frozen too); `dmesg` shows `clocksource: Long readout interval, skipping watchdog check` — the kernel's own pause/resume symptom. `fetch-foreign-flow-loop.sh` gates fetching on `date -u +%H` in `[2,8]` UTC (VN market hours) — with the clock drifted ~2.5 days, the loop silently skipped the real 07-22/07-23 trading windows while (at connect time) actively fetching during a real off-hours moment its drifted clock mistook for market hours.

**Fix applied:** `systemctl restart systemd-timesyncd` force-stepped the clock `2026-07-21T03:28:49Z → 2026-07-23T16:15:47Z` instantly. Restarted + confirmed `enabled` on `vn-foreign-flow.service`; post-fix it correctly went idle (`sleep 300`, off-hours) instead of erroneously fetching — proves the gate now reads real time. **Live end-to-end proof captured** (not self-reported): `/root/run-foreign-flow-debug.sh --verbose` → bgapidatafeed 97964B/104 items → 102 extracted → `POST /api/push-foreign-flow` → `HTTP 200 {"ok":true,"upserted":102,"validationErrors":0}`, exit 0. HTTP 200 (not 503) also confirms the `foreignFlow` circuit breaker was closed/healthy throughout — not touched, nothing to reset.

**Backfill:** 07-22 **not recoverable** — `bgapidatafeed.vps.com.vn/getliststockdata` is live-snapshot-only, no date param anywhere in the deployed scripts; would need a separate historical source (new recon, out of scope). 07-23 got one real manual-push row (server-stamps `date` from its own clock, unaffected by VPS drift); full intraday coverage resumes automatically 07-24 02:00 UTC now the clock is fixed.

**Residual:** clock-drift can recur on the next VM pause (`timedatectl` gives a false "synchronized" read, no auto hard-step observed) — recommend `ops` evaluate `chrony` or a boot-time step-check; `prices`/`sbv` share the same fixed VM clock but weren't independently re-verified end-to-end. `deploy-vinahost.sh` still doesn't substitute `__MCP_BASE__`/`__API_KEY__` into `/root/run-foreign-flow-debug.sh` (worked around via env override, same defect class as c023's OHLCV gap).

Full evidence: `docs/vps-sources/vn-foreign-flow-clock-drift-recovery-2026-07-23/recon.md`. No `dev-vps-crawls` signal — pure infra recovery, no code touched, no anti-bot finding.

---

## Archive

Full git history: `git log --oneline -20 -- docs/agent-memory/notebooks/ops-vps-fetch.md`
