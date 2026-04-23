# Sprint 1297 — Telegram Message Quality + Sequential Analysis

**Status**: ✅ COMPLETE
**Duration**: 2026-04-23 (19:00–21:45 UTC+7)
**Commits**: 3 (agent integration, skills, sequential tool)
**Test Result**: 6508/6508 PASS | tsc: CLEAN

---

## Summary

Resolved user feedback on Telegram message quality ("all messages agents send is not useful"). Root cause: agents listed skills in headers but never called them in workflow steps. Solution: created 6 factory skills + integrated into all agent files with explicit step-by-step instructions.

## Deliverables

### 1. Factory Skills (.claude/skills/)
| Skill | Purpose | When Called |
|-------|---------|-------------|
| **conviction-calculator** | 6-source confidence scoring (price, news, BCTC, Kinh Dich, foreign flow, position) | Step 3 in most agents |
| **kinh-dich-interpreter** | Hexagram meaning + timing validation | Step 4 (Alert Commander), Step 2 (Price/BCTC agents) |
| **narrative-formatter** | Structure alerts: Why/Confirms/Kinh/Next/Risk | Step 5 (Message formatting) |
| **pre-fire-validation** | 5-check gate (technical, Kinh, peers, flow, position) | Step 2 (Pre-alert filtering) |
| **quality-audit-loop** | Weekly signal accuracy + false positive analysis | Sunday Step 5 (unified-agent) |
| **signal-intelligence** | Policy/broker credibility validation + cascade outcome checking | Step 3 (news-scout, financial-analyst, market-watcher) |

**New MCP Tool**:
- **sequential-market-analysis** (106th tool) — Multi-step causal reasoning for complex market analysis (impact chains, contradictory signals, forensic deep dives)

### 2. Updated Agent Files

All 6 analysis agents now have SKILLS section + proper integration:

- **01-news-scout.md**: signal-intelligence in Step 3 (legal risk validation)
- **02-financial-analyst.md**: conviction-calculator + signal-intelligence in Step 2 (BCTC enrichment)
- **04-market-watcher.md**: kinh-dich-interpreter + conviction-calculator in Step 2 (anomaly verification)
- **05-alert-commander.md**: Complete 7-step flow with 6 skills orchestrated
- **06-digest-predict.md**: narrative-formatter + kinh-dich-interpreter in Step 2 (digest structure)
- **unified-agent.md**: quality-audit-loop in Step 5 (weekly review Sunday)

### 3. Documentation

**Strategic docs** (in /docs/):
- `SKILL_INTEGRATION_GUIDE.md` (400 lines) — Complete 8-skill inventory, Alert Commander pilot example, implementation checklist
- `SKILL_INTEGRATION_GAPS.md` — Root cause analysis (list-only vs step-integrated pattern)
- `AUDIT_TOOL_CAPACITY.md` — MCP tool utilization (agents use 25–40 of 105 tools; sequential-market-analysis now at 106)
- `BRAINSTORM_MSG_QUALITY.md` — Gap analysis + factory skill solutions
- `SKILLS_SUMMARY.md` — 8-skill quick reference table

**Operational docs**:
- `COWORK_REFRESH_20260423.md` — Paste-ready system message for user to reload agents

## Key Integration Pattern

**Alert Commander 7-step flow** (exemplar for all agents):

```
Step 0: Bootstrap (market context, agent signals, position data)
  ↓
Step 1: Review alerts + fetch BCTC/price/news context
  ↓
Step 2: PRE-FIRE VALIDATION (5 checks via pre-fire-validation skill)
  ├─ Technical check (data quality, ticker valid)
  ├─ Kinh Dich alignment (hex supports or contradicts)
  ├─ Sector peer comparison (idiosyncratic or sector-wide?)
  ├─ Foreign flow confirmation (flows align?)
  └─ Position insight (entry price, stop-loss, TP)
  ↓
Step 3: CONVICTION SCORING (6 sources via conviction-calculator)
  ├─ Price action (1% = meaningful)
  ├─ Volume (2x avg = confirmed)
  ├─ News sentiment (vs price direction)
  ├─ Cascade support (macro alignment)
  ├─ Sector momentum (inflow/outflow)
  └─ Kinh Dich evidence
  → Result: conviction ∈ [0.0, 1.0]
  ↓
Step 4: HEX INTERPRETATION (via kinh-dich-interpreter)
  → Returns: meaning, timing guidance, validates direction, next hexagram
  ↓
Step 5: MESSAGE FORMATTING (via narrative-formatter)
  → Why? | Confirms? | Kinh says? | Next? | Risk?
  ↓
Step 6: COMPRESSION (caveman ultra + token-economy)
  → Target: 200–300 tokens Vietnamese
  ↓
Step 7: FINAL DECISION
  IF conviction >= 0.70 AND NOT muted → send_telegram(channel="market")
  ELSE → suppress
```

## Code Changes

**Type: Feature**

Files added:
- 6 × `.claude/skills/{name}/SKILL.md`
- `src/interface/mcp/tools/analysis/sequential-market-analysis.ts` (MCP tool)
- `src/interface/mcp/tools/analysis/index.ts` (barrel export)

Files modified:
- `src/interface/mcp/tools/index.ts` (added analysis module)
- `src/interface/mcp/tools/registry.ts` (registered sequential-market-analysis)
- 6 × `.claude/agents/{agent}.md` (added SKILLS + step integration)

## Validation

✅ **Tests**: 6508/6508 PASS (baseline 6459 → 6508 = +49 new tests, all GREEN)
✅ **TypeScript**: tsc --noEmit → CLEAN
✅ **Integration**: All skills callable from agent workflows
✅ **Documentation**: SKILL_INTEGRATION_GUIDE.md + pattern examples complete

## Next Actions (Optional)

1. **Paste Cowork refresh** → User pastes `COWORK_REFRESH_20260423.md` content into Cowork to reload agents
2. **Monitor market open** → Observe WORK channel for deeper analysis chains (signals include reasoning steps)
3. **Weekly audit** (Sundays) → unified-agent calls quality-audit-loop to measure false positive rate
4. **Iterate** → If false positive rate >10%, refine thresholds in conviction-calculator or pre-fire-validation

## Commits

| Hash | Message |
|------|---------|
| `f39d0ad2` | feat: Add 6 factory skills + integration documentation |
| `0440b99b` | feat(mcp): Add sequential-market-analysis tool + update registry |
| `3fafabe8` | docs(agents): Wire 8 skills into agent workflows (from prior conversation) |

---

**Done!** Server ready. Skills integrated. Sequential thinking online. Await market open for live validation.
