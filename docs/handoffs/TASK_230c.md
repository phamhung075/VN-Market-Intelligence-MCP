# Task Context — 230c: Integration — agent .md fail-loud blocks + QA AC-6 validation step + tool registry

## TLDR (read this first — complete for simple tasks)

change: 9 files — 7 Cowork agents (Step 0-b fail-loud decision tree), qa.md (AC-6 audit procedure), tool-registry.json (signalValidationTool count)
test: src/__tests__/230-bootstrap-verify.test.ts — AC-4c assertion verifies all agent .md files scanned for "Step 0-b"
branch: task/230c-bootstrap-integration
depends: 230b ✓ (signalValidator service exists)
knowledge_needed: [agent-roster, mcp-tools] — agent .md locations, tool registration

---

sprint: 230
branch: task/230c-bootstrap-integration
status: todo
req_ref: REQ-230
tech_ref: TECH-230

---

## [PM] Planning Context

**layer:** interface (agent + scheduler)

**depends_on:** 230b ✓ (signalValidator service + timing fields exist)

**files_to_read:**
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/TECH_230.md — lines 190–226 (FR-4 fail-loud pattern, agent list)
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/knowledge/agent-roster.md — locate 7 Cowork agent .md files
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/agents/qa.md — find AC-6 insertion point
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/data/tool-registry.json — tool list + count

**files_to_create:**
- None (all modifications to existing agent .md files)

**files_to_modify:**
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/agents/01-news-scout.md — add Step 0-b after Step 0
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/agents/02-financial-analyst.md — add Step 0-b
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/agents/04-market-watcher.md — add Step 0-b
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/agents/05-alert-commander.md — add Step 0-b
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/agents/06-digest-predict.md — add Step 0-b
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/agents/07-qa-responder.md — add Step 0-b
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/agents/unified-agent.md — add Step 0-b
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/agents/qa.md — add AC-6 live audit procedure around line 150
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/data/tool-registry.json — add signalValidationTool, increment count (100→101)
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/knowledge/mcp-tools.md — add signalValidationTool mapping

**test_file:** src/__tests__/230-bootstrap-verify.test.ts (AC-4c: verify all agent .md files have Step 0-b block)

---

## Acceptance Criteria

### AC-4c: Fail-Loud Decision Tree in All 7 Agent .md Files (3 assertions from RED)

**Given** 7 Cowork agent .md files exist at known paths
**When** TDD test scans each file for "Step 0-b: Handle Bootstrap Errors" section
**Then**

- AC-4c-i: 01-news-scout.md contains the exact section header "## Step 0-b: Handle Bootstrap Errors"
- AC-4c-ii: 02-financial-analyst.md contains the exact section header (same)
- AC-4c-iii: 04-market-watcher.md, 05-alert-commander.md, 06-digest-predict.md, 07-qa-responder.md, unified-agent.md all contain it
- AC-4a: if agent executes bootstrap.error.market_context decision tree → sends STOP-LOUD message to Telegram
- AC-4b: if agent executes bootstrap.error.agent_signals only → logs warning, proceeds without STOP

### AC-5: Tool Registry Update (implicit, supports AC-1/AC-2)

**Given** signalValidationTool is implemented (Task 230b)
**When** tool is registered in docs/data/tool-registry.json
**Then**

- tool-registry.json includes entry for signalValidationTool with description + parameters
- count increments from 100 to 101
- mcp-tools.md updated with tool mapping (agent → tools table)

### AC-6: QA Live Market-Hours Validation Procedure (implicit, supports deployment sign-off)

**Given** bootstrap tool has been deployed with timing + validation fields
**When** QA runs market-hours observation during live trading
**Then**

- QA collects 100+ bootstrap calls (via logs: [BOOTSTRAP] entries)
- QA calculates p95 latency from elapsed_ms values (target ≤ 3000ms)
- QA spot-checks 50 recent agent_signals for price accuracy vs live snapshots
- QA verifies 0 hallucinated prices (confidence_score > 95 or divergence < 2%)
- QA logs findings in task report

---

## Implementation Details

### 1. Fail-Loud Decision Tree (FR-4 Pattern)

Add this section to each of the 7 agent .md files **immediately after Step 0** (insert between "## Step 0" and "## Step 1"):

