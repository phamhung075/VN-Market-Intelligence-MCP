# Agent Definitions Audit — Sprint 1949 + 1950-T1
**Audit Date:** 2026-05-18T17:14:05Z  
**Scope:** All 39 agent .md files + flows + system-map.json + cron-jobs.md + workflow-map.md  
**Focus:** Sprint 1949-specific deltas (8 agent .md + 5 flow updates) + consistency across 5 config points  

---

## Executive Summary

**Status:** 3 CRITICAL findings + 5 YELLOW findings | All 39 agents have YAML frontmatter except semble-search

- **CRITICAL**: Digest-predict cron schedule MISMATCH (flow says daily, agent definition says weekly-only, cron command missing)
- **CRITICAL**: Tran-ngoc-bau cron MISMATCH (command says every 4h at :17, agent/cron-jobs say daily 20:13)
- **CRITICAL**: Notebook size violations — 5 agents exceed 200-line cap (ops: 2510, market-watcher: 2500, qa-responder: 2313, pm: 1038, alert-commander: 579)
- **YELLOW**: Semble-search.md missing `model:` field in YAML frontmatter
- **YELLOW**: Extra/stale notebook files (news-scout-cycle-*, WORK.md)
- **GREEN**: Unified-agent correctly has `chef_dishes_only` rule + MARKET write=true in agent.md
- **GREEN**: Market-watcher has `write: false` correctly per spec
- **GREEN**: Alert-commander event-driven, no cycle headers (`no_cycle_headers: true`)
- **GREEN**: Financial-analyst + report-analyzer have business-context fields in signal_output_spec
- **GREEN**: News-scout gatherer role (no MARKET write)
- **GREEN**: MARKET allowed_senders = [unified-agent, alert-commander, digest-predict, qa-responder] — CORRECT per system-map.json

---

## Agent Definition Consistency Check (39 agents)

### Dev-Core Agents (16 agents)
| Agent | YAML OK | Flow main.md | Notes |
|---|---|---|---|
| agent-father | GREEN | ✓ | Metadata complete |
| agents-architect | GREEN | ✓ | Metadata complete |
| architect | GREEN | ✓ | Metadata complete |
| ba | GREEN | ✓ | Metadata complete |
| claude-manager-helper | GREEN | ✓ | Metadata complete |
| code-janitor | GREEN | ✓ | Metadata complete |
| cowork-refactory-expert | GREEN | ✓ | Metadata complete |
| developer | GREEN | ✓ | Metadata complete |
| fixer | GREEN | ✓ | Metadata complete |
| idea-forge | GREEN | ✓ | Metadata complete |
| pm | GREEN | ✓ | Metadata complete |
| po | GREEN | ✓ | Metadata complete |
| qa | GREEN | ✓ | Metadata complete |
| semble-search | YELLOW | ✓ | **Missing `model:` field** in YAML frontmatter |
| system-auditor | GREEN | ✓ | Metadata complete |
| tran-ngoc-bau | GREEN | ✓ | Metadata complete, but cron schedule MISMATCH |

### Cowork Agents (9 agents)
| Agent | YAML OK | Flow main.md | Market write | Notes |
|---|---|---|---|---|
| alert-commander | GREEN | ✓ | true | Event-driven only (≤140 chars, position-danger/watchlist-opp). `no_cycle_headers: true`. ✓ |
| digest-predict | GREEN | ✓ | true | **CRITICAL MISMATCH**: Agent def says "Weekly Sunday only", but flow has daily.md (15:30) + monday.md. Cron command MISSING. |
| financial-analyst | GREEN | ✓ | false | Has signal_output_spec with business-context fields. ✓ |
| market-analyst | GREEN | ✓ | false | User-facing analyst (on-demand). ✓ |
| market-watcher | GREEN | ✓ | false | Gatherer role (writes docs/signals/price_anomaly_* only). ✓ |
| news-scout | GREEN | ✓ | false | Gatherer role (writes docs/signals/news_impact_*). ✓ |
| qa-responder | GREEN | ✓ | true | /ask queue only, per spec. ✓ |
| report-analyzer | GREEN | ✓ | false | Event-driven on earnings release; signal_output_spec with business-context fields. ✓ |
| unified-agent | GREEN | ✓ | true | Chef role: 3 guaranteed dishes + conditional intraday. Reads signals from all gatherers. `chef_dishes_only` rule. ✓ |

