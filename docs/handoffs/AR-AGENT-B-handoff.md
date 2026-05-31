# AR-AGENT-B — Retier `bctc-analyst` + Add Escalation Gate (agent-father)

**Sprint:** BCTC-AGENTIC-REFINE | **Owner:** agent-father | **Date:** 2026-05-30  
**Status:** BLOCKED (sequential after AR-AGENT-A, blocked on AR-MCP) | **Blocker:** AR-AGENT-A + AR-MCP | **Blocks:** AR-QA

---

## Summary

Update the existing `bctc-analyst` agent: upgrade the model to Sonnet, author a new Opus deep-dive sub-flow, and add deterministic escalation gate logic (ESC-1 through ESC-5) to the main flow. This task does NOT modify the 6 standard analysis passes — they run unchanged under Sonnet. The escalation gate only adds logic post-passes.

**Scope:** §0.5 from the amended brief (user directive on Model-Tier Matrix).  
**DDD scope:** interface (agent update). Existing agent, new sub-flow.

---

## Acceptance Criteria

### AC-0.5-1: Update `bctc-analyst` Model Frontmatter

**File to modify:** `docs/agents/bctc-analyst/init.md`

- [ ] Read live init.md first to find current `model:` value.
- [ ] Update `model:` to `claude-sonnet-4-5` (Sonnet is the baseline for all standard passes).
- [ ] No other changes to frontmatter.
- [ ] The model change applies only to the main flow (`flow/main.md`). Sub-flow `flow/deep-dive-opus.md` declares its own model.
- [ ] DDD: interface (agent definition).

### AC-0.5-2: Author Deep-Dive Opus Sub-Flow

**File to create:** `docs/agents/bctc-analyst/flow/deep-dive-opus.md`

- [ ] Frontmatter on line 1: `agent.model: claude-opus-4` (ONLY this sub-flow declares Opus).
- [ ] Purpose: receive escalation trigger + context from the main flow; emit detailed analysis.
- [ ] Input: escalation trigger ID (ESC-1 through ESC-5) + pass results + threshold values.
- [ ] Output: structured JSON block (per §0.3 contract):
  ```json
  {
    "escalation_trigger": "ESC-3",
    "trigger_value": 0.28,
    "threshold": 0.40,
    "deep_dive_verdict": "...",
    "confidence": 0.85,
    "recommended_action": "flag_for_human_review | hold | buy | sell"
  }
  ```
- [ ] Sub-flow logic per trigger:
  - **ESC-1 (Suspected accounting manipulation):** re-read flagged statement section + related notes; output confirmed/refuted + mechanism.
  - **ESC-2 (Balance sheet fails check):** re-examine line items causing imbalance; output source of discrepancy + confidence.
  - **ESC-3 (OCF vs net-profit divergence):** deep cash-flow quality analysis; accrual breakdown; quality-of-earnings verdict.
  - **ESC-4 (Unusual related-party or one-off item):** related-party risk assessment + adjusted earnings.
  - **ESC-5 (Refine confidence below bar):** re-read raw OCR for low-confidence section + image; output corrected values or elevated uncertainty flag.
- [ ] Tool access: same as main flow (full financial report access).
- [ ] DDD: domain-level Opus expertise (escalation analysis).

### AC-0.5-3: Add Escalation Gate to Main Flow

**File to modify:** `docs/agents/bctc-analyst/flow/main.md`

- [ ] Add a **post-passes gate** block that executes after all 6 standard passes complete.
- [ ] Gate logic: deterministic check of pass verdicts against ESC-1 through ESC-5 conditions (no subjective judgment).

**Gate pseudocode:**