```markdown
## Step 0-b: Handle Bootstrap Errors

**Check `bootstrap.error` field immediately after bootstrap returns:**

- **If `error.market_context` present:**
  → `send_telegram(channel="work", message="[{agent-name}] Bootstrap failed: market_context unavailable — {error.market_context}. Stopping cycle.")`
  → `submit_feedback(category="bootstrap_failure", severity="critical", title="Bootstrap market_context failed", detail="{error.market_context}")`
  → **STOP CYCLE** (return early, do not execute further steps)

- **If `error.agent_signals` present (only):**
  → Log warning: "Agent signals unavailable, continuing with empty signals list"
  → Proceed normally (empty signals acceptable)

- **If `error.system_status` present (only):**
  → Log warning: "System status unavailable, continuing (status is advisory)"
  → Proceed normally (status is not critical)

- **If ≥2 error keys present (e.g., both `agent_signals` + `market_context`):**
  → Apply `error.market_context` rule (FAIL-LOUD, STOP)

**Critical Rule:** Any agent that silently continues without this decision tree block is a bug. QA verifies this block exists via string search in TDD RED test.
```

**Seven agent .md files to modify:**
1. `.claude/agents/01-news-scout.md`
2. `.claude/agents/02-financial-analyst.md`
3. `.claude/agents/04-market-watcher.md`
4. `.claude/agents/05-alert-commander.md`
5. `.claude/agents/06-digest-predict.md`
6. `.claude/agents/07-qa-responder.md`
7. `.claude/agents/unified-agent.md`

### 2. QA AC-6 Validation Step

Add to `.claude/agents/qa.md` around line 150–160 (after existing acceptance criteria sections):

```markdown
### AC-6: Real-World Signal Accuracy Audit

**Trigger:** After 230b + 230c deploy to production, during market hours.

**Procedure:**

1. **Latency Measurement (p95 calculation):**
   - Collect all `[BOOTSTRAP]` log lines from production logs (1–2 hours of trading)
   - Parse `elapsed_ms` values (expect 100–500 samples)
   - Calculate p95 percentile (target ≤ 3000ms)
   - If p95 > 3000ms → escalate to Architect; regression investigation required

2. **Signal Accuracy Spot-Check:**
   - Query agent_signals table: SELECT TOP 50 signals WHERE created_at > NOW - 2 hours AND signalType IN ('price', 'buy_signal', 'sell_signal')
   - For each signal: fetch live `get_market_snapshot(ticker)` and compare
   - Validate: `|signal.price - snapshot| / snapshot < 0.05` (within 5%)
   - Count failures; if any > 0: escalate

3. **Confidence Score Distribution:**
   - Histogram of confidence_score values (should be clustered 90–100)
   - If > 10% of signals have confidence < 80 → investigate snapshot data quality

4. **Fail-Loud Protocol Activation:**
   - Monitor Telegram #work channel for bootstrap_failure messages
   - If any appear → investigate agent error handling immediately

**Report Template:**
```
AC-6 Result (Date: YYYY-MM-DD, Market: HOSE)
- p95 latency: {ms} ms (target ≤ 3000) ✓ / ✗
- Signal accuracy: {N}/50 pass ✓ / {N} fail ✗
- Confidence distribution: {histogram}
- Fail-loud activations: {count}
```
```

### 3. Update Tool Registry

**Modify `/docs/data/tool-registry.json`:**

Add entry to tools array:

```json
{
  "id": 101,
  "name": "validate_signal_price",
  "description": "Validate signal price vs live market snapshot (±5% tolerance). Input: signal object + ticker + snapshot_price. Output: { valid, divergence_percent, confidence_score, validated_at, issue }",
  "toolPath": "src/interface/mcp/tools/alerts/signalValidationTool.ts",
  "category": "signals",
  "agent": "shared"
}
```

Update count: `"toolCount": 100` → `"toolCount": 101`

### 4. Update mcp-tools.md

Add signalValidationTool to the tool matrix section (align with existing format):

```markdown
| validate_signal_price | signalValidationTool | shared | Validate signal ±5% | [230] |
```

---

## Testing Strategy

