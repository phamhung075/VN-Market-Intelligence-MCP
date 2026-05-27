> Parent: [workflow-map.md](./workflow-map.md)

# Cron & Demand Workflows (W5-W19)

---

## W5-W9: Cron-driven cowork (Analysis Team)

```
W5  CRON cowork tick (market hours)
    CRON → MAIN → news-scout       → docs/signals/news_impact.json     ─┐
    CRON → MAIN → market-watcher   → docs/signals/price_anomaly.json   ─┤
    CRON → MAIN → financial-analyst→ docs/signals/bctc_signal.json     ─┤→ dev-team Step 0a drain
    CRON → MAIN → report-analyzer  → docs/signals/fundamental_*.json   ─┘   (next cycle)
                  (each writes notebook + commits)

W6  CRON alert dispatch (every 10–30 min)
    CRON → MAIN → alert-commander → reads cowork signals → verify → MARKET channel
                                  → docs/signals/suppress.json (if needed)

W7  CRON digest / prediction
    CRON → MAIN → digest-predict → main.md picks daily|monday|weekly|monthly
                                 → MARKET channel (digest)

W8  CRON /ask queue drain
    CRON → MAIN → qa-responder → reads ask_queue → MCP+web → MARKET channel reply

W9  CRON unified-agent
    CRON → MAIN → unified-agent → main.md picks market|prediction|daily-review|weekly
                                → cross-checks cowork output → WORK channel
```

---

## W10–W10b: Cron-driven dev cycle + Zone Propagation

```
W10 CRON dev-team (hourly :07)
    CRON → MAIN → dev-team Step 0a (drain-signals.md) → Step 0b (resume?)
                → Step 1 (po triage: triage-tnb → triage-signals → channel-audit → No-Task Guard)
                → Step 2 (ba/architect/pm planning — ZONE propagated end-to-end)
                → Step 3 (execute-tier.md: zone-routed parallel spawn dev-<service>)
                → tier merge gate → Step 4+4.5 (post-cycle.md) → WORK summary

W10b ZONE PROPAGATION (sub-workflow that runs inside W2 / W3 / W10 Step 2-3)
     architect Step 2 zone-detect → handoff §Zone + RETURN ZONE: apps/<service>/
              ↓ (PM reads handoff §Zone)
     pm Step 3b handoff frontmatter zone: → Step 3c RETURN per-task zone:
              ↓ (dev-team reads PM RETURN)
     dev-team Step 3 3-tier resolve:
        Tier 1 EXPLICIT (preferred):   task.zone matches → spawn dev-<service>
        Tier 2 INFER (fallback):       all files in one apps/X/ → spawn dev-<service>
        Tier 3 REPORT (last resort):   indeterminate → spawn developer + WORK warning
              ↓
     dev-<service> reads docs/agents/dev-<service>/flow/main.md (thin pointer)
              ↓
     pointer redirects to shared docs/agents/developer/flow/microservice-main.md
              ↓
     specialist runs scoped to apps/<service>/ only
```

---

## W11–W15: Cron-driven maintenance / quality

```
W11 CRON quality audit (daily TNB)
    CRON → MAIN → tran-ngoc-bau → reads MARKET 50msgs + agent notebooks
                                → docs/handoffs/tnb-audit-latest.md
                                → docs/signals/tnb-<ts>.json (priority: high|normal)
                                → next dev cycle Step 0a drains → po reads Step 0-TNB

W12 CRON system audit
    CRON → MAIN → system-auditor → memory/DB/logs scan → BUG (new anomalies only)

W13 CRON code-janitor (3h)
    CRON → MAIN → code-janitor → DRY/magic-number scan → docs/TASKS.md (or signal po)

W14 CRON context janitor
    CRON → MAIN → claude-manager-helper → CLAUDE.md slim + DAG check + memory hygiene

W15 CRON cowork refresh
    CRON → MAIN → cowork-refactory-expert → rewrites cowork .md files from live MCP state

W16 CRON agent-father (daily 14:23 UTC)
    CRON → MAIN → agent-father main.md → keep.md (default) → orphan + roster sweep
```

---

## W17–W19: Demand-driven architecture / scheduling

```
W17 DEMAND architecture brief
    USER/TNB → MAIN → agents-architect → docs/architecture-briefs/<date>-<slug>.md
                                       → docs/signals/<slug>.json
                                       → next cycle: dev-team Step 0a drains
                                       → po triages → agent-father (if agent change)
                                                    or pm (if code change)

W18 DEMAND agent maintenance
    USER → MAIN → agent-father main.md → create|edit|review|keep
                                       → edits .claude/agents/*.md or docs/agents/*/flow/*
                                       → notebook commit → RETURN

W19 DEMAND new cron schedule
    USER → MAIN: does .claude/commands/crons/cron-X.md exist?
                 ├─ YES → invoke skill directly → CronCreate registers job
                 └─ NO  → spawn agent-father (create) → authors new cron skill → user invokes
```
