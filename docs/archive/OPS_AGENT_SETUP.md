# Ops Agent Setup Guide

**Setup Date:** 2026-04-21
**Agent Model:** Claude Haiku 4.5 (cost-optimized)
**Permissions:** Full VPS SSH + launchctl + database access
**Team:** Dev Team (local cron)

---

## What Was Created

### 1. Ops Agent File
- **Location:** `.claude/agents/ops.md`
- **Role:** Infrastructure monitoring and incident response
- **Scope:** VPS health, server restarts, database integrity
- **Trigger:** Hourly dev cron (after QA) + emergency escalations

### 2. Knowledge Base (3 new files)

| File | Purpose |
|------|---------|
| `.claude/knowledge/vps-setup.md` | VPS infrastructure guide (5 services, endpoints, troubleshooting) |
| `.claude/knowledge/ops-incident-response.md` | Incident playbooks (5 scenarios: service down, server crash, DB corruption, etc.) |
| Updated `agent-roster.md` | Added Ops to Dev Team roster |
| Updated `cron-jobs.md` | Added Ops to hourly dev-team cron chain |

### 3. Documentation Summary

**For the Ops Agent:**
- Full workflow documented in `ops.md` (bootstrap → diagnose → respond → report)
- Reference commands for VPS + local server + database
- Token economy optimized (~200 tokens per healthy cycle)

**For Your Operations:**
- `.env` variables required: `VINAHOST_IP`, `VINAHOST_USER`, `VINAHOST_KEY`
- All 5 VPS services documented with intervals, endpoints, troubleshooting
- Emergency playbooks for 5 incident types
- Decision tree for when to escalate to human

---

## How Ops Integrates Into Dev Cron

### Current Workflow (Hourly)

```
Dev-team cron fires at XX:07 UTC
│
├─ PO (check for approved sprint goals)
├─ BA (requirements from PO approval)
├─ Architect (brownfield scan if new tasks)
├─ PM (plan task breakdown)
├─ Developer (TDD implementation per task)
├─ QA (merge validation + test report)
├─ Fixer (apply changes-requested fixes)
│
└─ OPS (NEW) ← runs last, ~30s baseline health check
   │
   ├─ Check VPS 5 services (systemctl status + recent logs)
   ├─ Check local server (launchd, process, health endpoint)
   ├─ Check database (WAL size, schema validation)
   │
   ├─ If all green → Report ✅ to WORK channel
   └─ If any issue → Attempt recovery OR escalate with diagnostics
```

### How to Add to Dev Cron

You need to update the **dev-team cron prompt** in your Claude Code hooks or manual invocation.

**Current prompt (simplified):**
```
Run dev-team workflow: po→ba→architect→pm→developer→qa→fixer
```

**Updated prompt:**
```
Run dev-team workflow: po→ba→architect→pm→developer→qa→fixer→ops

The ops agent runs last. It checks:
- VPS 5 services (price/BCTC/news/SBV/foreign-flow) for liveness
- Local server (launchd process, health endpoint)
- Database (WAL size, integrity)

Ops takes action (restart services) only if escalated.
Baseline health check is passive observation.
```

### Implementation Methods

#### Method 1: Manual Command (Test First)
```bash
# Invoke ops agent manually after dev-team
agent --agent ops "Perform baseline infrastructure health check"
```

#### Method 2: Update CronCreate Prompt
If using `CronCreate` for dev-team scheduling, append to the prompt:

```bash
CronCreate \
  --cron "7 * * * *" \
  --prompt "Run: po→ba→architect→pm→developer→qa→fixer→ops.
Ops checks VPS (5 services), local server, DB health.
Reports to WORK if any degradation."
```

#### Method 3: Update CLAUDE.md Hook
If you have a hook in `.claude/CLAUDE.md` that fires the dev-team cron, add ops to the chain:

```markdown
# Dev Team Workflow
[existing po→ba→architect→pm→developer→qa→fixer]
7. **Ops** (runs after QA merge)
   - Health check: VPS services, server, database
   - Respond to critical issues (VPS service restart, launchctl recovery)
   - Report baseline health to WORK channel
```

---

## Pre-Flight Checklist

Before running Ops agent, verify these are in `.env`:

```bash
# VPS Connection
VINAHOST_IP=<your-vps-ip>
VINAHOST_USER=root
VINAHOST_KEY=~/.ssh/id_rsa  # or path to your SSH key

# Telegram (for status reports to WORK channel)
TELEGRAM_INFO_WORK_CHANNEL_ID=<your-work-channel-id>
CLAUDE_SERVICES_TOKEN=<token-for-telegram>
```

**Verify connectivity:**
```bash
# Should respond with hostname
ssh root@$VINAHOST_IP "hostname"

# Should return 5 services
ssh root@$VINAHOST_IP "systemctl list-units --type=service --all | grep vn-"
```

---

## First Run: What to Expect

