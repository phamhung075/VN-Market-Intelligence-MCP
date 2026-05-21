---
sprint: 1967
branch: task/1967-04-market-watcher-identity
size: S
zone: .claude/agents/
depends_on: []
blocks: []
---

## TLDR
Market-watcher shows intermittent identity-assertion failures (SUCCESS → SILENT → FAILURE pattern repeating every other cycle). Root cause: notebook truncation on token context limits → identity stanza assertions lost. Fix: (1) trim notebook to ≤150L hard max, (2) strengthen YAML identity stanza with explicit step -0 assertion, (3) add system-auditor notebook-size guard to catch future overflows.

## [PM] Planning Context

**Zone:** `.claude/agents/` (market-watcher.md) + `.claude/agents/system-auditor/` (monitoring)

**Acceptance Criteria:**
- [ ] AC-1: `docs/agents/market-watcher.md` identity stanza (YAML frontmatter) reviewed; if name/color/description fields missing, add them with canonical values (per agent-metadata standard 2026-04-21)
- [ ] AC-2: market-watcher notebook at `docs/agent-memory/notebooks/market-watcher.md` trimmed to ≤150L (currently ~95L, well under cap; verify it stays under even after 3-day active market session)
- [ ] AC-3: Step -0 added to market-watcher/main.md (or cycle.md dispatcher): explicit identity assertion before any MCP call. Example: `assert $AGENT_NAME == "market-watcher" || STOP`. Detects context overflow silently truncating identity.
- [ ] AC-4: system-auditor Tier-2 audit-dimensions.md expanded with D5 dimension: notebook-size overflow guard (≥1 agent with notebook >150L → WORK alert). Auditor checks `docs/agent-memory/notebooks/` every cycle, logs any >150L violations.
- [ ] AC-5: market-watcher cycle.md repeats 10 times (manual trigger, or read from cowork schedule) with identity assertion present → zero failures logged. SUCCESS→SUCCESS→SUCCESS pattern (no SILENT or FAILURE).
- [ ] AC-6: Notebook carry-over preserved (## Carry-over section survives trim)
- [ ] AC-7: Zero user-facing signal degradation; market-watcher produces ≥1 signal per cycle as before

**Files to read first:**
- `docs/agents/market-watcher.md` (YAML frontmatter structure)
- `docs/agent-memory/notebooks/market-watcher.md` (current content, line count)
- `docs/agents/system-auditor/audit-dimensions.md` (current D1–D4 dimensions)
- `docs/agents/system-auditor/handlers.md` (Tier-2 audit pattern)
- Brief: `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md` context (ITEM-04 HIGH)

**Files to create:** None

**Files to modify:**
- `docs/agents/market-watcher.md` — Ensure YAML identity stanza is complete (name, color, description fields per agent-metadata standard)
- `docs/agent-memory/notebooks/market-watcher.md` — Trim to ≤150L if needed; ensure ## Carry-over section preserved
- `.claude/flows/market-watcher/main.md` or cycle.md — Add Step -0 identity assertion (2–3 lines)
- `docs/agents/system-auditor/audit-dimensions.md` — Add D5: notebook-size overflow detection (target: catch agents >150L)
- `docs/agents/system-auditor/handlers.md` — Add Tier-2 handler step (5–10 lines) iterating `docs/agent-memory/notebooks/*.md` files, checking size, logging violations

**Dependencies:** None

**Knowledge needed:**
- `docs/policies/dev-standards.md` (agent metadata standard)
- `docs/policies/agent-metadata-standard.md` or reference (agent-metadata standard from 2026-04-21)
- `docs/protocols/fail-loud-protocol.md` (assertion pattern for step -0)

## [Developer] Implementation Notes

### Step -0 identity assertion (market-watcher/main.md or cycle.md)
Add early in flow:
```
## Step -0: Verify agent identity (detect context overflow)

Assert that YAML frontmatter loaded correctly:
- Expected: agent name == "market-watcher"
- Action: If assertion fails, send_telegram(bug, "market-watcher identity lost — context overflow likely") + STOP
- Pattern: Log `IDENTITY_CHECK=OK` if passing, `IDENTITY_CHECK=FAIL` if any field missing/wrong
```

### Agent metadata standard (market-watcher.md YAML)
Ensure all fields present:
```yaml
name: market-watcher
color: [hex code]
description: [description text]
tools: [list of MCP tools]
model: [claude model]
```

### Notebook trim (market-watcher.md)
Current: ~95L. Target: ≤150L hard max. Apply ## Carry-over discipline if needed:
- Keep last 10–15 lines of recent findings + status
- Archive older logs to `docs/archive/notebooks/market-watcher-<date>.md`
- Preserve in-flight observations

### System-auditor D5 dimension
Add to audit-dimensions.md:
```
| D5 | Notebook overflow risk | .md files in docs/agent-memory/notebooks/ exceeding 150L | Tier-2 loop: check sizes, alert if ≥1 agent >150L | [sau-d5-NbOverflow] |
```

### Handler step (handlers.md)
```
# Step D5: Notebook overflow detection
for notebook in docs/agent-memory/notebooks/*.md; do
  lines=$(wc -l < "$notebook")
  if [[ $lines -gt 150 ]]; then
    send_telegram(channel="work", message="[system-auditor] Notebook overflow: $(basename $notebook) = $lines L (threshold 150L)")
  fi
done
```

---

## [QA] Review Record

- [ ] market-watcher.md YAML identity fields verified complete
- [ ] Notebook trim applied; ≤150L confirmed
- [ ] Carry-over section preserved in notebook
- [ ] Step -0 identity assertion added to flow
- [ ] system-auditor D5 dimension added to audit-dimensions.md
- [ ] system-auditor handler Step D5 implemented and tested
- [ ] Manual 10-cycle test: market-watcher produces ≥10 signals with zero identity failures
- [ ] Zero regressions in signal output quality or timing

---

## [PM] Handoff Summary
Sprint 1967 ITEM-04 HIGH. Intermittent market-watcher identity failure caused by notebook context overflow. Fix: notebook trim + YAML identity stanza verification + Step -0 assertion + system-auditor D5 guard. Prevents recurrence. Pairs with 1967-06 (vnstockFundamentalsRefresh weekly cron fix — both HIGH priority for close-gate).
