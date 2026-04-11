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
├── .claude/knowledge/fail-loud-protocol.md (failure handling: 5-step protocol — inlined in agents by design)
│
├── .claude/knowledge/restart-policy.md (server restart: launchctl only, banned mechanisms, QA validation)
│
├── .claude/WORKFLOW.md (dev workflow: branch hygiene, merge checklist)
│
├── docs/ARCHITECTURE.md (system design: folder tree, data flow, VPS proxy)
│
├── docs/IMPLEMENTATION_STATUS.md (sprint history — reference only, not for volatile stats)
│
├── docs/AI_TEAM_DESIGN.md (two-team architecture design)
│
├── docs/GLOSSARY_VI.md (Vietnamese financial terms)
│
├── docs/data/project-stats.json (sprint number, counts — volatile, root-level stats)
│
├── docs/data/system-auditor-known-issues.json (dedup state: fingerprints of reported issues — volatile)
│
└── docs/data/code-janitor-known-findings.json (dedup state: fingerprints of known code findings — volatile)
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
| `.claude/knowledge/*.md` | Architect / claude-manager-helper | Logic or rule change |

## Drift Detection (System-Auditor)

On every run, verify:
1. `docs/data/tool-registry.json`.toolCount matches `grep -c registerTool src/interface/mcp/tools/*.ts`
2. `docs/data/cron-registry.json`.schedulerFileCount matches `ls src/scheduler/*Job.ts | wc -l`
3. No knowledge `.md` file contains hardcoded counts (numbers that should be in JSON)
4. All pointers in this tree resolve (target file exists)
