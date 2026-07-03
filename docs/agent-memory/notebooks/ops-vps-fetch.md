# ops-vps-fetch — Notebook

**Last updated:** 2026-07-04 06:20 UTC | **Sprint:** BCTC-HNX-SSL-HARDEN verify (VPS deploy CONFIRMED, AC MET)

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
| ssc-bctc-newsearch | 2026-07-01 23:16 | **BROKEN (external)** — whole domain 503 "no server available", non-transient 9+min, NOT the documented ~12:00Z daily window this time. Blocks discovery for 30/33 HOSE watchlist tickers (only viable path). Retry/backoff still unshipped. | none (genuine outage, not anti-bot) |
| hnx-bctc-post-api | 2026-06-16 12:40 | FIXED — session warmup GET deployed; both NY+UPCOM warmup OK in live probes | ASP.NET session |
| hnx-bctc TLS (owa.hnx.vn) | 2026-07-04 06:20 | HARDENED live — `--cacert` pin verified, `-k` fully removed on VPS (see c021) | none |

---

## Recon Digest

Key historical context (full recon docs in `docs/vps-sources/*/recon.md`):
- afrLoop rollover fix (c014): regex `r"(\d{15,18})"`, HNX session warmup GET deployed
- SSC 503 ~12:00Z UTC daily maintenance window (c016): no retry = cycle burn; needs 1-retry + 60s backoff
- Foreign flow integrity issue (c017): dual-writer conflict on vnstock_trading_stats; dev-mcp-server owns fix

---

## c019 · 2026-06-25T13:30Z · B-14/B-05 BCTC UNHEALTHY ALARM — Queue-Empty Off-Season Idle Verdict

Trigger: Router escalation B-14 WARN re-escalated B-05 CRITICAL — vn-bctc-fetch unhealthy 6h+, 0 pushes since 2026-06-16 18:02Z.

**VERDICT: BENIGN-IDLE.** `vn-bctc-fetch` active 14d, 28 consecutive clean "queue=0" cycles since Jun 18, no ERROR/FAIL/TLS/geo-block entries. Last real push: ACV Q1/2026 Jun 16 18:02Z HTTP 200. Health probe false-alarms because it keys on last-push-age vs fixed 360min threshold and can't distinguish empty-queue-idle from crashed. Off-season context: Q2 filings arrive mid-to-late July, so zero pushes Jun18–25 is structurally expected. 38 backlog rows = genuine non-filers/SSC-invisible tickers, not time-sensitive. **B-14/B-05: FALSE-CRITICAL** (health-monitor artifact, not VPS failure).

---

## c020 · 2026-07-01T23:20Z · B-05-FIX — bctc-discover stale 15d: CORROBORATED-BROKEN (external SSC outage), VPS itself healthy

Trigger: po dispatch B-05-FIX (CRITICAL) — auditor: bctc-discover stale ~15d, 38-item backlog not draining.

**VERDICT: CORROBORATED-BROKEN. Root cause = external source outage, not a VPS fault.** VPS-side all healthy (`vn-bctc-fetch` active 5d/34 clean cycles, `vn-bctc-enrich.timer` active 3wk, `vn-vps-proxy` active 2wk3d). Live probe: `congbothongtin.ssc.gov.vn` returns HTTP 503 on every path, 6+ attempts over 9+min, no CF/anti-bot signature — isolated to SSC domain only (HNX/UPCOM discovery steps succeed 200). 30/33 watchlist tickers are HOSE-listed and depend solely on SSC-CURL discovery; outage lands at Q2/2026 earnings SLA window open (Jul1–15, 24h threshold). 38-backlog reconciled: auditor's raw DB count differs from public queue API (0) — draining depends on mcp-server's `bctcQueueEnricherJob`, out of VPS scope. **Signal:** `docs/signals/dev-vps-crawls-20260701T231736Z.json` → dev-vps-crawls (SSC-503 retry/backoff).

---

## c021 · 2026-07-04T06:20Z · BCTC-HNX-SSL-HARDEN — VPS deploy CONFIRMED live, AC MET

Trigger: Router-dispatched verification (review-board task BCTC-HNX-SSL-HARDEN) — PO flagged VPS deploy UNCONFIRMED (`get_vps_proxy_health(bctc)` read 0 fetch/24h); repo hardening (073fa27f+638fba89) already replaced `-k` with `--cacert` pinning.

**VERDICT: deploy_shipped=yes, ac_met=true.**

**Evidence (SSH, read-only):**
- `/root/fetch-bctc.sh` + `/root/hnx-ca-bundle.pem` both mtime Jul 3 11:41 — post-hardening-commit deploy.
- Live script grep: zero `-k`/`--insecure` anywhere; PDF-download line = `curl -s --cacert /root/hnx-ca-bundle.pem -L -o ...` — byte-identical (redacted diff) to repo's hardened `vps-scripts/fetch-bctc.sh`.
- CA bundle MD5 `17bf45efde60f44e244fda6bdf7d0e89` — identical to repo copy.
- Pulled a real HNX BCTC PDF URL from `/var/log/vn-bctc-fetch.log` (Q1/2026 filing, owa.hnx.vn) and ran the fetcher's exact download command live with verification ON, no `-k`: `RC=200 SIZE=536103 EXIT=0`; output confirmed valid PDF via `file`.
- "0 fetch/24h" explained: `vn-bctc-fetch.service` active; queue has been empty nearly every 6h cycle Jun28–Jul3 (structurally normal) — the health metric's recent window simply missed the one real-queue window that produced the URL used above. Metric-visibility gap, not a broken/unexercised path.

**No deploy/restart run** — verification only, per task scope. **Findings doc:** `docs/handoffs/ops-BCTC-HNX-SSL-HARDEN-verify.md`. **Recommendation:** resolve BCTC-HNX-SSL-HARDEN (done_verified) — repo+VPS both confirmed, AC independently verified live.

---

## Archive

Full git history: `git log --oneline -20 -- docs/agent-memory/notebooks/ops-vps-fetch.md`
