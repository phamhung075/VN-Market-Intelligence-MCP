---
sprint: FIX-COWORK-GUARANTEED-SLOT-FIRER-NO-FAILURE-ESCALATION
branch: task/fix-cowork-firer-escalation
size: S
zone: cross-service/
depends_on: []
blocks: []
---

## TLDR
Add failure-escalation path to cowork-guaranteed-slot-firer.sh using direct curl POST to Telegram BUG channel. Current state: 67h of 100% exit_code=1 failures produced zero alerts because the script has no MCP/gateway access and the flow-level escalation never runs. Implementation: reuse pattern from scripts/maybe-deploy-vps.sh (lines 35-41), add cooldown/dedup to prevent spam, update test suite.

## [PM] Planning Context

### Zone
`cross-service/` — bash-only script, no apps/<service> touched

### Acceptance Criteria
- [ ] AC-1: After run_firer() returns overall_rc != 0, script POSTs to BUG channel using curl -X POST https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage with TELEGRAM_BOT_TOKEN and TELEGRAM_BUG_CHAT_ID loaded from .env
- [ ] AC-2: Cooldown implemented (e.g., marker file with 6h TTL or only re-alert when error message text changes) so repeated failures on same root cause generate one alert per distinct episode, not per 900s tick
- [ ] AC-3: cowork-guaranteed-slot-firer.test.sh updated with stubs for TELEGRAM_BOT_TOKEN / TELEGRAM_BUG_CHAT_ID env vars + curl call recording fake; tests assert alert fires on overall_rc != 0 and does NOT fire on no-op/all-success tick
- [ ] AC-4: No regression in normal operation — script continues to fire all matched guaranteed slots even after a slot fires and fails

### Files to Read First
- `scripts/agents-flow/cowork-guaranteed-slot-firer.sh` (lines 141-223, _fire_one_slot + run_firer functions)
- `scripts/maybe-deploy-vps.sh` (lines 35-41, the reference curl-to-Telegram pattern to reuse)
- `cowork-guaranteed-slot-firer.test.sh` (test seam structure and CLAUDE_BIN stub pattern)
- `.env` (to understand Telegram token structure — verify TELEGRAM_BOT_TOKEN and TELEGRAM_BUG_CHAT_ID are present)

### Files to Create
None

### Files to Modify
- `scripts/agents-flow/cowork-guaranteed-slot-firer.sh` — Add failure escalation + cooldown after run_firer() returns non-zero (approx 20-30L addition)
- `cowork-guaranteed-slot-firer.test.sh` — Add stubs + curl recording fake + test assertions (approx 40-50L addition)

### Dependencies
None — self-contained single-script change

### Knowledge Needed
- `docs/policies/dev-standards.md` — script conventions
- `docs/agents-flow/cowork-guaranteed-slot-firer.sh` header comments (already in file) explain the existing architecture
- Telegram API contract: curl -X POST https://api.telegram.org/bot{TOKEN}/sendMessage with JSON body containing chat_id and text

### Design Notes from Architect (from orch-state.json field architect_review_note)
- Script explicitly has no gateway/MCP access (header line 75); curl-direct-to-Telegram is the ONLY viable escalation path
- Cooldown strategy: recommend marker file with 6h TTL to bound alert spam (one alert per episode), matching existing fail-loud convention (docs/policies/alert-policy.md verdictResolutionJob precedent)
- Test strategy: cowork-guaranteed-slot-firer.test.sh already stubs CLAUDE_BIN as fake executable with ENV overrides — follow same pattern for Telegram stubs
- BUILD-STANDARD: not-applicable (bash-only bug-fix/maintenance, no apps/<svc> touched)

### Context
From SPIKE-COWORK-GUARANTEED-SLOT-DIAGNOSTIC-WIRING (now DONE_VERIFIED): the firer script is invoked correctly on schedule and works end-to-end (matches slots, invokes claude -p correctly), but run_firer() correctly returns non-zero on failure (exit_code=1 from CLI) and nothing consumes that return code. The script has no MCP access of its own, so it cannot call send_telegram. The flow-level send_telegram never executes because the claude CLI dies before Step 0 runs. Result: 67h of guaranteed-slot failures with zero BUG-channel alerts (a silent false promise). This fix restores the escalation path.
