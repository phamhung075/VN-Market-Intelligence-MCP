# PO Notebook

## 2026-06-01 — dev-team triage (tick 0315Z)

**Inputs:** 6 signals drained (1 context_bloat HIGH, 1 repair_task MEDIUM, 4 cowork-fire LOW NOOP) + 4 new Telegram reports (3017/3018/3019/3020) + TASKS.md (77L→79L) + git log -30.

**Decisions — BATCH of 2:**
1. **NB-BLOAT-FLOW-OVERWRITE → FIX (PROMOTED).** system-auditor.md re-breached 26L→**249L** within hours of prune 1013a624 (≥10 prepend notebook commits overnight). SKILL anchor fix (NB-PRUNE-1, 7166db01) was correct but system-auditor agent STILL PREPENDS per flow drift. Durable fix = unambiguous full-overwrite instruction in `docs/agents/system-auditor/flow/main.md` (~L427) via agent-md-factory. Highest-freq drain noise (every 30-min audit). Zone cross-service / agent-flow.
2. **VPS-SOCAT-PERSIST → architect→ops (MEDIUM, PLAN-ONLY).** Acute 65h /api 502 outage already recovered (06e0b5da) via MANUAL unsupervised socat :4000→:3000 (PID 1551). Fragile: no launchd → dies on reboot → reopens multi-day outage. source_tier still 2 (tier-1 unconfirmed). Architect picks (a) repoint CF tunnel ingress →:3000 directly OR (b) launchd KeepAlive plist + doc. Folded into FLEET-HOST-SAFETY (same 16GB-host infra-safety theme). NOT acute (data flowing).

**NOOP / already-tracked:**
- Telegram 3017+3018 (A-01 false fleet-down + retraction) → FLEET-HOST-SAFETY/A-01-EXPECTED-SET.
- Telegram 3019 (drain shell-injection incident) → FLEET-HOST-SAFETY/DRAIN-INJECTION-SAFE.
- Telegram 3020 (B-01/B-02/B-03/B-06 VPS staleness) → covered by VPS-SOCAT-PERSIST + AUDITOR-SLA-CADENCE; DASHBOARD reconcile noted in task.
- 4× cowork-fire heartbeats → informational NOOP.

**WIP:** 0 truly in_progress (all sprints OPEN/READY/GATED awaiting dispatch). Batching 2 honors WIP≤2.

**Carry-over:**
- VPS source_tier:2 — confirm whether tier-2 (DB-served) is NORMAL or a degradation; if normal, AUDITOR-SLA-CADENCE should stop flagging it.
- system-auditor notebook keeps breaching every 30min until NB-BLOAT-FLOW-OVERWRITE ships — expect repeat context_bloat_breach signals each tick meanwhile (do NOT re-promote; it's active).
- TASKS.md at 79L — near 80L cap; next triage may need to migrate a closed sprint to TASKS_ARCHIVE.md.
