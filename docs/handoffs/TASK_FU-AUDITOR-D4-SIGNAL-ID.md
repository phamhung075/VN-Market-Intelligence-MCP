---
sprint: SYSTEMIC-REMAKE-P1
branch: task/FU-AUDITOR-D4-SIGNAL-ID
size: S
zone: apps/mcp-server/
depends_on: []
blocks: []
---

## TL;DR
Replace batch id `sau-d4-{YYYYMMDDHHMM}` with per-finding discriminator `sau-d4-{ticker}-{check_id}-{YYYYMMDD}` in Auditor D4 emit path (wherever post_agent_signal fires for esc-datacov/esc-deepdive rows).

## [PM] Planning Context

**Zone:** apps/mcp-server/

**Target:** Auditor D4 emit path (wherever post_agent_signal fires for esc-datacov/esc-deepdive rows)

**Mechanism:** Replace the batch id `sau-d4-{YYYYMMDDHHMM}` with a per-finding discriminator: `sau-d4-{ticker}-{check_id}-{YYYYMMDD}`. This fixes 8 distinct per-ticker D4 findings colliding onto one signal id.

**Files to read first:**
- MCP server code where `post_agent_signal` is called for D4 checks (esc-datacov, esc-deepdive)
- Find current batch id generation logic
- `docs/standards/signal-schema.md` or related (signal id format constraints)

**Files to modify:**
- MCP server D4 emit path (TBD after reading — likely apps/mcp-server/src/infrastructure/signal-*.ts or similar)

**Files to create:**
- None

**Dependencies:** None

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- `docs/memory/feedback_auditor_d4_signal_id_collision.md` (issue background)

**Acceptance Criteria (machine-checkable):**

1. Synthetic auditor run emitting 8 distinct ticker/check pairs in one tick produces 8 distinct signal_queue row ids (not 1)
2. jq '.signal_queue.rows | group_by(.id) | map(select(length>1))'  == [] (no duplicate ids)
3. Each signal_queue row carries correct ticker and check_id discriminator

