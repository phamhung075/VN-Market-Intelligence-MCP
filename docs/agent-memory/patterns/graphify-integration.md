---
type: pattern
trigger: code-change, refactor, dependency-discovery
agents: developer, architect, ba, qa
---

# Graphify Integration for Developer Agents

**Purpose:** Use graphify queries to discover surprising code connections, identify affected areas, and avoid unintended coupling before making changes.

**When to invoke:**
- Planning a refactor or API change
- Modifying a god node (high-connectivity functions like `getMetricValue`, `parse_rss`, `parseHexagram`)
- Need to understand which files/functions depend on a module
- Validating that a "simple" change won't cascade across the codebase
- Exploring a new codebase area before touching it

---

## Quick Reference

### Query Syntax
```bash
# Find all nodes related to a concept
/graphify query "payments module dependencies"

# Check connections for a specific function
/graphify query "what does getMetricValue call"

# Trace impact of a change
/graphify query "if I modify alert-policy, what breaks"

# Explore an unfamiliar area
/graphify query "how does foreign flow calculation work"
```

### Interpret Results

**God Nodes** (top 10 most-connected functions):
- Higher edge count = more places depend on this
- Changes to god nodes have wide blast radius
- Always add extra test coverage before modifying

**Communities**:
- Nodes in same community are tightly related
- Surprising connections between communities = hidden coupling
- Mark these as tech debt to address

**Knowledge Gaps**:
- Isolated nodes (≤1 connection) = possibly undocumented
- Thin communities (2 nodes) = test-code pairs, may be fragile

---

## Integration Points

### Developer Agent (code implementation)
**Before implementing a task:**
1. Read `docs/handoffs/TASK_NNN.md` for known file paths
2. If task touches a god node or unfamiliar module: `/graphify query "how does [module] work"`
3. Review "Surprising Connections" section in report
4. If query returned unexpectedly wide dependencies: flag to Architect for impact assessment

**Example:**
```
Task 1400: Refactor getMetricValue() function
→ Query: "what calls getMetricValue and where"
→ Result: 3 edges, used in technical-analysis, market-watcher, kinh-dich-service
→ Decision: Needs backward-compatible API, add integration tests for each caller
```

### Architect Agent (design & brownfield analysis)
**Before proposing architectural changes:**
1. Baseline graph query: `/graphify query "overall architecture, modules, services"`
2. For high-risk areas: `/graphify query "dependencies in [module] — cascading impact"`
3. Use "Communities" section to propose module boundaries
4. Document decisions in `docs/handoffs/TASK_NNN.md` [Architect] section

**Example:**
```
Task 1401: Extract stock-price service
→ Query: "all functions and modules that calculate stock prices or fetch price data"
→ Review: Identify 2-3 god nodes (price fetch, aggregation, caching)
→ Decision: Group these into new microservice, update interface layer to call via HTTP
```

### BA Agent (requirements & edge cases)
**When discovering acceptance criteria:**
- Use graphify to understand existing behavior before writing new requirements
- Query: `/graphify query "how does [feature] currently work"`
- Document surprising connections as edge case constraints in REQ_*.md

### QA Agent (test coverage validation)
**After developer completes code:**
1. Check graphify for affected modules (god nodes, communities)
2. Verify test coverage includes all communities that were modified
3. Flag if untested god nodes were changed without proportional test additions

---

## Cache & Update Strategy

**Graph freshness:**
- `graphify-out/graph.json` = persistent cached graph across sessions
- Update after major refactors: `/graphify /path --update`
- Query without update (default): reuses cached graph, zero token cost

**When to rebuild:**
- After extracting a new microservice (file structure changed)
- After renaming core modules (paths shifted)
- After 100+ lines deleted/moved (architecture evolved)
- Weekly check in system-auditor cycle (ensure drift < 5% nodes)

**Incremental updates (recommended):**
```bash
# After code changes: update AST layer only (deterministic, no LLM)
/graphify . --update

# After docs changes: full rebuild if >20 files added/removed
/graphify . --update --mode deep

# Just rerun clustering on existing graph: no extraction
/graphify . --cluster-only
```

---

## God Node Alert

If your task modifies any of these functions, add 50% more test coverage:
1. `getMetricValue()` — TA indicator computation (affects price signals)
2. `parse_rss()` — News ingestion (affects sentiment chains)
3. `parseHexagram()` — Kinh Dich reading (affects macro signals)
4. `calcYoY()`, `calcQoQ()` — Financial deltas (affects BCTC analysis)
5. `fetch_with_browser()` — Playwright scraping (affects all geo-blocked VPS data)

**Example test addition:**
```typescript
// If modifying getMetricValue, add tests for:
- Each TA indicator (RSI, MACD, MA, BB)
- Each stock in watchlist
- Edge cases (missing data, NaN, infinity)
- Each call site (technical-analysis svc, market-watcher, kinh-dich-svc)
```

---

## Session Cache (Agent Memory)

After using graphify to make a decision, save to memory:
```bash
# Example append to agent session
append_session_record({
  agent_name: "developer",
  task_name: "Task 1401: Extract stock-price service",
  finding: "Graphify query found 2 god nodes (fetch_price, aggregate_prices) with 5 combined edges.",
  status: "Decision: Bundle into new microservice, update 3 call sites to use HTTP"
})
```

This prevents re-running the same query in future sessions on related tasks.

---

## Known Limitations

- **Graph only updated at human trigger** — if a developer modifies code locally without committing, graphify won't see it
- **Semantic extraction is expensive** — AST extraction (code only) is free; to add new docs/analysis, use `--mode deep` only on focused changes
- **Community detection has noise** — thin communities (2 nodes) = test-code pairs, not necessarily an architecture smell
- **God nodes identify high connectivity, not necessarily coupling** — a function can be popular because it's a utility (good design) or overloaded (bad design) — always review context

---

## Related

- Tree map: `.claude/knowledge/tree-map.md` (file DAG, ownership, update rules)
- Agent memory: `docs/agent-memory/AGENT_STARTUP.md` (how agents use memory)
- DDD violations pattern: `docs/agent-memory/patterns/DDD-violations.md` (architectural guardrails)
