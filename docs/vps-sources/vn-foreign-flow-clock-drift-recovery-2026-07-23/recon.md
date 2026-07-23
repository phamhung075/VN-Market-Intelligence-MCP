# Recon — vn-foreign-flow-clock-drift-recovery-2026-07-23

**Date:** 2026-07-23 16:12–16:25 UTC
**Agent:** ops-vps-fetch
**Task:** FFLOW-STALE-0723-A-VPS-FIX (router dispatch, coordination_session=4ae45b71-6dbf-4623-ab62-f388d14d2c85)
**Trigger:** User-escalated — `get_market_foreign_flow` latest_date stuck at 2026-07-21, no 07-22/07-23 data. Premise: Vinahost VPS suspended for non-payment, now paid/resumed.

---

## Executive Summary

1. **VPS is reachable again** (SSH via password auth, `sshpass`) — `root@125.212.251.27`, `uptime` shows 98 days, no reboot.
2. **`vn-foreign-flow.service` was NEVER down, NEVER crashed, NEVER restarted** (`NRestarts=0`, `active (running) since 2026-07-08`). This **disproves** the systemd `StartLimitBurst` crash-loop hypothesis from the prior recon (`docs/vps-sources/vps-push-plane-stale-2026-07-22/recon.md`, cycle c024) for this service — that hypothesis was built without live SSH access and is now supersede-corrected by live evidence. Same holds for `vn-price-fetch.service` (`NRestarts=0`, active since 07-10) and `vn-sbv-fetch.service` (`NRestarts=0`, active since 07-08) — none of the three "crash-looped" units are or ever were in `failed` state.
3. **Real root cause: hypervisor-level VM pause/freeze during the non-payment suspension → guest system clock drifted ~2 days 13 hours behind real time.** Vinahost most likely paused the VM's vCPU (not a network-only block, not a full shutdown) — the guest never observed the pause (uptime/systemd/uninterrupted per-minute log cadence all show zero gap), but its wall clock stopped advancing for the paused duration and resumed exactly where it left off.
4. **Consequence:** `fetch-foreign-flow-loop.sh` gates fetching on `date -u +%H` being in `[2,8]` UTC (VN market hours 09:00–15:00). With the clock drifted, the loop's understanding of "is it market hours" was wrong by ~2.5 days — it silently skipped the real 07-22 and 07-23 trading windows (its drifted clock read those real UTC 02:00–08:00 spans as VPS-local evening/night, outside the gate) while (at the moment I connected) actively re-fetching during a real off-hours moment its drifted clock mistook for market hours. This is why the pipeline (server-side `date` stamping, see below) never advanced past 07-21: no successful pushes were attempted during the actual 07-22/07-23 sessions.
5. **Fixed:** forced NTP resync (`systemctl restart systemd-timesyncd`) — clock stepped from `2026-07-21T03:28:49Z` to `2026-07-23T16:15:47Z` (real time) instantly. Restarted + confirmed `enabled` on `vn-foreign-flow.service`. Post-fix, the service correctly recognized real off-hours (23:2x ICT) and went idle (`sleep 300`, not fetching) — proof the gate now evaluates correctly.
6. **Live end-to-end fetch+push proven working**, real evidence captured (not self-reported): `bgapidatafeed.vps.com.vn` → 97964B/104 raw items → jq-extracted 102 items → `POST https://zenmidi.com/api/push-foreign-flow` → `HTTP 200 {"ok":true,"upserted":102,"validationErrors":0}`. HTTP 200 (not 503) also confirms the circuit breaker is closed/healthy — not touched, no reset needed.
7. **Backfill:** 07-22 is **not recoverable** via this pipeline — `bgapidatafeed.vps.com.vn/getliststockdata/{codes}` is a live-snapshot-only endpoint (confirmed: no date/range parameter anywhere in `fetch-foreign-flow.sh`, `run-foreign-flow-debug.sh`, or the API call itself), and no historical foreign-flow source is wired into this pipeline. 07-23 got one real (non-fabricated) row via the manual debug-script push run during this recon; full intraday coverage for 07-23 was NOT captured live (market already closed in VN by the time the clock got fixed) — normal live coverage resumes automatically at the next real market-hours window (07-24 02:00–08:00 UTC) now that the clock is correct.

