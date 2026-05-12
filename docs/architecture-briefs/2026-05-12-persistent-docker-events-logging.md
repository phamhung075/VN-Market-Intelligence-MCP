# Architecture Brief — Persistent Docker Events Logging (Task 1896c)

**Authored:** 2026-05-12T16:30:00Z
**Author:** Architect
**Status:** Final
**Task:** 1896c
**Sprint:** 1896
**Size:** SPRINT-S

---

## 1. Problem Statement

Sprint 1896b (`ops-c40-restart-evidence`) was closed `inconclusive-events-expired`. The forensic
window for the c40 02:40 UTC container restart had purged by the time the ops agent attempted
evidence collection at 15:30 UTC — a ~13-hour gap. Docker's events daemon retains events **in
memory only**, with no configurable persistence floor; the working retention window on this host
(Docker Desktop 28.1.1, macOS Darwin 23.3.0) proved shorter than 13 hours under production load.

Concrete impact chain:
1. **c40 02:40 UTC** — mcp-server restarts; no ops activity logged; Docker events buffer begins
   absorbing the event.
2. **c41 14:35 UTC** — ops deliberately restarts mcp-server for 1879b deployment; a second event
   enters the buffer.
3. **14:47 UTC** — TNB c41 audit flags uptime=12m; creates 1896a escalation.
4. **15:30 UTC** — ops agent executes E1 (`docker events --since 2026-05-12T02:00:00Z --until
   2026-05-12T03:00:00Z`): **NO OUTPUT**. Events from the 02:00–03:00 UTC window are gone.
5. **Verdict forced to `inconclusive-events-expired`.** Exit code, OOM flag, stack trace —
   all unreachable. Any future restart investigation faces the same wall unless events are
   durably logged.

Sprint 1336 (named-volume isolation) confirmed globally intact — all 8 stateful services on
`market_data` named volume, zero bind-mount regressions. The problem is NOT SQLite corruption
recurrence; it is **absence of observable evidence when the next unplanned restart occurs**.

---

## 2. Goal and Non-Goals

### Goal

Persist `docker events` output to a durable, host-side log file with at least 30 days of
retention so that any future container restart event is recoverable for RCA within that window.
Ingestion failure (i.e., the events listener itself dies) must be observable without manual
polling.

### Non-Goals

- **No domain code change** — pure host-side infra config.
- **No Docker container rebuild** — host-only installation.
- **No centralised log stack** — no Elasticsearch, no Loki, no cloud sink. Single-user local
  system; keeping the dependency footprint minimal is an explicit product constraint.
- **No real-time alerting on Docker events** — that belongs to a future sprint if warranted.
  This sprint only achieves durability and queryability.
- **No VPS changes** — this is a macOS host-side concern only.

---

## 3. Option Matrix

| # | Option | Persistence | Survives reboot | Ingestion-failure observable | Blast radius | LOC delta |
|---|--------|------------|-----------------|------------------------------|--------------|-----------|
| 1 | Ad-hoc background process (`docker events ... &` in a launch script) | Append-only file | No — loses the `&` on shell exit or reboot | No — process dies silently | None | 1 |
| 2 | Docker logging driver (`json-file` with `max-size`/`max-file`) | Per-container app logs | Yes (Docker restart) | N/A — wrong data | None | 0 |
| 3 | External log shipper container (Filebeat/Vector/Fluentd tailing socket) | Queryable index | Yes | Yes (shipper health) | New container dependency | ~50+ |
| 4 | **macOS launchd plist + newsyslog rotation** | Append-only file, 30+ day retention | **Yes — launchd restarts on boot** | **Yes — KeepAlive=true; crash is observable via `launchctl list`** | None | ~30 |

**Recommended: Option 4.** Rationale in §4.

### Why Option 1 is eliminated

An ad-hoc `&` background process tied to a shell invocation has no crash recovery, no boot
persistence, and no observability. The exact failure mode it produces is "it stops and nobody
knows." That is worse than the current state — we would believe events are being captured when
they are not.

### Why Option 2 is eliminated

