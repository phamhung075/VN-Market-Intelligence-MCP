# Sprint Plan: Tran Ngoc Bau — Strategy Quality Supervisor

**Agent Name:** tran-ngoc-bau
**Purpose:** Quality assurance for analysis pipeline — validates cowork agent output, judges strategy adherence, and auto-corrects flow files.
**Model:** Sonnet
**Deployment:** Cowork (Claude Desktop)
**Status:** Planning → Design → Implementation → Merge

---

## Context

The existing cowork analysis team (8 agents + 1 unified coordinator) produces Telegram MARKET output that has 7 quality problems:

1. ~~Infrastructure dead~~ — RESOLVED (2026-05-06)
2. **Confidence=50 default passes gates** — meaningless signal confidence thresholds
3. **No content quality validation** — structure checked, not substance
4. **Signal dedup missing** — alerts have dedup; signals don't (duplicates to MARKET)
5. **Feedback loop open** — measure quality but don't auto-adjust
6. **No server-side format check** — validation happens at agent send-time
7. **3 agents bypass gatekeeper** — Digest-Predict daily, QA Responder, Market Watcher EOD

Tran Ngoc Bau's methodology is already embedded in the system (market-analyst flow: Thiên Thời / Địa Lợi / Nhân Hòa framework). This agent **enforces** that framework across all cowork agents.

---

## Agent Identity & Permissions

### Name & Metadata

```yaml
---
name: tran-ngoc-bau
color: purple
description: Strategy Supervisor. Validates cowork agent quality, enforces Trần Ngọc Báu methodology, auto-corrects flow files.
tools: Read, Edit, Write, Glob, Grep
model: sonnet
---
```

### Permissions

| Channel | Read | Write | Rule |
|---------|------|-------|------|
| MARKET | YES | NO | Signal quality audit only |
| WORK | YES | YES | Status reports, improvement proposals |
| BUG | NO | YES | Quality escalations (severity=medium) |
| **Flow files** | YES | YES | Auto-correct methodology violations |
| **Agent notebooks** | YES | NO | Understand agent state |
| **Agent session logs** | YES | NO | Audit what agents actually did |

### Constraints

- Full autonomy — no user approval needed
- Cannot modify agent `.md` files (only `.claude/flows/*/`)
- Cannot modify `docs/TASKS.md` or sprint plans
- Caveman mode for all Telegram comms
- Token economy: max 2k token output per report

---

## Quality Problems to Address (Phased)

### Phase 1: Core Quality Audit (IMMEDIATE)

| Problem | Scope | Solution | Owner |
|---------|-------|----------|-------|
| **#2: Confidence=50 default** | Alert Commander, signal evaluation | Add confidence-floor check to flow validation logic | tran-ngoc-bau |
| **#3: No content quality** | All 8 cowork agents | Audit message format, structure, Vietnamese diacritics | tran-ngoc-bau |
| **#4: Signal dedup missing** | News Scout, Market Watcher | Propose signal dedup gate to developer | tran-ngoc-bau |
| **#7: 3 agents bypass gatekeeper** | Digest-Predict, QA Responder, Market Watcher | Audit why exceptions exist, validate necessity | tran-ngoc-bau |

### Phase 2: Framework Enforcement (Week 2)

| Methodology | Validation | Action |
|---|---|---|
| Thiên Thời (global macro) | Alert Commander checks regime in Step 0b | Audit REGIME extraction accuracy |
| Địa Lợi (VN positioning) | Market Analyst applies top-down lens | Verify confidence gates respect CARRY_REGIME |
| Nhân Hòa (timing) | Market Watcher evaluates readiness | Confirm ≥3/5 alignment before firing |
| Regime caveat application | MARKET alerts annotated with regime warning | Validate Vietnamese text quality + diacritics |

### Phase 3: Auto-Cure (Week 3)

| Issue Type | Detection | Auto-Fix |
|---|---|---|
| Methodology violation | Confidence < threshold passed gate | Roll back: mark alert as suppressed, log correction to WORK |
| Signal duplicate | Same stock/type/conviction in 120-min window | Deduplicate, retire second signal |
| Format error | Vietnamese text missing diacritics / wrong struct | Log to BUG channel, propose fix |
| Content gap | Expected field (e.g., `regime_caveat`) absent | Auto-append from cached regime snapshot |

---

## System Design

### 1. Agent Definition (`.claude/agents/tran-ngoc-bau.md`)

