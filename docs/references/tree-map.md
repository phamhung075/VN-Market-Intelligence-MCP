# Knowledge Tree Map — Canonical DAG

<!-- size-justification: 294L — the DAG SSOT itself. Splitting into "core rules" + "tree sections" + "flow splits" + "agent splits" would create chicken-and-egg circular references: every split child must register back to tree-map, and tree-map is the parent. Atomicity is required for pointer integrity gates. Self-referential SSOT cannot be cleanly split. -->

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
├── docs/references/workflow-map.md (index: 20 workflows, agent takes/writes, main-terminal rules)
│   └── docs/references/workflow-map-cycles.md (W5-W19: cron cowork, dev cycle, maintenance, demand-driven)
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
├── docs/standards/dockerfile-volume-policy.md (baked-asset placement: /opt/<service>-assets/ rule, named-volume shadow failure mode, code-review checklist — Sprint 1959 watchdog-9)
│
├── docs/protocols/ask-queue-protocol.md (queue logic: FIFO flow, DB schema, escalation, failure protocol)
│
├── docs/protocols/smart-compact-protocol.md (index: context management, hook thresholds, auto-compact)
│   ├── docs/protocols/smart-compact-protocol-hooks.md (iTerm2 auto-compact, sub-agent behavior, session targeting)
│   └── docs/protocols/smart-compact-protocol-offload.md (dev-team orchestration, state preservation, resume protocol)
│
├── docs/references/kinh-dich-layer.md (hexagram rules: default layer, hao states, agent integration pattern)
│
├── docs/references/agent-roster.md (team structure: analysis + dev + microservices, two-team architecture, three-channel rules, agent routing reference, cooperation flow, handoff protocol — counts in `docs/data/project-stats.json`)
│
├── docs/policies/dev-standards.md (DDD layer rules, coding standards, test template, commit format pointer, branch hygiene)
│   └── docs/policies/commit-convention.md (index: section-anchor redirects for `§ X` back-compat — children below)
│       ├── docs/policies/commit-convention-format.md (Format · Shell · Type vocab · Scope · Task ID · Trailers · AC style)
│       ├── docs/policies/commit-convention-exemptions.md (No-Sprint Rule · C3-Exempt · C2-Exempt)
│       └── docs/policies/commit-convention-examples.md (Worked Example · Merge Commits · Notebook Commits)
│
├── docs/protocols/janitor-procedures.md (code janitor: canonical sources, scan checklist, output contract, state file)
│
├── docs/standards/market-analysis.md (causal cascade framework, impact scoring, trade maps, macro matrix, BCTC checklist)
│   └── docs/standards/tnb-methodology.md (index: Báu 6-layer strategic framework)
│       ├── docs/standards/tnb-methodology-layers.md (Layers 1-3: data discipline, US/VN stacks)
│       └── docs/standards/tnb-methodology-valuation.md (Layers 4-6: 4-pillar valuation, 6-step decision, gaps)
│
├── docs/policies/qa-checklist.md (TDD/DDD/TS/security/data integrity checklist, MCP tool rules, task report template)
│
├── docs/policies/docs-organization.md (index: file placement quick-ref)
│   ├── docs/policies/docs-organization-location-table.md (canonical location table SSOT)
│   ├── docs/policies/docs-organization-decision-tree.md (decision tree by file type)
│   ├── docs/policies/docs-organization-examples.md (worked examples of placement)
│   └── docs/policies/docs-organization-enforcement.md (auto-file rules + archive purposes)
│
├── .claude/skills/token-economy/SKILL.md (agent-to-agent comms: 3-tier compression ULTRA/FULL/LITE inline; Parts 1-2 in children)
│   ├── .claude/skills/token-economy/policies.md (Part 1: 15 writing techniques, MCP task templates, quick workflow)
│   └── .claude/skills/token-economy/compress.md (Part 2: /compress command, CLI usage, compression rules)
│
├── .claude/skills/zone-detect/SKILL.md (zone→specialist routing: Tier-1/2/3 inference logic; zone table data → system-map.json#zones)
│
├── .claude/skills/system-map-query/SKILL.md (jq query patterns for system-map.json — load when agent needs service/agent/zone/channel/source/watchlist data)
│
├── .claude/skills/semble-search/SKILL.md (code search decision guide: when Semble vs Grep/Glob/Read)
│
├── .claude/skills/doc-heal-system/SKILL.md (full-subtree audit + auto-fix: tree-map DAG, SSOT, factory pointers — escalates semantic drift to architect)
│   ├── .claude/skills/doc-heal-system/phases.md (Phases 0-7: discover, pointer integrity, orphans, SSOT, size caps, dedup, memory, report)
│   └── .claude/skills/doc-heal-system/reference.md (Appendix A: skill factory template; Appendix B: discovery commands)
│
├── .claude/skills/doc-self-heal/SKILL.md (per-agent end-of-cycle doc fix: narrow scope, files touched this cycle only — companion to doc-heal-system)
│
├── docs/protocols/fail-loud-protocol.md (failure handling: 5-step protocol — inlined in agents by design)
│
├── docs/protocols/head-lock-self-cure.md (HEAD.lock recurrence guard: root-cause hypotheses, safe-remove algorithm, escalation tree, audit log format — dev-team Step 0-PREFLIGHT)
│   └── docs/architecture-briefs/2026-05-12-headlock-and-worktree-root-cause.md (unified RCA: HEAD.lock 5-cycle recurrence + SDK worktree orphan — 4 hypotheses, diagnostic plan, 7 c57+ tasks — ARCH-HEADLOCK-RCA-c56)
│
├── docs/protocols/bug-reporting-via-mcp.md (index: auto-dedup system for bug reports)
│   ├── docs/protocols/bug-reporting-capture.md (Phase 1: agent error detection + MCP tool call)
│   ├── docs/protocols/bug-reporting-routing.md (Phase 2: dedup logic + SQLite storage)
│   └── docs/protocols/bug-reporting-resolution.md (Phase 3: dev team processing + FAQ)
│
├── docs/policies/restart-policy.md (index: server restart rules)
│   ├── docs/policies/restart-policy-rationale.md (why docker-compose only)
│   ├── docs/policies/restart-policy-verification.md (health checks + QA validation)
│   └── docs/policies/restart-policy-troubleshooting.md (diagnostic steps + error recovery)
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
├── docs/ARCHITECTURE.md (architecture SSOT: 9-service overview, Docker topology, two-team arch, data flow, module boundaries + mcp.config.json section map, conflict resolutions — maintained by Architect)
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
│   ├── docs/guides/guide-lazy-load.md (index: L0-L4 load levels + anti-patterns)
│   │   └── docs/guides/guide-lazy-load-levels.md (L0-L4 definitions, token budgets, redundant re-fetch)
│   ├── docs/guides/guide-agent-definition.md (index: YAML sections routing table)
│   │   ├── docs/guides/guide-agent-definition-frontmatter.md (YAML frontmatter, identity, domain sections)
│   │   ├── docs/guides/guide-agent-definition-zone-ownership.md (document zone, registry, tools package)
│   │   ├── docs/guides/guide-agent-definition-permissions-constraints.md (permissions, constraints, boundary rules)
│   │   ├── docs/guides/guide-agent-definition-knowledge-signals.md (knowledge loading, signals, inter-agent comms, KLFL)
│   │   └── docs/guides/guide-agent-definition-flow-memory.md (flow assignment, memory config)
│   ├── docs/guides/guide-flows.md (Section 6: cowork & dev flow templates, patterns)
│   ├── docs/guides/guide-agent-ops.md (index: Sections 7-12 operations)
│   │   ├── docs/guides/guide-agent-ops-memory.md (Sections 7-8: notebook & cross-team awareness)
│   │   └── docs/guides/guide-agent-ops-maintenance.md (Sections 9-12: reports, maintenance, registry, responsibility)
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
├── docs/data/project-stats.json (sprint number, test counts — volatile, sprint-cycle state)
│
├── docs/data/system-map.json (structural SSOT — services, agents, tools, crons, zones, channels, data_sources, watchlist — query via jq; skill: .claude/skills/system-map-query/SKILL.md)
│
├── docs/data/system-auditor-known-issues.json (dedup state: fingerprints of reported issues — volatile)
│
├── docs/data/code-janitor-known-findings.json (dedup state: fingerprints of known code findings — volatile)
│
└── docs/TASKS_ARCHIVE.md (index of done tasks by sprint)
```

## Zone-Scan Flow (Zone Empowerment — 2026-05-12)

Shared proactive scan flow used weekly by all 9 dev-* specialists:

```
.claude/flows/developer/zone-scan.md (shared weekly zone-scan — stale imports, test ratio, doc drift)
  → emits docs/signals/zone-scan-<service>-<ts>.json (type: zone_health_report, to: po)
  → po triage-signals.md handles zone_health_report signals
```

---

## Flow File Splits (Wave 2A)

Children created by zone-enforcement-and-split-policy brief — thin dispatcher parent + sibling sub-flows:

```
.claude/flows/tran-ngoc-bau/main.md (thin dispatcher — 23L)
│   ├── .claude/flows/tran-ngoc-bau/bootstrap.md (Steps 0a-0c: project root, notebook, handoff ACK, bootstrap)
│   ├── .claude/flows/tran-ngoc-bau/audit-market.md (Phase 1-2: MARKET audit + cross-validate + notebook review)
│   ├── .claude/flows/tran-ngoc-bau/audit-methodology.md (Phase 2.5: 9-step Báu methodology scoring)
│   ├── .claude/flows/tran-ngoc-bau/audit-signals.md (Phase 3: signal bus audit + confidence + dedup)
│   └── .claude/flows/tran-ngoc-bau/auto-cure-and-handoff.md (Phase 4: auto-cure + report + notebook + PO handoff)
│
.claude/flows/news-scout/cycle.md (thin dispatcher — 23L)
│   ├── .claude/flows/news-scout/stage-bootstrap.md (Stage 0: bootstrap + regime + feedback hints)
│   ├── .claude/flows/news-scout/stage-fetch.md (Stage 1: fetch_and_analyze + historical context)
│   ├── .claude/flows/news-scout/stage-sentiment.md (Stage 2: sentiment scoring + PMI + regime multiplier)
│   ├── .claude/flows/news-scout/stage-signals.md (Stage 3: post urgent_news + chain_catalyst signals)
│   └── .claude/flows/news-scout/stage-log-notify.md (Stage 4-5: session log + WORK channel + Batch 2)
│
.claude/flows/ops/cloudflare-mcp.md (thin dispatcher — 20L)
│   ├── .claude/flows/ops/cloudflare-mcp-diagnosis.md (3-layer diagnosis + 4 root causes + per-issue fixes)
│   └── .claude/flows/ops/cloudflare-mcp-recovery.md (step-by-step recovery + escalation + notebook entry)
```

## Agent File Splits (Wave 2A)

Children created by zone-enforcement-and-split-policy brief — lazy-loaded from parent agent on trigger:

```
.claude/agents/agents-architect.md (parent)
│   └── docs/agents/agents-architect/handlers.md (brief-commit invariant + operating cycle)
│
.claude/agents/ops.md (parent)
│   └── docs/agents/ops/handlers.md (Step 0-b bootstrap errors + flow catalog + inter-agent routing)
│
.claude/agents/agent-father.md (parent)
│   └── docs/agents/agent-father/knowledge.md (full lazy_load policy — guide parts + non-guide)
│
.claude/agents/dev-mcp-server.md (parent)
│   └── docs/agents/dev-mcp-server/knowledge.md (lazy_load table + Step 0-b handler + doc_maintenance rules)
```

## Agent File Splits (Wave 3A)

Children created by zone-enforcement-and-split-policy brief Wave 3A — lazy-loaded from parent agent on trigger:

```
.claude/agents/market-watcher.md (parent — 109L after split)
│   └── docs/agents/market-watcher/knowledge.md (channel routing rules, signals, schedule crons, watch thresholds)
│
.claude/agents/dev-alert-engine.md (parent — 122L + justification header)
│   └── docs/agents/dev-alert-engine/knowledge.md (doc_maintenance rules + full lazy_load table)
│
.claude/agents/dev-pdf-extractor.md (parent — 124L + justification header)
│   └── docs/agents/dev-pdf-extractor/knowledge.md (doc_maintenance rules + full lazy_load table)
│
.claude/agents/dev-kinh-dich.md (parent — 122L + justification header)
│   └── docs/agents/dev-kinh-dich/knowledge.md (doc_maintenance rules + full lazy_load table)
```

## Flow File Splits (Wave 3A)

Children created by zone-enforcement-and-split-policy brief Wave 3A — thin dispatcher parent + sibling sub-flows:

```
.claude/flows/financial-analyst/cycle.md (thin dispatcher — 20L)
│   ├── .claude/flows/financial-analyst/stage-bootstrap.md (Steps 0-0b: bootstrap + regime)
│   ├── .claude/flows/financial-analyst/stage-analyze.md (Steps 1-4b: BCTC + EY spread + Layer 7/8 + chain validation + signal feedback)
│   └── .claude/flows/financial-analyst/stage-log-notify.md (Steps 5-5b: notebook + WORK + deadline watch)
│
.claude/flows/agent-father/edit.md (thin dispatcher — 22L)
│   ├── .claude/flows/agent-father/edit-prepare.md (Steps 0a-4: validate + read + guide lookup + edit plan)
│   └── .claude/flows/agent-father/edit-apply.md (Steps 5-8: apply edits + cascade + validate + diff + notebook + RETURN)
│
.claude/flows/alert-commander/cycle.md (thin dispatcher — 20L)
│   ├── .claude/flows/alert-commander/stage-bootstrap.md (Steps 0-2: bootstrap + regime + context + legal/crisis)
│   ├── .claude/flows/alert-commander/stage-signals.md (Steps 3-3c: signal matrix + price-validation override + chain_catalyst routing)
│   └── .claude/flows/alert-commander/stage-dispatch-log.md (Steps 4a-5: MARKET dispatch + verdict + WORK + notebook + firing rules + value investor mode)
│
.claude/flows/unified-agent/market.md (thin dispatcher — 21L)
│   ├── .claude/flows/unified-agent/market-bootstrap.md (Steps 0-1: bootstrap + regime + system health)
│   ├── .claude/flows/unified-agent/market-analysis.md (Steps 2-6: intelligence + portfolio + domain + pillar coverage + WORK)
│   └── .claude/flows/unified-agent/market-events-log.md (special event triggers + conviction shift + notebook commit)
│
.claude/flows/agent-father/review.md (thin dispatcher — 22L)
│   ├── .claude/flows/agent-father/review-setup.md (Steps 0a-2: build agent list + load 15-check compliance matrix)
│   └── .claude/flows/agent-father/review-execute.md (Steps 3-6: per-agent checks + cross-agent consistency + report + rank + notebook + RETURN)
│
.claude/flows/ops/data-validation.md (thin dispatcher — 22L)
│   ├── .claude/flows/ops/data-validation-checks.md (Steps 1-4: VPS dry-run + pipeline health + freshness + classify)
│   └── .claude/flows/ops/data-validation-report.md (Steps 5-6: bug report + return + PO handoff)
```

## Flow File Splits (Wave 3B — 2026-05-12)

Workflow-map autonomy fixes — extract reusable sub-flows so multiple callers don't duplicate logic:

```
.claude/flows/po/channel-audit.md (Steps 0/0-a2/0-b only — 103L)
│   └── .claude/flows/po/zone-routing.md (Step A zone inference table + Step B zone-health notebook scan — reusable by triage-signals.md, sprint-kickoff.md too — 60L)

.claude/skills/dispatch/SKILL.md (slimmed 141L → 97L)
│   ├── Cowork Signal Bus details → `docs/standards/mcp-tools.md` § Signal Bus
│   ├── Telegram channel matrix → `docs/policies/alert-policy.md`
│   ├── Non-Negotiables details → `docs/policies/dev-standards.md` + `docs/protocols/agent-chaining-protocol.md`
│   └── File Placement details → `docs/references/tree-map.md` (this file)
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
| `docs/data/system-map.json` | Developer / PM / System-Auditor | Service/agent/zone/channel/source/watchlist change — primary SSOT |
| `docs/data/tool-registry.json` | Developer | After adding/removing MCP tool — also update system-map.json |
| `docs/data/cron-registry.json` | Developer | After adding/removing scheduler — also update system-map.json |
| `docs/data/stock-classification.json` | Market-Analyst / PO | Watchlist change → also update system-map.json watchlist[] |
| `docs/data/project-stats.json` | PM / System-Auditor | Sprint start/end, test count change (sprint-volatile state only) |
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
| `docs/standards/dockerfile-volume-policy.md` | Architect | After new named-volume pattern or shadow failure mode discovered |
| `docs/{policies,protocols,standards,references}/*.md` (all others) | Architect / claude-manager-helper | Logic or rule change |
| `docs/guides/guide-*.md` | Agent Father / Architect | Guide section update |
| `docs/ARCHITECTURE.md` | Architect | After service topology or conflict resolution change |
| `docs/architecture/microservice/<service>.md` | dev-<service> (sole committer) | After code change alters behavior, API, schema, or config — Architect routes doc subtask to dev-* via signal, never writes directly |

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
1. `docs/data/system-map.json` mcp-server tools[] length matches `curl -s http://127.0.0.1:3000/health | jq .toolCount`
2. `docs/data/system-map.json` mcp-server crons[] length matches `docs/data/cron-registry.json`.schedulerFileCount
3. `docs/data/tool-registry.json`.toolCount matches system-map.json tools[] length
4. No knowledge `.md` file contains hardcoded counts (numbers that should be in JSON)
5. All pointers in this tree resolve (target file exists)

**jq shortcuts:**
```bash
jq '.project.microservices[] | select(.id=="mcp-server") | {tools: (.tools|length), crons: (.crons|length)}' docs/data/system-map.json
jq '[.project.agents[] | .type] | group_by(.) | map({type: .[0], count: length})' docs/data/system-map.json
```
