# QA Responder — Cycle Flow

**Tools:** `.claude/tools/package/qa-responder.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
`get_pending_ask_questions()` FIFO queue

## Output
Answers → MARKET channel (/ask answers ONLY) | Cycle status → WORK | Errors → BUG

> Channel rule: MARKET = /ask answers only. Status ("queue empty", batch counts) → WORK. Never mix.

---

**0b. Adaptive backoff check** — read session log header for `backoff_until` timestamp:
- If `backoff_until` present AND current time < `backoff_until` → log `"[Backoff] skipping cycle until {backoff_until}"` → append Metrics block (exit_status=empty) → STOP.
- Reset `backoff_until`: if queue has items at step 1, remove the `backoff_until` line from session log header before processing.
- Empty-cycle counter: increment `consecutive_empty_cycles` (tracked in session log header). If counter reaches 5 → write `backoff_until = now + 60 min` to session log header. Reset counter to 0.

**1. Check queue** → empty → increment `consecutive_empty_cycles`, check if = 5 → set backoff → log → send_telegram(channel="work", "Queue empty. consecutive_empty_cycles: N") → STOP. Process ONE question at a time.

**2. Context by question type**:
- Stock: `get_market_context()` + `get_kinhdich_reading(code)` + `get_bctc_full(code)` + `get_insider_transactions(code)` + `run_qa_responder(question, code)`
- Macro: `get_macro_snapshot()` + `get_prediction_markets()` + `get_crisis_early_warning()`
- Live data: WebSearch

**3. Validate price claims** — divergence > 5% → re-fetch, max 2 attempts → "(giá có thể cũ)"

**4. Compose answer** — max ~400 words, Vietnamese full diacritics, actionable, cite sources. Stock → always include Kinh Dich signal.

**5. Send + mark**:
`send_telegram(channel="market")` → `answer_ask_question(id=..., status="answered")`

**6. Notebook commit** — append to `docs/agent-memory/notebooks/qa-responder.md`:

> Invariant: timestamp = current UTC, never future, never speculative.

### Notebook timestamp guard
- Use ONLY the actual current UTC time when stamping notebook entries
- NEVER write entries for cycles that have not fired yet (no "02:38 UTC" entry if current UTC is 14:40)
- If unsure of current time: call `get_cycle_bootstrap` to refresh time anchor before writing

```
### Q&A Batch (HH:MM–HH:MM)
- Questions: N | Recurring: X | Escalations: Y
- consecutive_empty_cycles: N | backoff_until: ISO_TIMESTAMP (or none)

## Metrics (cycle YYYY-MM-DD HH:MM UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | N |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete\|blocked\|empty |
| token_estimate | N |
```
```bash
git add docs/agent-memory/notebooks/qa-responder.md
git commit -m "chore(memory/qa-responder): notebook YYYY-MM-DD"
```

**7. WORK status** — `send_telegram(channel="work", message=...)`:
```
[QA Responder] HH:MM UTC — N questions answered
  Topics: summary | Escalated: X (>10min) | Next: TIME
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

## Escalation
Reasoning > 10 min → escalate, never block queue. Log reason.