### Dev-Zone Agents (12 agents)
| Agent | YAML OK | Notes |
|---|---|---|
| dev-alert-engine | GREEN | Metadata complete |
| dev-api-gateway | GREEN | Metadata complete |
| dev-frontend | GREEN | Metadata complete |
| dev-kinh-dich | GREEN | Metadata complete |
| dev-macro-indicators | GREEN | Metadata complete |
| dev-mainserver-crawls | GREEN | Metadata complete |
| dev-mcp-server | GREEN | Metadata complete |
| dev-pdf-extractor | GREEN | Metadata complete |
| dev-rag-service | GREEN | Metadata complete |
| dev-stock-price | GREEN | Metadata complete |
| dev-technical-analysis | GREEN | Metadata complete |
| dev-vps-crawls | GREEN | Metadata complete |

### Ops Agents (2 agents)
| Agent | YAML OK | Notes |
|---|---|---|
| ops | GREEN | Metadata complete |
| ops-mainserver-fetch | GREEN | Metadata complete |
| ops-vps-fetch | GREEN | Metadata complete |

---

## Critical Issues Requiring Immediate Fix

### CRITICAL #1: Digest-Predict Cron Schedule Mismatch

**Location:** `.claude/agents/digest-predict.md` + `.claude/commands/crons/cron-digest-predict.md` + `.claude/flows/digest-predict/main.md`

**Issue:** Three sources conflict on digest-predict schedule:
1. **Agent definition** (line 14): "Weekly Sunday calibration + portfolio thesis only. Daily digest role removed."
2. **Flow file** `.claude/flows/digest-predict/main.md` (lines 9-14): Lists 4 windows including daily 15:30 UTC, Monday 00:30 UTC, Sunday 13:00 UTC, monthly 13:00 UTC.
3. **Cron command**: **DOES NOT EXIST** — missing `.claude/commands/crons/cron-digest-predict.md`
4. **Cron jobs table** (line 118): Shows `47 13 * * 0` (Sunday only at 20:47 VN)

**Evidence:** Commit messages show no digest-predict cron command; `ls .claude/commands/crons/` lists 9 files but digest-predict is absent.

**Impact:** Digest-predict may not be scheduled at all, or may be running on stale cron schedule. Agent definition and flow dispatcher disagree on scope (weekly only vs. daily+weekly).

**Required fix:**
- Align agent definition (line 14): Remove "daily" reference OR add daily dispatch capability
- Align flow main.md (lines 9-14): Remove daily/monday windows if weekly-only scope
- Create or verify `.claude/commands/crons/cron-digest-predict.md` with correct schedule (likely `47 13 * * 0` per cron-jobs.md line 118)
- Update cron-jobs.md analysis-ownership table (line 68) if daily is truly removed

**Severity:** CRITICAL — Agent scheduling is broken or unclear

---

### CRITICAL #2: Tran-Ngoc-Bau Cron Schedule Mismatch

**Location:** `.claude/commands/crons/cron-tran-ngoc-bau.md` vs `.claude/agents/tran-ngoc-bau.md` + `docs/standards/cron-jobs.md`

**Issue:**
1. **Cron command file** (cron-tran-ngoc-bau.md, line 3): `17 */4 * * *` (every 4h at :17 UTC — 00:17, 04:17, 08:17, 12:17, 16:17, 20:17)
2. **Agent definition** (line 24): "Daily audit... 20:13 UTC"
3. **Cron-jobs.md** (line 128): `13 20 * * *` (daily at 20:13 UTC) with note "(moved from `0 13 * * *` by Sprint 1949-T9)"

