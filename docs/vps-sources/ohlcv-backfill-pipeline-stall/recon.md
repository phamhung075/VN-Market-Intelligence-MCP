# Recon — ohlcv-backfill-pipeline-stall

**Date:** 2026-07-07 18:35 UTC
**Agent:** ops-vps-fetch
**Task:** OPS-OHLCV-VPS-BACKFILL-STALL-NONWATCHLIST (task_board, P1, zone infra-vps)
**Trigger:** fetch_broken — dev-mcp-server found VPS OHLCV backfill poller marking queue rows "done" with ZERO `POST /api/push-ohlcv-history` calls, pipeline-wide (not just the original 5 peripheral non-watchlist codes)
**Endpoints involved:** `GET /api/ohlcv-backfill-queue`, `POST /api/push-ohlcv-history`, `POST /api/ohlcv-backfill-done` (all on `https://zenmidi.com`, correctly resolving)

---

## Executive Summary

**Root cause confirmed with live evidence — NOT related to the Cloudflare Tunnel outage window.** This bug has been present continuously since the poller's first deploy on 2026-04-17, i.e. ~2.5 months before the CF tunnel incident. `POST /api/push-ohlcv-history` has **never fired successfully, not once**, across the entire lifetime of `vn-ohlcv-backfill.timer` (0 `OK [...]`/`inserted` lines in `/var/log/ohlcv-backfill-poll.log`, which spans 2026-04-17→present).

Two-part root cause, both stemming from a single gap in `scripts/deploy-vinahost.sh`:

1. **`scripts/deploy-vinahost.sh` § "6. OHLCV backfill poller" never deploys `/root/fetch-ohlcv-backfill.sh`.** It SCPs `ohlcv-backfill-poll.sh` (with `sed` placeholder substitution + GUARD-1 leak check) and the two systemd unit files, but has no `$SCP vps-scripts/fetch-ohlcv-backfill.sh ...` line and no matching `chmod +x` for it. This gap has existed since the poller was introduced in commit `68263eb6b` (2026-04-17, task 1363/Sprint 124) and is still present today.
2. **Consequence, two phases, confirmed from `/var/log/ohlcv-backfill-poll.log` (spans 2026-04-17→2026-07-08, live on VPS):**
   - **Phase A (2026-04-17 → 2026-06-30, 466 of 541 `pending=true` cycles):** `/root/fetch-ohlcv-backfill.sh` did not exist on the VPS at all. Every poll cycle hit `ohlcv-backfill-poll.sh`'s `else` branch — `WARN /root/fetch-ohlcv-backfill.sh not found or not executable — skipping run` (`EXIT_CODE=1`) — then unconditionally called `POST /api/ohlcv-backfill-done` per its by-design comment `# Signal done regardless of exit code so the server unblocks`. This is exactly the "done called repeatedly, zero pushes" symptom dev-mcp-server observed.
   - **Phase B (2026-06-30T20:59 UTC+7 birth → present, 75 of 541 cycles):** someone manually `scp`'d `vps-scripts/fetch-ohlcv-backfill.sh` straight from the repo to `/root/fetch-ohlcv-backfill.sh` (raw copy, outside the `deploy-vinahost.sh` sed-substitution + GUARD-1 pipeline) — almost certainly as a side effect of shipping the OHLCV-DEPTH-SUBTASK-A / VNINDEX hardening commits (`33479360b`, `5939be5d5`, both 2026-06-30). This left the literal placeholder tokens **unsubstituted** in the live file: `MCP_BASE="${MCP_BASE:-__MCP_BASE__}"` / `API_KEY="${API_KEY:-__API_KEY__}"` (confirmed via live `grep` on VPS, 2026-07-07T18:xx). Every curl call inside the script now targets the non-resolvable host `__MCP_BASE__`, failing with curl exit 6 (`Couldn't resolve host`, 75/75 occurrences) or the script's own explicit `exit 1` FAIL branch. `ohlcv-backfill-poll.sh` itself IS correctly deployed (its own `MCP_BASE` is properly substituted to `https://zenmidi.com` — confirmed live), which is why `POST /api/ohlcv-backfill-done` keeps succeeding (HTTP 200) even though the backfill script inside it never gets anywhere near a real fetch/push.

`466 + 75 = 541` = exactly the total `pending=true` count logged. `grep -c "inserted\|OK \[" /var/log/ohlcv-backfill-poll.log` → **0**, for the entire log lifetime.