### Dry Run (Manual)
```bash
agent --agent ops "Test infrastructure health check — report findings, no recovery actions"
```

**Expected output (if healthy):**
```
✅ Infrastructure Healthy

Checked:
  • vn-price-fetch.service → ✅ active
  • vn-bctc-fetch.service → ✅ active
  • vn-news-fetch.service → ✅ active
  • vn-sbv-fetch.service → ✅ active
  • vn-foreign-flow.service → ✅ active
  • Server (launchd) → ✅ running PID 2845
  • Health endpoint → ✅ 200 OK

No action needed. All systems nominal.
```

**If degraded:**
```
⚠️ Service Degradation Detected

Issue: vn-price-fetch.service is inactive
Root cause: Previous restart incomplete
Recovery: systemctl restart vn-price-fetch.service → recovered in 5s ✅
Status: Now healthy

No user impact (queued data not lost).
```

---

## Day-to-Day Operations

### Hourly (Automatic)
- Dev-team cron runs at XX:07 UTC
- Ops runs last (~30s)
- If all green → silent (no message)
- If degraded → WORK channel alert with recovery status

### If Incident Occurs
1. Ops agent detects issue
2. Attempts automated recovery (restart VPS service, launchctl, etc.)
3. Reports to WORK channel with root cause + recovery time
4. If recovery fails → escalates with full diagnostic for human review

### Emergency Escalation
**Never automated recovery attempted for:**
- Database corruption
- Multiple services down (cascade)
- Network partition (VPS unreachable)
- Disk full

In these cases, ops sends:
```
🚨 ESCALATION REQUIRED [severity level]

Issue: [what failed]
Diagnostics: [logs + observations]
Blocker: [why human needed]

Awaiting operator decision.
```

---

## Token Economy

| Scenario | Tokens | Time |
|----------|--------|------|
| All healthy (baseline) | ~200 | 30s |
| Single service down + recovery | ~500 | 2 min |
| Incident escalation | ~800 | 3 min |
| Database corruption (escalated) | ~1000 | 5 min |

**Auto early-exit:** If 7 consecutive days of green status + no VPS watchdog escalations, baseline check skips to watchdog-log-only (~100 tokens).

---

## Reference Quick Links

**In this project:**
- `.claude/agents/ops.md` — Full agent instructions + workflow
- `.claude/knowledge/vps-setup.md` — VPS services, endpoints, troubleshooting
- `.claude/knowledge/ops-incident-response.md` — Incident playbooks + decision trees
- `.claude/knowledge/agent-roster.md` — Ops in dev-team roster
- `.claude/knowledge/cron-jobs.md` — Ops in hourly dev-cron schedule

**Commands (run from project root):**
```bash
# Manual health check
agent --agent ops "Check VPS and server health"

# Manual incident response
agent --agent ops "vn-price-fetch.service is down — diagnose and recover"

# VPS status check (from your machine)
ssh root@$VINAHOST_IP /root/vps-status.sh

# Deploy VPS updates
./deploy-vinahost.sh
```

---

## FAQ

### Q: Will Ops restart services automatically?
**A:** Yes, for:
- Single VPS service down (restart via systemctl)
- Local server process dead (launchctl kickstart)
- Database WAL bloat (PRAGMA wal_checkpoint)

No for:
- Multiple services down (indicates systemic issue)
- Database corruption (data loss risk)
- Network partition (environmental issue)

### Q: How often does Ops run?
**A:**
- **Baseline:** Every hour (part of dev-cron at XX:07 UTC)
- **Emergency:** On VPS watchdog escalation (10-min cadence during market hours)
- **Manual:** Anytime you invoke the agent directly

### Q: Can Ops change code or merge PRs?
**A:** No. Ops is **observe-respond-report** only:
- Observes infrastructure health
- Responds to operational issues (restarts, checkpoints)
- Reports to WORK channel
- Escalates blockers to human

Code changes are Developer's role. Ops has zero write access to source tree.

### Q: What if Ops itself crashes?
**A:**
- Dev-cron continues (next agent runs, ops skipped)
- Next hour, ops re-invoked normally
- If repeating, escalate to human with agent logs

### Q: Can I customize Ops behavior?
**A:** Yes, via:
- Update `ops.md` if you want different checks/response logic
- Update `.env` for VPS connection details
- Modify playbooks in `ops-incident-response.md`

All changes preserve in `.claude/agents/` for version control + readability.

---

## Support

If Ops escalates with an issue:
1. Read the escalation message (WORK channel)
2. Refer to relevant playbook in `ops-incident-response.md`
3. Follow manual steps if Ops couldn't auto-recover
4. Update Ops playbook if new incident type discovered

For questions on VPS infrastructure:
→ `.claude/knowledge/vps-setup.md`

For incident response procedures:
→ `.claude/knowledge/ops-incident-response.md`

For agent workflow details:
→ `.claude/agents/ops.md`
