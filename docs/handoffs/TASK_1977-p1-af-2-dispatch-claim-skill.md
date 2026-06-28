---
sprint: CROSS-SESSION-MULTI-TEAM-ORCH
branch: task/1977-p1-af-2-dispatch-claim-skill
size: M
zone: .claude/skills/
depends_on: ["TASK_1973"]
blocks: ["TASK_1980"]
---

## TLDR

Lift `.claude/skills/dispatch-claim/SKILL.md` from agent scope to router scope. Canonicalize the `task_id` namespace per brief §3.1 (use `intent:<agent>:<intent-key>` for router dispatch). Require `owner_client_session=$CLAUDE_CODE_SESSION_ID` on every claim. Document the spawn-prompt passing convention: `$CLAUDE_CODE_SESSION_ID` is a coordination parameter, NOT a credential (never echoed by subagents).

## [PM] Planning Context

- **Zone:** .claude/skills/
- **Acceptance Criteria:**
  - [ ] `.claude/skills/dispatch-claim/SKILL.md` lines 10-71 are rewritten to lift from agent-scope (per-agent task_id namespace) to router-scope (canonical `intent:<agent>:<intent-key>` namespace per brief §3.1)
  - [ ] The SKILL documents that `task_id` MUST use the pattern `intent:<agent>:<intent-key>` where `<intent-key>` is the canonical key from the dispatch table (e.g., `intent:dev-mcp-server:migration-sql-first` for the first P1-MCP task)
  - [ ] The SKILL requires `owner_client_session=$CLAUDE_CODE_SESSION_ID` be passed to every `task_claim` call
  - [ ] The SKILL documents the spawn-prompt passing convention: `$CLAUDE_CODE_SESSION_ID` is passed explicitly in the spawn prompt as a `coordination_param` (or similar phrasing), NOT as a credential that should be echoed or logged
  - [ ] Examples in the SKILL show the correct `task_claim` invocation with both `owner_agent` (role) and `owner_client_session` (session UUID)
  - [ ] The SKILL cites the brief §3.1 for the canonical namespace and §2 for the session identity scheme
  - [ ] Commit message references the sprint brief and notes the scope lift (agent → router)

- **Files to read first:**
  - .claude/skills/dispatch-claim/SKILL.md (current version, agent-scoped)
  - docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md §3.1 (canonical task_id namespace), §3.2 (router gate), §2 (session identity scheme)
  - CLAUDE.md (to understand how the skill will be invoked from the router loop)

- **Files to create:** None (SKILL update only)
- **Files to modify:**
  - .claude/skills/dispatch-claim/SKILL.md lines 10-71
  
- **Dependencies:** TASK_1973 (migration SQL), TASK_1974 (coordinationStore matching-ladder must work for the claims to succeed)
- **Knowledge needed:**
  - `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md` §3.1 (canonical task_id namespace) — the entire section
  - Brief §2 (session identity scheme) — why caller-supplied owner_client_session is safe
  - Existing dispatch table pattern: `.claude/skills/dispatch/SKILL.md`

## [Developer] Implementation Notes

1. **Canonical task_id namespace (per brief §3.1):**
   - Router dispatch: `intent:<agent>:<intent-key>` (NEW scope, this SKILL)
   - Examples:
     - `intent:dev-mcp-server:p1-mcp-1` (first migration task)
     - `intent:agent-father:claude-md-step-25` (CLAUDE.md gate)
     - `intent:qa:bctc-regression-suite` (QA regression tests)
   - Cron tick (unchanged): `cron:<flow-slug>:<period-key>` (date-range, not ISO week)
   - Sprint task (unchanged): `sprint-task:<task-id>` (matches task_board id)
   - Published artifact (unchanged): `published:<kind>:<period-key>`
   - Session presence (unchanged): `session-presence:$CLAUDE_CODE_SESSION_ID`

2. **Rewrite the SKILL (lines 10-71):**
   - Current scope: probably agent-internal task naming (each agent has its own task_id scheme)
   - New scope: router-level dispatch, using the canonical `intent:` prefix
   - Add a table mapping dispatch intents to canonical task_id keys:
     ```
     | Intent | Canonical task_id |
     |--------|-------------------|
     | deploy dev-mcp-server P1-MCP-1 | intent:dev-mcp-server:p1-mcp-1 |
     | deploy agent-father AF-1 | intent:agent-father:p1-af-1 |
     | ... |
     ```

3. **owner_client_session usage:**
   - Emphasize: MUST be `$CLAUDE_CODE_SESSION_ID` (the harness-injected UUID)
   - If unset, the dispatcher can mint a fallback (e.g., `host-$(hostname)-pid-$$-ts-$(date +%s)`) but should log a WARNING
   - Provide shell snippet for the dispatcher:
     ```bash
     if [ -z "$CLAUDE_CODE_SESSION_ID" ]; then
       CLAUDE_CODE_SESSION_ID="host-$(hostname)-pid-$$-ts-$(date +%s)"
       echo "[router-warn] CLAUDE_CODE_SESSION_ID unset, minting fallback: $CLAUDE_CODE_SESSION_ID"
     fi
     ```

4. **Spawn-prompt passing convention:**
   - Add a section: "Passing $CLAUDE_CODE_SESSION_ID to Subagents"
   - Clarify: DO pass it in the spawn prompt as a parameter (e.g., "This task is coordination_session=$CLAUDE_CODE_SESSION_ID")
   - DO NOT treat it as a credential or secret (subagents may refuse to echo env vars for security)
   - DO frame it as an operational coordination parameter in all docs/flows

5. **Testing:**
   - Verify the SKILL can be sourced and called from the router
   - Spot-check one dispatch: `source .claude/skills/dispatch-claim/SKILL.md; dispatch_claim_task "intent:dev-mcp-server:p1-mcp-1" "session-uuid-xxx"`
   - Verify the returned task_id is canonical (`intent:dev-mcp-server:p1-mcp-1`)

---

## AC: Inspect SKILL

After code lands:
```bash
# Verify the SKILL uses the canonical namespace
grep -E "intent:[a-z-]+:" .claude/skills/dispatch-claim/SKILL.md
# Should show the canonical task_id patterns

# Verify owner_client_session is required
grep -i "owner_client_session" .claude/skills/dispatch-claim/SKILL.md
```

## RETURN to PM

Once this task is DONE:
- Confirm the SKILL uses canonical `intent:` namespace
- Confirm owner_client_session is required in all examples
- Unblock TASK_1980 (P1-FINAL) — after all AF-* tasks land and the tooling is coherent
