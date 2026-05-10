# Knowledge Tree Map — Canonical DAG

**Load when:** before any lazy-load, file creation, or knowledge maintenance. This is the single source of truth for the file dependency graph.

## Rules

1. **CLAUDE.md is root.** All paths start from CLAUDE.md pointers.
2. **Parent → child only.** Never child → parent. No circular references.
3. **Multiple parents may share a child.** Diamond dependencies OK.
4. **`.claude/knowledge/*.md`** = logic, rules, how-to. Stable. Agents read, rarely write.
5. **`docs/data/*.json`** = volatile data (counts, lists, stats). Agents read AND write during work.
6. **JSON never in `.claude/`.** Always in `docs/data/`.
7. **MD never contains volatile counts/lists** — point to JSON child instead.
8. **All lazy-load pointers must follow this tree.** No ad-hoc file references.

## Tree

```
CLAUDE.md (root — always loaded)
│
├── .claude/knowledge/tree-map.md ← THIS FILE
│
├── .claude/knowledge/agent-chaining-protocol.md (chaining rules: pipeline maps, return templates, parallel spawn rules, fixer ceiling, cross-team signal directory)
│   ├── docs/pipeline-state.json (pipeline status: current sprint, active task, next agent — volatile, dev-team internal only)
│   ├── docs/signals/*.json (cross-team signal files: cowork→dev-team, drained at Step 0a — volatile)
│   └── docs/signals/processed/*.json (treated signals with processedAt/result metadata — auto-pruned after 7 days)
│
├── .claude/knowledge/mcp-tools.md (tool logic: per-agent mapping, signal types, renamed tools, mandatory patterns)
│   └── docs/data/tool-registry.json (tool list + count — volatile)
│
├── .claude/knowledge/cron-jobs.md (scheduling logic: intelligence cycle steps, timing rules, token economy)
│   └── docs/data/cron-registry.json (job list + count — volatile)
│
├── .claude/knowledge/portfolio-schema.md (position rules: ledger logic, stop-loss formula, TP ladder, analysis block format)
│   ├── docs/data/stock-classification.json (tickers, sectors, trade exposure, peers, reverse map — volatile)
│   └── mcp.config.json → alertPolicy (threshold values — volatile)
│
├── .claude/knowledge/alert-policy.md (firing rules: position-danger, watchlist-opportunity, Commander exclusivity, cooldowns)
│   └── mcp.config.json → alertPolicy (threshold values — shared child with portfolio-schema)
│
├── .claude/knowledge/telegram-commands.md (bot commands: 11 commands, /ask /why behavior, command routing)
│
├── .claude/knowledge/ask-queue-protocol.md (queue logic: FIFO flow, DB schema, escalation, failure protocol)
│
├── .claude/knowledge/kinh-dich-layer.md (hexagram rules: default layer, hao states, agent integration pattern)
│
├── .claude/knowledge/agent-roster.md (team structure: analysis 8 + dev 13, cooperation flow, signal bus)
│
├── .claude/knowledge/dev-standards.md (DDD layer rules, coding standards, test template, commit format, branch hygiene)
│
├── .claude/knowledge/janitor-procedures.md (code janitor: canonical sources, scan checklist, output contract, state file)
│
├── .claude/knowledge/market-analysis.md (causal cascade framework, impact scoring, trade maps, macro matrix, BCTC checklist)
│
├── .claude/knowledge/qa-checklist.md (TDD/DDD/TS/security/data integrity checklist, MCP tool rules, task report template)
│
├── .claude/skills/token-economy/SKILL.md Part 3 (agent-to-agent comms: 3-tier compression ULTRA/FULL/LITE — merged into skill, no separate knowledge file)
│
├── .claude/skills/semble-search/SKILL.md (code search decision guide: when Semble vs Grep/Glob/Read)
│
├── .claude/knowledge/fail-loud-protocol.md (failure handling: 5-step protocol — inlined in agents by design)
│
├── .claude/knowledge/restart-policy.md (server restart: docker-compose only, 9 microservices, banned mechanisms, QA validation)
│
├── .claude/knowledge/ops-incident-response.md (incident playbook: service failures, recovery procedures, severity levels)
│
├── .claude/knowledge/vps-setup.md (VPS operations: Vinahost connection, service management, health checks)
│
├── .claude/WORKFLOW.md (dev workflow: branch hygiene, merge checklist)
│
├── docs/ARCHITECTURE.md (system design: folder tree, data flow, VPS price proxy + BCTC PDF proxy)
│
├── docs/AI_TEAM_DESIGN.md (two-team architecture design)
│
├── docs/AGENT_CREATION_GUIDE.md (agent creation index — always loaded by agent-father)
│   ├── docs/guides/guide-zones.md (Sections 2-3: Two-Zone Folder Design + Per-Agent File Map)
│   ├── docs/guides/guide-lazy-load.md (Section 4: Lazy-Load Protocol + Token Economy)
│   ├── docs/guides/guide-agent-definition.md (Section 5: Agent Definition YAML — all subsections)
│   ├── docs/guides/guide-flows.md (Section 6: Flow File Templates — cowork + dev)
│   ├── docs/guides/guide-agent-ops.md (Sections 7-12: Notebook, Cross-Team, Reports, Maintenance, Registry, Responsibility)
│   ├── docs/guides/guide-error-signals.md (Sections 13-14: Error Boundary + Signal Bus)
│   ├── docs/guides/guide-skills-registration.md (Sections 15-16: Skills Catalog + Registration Checklist)
│   └── docs/guides/guide-quality.md (Section 18: Autonomous Quality Patterns — 6-layer stack)
│
├── docs/GLOSSARY_VI.md (Vietnamese financial terms)
│
├── docs/data/project-stats.json (sprint number, counts — volatile, root-level stats)
│
├── docs/data/system-auditor-known-issues.json (dedup state: fingerprints of reported issues — volatile)
│
├── docs/data/code-janitor-known-findings.json (dedup state: fingerprints of known code findings — volatile)
│
└── docs/TASKS_ARCHIVE.md (index of done tasks by sprint)
```

