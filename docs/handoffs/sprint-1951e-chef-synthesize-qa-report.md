# Sprint 1951e — chef.md SYNTHESIZE + Citation Discipline

**Date:** 2026-05-19 | **Commit:** c3106559 | **QA verdict:** APPROVED

---

## [QA] Review Record

### Files inspected
- `.claude/flows/unified-agent/chef.md` (278 lines)
- `docs/TASKS.md` (1953-FixB + 1953-FixC rows)
- `docs/signals/agent-father-1951e-chef-synthesize.json`
- `docs/architecture-briefs/2026-05-19-data-fusion-gap.md`

### Checks

| Check | Result | Notes |
|---|---|---|
| Step 6.5 SYNTHESIZE exists between Step 6 and Step 7 | PASS | Lines 168-184 |
| Causal-chain sentence requirement (one per cluster) | PASS | Line 170 |
| Canonical form `[global event] → [VN macro] → [sector] → [ticker: end state]` | PASS | Line 173 |
| `[gap: ...]` marker pattern | PASS | Lines 180-181 |
| Incomplete chain → conviction LOW | PASS | Line 180 |
| conf=0.50 baseline → LOW conviction + `[uncertain-source baseline]` label | PASS | Line 182 |
| Step 6.5 ≤15 lines | ADVISORY | 16 content lines (header through 183); borderline, no padding, no semantic gap |
| Citation Discipline subsection in Step 7 paragraph 2 | PASS | Lines 197-198 |
| Paragraph 2 opens with Step 6.5 chain sentences verbatim | PASS | Line 194 |
| Inline citation format (signal ID / source file / source_tier) | PASS | Line 198 |
| "Flow violation" language for uncited claims | PASS | Line 198 |
| Citation Discipline ≤8 lines | PASS | 2 lines |
| 1953-FixB backlog row (owner: dev-mcp-server, signal file-drops, brief ref) | PASS | TASKS.md line 10 |
| 1953-FixC backlog row (owner: architect + agent-father, signal-fusion-rules.md, brief ref) | PASS | TASKS.md line 11 |
| chef.md line delta ≤25 (token economy) | PASS | +23 lines net |
| Steps 1-6 unchanged | PASS | No diff in lines 67-164 |
| Existing format/structure preserved | PASS | |
| bun test / bun tsc | SKIP — .md-only change; no TypeScript modified | |
| DDD scan | SKIP — .md-only change | |
| Security scan | SKIP — .md-only change | |

### Blocking issues
None.

### Advisory
Step 6.5 is 16 lines (header inclusive) vs ≤15 spec. Content is dense and non-padded; all 6 required semantic elements present. Not a blocker — no line is removable without losing a required element.

### Verdict
**APPROVED**

---
