# Tran Ngoc Bau — Quality Audit Flow

**Tools:** `.claude/tools/package/tran-ngoc-bau.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
Telegram MARKET messages, agent notebooks, agent flows, full MCP data access

## Output
Quality report to WORK | Flow corrections (auto-cure) | BUG escalations | Notebook commit

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `tran-ngoc-bau`)

**Step 0b2 — Check previous handoff ACK**

If `docs/handoffs/tnb-audit-latest.md` exists, check for `## PO ACK` section at the bottom:
- **ACK present** → PO read previous cycle. Log `"Previous handoff ACK'd by PO"`. Proceed.
- **ACK missing** → PO never processed previous findings. Log `"⚠ Previous handoff NOT ACK'd by PO — findings may be lost"`. Flag in session log. Include this in Step 9 findings as a persisting blocker.

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

## Phase 2: Review Agent Notebooks

**Step 3 — Read agent notebooks**
```
Glob: docs/agent-memory/notebooks/*.md
```
For each agent notebook (check the latest appended cycle entry — today's date or most recent):
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
`get_agent_signals(agent="tran-ngoc-bau", status="all")` → all signals addressed to tran-ngoc-bau

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

**Step 7 — Quality report to WORK** — `send_telegram(channel="work", message=...)`:
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

**Step 8 — Notebook commit**

> Invariant: timestamp = current UTC, never future, never speculative.

### Notebook timestamp guard
- Before writing `docs/agent-memory/notebooks/tran-ngoc-bau.md`, ALWAYS get current UTC via:
  ```
  date -u +"%Y-%m-%dT%H:%M:%SZ"
  ```
- Use the returned value verbatim — NEVER speculate, NEVER round to a future minute
- NEVER write entries for cycles that have not fired yet

`log_agent_work(action="quality_audit", context={...})`
Append to `docs/agent-memory/notebooks/tran-ngoc-bau.md`:
```
### Quality Audit (HH:MM–HH:MM UTC)
- MARKET messages: N checked, M issues
- Agent notebooks: N reviewed, M gaps
- Signals: N total, dedup={X}, low_conf={Y}
- Auto-cures: N applied
- Regime: REGIME | Carry: CARRY_REGIME
- Overall: GOOD|NEEDS_ATTENTION|CRITICAL
```
Then:
```bash
git add docs/agent-memory/notebooks/tran-ngoc-bau.md
git commit -m "chore(memory/tran-ngoc-bau): notebook YYYY-MM-DD"
```
Convention: `.claude/knowledge/commit-convention.md` § Notebook Commits

## End of cycle
→ skill: `.claude/skills/cowork-end-cycle/SKILL.md`

## Step 9 — PO handoff (ALWAYS)

**Never skip this step.** PO decides what's actionable — TNB does not filter.

1. Write `docs/handoffs/tnb-audit-latest.md` (overwrite each cycle):
   ```markdown
   # TNB Audit — Cycle {N} — {date}

   ## Overall: GOOD|NEEDS_ATTENTION|CRITICAL
   Direction: IMPROVING|STABLE|DEGRADING (vs previous cycle)

   ## Findings
   | # | Issue | Agent/Module | Severity | Category | Evidence |
   |---|-------|-------------|----------|----------|----------|
   | 1 | ... | ... | high/med/low | fix/refactor/feat | ... |

   ## Auto-cures applied
   - {list what was auto-fixed this cycle, or "None"}

   ## Persisting blockers
   - {carried-over issues from previous cycles}

   ## Positive signals
   - {improvements, recoveries, upgrades worth noting}
   ```

2. If zero issues found (Overall: GOOD, no auto-cures, no persisting blockers), still write the file with empty Findings table and filled Positive signals section.

3. **Signal dev-team** — drop a signal file in `docs/signals/`:
   ```
   Filename: docs/signals/tnb-{ISO timestamp}.json
   ```
   ```json
   {
     "from": "tran-ngoc-bau",
     "to": "po",
     "type": "audit-handoff",
     "payload": "docs/handoffs/tnb-audit-latest.md",
     "priority": "high|normal",
     "createdAt": "{ISO timestamp}"
   }
   ```
   - `priority: "high"` if Overall is NEEDS_ATTENTION or CRITICAL
   - `priority: "normal"` if Overall is GOOD
   - **Do NOT write pipeline-state.json** — that file is dev-team internal only

## RETURN

```
DONE: Quality audit — N MARKET msgs, M agent sessions, K auto-cures | Overall: GOOD|NEEDS_ATTENTION|CRITICAL
NEXT: po
HANDOFF: docs/handoffs/tnb-audit-latest.md
PIPELINE: continue
QUALITY: full | partial
```
