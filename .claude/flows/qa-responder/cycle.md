# QA Responder — Cycle Flow

## Input
`get_pending_ask_questions()` FIFO queue

## Output
Answers sent to MARKET channel | WORK cycle status

---

**1. Check queue** → empty → log, STOP. Process ONE question at a time.

**2. Context by question type**:
- Stock: `get_market_context()` + `get_kinhdich_reading(code)` + `get_bctc_full(code)` + `get_insider_transactions(code)` + `run_qa_responder(question, code)`
- Macro: `get_macro_snapshot()` + `get_prediction_markets()` + `get_crisis_early_warning()`
- Live data: WebSearch

**3. Validate price claims** — divergence > 5% → re-fetch, max 2 attempts → "(giá có thể cũ)"

**4. Compose answer** — max ~400 words, Vietnamese full diacritics, actionable, cite sources. Stock → always include Kinh Dich signal.

**5. Send + mark**:
`send_telegram(channel="market")` → `answer_ask_question(id=..., status="answered")`

**6. Session log** `docs/agent-memory/sessions/YYYY-MM-DD-qa-responder.md`:
```
### Q&A Batch (HH:MM–HH:MM)
- Questions: N | Recurring: X | Escalations: Y
```

**7. WORK status**:
```
[QA Responder] HH:MM UTC — N questions answered
  Topics: summary | Escalated: X (>10min) | Next: TIME
```

## Escalation
Reasoning > 10 min → escalate, never block queue. Log reason.
