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

## [Developer] Implementation Record

- **Files modified:**
  - `scripts/agents-flow/cowork-guaranteed-slot-firer.sh` — new `_bug_chat_id()` / `_alert_cooldown_ok()` / `_escalate_failure()` block; `log()` rewritten (no stdout on non-TTY) + new `log_err()`; escalation wired into all three non-zero exits of `run_firer()`; invocation log line now prints the real `trigger_prompt`.
  - `scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh` — `CURL_BIN`/`ALERT_STATE_FILE` seams, recording + failing curl stubs, cases T14–T25.
  - `docs/standards/cron-jobs.md` § Cowork Guaranteed-Slot Firer — new "Failure escalation" table.
  - `docs/policies/dev-standards.md` CANONICAL block — escalation contract + env seams + gate pointer.
- **Tests written:** `scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh` — 53 checks GREEN (28 pre-existing, unregressed; 25 new). RED baseline before the fix: 38 pass / 15 fail.
- **tsc status:** N/A — bash only, no `apps/` TypeScript touched.
- **Docs updated:** `docs/standards/cron-jobs.md`, `docs/policies/dev-standards.md`, `docs/WORK.md`.
- **Graphify:** skipped (no Skill-tool binding in a Task-spawned specialist — structural gap, `docs/agents/developer/flow/main.md` § Doc update).

### AC verdicts

- **AC-1 — MET, with a correction the AC itself got wrong.** The escalation POSTs to `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`. It does **NOT** bind to `TELEGRAM_BUG_CHAT_ID` as written in this handoff and in the row's `architect_review_note`: **no such key exists in `.env`.** The live key is `TELEGRAM_REPORT_BUG_CHANNEL_ID` (grep-verified against `.env`; `docs/data/system-map.json` `.telegram_channels[]` carries the wrong name for all three channels). Implementing AC-1 literally would have shipped an escalation that silently never fires — the exact defect class this row exists to close. `_bug_chat_id()` therefore resolves `FIRER_ALERT_CHAT_ID` → `TELEGRAM_REPORT_BUG_CHANNEL_ID` → `TELEGRAM_BUG_CHAT_ID`. Proven live: sourcing the script against the real `.env` resolves a 14-char id via `TELEGRAM_REPORT_BUG_CHANNEL_ID`.
- **AC-2 — MET.** Cooldown is time AND content based (`ALERT_STATE_FILE` = 2 lines: epoch, fingerprint; `ALERT_COOLDOWN_SECONDS` default 21600). An unchanged fingerprint is suppressed (T17, and reproduced end-to-end against the real `.env`); a new fingerprint alerts immediately (T18); an expired stamp re-alerts (T19). Content-sensitivity was added on top of the suggested plain 6h TTL because a pure TTL would have blinded the channel to a *new* episode opening inside the window.
- **AC-3 — MET.** `CURL_BIN` + `CURL_RECORD_FILE` + `ALERT_STATE_FILE` seams; a recording curl stub and a failing curl stub; asserts the alert fires on `overall_rc != 0` (T16) and does NOT fire on an all-success tick (T14) or a no-op tick (T15).
- **AC-4 — MET.** T23: with two matched slots where the first fails, the second still fires, both are attempted, and exactly ONE escalation is emitted for the tick.
- **Beyond the stated ACs, in scope per the row's own text:** matcher failure / unparseable matcher output also escalate (T21/T21b) — strictly worse than one slot failing, since NO slot can fire; `--dry-run` never escalates (T22); missing creds and failed sends fail loud (T20/T20b).
- **Folded items closed (row said "do it in this pass, do not mint a row"):** log-fidelity — the invocation log printed `-p 'slot=<id>'` while executing `-p "$trigger_prompt"` (T24); double-logging — `log()`'s `tee -a "$LOG_FILE"` duplicated every line because launchd's `StandardOutPath` for this job IS that same file (T25).

### Live verification (not asserted from prose)

- `bash scripts/agents-flow/cowork-guaranteed-slot-firer.sh --dry-run` against the real matcher + real `cowork-schedule.json`: exit 0, matched the genuinely-due `digest-sunday` slot, emitted **zero** stdout on a non-TTY run, and logged the real prompt `run docs/agents/digest-predict/flow/main.md  slot=digest-sunday`.
- Controlled failure against the **real** `.env` with a recording curl (token masked, zero network): one POST to `sendMessage` with `chat_id=-1003…`, text `1 of 1 guaranteed slot invocation(s) FAILED this tick — fb-daily=exit1`. Second identical tick: 0 POSTs, log line `escalation suppressed by cooldown (21600s, unchanged fingerprint 'slots:fb-daily=exit1')`.

### Flagged, NOT fixed here (outside this row's file scope)

`docs/data/system-map.json` `.telegram_channels[].env_var` names three keys that do not exist in `.env`: `TELEGRAM_BUG_CHAT_ID`, `TELEGRAM_WORK_CHAT_ID`, `TELEGRAM_MARKET_CHAT_ID` (live: `TELEGRAM_REPORT_BUG_CHANNEL_ID`, `TELEGRAM_INFO_WORK_CHANNEL_ID`, `TELEGRAM_INFO_MARKET_GROUP_ID`). CLAUDE.md names `system-map.json` the no-hardcode SSOT, so any future consumer that reads `env_var` from it and does not defend itself the way `_bug_chat_id()` does will silently resolve nothing. Needs a board row against `docs/data/system-map.json`.
