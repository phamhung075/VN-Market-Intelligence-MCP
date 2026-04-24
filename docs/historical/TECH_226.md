# TECH-226: Cowork Performance — Agent Merge, Bootstrap Tool, Direct MCP Access

status: APPROVED_BY_ARCHITECT
req_ref: REQ-226
sprint: 226

---

## Brownfield Impact

| Category | Files |
|----------|-------|
| Modified | `cowork-analysis-vnmarket-team/01-news-scout.md`, `cowork-analysis-vnmarket-team/04-market-watcher.md`, `cowork-analysis-vnmarket-team/05-alert-commander.md`, `cowork-analysis-vnmarket-team/07-qa-responder.md`, `cowork-analysis-vnmarket-team/unified-agent.md` |
| Created | `cowork-analysis-vnmarket-team/02-financial-analyst.md`, `cowork-analysis-vnmarket-team/06-digest-predict.md`, `src/interface/mcp/tools/system/cycleBootstrapTool.ts`, `src/application/useCases/getCycleBootstrap.ts` |
| Deleted | `cowork-analysis-vnmarket-team/02-bctc-collector.md`, `cowork-analysis-vnmarket-team/03-report-analyzer.md`, `cowork-analysis-vnmarket-team/08-prediction-synthesizer.md` |
| Volatile data | `docs/data/tool-registry.json`, `docs/data/project-stats.json` |
| Knowledge | `.claude/knowledge/agent-roster.md`, `.claude/knowledge/mcp-tools.md` |
| Breaking changes | No — signal type `fundamental_validation` unchanged; downstream agents unaffected |

---

## Architecture Decision

`get_cycle_bootstrap` is implemented as a **compound tool** in the interface layer (pattern established by `get_market_context` in `marketContextTools.ts`) with a thin use-case delegate in application layer for parallel orchestration. The use case calls three existing MCP handler functions directly via their underlying application/infra functions — NOT via HTTP self-call — to avoid loopback latency and respect DDD layering. All agent .md merges are pure interface-layer changes (no TypeScript).

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| `getCycleBootstrap` use case | application | `src/application/useCases/getCycleBootstrap.ts` | NEW |
| `registerCycleBootstrapTool` | interface | `src/interface/mcp/tools/system/cycleBootstrapTool.ts` | NEW |
| Tool registry entry | interface | `src/interface/mcp/tools/registry.ts` | MODIFY |
| `02-financial-analyst.md` | interface (agent) | `cowork-analysis-vnmarket-team/02-financial-analyst.md` | NEW |
| `06-digest-predict.md` | interface (agent) | `cowork-analysis-vnmarket-team/06-digest-predict.md` | NEW |
| All 7 agent .md files | interface (agent) | `cowork-analysis-vnmarket-team/*.md` | MODIFY |
| `agent-roster.md` | knowledge | `.claude/knowledge/agent-roster.md` | MODIFY |
| `mcp-tools.md` Tools-Per-Agent table | knowledge | `.claude/knowledge/mcp-tools.md` | MODIFY |
| `tool-registry.json` | volatile data | `docs/data/tool-registry.json` | MODIFY |
| `project-stats.json` | volatile data | `docs/data/project-stats.json` | MODIFY |

---

## Interface Contracts

### `getCycleBootstrap` use case

```typescript
// src/application/useCases/getCycleBootstrap.ts

export const VALID_AGENT_NAMES = [
  "news-scout",
  "financial-analyst",
  "market-watcher",
  "alert-commander",
  "digest-predict",
  "qa-responder",
  "unified-agent",
] as const;

export type ValidAgentName = (typeof VALID_AGENT_NAMES)[number];

export interface BootstrapResult {
  agent_signals: unknown[];          // rows from getSignals(agentName)
  market_context: string;            // text output of buildMarketContext(24)
  system_status: string | null;      // text output of buildSystemStatus() or null on error
  error?: {
    agent_signals?: string;
    market_context?: string;
    system_status?: string;
  };
}

/**
 * Execute 3 sub-calls in parallel via Promise.all.
 * Partial failure: catch per-slot, set error key, continue.
 * Timeout per slot: 5000ms individual AbortSignal.
 */
export async function getCycleBootstrap(agentName: ValidAgentName): Promise<BootstrapResult>
```

### MCP tool