`json-file` logging driver captures application stdout/stderr per container. It does NOT
capture daemon-level Docker events (container start, die, oom, health_status transitions). It
could not have recovered the c40 02:40 UTC restart cause — there would be no `die` or `start`
event in the application log. Option 2 solves the wrong problem and is explicitly excluded from
contention.

### Why Option 3 is deferred

A log shipper container (Filebeat, Vector, Fluentd) is the correct production-grade answer for
a multi-service environment. However: (a) it adds a new Docker image dependency that itself
must be monitored; (b) it introduces configuration complexity (socket binding, index management)
disproportionate to a SPRINT-S task; (c) the primary constraint is "keep it boring." Option 3
is the upgrade path if the team grows to need indexed querying across multiple hosts. For a
single-user macOS workstation, the file-based approach of Option 4 is sufficient, auditable,
and matches the existing toolchain precedent.

---

## 4. Recommended Solution — Option 4: launchd plist + newsyslog

### Rationale

The project already operates two launchd agents:
- `homebrew.mxcl.cloudflared.plist` — manages the Cloudflare tunnel process with
  `KeepAlive.SuccessfulExit = false`, logging to `/usr/local/var/log/cloudflared.log`.
- `com.vn-market.mcp.plist` — manages the legacy MCP bootstrap script with
  `KeepAlive.SuccessfulExit = false` + `KeepAlive.Crashed = true`, logging to
  `/tmp/vn-market-mcp.log`.

Option 4 is the same pattern applied to `docker events`. It is consistent with existing
operational precedent, requires no new software installation, is operator-operable, and maps
directly to the agent-father config bundle model (a single plist + one newsyslog conf file).

**Crash recovery** is provided by `KeepAlive.Crashed = true`. If `docker events` crashes or
exits non-zero, launchd respawns it automatically (after `ThrottleInterval` backoff to prevent
flapping). The process is inspectable via `launchctl list | grep docker-events`.

**Ingestion-failure observability** is provided by two mechanisms:
1. `launchctl list com.vn-market.docker-events` shows last-exit-code. Non-zero = crash.
2. Log file staleness: the file mtime advances continuously while Docker is running. A simple
   spot-check (`ls -la /usr/local/var/log/docker-events.log`) reveals if logging has stalled.
   A future sprint may add a cron-based staleness alert (out of scope here).

**30-day retention** is achieved via `newsyslog` — macOS's native log rotation daemon, already
present at `/usr/sbin/newsyslog`. A custom configuration file in `/etc/newsyslog.d/` instructs
it to rotate at 50 MB or daily, keeping 30 compressed archives. This is the same mechanism
macOS uses for its own system logs.

---

## 5. Implementation Roadmap

### Files to Create

#### 5.1 launchd plist

**Path:** `~/Library/LaunchAgents/com.vn-market.docker-events.plist`

Installs as a user-level launch agent (same tier as cloudflared and com.vn-market.mcp).
Runs under the logged-in user account — required because `docker` CLI on macOS Desktop
authenticates via the user-mode socket at `$HOME/.docker/run/docker.sock`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.vn-market.docker-events</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/docker</string>
    <string>events</string>
    <string>--format</string>
    <string>{{json .}}</string>
  </array>

  <!-- Boot persistence -->
  <key>RunAtLoad</key>
  <true/>

  <!-- Crash recovery: restart on non-zero exit (Docker daemon down = exit 1) -->
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
    <key>Crashed</key>
    <true/>
  </dict>

  <!-- Back off after repeated crashes (e.g. Docker Desktop not yet started) -->
  <key>ThrottleInterval</key>
  <integer>15</integer>

  <!-- Log destination — newsyslog rotates this file -->
  <key>StandardOutPath</key>
  <string>/usr/local/var/log/docker-events.log</string>
  <key>StandardErrorPath</key>
  <string>/usr/local/var/log/docker-events-error.log</string>

  <!-- Inherit user PATH so /usr/local/bin/docker resolves correctly -->
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>/Users/admin</string>
  </dict>
