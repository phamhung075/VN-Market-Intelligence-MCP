# Architecture Brief — TNB Critic Gate

**Date:** 2026-05-17
**Author:** agents-architect
**Status:** Ready for implementation
**Recipient:** agent-father

---

## 1. Problem Statement

Cowork agents (news-scout, financial-analyst, market-watcher, digest-predict) call `post_agent_signal` directly after producing an analysis draft. There is no quality gate. Shallow, vague, or pillar-incomplete analyses flow into `agent_signals` unchanged, degrading the downstream signal bus and misleading alert-commander and tran-ngoc-bau's periodic audits.

The TNB methodology requires every signal to be: pillar-complete (money supply, cost of capital, profit outlook, policy), source-tier verified (no social-media-as-primary), forensics-gated for BCTC claims (M-Score / F-Score / accruals), and cycle-phase mapped. None of these checks happen at write time today.

---

## 2. Where the Gate Inserts

**Decision: gate at the MCP tool layer, not at `intelligenceCycleJob.ts`.**

Rationale: `intelligenceCycleJob.ts` Step E handles alert dispatch (alerts table), not agent signal writes. Agent signal writes happen directly from cowork agent sessions via the `post_agent_signal` MCP tool. Inserting at the job layer would only catch signals routed through the intelligence cycle, missing financial-analyst and digest-predict which have their own schedules.

The correct insertion point is a new server-side function `postSignalWithCriticGate()` that wraps `postSignal()`. The MCP tool `post_agent_signal` calls this wrapper instead of calling `postSignal` directly. The gate is transparent to all callers — no cowork agent flow changes required.

```
Cowork agent
  └─ calls post_agent_signal(payload)
        └─ MCP tool handler → postSignalWithCriticGate(db, input)
              ├─ [NEW] scoreWithTnbCritic(draftSignal) → CriticResult
              │     timeout: 20s, fail-soft on timeout/error
              ├─ if score >= 0.7 → postSignal(db, {...input, critic_score, critic_notes, retry_count:0})
              ├─ if score < 0.7 → return critique to source agent (retry protocol)
              │     source agent revises once → scoreWithTnbCritic() again
              │     after 1 retry → postSignal regardless, retry_count=1
              └─ on timeout → postSignal(db, {...input, critic_score:null, critic_notes:null, retry_count:0})
```

---

## 3. Data Contract

### 3a. What the Critic Receives (CriticInput)

```typescript
interface CriticInput {
  fromAgent: string;           // e.g. "news-scout"
  signalType: string;          // e.g. "urgent_news"
  stockCode: string | null;
  payload: {
    title?: string;
    detail?: string;
    impact_score?: number;
    [key: string]: unknown;
  };
  findingData: Record<string, unknown>;  // chain finding metrics
}
```

The critic receives the full signal payload before persistence. It does NOT receive internal DB fields (id, expires_at, cycleId) — only the analysis content.

### 3b. What the Critic Returns (CriticResult)

```typescript
interface CriticResult {
  pass: boolean;               // true = score >= threshold
  score: number;               // 0.0–1.0
  notes: string;               // one-sentence verdict or critique
  critique?: string;           // specific gap description when pass=false (used in retry prompt)
  timedOut?: boolean;          // true = gate did not respond in time
}
```

### 3c. Scoring Criteria (TNB Methodology — 5 checks, 0.2 each)

| Check | Pass condition | Weight |
|---|---|---|
| Pillar coverage | payload.detail references at least 1 of: money supply / cost of capital / profit / policy | 0.2 |
| Source tier | no social media as primary; detail does not reference Facebook/Zalo/Reddit without tier-1 anchor | 0.2 |
| Specificity | title + detail combined >= 80 chars; no vague phrases ("có thể", "possibly", "might") as sole conclusion | 0.2 |
| BCTC forensics gate | if signalType=fundamental_validation → findingData must include at least one of: m_score, f_score, accruals_flag, btn_check | 0.2 |
| Confidence anchor | impact_score present AND >= 3 (for news signals) OR confidence_score > 0.5 (if provided) | 0.2 |

Score = sum of passed checks / 5. Threshold = 0.6 (3 of 5 checks must pass).

Note: the BCTC forensics check only applies when `signalType = "fundamental_validation"`. For all other signal types, this check auto-passes, making the effective threshold for non-BCTC signals: 3 of 4 applicable checks = 0.6.

---

## 4. Retry Protocol

### Flow

