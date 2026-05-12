# Ops — Incident Response Playbook

**Load when:** Infrastructure incidents, service failures, escalations from Ops agent.

---

## Incident Classification

### Severity Levels

| Level | Response | Timeline | Runbook |
|-------|----------|----------|---------|
| **🟢 Green** | Baseline health check | 24h | (monitoring only) |
| **🟡 Yellow** | Degraded (1 service down, others OK) | 30 min | → see [ops-incident-response-p2-degradation.md](./ops-incident-response-p2-degradation.md) |
| **🔴 Red** | Critical (>1 service down OR server down) | 5 min | → see [ops-incident-response-p1-critical.md](./ops-incident-response-p1-critical.md) |
| **🟣 Purple** | Data risk (DB corruption, WAL >1GB) | Immediate | → see [ops-incident-response-p1-critical.md](./ops-incident-response-p1-critical.md) |

---

## Runbook Index

| Issue | Severity | Playbook | Read from |
|-------|----------|----------|-----------|
| Single VPS service down | Yellow | Playbook 1 | [ops-incident-response-p2-degradation.md](./ops-incident-response-p2-degradation.md) |
| Docker microservices down | Yellow | Playbook 2 | [ops-incident-response-p2-degradation.md](./ops-incident-response-p2-degradation.md) |
| Database corruption / WAL bloat | Purple | Playbook 3 | [ops-incident-response-p1-critical.md](./ops-incident-response-p1-critical.md) |
| Multiple services down (cascade) | Red | Playbook 4 | [ops-incident-response-p1-critical.md](./ops-incident-response-p1-critical.md) |
| Deployment failure | Yellow–Red | Playbook 5 | [ops-incident-response-p2-degradation.md](./ops-incident-response-p2-degradation.md) |

---

## Decision & Escalation

→ see [ops-incident-response-decision-tree.md](./ops-incident-response-decision-tree.md)

**Quick start:**
- Purple (data risk)? → ESCALATE IMMEDIATELY
- Service won't restart? → Read logs, check connectivity
- Persists >10 min? → ESCALATE with diagnostic
