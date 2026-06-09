# Troubleshooting: Headroom Proxy Wedge → Claude Code "Disconnects"

**Date:** 2026-06-08
**Component:** `headroom-proxy` (Docker, image `headroom-proxy:local`, Headroom v0.23.0)
**Severity:** CRITICAL (freezes Claude Code itself — host-level, not an agent-level failure)
**Root Cause:** `anthropic_pre_upstream` concurrency pool deadlock (leaked permits from stalled streams)
**Status:** Mitigated by launchd watchdog (auto-restart, max 2 consecutive)

---

## Executive Summary

Headroom is an OSS context-compression proxy that **optionally** sits between Claude
Code and `api.anthropic.com`, wired in via `ANTHROPIC_BASE_URL=http://127.0.0.1:8787`
in `~/.claude/settings.json`. Its 6-slot `anthropic_pre_upstream` concurrency pool can
deadlock. When it does, **every `POST /v1/messages` hangs 40s+/0 bytes** and Claude
Code times out — looks like Claude "disconnected".

**The trap:** the health endpoints `/livez /readyz /health` **bypass the pool and keep
reporting "healthy"** while real traffic is dead. Never trust them. This is the same
"healthy-but-wedged" pattern as the `mcp-server write-wedge` incident.

---

## How to Recognize It

| Symptom | Detail |
|---|---|
| Claude Code stalls / "disconnects" | every request hangs, no error, no stream |
| `curl http://127.0.0.1:8787/health` says OK | **misleading** — health route bypasses the dead pool |
| `POST /v1/messages` hangs 40s+ / 0 bytes | the real signal |
| Container looks UP in `docker ps` | uptime keeps climbing, process alive |
| Last successful request timestamp then silence | logs show N successful requests, then everything hangs |

### Confirmed NOT the cause (already ruled out)
Network/DNS, tiktoken load, upstream outage. From **inside** the container Anthropic
is reachable (`401 in 0.22s`); tiktoken loads in 0.89s; no error logs; thousands of
prior requests succeeded then abruptly hung. The fault is purely the internal pool.

---

## Detection (the only reliable probe)

Probe the **real** inference path, not the health route. Any HTTP code back within the
timeout = ALIVE (even `401` from a fake key — it proves the pool round-trips). Timeout
or `000`/empty = WEDGED.

```bash
curl -sS -m 12 -o /dev/null -w '%{http_code}' \
  -X POST http://127.0.0.1:8787/v1/messages \
  -H 'content-type: application/json' \
  -H 'anthropic-version: 2023-06-01' \
  -H 'x-api-key: watchdog-probe' \
  -d '{"model":"claude-haiku-4-5-20251001","max_tokens":1,"messages":[{"role":"user","content":"ping"}]}'
```
- Healthy proxy answers in **<1s**. Wedged hangs **40s+**. The 12s timeout is the discriminator.
- `200/400/401/...` → HEALTHY (any code = pool not deadlocked).
- curl exits non-zero / `000` / empty → WEDGED.

---

## Fix (contournable / workaround)

`docker restart headroom-proxy` clears the deadlock. **The proxy needs ~30–50s to be
ready again** — do not re-probe once and declare failure; poll.

### Manual one-shot
```bash
/usr/local/bin/docker restart headroom-proxy
sleep 40
# then re-run the probe above; expect a fast HTTP code (e.g. 401 in <1s)
```

### Automated (already installed) — run the watchdog directly
```bash
/bin/bash ~/.claude/scripts/headroom-watchdog.sh
tail -n 20 ~/.claude/logs/headroom-watchdog.log
```

### Nuclear option — disconnect the proxy entirely
If the wedge recurs and you just need Claude working **now**, remove the proxy from the
path. Claude talks direct to Anthropic; you only lose Headroom's token compression.
```bash
# remove this line from ~/.claude/settings.json "env" block, then restart Claude:
#   "ANTHROPIC_BASE_URL": "http://127.0.0.1:8787",
```
As of 2026-06-08 `ANTHROPIC_BASE_URL` is **already removed** — Claude runs direct. Re-add
it only when you want compression back (the watchdog makes that safe).

---

## Permanent Mitigation (shipped 2026-06-08)

A **launchd** watchdog probes the real path every 180s and auto-restarts on wedge.

| Piece | Path | Role |
|---|---|---|
| Watchdog script | `~/.claude/scripts/headroom-watchdog.sh` | probe real `/v1/messages`; restart on hang; circuit breaker |
| launchd agent | `~/Library/LaunchAgents/com.user.headroom-watchdog.plist` | StartInterval 180s, RunAtLoad, survives reboot |
| Log (state-change only) | `~/.claude/logs/headroom-watchdog.log` | |
| Restart counter | `~/.claude/state/headroom-watchdog.count` | resets to 0 on any healthy probe |

**Why launchd, not CronCreate, not Claude:** when Headroom wedges with
`ANTHROPIC_BASE_URL` set, Claude itself freezes — it cannot run its own rescue
(chicken-and-egg). CronCreate jobs die with the Claude session. The watchdog must be
OS-driven and independent. The script is pure bash (`curl` + `docker`) — it never routes
through Claude or the proxy to do its job, so it works precisely when both are down.

**Circuit breaker:** at most `MAX_RESTARTS=2` consecutive restarts with no healthy probe
in between; then it stops (no crash-loop), leaves the proxy down, and fires a macOS
notification for manual intervention. The counter resets on any healthy probe, so normal
transient wedges self-heal indefinitely.

### Manage the watchdog
```bash
# status
launchctl print gui/$(id -u)/com.user.headroom-watchdog | grep -E 'state|last exit'
# load / reload
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.user.headroom-watchdog.plist
# stop / remove
launchctl bootout  gui/$(id -u)/com.user.headroom-watchdog
```

---

## Cross-references
- Memory: `project_headroom_proxy_watchdog.md` (auto-memory, project type)
- Pattern sibling: `project_mcp_server_write_wedge.md` ("healthy-but-wedged")
- Host constraint: `project_host_memory_panic.md` (16GB Mac, Docker capped 8GB)