```yaml
identity:
  mindset: Strategist who thinks like the user — reliable signals matter more than volume. Enforce methodology rigorously.
  skills:
    - Quality audit: message format, content, regime alignment
    - Methodology enforcement: Thiên Thời / Địa Lợi / Nhân Hòa framework
    - Flow file validation: check agent flows for methodology gaps
    - Auto-correction: modify flows to fix systematic issues
    - Signal effectiveness measurement: calibration vs ground truth

permissions:
  tools_packages:
    - bootstrap
    - tran-ngoc-bau-quality
  channels:
    market:
      write: false
      rule: audit_only
    work:
      write: true
      rule: improvement_proposals_only
    bug:
      write: true
      rule: quality_blockers_only

constraints:
  cannot_modify_agent_md: true
  cannot_modify_tasks_md: true
  caveman_mode_mandatory: true
  session_log_mandatory: true

knowledge:
  always_load:
    - path: .claude/knowledge/alert-policy.md
      fail_loud: true
    - path: .claude/knowledge/alert-message-format.md
      fail_loud: true
    - path: .claude/knowledge/stock-classification.json
      fail_loud: false
  lazy_load:
    - path: docs/ARCHITECTURE.md
      trigger: infrastructure_check
      fail_loud: false
    - path: docs/data/project-stats.json
      trigger: baseline_check
      fail_loud: false

flow:
  default: .claude/flows/tran-ngoc-bau/main.md
  catalog:
    - name: main
      path: .claude/flows/tran-ngoc-bau/main.md
      trigger: daily_review
      input: [Telegram MARKET messages, agent session logs, agent flows]
      output: quality report to WORK | flow corrections | BUG escalations

tools_package: .claude/tools/package/tran-ngoc-bau.md

memory:
  session_log: docs/agent-memory/sessions/YYYY-MM-DD-tran-ngoc-bau.md
  notebook: docs/agent-memory/notebooks/tran-ngoc-bau.md
  append_every_cycle: true

inter_agent:
  receives_from:
    - agent: scheduler (cron)
      mechanism: cowork_desktop
      trigger: daily_review
  sends_to:
    - agent: telegram
      mechanism: send_telegram(channel="work")
      trigger: improvement_proposal
    - agent: telegram
      mechanism: send_telegram(channel="bug")
      trigger: quality_blocker
```

### 2. Main Flow (`.claude/flows/tran-ngoc-bau/main.md`)

**Cycle:** Daily 20:00 VN (13:00 UTC) after all 8 cowork agents have completed their cycles.

**Steps:**

1. **Bootstrap**
   - Read `.claude/knowledge/alert-policy.md`
   - Read `.claude/knowledge/alert-message-format.md`
   - Read `docs/data/project-stats.json`
   - Get last 100 MARKET messages from Telegram

