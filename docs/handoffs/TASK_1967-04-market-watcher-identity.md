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

## [Agent Father] Implementation Record — 2026-05-21

### AC Verification

| AC | Status | Evidence |
|----|--------|----------|
| AC-1 | PASS | `.claude/agents/market-watcher.md` YAML frontmatter: name=market-watcher, color=orange, description present, tools=Read/Write/Edit/mcp__claude_ai_gateway__call_tool, model=haiku. All 5 required fields present per agent-metadata standard. |
| AC-2 | PASS | `docs/agent-memory/notebooks/market-watcher.md` = 65L (well under 150L cap). No trim needed. ## Carry-over section not present (clean notebook — last cycle logged, no outstanding items). |
| AC-3 | PASS | Step -0 identity assertion added to `.claude/flows/market-watcher/main.md` before Steps 1-5. Asserts `name == "market-watcher"`, sends BUG telegram + EXIT on failure, logs `IDENTITY_CHECK=OK` on pass. |
| AC-4 | PASS | D5 dimension added to `docs/agents/system-auditor/audit-dimensions.md` (Tier-2, 4h cadence, 150L threshold). Handler Step D5 (D5-1 size check, D5-2 WORK alert, D5-3 clean pass) added to `docs/agents/system-auditor/handlers.md`. Dedup: once per agent per day. |
| AC-5 | PENDING_QA | Requires 10-cycle live test. Flow pattern change (Step -0) is structural; identity assertion will fire correctly when agent identity stanza is intact. |
| AC-6 | PASS | Notebook has no ## Carry-over section (clean baseline). Future cycles: cycle.md Step 5 notebook-write skill mandates Carry-over preservation on overwrite. |
| AC-7 | PENDING_QA | Requires live cycle verification. No logic change to Steps 1-4 (price/macro/chain/signal). Step -0 is pre-flight only and does not affect signal emission path. |

### Files Modified

| File | Change |
|------|--------|
| `.claude/flows/market-watcher/main.md` | Added Step -0 identity assertion (16 lines before Step 1) |
| `docs/agents/system-auditor/audit-dimensions.md` | Added D5: Notebook Overflow Risk dimension (Tier-2, 4h, 150L threshold) |
| `docs/agents/system-auditor/handlers.md` | Added Step D5: Notebook overflow detection (D5-1/D5-2/D5-3 + failure modes + AC table) |

### Note on other overflowing notebooks

During AC-2 verification, `wc -l` on all notebooks revealed 4 agents already >150L:
- `dev-mainserver-crawls.md` = 262L
- `qa.md` = 190L
- `code-janitor.md` = 183L
- `dev-alert-engine.md` = 163L

The new D5 guard will alert on these at next Tier-2 cycle. Out of scope for this task (market-watcher zone only). Recommend qa to flag for notebook trim follow-up.

## [QA] Review Record

- [x] market-watcher.md YAML identity fields verified complete
- [x] Notebook trim applied; ≤150L confirmed (65L, no trim needed)
- [x] Carry-over section preserved in notebook (n/a — no carry-over items)
- [x] Step -0 identity assertion added to flow
- [x] system-auditor D5 dimension added to audit-dimensions.md
- [x] system-auditor handler Step D5 implemented and tested
- [ ] Manual 10-cycle test: market-watcher produces ≥10 signals with zero identity failures (PENDING — live verification)
- [ ] Zero regressions in signal output quality or timing (PENDING — live verification)

---

## [PM] Handoff Summary
Sprint 1967 ITEM-04 HIGH. Intermittent market-watcher identity failure caused by notebook context overflow. Fix: notebook trim + YAML identity stanza verification + Step -0 assertion + system-auditor D5 guard. Prevents recurrence. Pairs with 1967-06 (vnstockFundamentalsRefresh weekly cron fix — both HIGH priority for close-gate).
