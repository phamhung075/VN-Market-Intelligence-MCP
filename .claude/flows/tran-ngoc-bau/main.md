# Tran Ngoc Bau — Quality Audit Flow

**Tools:** `.claude/tools/package/tran-ngoc-bau.md`

> **MCP call pattern:** Every tool in this flow → `call_tool(server="vn-market", tool="<name>", arguments={...})` via the MCP gateway `call_tool`.

## Error Boundary

If ANY tool call fails after 1 retry:
1. `send_telegram(channel="bug", message="[tran-ngoc-bau] Step N failed: {one-line error}")`
2. Append to session log: `"Cycle HH:MM — BLOCKED at step N: {error}"`
3. **EXIT immediately.** Do NOT investigate infrastructure or write incident docs.

Your job = audit quality → review sessions → auto-cure → log. Blocked = report + EXIT.

---

## Input
Telegram MARKET messages, agent session logs, agent flows, full MCP data access

## Output
Quality report to WORK | Flow corrections (auto-cure) | BUG escalations | Session log

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `tran-ngoc-bau`)

**Step 0c — Bootstrap**
- Load `.claude/knowledge/alert-policy.md` (fail-loud)
- Load `.claude/knowledge/alert-message-format.md` (fail-loud)
- `get_macro_snapshot()` → extract REGIME, CARRY_REGIME, DXY_SIGNAL, US10Y_SIGNAL
- `get_system_status()` → confirm infrastructure healthy. If DOWN → send BUG, EXIT.

> **Gateway-down handling:** If MCP gateway call fails → send BUG one-line error → EXIT. Do NOT switch to "file-evidence mode" — session logs contain PAST state that may be wrong. Auditing from stale files produces hallucinated findings. Report the failure and exit.

## Phase 1: Audit MARKET Messages

**Step 1 — Read MARKET channel**
`read_telegram_reports(channel="market", limit=50)` → last 50 messages

For each message, check:
- [ ] Vietnamese diacritics present (no mojibake, no missing marks)
- [ ] Message structure follows `.claude/knowledge/alert-message-format.md`
- [ ] Confidence displayed as 0–1 decimal (not percentage, not raw integer)
- [ ] Regime caveat appended when required (TIGHTENING + bullish must have caveat)
- [ ] Ticker symbol valid (in watchlist or known VN stock)
- [ ] No duplicate messages (same ticker + same signal type within 2h)

**Step 2 — Cross-validate with live data**
For each MARKET alert about a specific ticker:
1. `get_market_snapshot()` → verify current price
2. Check if alert price diverges >5% from current → flag as STALE
3. If alert claims earnings beat/miss → `compare_financials(codes=[ticker])` to verify
4. If alert claims price anomaly → `get_price_history(code=ticker, days=5)` to verify sigma
5. If alert claims sector move → `get_sector_comparison(code=ticker)` to verify

Log: `"[Verify] [TICKER] claim={X} actual={Y} → MATCH|MISMATCH"`

## Phase 2: Review Agent Sessions

**Step 3 — Read agent session logs**
```
Glob: docs/agent-memory/sessions/YYYY-MM-DD-*.md  (today's date)
```
For each agent session:
- Did agent extract REGIME at bootstrap? (check for "REGIME" keyword in log)
- Did agent apply regime thresholds? (check for threshold values)
- Did agent attach regime caveat to MARKET output?
- Did agent log signal outcomes?

Agents to audit: news-scout, market-watcher, alert-commander, financial-analyst, report-analyzer, digest-predict, qa-responder, unified-agent

**Step 4 — Validate agent flows**
For agents with quality issues found in Step 3:
1. Read their flow file: `.claude/flows/{agent}/cycle.md` or `main.md`
2. Check: does flow reference REGIME extraction?
3. Check: does flow apply regime-conditioned thresholds?
4. Check: does flow attach regime caveat?
5. If systematic gap (same error 3+ cycles in notebook history) → AUTO-CURE (Step 6)

## Phase 3: Signal Quality

**Step 5 — Signal bus audit**
`get_agent_signals(limit=200, hours=24)` → all signals in last 24h

Check:
- Confidence distribution: flag if >50% of signals have default confidence (0.50)
- Dedup: group by `stock_code + signal_type + direction` — flag clusters with >1 in 120min
- Signal effectiveness: `get_signal_effectiveness()` → check hit rate per signal type
- Brier calibration: any signal type with hit_rate < 30% → flag for review

`get_alert_accuracy(days=7)` → check alert accuracy trends

## Phase 4: Auto-Cure & Report

**Step 6 — Auto-cure flow files** (only after 3+ identical errors)
If notebook shows same error repeated 3+ cycles:
1. Read the offending flow file
2. Identify the missing/incorrect step
3. `Edit` the flow file to add/fix the step
4. Log: `"[AutoCure] {agent}/flow.md — added regime caveat check at Step N"`
5. Send to WORK: `"[Tran Ngoc Bau] Fixed: {agent} flow — {description}"`

**Step 7 — Quality report to WORK**
```
[Tran Ngoc Bau] Quality Audit HH:MM UTC
MARKET messages: N checked | M issues
- {issue 1}
- {issue 2}
Agent sessions: N reviewed | M methodology gaps
Signals: N total | M dedup candidates | P low-confidence
Auto-cures: N applied
Overall: {GOOD|NEEDS_ATTENTION|CRITICAL}
```
`send_telegram(channel="work", message=report)`

If severity >= critical (data mismatch, price stale >5%, DB down):
`send_telegram(channel="bug", message=escalation)`

**Step 8 — Session log**
`log_agent_work(action="quality_audit", context={...})`
Append `docs/agent-memory/sessions/YYYY-MM-DD-tran-ngoc-bau.md`:
```
### Quality Audit (HH:MM–HH:MM UTC)
- MARKET messages: N checked, M issues
- Agent sessions: N reviewed, M gaps
- Signals: N total, dedup={X}, low_conf={Y}
- Auto-cures: N applied
- Regime: REGIME | Carry: CARRY_REGIME
- Overall: GOOD|NEEDS_ATTENTION|CRITICAL
```

## End-of-cycle notebook write
→ skill: `.claude/skills/notebook-write/SKILL.md` (replace `<agent-id>` with `tran-ngoc-bau`)

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

## Step 9 — PO handoff if findings require dev work

Skip this step ONLY if audit found zero issues (Overall: GOOD, no auto-cures needed, no mismatches).

If audit found code/system issues that need fixing (methodology gaps, flow bugs, signal logic errors, data mismatches, threshold violations, missing checks):

1. Compile a findings summary with:
   - Each issue: what's wrong, which agent/file/module, severity, evidence
   - Suggested fix category: `fix` | `refactor` | `feat`
   - Affected area: agent name, flow path, or source code path

2. **Spawn PO agent** with prompt:
   ```
   run .claude/flows/po/main.md

   ## TNB Audit Findings (cycle N)
   {paste findings table here}

   Create sprint tasks for these issues. Prioritize by severity.
   ```

## RETURN

```
DONE: Quality audit — N MARKET msgs, M agent sessions, K auto-cures | Overall: GOOD|NEEDS_ATTENTION|CRITICAL
NEXT: po (spawned with findings) | user (if GOOD — no issues)
PIPELINE: complete
QUALITY: full | partial
```
