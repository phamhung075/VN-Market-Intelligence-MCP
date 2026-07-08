## Task Report F1-LAUNCHD-COWORK-BACKSTOP

**Scope:** scripts + launchd config only, per architecture brief `docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md`. No container/service touched. Dispatched to qa via a PO review-lane sweep (stale `next_agent: developer` self-pointer — developer had already implemented + self-reviewed the task; PO re-pointed to qa for independent sign-off).

**Note on this report's authorship:** the implementation (commit `4df3d1545`) was completed and self-reviewed by developer before this QA pass. This report documents QA's own independent RAW re-verification — every check below was re-run by qa directly, not accepted from PO's or developer's relayed claims.

### Changed (commit `4df3d1545`, already on `main`)
- `scripts/agents-flow/cowork-guaranteed-slot-firer.sh` (new, 225L)
- `scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh` (new, 203L)
- `launchd/com.vn-market.cowork-guaranteed-slot-firer.plist` (new, 139L)
- `scripts/cowork-fb-daily-firer.sh` (retired, -143L)
- `launchd/com.vn-market.fb-daily-firer.plist` (retired, -108L)
- `docs/standards/cron-jobs.md`, `docs/policies/dev-standards.md` (docs updated)
- `scripts/agents-flow/cowork-match-slots.js` — reused, 0-diff (confirmed via `git show --stat 4df3d1545`)

### 1. Test suite — re-run independently
```
bash scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh
...
Results: 25 passed, 0 failed
```
Matches PO's relayed figure exactly (own re-run, not trusted from report). Covers: no-match no-op, non-guaranteed filtered out, single/two/mixed guaranteed slots, `--dry-run`, missing-claude-binary, matcher-command-failure, malformed-matcher-JSON, bounded-exec hung-process kill (T10), CLI real-subprocess + `--dry-run` invocation. Zero real `claude`/`node` invocations confirmed — all test paths route through a fake-claude stub under `/private/tmp/...` and a mocked `SLOT_MATCHER_CMD`.

### 2. Acceptance-criteria source read (task-board `acceptance` field, verbatim)
| Clause | Verified how | Result |
|---|---|---|
| matcher-driven | `firer.sh:91` → `SLOT_MATCHER_CMD` defaults to `node .../cowork-match-slots.js`; file 0-diff in commit | PASS |
| `guaranteed===true` filter | `firer.sh:189` → `jq -c '[.slots[]? \| select(.guaranteed == true)]'` | PASS |
| `trigger_prompt` read off slot object, not hardcoded | `firer.sh:146` → `jq -r '.trigger_prompt // empty'`; behaviorally confirmed by test T3 (`RECORD_FILE` shows the real invoked prompt = the full `chef.md slot=chef-morning` string, not a hardcoded literal) | PASS |
| `timeout 1800` bound | `FIRE_TIMEOUT_SECONDS` default `1800` (`firer.sh:95`) via `_bounded_exec()`; T10 regression proves a hung process is killed near the configured bound, not the full sleep duration; this host verified to lack both `timeout`/`gtimeout` so the bash background+watchdog fallback is the real (not theoretical) production path | PASS |
| test-first, zero real claude/node invocations | confirmed by own re-run (§1) | PASS |
| fb-only script+plist retired | `find . -iname "*fb-daily-firer*"` (excl. logs/reports) → no hits; `launchctl list \| grep -i vn-market` → no `fb-daily-firer` label | PASS |
| new `guaranteed:true` slot needs ZERO script edits | test T3b (`brand-new-guaranteed-slot-xyz`, not present in the script) fires correctly | PASS |

### 3. Plist inspection
`plutil -lint launchd/com.vn-market.cowork-guaranteed-slot-firer.plist` → `OK`. Direct read confirms `StartInterval=900`, `RunAtLoad=false`, `KeepAlive=false` — matches the brief's §5 row 2 spec exactly.

### 4. No-orphan check
`launchctl list | grep -i vn-market` → only `com.vn-market.docker-events`, `com.vn-market.fleet-push`, `com.vn-market.docker-cleanup`. Old `com.vn-market.fb-daily-firer` label absent (matches the incident's own finding that it was already silently unloaded). New `com.vn-market.cowork-guaranteed-slot-firer` label also not yet loaded — correct: install (`launchctl load`) is a separate ops-owned gated task per the brief §5 row 4, explicitly out of this task's declared scope ("Scope is scripts + launchd config only — no container/service touched").

### 5. DDD / Security / mock-guard
Not TS domain code — no domain→infrastructure import surface. `bash -n` syntax check clean on both scripts. Secret-grep (`password|secret|token`) → only prose mentions of token *cost*/Telegram *token* env-loading, no literal secret values. `bash scripts/audits/mock-guard.sh --files "scripts/agents-flow/cowork-guaranteed-slot-firer.sh launchd/com.vn-market.cowork-guaranteed-slot-firer.plist"` → `No production source files to scan. PASS.` (mock-guard scans TS; bash/plist out of its pattern set — expected, not a false green).

### 6. Out of scope (correctly not attempted by this QA pass)
- Full architecture-brief §6 "session-down survival test" items 2/4/7 (kill live CLI session, `launchctl load` install, injected-fault Tier-1 test) — these belong to ops' install task and the sibling `FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED` task (separate `REVIEW` row, same brief), not this task's board-declared acceptance criteria.
- `docs/protocols/cowork-master-cron-runbook.md` doc fix — owned by `agent-father` per the brief §5 row 5, independent of this task.

**verdict: APPROVED / DONE_VERIFIED** — flipped `docs/data/orch/orch-state.json` `task_board.review[]` → `task_board.done_verified[]` via `scripts/qa-f1-launchd-cowork-backstop-done-verified.jq` + `scripts/orch-apply.sh` (guarded on `.head.active_task_id` still pointing at this task). `.head` idle-reset (`status:"done"`, `next_agent:"router"`, `active_task_id:null`).