```
1. Source agent produces draft signal, calls post_agent_signal.
2. postSignalWithCriticGate receives it.
3. scoreWithTnbCritic(draftInput) → CriticResult.
   - If pass=true (score >= 0.6): write to DB, retry_count=0. Done.
   - If pass=false:
       a. Critique text is returned to the source agent via the MCP tool response
          (NOT a new Telegram message — returned inline as tool output).
       b. Source agent sees: { pass: false, critique: "<specific gap>", retry_count_remaining: 1 }
       c. Source agent revises the payload addressing the critique gap.
       d. Calls post_agent_signal again with revised payload.
   - On second call: scoreWithTnbCritic again.
       - If now pass=true: write to DB, retry_count=1.
       - If still pass=false: write to DB with retry_count=1. FAIL-SOFT.
         The signal is marked with the final score — never blocked.
```

### What the source agent must revise

The critique field from CriticResult contains a targeted gap description. Examples:

- "Pillar gap: detail references price action only — add cost-of-capital or profit outlook context."
- "BCTC forensics missing: fundamental_validation signal requires m_score or f_score in findingData."
- "Specificity low: detail is 42 chars. Expand to include direction, magnitude, and evidence source."

Source agents receive this as part of the `post_agent_signal` tool response and are expected to extend `payload.detail` or `findingData` accordingly before retrying.

### Max retry: 1

After 1 retry the signal is written regardless of score. No signal is ever permanently blocked. The `retry_count` field on the row records whether a retry occurred.

---

## 5. Timeout and Fail-Soft

### Timeout value: 20 seconds

Rationale: the critic gate runs a deterministic rule-based score (no LLM call, no HTTP). 20s is a safe upper bound for SQLite + in-process computation. The cowork cycle wall time budget is 30s — at 20s timeout the gate cannot exceed that budget. If the critic gate itself blocks (e.g. DB lock during high-load cycle), the 20s timeout fires and the signal passes through as-is.

### Fail-soft implementation

```typescript
let criticResult: CriticResult;
try {
  criticResult = await Promise.race([
    scoreWithTnbCritic(draftInput),
    sleep(CRITIC_TIMEOUT_MS).then(() => ({
      pass: true,         // fail-soft: let signal through
      score: -1,          // sentinel: -1 = timeout, distinct from real 0.0 score
      notes: "critic gate timeout — signal passed through unscored",
      timedOut: true,
    })),
  ]);
} catch (err) {
  // Any unexpected error in critic = fail-soft
  criticResult = { pass: true, score: -1, notes: `critic gate error: ${err.message}`, timedOut: true };
}
```

When `timedOut=true`, the signal is written with `critic_score = null` (not -1). The sentinel -1 is internal to the gate function and is never persisted.

---

## 6. Schema Change — `agent_signals` Table

Three new columns are required. They follow the existing additive-migration pattern in `agentSignalStore.ts` (column-existence probing with try/catch guards).

```sql
-- Migration: add critic gate columns
ALTER TABLE agent_signals ADD COLUMN critic_score REAL DEFAULT NULL;
ALTER TABLE agent_signals ADD COLUMN critic_notes TEXT DEFAULT NULL;
ALTER TABLE agent_signals ADD COLUMN retry_count INTEGER DEFAULT 0;
```

### Semantics

| Column | Type | Value |
|---|---|---|
| `critic_score` | REAL / NULL | 0.0–1.0 = scored; NULL = timeout or gate unavailable |
| `critic_notes` | TEXT / NULL | Verdict or critique text from CriticResult.notes |
| `retry_count` | INTEGER | 0 = no retry; 1 = one retry occurred (pass or fail-soft) |

### Backward compatibility

All three columns have `DEFAULT NULL` or `DEFAULT 0`. Existing rows are unaffected. The column-probe pattern already in `postSignal()` should be replicated for these columns: probe once at startup, cache result, use in INSERT.

---

## 7. Implementation Steps (for agent-father)

**Step 1 — Schema migration**
File: `apps/mcp-server/src/infrastructure/db/schema.ts` (or wherever `CREATE TABLE agent_signals` lives — search for `agent_signals` DDL).
Add the three columns to the DDL. Add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migration guards in the `migrateSchema()` or equivalent startup function.

**Step 2 — Add CriticInput / CriticResult types to agentSignalStore.ts**
File: `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts`
Add interfaces `CriticInput`, `CriticResult` (as specified in § 3 above).

**Step 3 — Implement scoreWithTnbCritic()**
New file: `apps/mcp-server/src/domain/services/tnbCriticScorer.ts`
Pure function — no I/O, no DB, no HTTP. Input: CriticInput. Output: CriticResult.
Implement the 5 scoring checks from § 3c. Unit-testable in isolation.

```typescript
export function scoreWithTnbCritic(input: CriticInput): CriticResult {
  // 5 checks, 0.2 each — see § 3c for criteria
  // Returns { pass: score >= 0.6, score, notes, critique? }
}
```