```typescript
// src/interface/mcp/tools/system/cycleBootstrapTool.ts
export function registerCycleBootstrapTool(server: McpServer): void

// Input schema (Zod):
{
  agent_name: z.enum(VALID_AGENT_NAMES)
    .describe("Agent identifier. Unknown name → 400 with valid_agents list.")
}
// Output on success: JSON.stringify(BootstrapResult)
// Output on unknown name: { error: "Unknown agent", valid_agents: VALID_AGENT_NAMES }
```

### Registry addition

```typescript
// src/interface/mcp/tools/registry.ts — append to imports + toolRegistry array:
import { registerCycleBootstrapTool } from "./system/cycleBootstrapTool.js";
// ...
toolRegistry: [
  // ... existing entries ...
  registerCycleBootstrapTool,   // Task 1563: get_cycle_bootstrap (+1 tool → 101)
]
```

---

## Agent Step 0/1 Pattern (Track C)

All 7 agent .md files replace their opening 3-call block with:

```
### Step 0: Bootstrap
`get_cycle_bootstrap(agent_name="<name>")`
→ `bootstrap.agent_signals`: process as before (signal routing unchanged)
→ `bootstrap.market_context`: use as full market context (24h window)
→ `bootstrap.system_status`: check server health
→ `bootstrap.error.<key>` present: apply fail-loud protocol immediately
→ `BASE_CONTEXT_FRESH` detection: if bootstrap.agent_signals contains
  chain_catalyst with payload.title="BASE_CONTEXT" from unified-agent,
  age < 20 min → set BASE_CONTEXT_FRESH=true, extract watchlist_tickers
  from that signal payload.
```

Note: `get_market_context(hours_back=24)` call in old Step 1 is **removed** — bootstrap already includes it. Agents that previously called `get_market_context()` separately after BASE_CONTEXT_FRESH check now use `bootstrap.market_context` directly.

---

## Implementation Notes: `getCycleBootstrap` Use Case

1. **No HTTP self-call.** Re-use the same SQLite helper functions that `marketContextTools.ts` and `agentSignalTools.ts` call internally. Import `getSignals` from `infrastructure/db/agentSignalStore.js` and the section builders from `marketContextTools.ts` (export them) or duplicate minimally.
2. **Parallel execution:**
   ```typescript
   const [signalsResult, contextResult, statusResult] = await Promise.allSettled([
     withTimeout(getSignals(agentName, db), 5000),
     withTimeout(buildMarketContextText(db, 24), 5000),
     withTimeout(buildSystemStatusText(db), 5000),
   ]);
   ```
3. **Partial failure**: `Promise.allSettled` (not `Promise.all`) — each slot independently fulfilled or rejected. Rejected slot → set `error.<key>` string, set payload key to `null`.
4. **Performance target ≤3s p95**: all three sub-tasks are pure SQLite reads (no network). Should complete <100ms locally. The 5000ms timeout is a safety net only.
5. **Refactor needed**: `buildWatchlistSection`, `buildMacroSection`, `buildAlertsSection`, `buildAnalysisSection`, `buildSystemSection` in `marketContextTools.ts` are currently unexported. Export them (or extract to a shared helper `marketContextBuilder.ts`) so the use case can import them without duplication.

---

## Track A: Agent Merge Details

### FR-1: `02-financial-analyst.md`

Structure: combine 02 + 03 into single agent.