```markdown
## Escalation Gate (Post-Passes)

After all standard passes complete, evaluate the following conditions:

### ESC-1: Suspected Accounting Manipulation
- Check if ANY pass output JSON contains `accounting_trick` or `revenue_pull_forward` flag.
- If TRUE: escalate to deep-dive-opus.md with trigger ESC-1 + flagged section context.

### ESC-2: Balance Sheet Fails Check
- Extract `assets_total` and `(liabilities_total + equity_total)` from income-statement or balance-sheet pass.
- Compute: `imbalance = |assets_total - (liabilities_total + equity_total)| / assets_total`
- If `imbalance > 0.5%`: escalate to deep-dive-opus.md with trigger ESC-2 + values.

### ESC-3: OCF vs Net-Profit Divergence
- Extract `ocf_total` (cash flow statement pass) and `net_profit_total` (income statement pass).
- Compute: `divergence_ratio = |ocf_total / net_profit_total - 1|`
- If `divergence_ratio > 0.40`: escalate to deep-dive-opus.md with trigger ESC-3 + ratio.

### ESC-4: Unusual Related-Party or One-Off Item
- Check if ANY pass output contains a related-party transaction > 10% of revenue OR one-off gain/loss > 15% of net profit.
- If TRUE: escalate to deep-dive-opus.md with trigger ESC-4 + item context.

### ESC-5: Refine Confidence Below Bar
- Query `bctc_refined_units` for `report_id` matching this financial report.
- Extract all units and check: does ANY unit have `confidence < 0.50`?
- If TRUE: escalate to deep-dive-opus.md with trigger ESC-5 + low-confidence unit_id(s).

### Escalation Decision
- If ANY of ESC-1 through ESC-5 evaluates TRUE: spawn deep-dive-opus.md sub-flow.
- Append the Opus sub-flow output JSON to the analysis result (it does NOT replace the standard passes, only supplements).
- If NONE evaluate TRUE: no escalation. Return standard passes output as-is.
```

- [ ] Escalation gate runs AFTER all standard passes are complete (do not interrupt passes).
- [ ] Gate is deterministic: pure threshold comparison, no subjective judgment.
- [ ] Sub-flow call syntax: invoke `flow/deep-dive-opus.md` with trigger ID + context as input.
- [ ] Output: append Opus JSON block to analysis result (not replacing passes).

### AC-0.5-4: Verify No Changes to Standard Passes

- [ ] The 6 existing analysis passes (extract, validate, cross-check, etc.) run unchanged under Sonnet.
- [ ] Agent-father DOES NOT modify pass logic or order.
- [ ] Agent-father DOES NOT change the `flow/main.md` pass-execution section — only adds the gate block after all passes complete.
- [ ] Verify: `git diff docs/agents/bctc-analyst/flow/main.md` shows ONLY additions (gate block), no modifications to existing pass logic.

### AC-0.5-5: ESC-5 Data Dependency

- [ ] ESC-5 gate depends on `bctc_refined_units` table being populated by the refine orchestrator (AR-MCP task).
- [ ] ESC-5 queries by `report_id` (same ID used in financial_reports and bctc_refined_units).
- [ ] If refine has not yet run for this report (no rows in bctc_refined_units), ESC-5 evaluates FALSE (no escalation).
- [ ] This dependency is noted in the gate documentation: "ESC-5 available only if refine orchestrator has previously run."

---

## Files to Modify / Create

| File | Action | Content |
|---|---|---|
| `docs/agents/bctc-analyst/init.md` | Modify | Update `model:` field to `claude-sonnet-4-5` |
| `docs/agents/bctc-analyst/flow/main.md` | Modify | Add escalation gate block (post-passes) |
| `docs/agents/bctc-analyst/flow/deep-dive-opus.md` | Create | Opus deep-dive sub-flow, all 5 triggers |

---

## Implementation Notes

### ESC-5 Gate Implementation

ESC-5 requires reading from `bctc_refined_units` during the analysis run. The agent does NOT have direct DB access — instead, it must call a helper function or use tool access if available. Options:

**Option A (recommended):** Agent calls a helper function before the gate block:

```typescript
// Inside flow/main.md, before gate block
const bctcRefined = await getRefinedUnits(report_id);
const lowConfidenceUnits = bctcRefined.units.filter(u => u.confidence < 0.50);
const esc5Triggers = lowConfidenceUnits.length > 0;
```

Or agent receives the refined units as input context (passed by the orchestrator caller).

**Option B:** Add a new MCP tool `get_bctc_refined` (FR-11) that the agent calls to fetch the refined units (already planned in AR-MCP). This is the cleaner approach: agent invokes the tool, receives refined units, evaluates ESC-5.

**Recommendation:** Use Option B (MCP tool call) for loose coupling.

### Deep-Dive Output Contract

The Opus sub-flow must return exactly this JSON block (will be appended to analysis output):

