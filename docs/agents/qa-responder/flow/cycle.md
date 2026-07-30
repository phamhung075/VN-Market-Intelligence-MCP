# QA Responder — Cycle Flow

**Tools:** `docs/agents/tools/package/qa-responder.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## INVARIANT — Timestamps

> **timestamp = current UTC, never future, never speculative**

- Before writing ANY timestamp (notebook header, session log, backoff_until, WORK message): run `date -u +"%Y-%m-%dT%H:%M:%SZ"` and use that value verbatim.
- NEVER round up, pick an "approximate close time", or speculate about future minutes.
- NEVER re-order notebook entries — new entries are ALWAYS appended after existing ones (monotonic append only).
- If `date -u` is unavailable: call `get_cycle_bootstrap` to obtain a time anchor. Use that value. Do not guess.

---

## Input
`get_pending_ask_questions()` FIFO queue

## Output
Answers → MARKET channel (/ask answers ONLY) | Cycle status → WORK | Errors → BUG

> Channel rule: MARKET = /ask answers only. Status ("queue empty", batch counts) → WORK. Never mix.

---

**0a. TIME ANCHOR** — run `date -u +"%Y-%m-%dT%H:%M:%SZ"` at cycle start. Store as `$CYCLE_START_UTC`. All timestamps in this cycle use this anchor or a subsequent `date -u` call. Never use a cached or inferred value from a prior cycle.

**0b. Adaptive backoff check** — read session log header for `backoff_until` timestamp:
- If `backoff_until` present AND current time < `backoff_until` → log `"[Backoff] skipping cycle until {backoff_until}"` → append Metrics block (exit_status=empty) → STOP.
- Reset `backoff_until`: if queue has items at step 1, remove the `backoff_until` line from session log header before processing.
- Empty-cycle counter: increment `consecutive_empty_cycles` (tracked in session log header). If counter reaches 5 → run `date -u +"%Y-%m-%dT%H:%M:%SZ"` → write `backoff_until = <result + 60 min>` to session log header (compute offset arithmetically from the `date -u` output — NEVER speculate). Reset counter to 0.

**1. Check queue** → empty → increment `consecutive_empty_cycles`, check if = 5 → set backoff → log → run `date -u +"%Y-%m-%dT%H:%M:%SZ"` → `send_telegram(channel="work", message="[QA Responder] HH:MM UTC — Queue empty. consecutive_empty_cycles: N")` using that timestamp → STOP. Process ONE question at a time.

**2. Context by question type**:
- Stock: `get_market_context()` + `get_kinhdich_reading(code)` + `get_bctc_full(code)` + `get_insider_transactions(code)` + `run_qa_responder(question, code)`
- Macro: `get_macro_snapshot()` + `get_crisis_early_warning()`
  > The live Polymarket market-fetch call formerly here was retired by FIX-POLYMARKET-FETCH-DEAD-GEOBLOCK-ACTUATOR (2026-07-31, architect RULING: RETIRE — gamma-api.polymarket.com blocked at the ISP level by France's ANJ gambling regulator, MCP tool deregistered).
- Live data: WebSearch

**3. Validate price claims** — divergence > 5% → re-fetch, max 2 attempts → "(giá có thể cũ)"

**4. Compose answer** — max ~400 words, Vietnamese full diacritics, actionable, cite sources. Stock → always include Kinh Dich signal.

**4b. CLAIM-TRUTH GATE (real-time — emit signal on MISMATCH, proceed with time-sensitivity override)**
→ skill: `.claude/skills/claim-truth-gate/SKILL.md`
Real-time /ask answer: before sending to MARKET, run the gate on `answer_text` to detect CCATO (Claim Contradicts Authorized Tool Output) — same time-sensitivity semantics as `alert-commander/flow/stage-dispatch-log.md` Step 4a-pre (this flow answers a live user question, not a scheduled digest).
```
GATE_EXIT = skill `.claude/skills/claim-truth-gate/SKILL.md`
  post_body = <answer_text>
  agent_id  = "qa-responder"
  cache     = <this cycle's tool-call results, or null>
```
- `0` = PASS → proceed to Step 5 send.
- `1` = FAIL — contradiction detected; signal emitted to `po` by script. Self-correct: call the named tool directly, rewrite the offending sentence in `answer_text` using real returned values, re-run the gate. Second-pass PASS → proceed. Second-pass FAIL (tool genuinely errors) → write the honest gap in place of the false claim and proceed to send anyway (time-sensitivity: user is waiting on an answer).
- `2` = config-error → fail-loud: `send_telegram(channel="bug", message="[qa-responder] claim-truth-gate CONFIG ERROR")` and EXIT. Do NOT treat as PASS.
> No-Bash session note: qa-responder's tool grant is Read/Write/Edit/WebSearch/mcp__gateway__call_tool only (no Bash) — apply SKILL.md § "No-Bash cowork subagent sessions" (manual scan substitute) whenever the shell script cannot be invoked this session.

**5. Send + mark**:
`send_telegram(channel="market", message=<answer_text>)` → `answer_ask_question(id=..., status="answered")`

**6. Notebook commit** — append to `docs/agent-memory/notebooks/qa-responder.md`:

> Invariant: timestamp = current UTC, never future, never speculative.

### Notebook timestamp guard
- Run `date -u +"%Y-%m-%dT%H:%M:%SZ"` immediately before writing the notebook entry. Use the result verbatim for both `HH:MM–HH:MM` range and the Metrics header.
- `HH:MM` start = `$CYCLE_START_UTC` (captured at step 0a). `HH:MM` end = fresh `date -u` call at this step.
- NEVER write entries for cycles that have not fired yet (no "02:38 UTC" entry if current UTC is 14:40).
- NEVER re-order entries — always append AFTER the last existing entry. If an existing entry has a later timestamp than the current cycle start, append anyway with correct current UTC (do not backfill or insert mid-file).
- If unsure of current time: call `get_cycle_bootstrap` to refresh time anchor before writing.

```
### Q&A Batch (HH:MM–HH:MM UTC)
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
**Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/qa-responder.md]
# intent: "chore(memory/qa-responder): notebook YYYY-MM-DD"
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/qa-responder.md
git commit -m "chore(memory/qa-responder): notebook YYYY-MM-DD" -- docs/agent-memory/notebooks/qa-responder.md
```

**7. WORK status** — run `date -u +"%H:%MZ"` → use result as `HH:MM UTC`. `send_telegram(channel="work", message=...)`:
```
[QA Responder] HH:MM UTC — N questions answered
  Topics: summary | Escalated: X (>10min) | Next: HH:MM UTC (= current UTC + 12 min, computed from date -u, never speculative)
```
> "Next:" time MUST be computed as `date -u` result + 12 min arithmetic. NEVER write a round or guessed time.

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

## Escalation
Reasoning > 10 min → escalate, never block queue. Log reason.