**Step 4 — Implement postSignalWithCriticGate()**
File: `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts`
New exported function wrapping `postSignal()`. Implements timeout, retry protocol, and fail-soft as specified in § 4 and § 5.

```typescript
export async function postSignalWithCriticGate(
  db: Database,
  input: PostSignalInput,
): Promise<{ signalId: number; criticResult: CriticResult | null }> { ... }
```

Returns both the persisted signal ID and the CriticResult so the MCP tool can relay critique to the caller on first-attempt failure.

**Step 5 — Wire MCP tool post_agent_signal to use postSignalWithCriticGate**
File: locate `post_agent_signal` tool handler (search `apps/mcp-server/src/interface/mcp/tools/` for `post_agent_signal`).
Replace the direct `postSignal(db, input)` call with `postSignalWithCriticGate(db, input)`.
When `criticResult.pass = false` and `retry_count_remaining = 1`, return a tool response that includes the critique text so the calling agent can revise.

**Step 6 — Update PostSignalInput and column probes in postSignal()**
The new columns must be included in INSERT statements when the critic columns exist. Add the probe pattern (try/catch SELECT) for `critic_score` to the existing column-existence guards. Include `critic_score`, `critic_notes`, `retry_count` in the INSERT when the columns exist.

**Step 7 — Tests**
New test file: `apps/mcp-server/src/domain/services/__tests__/tnbCriticScorer.test.ts`
Cover: all 5 checks individually, pass/fail boundaries (score = 0.6 threshold), BCTC check auto-pass for non-BCTC signal types.

New test additions in agentSignalStore tests: verify critic_score / retry_count are persisted correctly; verify timeout path writes critic_score=null; verify fail-soft never throws.

**Step 8 — Update PostSignalInput interface (exported type)**
Add optional fields to `PostSignalInput`:
```typescript
critic_score?: number | null;
critic_notes?: string | null;
retry_count?: number;
```
This allows the gate function to pass these through to the underlying postSignal.

---

## 8. Affected Files

| File | Change |
|---|---|
| `apps/mcp-server/src/infrastructure/db/schema.ts` | ADD 3 columns to DDL + migration guards |
| `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts` | Add CriticInput, CriticResult, postSignalWithCriticGate, extend PostSignalInput, extend INSERT paths |
| `apps/mcp-server/src/domain/services/tnbCriticScorer.ts` | NEW: pure scorer function |
| `apps/mcp-server/src/interface/mcp/tools/<post_agent_signal handler>` | Wire postSignalWithCriticGate |
| `apps/mcp-server/src/domain/services/__tests__/tnbCriticScorer.test.ts` | NEW: unit tests for scorer |

No cowork agent `.md` files require changes. No flow files require changes. The gate is transparent to callers — they receive critique text in the tool response on first failure.

---

## 9. Non-Goals

- **No LLM call in the critic gate.** The gate is a deterministic rule-based scorer. LLM-based scoring would add latency, cost, and non-determinism incompatible with the 20s timeout and fail-soft requirement.
- **No separate tran-ngoc-bau agent invocation.** The gate does not spawn or call tran-ngoc-bau. It implements TNB methodology criteria as rules. TNB's daily audit cycle remains unchanged — it audits persisted signals post-hoc.
- **No gate on `intelligenceCycleJob.ts`.** The job is infrastructure; the gate belongs at the write path.
- **No changes to alert_signals table.** The `alerts` table (distinct from `agent_signals`) is out of scope.

---

## 10. Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Critics gate adds >20s on high DB contention | Low | 20s timeout + fail-soft pass-through |
| Scorer false-positives block valid low-detail signals | Medium | Score threshold = 0.6 (lenient); retry protocol gives source agent one revision attempt; fail-soft after 1 retry |
| Column probe overhead on every INSERT | Low | Probe result is cached in module scope (existing pattern in agentSignalStore.ts) |
| Retry loop doubles MCP tool call latency | Low | Max 1 retry; scorer is in-process (<1ms); only network round-trip is the second `post_agent_signal` call |

---

## 11. Dependencies and Sequencing

Steps 1 → 2 → 3 can proceed in parallel (no shared files between them).
Step 4 depends on Steps 2 and 3 (needs types and scorer).
Step 5 depends on Step 4.
Step 6 depends on Step 4.
Step 7 depends on Step 3 (scorer tests) and Step 4 (store tests).
Step 8 should be done with Step 2.

Recommended sprint split:
- Sprint A (Steps 1, 2, 3, 8): schema + types + pure scorer — no behavior change, safe to ship independently.
- Sprint B (Steps 4, 5, 6, 7): wire gate + tests — activates the critic gate end-to-end.
