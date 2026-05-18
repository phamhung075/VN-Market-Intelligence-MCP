---
sprint: 1951
branch: task/1951a-remote-triggers-create
size: M
zone: .claude/ + docs/data/
depends_on: []
blocks: [1951b, 1951c]
---

## TLDR

Create all 17 RemoteTriggers in claude.ai workspace using the `RemoteTrigger` MCP tool. Source: `docs/data/cowork-schedule.json` (17-slot SSOT). Each trigger receives `cron_expression` and `trigger_prompt` from the file exactly. Write trigger IDs back to the SSOT file.

## [PM] Planning Context

### Zone
- `.claude/` (MCP integration, agents, flows)
- `docs/data/` (SSOT cowork-schedule.json)

### Acceptance Criteria
- [ ] **AC-1 (coverage):** All 17 slots in `docs/data/cowork-schedule.json` have a corresponding live RemoteTrigger in claude.ai. Verified by: `RemoteTrigger action=list` returns ≥20 triggers (3 pre-existing + 17 new) with names matching `slot_id` 1:1.
- [ ] **AC-2 (cron parity):** Each RemoteTrigger `cron_expression` matches the `cron` field of its source slot exactly. Zero cron drift. Verified by: for each of 17 slots, live trigger config `cron_expression` === `cowork-schedule.json` slot.cron.
- [ ] **AC-3 (prompt parity):** Each RemoteTrigger `job_config.ccr.events[0].prompt` matches `trigger_prompt` from its source slot exactly. Verified by: spot-check 3 triggers (chef-morning, news-scout-market, alert-commander-market).
- [ ] **AC-4 (trigger IDs persisted):** Each trigger ID is written to `docs/data/cowork-schedule.json` in a new field `trigger_id` on the matching slot row. JSON remains valid after write.
- [ ] **AC-5 (no create failures):** RemoteTrigger creation succeeds for all 17 slots. If trigger #N fails with 4xx error, document the error, stop, and report partial-success in handoff note (for PO escalation).

### Files to read first
- `docs/SPRINT_GOAL.md` — Sprint 1951 full goal + Phase 1 scope
- `docs/architecture-briefs/2026-05-18-cowork-master-scheduler.md` — §2.3 (SPIKE-1951a findings, RemoteTrigger API shape), §4 (time-table schema), §5-6 (Phase 1 + AC)
- `docs/data/cowork-schedule.json` — 17-slot SSOT with cron + trigger_prompt

### Files to create
None — only modify existing files.

### Files to modify
- `docs/data/cowork-schedule.json` — add `trigger_id` field to each of 17 slot rows (after creation). Preserve all other fields exactly.

### Dependencies
None — this is the anchor task for Phase 1.

### Knowledge needed
- `docs/policies/dev-standards.md` (dev.md governance, git convention)
- `docs/architecture-briefs/2026-05-18-cowork-master-scheduler.md` (OQ-1/OQ-2/OQ-3 answers, RemoteTrigger API call signature)
- `docs/data/cowork-schedule.json` (17-slot SSOT, trigger_prompt field)
- MCP tool: `RemoteTrigger` action=`create` with body shape per brief §2.3
  - Required fields: `name`, `cron_expression`, `job_config.ccr.environment_id` (env_011CV1yonRDFUhYhGEdkVwqj), `job_config.ccr.events` (array with prompt), `session_context.model`, `session_context.sources`, `mcp_connections`, `enabled_plugins`, `persist_session`

### Implementation notes
1. **Before creating triggers:** Validate `docs/data/cowork-schedule.json` JSON syntax + confirm 17 slots, all with non-null `cron` + `trigger_prompt`.
2. **For each slot in order:**
   - Call RemoteTrigger MCP tool with:
     - `name`: slot_id (e.g., "chef-morning")
     - `cron_expression`: slot.cron verbatim
     - `job_config.ccr.environment_id`: "env_011CV1yonRDFUhYhGEdkVwqj"
     - `job_config.ccr.events`: [{ "prompt": slot.trigger_prompt }]
     - `session_context.model`: "claude-sonnet-4-6" (per brief §2.3)
     - `session_context.sources`: [{ "git_repository": { "url": "https://github.com/phamhung075/VN-Market-Intelligence-MCP" } }]
     - `mcp_connections`: [{ "id": "vn-market-uuid", "name": "vn-market", "url": "..." }] ← look up from MCP server list
     - `enabled_plugins`: []
     - `persist_session`: false
   - Capture returned trigger ID.
   - Log to WORK: `[pm/1951a] Created trigger <slot_id> (ID: <trigger_id>)`
3. **After all 17 created:** Call RemoteTrigger action=`list` to verify all 17 are registered (≥20 total triggers visible).
4. **Write trigger IDs:** For each slot in cowork-schedule.json, add `"trigger_id": "<returned_id>"` field. Re-validate JSON.
5. **Commit:** `chore(1951a): create 17 RemoteTriggers via MCP tool` with all trigger IDs in commit message.

### Expected output in handoff notes
- Handoff note: List of all 17 (slot_id, trigger_id) pairs.
- If partial failure: report which trigger failed, error message, and count of successful triggers created so far.
- Cowork-schedule.json updated with `trigger_id` field per slot.
- WORK Telegram log of all creates.

---

## AC Summary
- Coverage: 17/17 slots have RemoteTrigger in claude.ai
- Cron parity: all expressions match SSOT exactly
- Prompt parity: spot-check 3 ✓
- Persistence: trigger IDs written to SSOT
- No failures during creation
