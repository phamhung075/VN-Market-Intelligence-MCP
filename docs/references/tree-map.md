# Knowledge Tree Map — Canonical DAG

**Load when:** before any lazy-load, file creation, or knowledge maintenance. This is the single source of truth for the file dependency graph.

## Rules

1. **CLAUDE.md is root.** All paths start from CLAUDE.md pointers.
2. **Parent → child only.** Never child → parent. No circular references.
3. **Multiple parents may share a child.** Diamond dependencies OK.
4. **`docs/{policies,protocols,standards,references}/*.md`** = logic, rules, how-to. Stable. Agents read, rarely write.
5. **`docs/data/*.json`** = volatile data (counts, lists, stats). Agents read AND write during work.
6. **JSON never in `.claude/`.** Always in `docs/data/`.
7. **MD never contains volatile counts/lists** — point to JSON child instead.
8. **All lazy-load pointers must follow this tree.** No ad-hoc file references.

## Tree

```
CLAUDE.md (root — always loaded)
│
├── docs/references/tree-map.md ← THIS FILE
│
├── docs/references/agent-routing.md (pointer + procedural-prompt rule + routing principles; intent table SSOT in .claude/skills/dispatch/SKILL.md)
│
├── docs/references/workflow-map.md (vector chart: 20 workflows W1–W20, agent take/produce table, main-terminal do/never; load for end-to-end view)
│
├── docs/protocols/agent-chaining-protocol.md (chaining rules: pipeline maps, return templates, parallel spawn rules, fixer ceiling, cross-team signal directory)
│   ├── docs/pipeline-state.json (pipeline status: current sprint, active task, next agent — volatile, dev-team internal only)
│   ├── docs/signals/*.json (cross-team signal files: cowork→dev-team, drained at Step 0a — volatile)
│   ├── docs/signals/processed/*.json (treated signals with processedAt/result metadata — auto-pruned after 7 days)
│   └── docs/signals/signals.db (dedup index: signals_processed table — SQLite SSOT, O(log N) fingerprint lookup — sole writer: dev-team Step 0a)
│
├── docs/standards/mcp-tools.md (tool logic: per-agent mapping, signal types, renamed tools, mandatory patterns)
│   └── docs/data/project-stats.json (tool count + master stats file — volatile)
│
├── docs/standards/cron-jobs.md (scheduling logic: intelligence cycle steps, timing rules, token economy)
│   └── docs/data/cron-registry.json (job list + count — volatile)
│
├── docs/standards/portfolio-schema.md (position rules: ledger logic, stop-loss formula, TP ladder, analysis block format)
│   ├── docs/data/stock-classification.json (tickers, sectors, trade exposure, peers, reverse map — volatile)
│   └── mcp.config.json → alertPolicy (threshold values — volatile)
│
├── docs/policies/alert-policy.md (firing rules: position-danger, watchlist-opportunity, Commander exclusivity, cooldowns, signal verdict lifecycle)
│   ├── mcp.config.json → alertPolicy (threshold values — shared child with portfolio-schema)
│   ├── apps/mcp-server/src/scheduler/alerts/verdictResolutionJob.ts (hourly verdict resolver: pending→confirmed|false_positive, 24h guard, 30d TTL pruning, fail-loud — Task 1863)
│   └── docs/data/alert-verdicts.json (aggregate verdict outcome stats — volatile)
│
├── docs/standards/telegram-commands.md (bot commands: 11 commands, /ask /why behavior, command routing)
│
├── docs/protocols/ask-queue-protocol.md (queue logic: FIFO flow, DB schema, escalation, failure protocol)
│
├── docs/references/kinh-dich-layer.md (hexagram rules: default layer, hao states, agent integration pattern)
│
├── docs/references/agent-roster.md (team structure: analysis + dev + microservices, two-team architecture, three-channel rules, agent routing reference, cooperation flow, handoff protocol — counts in `docs/data/project-stats.json`)
│
├── docs/policies/dev-standards.md (DDD layer rules, coding standards, test template, commit format pointer, branch hygiene)
│   └── docs/policies/commit-convention.md (commit format SSOT: type vocabulary, sprint/area scope, task-id, trailers, worked example, no-sprint rule)
│
├── docs/protocols/janitor-procedures.md (code janitor: canonical sources, scan checklist, output contract, state file)
│
├── docs/standards/market-analysis.md (causal cascade framework, impact scoring, trade maps, macro matrix, BCTC checklist)
│   └── docs/standards/tnb-methodology.md (Báu strategic framework SSOT: monthly>quarterly, state transitions, US/VN stacks, 4-pillar valuation, 6-step decision tree, gap catalogue)
│
├── docs/policies/qa-checklist.md (TDD/DDD/TS/security/data integrity checklist, MCP tool rules, task report template)
│
├── .claude/skills/token-economy/SKILL.md Part 3 (agent-to-agent comms: 3-tier compression ULTRA/FULL/LITE — merged into skill, no separate knowledge file)
│
├── .claude/skills/semble-search/SKILL.md (code search decision guide: when Semble vs Grep/Glob/Read)
│
├── .claude/skills/doc-heal-system/SKILL.md (full-subtree audit + auto-fix: tree-map DAG, SSOT, factory pointers, no-hardcode rule — escalates semantic drift to architect)
│
├── .claude/skills/doc-self-heal/SKILL.md (per-agent end-of-cycle doc fix: narrow scope, files touched this cycle only — companion to doc-heal-system)
│
├── docs/protocols/fail-loud-protocol.md (failure handling: 5-step protocol — inlined in agents by design)
│
├── docs/policies/restart-policy.md (server restart: docker-compose only, 9 microservices, banned mechanisms, QA validation)
│
├── docs/protocols/ops-incident-response.md (index: severity classification, runbook routing)
│   ├── docs/protocols/ops-incident-response-p1-critical.md (P1 Purple/Red: data risk + cascade failure playbooks)
│   ├── docs/protocols/ops-incident-response-p2-degradation.md (P2 Yellow: single service + deployment playbooks)
│   └── docs/protocols/ops-incident-response-decision-tree.md (decision matrix + escalation rules)
│
├── docs/references/vps-setup.md (index: Vinahost connection, service & endpoint routing)
│   ├── docs/references/vps-setup-services.md (5 fetch services: price, BCTC, news, FX, foreign flow)
│   ├── docs/references/vps-setup-endpoints.md (local POST endpoints: prices, BCTC, news, FX)
│   └── docs/references/vps-setup-deployment.md (deployment, monitoring, recovery, cost optimization)
│
├── .claude/WORKFLOW.md (dev workflow: branch hygiene, merge checklist)
│
├── docs/ARCHITECTURE.md (module boundaries + mcp.config.json section map — preserved reference)
│
├── docs/architecture/global.md (architecture SSOT: 9-service overview, Docker topology, two-team arch, data flow, conflict resolutions — maintained by Architect)
│   ├── docs/architecture/1838a-repository-pattern.md (task reference: repository pattern architecture)
│   ├── docs/architecture/1842a-backtesting-engine.md (task reference: backtesting engine design)
│   ├── docs/architecture/microservice/mcp-server.md (mcp-server DDD layers, scheduler pointer, tool surface index)
│   │   ├── docs/architecture/microservice/mcp-server/domain-model.md
│   │   ├── docs/architecture/microservice/mcp-server/usecases.md
│   │   ├── docs/architecture/microservice/mcp-server/infrastructure.md
│   │   ├── docs/architecture/microservice/mcp-server/testing.md
│   │   ├── docs/architecture/microservice/mcp-server/alerts.md (tool group: alerting, monitoring, signal dispatch)
│   │   ├── docs/architecture/microservice/mcp-server/analysis.md (tool group: TA, pattern detection)
│   │   ├── docs/architecture/microservice/mcp-server/backtesting.md (tool group: strategy backtesting)
│   │   ├── docs/architecture/microservice/mcp-server/briefings.md (tool group: daily/weekly briefing generation)
│   │   ├── docs/architecture/microservice/mcp-server/financial-reports.md (tool group: BCTC/financial data)
│   │   ├── docs/architecture/microservice/mcp-server/kinhdich.md (tool group: Kinh Dich hexagrams)
│   │   ├── docs/architecture/microservice/mcp-server/macro.md (tool group: macro indicators)
│   │   ├── docs/architecture/microservice/mcp-server/market-data.md (tool group: realtime HOSE/HNX/UPCOM quotes)
│   │   ├── docs/architecture/microservice/mcp-server/news-analysis.md (tool group: sentiment, timeline, NVL)
│   │   ├── docs/architecture/microservice/mcp-server/portfolio.md (tool group: position tracking, P&L)
│   │   └── docs/architecture/microservice/mcp-server/sector.md (tool group: sector rotations, peer analytics)
│   ├── docs/architecture/microservice/api-gateway.md (HTTP/gRPC reverse proxy, service routing, auth)
│   │   ├── docs/architecture/microservice/api-gateway/domain-model.md
│   │   ├── docs/architecture/microservice/api-gateway/usecases.md
│   │   ├── docs/architecture/microservice/api-gateway/infrastructure.md
│   │   ├── docs/architecture/microservice/api-gateway/api-reference.md
│   │   └── docs/architecture/microservice/api-gateway/testing.md
│   ├── docs/architecture/microservice/stock-price.md (realtime price aggregator, multi-exchange feed)
│   │   ├── docs/architecture/microservice/stock-price/domain-model.md
│   │   ├── docs/architecture/microservice/stock-price/usecases.md
│   │   ├── docs/architecture/microservice/stock-price/infrastructure.md
│   │   ├── docs/architecture/microservice/stock-price/api-reference.md
│   │   └── docs/architecture/microservice/stock-price/testing.md
│   ├── docs/architecture/microservice/pdf-extractor.md (BCTC/report PDF → structured data via OCR)
│   │   ├── docs/architecture/microservice/pdf-extractor/domain-model.md
│   │   ├── docs/architecture/microservice/pdf-extractor/usecases.md
│   │   ├── docs/architecture/microservice/pdf-extractor/infrastructure.md
│   │   ├── docs/architecture/microservice/pdf-extractor/api-reference.md
│   │   └── docs/architecture/microservice/pdf-extractor/testing.md
│   ├── docs/architecture/microservice/rag-service.md (semantic search, embeddings, VectorDB)
│   │   ├── docs/architecture/microservice/rag-service/domain-model.md
│   │   ├── docs/architecture/microservice/rag-service/usecases.md
│   │   ├── docs/architecture/microservice/rag-service/infrastructure.md
│   │   ├── docs/architecture/microservice/rag-service/api-reference.md
│   │   └── docs/architecture/microservice/rag-service/testing.md
│   ├── docs/architecture/microservice/technical-analysis.md (Python TA-Lib wrapper, indicator compute)
│   │   ├── docs/architecture/microservice/technical-analysis/domain-model.md
│   │   ├── docs/architecture/microservice/technical-analysis/usecases.md
│   │   ├── docs/architecture/microservice/technical-analysis/infrastructure.md
│   │   ├── docs/architecture/microservice/technical-analysis/api-reference.md
│   │   └── docs/architecture/microservice/technical-analysis/testing.md
│   ├── docs/architecture/microservice/macro-indicators.md (macro + sentiment aggregator)
│   │   ├── docs/architecture/microservice/macro-indicators/domain-model.md
│   │   ├── docs/architecture/microservice/macro-indicators/usecases.md
│   │   ├── docs/architecture/microservice/macro-indicators/infrastructure.md
│   │   ├── docs/architecture/microservice/macro-indicators/api-reference.md
│   │   └── docs/architecture/microservice/macro-indicators/testing.md
│   ├── docs/architecture/microservice/kinh-dich.md (hexagram generation, state machine, layer dispatch)
│   │   ├── docs/architecture/microservice/kinh-dich/domain-model.md
│   │   ├── docs/architecture/microservice/kinh-dich/usecases.md
│   │   ├── docs/architecture/microservice/kinh-dich/infrastructure.md
│   │   ├── docs/architecture/microservice/kinh-dich/api-reference.md
│   │   └── docs/architecture/microservice/kinh-dich/testing.md
│   └── docs/architecture/microservice/alert-engine.md (verdict resolver, cooldown, signal filtering)
│       ├── docs/architecture/microservice/alert-engine/domain-model.md
│       ├── docs/architecture/microservice/alert-engine/usecases.md
│       ├── docs/architecture/microservice/alert-engine/infrastructure.md
│       ├── docs/architecture/microservice/alert-engine/api-reference.md
│       └── docs/architecture/microservice/alert-engine/testing.md
│
├── docs/AGENT_CREATION_GUIDE.md (agent creation index — always loaded by agent-father)
│   ├── docs/guides/guide-zones.md (Sections 2-3: Two-Zone Folder Design + Per-Agent File Map)
│   ├── docs/guides/guide-lazy-load.md (Section 4: Lazy-Load Protocol + Token Economy)
│   ├── docs/guides/guide-agent-definition.md (index: YAML sections routing table)
│   │   ├── docs/guides/guide-agent-definition-frontmatter.md (YAML frontmatter, identity, domain sections)
│   │   ├── docs/guides/guide-agent-definition-zone-ownership.md (document zone, registry, tools package)
│   │   ├── docs/guides/guide-agent-definition-permissions-constraints.md (permissions, constraints, boundary rules)
│   │   ├── docs/guides/guide-agent-definition-knowledge-signals.md (knowledge loading, signals, inter-agent comms, KLFL)
│   │   └── docs/guides/guide-agent-definition-flow-memory.md (flow assignment, memory config)
│   ├── docs/guides/guide-flows.md (Section 6: Flow File Templates — cowork + dev)
│   ├── docs/guides/guide-agent-ops.md (Sections 7-12: Notebook, Cross-Team, Reports, Maintenance, Registry, Responsibility)
│   ├── docs/guides/guide-error-signals.md (Sections 13-14: Error Boundary + Signal Bus)
│   ├── docs/guides/guide-skills-registration.md (Sections 15-16: Skills Catalog + Registration Checklist)
│   └── docs/guides/guide-quality.md (index: 6-layer quality framework)
│       ├── docs/guides/guide-quality-layers.md (Layer 0: graceful degradation + error handling)
│       ├── docs/guides/guide-quality-validation.md (Layers 1-2: grounding + pre-send validation)
│       ├── docs/guides/guide-quality-confidence.md (Layers 3-4: confidence scoring + decision trace)
│       └── docs/guides/guide-quality-review.md (Layer 5: self-review + flow integration)
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

## Agent File Splits (Wave 2A)

Children created by zone-enforcement-and-split-policy brief — lazy-loaded from parent agent on trigger:

```
.claude/agents/agents-architect.md (parent)
│   └── .claude/agents/agents-architect/handlers.md (brief-commit invariant + operating cycle)
│
.claude/agents/ops.md (parent)
│   └── .claude/agents/ops/handlers.md (Step 0-b bootstrap errors + flow catalog + inter-agent routing)
│
.claude/agents/agent-father.md (parent)
│   └── .claude/agents/agent-father/knowledge.md (full lazy_load policy — guide parts + non-guide)
│
.claude/agents/dev-mcp-server.md (parent)
│   └── .claude/agents/dev-mcp-server/knowledge.md (lazy_load table + Step 0-b handler + doc_maintenance rules)
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
| `docs/signals/signals.db` | dev-team flow (Step 0a) — sole writer; all other agents read-only | Each drain cycle (INSERT + DELETE prune) |
| `docs/data/tool-registry.json` | Developer | After adding/removing MCP tool |
| `docs/data/cron-registry.json` | Developer | After adding/removing scheduler |
| `docs/data/stock-classification.json` | Market-Analyst / PO | Watchlist change, sector update |
| `docs/data/project-stats.json` | PM / System-Auditor | Sprint start/end, count change |
| `docs/data/system-auditor-known-issues.json` | System-Auditor | Each audit run |
| `docs/data/code-janitor-known-findings.json` | Code-Janitor | Each janitor run |
| `mcp.config.json` | Developer | Threshold tuning |
| `docs/policies/dev-standards.md` | Developer / Architect | After adding coding standards or layer rules |
| `docs/policies/commit-convention.md` | Developer / Architect | Commit format change |
| `docs/protocols/janitor-procedures.md` | Code-Janitor / Architect | After procedure change |
| `docs/standards/market-analysis.md` | Market-Analyst / BA | After cascade rule or BCTC checklist update |
| `docs/standards/tnb-methodology.md` | Tran-Ngoc-Bau / Architect | After Báu framework refinement or new methodology gap pattern catalogued |
| `docs/policies/qa-checklist.md` | QA / Architect | After QA rule change |
| `docs/protocols/ops-incident-response.md` | Ops / DevOps Lead | After incident discovery or procedure update |
| `docs/references/vps-setup.md` | Ops / DevOps Lead | After VPS config change or new service |
| `docs/{policies,protocols,standards,references}/*.md` (all others) | Architect / claude-manager-helper | Logic or rule change |
| `docs/guides/guide-*.md` | Agent Father / Architect | Guide section update |
| `docs/architecture/global.md` | Architect | After service topology or conflict resolution change |
| `docs/architecture/microservice/<service>.md` | Architect | After service-level design change |

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