</dict>
</plist>
```

Notes:
- `docker` path: `/usr/local/bin/docker` (confirmed via `which docker` on this host).
- `HOME` env var is required so Docker CLI can locate `~/.docker/run/docker.sock` on
  macOS Desktop.
- `ThrottleInterval` 15s prevents launchd flapping if Docker Desktop is not yet started
  at login time — it retries every 15s until the Docker daemon is ready.
- No `WorkingDirectory` key needed — `docker events` does not use cwd.

#### 5.2 newsyslog rotation config

**Path:** `/etc/newsyslog.d/docker-events.conf`

Requires `sudo` to install (system-level conf). This is the only step requiring elevated
privileges; ops can perform it without agent-father involvement.

```
# /etc/newsyslog.d/docker-events.conf
# Format: logfile_name [owner:group] mode count size when [flags [/pidfile [signal]]]
#
# count=30   → keep 30 rotated archives (30 days at daily rotation)
# size=51200 → rotate at 50 MB (50 * 1024 KB) regardless of age
# when=@T00  → also rotate daily at midnight
# flags=JG   → J=bzip2 compress, G=gzip fallback (macOS newsyslog uses gz flag)
# No pidfile/signal needed — docker events writes to stdout, captured by launchd
#
/usr/local/var/log/docker-events.log        admin:admin   644  30  51200  @T00  J
/usr/local/var/log/docker-events-error.log  admin:admin   644  30   5120  @T00  J
```

Retention math:
- Daily rotation: 30 archives = 30 days.
- Size cap: 50 MB triggers rotation even if less than 1 day old (prevents disk fill on
  event storms). At typical Docker Desktop idle rate (~5–20 events/minute for health checks),
  50 MB absorbs ~6–12 months of normal events before the size cap fires.
- Error log cap: 5 MB — error output is rare; tight cap prevents accumulation.

newsyslog runs hourly via the system cron (`/etc/periodic/daily/` + `launchd`). No additional
scheduler needed.

#### 5.3 Project-side documentation file (source-controlled)

**Path:** `launchd/docker-events-logging.md`

A short README explaining:
- What the plist does and where it installs
- How to install (`launchctl load`, `sudo cp`)
- How to verify (§6 commands)
- Retention policy
- How to uninstall

This file lives in `launchd/` alongside any future host-config documentation. It is the
operator runbook for this feature. It is NOT a generated report — it is the source-of-truth
for the ops agent and agent-father.

**Note:** The plist itself (`com.vn-market.docker-events.plist`) should also be checked into
`launchd/` so it is version-controlled and can be re-deployed by agent-father on a fresh host.
The install step copies it to `~/Library/LaunchAgents/`.

### Install Sequence (one-time, ops or agent-father)

```bash
# 1. Create log directory if absent
mkdir -p /usr/local/var/log

# 2. Create empty log files (newsyslog -C requires them to exist with C flag,
#    but launchd will create them on first write; pre-creating is safer)
touch /usr/local/var/log/docker-events.log
touch /usr/local/var/log/docker-events-error.log

# 3. Install plist (from project repo)
cp launchd/com.vn-market.docker-events.plist ~/Library/LaunchAgents/

# 4. Install newsyslog config (requires sudo)
sudo cp launchd/docker-events-newsyslog.conf /etc/newsyslog.d/docker-events.conf

# 5. Load the agent (no reboot required)
launchctl load ~/Library/LaunchAgents/com.vn-market.docker-events.plist

