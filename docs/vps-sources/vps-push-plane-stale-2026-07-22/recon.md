# Recon — vps-push-plane-stale-2026-07-22

**Date:** 2026-07-22 16:10 UTC
**Agent:** ops-vps-fetch
**Task:** vps-plane-stale-sources-audit (router dispatch, coordination_session=88e6b035-9e4e-40df-a659-0fb4c39eca39)
**Trigger:** fetch_broken — 3/4 VPS push sources stale (prices/sbv/bctc), news healthy (control); 2 known measurement-bug classes suspected; VPS cron/timer plane never inventoried (SSH from router/mcp-server unreachable)

---

## Executive Summary

1. **prices, foreign-flow, sbv died simultaneously ~2026-07-21 03:05–03:09 UTC and never recovered.** Root-caused (with git-history corroboration) to a **systemd `StartLimitBurst` lockout**: `vn-price-fetch.service`, `vn-foreign-flow.service`, `vn-sbv-fetch.service` never received the `StartLimitIntervalSec=0` hardening that commit `42e8448ce` (2026-05-02, task 1822b) applied to `vn-news-fetch`/`vn-reuters-fetch`/`vn-tradingeconomics-fetch` — that commit's own message explicitly lists these as "unchanged." Once `Restart=always` crash-loops past systemd's default burst limit (5 restarts/10s), the unit enters `failed` state and **stops restarting itself forever** — matching exactly what's observed: three services dead in a 4-minute window, zero recovery in 36h+, while the already-hardened `news` kept running uninterrupted (the control).
2. **bctc** VPS push last succeeded 2026-07-20 01:26:41 (~62h, matches router's figure exactly). Downstream of that push, 144 queue rows failed at the "enrich" step in one batch at 2026-07-20 19:05:17 and have not been retried since — that stage is server-side (pdf-extractor/reconcile job), not the VPS fetch script, and appears to be a separate, already-tracked issue (see `docs/agent-memory/decisions/FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP-ops-part1.md`, a related-but-distinct pipeline corruption investigation from 2026-07-21). I could not confirm from here whether `vn-bctc-fetch.service` itself is alive or also hit the same lockout — SSH is unreachable (see § Unreachable).
3. **Both measurement bugs are pinpointed to exact file/line with live evidence** (§ Measurement Bug A/B below). **I have NOT edited the code** — per this agent's `no_code_writing`/recon-only boundary and precedent (notebook c023), the fix is specified precisely and handed to `dev-mcp-server` via signal, since both live in `apps/mcp-server` (not VPS scripts, not scheduler/*).
4. **VPS cron/timer plane inventoried from the repo** (11 systemd units, 0 crontab entries — this project is 100% systemd, no legacy cron). **Live state (systemctl status/enabled, journalctl, exit codes) could NOT be captured — SSH to the VPS is fully unreachable from this session**, on top of the already-known server-side `sshExec.ts` break. Two units (`vn-agm-plan.service`, `vn-reuters-fetch.service`) exist in the repo but are **never referenced by `scripts/deploy-vinahost.sh`** — same "unit file exists, was never actually deployed" defect class as the OHLCV-backfill incident (c023).

---

## Evidence base

- **Live DB reads** (read-only, via `docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e '...'` against the mounted `/app/data/market.db`) — NOT the VPS itself; this is the local mcp-server container, reachable normally. All timestamps below are from this source unless marked "repo/git".
- **Repo/git**: `vps-scripts/*.service`, `vps-scripts/*.timer`, `scripts/deploy-vinahost.sh`, `git log`.
- **Network probes** from this session against `125.212.251.27` (SSH 22, HTTP 8765/443/80, ICMP, traceroute) — all failed; see § Unreachable.
- No VPS SSH access was obtained this cycle — **no live systemd/journalctl/crontab output exists in this doc**. Every VPS-side "why" below is inferred from server-side (mcp-server) telemetry + repo/git evidence, clearly labeled.

---

## Item 1 — Per-source root cause

### Control — `news` (healthy, still pushing as of this recon)
`vps_push_log`: continuous "ok" pushes every 15–30 min through 2026-07-22 16:00:08 (checked live, seconds before writing this doc). Proves the VPS itself is alive, networked, and able to reach the mcp-server's public ingest endpoint right now — this rules out "whole VPS down" or "whole VPS network dead" as an explanation for the other three.

### `prices` + `foreign-flow` — dead since 2026-07-21 ~03:08 UTC
```
vps_push_log (service=prices):  last "ok" 2026-07-21 03:08:05 (111 items) — then nothing. 58 ok-pushes in the preceding 48h window, all before that timestamp.
daily_foreign_flow MAX(updated_at) WHERE foreign_buy_vol IS NOT NULL: 2026-07-21T03:08:58.593Z — same minute.
```
Both scripts are pushed by the same market-hours loop family (`fetch-prices-loop.sh` / `fetch-foreign-flow-loop.sh`); they stopped within 53 seconds of each other.

### `sbv` — dead since 2026-07-21 03:05:21 UTC (real signal masked by Bug B, see below)
```
vps_push_log (service=sbv): last "ok" 2026-07-21 03:05:21 — 23 ok-pushes in the preceding 48h, then nothing.
```
Died ~3 minutes before prices/foreign-flow — same incident window, different script/process (sbv is not market-hours-gated; it runs on its own ~30min cadence per `fetch-sbv-loop.sh`).

### Root-cause mechanism for all three (systemd StartLimitBurst lockout)

Live unit files (`vps-scripts/*.service`, checked in repo — this is the last-known-deployed config per `scripts/deploy-vinahost.sh`):

| Unit | `Restart=` | `StartLimitIntervalSec=0`? |
|---|---|---|
| `vn-news-fetch.service` | always | **yes** (in `[Unit]`) |
| `vn-reuters-fetch.service` | always | **yes** |
| `vn-tradingeconomics-fetch.service` | always | **yes** |
| `vn-price-fetch.service` | always | **no** |
| `vn-foreign-flow.service` | always | **no** |
| `vn-sbv-fetch.service` | always | **no** |
| `vn-bctc-fetch.service` | always | **no** |
| `vn-agm-plan.service` | always | **no** |
| `vn-board-details.service` | always | **no** |
| `vn-vps-proxy.service` | always | **no** |

Git history explains why: commit `42e8448ce` (2026-05-02, "fix(1822b): disable StartLimitBurst in Playwright-based VPS services") —

> "Removes StartLimitBurst=5 + StartLimitIntervalSec=300 from 3 services that use Playwright/Chromium (vn-news-fetch, vn-reuters-fetch, vn-tradingeconomics-fetch)... **Other 6 services (bctc, price, foreign-flow, sbv, vps-proxy, ohlcv-backfill, bctc-enrich) had no burst limit and are unchanged.**"

That framing ("had no burst limit") is the bug: "no explicit override" does **not** mean "no limit" — it means systemd's own compiled-in default applies (`DefaultStartLimitIntervalSec=10s`, `DefaultStartLimitBurst=5`), which is *stricter* than the `300s` window the Playwright services were just freed from. Any of these 7 "unchanged" services that crash ≥5 times within a 10-second window will be marked `failed` by systemd and **never restart itself again**, `Restart=always` notwithstanding — a `failed` unit does not auto-restart; only a human/automation running `systemctl reset-failed && systemctl start` (or a host reboot) clears it.

This matches every observed fact:
- Three independently-scripted services (different upstream domains: HOSE/HNX batch API, Vietcombank XML, SBV) died within a 4-minute window — consistent with *something* (unconfirmed without SSH: upstream block, transient network blip, resource spike) triggering near-simultaneous crash-restarts on all three, which then tripped the identical default lockout on each.
- 36+ hours with zero recovery, despite `Restart=always` on all three.
- The one service that survived the same window (`news`) is the one that was deliberately hardened against exactly this lockout mechanism, in the same commit, months ago — for an unrelated (Playwright OOM) reason at the time.

**I could not confirm the original trigger** (what caused the first crash ≥5 times in 10s) — that requires `journalctl -u <unit> --since ...` on the VPS, which is unreachable this cycle (§ Unreachable). The **non-recovery** mechanism (systemd lockout) is the part I'm confident in, since it is fully explained by static config + git history, independent of live access.

### `bctc` — last real push 2026-07-20 01:26:41 (~62h), downstream backlog separate issue
```
vps_push_log (service=bctc): last "ok" 2026-07-20 01:26:41 (matches router's figure exactly).
bctc_vps_queue status counts: done=69 (max last_attempt 2026-07-19 13:35:00), enrich_failed=144 (max last_attempt 2026-07-20 19:05:17, all 144 share the identical timestamp — one batch sweep, not per-item retries), url_not_found=39, deferred_infra=328 (all created 2026-05-12→2026-06-07 — pre-existing debt, unrelated to this incident), pending=0.
```
Two different "how stale is bctc" numbers exist because two different pipeline stages are being measured: `vps_push_log` (raw VPS push events, 62h) vs. queue `status='done'` (full pipeline completion including the server-side "enrich" step, 74h — this is what `get_vps_service_health` uses, see `vpsHealthPoller.ts` `DEFAULT_FRESHNESS_CONFIGS[vn-bctc-fetch]`). Both are internally consistent; they measure different things and both correctly report "unhealthy" today (`activeCount` from `queueGuardSql` = 144+39 = 183 > 0, so the idle-suppression guard does *not* apply here — this one is not masked).

The 144-row `enrich_failed` batch failure is downstream of the VPS (an OCR/parse/reconcile step, not `fetch-bctc-loop.sh`) and is out of this agent's scope — flagging it as observed context, not claiming it as a VPS-fetch finding. `docs/agent-memory/decisions/FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP-ops-part1.md` (2026-07-21T15:08Z, already committed) documents a related-but-distinct BCTC pipeline incident (financial_reports corruption, bootstrap reparse hook) in the same window — worth the receiving agent cross-checking whether they're connected, but I am not asserting they are the same root cause.

**Whether `vn-bctc-fetch.service` itself is alive or also crash-looped is unconfirmed** — no SSH access this cycle.

---

## Item 2 — VPS cron/timer plane inventory

**Finding #1: there is no crontab anywhere in this pipeline.** `scripts/deploy-vinahost.sh` (and its byte-identical duplicate `apps/mcp-server/deploy-vinahost.sh`) only ever calls `systemctl enable/restart/status` — zero `crontab` references. The entire VPS scheduling plane is systemd services + 2 systemd timers.

**Finding #2: repo-declared inventory (11 units) — deploy-wiring cross-checked against `deploy-vinahost.sh`:**

| Unit | Type | Cadence (design) | `Restart=always`? | `StartLimitIntervalSec=0`? | Wired in `deploy-vinahost.sh`? |
|---|---|---|---|---|---|
| `vn-price-fetch.service` | simple loop | 60s during VN market hours (02:00–08:30 UTC), idle off-hours | yes | **no** | yes (enable+restart) |
| `vn-foreign-flow.service` | simple loop | 60s during market hours | yes | **no** | yes |
| `vn-sbv-fetch.service` | simple loop | ~30 min | yes | **no** | yes |
| `vn-bctc-fetch.service` | simple loop | 6h | yes | **no** | yes |
| `vn-news-fetch.service` | simple loop | 15 min, 24/7 | yes | yes | yes |
| `vn-reuters-fetch.service` | simple loop | continuous | yes | yes | **no — never scp'd/enabled by deploy-vinahost.sh** |
| `vn-tradingeconomics-fetch.service` | simple loop | continuous | yes | yes | yes |
| `vn-agm-plan.service` | simple loop | continuous | yes | **no** | **no — deploy script only ships the underlying `vietstock-agm-plan.py` CLI for on-demand `:8765/proxy/agm-plan` invocation; the loop-service unit itself is never enabled** |
| `vn-board-details.service` | simple loop | continuous (docs say "daily 02:00 UTC" in the echo banner, but unit has no `OnCalendar` — contradiction, unit is a `Restart=always` loop, not a calendar timer) | yes | **no** | yes |
| `vn-vps-proxy.service` | simple (Node) | always-on, :8765 | yes | **no** | yes |
| `vn-ohlcv-backfill.timer`+`.service` | oneshot+timer | every 30 min (`OnCalendar=*:0/30`) | n/a (oneshot) | n/a | yes (already the subject of the separate c023 fix) |
| `vn-bctc-enrich.timer`+`.service` | oneshot+timer | every 6h (`OnUnitActiveSec=6h`) + 2min after boot | n/a | n/a | yes |

**Findings from this table (repo-static, not live):**
- `vn-reuters-fetch.service` and `vn-agm-plan.service` exist as committed unit files but are **not part of the deploy pipeline** — same defect class as the OHLCV-backfill dead-code gap dev-mcp-server already fixed once (c023). Either they were deployed manually/out-of-band at some point (unconfirmed, no SSH), or they have never run at all. AGM data may in fact be served correctly via the separate on-demand `:8765/proxy/agm-plan` path (a CLI script, not this loop unit) — if so the `vn-agm-plan.service` unit file is simply obsolete/redundant, not a live gap; I can't tell which without SSH.
- `vn-board-details.service`'s deploy-script echo-banner claims "daily 02:00 UTC" but the unit itself has no `OnCalendar`/timer — it's a continuously-restarting loop like the others. Either the loop script self-throttles to once/day internally (untested from here) or the banner text is stale documentation. Minor, flagging for the doc owner.
- The two systemd **timers** (`ohlcv-backfill`, `bctc-enrich`) are `oneshot` + `Persistent=true`/`OnUnitActiveSec` — these are NOT subject to the `StartLimitBurst` failure mode described above (a timer just refires on its next scheduled tick regardless of the previous run's exit code), so they are not suspected in this incident.

**What I could NOT obtain (would require live SSH):**
- `systemctl is-enabled`/`is-active`/`status` for any of the 11 units (live state vs. repo-declared state)
- `journalctl -u <unit>` — crash signatures, OOM-kill evidence, restart counters, the actual trigger event at 03:05–03:09 UTC on 07-21
- Whether `vn-reuters-fetch.service` / `vn-agm-plan.service` are actually running despite not being in the deploy script (could have been enabled manually once)
- Disk space / memory pressure on the VPS at incident time
- Whether `vn-bctc-fetch.service` is alive right now or also `failed`

---

## Measurement Bug A — off-hours classification masks genuinely-stale data (feedback_auditor_freshness_threshold_market_hours_blind, still live)

**File:** `apps/mcp-server/src/interface/mcp/tools/system/vpsProxyTools.ts` (this is `get_vps_proxy_health`; NOT under `scheduler/*`)

**Root cause — precise, not the naive version:** `isStale()` (lines 129–176) already computes a window-relative threshold correctly for market-hours-only services (`sinceWindowEndMin + 30min grace` via `minutesSinceLastWindowEnd()` in `freshnessSlaChecker.ts`) — so it correctly evaluates `stale=true` for `prices` today (age ≈ 36h vs. a grace-adjusted threshold of ≈6.5h). **The bug is one layer up**, in `formatHealth()`:

```ts
// lines 71-85, 89-93 (current, unmodified)
const isOffHours = (MARKET_HOURS_ONLY_SERVICES.has(s.service) && !isVnMarketHours(now)) || ...;
const staleFlag = stale ? (isOffHours ? "off-hours" : "YES") : "no";
...
const trueStaleServices = services.filter((s) => {
  if (!isStale(s, now)) return false;
  if (isServiceOffHours(s)) return false;   // <-- unconditionally excludes ANY off-hours-stale service from the alert
  return true;
});
```

`isServiceOffHours()` is a *cruder*, purely-current-wall-clock check ("is it market hours right now") that is applied **on top of** the already grace-aware `isStale()` result, and it wins unconditionally. Since `isStale()` returning `true` during off-hours *already means* the age exceeded even the grace-extended threshold (that's the only way `isStale()` can be `true` off-hours — see the formula), the off-hours suppression is double-applying grace that was already spent, converting a genuine ~36h outage into a silently-excluded "OFF-HOURS (by design)" line with zero alert. Verified live: querying `market_prices`/`vps_push_log` today at report time (now well past the 02:00–08:30 UTC window) reproduces exactly this: `isStale()=true`, `isOffHours=true` → displayed as "off-hours", excluded from `STALE:` summary line.

**Proposed fix (not applied — handing to dev-mcp-server):** stop using `isServiceOffHours()` as an independent veto. Since `isStale()` already embeds the off-hours grace period, any `isStale()===true` result — off-hours or not — is definitionally a real breach and belongs in `trueStaleServices`/the `STALE:` line. Reserve the "off-hours" label for the case `isStale()===false` (i.e., quiet-by-design AND still within grace). Concretely: drop the `if (isServiceOffHours(s)) return false;` line inside the `trueStaleServices` filter, and change `staleFlag` to distinguish "off-hours, within grace, not stale" (still show something informational) from "off-hours, exceeded grace, IS stale" (must show `YES`/be counted). **Caution for the implementer:** this exact off-hours/grace logic has broad existing test coverage (`234-vps-health-sla.test.ts`, `FIX-SLA-WEEKEND-AWARE.test.ts`, `FIX-BCTC-SLA-WEEKEND.test.ts`, `1920i-freshness-sla-extension.test.ts`, and others) — some of those tests may currently assert the old (masking) behavior and will need review, not just `vpsProxyTools.ts` itself.

Same class of bug exists in the **other** health tool too, in a purer form — `apps/mcp-server/src/domain/services/vpsHealthPoller.ts` lines 318–326 (`checkServiceFreshness`):
```ts
if (config.marketHoursOnly && !isVnMarketHoursAt(nowIso)) {
  return { ...healthStatus: "idle"... };   // short-circuits BEFORE ever running the freshness query
}
```
This one has **zero** window-relative grace at all — it returns `"idle"` for `vn-price-fetch`/`vn-foreign-flow` any time it's polled outside 02:00–08:30 UTC, without ever checking whether a push happened during the most-recently-closed window. Confirmed live: `get_vps_service_health`'s backing table (`vps_service_health`) shows `vn-price-fetch: idle` and `vn-foreign-flow: idle` right now (16:00 UTC), regardless of the fact both have been dead since 07-21 03:08. **This is the literal instance of the bug as described in the task** — reads current wall-clock only, never asks "did the most recent window get a push."

**Proposed fix:** replace the unconditional `marketHoursOnly` idle short-circuit with a window-relative check mirroring `lastExpectedWindowEnd()`/`minutesSinceLastWindowEnd()` (already implemented in `freshnessSlaChecker.ts` for the sibling tool) — only return `"idle"` when `latestAt` is within grace of the most-recently-closed window; otherwise fall through to the normal `ageMs > maxAgeMs` check.

---

## Measurement Bug B — `get_vps_service_health` liveness masks dead SBV data pipe (feedback_passive_health_masks_dead_data)

**File:** `apps/mcp-server/src/infrastructure/fetchers/sbv.ts` (`storeSbvSnapshot`) + `apps/mcp-server/src/domain/services/vpsHealthPoller.ts` (`DEFAULT_FRESHNESS_CONFIGS[vn-sbv-fetch]`)

**Root cause — confirmed live, not hypothetical.** `sbv_rates` has **exactly one row**, live right now:
```json
{"source":"sbv","usd_vnd_official":26120,"fetched_at":"2026-07-22T16:00:04.272Z","is_estimate":1}
```
`is_estimate=1` proves this row did **not** come from the VPS push (the VPS push handler always writes real portal data; `is_estimate` defaults conservatively to `1` and is only `0` on a genuine live portal fetch). It came from the **separate, local, server-side** `sbvRatesRefresh` job (`apps/mcp-server/src/scheduler/macro/sbvRatesJob.ts`, cron every 4h — **this file is under `scheduler/*`, out of my edit scope and dev-mcp-server's to fix, not mine to touch**), which independently fetches a VCB fallback rate and calls the exact same `storeSbvSnapshot()`.

The collision: **both write paths — the VPS push handler (`pushSbvRatesHandler.ts`) and the local fallback job — call `storeSbvSnapshot()` with an identical hardcoded `const source = "sbv"`** (`infrastructure/fetchers/sbv.ts` line 384), and `sbv_rates.source` is the table's sole `PRIMARY KEY` (single-row-per-source, `INSERT OR REPLACE`). There is no column distinguishing "this row came from the VPS" vs. "this row came from the local 4-hourly fallback." Every 4 hours, regardless of whether the VPS pipe is alive or dead, the local fallback job overwrites `fetched_at` with a fresh timestamp — which is exactly what `vpsHealthPoller.ts`'s `vn-sbv-fetch` freshness check (`SELECT MAX(fetched_at) FROM sbv_rates`) reads, with **no `is_estimate=0` filter**. Result: `get_vps_service_health` reports `vn-sbv-fetch: healthy` continuously, even though the real VPS→SBV push has been dead 36h+ — confirmed live in this recon (`vps_service_health` row: `healthy`, `last_successful_run: "2026-07-22T16:00:04.272Z"`, i.e. seconds before this doc was written — while `vps_push_log` for `service='sbv'` has zero rows since `2026-07-21 03:05:21`).

Meanwhile `get_vps_proxy_health` reads `vps_push_log` directly (written **only** by the VPS push handler, never by the local fallback job) — correctly showing 36h+ stale. Two tools, two structurally different tables, one of which (`sbv_rates`) is silently fed by a second writer the health check doesn't know about. This is the exact "liveness ping passes while the data pipe is dead" pattern — except it's not a passive ping, it's a genuine local fallback whose success is being misread as VPS success.

**Proposed fix (not applied — handing to dev-mcp-server):** add `WHERE is_estimate = 0` to the `vn-sbv-fetch` `latestTimestampSql` in `vpsHealthPoller.ts`'s `DEFAULT_FRESHNESS_CONFIGS` (mirrors how `vn-news-fetch`'s config already reads `vps_push_log` directly rather than a shared/ambiguous table). This makes `get_vps_service_health` blind to the local fallback's writes and honest about VPS liveness, while leaving the fallback job itself untouched (it's a legitimate degrade-gracefully mechanism for end users — the bug is only that the *health check* can't tell the two apart, not that the fallback shouldn't exist).

---

## What I could not reach

- **SSH to `125.212.251.27:22`** — `Operation timed out` (confirmed independently in this session, matching the router's earlier finding).
- **HTTP to `125.212.251.27:8765` (app proxy), `:443`, `:80`** — all timed out, no RST (consistent with a stateful DROP, not "port closed").
- **ICMP echo to `125.212.251.27`** — 100% packet loss.
- **`traceroute`** — reaches Vinahost's own network block (`125.212.255.22`/`.222`, same `/16` as the target) at hop 14, then zero response for 6 further hops. Packets get to the datacenter's doorstep and die there.
- **This does NOT mean the VPS is down** — `news` is provably still pushing successfully as of seconds before this doc was written, meaning the VPS has working outbound internet connectivity right now. My inability to reach it is an **inbound-direction** reachability problem (firewall/IP-allowlist/DDoS-mitigation at the Vinahost edge or on the host itself), separate in kind from the server-side `sshExec.ts`-spawns-nonexistent-binary break already known. Two independent SSH-control failures currently stack: (1) mcp-server container has no ssh binary (server-side, being fixed separately), (2) this session's own direct SSH is also blocked (new finding, cause unconfirmed — possibly this session's egress IP isn't allow-listed, possibly a hardening change on the VPS side, possibly Vinahost-side DDoS mitigation). **No automated or manual remote-restart path currently exists for the 3 failed units.**
- Could not obtain any live `systemctl`/`journalctl`/crontab output — the entire Item 2 inventory above is repo-static, cross-referenced against `deploy-vinahost.sh`, not a live capture.
- Could not identify the original trigger event that crashed prices/foreign-flow/sbv ≥5 times in 10 seconds around 2026-07-21 03:05–09 UTC (upstream block vs. resource spike vs. reboot vs. something else) — only the non-recovery mechanism (systemd `StartLimitBurst` lockout) is evidenced.
- Could not confirm whether `vn-bctc-fetch.service` is itself alive or has also crash-looped.
- Could not confirm whether `vn-reuters-fetch.service`/`vn-agm-plan.service` are actually running on the VPS despite being absent from the deploy script (could have been enabled manually, out-of-band, at some point).

---

## Handoff

Per this agent's recon-only boundary (`no_code_writing`, `not_my_job: Fixing Docker services or local infra`) and notebook precedent (c023: "Fix... requires local infra changes = ops's job... not mine"), no code was edited this cycle. Two signals dropped:

- `docs/signals/dev-mcp-server-20260722T161000Z.json` → **dev-mcp-server** — Measurement Bug A (`vpsProxyTools.ts` + `vpsHealthPoller.ts`) and Measurement Bug B (`vpsHealthPoller.ts` sbv config + `sbv.ts`/`sbvRatesJob.ts` dual-writer), both with exact file/line pointers and proposed fixes above.
- `docs/signals/ops-20260722T161000Z.json` → **ops** — (1) restore VPS reachability (own the Vinahost dashboard/firewall — check IP allowlist / DDoS mitigation state) then `systemctl reset-failed && systemctl restart` for `vn-price-fetch`, `vn-foreign-flow`, `vn-sbv-fetch` (and verify `vn-bctc-fetch`); (2) apply `StartLimitIntervalSec=0` to `vn-price-fetch.service`, `vn-foreign-flow.service`, `vn-sbv-fetch.service`, `vn-bctc-fetch.service` in `vps-scripts/` (mirrors already-proven fix `42e8448ce`) and redeploy via `scripts/deploy-vinahost.sh`; (3) confirm whether `vn-agm-plan.service`/`vn-reuters-fetch.service` should be wired into the deploy script or removed as dead code.

No `dev-vps-crawls` signal this cycle — no anti-bot/scraper-implementation finding (the standard template target for this flow doesn't fit this incident; adapted per c023 precedent).
