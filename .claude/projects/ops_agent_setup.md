---
name: Ops Agent Setup
description: Ops agent (Haiku) created for dev team infrastructure management on 2026-04-21
type: project
---

# Ops Agent Setup — 2026-04-21

## Status: COMPLETE ✅

Created a dedicated Ops agent on the Dev Team for VPS and server operations.

**Why:** Infrastructure issues require cost-optimized, always-on observation + automated recovery. Haiku model sufficient for SSH diagnostics, log parsing, and restart coordination. Reduces operational load on dev team members.

**What was created:**

### 1. Agent File
- `.claude/agents/ops.md` — Full workflow, reference commands, token economy
- Metadata: `name=ops`, `color=blue`, `model=haiku`, `tools=[Bash, Read]`
- SKILLS: caveman/lite mode, token-economy
- KNOWLEDGE: vps-setup, ops-incident-response, restart-policy (always-load); lazy-load alert-policy, cron-jobs on demand

### 2. Knowledge Base (3 new files)
- `docs/references/vps-setup.md` — VPS infrastructure (5 services, endpoints, deployment, troubleshooting)
- `docs/protocols/ops-incident-response.md` — 5 playbooks (service down, server crash, DB corruption, cascade failure, deployment failure)
- Updated `agent-roster.md` — Ops added to Dev Team, hourly cron chain
- Updated `cron-jobs.md` — Ops in dev-team chain (runs after QA, ~30s baseline)

### 3. Setup Guide
- `.claude/agents/OPS_AGENT_SETUP.md` — Integration instructions, pre-flight checklist, first-run expectations

## Integration

**Dev-team cron:** po → ba → architect → pm → developer → qa → fixer → **ops** (new, runs last)

**Hourly invocation:** At XX:07 UTC, ops runs baseline health check:
- 5 VPS services (systemctl status + logs)
- Local server (launchd, process, health endpoint)
- Database (WAL size, PRAGMA integrity_check)

If all green → silent. If degraded → attempts recovery OR escalates with diagnostics to WORK.

**Token economy:** ~200/cycle (healthy), ~500 (incident), ~1000 (escalation). Auto early-exit after 7-day green streak.

## How to apply

1. Verify `.env` has: `VINAHOST_IP`, `VINAHOST_USER`, `VINAHOST_KEY`
2. Test: `agent --agent ops "Check infrastructure health"`
3. Integrate into dev-cron schedule (prompt updated)
4. Done — ops runs hourly after QA thereafter

## References

- Full instructions: `.claude/agents/ops.md`
- Setup guide: `.claude/agents/OPS_AGENT_SETUP.md`
- VPS guide: `docs/references/vps-setup.md`
- Incident playbooks: `docs/protocols/ops-incident-response.md`
- Agent roster: `docs/references/agent-roster.md`
- Cron schedule: `docs/standards/cron-jobs.md`

All files include cross-references and are versioned in git.
