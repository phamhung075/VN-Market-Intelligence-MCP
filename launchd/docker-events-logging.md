# Docker Events Persistent Logging — Operator Runbook

## Purpose

Persist Docker daemon events to durable, host-side log files with at least 30 days of retention, enabling forensic analysis of container restarts and anomalies without relying on Docker's in-memory events buffer (which has no configurable retention floor and typically expires events in under 13 hours under production load).

This runbook follows Task 1896c and the architecture brief: `docs/architecture-briefs/2026-05-12-persistent-docker-events-logging.md`.

---

## Installation

### Prerequisites

- macOS host (tested on Darwin 23.3.0)
- Docker Desktop installed
- `docker` CLI at `/usr/local/bin/docker` (confirm via `which docker`)
- User account: `admin` with sudo capability

### Step 1: Create log destination directory

```bash
mkdir -p /usr/local/var/log
```

If `/usr/local/var/` does not exist (rare), this creates the entire path. The logs will be written by the launch agent running under the `admin` user.

### Step 2: Pre-create log files

Pre-creating the files allows newsyslog to identify them immediately upon installation:

```bash
touch /usr/local/var/log/docker-events.log
touch /usr/local/var/log/docker-events-error.log
```

launchd will create them on first write if absent, but pre-creating is safer and allows newsyslog to see them.

### Step 3: Install the launchd plist

Copy the plist from the project repo to the user's LaunchAgents directory:

```bash
cp launchd/com.vn-market.docker-events.plist ~/Library/LaunchAgents/
```

The plist will be loaded by macOS on next login or by manual bootstrap (step 5).

### Step 4: Install newsyslog configuration

Copy the rotation config to the system newsyslog config directory (requires `sudo`):

```bash
sudo cp launchd/docker-events-newsyslog.conf /etc/newsyslog.d/docker-events.conf
```

This tells macOS's native `newsyslog(8)` daemon to:
- Rotate both log files daily at midnight or at 50 MB (whichever comes first)
- Keep 30 compressed archives (at least 30 days of history)
- Compress with bzip2

### Step 5: Load the launchd agent

```bash
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.vn-market.docker-events.plist
```

Replace `$UID` with your numeric user ID (run `id -u` if unsure; typically `501` on macOS). On macOS 10.12+, use `bootstrap` (not the deprecated `load`).

Alternatively, simply log out and log back in; launchd will load the agent at login.

### Step 6: Verify immediately

Wait 5 seconds for the agent to start and connect to Docker:

```bash
launchctl list com.vn-market.docker-events
```

Expected output:
```
{
  "Label" = "com.vn-market.docker-events";
  "PID" = <a number, e.g., 1234>;
  "LastExitStatus" = 0;
}
```

If `PID` is missing or shows a dash (`-`), Docker Desktop may not be running; Docker Desktop will start the agent automatically once the daemon is ready.

Confirm the log file is receiving events:

```bash
tail -f /usr/local/var/log/docker-events.log
```

Expected: JSON lines (one per Docker event) appearing roughly every 30 seconds as healthchecks tick. Sample event:

```json
{"Type":"container","Action":"health_status: healthy","Actor":{"ID":"abc123...","Attributes":{"name":"mcp-server"}},"time":"2026-05-12T10:15:30.123456789Z","timeNano":1715500530123456789}
```

Press Ctrl+C to exit tail.

---

## Verification Checklist

### Short verification (5 minutes)

- [ ] Log directory exists and is writable: `ls -ld /usr/local/var/log`
- [ ] Plist is installed: `ls -la ~/Library/LaunchAgents/com.vn-market.docker-events.plist`
- [ ] Agent has a PID: `launchctl list com.vn-market.docker-events | grep PID`
- [ ] Log file exists and contains JSON: `head -1 /usr/local/var/log/docker-events.log | python3 -m json.tool`
- [ ] newsyslog config is installed: `sudo ls -la /etc/newsyslog.d/docker-events.conf`

### Artificial restart test (10 minutes)

Trigger a low-risk service restart and confirm the event appears in the log:

```bash
# 1. Restart a stateless service (api-gateway is a good candidate)
docker-compose restart api-gateway

# 2. Wait 2 seconds
sleep 2

# 3. Query the log for restart events
grep "api-gateway" /usr/local/var/log/docker-events.log | tail -5
```

Expected output: 3–5 JSON lines with events like `kill`, `die`, `start` occurring within a 5-second window.

Parse for readability:

```bash
grep "api-gateway" /usr/local/var/log/docker-events.log | python3 -c "
import sys, json
for line in sys.stdin:
    try:
        e = json.loads(line)
        print(f'{e.get(\"time\")} {e.get(\"Action\")} {e.get(\"Actor\",{}).get(\"Attributes\",{}).get(\"name\")}')
    except: pass
" | tail -10
```

Expected:
```
2026-05-12T10:45:30... kill api-gateway
2026-05-12T10:45:31... die api-gateway
2026-05-12T10:45:32... start api-gateway
```

### Forensic query (for use during incidents)

Once the log is populated, you can query it for events in any time window:

```bash
# Query for all container events in a 1-hour window (replace timestamps as needed)
grep "2026-05-12T02" /usr/local/var/log/docker-events.log \
  | python3 -c "
import sys, json
for line in sys.stdin:
    try:
        e = json.loads(line)
        if e.get('Type') == 'container':
            print(f'{e.get(\"time\")} {e.get(\"Action\")} {e.get(\"Actor\",{}).get(\"Attributes\",{}).get(\"name\")}')
    except: pass
"
```