---

## Evidence

### VPS reachability
```
$ ssh root@125.212.251.27 "echo ok && hostname && uptime"
SSH_OK
57155.vpsvinahost.vn
 10:25:08 up 98 days,  7:09,  1 user,  load average: 0.16, 0.22, 0.18
```
No reboot in 98 days — rules out a full VM shutdown/restart as the recovery mechanism; whatever happened was a pause/freeze, not a stop/start.

### Clock drift (before fix)
```
Local host (real time):  Thu 23 jul 2026 16:12:19 UTC
VPS (`date -u`):          Tue Jul 21 03:25:31 AM UTC 2026
timedatectl: "System clock synchronized: yes" / "NTP service: active"  ← self-reported sync status was WRONG/stale
```
Offset: ~2 days 12h47m. `timedatectl` claiming "synchronized: yes" despite the huge offset indicates the sync-status flag was stale (last valid at pre-pause time), not re-evaluated.

### NTP history — corroborates hypervisor-pause, not network-only block
```
$ journalctl -u systemd-timesyncd -n 30
...
Jul 01 09:28:39  Contacted time server 185.125.190.57:123 (ntp.ubuntu.com).
Jul 17 17:56:42  Timed out waiting for reply from 185.125.190.57:123 (ntp.ubuntu.com).
Jul 17 18:30:51  Contacted time server 185.125.190.56:123 (ntp.ubuntu.com).
                 ← nothing after this; timesyncd's own poll timer (34min max interval)
                   never fired again until my manual restart — consistent with the guest's
                   own timers being frozen along with the CPU, not merely network-blocked
                   (a network-only block would still show repeated "Timed out" entries).
```

### Kernel-level corroboration
```
$ dmesg | tail -5
[8491886.779588] clocksource: Long readout interval, skipping watchdog check: cs_nsec: 5746436929 wd_nsec: 504084364
```
This is the Linux clocksource watchdog's classic symptom of a hypervisor pause/resume — a "long readout interval" between two clocksource reads that the guest kernel itself flags as abnormal.

### Service was never down (disproves c024's StartLimitBurst hypothesis for these 3 units)
```
$ systemctl show vn-foreign-flow.service -p ActiveState,SubState,ActiveEnterTimestamp,NRestarts
ActiveState=active / SubState=running / ActiveEnterTimestamp=Wed 2026-07-08 01:52:49 +07 / NRestarts=0

$ systemctl show vn-price-fetch.service -p ActiveState,SubState,ActiveEnterTimestamp,NRestarts
ActiveState=active / SubState=running / ActiveEnterTimestamp=Fri 2026-07-10 10:49:15 +07 / NRestarts=0

$ systemctl show vn-sbv-fetch.service -p ActiveState,SubState,ActiveEnterTimestamp,NRestarts
ActiveState=active / SubState=running / ActiveEnterTimestamp=Wed 2026-07-08 01:52:31 +07 / NRestarts=0
```
None ever entered `failed`. `systemctl list-units 'vn-*'` shows all 10 defined units `active running` (only `vn-ohlcv-backfill.service` shows `activating` — pre-existing, unrelated, tracked separately per c023).

`/var/log/vn-foreign-flow.log` shows **zero `[ERROR]`/`FAIL` lines** anywhere near the incident window (only 6 error lines in the entire log history, most recent 2026-07-03) and continuous per-minute entries with no missing weekday in the day-bucketed count — fully consistent with "process never stopped, clock just drifted," not "crashed and stayed dead."

**Correction to prior recon:** `docs/vps-sources/vps-push-plane-stale-2026-07-22/recon.md` (c024, written while SSH was unreachable) hypothesized a systemd `StartLimitBurst` lockout for `prices`/`foreign-flow`/`sbv` based on static config + git history alone. That hypothesis is now disproven by live evidence for all three units — actual mechanism is VM pause → clock drift → market-hours gate misfire, not a crash lockout. The server-side `vps_push_log` gap c024 measured (no successful push 2026-07-21 03:08→36h+) is still real and consistent with this corrected mechanism: while the VM was paused, literally nothing executed (zero curl attempts, zero log lines, zero server-side rows) — there is no contradiction, just a different cause than originally guessed.

