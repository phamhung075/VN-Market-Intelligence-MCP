# Server Restart Policy

**Load when:** deploy, restart, hot reload, scheduler changes, code deploy, post-merge verification.

## Only Allowed Restart Command

```bash
launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp
```

No exceptions.

## Banned Mechanisms

`./start.sh` | `bun --hot` | `bun --watch` | `nodemon` | `pm2` | `forever` | `node --watch` | any hot/live/fast reload — ALL FORBIDDEN.

`./start.sh` is deprecated — still exists but must not run against a launchd-supervised instance (would spawn a second process fighting the supervised one).

## Why launchctl Only

1. Deterministic state — clean process, no half-loaded modules, no stale closures
2. Clean SQLite state — circuit breaker registry + WAL checkpoint initialized at startup; hot reload skips this
3. Clean circuit-breaker reset — tripped state not preserved across code changes
4. launchd supervision — `KeepAlive` + `RunAtLoad` auto-respawns within ~2-3s after kickstart

## How to Apply a Code Change

1. Edit code
2. `bun tsc --noEmit` — must pass
3. `bun test` (affected file) — must pass
4. Commit + push to main
5. `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp`
6. `curl -s http://127.0.0.1:3000/health` — must return `{"status":"ok",...}`

## QA Validation After Sprint Merge

1. `launchctl list | grep com.vn-market.mcp` — non-zero PID = running
2. `curl -s http://127.0.0.1:3000/health` — returns `{"status":"ok","toolCount":N}`
3. `tail -20 /tmp/vn-market-mcp.log` — no crash loop, no startup errors

If `toolCount` drops or health errors → diagnose from logs before marking sprint done.

## If launchctl Fails

1. Check loaded: `launchctl list | grep com.vn-market.mcp`
2. Not loaded → `launchctl load -w ~/Library/LaunchAgents/com.vn-market.mcp.plist` then retry
3. Plist missing → `./launchd/install.sh` (one-time, requires Full Disk Access for `/bin/bash` + `~/.bun/bin/bun`)
4. Check logs: `tail -50 /tmp/vn-market-mcp.log`
5. Do NOT fall back to `./start.sh` or `bun --hot` — fix launchd instead
6. If blocked → report to WORK channel, await operator. Do not leave server under forbidden mechanism.

## Reference

| Item | Value |
|------|-------|
| launchd label | `com.vn-market.mcp` |
| plist path | `~/Library/LaunchAgents/com.vn-market.mcp.plist` |
| Log file | `/tmp/vn-market-mcp.log` |
| Installer | `./launchd/install.sh` |
