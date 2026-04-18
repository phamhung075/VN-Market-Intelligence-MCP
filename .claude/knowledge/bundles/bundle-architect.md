# Bundle: Architect

One call, all always-needed rules. Load this instead of dev-standards.md + tree-map.md + qa-checklist.md + fail-loud-protocol.md separately.

---

## DDD Layer Rules

| Building | Layer | Folder |
|----------|-------|--------|
| Business rule / pure calculation | **domain** | `src/domain/services/` |
| Data model / entity | **domain** | `src/domain/models/` |
| Repository interface (port) | **domain** | `src/domain/repositories/` |
| SQLite or LanceDB access | **infrastructure** | `src/infrastructure/db/` or `rag/` |
| HTTP scraper / fetcher | **infrastructure** | `src/infrastructure/fetchers/` |
| Orchestrating multiple services | **application** | `src/application/usecases/` |
| MCP tool handler | **interface** | `src/interface/mcp/tools/` |
| Cron job | **interface** | `src/interface/scheduler/` |

**Golden rule**: `domain/` has ZERO imports from `infrastructure/`.

---

## Knowledge Tree (canonical DAG)

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
├── .claude/knowledge/dev-standards.md (DDD layer rules, coding standards, test template, commit format, branch hygiene)
│
├── .claude/knowledge/janitor-procedures.md (code janitor: canonical sources, scan checklist, output contract, state file)
│
├── .claude/knowledge/market-analysis.md (causal cascade framework, impact scoring, trade maps, macro matrix, BCTC checklist)
│
├── .claude/knowledge/qa-checklist.md (TDD/DDD/TS/security/data integrity checklist, MCP tool rules, task report template)
│
├── .claude/knowledge/fail-loud-protocol.md (failure handling: 5-step protocol — inlined in agents by design)
│
├── .claude/knowledge/restart-policy.md (server restart: launchctl only, banned mechanisms, QA validation)
│
├── .claude/WORKFLOW.md (dev workflow: branch hygiene, merge checklist)
│
├── docs/ARCHITECTURE.md (system design: folder tree, data flow, VPS price proxy + BCTC PDF proxy)
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
├── docs/data/code-janitor-known-findings.json (dedup state: fingerprints of known code findings — volatile)
│
├── docs/TASKS_ARCHIVE.md (index of done tasks by sprint)
├── docs/archive/sprints-*.md (archived sprint task blocks — read-only history)
│
└── docs/historical/ (read-only reference, no maintenance required)
```

---

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
| `.claude/knowledge/*.md` (all others) | Architect / claude-manager-helper | Logic or rule change |

---

## Security Checklist

- No hardcoded credentials or API keys
- All SQL uses parameterized queries
- PDF file paths validated — no `../` traversal
- HTTP scrapers: rate limiting / exponential backoff on 429/503
- HTTP fetchers: browser User-Agent + multi-tier fallback + `!httpClient` guard
- Telegram: plain text format, Vietnamese language
- All MCP tool inputs validated with Zod schemas
- `Bun.env` only — never `process.env`

---

## KNOWLEDGE LOAD FAILURE PROTOCOL

If any Read of `.claude/knowledge/*.md` fails (file missing, empty, <50 chars, or permission denied):
1. IMMEDIATELY `send_telegram(channel="work", message="[architect] Knowledge load failed: <filename> — <error detail>")`
2. `submit_feedback(severity="critical", title="Knowledge load failed: <filename>", agent="architect")`
3. STOP current cycle, return early
4. DO NOT fallback, guess, or continue with partial knowledge
5. DO NOT retry more than once

---

## Lazy-Load (read ONLY when task touches that area)

- Full tree-map rules (diamond DAG rules, drift detection) → `.claude/knowledge/tree-map.md`
- MCP tool surface (when designing tool-adding features) → `.claude/knowledge/mcp-tools.md`
- Cron schedule (when designing scheduler features) → `.claude/knowledge/cron-jobs.md`
- Feature schemas → `.claude/knowledge/portfolio-schema.md`, `.claude/knowledge/alert-policy.md`, `.claude/knowledge/ask-queue-protocol.md`