### Remediation commands + real output
```
$ ssh root@$VINAHOST_IP "date -u; systemctl restart systemd-timesyncd; sleep 8; date -u; timedatectl status"
--- BEFORE ---
Tue Jul 21 03:28:49 AM UTC 2026
--- AFTER ---
Thu Jul 23 04:15:47 PM UTC 2026
Local time: Thu 2026-07-23 23:15:47 +07 / Universal time: Thu 2026-07-23 16:15:47 UTC
System clock synchronized: yes / NTP service: active

$ ssh root@$VINAHOST_IP "systemctl restart vn-foreign-flow.service; systemctl enable vn-foreign-flow.service; systemctl is-enabled vn-foreign-flow.service; systemctl is-active vn-foreign-flow.service"
enabled
active
--- AFTER status ---
Active: active (running) since Thu 2026-07-23 23:16:10 +07; 4s ago
Main PID: 3071312 (fetch-foreign-f)
CGroup: 3071312 /bin/bash /root/fetch-foreign-flow-loop.sh
        3071318 sleep 300      ← correctly idle (off-hours per corrected clock); before the
                                   clock fix this would have been "sleep 60" + actively fetching
```

### Live end-to-end fetch+push proof (real script output, not self-reported)
```
$ ssh root@$VINAHOST_IP "FOREIGN_FLOW_API_URL='https://zenmidi.com/api/push-foreign-flow' \
    WATCHLIST_URL='https://zenmidi.com/api/watchlist' \
    API_KEY='<VPS_PUSH_API_KEY>' /root/run-foreign-flow-debug.sh --verbose"

2026-07-23T16:16:40Z === FOREIGN FLOW DEBUG START ===
2026-07-23T16:16:40Z Fetching watchlist from https://zenmidi.com/api/watchlist ... → 111 codes
2026-07-23T16:16:40Z Fetching VN stocks from bgapidatafeed.vps.com.vn ...
2026-07-23T16:16:41Z VPS API response: 97964B, dur=248ms → Raw items: 104
2026-07-23T16:16:41Z Extracted: 102 items with non-zero flow (11626B)
2026-07-23T16:16:41Z   {"code":"HPG","foreignBuyVol":1006681,"foreignSellVol":1379572,"foreignRoom":232514626.50}
2026-07-23T16:16:41Z   {"code":"VIX","foreignBuyVol":970744,"foreignSellVol":721450,"foreignRoom":226499813.90}
2026-07-23T16:16:41Z Pushing 102 items to https://zenmidi.com/api/push-foreign-flow ...
2026-07-23T16:16:42Z Push: HTTP 200, response: {"ok":true,"upserted":102,"validationErrors":0}
2026-07-23T16:16:42Z === FOREIGN FLOW DEBUG DONE: pushed 102 items ===
EXIT_CODE=0
```
Note: the deployed `/root/run-foreign-flow-debug.sh` still has unsubstituted `__MCP_BASE__`/`__API_KEY__` placeholders (a pre-existing, separate `deploy-vinahost.sh` gap — same defect class noted in c023 for `fetch-ohlcv-backfill.sh`) — worked around by passing the real values as env overrides (matching the values baked into the deployed `fetch-foreign-flow.sh`, cross-checked against `.env`'s `VPS_PUSH_API_KEY`). Flagging for `ops`/`dev-vps-crawls` as a minor follow-up, not fixed here (out of `no_code_writing` boundary).

HTTP 200 (not 503 `CircuitOpenError`) is itself proof the `foreignFlow` circuit breaker is closed and accepting writes — per task instruction, **not reset, not touched** (nothing to reset).

### Server-side date stamping (why this matters for backfill)
`apps/mcp-server/src/interface/mcp/routes/pushForeignFlowHandler.ts`:
```ts
const todayUtc = new Date().toISOString().slice(0, 10);
...
date: typeof raw.date === "string" && raw.date ? raw.date : todayUtc,
```
The VPS payload never includes a `date` field (`fetch-foreign-flow.sh`/`run-foreign-flow-debug.sh` only send `code`/`foreignBuyVol`/`foreignSellVol`/`foreignRoom`/…) — every row is always stamped with the **receiving server's** real clock date, not the VPS's. This is why the drifted VPS clock did not corrupt existing rows with wrong dates — it simply prevented pushes from happening at all during the real 07-22/07-23 windows (nothing to stamp).

---

## Backfill status

- **07-22 (Wed):** **Not recoverable** through this pipeline. `bgapidatafeed.vps.com.vn/getliststockdata/{codes}` is a live-snapshot API only — no date/range parameter exists anywhere in the deployed scripts or in the API path itself. No rows fabricated. If backfill is required, it needs a **different, historical-capable source** (e.g. HOSE/HNX daily foreign-trading bulletins, or the `vndirect-foreign` source already catalogued in `docs/agents/ops-vps-fetch/knowledge.md § Source Catalog` as `cloudflare_managed` anti-bot) — that would be a **new recon task**, out of this incident's scope.
- **07-23 (Thu, today):** One real row pushed via the manual debug-script run above (server-stamped `date=2026-07-23`). Full intraday coverage was not captured live — by the time the clock was corrected it was already 23:2x ICT (market closed for the day). Normal automatic live coverage resumes at the next real market-hours window, **2026-07-24 02:00–08:00 UTC**, now that the clock is correct.

---

## Residual risk

1. **Clock drift can recur.** `systemd-timesyncd`'s own poll timer appears to freeze along with the guest during a hypervisor pause and does not self-correct with a hard step on resume (it took a manual `systemctl restart systemd-timesyncd` to force the step even though `timedatectl` claimed "synchronized: yes" the whole time). If Vinahost suspends the VM again (non-payment or otherwise), the same drift + market-hours-gate misfire will recur silently, with `timedatectl status` giving a false "synchronized" read. **Recommendation (not applied, out of `no_code_writing` boundary):** either switch to `chrony` (steps hard on large offsets automatically) or add a boot-time/hourly cron `ntpdate`/`timedatectl set-ntp false && true` step-check as a safety net — flagging for `ops`.
2. **Same clock-drift mechanism plausibly affected `vn-price-fetch` and `vn-sbv-fetch`** (both share the VM-wide clock and the same market-hours-gate pattern) — I only fixed the shared VPS-wide clock and directly remediated `vn-foreign-flow.service` per this task's scope; `prices`/`sbv` should self-correct automatically now that the clock is fixed (same loop-gate logic, no per-service action needed), but this was not independently re-verified end-to-end for those two — flagging for whoever owns FFLOW-STALE-0723 follow-up / c024's `ops` signal.
3. **`vn-vps-proxy.service` has unrelated pre-existing issues** (OOM-kill of a `python3` child, `cgroup: fork rejected by pids controller`) spotted in `dmesg` — out of scope for this task, flagging only as observed context, not investigated further.
4. **`deploy-vinahost.sh` does not substitute `__MCP_BASE__`/`__API_KEY__` in `/root/run-foreign-flow-debug.sh`** — same class of gap already known for `fetch-ohlcv-backfill.sh` (c023). Minor (debug-only script, workaround via env override used above), flagging for `ops`/`dev-vps-crawls`.

---

## Handoff

No `dev-vps-crawls` signal — no anti-bot/scraper-code finding, the pipeline itself is code-correct; this was pure infra (clock) recovery, within `ops-vps-fetch`'s SSH-probe/recon boundary, no code touched. WORK channel notified. Corrects/supersedes the `StartLimitBurst` hypothesis in `docs/vps-sources/vps-push-plane-stale-2026-07-22/recon.md` (c024) for `foreign-flow`/`prices`/`sbv` — that doc's Measurement Bug A/B and VPS cron/timer inventory findings are unaffected and still stand.