- AC-4c assertion in RED test (230a) scans each agent .md file for "Step 0-b:" string
- GREEN test (230b) mocks bootstrap.error scenarios
- AC-6 is live market-hours validation (QA manual step, not automated)
- Run `bun test src/__tests__/230-bootstrap-verify.test.ts` — expect AC-4c assertions to pass after agent .md updates

---

## Success Definition

- All 7 agent .md files contain "## Step 0-b: Handle Bootstrap Errors" section ✓
- Step 0-b section placed immediately after Step 0 (correct insertion point) ✓
- .claude/agents/qa.md includes AC-6 live audit procedure ✓
- docs/data/tool-registry.json incremented (100→101) with signalValidationTool entry ✓
- .claude/knowledge/mcp-tools.md updated with tool matrix row ✓
- AC-4c test assertion passes (all 7 agents verified) ✓
- No DDD violations (all changes are prose/config, no code layer crossing) ✓

---

## [Developer] Implementation Record

**files_actually_modified:**

1. `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/230-bootstrap-verify.test.ts` (1 assertion added)
   - AC-4c assertion: scans all 7 agent .md files for "## Step 0-b: Handle Bootstrap Errors" section
   - Path resolution: fixed to use `path.resolve(__dirname, "../..")` to reach project root from test directory
   - All 13 assertions pass (12 from 230b + 1 new AC-4c)

2. `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/cowork-analysis-vnmarket-team/01-news-scout.md` (+29 lines)
   - Added Step 0-b: Handle Bootstrap Errors section after Position-aware paragraph
   - Decision tree: checks error.market_context (STOP-LOUD), error.agent_signals (CONTINUE), error.system_status (CONTINUE)

3. `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/cowork-analysis-vnmarket-team/02-financial-analyst.md` (+29 lines)
   - Added Step 0-b: Handle Bootstrap Errors section with same decision tree pattern

4. `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/cowork-analysis-vnmarket-team/04-market-watcher.md` (+29 lines)
   - Added Step 0-b: Handle Bootstrap Errors section with same decision tree pattern

5. `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/cowork-analysis-vnmarket-team/05-alert-commander.md` (+29 lines)
   - Added Step 0-b: Handle Bootstrap Errors section with same decision tree pattern

6. `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/cowork-analysis-vnmarket-team/06-digest-predict.md` (+29 lines)
   - Added Step 0-b: Handle Bootstrap Errors section with same decision tree pattern

7. `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/cowork-analysis-vnmarket-team/07-qa-responder.md` (+29 lines)
   - Added Step 0-b: Handle Bootstrap Errors section (placed after KNOWLEDGE section since agent has no traditional Step 0)
   - Includes note: "(if calling get_cycle_bootstrap)"

8. `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/cowork-analysis-vnmarket-team/unified-agent.md` (+29 lines)
   - Added Step 0-b: Handle Bootstrap Errors section with same decision tree pattern

9. `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/agents/qa.md` (+37 lines)
   - Added AC-6: Real-World Signal Accuracy Audit section (lines 154–188)
   - Includes: latency p95 measurement, signal accuracy spot-check (±5%), confidence distribution, fail-loud monitoring
   - Report template provided for post-deploy validation

10. `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/knowledge/mcp-tools.md` (+4 lines)
    - Added "Shared Tools" section documenting `validate_signal_price` tool
    - Added tool entry: name, purpose, REQ reference (230), date added

11. `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/data/tool-registry.json` (+3 lines modified)
    - Updated toolCount: 101 → 102
    - Updated lastUpdated: 2026-04-20 → 2026-04-21
    - Updated _note: added signalValidationTool entry note
    - Updated Alerts category count: 4 → 5, added validate_signal_price to tools list

**tests_written:**
- src/__tests__/230-bootstrap-verify.test.ts — 1 new assertion (AC-4c)
  - Scans 7 agent .md files for Step 0-b section presence
  - All 13 total assertions pass (12 from 230b + 1 new)

**tests_skipped:** [] (none)

**tsc_clean:** true (0 errors from agent .md + qa.md + tool registry + test changes)

**full_suite_pass:** true (5985 pass / 0 fail / 21 skip — no change from 230b)

**ddd_violations:** none (all changes are prose/documentation/config, no code layer crossing)

**branch_status:** task/230c-bootstrap-integration (commit: e7e632e)

---