# 6. Verify immediately (see §6)
```

### Retention Policy

| File | Rotation trigger | Archives kept | Approx retention at idle rate |
|------|-----------------|---------------|-------------------------------|
| `docker-events.log` | Daily midnight OR 50 MB | 30 | 30 days minimum |
| `docker-events-error.log` | Daily midnight OR 5 MB | 30 | 30 days |

Compressed archives land beside the log file as `docker-events.log.0.bz2`, `.1.bz2`, etc.
Total disk budget at 50 MB/archive max = 1.5 GB worst-case. At typical idle rate (~50 KB/day),
the realistic 30-day budget is ~1.5 MB — negligible on the 12 GB free system volume.

### Recovery Posture if `docker events` Crashes

`KeepAlive.Crashed = true` in the plist means launchd automatically respawns after
`ThrottleInterval` (15s). Failure scenarios:

| Scenario | launchd behaviour | Observable |
|----------|------------------|-----------|
| `docker events` exits 1 (Docker daemon down) | Respawn after 15s; cycle until Docker up | `launchctl list com.vn-market.docker-events` shows PID="-" + exit code |
| Docker Desktop not started yet at boot | Respawn every 15s; succeeds when daemon ready | Same — PID appears once connected |
| Process killed (SIGKILL) | Respawn after 15s | Same |
| Log file deleted | Next write recreates it; no crash | File reappears |
| newsyslog rotates while writing | launchd stdout fd redirected to new file post-rotation if `J` + no-signal mode; gap < 1s | Acceptable — no critical evidence loss |

The only unrecoverable failure mode is if Docker Desktop exits and does not return for >15s
intervals. In that case the gap in the log is itself evidence (no events = Docker down).

---

## 6. Verification

### Immediate post-install check

```bash
# 1. Confirm agent is loaded and has a PID
launchctl list com.vn-market.docker-events
# Expected: PID column is a number (not "-"), LastExitStatus=0

# 2. Confirm log file is receiving events
tail -f /usr/local/var/log/docker-events.log
# Expected: one JSON line per Docker healthcheck event (~every 30s from healthy services)

# 3. Confirm JSON format is parseable
tail -1 /usr/local/var/log/docker-events.log | python3 -m json.tool
# Expected: valid JSON with fields: Type, Action, Actor, time, timeNano
```

### Artificial restart test (recommended after install)

Trigger a deliberate, non-critical service restart and confirm the event lands in the log:

```bash
# 1. Restart a low-risk service (api-gateway is stateless)
docker-compose restart api-gateway

# 2. Query log for the restart events
grep "api-gateway" /usr/local/var/log/docker-events.log | grep -E '"Action":"(die|start|kill)"'
# Expected: at least 3 lines: kill → die → start, with timestamps within ~5s of command
```

This reproduces the exact forensic query that would have resolved the c40 02:40 UTC
investigation. If this returns results, the system is working.

### Sample c40-equivalent forensic query

For any future incident, ops runs:

```bash
# Replace timestamps with the incident window (UTC)
grep "2026-05-12T02" /usr/local/var/log/docker-events.log \
  | python3 -c "
import sys, json
for line in sys.stdin:
    try:
        e = json.loads(line)
        if e.get('Type') == 'container':
            print(e.get('time'), e.get('Actor',{}).get('Attributes',{}).get('name'), e.get('Action'))
    except: pass
"
# Expected: one line per container event in that hour window
```

For compressed archives (events >1 day old):

```bash
bzcat /usr/local/var/log/docker-events.log.N.bz2 \
  | grep "TARGET_TIMESTAMP" | python3 -c "..."
```

### newsyslog rotation verification

```bash
# Force a test rotation (dry-run)
sudo newsyslog -nv -f /etc/newsyslog.d/docker-events.conf
# Expected: shows rotation plan; no "not yet due" if -F flag added