For compressed archives (events >1 day old):

```bash
# List available archives
ls -la /usr/local/var/log/docker-events.log*.bz2

# Query a specific archive
bzcat /usr/local/var/log/docker-events.log.0.bz2 | grep "TIMESTAMP" | python3 -c "..."
```

---

## Log Rotation Verification

### Manual test rotation (dry-run)

Verify newsyslog can parse the config without making changes:

```bash
sudo newsyslog -nv -f /etc/newsyslog.d/docker-events.conf
```

Expected output mentions `docker-events.log` and `docker-events-error.log`, showing the parsed size and rotation rules.

### Force a test rotation

To test the full rotation pipeline (compression, archiving):

```bash
sudo newsyslog -F -f /etc/newsyslog.d/docker-events.conf
```

Then verify:

```bash
ls -lh /usr/local/var/log/docker-events.log*
```

Expected:
- `docker-events.log` (fresh, small size, like 10 KB)
- `docker-events.log.0.bz2` (compressed archive of the previous log)

### Scheduled rotation

`newsyslog` runs hourly on macOS via the system's periodic task scheduler. You can force an immediate run:

```bash
sudo /usr/sbin/newsyslog
```

This rotates all logs in `/etc/newsyslog.conf` and `/etc/newsyslog.d/` that are due. Check system logs for any errors:

```bash
log show --predicate 'process == "newsyslog"' --last 1h
```

---

## Retention and Disk Space

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Events log max size | 50 MB | Triggers rotation to prevent event storms from filling disk |
| Error log max size | 5 MB | Error output is rare; tight cap prevents accumulation |
| Archives kept | 30 | At typical idle rate (~50 KB/day), gives 30+ days of history |
| Compression | bzip2 | Reduces 50 MB to ~5 MB on average (90% compression for JSON) |
| Disk budget | 30 × 50 MB = 1.5 GB worst-case | Current available: 12 GB; realistic: ~1.5 MB for 30 days at idle rate |

---

## Troubleshooting

### Agent not loading or has PID="-"

Docker Desktop may not be running. The agent retries every 15 seconds (ThrottleInterval=15). Start Docker Desktop; the agent will connect automatically.

```bash
# Confirm Docker Desktop is running
docker ps
```

If Docker Desktop is running but the agent still shows no PID, check the error log:

```bash
tail -20 /usr/local/var/log/docker-events-error.log
```

Common errors:
- `command not found` → Docker path is wrong; check `which docker`
- `permission denied` → Log directory or file permissions; verify with `ls -ld /usr/local/var/log`
- `Cannot connect to Docker daemon` → Docker socket not accessible; ensure Docker Desktop is fully started

### Log file not growing

Check that events are being generated:

```bash
# On one terminal, watch for new events
tail -f /usr/local/var/log/docker-events.log

# On another, trigger an event
docker-compose restart any-service
```

If no events appear:
1. Confirm the agent has a PID: `launchctl list com.vn-market.docker-events`
2. Confirm Docker is running: `docker ps`
3. Confirm Docker has active containers: `docker ps -a`

If the log file exists but has not been updated in >5 minutes:
- The agent may have crashed; check `launchctl list` for exit code
- Docker daemon may be paused; this is expected behavior (unattended machine)

### newsyslog config parse error

Syntax error in the newsyslog config will be logged by the system. Test the config:

```bash
sudo newsyslog -nv -f /etc/newsyslog.d/docker-events.conf
```

If you see errors like `unknown flag` or `syntax error`, check the format in the `.conf` file. Reference: `man newsyslog.conf`.

### Rotation not happening

newsyslog runs hourly. Force a check:

```bash
sudo /usr/sbin/newsyslog
```

Verify it ran:

```bash
log show --predicate 'process == "newsyslog"' --last 1h | grep docker-events
```

If newsyslog doesn't mention the file, the config may not be parsed. Re-verify with:

```bash
sudo newsyslog -nv -f /etc/newsyslog.d/docker-events.conf
```

---

## Uninstallation

If you need to remove the logging system (not recommended unless rotating to Option 3 or decommissioning):

```bash
# 1. Unload the agent
launchctl bootout gui/$UID ~/Library/LaunchAgents/com.vn-market.docker-events.plist

# 2. Remove the plist
rm ~/Library/LaunchAgents/com.vn-market.docker-events.plist

# 3. Remove the newsyslog config (requires sudo)
sudo rm /etc/newsyslog.d/docker-events.conf

# 4. Optionally, preserve the log files for archival
# Log files remain at /usr/local/var/log/docker-events*.log*
```

The log files themselves are left in place for forensic access if needed.

---

## References

- **Architecture Brief:** `docs/architecture-briefs/2026-05-12-persistent-docker-events-logging.md`
- **Task:** `1896c-impl` (Sprint 1896)
- **Related Incident:** `1896b` (`ops-c40-restart-evidence` — inconclusive-events-expired)
- **Precedent:** `~/Library/LaunchAgents/homebrew.mxcl.cloudflared.plist` (same launchd pattern)

---

**Last updated:** 2026-05-12  
**Owner:** ops (per architect recommendation)

