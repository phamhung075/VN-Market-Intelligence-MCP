# Bundle: Architect

<!-- size-justification: 132L — curated multi-source bundle (DDD rules + naming + QA + fail-loud patterns). Splitting would require cross-references defeating the single-load purpose. Bundle is read as unit by architect agent; splitting fragments cohesion. -->

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
├── docs/references/tree-map.md ← THIS FILE
│
├── docs/standards/mcp-tools.md (tool logic: per-agent mapping, signal types, renamed tools, mandatory patterns)
│   └── docs/data/tool-registry.json (tool list + count — volatile)
│
├── docs/standards/cron-jobs.md (scheduling logic: intelligence cycle steps, timing rules, token economy)
│   └── docs/data/cron-registry.json (job list + count — volatile)
│
├── docs/standards/portfolio-schema.md (position rules: ledger logic, stop-loss formula, TP ladder, analysis block format)
│   ├── docs/data/stock-classification.json (tickers, sectors, trade exposure, peers, reverse map — volatile)
│   └── mcp.config.json → alertPolicy (threshold values — volatile)
│
├── docs/policies/alert-policy.md (firing rules: position-danger, watchlist-opportunity, Commander exclusivity, cooldowns)
│   └── mcp.config.json → alertPolicy (threshold values — shared child with portfolio-schema)
│
├── docs/standards/telegram-commands.md (bot commands: 11 commands, /ask /why behavior, command routing)
│
├── docs/protocols/ask-queue-protocol.md (queue logic: FIFO flow, DB schema, escalation, failure protocol)
│
├── docs/references/kinh-dich-layer.md (hexagram rules: default layer, hao states, agent integration pattern)
│
├── docs/references/agent-roster.md (team structure: analysis 8 + dev 13, cooperation flow, signal bus)
│
├── docs/policies/dev-standards.md (DDD layer rules, coding standards, test template, commit format, branch hygiene)
│
├── docs/protocols/janitor-procedures.md (code janitor: canonical sources, scan checklist, output contract, state file)
│
├── docs/standards/market-analysis.md (causal cascade framework, impact scoring, trade maps, macro matrix, BCTC checklist)
│
├── docs/policies/qa-checklist.md (TDD/DDD/TS/security/data integrity checklist, MCP tool rules, task report template)
│
├── docs/protocols/fail-loud-protocol.md (failure handling: 5-step protocol — inlined in agents by design)
│
├── docs/policies/restart-policy.md (server restart: docker-compose only, 9 microservices, banned mechanisms, QA validation)
│
├── .claude/WORKFLOW.md (dev workflow: branch hygiene, merge checklist)
│
├── docs/ARCHITECTURE.md (system design: folder tree, data flow, VPS price proxy + BCTC PDF proxy)
│
├── docs/GLOSSARY_VI.md (Vietnamese financial terms)
│
├── docs/data/project-stats.json (sprint number, counts — volatile, root-level stats)
│
├── docs/data/system-auditor-known-issues.json (dedup state: fingerprints of reported issues — volatile)
│
├── docs/data/code-janitor-known-findings.json (dedup state: fingerprints of known code findings — volatile)
│
├── docs/data/orch/orch-state.json .task_board.archive[] (index of done tasks by sprint — v3 schema)
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
| `docs/policies/dev-standards.md` | Developer / Architect | After adding coding standards or layer rules |
| `docs/protocols/janitor-procedures.md` | Code-Janitor / Architect | After procedure change |
| `docs/standards/market-analysis.md` | Market-Analyst / BA | After cascade rule or BCTC checklist update |
| `docs/policies/qa-checklist.md` | QA / Architect | After QA rule change |
| `docs/{policies,protocols,standards,references}/*.md` (all others) | Architect / claude-manager-helper | Logic or rule change |

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

If any Read of `docs/{policies,protocols,standards,references}/*.md` fails (file missing, empty, <50 chars, or permission denied):
1. IMMEDIATELY `send_telegram(channel="work", message="[architect] Knowledge load failed: <filename> — <error detail>")`
2. `submit_feedback(severity="critical", title="Knowledge load failed: <filename>", agent="architect")`
3. STOP current cycle, return early
4. DO NOT fallback, guess, or continue with partial knowledge
5. DO NOT retry more than once

---

## Lazy-Load (read ONLY when task touches that area)

- Full tree-map rules (diamond DAG rules, drift detection) → `docs/references/tree-map.md`
- MCP tool surface (when designing tool-adding features) → `docs/standards/mcp-tools.md`
- Cron schedule (when designing scheduler features) → `docs/standards/cron-jobs.md`
- Feature schemas → `docs/standards/portfolio-schema.md`, `docs/policies/alert-policy.md`, `docs/protocols/ask-queue-protocol.md`
