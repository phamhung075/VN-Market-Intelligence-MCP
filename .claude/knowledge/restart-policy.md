# Server Restart Policy

**When to read this file:** Any task involving deploy, restart, hot reload, scheduler changes, code deploys, or post-merge verification.

---

## The Only Allowed Restart Command

```bash
launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp
```

This is the single, non-negotiable way to restart the production server. There are no exceptions.

---

## Banned Mechanisms — ALL Forbidden

The following are permanently banned in this project:

| Mechanism | Status |
|-----------|--------|
| `./start.sh` | FORBIDDEN |
| `bun --hot` | FORBIDDEN |
| `bun --watch` | FORBIDDEN |
| `nodemon` | FORBIDDEN |
| `pm2` | FORBIDDEN |
| `forever` | FORBIDDEN |
| `node --watch` | FORBIDDEN |
| Any other hot/live/fast reload tool | FORBIDDEN |

`./start.sh` is DEPRECATED. The file still exists but must not be executed against a launchd-supervised instance — it would spawn a second process fighting the supervised one.

---

## Rationale

1. **Deterministic state** — a full launchctl kickstart gives the server a clean process with no half-loaded modules, stale closures, or partially applied hot patches.
2. **Clean SQLite state** — the circuit breaker registry and SQLite WAL checkpoint are initialized at process startup. Hot reload skips this initialization path and can leave DB handles in inconsistent state.
3. **Clean circuit-breaker reset** — circuit breakers initialize at boot. Hot reload can preserve tripped state across code changes, masking fixes.
4. **launchd supervision** — the server runs under `launchd/com.vn-market.mcp.plist` with `KeepAlive` + `RunAtLoad`. The supervised process auto-respawns within ~2-3s after kickstart. No manual `./start.sh` needed.

---

## How to Apply a Code Change

1. Edit the code.
2. Run `bun tsc --noEmit` — must pass.
3. Run `bun test` (affected test file) — must pass.
4. Commit and push to main.
5. Restart: `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp`
6. Verify: `curl -s http://127.0.0.1:3000/health` — must return `{"status":"ok",...}`.

---

## How QA Validates Restart

After every sprint merge, QA must confirm:

1. `launchctl list | grep com.vn-market.mcp` — shows the PID (non-zero means running).
2. `curl -s http://127.0.0.1:3000/health` — returns `{"status":"ok","toolCount":N}`.
3. `tail -20 /tmp/vn-market-mcp.log` — no crash loop, no startup errors.

If `toolCount` drops or health returns an error, diagnose from logs before declaring the sprint done.

---

## What to Do If launchctl Fails

If `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp` returns an error:

1. Check if the plist is loaded: `launchctl list | grep com.vn-market.mcp`
2. If NOT loaded: `launchctl load -w ~/Library/LaunchAgents/com.vn-market.mcp.plist` then retry kickstart.
3. If plist is missing: run `./launchd/install.sh` (one-time installer, requires Full Disk Access for `/bin/bash` and `~/.bun/bin/bun`).
4. Check logs: `tail -50 /tmp/vn-market-mcp.log` for crash reason.
5. Do NOT fall back to `./start.sh` or `bun --hot`. Fix the launchd setup instead.
6. If blocked on launchd setup: report to WORK channel and await operator intervention. Do not leave the server running under a forbidden mechanism.

---

## Installer Reference

```bash
./launchd/install.sh   # one-time, requires Full Disk Access grant in macOS System Settings
```

launchd label: `com.vn-market.mcp`
plist path: `~/Library/LaunchAgents/com.vn-market.mcp.plist`
Log file: `/tmp/vn-market-mcp.log`