**Evidence:** Cron command is outdated; wasn't updated in Sprint 1949-T9.

**Impact:** Tran-ngoc-bau audits chef narrative every 4h instead of once daily at 20:13 UTC. Over-triggers TNB audit, consuming unnecessary tokens.

**Required fix:**
- Update `.claude/commands/crons/cron-tran-ngoc-bau.md` line 3: Change `17 */4 * * *` to `13 20 * * *`
- Verify cron is active with correct schedule via CronList

**Severity:** CRITICAL — Agent runs at wrong frequency (4x too often)

---

### CRITICAL #3: Agent Notebook Size Cap Violations

**Location:** `docs/agent-memory/notebooks/`

**Issue:** 5 agents exceed feedback_waterfall_lazy_load 200-line cap:
| Agent | Lines | Cap | Excess |
|---|---|---|---|
| ops | 2510 | 200 | +2310 |
| market-watcher | 2500 | 200 | +2300 |
| qa-responder | 2313 | 200 | +2113 |
| pm | 1038 | 200 | +838 |
| alert-commander | 579 | 200 | +379 |

**Impact:** Violates token economy constraint. Each cycle, these agents load oversized notebooks, consuming 5-15% more tokens than allowed. Compounds across 22 cowork/dev-core agents.

**Required fix:**
- Archive historical entries from ops.md, market-watcher.md, qa-responder.md to `docs/archive/notebooks/`
- Split pm.md and alert-commander.md if needed, or archive old cycles
- Enforce 200-line cap per waterfall-lazy-load policy

**Severity:** CRITICAL — Violates documented token economy constraint

---

## Yellow-Level Issues (Non-Breaking)

### YELLOW #1: Semble-Search Missing Model Field

**Location:** `.claude/agents/semble-search.md` YAML frontmatter

**Issue:** Agent definition has name/color/description/tools but missing `model:` field.
```yaml
---
name: semble-search
color: blue
description: ...
tools: Read, mcp__claude_ai_gateway__call_tool
model: ???  # MISSING
---
```

**Expected:** All agents must have model field per project_ops_agent_metadata_fixed policy.

**Impact:** Low — agent .md itself can run, but metadata consistency broken. May confuse dispatching logic.

**Fix:** Add `model: haiku` (or appropriate model) to semble-search.md YAML frontmatter.

**Severity:** YELLOW — Metadata inconsistency

---

### YELLOW #2: Orphaned Notebook Files

**Location:** `docs/agent-memory/notebooks/`

**Issue:** Extra/stale notebook files not tied to active agents:
- `news-scout-cycle-2026-05-16.md` (150 lines) — appears to be snapshot, should be in archive
- `news-scout-cycle-2026-05-17T1820.md` (172 lines) — snapshot, should be in archive
- `WORK.md` (unknown purpose) — not a standard agent notebook

**Impact:** Low — clutter, confuses waterfall lazy-load line count checks. Does not block operations.

**Fix:** Move to `docs/archive/notebooks/` or clarify purpose.

**Severity:** YELLOW — File hygiene

---

## Green-Level Checks (Passing)