# Confirm archives appear after forced rotation
sudo newsyslog -F -f /etc/newsyslog.d/docker-events.conf
ls -lh /usr/local/var/log/docker-events.log*
# Expected: docker-events.log (fresh, small) + docker-events.log.0.bz2
```

---

## 7. Failure Modes

| Failure | Impact | Detection | Mitigation |
|---------|--------|-----------|-----------|
| Log file fills disk (event storm) | System instability | `df -h` / disk pressure alerts | newsyslog 50 MB cap forces rotation; 30-archive limit bounds total at 1.5 GB |
| `docker events` exits and does not restart | Gap in event log | `launchctl list` shows PID="-"; log mtime stalls | KeepAlive respawns after 15s; persistent failure = Docker daemon down (informative gap) |
| newsyslog config syntax error | No rotation; log grows unbounded | `sudo newsyslog -nv` shows parse error | Validate with `-nv` before deploying; test on non-prod first |
| Log directory `/usr/local/var/log/` has wrong permissions | Agent fails to write | `launchctl list` shows exit code 1; error log has "permission denied" | Install step pre-creates directory + files with correct owner (`admin:admin`) |
| Docker Desktop upgrade changes `docker` binary path | Agent fails on restart | Error log: "command not found" | Plist uses absolute path `/usr/local/bin/docker`; verify path on Desktop upgrade |
| macOS user logs out | Launch agent is unloaded | Events gap during logout | Acceptable — machine is unattended; Docker Desktop also pauses during logout |
| Archive count exceeds 30 | Oldest evidence lost | None (by design) | 30 days is the retention contract; escalate to Option 3 (log shipper) if longer required |

### Disk fill risk assessment

Current available: 12 GB on `/System/Volumes/Data`. Worst-case 30-archive × 50 MB = 1.5 GB.
At the observed idle event rate (~50 KB/day for a 9-container system with 30s healthcheck
intervals), the realistic 30-day log is ~1.5 MB uncompressed, ~150 KB compressed. The size cap
exists as a safety valve for event storms (e.g., a crashlooping container producing thousands
of `die`/`start` events per minute). Even in a 1-hour storm at 100 events/second, the log
grows at ~10 KB/min — the 50 MB cap absorbs ~83 hours before forcing rotation. No disk-fill
risk under realistic failure modes on this host.

---

## 8. Migration and Coexistence

### Precedent

The closest operational precedent is `homebrew.mxcl.cloudflared.plist` which logs to
`/usr/local/var/log/cloudflared.log` using an identical launchd pattern. That agent has been
running without issue. The proposed agent follows the same pattern and writes to the same
directory, creating no conflicts.

The second precedent is `com.vn-market.mcp.plist` which uses `KeepAlive.Crashed = true` —
the same crash-recovery posture proposed here. Both agents coexist in `~/Library/LaunchAgents/`
without interference.

### Conflicts with existing config

No conflicts identified:
- `docker events` is a read-only daemon client; it does not modify Docker state.
- The log file path (`/usr/local/var/log/docker-events.log`) does not collide with any
  existing log file in that directory (current contents: `cloudflared.log`, `mongodb/`).
- newsyslog config in `/etc/newsyslog.d/docker-events.conf` is a new file; no existing
  entry in `/etc/newsyslog.conf` covers this path.
- No port allocation required.
- No new Docker volume or network.
- No changes to `docker-compose.yml`.
- No changes to any application code.

### docker-compose restart coexistence

When ops runs `docker-compose restart` or `docker-compose up -d <service>`, `docker events`
captures the resulting `die` + `start` events automatically. This is the feature, not a
conflict. The ops agent should continue tagging deliberate restarts in the notebook with
`# TNB-PLANNED-RESTART` (per 1896a §4 recommendation) so that forensic queries can filter
planned vs unplanned events.

### Future upgrade path

If the team decides to move to Option 3 (log shipper) in a future sprint, the launchd agent
is cleanly uninstalled with `launchctl unload` + `rm plist`. The log files remain on disk and
can be fed into the shipper's backfill. No data loss on migration.

---

## 9. Risks

| Risk | Severity | Probability | Mitigation |
|------|----------|-------------|-----------|
| Docker Desktop upgrade changes socket location or binary path | MEDIUM | LOW | Pin `/usr/local/bin/docker` in plist; verify on upgrade |
| macOS system update breaks launchd agent loading | LOW | VERY LOW | Standard launchd pattern used by Homebrew services (cloudflared); Apple maintains compatibility |
| Event log contains sensitive data (container names, image digests) | LOW | MEDIUM | Log file is 644 (owner read-write, group/other read); on single-user machine this is acceptable. Future: restrict to 640 if multi-user concern arises |
| ThrottleInterval=15s too short; flapping at boot | LOW | LOW | cloudflared uses no ThrottleInterval and functions; 15s is conservative. Increase to 30s if boot flap observed |
| newsyslog HUP signal not forwarded | LOW | LOW | `docker events` writes to stdout captured by launchd fd; fd is replaced by newsyslog's rename+truncate without needing a HUP signal. No pidfile entry in conf required. |
| ops installs plist before Docker Desktop is running | NONE | CERTAIN | ThrottleInterval handles this; agent retries every 15s until Docker socket is available |