**Practical effect:** the auto-recovery mechanism that is supposed to backfill OHLCV gaps after any outage (including the 2026-07-04→07-07 Cloudflare Tunnel outage) has never actually worked since it was built. Every queue row silently self-resolves as "done" without ever fetching or pushing real data.

---

## VPS State at Probe Time (all read-only checks)

```
$ systemctl status vn-ohlcv-backfill.timer
● active (waiting) since 2026-06-11 00:23:13 +07 (3wk6d ago) — enabled, healthy timer itself
Trigger: next fire ~28min out, fires every 30 min as designed

$ systemctl status vn-ohlcv-backfill.service
○ inactive (dead), last run exited 0/SUCCESS (oneshot completes normally — but "success"
  here just means the poll loop exited cleanly after calling done, NOT that it pushed data)

$ ls -la /root/fetch-ohlcv-backfill.sh
-rwxr-xr-x 1 root root 14966 Jul  1 02:32 /root/fetch-ohlcv-backfill.sh   (exists, executable — Phase B state)
Birth: 2026-06-30 20:59:45 +0700 / Modify: 2026-07-01 02:32:28 +0700

$ ls -la /root/ohlcv-backfill-poll.sh
-rwx--x--x 1 root root 3262 Jun 11 00:23 /root/ohlcv-backfill-poll.sh   (correctly deployed via deploy-vinahost.sh)

$ grep -n "^MCP_BASE\|^API_KEY" /root/fetch-ohlcv-backfill.sh
MCP_BASE="${MCP_BASE:-__MCP_BASE__}"      <-- UNSUBSTITUTED PLACEHOLDER, live on VPS
API_KEY="${API_KEY:-__API_KEY__}"          <-- UNSUBSTITUTED PLACEHOLDER, live on VPS

$ grep -n "^MCP_BASE" /root/ohlcv-backfill-poll.sh
MCP_BASE="${MCP_BASE:-https://zenmidi.com}"   <-- correctly substituted (contrast)

$ host zenmidi.com   (live DNS test — proves zenmidi.com itself resolves fine)
zenmidi.com has address 104.21.83.223 / 172.67.182.97 (Cloudflare)
```

## Live Log Evidence (`/var/log/ohlcv-backfill-poll.log`, 2026-04-17 → 2026-07-08, 9.5 MB)

```
$ grep -c "pending=true" /var/log/ohlcv-backfill-poll.log          → 541
$ grep -c "not found or not executable" /var/log/ohlcv-backfill-poll.log  → 466  (Phase A — file didn't exist)
$ grep -c "OHLCV BACKFILL START" /var/log/ohlcv-backfill-poll.log  → 75   (Phase B — file exists but placeholders unsubstituted)
$ grep -o "backfill script exited with code [0-9]*" ... | sort | uniq -c
    466 code 1   (Phase A "not found" skip path)
     75 code 6   (Phase B curl "Couldn't resolve host __MCP_BASE__")
$ grep -c "inserted\|OK \[" /var/log/ohlcv-backfill-poll.log        → 0    (ZERO successful pushes, ever)
```

First "not found or not executable" warning: `2026-04-23T15:27:24Z` (earliest sampled; poller itself started `2026-04-17T16:20:04Z`).
First "OHLCV BACKFILL START" (Phase B begins): `2026-06-30T16:15:37Z`.