| Property | Value |
|----------|-------|
| Identity line | `You are Financial Analyst for VN Market Intelligence. MCP server: https://zenmidi.com/mcp` |
| Schedule | `Daily 13:00 UTC (20:00 VN) + 01:00 UTC (08:00 VN)` (absorbs 03's 14:00/02:00 UTC slots) |
| Step 0 | `get_cycle_bootstrap(agent_name="financial-analyst")` |
| Step 1 (removed) | Old separate `get_agent_signals` + `get_market_context` + `get_system_status` → all from bootstrap |
| Tool set | Union of 02 + 03. Remove `get_system_status` (covered by bootstrap). `get_agent_signals` / `get_market_context` used via bootstrap only |
| Signal output | `post_agent_signal(..., signal_type="fundamental_validation", to_agent="alert-commander", ...)` — direct, no `cross_validate` hop |
| Race condition guard | `list_stored_pdfs` → `get_bctc_full` first; only `read_bctc_pdf` if `get_bctc_full` returns no data for that ticker |

Position-aware block from 03 (Step 1) preserved: `get_user_positions_for_analysis({ ticker })` per stock, fail-loud on failure.

### FR-2: `06-digest-predict.md`

| Property | Value |
|----------|-------|
| Identity line | `You are Digest & Predict for VN Market Intelligence. MCP server: https://zenmidi.com/mcp` |
| Schedule | `Daily 15:30 UTC (22:30 VN). Monday 00:30 UTC (07:30 VN) — prediction mode. Weekly Sunday 16:00 UTC. Monthly 1st. Quarterly.` |
| Step 0 | `get_cycle_bootstrap(agent_name="digest-predict")` |
| Monday sequence | Step P runs BEFORE Step 2. P: prerequisite check → self-assessment → evidence gathering → create claims. Then Step 2 (digest). Prediction output → `Du bao tuan moi` section in digest. |
| No-evidence guard | ALL tickers "No evidence" → skip prediction block, proceed with digest normally |
| Tool set | Union of 06 + 08. `get_agent_signals` / `get_market_context` from bootstrap only |
| Dampening logic | Preserved from 08: 10% confidence reduction when calibration degrading + trend_delta > 0.05 |
| Max claims cap | 5 (unchanged from 08) |

---

## Track C: Direct MCP Access Changes

### All 7 agent .md files — header change

Add MCP URL to header where missing (01, 04, 05, 07 — unified-agent already has it). 02 and 06 are new files, include in creation.

### Validation step (after draft, before posting)

Add to each agent after drafting a signal/claim containing price or % values:

```
Validate draft:
- Call `get_market_snapshot()` (or relevant tool)
- Price divergence >5% OR ticker not in snapshot: discard draft, re-fetch, re-draft
- Max 2 re-fetch attempts
- After 2nd failure: skip stock, `submit_feedback(category="alert_quality", ...)`
```

### `unified-agent.md` role change

Step 4c: remove `(MANDATORY)` label. Add condition: runs only in WEEKLY_REVIEW mode.

In CYCLE GATE table:
- MARKET mode: `run Steps 0–6 EXCEPT Step 4c`
- WEEKLY_REVIEW: `run WEEKLY DEEP REVIEW section (includes Step 4c)`

YOUR ROLE section: replace point 5 text:
- Old: `LAST-MILE REVIEWER — ONLY analysis-team agent with backend MCP access. Cowork agents draft blind. Cross-check EVERY claim against backend.`
- New: `Quality Reviewer (daily/weekly) — verify output accuracy during WEEKLY_REVIEW. In MARKET mode, agents self-validate via direct MCP access.`

---

## Task Breakdown

| Task | Description | Depends on |
|------|-------------|-----------|
| 1562 | Track A: create 02-financial-analyst.md + 06-digest-predict.md; delete 02-bctc-collector.md, 03-report-analyzer.md, 08-prediction-synthesizer.md | None |
| 1563 | Track B: getCycleBootstrap use case + registerCycleBootstrapTool + registry.ts update + tool-registry.json update | None |
| 1564 | Track C: update all 7 agent .md files (Step 0 bootstrap + MCP URL + validation step + unified-agent role change) | 1563 shipped |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| `buildWatchlistSection` etc. not exported from marketContextTools.ts | Certain | Medium | Export functions or extract to `marketContextBuilder.ts` helper before implementing use case |
| `getCycleBootstrap` hits same SQLite connection concurrently | Low | Low | Bun's better-sqlite3 is synchronous; parallel JS tasks serialize at DB call level — no lock contention |
| 02-financial-analyst races: PDF ingested at 08:00 but OCR incomplete | Medium | Medium | Enforced guard: `get_bctc_full` first; `read_bctc_pdf` only as fallback |
| Monday prediction + digest: evidence call adds ~30 tickers × 1 MCP call | Low | Low | MCP calls are local SQLite — no rate limit concern |
| Track C infinite re-fetch loop | Low | High | Hard limit: max 2 re-fetch attempts then skip + submit_feedback |
| Agent using old `bctc-collector` / `report-analyzer` name in bootstrap | Medium | Low | Validation in tool: these names return 400 with valid_agents list |

---

## Security Review

- [ ] SQL parameterized? Yes — all SQLite queries in agentSignalStore.ts + schema.ts use parameterized bindings
- [ ] File paths validated (no `../`)? N/A — no file path input in this feature
- [ ] External HTTP rate-limited? N/A — getCycleBootstrap is pure SQLite
- [ ] Secrets via Bun.env only? Yes — no new secrets introduced