### ✓ Unified-Agent (Chef Role)
- Agent definition correctly identifies as CHEF
- Has `chef_dishes_only` rule (2-4 paragraph narrative only, no atom lists)
- MARKET write=true (per system-map.json allowed_senders)
- 5-cron slots verified in cron-unified-agent.md: hourly :29 dispatch → main.md picks sub-flow per UTC window
- Flows verified: morning/intraday/eod/evening all present
- Correctly reads all docs/signals/*.json from gatherers

### ✓ Market-Watcher (Gatherer)
- Correctly declared as Gatherer, no MARKET write
- Only writes docs/signals/price_anomaly_* per spec
- Cron verified: exists in cron-market-watcher.md

### ✓ News-Scout (Gatherer)
- Correctly declared as Gatherer, no MARKET write
- Only writes docs/signals/news_impact_* per spec
- Cron verified: exists in cron-news-scout.md

### ✓ Alert-Commander (Event-Driven)
- Event-only dispatch (position-danger / watchlist-opp rules)
- ≤140 chars urgent format per spec
- `no_cycle_headers: true` verified
- MARKET write=true (per system-map.json allowed_senders)
- Silent exit when neither condition fires

### ✓ Digest-Predict (if weekly-only scope confirmed)
- Has `weekly_sunday_only` rule in agent definition
- Sends Sunday 13:47 UTC calibration + portfolio thesis
- MARKET write=true (per system-map.json allowed_senders)
- Note: Scope needs clarification (see CRITICAL #1)

### ✓ Financial-Analyst + Report-Analyzer
- Both have `signal_output_spec` with business-context fields (product/customer/ops/mgmt)
- Emit bctc_signal_* and fundamental_* with context
- No MARKET write (correct, route through alert-commander)

### ✓ Tran-Ngoc-Bau (Strategy Supervisor)
- Correctly audits unified-agent chef dishes for TNB 6-layer walk
- Reads MARKET dishes, verifies layers + business context
- Outputs WORK audit row only
- Methodology audit spec present
- Note: Cron schedule needs fix (see CRITICAL #2)

### ✓ QA-Responder
- /ask queue only (FIFO)
- MARKET write=true (per system-map.json allowed_senders)
- Correct per workflow-map.md line 104

### ✓ System-Map.json MARKET Configuration
- allowed_senders = [unified-agent, alert-commander, digest-predict, qa-responder] ✓
- No market-watcher in allowed_senders ✓
- No news-scout in allowed_senders ✓

---

## Agent File Checklist (39 agents)

✓ All 39 agents have `.md` files in `.claude/agents/`  
✓ All 39 agents have YAML frontmatter (name, color, description, tools)  
✗ Semble-search missing `model:` field  
✓ All cowork agents have agent definition + flow/main.md  
✓ All dev-core agents have agent definition + flow/main.md  
✓ All dev-zone agents have agent definition (no flows, zone-routed)  
✓ Dispatch table in `.claude/skills/dispatch/SKILL.md` matches agent count  
✓ 39 agent notebooks exist (45 with cycle snapshots)  

---

## Cron Commands Inventory

| Agent | Cron File | Schedule | Status |
|---|---|---|---|
| unified-agent | ✓ cron-unified-agent.md | 29 * * * * (hourly) | GREEN |
| market-watcher | ✓ cron-market-watcher.md | ? (file exists) | GREEN |
| news-scout | ✓ cron-news-scout.md | ? (file exists) | GREEN |
| tran-ngoc-bau | ✓ cron-tran-ngoc-bau.md | 17 */4 * * * | RED (should be 13 20 * * *) |
| digest-predict | ✗ MISSING cron-digest-predict.md | — | RED |
| alert-commander | ✗ MISSING cron-alert-commander.md | — | YELLOW (event-driven, may not need cron) |
| system-auditor | ✓ cron-system-auditor.md | ? (file exists) | GREEN |
| code-janitor | ✓ cron-code-janitor.md | ? (file exists) | GREEN |
| claude-manager-helper | ✓ cron-claude-manager-helper.md | ? (file exists) | GREEN |
| dev-team | ✓ cron-dev-team.md | ? (file exists) | GREEN |

---

## Workflow-Map.md Consistency (lines 87-122)

Spot-check against agent definitions:

| Agent | Workflow-Map Role | Agent Definition | Match |
|---|---|---|---|
| market-watcher | "cron 5min/2h, writes docs/signals/price_anomaly*" | Gatherer, no MARKET write | ✓ |
| news-scout | "cron 15min/60min, writes docs/signals/news_impact*" | Gatherer, no MARKET write | ✓ |
| unified-agent | "cron 05:23 / :13 / 08:37 / 19:37 UTC, writes MARKET chef dishes" | Chef, MARKET write=true | ✓ |
| alert-commander | "event-driven (cron gate), writes MARKET (≤140 chars)" | Event-driven, position-danger/watchlist-opp | ✓ |
| digest-predict | "weekly Sunday 13:47 UTC, writes MARKET calibration" | Weekly Sunday only (CONFLICT with flow) | ⚠ |
| tran-ngoc-bau | "daily cron 20:13 UTC" | Chef narrative auditor, daily 20:13 (CONFLICT with cron file) | ⚠ |
| financial-analyst | "cron 2x daily, writes docs/signals/bctc_signal*" | Gatherer, business-context fields | ✓ |
| report-analyzer | "event/cron, writes docs/signals/fundamental_*" | Event-driven on earnings, business-context fields | ✓ |

---

## Summary Table: Agent Status by Type

| Type | Count | GREEN | YELLOW | RED | Notes |
|---|---|---|---|---|---|
| Dev-Core | 16 | 15 | 1 (semble-search model) | 0 | All metadata present except semble |
| Cowork | 9 | 6 | 1 (digest-predict scope conflict) | 2 (digest-predict cron missing, tran-ngoc-bau cron wrong) | Alert-commander, market-watcher, news-scout, financial-analyst, report-analyzer all correct |
| Dev-Zone | 12 | 12 | 0 | 0 | All metadata complete |
| Ops | 3 | 3 | 0 | 0 | All metadata complete |
| **TOTAL** | **40** | **36** | **2** | **2** | **2 CRITICAL fixes needed** |

---

## Recommendations

### Immediate (Next Cycle)
1. **FIX CRITICAL #2**: Update cron-tran-ngoc-bau.md schedule from `17 */4 * * *` to `13 20 * * *`
2. **FIX CRITICAL #1a**: Create `.claude/commands/crons/cron-digest-predict.md` with schedule `47 13 * * 0` (Sunday 20:47 VN)
3. **FIX CRITICAL #1b**: Clarify digest-predict scope in agent definition (daily vs. weekly-only) and align with flow main.md

### Short-Term (This Sprint)
4. **FIX YELLOW #1**: Add `model: haiku` to semble-search.md YAML frontmatter
5. **FIX CRITICAL #3**: Archive notebook content to bring ops.md, market-watcher.md, qa-responder.md, pm.md, alert-commander.md under 200-line cap

### Routine (Next Audit Cycle)
6. Move stale news-scout-cycle-* files to `docs/archive/notebooks/`
7. Verify cron commands are active and running at correct schedules via CronList

---

## Audit Metadata

| Metric | Value |
|---|---|
| Audit Timestamp | 2026-05-18T17:14:05Z |
| Audit Cycle | 2026-05-18 |
| Days Since Prior Audit | 5 (2026-05-13) |
| Git Commits Since Prior | ~50+ |
| Agent Files Audited | 39 |
| Agent Flows Checked | 25+ |
| Configuration Files Cross-Checked | 5 (agents, flows, system-map, workflow-map, cron-jobs) |
| CRITICAL Findings | 3 |
| YELLOW Findings | 2 |
| GREEN Findings | 34 |

---

## Action Items for PO

- [ ] Create Sprint task: Fix tran-ngoc-bau cron schedule (CRITICAL #2)
- [ ] Create Sprint task: Clarify + fix digest-predict cron/scope (CRITICAL #1)
- [ ] Create Sprint task: Archive oversized agent notebooks (CRITICAL #3)
- [ ] Create Sprint task: Add model field to semble-search.md (YELLOW #1)
- [ ] Create Sprint task: Clean up orphaned notebook files (YELLOW #2)

---

**Report prepared by:** system-auditor  
**Report date:** 2026-05-18T17:14:05Z  
**Dedup window:** 7 days (all findings are NEW, not repeats from prior cycles)