## Deleted Files (merged into parents)

| Deleted | Content moved to |
|---------|-----------------|
| `.claude/knowledge/telegram-alerts.md` | Bot commands → `telegram-commands.md`. Alert rules → `alert-policy.md` |
| `.claude/knowledge/position-schema.md` | Position ledger → `portfolio-schema.md` (already contained) |
| `.claude/knowledge/stock-classification.md` | Stock data → `docs/data/stock-classification.json`. Pointers from `portfolio-schema.md` |

## Write Ownership

| File | Maintained by | Trigger |
|------|--------------|---------|
| `docs/data/tool-registry.json` | Developer | After adding/removing MCP tool |
| `docs/data/cron-registry.json` | Developer | After adding/removing scheduler |
| `docs/data/stock-classification.json` | Market-Analyst / PO | Watchlist change, sector update |
| `docs/data/project-stats.json` | PM / System-Auditor | Sprint start/end, count change |
| `docs/data/system-auditor-known-issues.json` | System-Auditor | Each audit run |
| `docs/data/code-janitor-known-findings.json` | Code-Janitor | Each janitor run |
| `mcp.config.json` | Developer | Threshold tuning |
| `.claude/knowledge/dev-standards.md` | Developer / Architect | After adding coding standards or layer rules |
| `.claude/knowledge/janitor-procedures.md` | Code-Janitor / Architect | After procedure change |
| `.claude/knowledge/market-analysis.md` | Market-Analyst / BA | After cascade rule or BCTC checklist update |
| `.claude/knowledge/qa-checklist.md` | QA / Architect | After QA rule change |
| `.claude/knowledge/ops-incident-response.md` | Ops / DevOps Lead | After incident discovery or procedure update |
| `.claude/knowledge/vps-setup.md` | Ops / DevOps Lead | After VPS config change or new service |
| `.claude/knowledge/*.md` (all others) | Architect / claude-manager-helper | Logic or rule change |
| `docs/guides/guide-*.md` | Agent Father / Architect | Guide section update |

## Archived Structure (Reference — for future reorganization)

When file organization is restructured, these directories may be created:

| Directory | Content | Purpose |
|-----------|---------|---------|
| `docs/archive/` | BCTC_*.md, AUDIT_*.md, investigation reports, operational docs | Read-only analysis/investigation archive (0 files (cleaned 2026-04-26) max) |
| `docs/historical/` | REQ_*.md, TECH_*.md | Append-only task specs (0 files (cleaned 2026-04-26)) — never delete |

Auto-file rules: patterns that trigger `→ docs/archive/`:
- `*INVESTIGATION*.md`, `*_ANALYSIS.md`, `AUDIT_*.md`, `BCTC_*.md`
- `DEPLOYMENT*.md`, `SPRINT_*`, `IMPLEMENTATION_*.md`, `SYSTEM_*.md`, `OPS_*.md`

## Drift Detection (System-Auditor)

On every run, verify:
1. `docs/data/tool-registry.json`.toolCount matches `grep -c registerTool src/interface/mcp/tools/*.ts`
2. `docs/data/cron-registry.json`.schedulerFileCount matches `ls src/scheduler/*.ts | grep -v "^jobs\.ts$" | grep -v "/jobs\.ts" | wc -l` (includes summaryJobs.ts, excludes jobs.ts orchestrator)
3. No knowledge `.md` file contains hardcoded counts (numbers that should be in JSON)
4. All pointers in this tree resolve (target file exists)