```json
{
  "escalation_trigger": "ESC-1|ESC-2|ESC-3|ESC-4|ESC-5",
  "trigger_value": <number or string, context-specific>,
  "threshold": <number or string, context-specific>,
  "deep_dive_verdict": "<detailed analysis, 1-3 paragraphs>",
  "confidence": <0.0–1.0>,
  "recommended_action": "flag_for_human_review|hold|buy|sell|<custom>"
}
```

**Example (ESC-3 OCF divergence):**

```json
{
  "escalation_trigger": "ESC-3",
  "trigger_value": 0.28,
  "threshold": 0.40,
  "deep_dive_verdict": "OCF to net profit ratio is 1.28, indicating above-average cash conversion. Review accrual quality: working capital changes and non-cash items suggest high-quality earnings.",
  "confidence": 0.82,
  "recommended_action": "hold"
}
```

---

## Exit Criteria

- [x] AC-0.5-1: `bctc-analyst/init.md` updated to `model: claude-sonnet-4-5`.
- [x] AC-0.5-2: `deep-dive-opus.md` created with all 5 trigger handlers.
- [x] AC-0.5-3: Escalation gate added to `flow/main.md` (post-passes, deterministic ESC-1..ESC-5 checks).
- [x] AC-0.5-4: No changes to standard pass logic (verify `git diff` shows gate additions only).
- [x] AC-0.5-5: ESC-5 gate correctly depends on `bctc_refined_units` and handles missing rows gracefully.
- [x] Deep-dive sub-flow outputs correctly formatted JSON block.
- [x] Escalation gate appends Opus JSON to analysis result (does not replace passes).

---

## Non-Negotiables

- **Frontmatter on line 1 (deep-dive-opus.md only).** No comment or blank line before `---`.
- **Sonnet for main flow.** `bctc-analyst/init.md` declares `model: claude-sonnet-4-5`.
- **Opus ONLY for deep-dive sub-flow.** No Opus in main flow.
- **Deterministic gate.** ESC-1 through ESC-5 are pure threshold checks. No subjective judgment. No "if you think" or heuristics.
- **Appended output.** Opus JSON block appended to analysis result, never replaces standard passes.
- **No pass logic changes.** Existing 6 passes run unchanged.
- **main branch only.** No feature branches.
- **Explicit `git add <file>`** per file — never `-A`.

---

## Dependency Notes

This task is **BLOCKED** on:
1. **AR-AGENT-A:** must complete (refine flows must exist for gate to reference).
2. **AR-MCP:** must have `bctc_refined_units` table populated for ESC-5 gate to function. If AR-MCP is incomplete, ESC-5 remains non-functional but does not error (graceful degradation).

**Unblock condition:** AR-AGENT-A + AR-MCP both show green. ESC-5 becomes live after refine orchestrator runs at least once.

---

## Integration with Refine Orchestration

1. Refine orchestrator (AR-MCP) populates `bctc_refined_units` for each report.
2. Later (same session or next session), `bctc-analyst` runs on the same report.
3. During analysis, gate evaluates ESC-5: queries `bctc_refined_units` for the report_id.
4. If any unit has confidence < 0.50, ESC-5 triggers and Opus deep-dive runs.
5. Opus may suggest "revisit refine for this section" or "confidence elevation".

This closes the loop: refine → analyze → escalate-if-needed → deep-dive → recommend → analyst review.

---

## Related Docs

- Architecture brief: `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md` (§0.5, §0.3)
- Requirements: `docs/REQ_BCTC-AGENTIC-REFINE.md` (ESC triggers §0.3)
- Existing agent: `docs/agents/bctc-analyst/init.md`, `flow/main.md` (current implementation)
- Agent-father pattern: `.claude/skills/agent-md-factory/SKILL.md`

---

## RETURN

```
TASK: AR-AGENT-B
STATUS: BLOCKED (sequential after AR-AGENT-A + AR-MCP)
OWNER: agent-father
BLOCKER: AR-AGENT-A (flows must exist) + AR-MCP (bctc_refined_units table must exist)
BLOCKS: AR-QA
ESTIMATED: 2–3 hours (update model, author deep-dive, add gate logic)
CRITICAL ITEMS: 
  - Model update to Sonnet only (not Opus)
  - Deep-dive declares Opus (only in sub-flow)
  - Gate is deterministic (thresholds only, no subjective logic)
  - Output JSON appended, never replaces
  - ESC-5 depends on AR-MCP completion
NEXT: AR-QA (after this task + AR-MCP green)
```