2. **Audit Phase**
   - Message count, format structure, regime caveats
   - Vietnamese diacritics (check for mojibake, missing marks)
   - Confidence scores: any ≥0.50 but <0.70 triggering MARKET? (Problem #2)
   - Regime alignment: did TIGHTENING/EASING caveat apply correctly?

3. **Agent Session Review**
   - Read yesterday's session logs for all 8 cowork agents
   - Check: which agents ran, how many signals fired, confidence distribution
   - Did any agent skip methodology steps (Thiên Thời / Địa Lợi / Nhân Hòa)?

4. **Flow Validation**
   - For each agent with low-quality output:
     - Read their `.claude/flows/*/main.md`
     - Check: does flow reference REGIME extraction?
     - Check: does flow apply regime thresholds?
     - Check: does flow attach regime caveat to MARKET output?
   - Identify systematic gap (same agent, same error)

5. **Dedup Check (Phase 2)**
   - Load `get_agent_signals(limit=200, hours=24)`
   - Group by stock_code + signal_type + direction
   - Flag clusters with >1 identical signal in <120min window
   - Log to WORK: "Dedup: [TICKER] [type] fired 3x in 2h — likely duplicate"

6. **Report & Recommend**
   - **If high quality** (0 issues): "✓ MARKET output quality OK. X signals, Y alerts."
   - **If issues found**: "⚠️ Quality report: 5 issues found" + table of findings
   - For each systematic issue: "Recommend: modify flow/NNN.md line YYY to check regime before sending"

7. **Auto-Correct (Phase 3)**
   - If same error repeats 3+ cycles: auto-modify flow file
   - Example: Alert Commander not attaching regime caveat → add step
   - Commit fix: "Auto-fix(flow): enforce regime caveat in alert-commander/cycle.md"
   - Send WORK message: "Fixed: alert-commander flow — now validates regime before MARKET send"

8. **Notebook Write**
   - Append session log with findings, recommendations, any corrections applied
   - Track calibration: signal quality scores, agent reliability metrics

---

### 3. Tool Package (`.claude/tools/package/tran-ngoc-bau.md`)

```markdown
# Tran Ngoc Bau Tools

**MCP Pattern**: All calls via `mcp__claude_ai_gateway__call_tool(server="vn-market", tool="<name>", arguments={...})`

## Telegram Audit

- `read_telegram_reports(channel="market", limit=100)` → last 100 MARKET messages
- `send_telegram(channel="work", message="...")` → send quality report
- `send_telegram(channel="bug", severity="medium", title="...", description="...")` → escalate quality blocker

## Signal & Alert Data

- `get_agent_signals(limit=500, hours=24, signal_type="all")` → all signals fired in last 24h
- `get_alerts(type="all", hours=24)` → all alerts
- `record_signal_outcome(signal_id, verdict, reason)` → mark signal as audited, log reason

## System Health

- `get_market_context(hours_back=24)` → MARKET channel summary
- `get_macro_snapshot()` → current REGIME, CARRY_REGIME (validate agent extraction)
- `get_system_status()` → confirm infrastructure is healthy

## File Operations

- Standard: `Read`, `Edit`, `Write`, `Glob`, `Grep` (via file tools, not MCP)
```

### 4. Cowork Workspace File (`cowork-workspace-team-claude-desktop/08-tran-ngoc-bau.md`)

```markdown
You are Tran Ngoc Bau, Strategy Quality Supervisor.
MCP: https://zenmidi.com/mcp

**Model**: Claude Sonnet

**Schedule**: Daily 20:00 VN (13:00 UTC), after all analysis agents complete.

Read and execute `.claude/flows/tran-ngoc-bau/main.md`
```

### 5. Notebook (docs/agent-memory/notebooks/tran-ngoc-bau.md)

Freeform working memory. Updated after each cycle:

```markdown
# Tran Ngoc Bau Notebook

## Quality Metrics (Weekly)

- Signal quality score: % signals meeting confidence + methodology standards
- MARKET message quality: format errors, missing diacritics, regime caveats
- Agent reliability: which agents produce low-confidence outputs?
- Auto-corrections applied this week: count + descriptions

## Known Issues (Tracked)

- Alert Commander sometimes skips regime caveat → FIXED 2026-05-XX
- Digest-Predict daily bypass → flagged for review
- Market Watcher EOD dedup needed → proposed tool (gate-signal-dedup.md)

## Next Actions

- Interview: ask user what quality signals matter most
- Baseline: run quality audit on entire 2026-05 MARKET history
- Calibration: measure alert accuracy vs ground truth
```

### 6. Integration with Cron Schedule

**Addition to `.claude/knowledge/cron-jobs.md`:**

```markdown
| Schedule | Job | Agent | Model |
|----------|-----|-------|-------|
| 13:00 UTC daily (20:00 VN) | tran-ngoc-bau quality review | tran-ngoc-bau | sonnet |
```

No conflict: runs AFTER alert-commander EOD cycle (10 min UTC = 17:00 VN).

### 7. CLAUDE.md Update (Agent Routing)

Add to agent routing table:

```markdown
| Intent | Spawn |
|--------|-------|
| quality audit / strategy enforcement | `tran-ngoc-bau` |
```

---

## Implementation Tasks

### Task 1: Agent Definition & Flow Files (SCOPE: 3h)

- [ ] Create `.claude/agents/tran-ngoc-bau.md`
- [ ] Create `.claude/flows/tran-ngoc-bau/main.md` (steps 1–8 detailed)
- [ ] Create `.claude/flows/tran-ngoc-bau/audit-checklist.md` (format, regime, confidence gates)
- [ ] Create `.claude/tools/package/tran-ngoc-bau.md`
- [ ] Create `cowork-workspace-team-claude-desktop/08-tran-ngoc-bau.md`
- [ ] Create `docs/agent-memory/notebooks/tran-ngoc-bau.md` (empty template)

**Acceptance Criteria:**
- Agent can self-start via Cowork
- Flow file references all knowledge files
- Tool package lists all MCP calls needed
- No TypeScript errors (Read, Glob, Grep all work)

### Task 2: Knowledge Files & Documentation (SCOPE: 2h)

- [ ] Create `.claude/knowledge/alert-message-format.md` (extract from alert-commander flow + docs)
  - Vietnamese diacritics reference
  - Message structure template
  - Regime caveat text templates (Thiên Thời, Địa Lợi, Nhân Hòa)

- [ ] Update `.claude/knowledge/cron-jobs.md` → add tran-ngoc-bau schedule entry
- [ ] Update `CLAUDE.md` → add agent routing line
- [ ] Update `.claude/knowledge/agent-roster.md` → add tran-ngoc-bau to Analysis Team table

**Acceptance Criteria:**
- Alert message format SSOT exists
- All regime caveat Vietnamese text centralized
- No duplication across agent flows

### Task 3: Cowork Refresh Prompt (SCOPE: 0.5h)

Create a Cowork refresh prompt to load the new agent:

```markdown
# Cowork Refresh — Add Tran Ngoc Bau

[Paste this into Claude Desktop Cowork profile]

New agent: Tran Ngoc Bau (Strategy Quality Supervisor)
- Path: cowork-workspace-team-claude-desktop/08-tran-ngoc-bau.md
- Model: Sonnet
- Cycle: Daily 20:00 VN
- Purpose: Validate all cowork agent output for methodology adherence + quality
- Know issues tracked in: docs/agent-memory/notebooks/tran-ngoc-bau.md

Recent improvements:
- Alert message format standardized in .claude/knowledge/alert-message-format.md
- Cron schedule expanded to include daily quality review
- Agent roster updated to reflect full 9-agent analysis team
```

### Task 4: Integration Test (SCOPE: 1h)

- [ ] Manually trigger tran-ngoc-bau in Cowork
- [ ] Verify: reads MARKET messages, agent logs, flow files
- [ ] Verify: creates session log in `docs/agent-memory/sessions/YYYY-MM-DD-tran-ngoc-bau.md`
- [ ] Verify: appends notebook with findings
- [ ] Verify: sends WORK message with quality summary
- [ ] Verify: no crashes on missing files (fail-loud protocol)

**Acceptance Criteria:**
- Full cycle runs to completion
- Session log shows all 8 steps executed
- At least 1 quality finding detected (even if "quality OK")
- WORK message sent with summary

---

## Phased Rollout

### Phase 1 (Sprint 1847, Week 1): Audit-Only

- Agent runs daily, reports findings to WORK
- Does NOT auto-modify flows
- User reviews recommendations, approves changes manually
- Baseline: measure current quality metrics

### Phase 2 (Sprint 1848, Week 2): Framework Enforcement

- Add per-agent flow validation
- Check: Thiên Thời / Địa Lợi / Nhân Hòa steps present
- Verify: confidence gates respect regime thresholds
- **No auto-fixes yet** — report only

### Phase 3 (Sprint 1849, Week 3): Auto-Cure

- After 3+ identical errors in a row: auto-modify flow
- Example: regime caveat missing in 5 consecutive Alert Commander cycles → auto-add step
- Commit + WORK notification
- User can revert via git if needed

---

## Success Metrics

| Metric | Baseline | Target (Sprint 1849) |
|--------|----------|---------------------|
| MARKET message quality score | TBD | >90% (0–1 issues/day) |
| Confidence scores passing gates | 50+ min threshold | 70+ enforced |
| Signal dedups auto-applied | 0 | 2–5/week |
| Auto-corrections committed | 0 | ≥1/sprint |
| Agent reliability (quality signals) | TBD | >85% |
| User confidence in MARKET output | TBD | High (user feedback) |

---

## Files to Create/Modify

**New:**
- `.claude/agents/tran-ngoc-bau.md`
- `.claude/flows/tran-ngoc-bau/main.md`
- `.claude/flows/tran-ngoc-bau/audit-checklist.md`
- `.claude/tools/package/tran-ngoc-bau.md`
- `.claude/knowledge/alert-message-format.md`
- `cowork-workspace-team-claude-desktop/08-tran-ngoc-bau.md`
- `docs/agent-memory/notebooks/tran-ngoc-bau.md`
- `docs/agent-memory/sessions/2026-05-07-tran-ngoc-bau.md` (first run)

**Modify:**
- `.claude/knowledge/cron-jobs.md` (add schedule)
- `.claude/knowledge/agent-roster.md` (add to Analysis Team)
- `CLAUDE.md` (update agent routing table)

**Reference (no changes needed):**
- `.claude/knowledge/alert-policy.md`
- `.claude/flows/alert-commander/cycle.md`
- `.claude/flows/market-analyst/main.md`
- `.claude/flows/digest-predict/daily.md`
- All 8 cowork agent flows

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Agent reads stale Telegram API | Fail-loud protocol — stop if read fails |
| Auto-fix breaks a flow | Git commit + easy revert; user approval in Phase 1 |
| Dedup logic marks false positives | Confidence + direction match required (≥99% specificity) |
| Agent becomes slow (reads 100+ messages) | Early exit if 0 issues in first 50 messages |
| Methodology rules conflict | All rules derived from market-analyst/main.md (SSOT) |

---

## Success Criteria for Merge

- [ ] All agent + flow files created
- [ ] Knowledge files (alert-policy, alert-message-format) in place
- [ ] Agent roster + CLAUDE.md updated
- [ ] Cron schedule registered
- [ ] Integration test passes (full cycle 1 time)
- [ ] No tsc/lint errors
- [ ] Notebook template ready for first run
- [ ] Cowork refresh prompt prepared for user

---

## Next: Developer Implementation

Pass this plan to `developer` agent with:
1. Create all `.md` files using Write/Edit
2. Test cycle: trigger in Cowork, verify 8 steps, check logs
3. Git commit: "feat(quality): add tran-ngoc-bau strategy quality supervisor"
4. Report to QA with integration test results

Estimated effort: 6–8h total (tasks 1–4 sequential, can run task 2 in parallel with task 1).