No HIGH or CRITICAL risks identified. All risks are LOW or MEDIUM and have straightforward
mitigations.

---

## 10. References

| Document | Location | Relevance |
|----------|----------|-----------|
| 1896a Container Restart RCA brief | `docs/architecture-briefs/2026-05-12-container-restart-rca.md` | Establishes c40 timeline; H4 confirmed for c41; c40 inconclusive |
| 1896b ops evidence collection | `docs/handoffs/ops-c40-restart-evidence.md` | `inconclusive-events-expired` verdict; E1 returned NO OUTPUT; motivates this brief |
| Sprint 1336 named-volume fix | `docker-compose.yml` + `docs/architecture-briefs/` (post-merge notes) | Confirms SQLite corruption root cause fixed; this brief addresses the separate observability gap |
| cloudflared launchd precedent | `~/Library/LaunchAgents/homebrew.mxcl.cloudflared.plist` | KeepAlive + `/usr/local/var/log/` pattern |
| vn-market mcp launchd precedent | `~/Library/LaunchAgents/com.vn-market.mcp.plist` | KeepAlive.Crashed=true + ThrottleInterval pattern |
| newsyslog(8) man page | macOS system (`man newsyslog`) | Rotation config format, J/G flags, @T00 daily trigger |
| Agent-chaining protocol events-rule | `docs/protocols/agent-chaining-protocol.md` | Governs how ops evidence requests are routed; inconclusive verdict triggered escalation chain |
| Fail-loud protocol | `docs/protocols/fail-loud-protocol.md` | Ingestion-failure observability requirement (silent failure is worse than no output) |
| Restart policy SSOT | `docs/policies/restart-policy.md` | docker-compose only; this brief adds no new restart mechanism |

---

## Appendix — Complete File List

| File | Action | Owner | Note |
|------|--------|-------|------|
| `launchd/com.vn-market.docker-events.plist` | CREATE | ops / agent-father | Source-controlled copy; ops installs to `~/Library/LaunchAgents/` |
| `launchd/docker-events-newsyslog.conf` | CREATE | ops / agent-father | Source-controlled copy; ops installs to `/etc/newsyslog.d/` (sudo) |
| `launchd/docker-events-logging.md` | CREATE | ops / agent-father | Operator runbook: install, verify, query examples |
| `~/Library/LaunchAgents/com.vn-market.docker-events.plist` | INSTALL | ops | Not checked into git (user home); deployed from project `launchd/` |
| `/etc/newsyslog.d/docker-events.conf` | INSTALL | ops | System-level; requires sudo; deployed from project `launchd/` |
| `/usr/local/var/log/docker-events.log` | CREATED AT RUNTIME | launchd | Log file; gitignored |
| `/usr/local/var/log/docker-events-error.log` | CREATED AT RUNTIME | launchd | Error log; gitignored |

**DDD layer:** Not applicable — pure host-level infrastructure config. No domain, application,
interface, or scheduler layer involvement.

**Test strategy:** No automated tests (host config). Verification is manual per §6 checklist.
The artificial restart test (§6, `docker-compose restart api-gateway`) is the acceptance test
for PM to mark done.

---

## Owner Recommendation

**Recommended owner: ops**, with agent-father as fallback if ops lacks plist-authoring
capability in its flow.

Rationale:
- All steps are `launchctl` commands + file copy — pure host-side ops.
- No TypeScript/Python code; no `bun install`; no Docker rebuild.
- The pattern is identical to ops's existing Docker and `cloudflared` management scope.
- agent-father is appropriate if the decision is to bundle plist authoring into a config-file
  delivery pattern (e.g., agent-father generates the plist from a template and ops installs).
- Either owner can execute; ops is the simpler path given existing scope.

**PM decision point:** assign to ops if ops flow covers `launchctl load`; assign to agent-father
if the brief needs to produce the plist file content as a deliverable before ops installs.

---

*Brief authored by Architect — brownfield scan complete, no DDD violations, no production
code changes required.*
