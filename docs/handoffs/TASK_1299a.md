# HANDOFF — Task 1299a: Tool Index + Reference Docs

layer: docs
sprint: 1299
status: Todo
effort: 2–3h
depends: none
blocks: 1299b

---

## Goal

Create 3 reference documents that 1299b (code) will use as SSOT:
1. `docs/TOOL_INDEX.md` — 107 tools × 1-line reference
2. `docs/SKILL_MANIFEST.md` — 9 skills × tool list (JSON-parseable block)
3. `docs/agent-memory/modules/tool-loading.md` — findings + decisions

---

## Sources to read (all 3 required)

| Source | Purpose |
|--------|---------|
| `docs/data/tool-registry.json` | Canonical 107 tool names + categories |
| `.claude/knowledge/mcp-tools.md` | Per-agent tool lists (## Tools Per Agent section) |
| `docs/REQ_1299.md` (## Tool Inventory) | Category counts cross-check |
| `docs/TECH_1299.md` (## digest_predict trim) | Trim decisions already made — use them |

---

## Deliverable 1: `docs/TOOL_INDEX.md`

Format: one row per tool, sorted alphabetically within category groups.

```markdown
# MCP Tool Index — Sprint 1299

Total: 107 tools | 41 categories | Updated: 2026-04-23

## [Category Name] (N tools)

| Tool | Description |
|------|-------------|
| tool_name | ≤15 word description |
```

Rules:
- Description ≤ 15 words. No input/output types needed (BA knows these).
- Group by category (use categories from tool-registry.json)
- File total ≤ 9k tokens (each line ~80 chars → ~107 rows + headers = safe)
- Cross-check: every tool in tool-registry.json categories must appear

Validation before commit:
```bash
# Count rows (should be ≥107 data rows)
grep -c "^| " docs/TOOL_INDEX.md
# Check no tool appears twice
grep "^| " docs/TOOL_INDEX.md | awk -F'|' '{print $2}' | sort | uniq -d
```

---

## Deliverable 2: `docs/SKILL_MANIFEST.md`

Critical: must include a machine-readable JSON block that `agentBootstrap.ts` mirrors exactly.

```markdown
# Skill Manifest — Sprint 1299

Updated: 2026-04-23
Purpose: SSOT for skill → tool mapping. Developer mirrors JSON block in agentBootstrap.ts.

## JSON Manifest (machine-readable)

\`\`\`json
{
  "news_scout":           ["tool1", "tool2", ...],
  "financial_analyst":    ["tool1", "tool2", ...],
  "market_watcher":       ["tool1", "tool2", ...],
  "alert_commander":      ["tool1", "tool2", ...],
  "digest_predict":       ["tool1", "tool2", ...],
  "dev_team":             ["tool1", "tool2", ...],
  "qa_responder":         ["tool1", "tool2", ...],
  "unified_coordinator":  ["tool1", "tool2", ...],
  "_always_on":           ["get_cycle_bootstrap", "submit_feedback", "get_recent_fixes", "log_agent_work", "send_telegram", "post_agent_signal", "get_agent_signals"]
}
\`\`\`

## Per-Skill Detail

### news_scout (~21 tools)
[list]

### financial_analyst (~29 tools)
[list]

### market_watcher (~32 tools)
[list]

### alert_commander (~25 tools)
[list]

### digest_predict (49 tools — trimmed per TECH_1299.md)
[list — use the exact 49 tools from TECH_1299.md ## digest_predict section]

### dev_team (~16 tools)
[list]

### qa_responder (~21 tools)
[list]

### unified_coordinator (~47 tools)
[list]

## Always-On Tools (7)

| Tool | Reason |
|------|--------|
| get_cycle_bootstrap | Opening sequence all agents |
| submit_feedback | Error reporting mandatory |
| get_recent_fixes | De-dup before bug reports |
| log_agent_work | Work logging mandatory |
| send_telegram | Reporting channel |
| post_agent_signal | Inter-agent coordination |
| get_agent_signals | Signal inbox |

## Unused Tools (not in any skill)

List tools from tool-registry.json not appearing in any skill above.
These are candidates for future deprecation (Sprint 1302+).
```

**digest_predict MUST use exactly the 49 tools from TECH_1299.md** (3 tools already trimmed: `read_telegram_reports`, `get_agent_work_log`, `get_label_accuracy_report`).

Source for all other skill tool lists: `.claude/knowledge/mcp-tools.md` → `## Tools Per Agent`.

Validation:
```bash
# Verify JSON block is valid
python3 -c "import json,re; txt=open('docs/SKILL_MANIFEST.md').read(); m=re.search(r'\`\`\`json(.+?)\`\`\`',txt,re.S); json.loads(m.group(1))" && echo "JSON valid"
# Count tools in digest_predict (must be 49)
python3 -c "import json,re; txt=open('docs/SKILL_MANIFEST.md').read(); m=re.search(r'\`\`\`json(.+?)\`\`\`',txt,re.S); d=json.loads(m.group(1)); print(len(d['digest_predict']))"
```

---

## Deliverable 3: `docs/agent-memory/modules/tool-loading.md`

```markdown
---
agents: architect, developer, ba
trigger: tool-loading, skill-manifest, context-optimization
---

# Module: Tool Loading (Sprint 1299)

Status: NEW — 2026-04-23

## Design decisions

- SKILL_MANIFEST lives in agentBootstrap.ts (interface layer) — NOT domain/
- digest_predict trimmed from ~52 → 49 tools (read_telegram_reports, get_agent_work_log, get_label_accuracy_report removed)
- always-on = 7 tools (get_cycle_bootstrap, submit_feedback, get_recent_fixes, log_agent_work, send_telegram, post_agent_signal, get_agent_signals)
- Session cache: pure in-memory LRU, TTL 8h, max 100 sessions, NOT on SSE path

## Token targets

| Skill | Tools | Target tokens |
|-------|-------|---------------|
| news_scout | ~21 | ~12.6k |
| digest_predict | 49 | ~29.4k |
| unified_coordinator | ~47 | ~28.2k |
| All skills | — | <30k ✓ |

## Known issues

None at creation. Verify after 1299b that import-check test passes.

## Next tasks

- 1299b: implement agentBootstrap.ts + server.ts modification
- 1299c: sessionToolCache + trackSessionToolUsageJob
```

---

## Definition of Done

- [ ] `docs/TOOL_INDEX.md` — 107 tools, grouped by category, ≤9k tokens
- [ ] `docs/SKILL_MANIFEST.md` — 9 skills + `_always_on`, valid JSON block
- [ ] digest_predict in manifest = exactly 49 tools (TECH_1299.md list)
- [ ] `docs/agent-memory/modules/tool-loading.md` created with front-matter
- [ ] JSON block validates with python3 check above
- [ ] Commit: `docs(1299a): Create TOOL_INDEX + SKILL_MANIFEST for skill-gated loading`

---

## Links

- REQ: `docs/REQ_1299.md`
- TECH: `docs/TECH_1299.md` (digest_predict trim in ## digest_predict Tool Trim section)
- Source tool list: `.claude/knowledge/mcp-tools.md` ## Tools Per Agent
- Source categories: `docs/data/tool-registry.json`

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/data/tool-registry.json   # corrected toolCount 107→108 (off-by-one stale, category sum = 108)

files_actually_created:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/TOOL_INDEX.md   # 108 tools, 41 categories, alphabetical within groups
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/SKILL_MANIFEST.md   # 9 skills + _always_on, valid JSON block, digest_predict=49
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/agent-memory/modules/tool-loading.md   # front-matter + design decisions + flow + DDD risk

tests_written: []   # docs-only task, no code

tests_skipped: []

tsc_clean: true
full_suite_pass: true

finding: tool-registry.json toolCount field was 107 but category sum = 108. Corrected. TOOL_INDEX lists 108 tools. All validations pass: JSON valid, digest_predict=49, _always_on=7, 0 duplicates.
