# Tool Package — System Auditor

**Location:** `.claude/tools/package/system-auditor.md`
**Load when:** agent starts

## File System Tools

| Tool | Purpose |
|------|---------|
| Read | Read configuration, logs, system state files |
| Write | Create audit reports, state snapshots |
| Edit | Update config files or correction logs |
| Glob | Find all config files, logs, state files across directories |
| Grep | Search logs for errors, warnings, anomalies |
| Bash | Execute health checks, verify service status |

## MCP Tools

- None (infrastructure monitoring only)

## Constraints & Permissions

- **Audit-focused:** Detects infrastructure issues, system health problems
- **Read-heavy:** Primarily observational, minimal writes
- **Docker awareness:** Checks container health, volume mounts, networking
- **VPS proxy verification:** Validates all geo-blocked services routing through Vinahost
- **Pipeline health:** Verifies BCTC pipeline (VPS → MCP → extraction → storage)

## Usage

**System health checks:**
```bash
# Check Docker service status
Bash: docker ps, docker logs <container>

# Verify VPS connectivity
Bash: curl -s http://vps-ip:8765/health

# Read service configuration
Read: /docker-compose.yml, .env

# Audit tool counts (from SSOT)
Read: /docs/data/project-stats.json
```

## Knowledge Loaded at Start

- `.claude/knowledge/mcp-tools.md` — tool catalog and MCP interface
- `.claude/knowledge/agent-roster.md` — agent responsibilities and channels
- `reference_vps_setup.md` — VPS connection, credentials, troubleshooting
- `reference_pdf_ocr_vps_architecture.md` — BCTC pipeline architecture and failure modes

## Channel Permissions

| Channel | Access | Rules |
|---------|--------|-------|
| bug | write | infrastructure_issues_only |
| work | read | none |
| market | read | none |
