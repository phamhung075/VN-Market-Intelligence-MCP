# TECH-124: feat(vps-deploy-backfill) — Wire ohlcv-backfill-poll.sh as 6th VPS Service

status: APPROVED_BY_ARCHITECT
req_ref: Sprint 124 (project-stats.json)

## Brownfield Impact

- Files modified: `deploy-vinahost.sh`
- Files created: `vps-scripts/vn-ohlcv-backfill.service`, `vps-scripts/vn-ohlcv-backfill.timer`, `src/__tests__/1362-vps-deploy-backfill.test.ts`
- Files deleted: none
- Breaking changes: no — additive section only; existing sections 1–5 and all other VPS services are untouched

## Architecture Decision

`ohlcv-backfill-poll.sh` (Sprint 123) is a VPS-side poller that polls the France MCP server's queue endpoint and triggers a local backfill script when `pending=true`. Without deployment via `deploy-vinahost.sh`, the Sprint 123 queue mechanism is inert — the VPS never polls. The cleanest fit is a **systemd timer + oneshot service pair** (matching the VPS's existing `systemd` management), rather than an inline `while-true` loop service. The timer fires every 30 minutes (`OnCalendar=*:0/30`) with `Persistent=true` to catch up after VPS downtime. The deploy script follows the identical `sed → scp → systemctl` pattern of sections 1–5.

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| TDD content checks | test | `src/__tests__/1362-vps-deploy-backfill.test.ts` | NEW |
| ohlcv-backfill poller | vps-scripts | `vps-scripts/ohlcv-backfill-poll.sh` | existing (no change) |
| systemd service unit | vps-scripts | `vps-scripts/vn-ohlcv-backfill.service` | NEW |
| systemd timer unit | vps-scripts | `vps-scripts/vn-ohlcv-backfill.timer` | NEW |
| deploy section 6 | deploy | `deploy-vinahost.sh` | MODIFY |

Note: `vps-scripts/` and `deploy-vinahost.sh` are outside the DDD `src/` tree — no domain/infrastructure layering constraints apply. The test file is the only TypeScript artifact.

## Interface Contracts

### systemd service — `vps-scripts/vn-ohlcv-backfill.service`

```ini
[Unit]
Description=VN Market OHLCV backfill poller — poll MCP queue and run backfill
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/vn-ohlcv-backfill.env
ExecStart=/root/ohlcv-backfill-poll.sh
StandardOutput=append:/var/log/vn-ohlcv-backfill.log
StandardError=append:/var/log/vn-ohlcv-backfill.log
MemoryMax=64M
TasksMax=16

[Install]
WantedBy=multi-user.target
```

Key decisions:
- `Type=oneshot` — the poll script exits after one run (exits 0 after signalling done, or after N polls finding `pending=false`). A persistent loop is owned by the timer, not the service.
- `EnvironmentFile=/etc/vn-ohlcv-backfill.env` — deploy script writes `MCP_BASE` and `API_KEY` to this file on VPS. Keeps secrets out of the unit file and the deploy script's heredoc.

### systemd timer — `vps-scripts/vn-ohlcv-backfill.timer`

```ini
[Unit]
Description=VN Market OHLCV backfill poller timer — every 30 min
Requires=vn-ohlcv-backfill.service

[Timer]
OnCalendar=*:0/30
Persistent=true
Unit=vn-ohlcv-backfill.service

[Install]
WantedBy=timers.target
```

Key decisions:
- `OnCalendar=*:0/30` — fires at :00 and :30 every hour every day, matching the 30-min requirement.
- `Persistent=true` — if the VPS was offline at a scheduled time, systemd catches up immediately on next boot.
- Timer enables the service; the service itself is never `enabled` directly (standard timer+oneshot pattern).

### deploy-vinahost.sh section 6 pattern

```bash
# ── 6. OHLCV backfill poller ────────────────────────────────────────────────
echo ""
echo "Deploying OHLCV backfill poller..."
TMP=$(mktemp)
sed -e "s|__MCP_BASE__|${MCP_BASE}|g" \
    -e "s|__API_KEY__|${VPS_PUSH_API_KEY}|g" \
    vps-scripts/ohlcv-backfill-poll.sh > "$TMP"
$SCP "$TMP" ${VH_USER}@${VH_IP}:/root/ohlcv-backfill-poll.sh
$SCP vps-scripts/vn-ohlcv-backfill.service ${VH_USER}@${VH_IP}:/etc/systemd/system/vn-ohlcv-backfill.service
$SCP vps-scripts/vn-ohlcv-backfill.timer   ${VH_USER}@${VH_IP}:/etc/systemd/system/vn-ohlcv-backfill.timer
rm "$TMP"

$SSH << 'BACKFILLEOF'
set -e
chmod +x /root/ohlcv-backfill-poll.sh
printf 'MCP_BASE=__MCP_BASE__\nAPI_KEY=__API_KEY__\n' > /etc/vn-ohlcv-backfill.env
chmod 600 /etc/vn-ohlcv-backfill.env
systemctl daemon-reload
systemctl enable vn-ohlcv-backfill.timer
systemctl restart vn-ohlcv-backfill.timer
sleep 2
echo "=== vn-ohlcv-backfill timer status ==="
systemctl --no-pager -l status vn-ohlcv-backfill.timer | head -12
BACKFILLEOF
```