Live sample from tonight (2026-07-07T18:03Z, triggered by dev-mcp-server's queue row 559/561):
```
2026-07-07T18:03:16Z [OHLCV-POLL] INFO  pending=true — running /root/fetch-ohlcv-backfill.sh
2026-07-07T18:03:16Z === OHLCV BACKFILL START (days=730, range=2024-07-07..2026-07-07) ===
2026-07-07T18:03:17Z /api/ohlcv-codes not available (HTTP 000000), falling back to /api/watchlist
2026-07-07T18:03:17Z [OHLCV-POLL] INFO  backfill script exited with code 6
2026-07-07T18:03:18Z [OHLCV-POLL] INFO  POST https://zenmidi.com/api/ohlcv-backfill-done → HTTP 200
2026-07-07T18:03:18Z [OHLCV-POLL] === DONE === backfill acknowledged, exiting poll loop
```
(`HTTP 000000` = curl's `-w "%{http_code}"` write-out on a DNS-resolution failure against host `__MCP_BASE__`, doubled because the CODES_URL probe is guarded with `|| echo "000"` and immediately re-attempted against WATCHLIST_URL with the same broken host.)

---

## Anti-Bot Assessment

**Not applicable** — this is not an external anti-bot/geo-block issue. `zenmidi.com` (the MCP server, Cloudflare-fronted) resolves and is reachable from the VPS; the failure is a purely internal deploy-pipeline defect (unsubstituted template placeholder), confirmed by direct `grep` of the live file content.

---

## Root-Cause Reference (repo, read-only — confirmed via `git log`/`git show`, no edits made)

- `vps-scripts/fetch-ohlcv-backfill.sh` created by commit `367370f75` (2026-04-17, "one-time bash script") — never had an owning deploy step.
- `vps-scripts/ohlcv-backfill-poll.sh` + systemd `.service`/`.timer` added by commit `68263eb6b` (2026-04-17, task 1363/Sprint 124) — added deploy-vinahost.sh § 6, but section 6 only SCPs the poll script + unit files, never `fetch-ohlcv-backfill.sh`. Confirmed via `git show 68263eb6b -- scripts/deploy-vinahost.sh` (no `fetch-ohlcv-backfill.sh` reference) and current `scripts/deploy-vinahost.sh` lines ~210–240 (same gap, unchanged since).
- `vps-scripts/fetch-ohlcv-backfill.sh` was subsequently hardened in commits `33479360b` + `5939be5d5` (both 2026-06-30, OHLCV-DEPTH-SUBTASK-A / VNINDEX work) — these repo changes are the ones that produced the file currently `scp`'d to the VPS (mtime matches), but that manual copy bypassed the sed-substitution + GUARD-1 pipeline that `deploy-vinahost.sh` uses for every *other* fetch script.

## Recommended Fix (for the agent that owns it — see Handoff)

Add a properly-guarded deploy step for `fetch-ohlcv-backfill.sh` inside `scripts/deploy-vinahost.sh` § "6. OHLCV backfill poller", mirroring the pattern already used for `ohlcv-backfill-poll.sh` two lines above it in the same section:

```bash
TMP2=$(mktemp)
sed -e "s|__MCP_BASE__|${MCP_BASE}|g" \
    -e "s|__API_KEY__|${VPS_PUSH_API_KEY}|g" \
    vps-scripts/fetch-ohlcv-backfill.sh > "$TMP2"
if grep -q '__[A-Za-z][A-Za-z0-9_]*__' "$TMP2"; then
  echo "GUARD-1 FAIL: placeholder leak in fetch-ohlcv-backfill.sh — deploy aborted" >&2
  rm -f "$TMP2"
  exit 1
fi
$SCP "$TMP2" ${VH_USER}@${VH_IP}:/root/fetch-ohlcv-backfill.sh
rm "$TMP2"
```
...plus `chmod +x /root/fetch-ohlcv-backfill.sh` inside the existing `$SSH << 'BACKFILLEOF' ... BACKFILLEOF` heredoc (alongside the existing `chmod +x /root/ohlcv-backfill-poll.sh`).

This closes both phases at once: going forward every `deploy-vinahost.sh` run will keep `/root/fetch-ohlcv-backfill.sh` in sync with the repo AND guarantee its placeholders are substituted (GUARD-1 already proven reliable for the sibling scripts — zero placeholder-leak incidents on any of the other 8 services).

**Immediate unblock (separate from the durable fix):** the live `/root/fetch-ohlcv-backfill.sh` on the VPS needs one manual re-deploy (proper `sed` substitution, not raw copy) to start pushing real data on the very next 30-min timer tick — this does not need to wait for the `deploy-vinahost.sh` patch to land, but should ideally go through the same guarded path to avoid repeating the exact mistake that caused Phase B.

---

## Notes / Boundary

Per `docs/agents/ops-vps-fetch/init.md` (`not_my_job`: "Fixing Docker services or local infra — that is ops's job"; `boundary_rules.scope`: "SSH probe → capture findings → write recon doc → signal → exit"; `constraints.no_code_writing: true`), this agent performed **read-only** SSH recon and root-cause analysis only. No file was edited, no service was restarted, and no queue row was manually manipulated, on the VPS or in this repo, during this investigation. The fix (VPS-side re-deploy + repo-side `scripts/deploy-vinahost.sh` patch) is handed off to `ops` (dispatch table: "service down / latency / pipeline failure (react, fix) → ops"; Ops-Infra-Lane hands code changes to `developer`).

## Sample Response Excerpt

```
/root/fetch-ohlcv-backfill.sh:66:MCP_BASE="${MCP_BASE:-__MCP_BASE__}"
/root/fetch-ohlcv-backfill.sh:67:API_KEY="${API_KEY:-__API_KEY__}"
```