Note: The `printf` inside the SSH heredoc writes literal `__MCP_BASE__` and `__API_KEY__` placeholders. The actual substitution for the `.env` file on VPS must use a second `sed`-substituted heredoc or pass the values explicitly. See implementation note below.

### Implementation note — env file on VPS

The SSH heredoc uses `<< 'BACKFILLEOF'` (single-quoted = no local variable expansion). To write real values into `/etc/vn-ohlcv-backfill.env`, the impl must either:

**Option A** (recommended, consistent with existing pattern): use a double-quoted heredoc for the env file write only, or pass via a separate `$SSH` command that interpolates locally:

```bash
$SSH "printf 'MCP_BASE=${MCP_BASE}\nAPI_KEY=${VPS_PUSH_API_KEY}\n' > /etc/vn-ohlcv-backfill.env && chmod 600 /etc/vn-ohlcv-backfill.env"
```

Then the single-quoted `'BACKFILLEOF'` heredoc handles the systemd steps. This is the cleanest split — local vars expand in the inline command, heredoc stays literal for the multi-step block.

**Option B**: The `sed` substitution already bakes `MCP_BASE`/`API_KEY` into the copied `ohlcv-backfill-poll.sh` (same as how `fetch-prices.sh` etc. are handled). The `EnvironmentFile` is optional — the script already has the values embedded. In that case, remove `EnvironmentFile` from the service unit, and the `/etc/vn-ohlcv-backfill.env` write step is unnecessary.

**Architect recommendation**: Option B matches exactly what sections 1–5 already do — `sed` substitution into the script removes the need for a separate env file. The service unit should omit `EnvironmentFile`. Developer must choose and be consistent; TDD tests only check for `ExecStart=/root/ohlcv-backfill-poll.sh` and `OnCalendar=*:0/30`, not for the env mechanism.

## Task Breakdown

| Task | Title | Layer | Depends on |
|---|---|---|---|
| 1362 | TDD content checks — `1362-vps-deploy-backfill.test.ts` | test | none |
| 1363 | Impl — `vn-ohlcv-backfill.service`, `.timer`, deploy section 6 | vps-scripts + deploy | 1362 RED |

### Task 1362 — Test file specification

File: `src/__tests__/1362-vps-deploy-backfill.test.ts`

Line 1: `process.env["DB_PATH"] = ":memory:";`

Pattern: `readFileSync` + `existsSync` from `"fs"`, paths via `import.meta.dir` + `join`. No network, no SSH, no process spawning.

| AC | Description | Assert |
|---|---|---|
| AC-1 | `deploy-vinahost.sh` references the poll script | `content.includes("ohlcv-backfill-poll.sh")` |
| AC-2 | `vps-scripts/vn-ohlcv-backfill.service` exists + has correct ExecStart | `existsSync(...)` + `content.includes("ExecStart=/root/ohlcv-backfill-poll.sh")` |
| AC-3 | `vps-scripts/vn-ohlcv-backfill.timer` exists + has 30-min calendar | `existsSync(...)` + `content.includes("OnCalendar=*:0/30")` |
| AC-4 | `deploy-vinahost.sh` enables the timer | `content.includes("vn-ohlcv-backfill.timer")` |

All 4 ACs are RED before 1363 (files don't exist yet), GREEN after 1363.

### Task 1363 — Implementation checklist

1. Create `vps-scripts/vn-ohlcv-backfill.service` — `Type=oneshot`, `ExecStart=/root/ohlcv-backfill-poll.sh`
2. Create `vps-scripts/vn-ohlcv-backfill.timer` — `OnCalendar=*:0/30`, `Persistent=true`
3. Modify `deploy-vinahost.sh` — add section 6 after section 5, before the final summary block
4. Update summary block: add `OHLCV backfill poller: systemctl status vn-ohlcv-backfill.timer` line
5. Update header comment: change "5 VN data proxy services" → "6 VN data proxy services", add `vn-ohlcv-backfill.timer` to the services list
6. `bun tsc --noEmit` — 0 errors (no TS files changed, but verify)
7. `bun test src/__tests__/1362-vps-deploy-backfill.test.ts` — all GREEN

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| `ohlcv-backfill-poll.sh` already has values baked-in after `sed`; `EnvironmentFile` causes "file not found" on VPS | Medium | Medium | Use Option B — omit `EnvironmentFile`, rely on `sed` substitution (consistent with services 1–5) |
| Timer fires while poll script is already running from a previous fire | Low | Low | `Type=oneshot` + systemd prevents concurrent runs by default; `ohlcv-backfill-poll.sh` exits after one done cycle |
| `Persistent=true` triggers an immediate catchup run on deploy restart | Low | Low | Backfill is idempotent — `pending=false` path exits cleanly |
| VPS `/etc/systemd/system/` write permission denied if non-root user | Very Low | High | All existing services write to this path as root; same user; not a new risk |

## Security Review

- SQL parameterized? N/A (no SQL in this feature)
- File paths validated (no `../`)? Yes — all paths are hardcoded constants (`/root/ohlcv-backfill-poll.sh`, `/etc/systemd/system/vn-ohlcv-backfill.*`)
- External HTTP rate-limited? N/A — VPS-side script, polls MCP server (France), not an external public API
- Secrets via Bun.env only? N/A — VPS script; `VPS_PUSH_API_KEY` passed via `sed` substitution into the script, same mechanism as services 1–5; never committed to git
- `chmod 600` on env file if Option A is used? Yes — required in impl; already noted above
