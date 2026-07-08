## Task Report FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED

**Scope:** `scripts/agents-flow/auditor-tier1-probe.sh` + `.test.sh` only, per architecture brief `docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md` §3.8/§6.7. No container/service touched. Dispatched to qa via a PO review-lane sweep (stale `next_agent: developer` self-pointer — developer had already implemented + self-reviewed the task in commit `eca602b5c`; PO re-pointed to qa for independent sign-off, having itself already re-run the suite = 79/79).

**Note on this report's authorship:** the implementation (commit `eca602b5c`) was completed and self-reviewed by developer, then RAW-reverified once by PO, before this QA pass. This report documents QA's own independent re-verification — every check below was re-run by qa directly, not accepted from PO's or developer's relayed claims. No `docs/handoffs/TASK_NNN.md` exists for this task (direct-to-main commit with board-row self-review, not the standard branch+handoff pipeline) — verified against the task-board `acceptance` field + architecture brief instead.

### Changed (commit `eca602b5c`, already on `main`)
- `scripts/agents-flow/auditor-tier1-probe.sh` (+69/-16): new `_check_launchd_agents()` (check 6), wired into `run_probe()` (`st_launchd`, `checks_json`, detail/verdict text updated 5→6 checks)
- `scripts/agents-flow/auditor-tier1-probe.test.sh` (+162): 19 new cases (T24-T30 shown below; the reported "79/79" also includes minor renumbering deltas across T1-T23 from the pre-existing 60)

### 1. Test suite — re-run independently
```
bash scripts/agents-flow/auditor-tier1-probe.test.sh
...
Results: 79 passed, 0 failed
```
Exact match to PO's relayed figure (own re-run, not trusted from report). Confirmed present and passing: T25 (INJECTED-FAULT FAILURE-on-missing-label), T26 (RESTORE → ALL_GREEN), T27 (multi-label — only the actually-missing label is named), T28 (missing `launchd/` source dir → FAILURE, not silent PASS), T29 (empty `launchd/` dir → ALL_GREEN, zero required labels), T30 (same injected-fault proven via a real CLI subprocess invocation of the script, not just the sourced-function path).

### 2. Mutation test (beyond what PO ran) — proves the suite is a real detector, not a tautology
Injected `return 0 # MUTATION-TEST-INJECTED` as the first line inside `_check_launchd_agents()` (simulates a future regression that silently no-ops the check) → re-ran the suite:
```
Results: 69 passed, 10 failed
```
10 assertions flipped to FAIL, including both mandatory injected-fault checks (T25, T30) and the multi-label/missing-dir cases (T27, T28). Reverted the mutation (`git diff scripts/agents-flow/auditor-tier1-probe.sh` → empty) → re-ran → back to 79/79. Confirms the test suite would genuinely catch a regression in this check, not just exercise a green no-op path.

### 3. Acceptance-criteria source read (task-board `acceptance` field, verbatim: *"auditor-tier1-probe.sh returns FAILURE + bug alert when a required vn-market LaunchAgent (incl com.vn-market.cowork-guaranteed-slot-firer) is absent from 'launchctl list'; injected-fault test proves FAILURE-on-missing then ALL_GREEN-on-restore."*)
| Clause | Verified how | Result |
|---|---|---|
| FAILURE verdict on missing label | `_check_launchd_agents()` returns 1 + names label; `run_probe()` sets `st_launchd="FAIL"`, appends to `failures`, overall verdict → FAILURE (unchanged pre-existing logic, reused) | PASS |
| Includes `com.vn-market.cowork-guaranteed-slot-firer` | live-confirmed: `launchd/com.vn-market.cowork-guaranteed-slot-firer.plist` exists in repo, its `Label` correctly parsed by the awk extractor (manually re-ran the exact awk one-liner against all 4 real `launchd/*.plist` files — all 4 labels parsed correctly) | PASS |
| SSOT — no hardcoded label list | `grep -n "com.vn-market" scripts/agents-flow/auditor-tier1-probe.sh` → zero hits; label is read live off each plist's own `<key>Label</key>`/`<string>` pair via `LAUNCHD_DIR="${LAUNCHD_DIR_PATH:-$REPO_ROOT/launchd}"` + a glob over `*.plist` | PASS |
| Injected-fault: FAILURE-on-missing → ALL_GREEN-on-restore | T25/T26 (fixture path) + T30 (real CLI-subprocess path), all re-run and PASS (§1); mutation test (§2) proves this isn't a tautological green | PASS |
| Bug-channel alerting | inherited unchanged via the existing FAILURE→spawn-system-auditor-subagent pipeline (`.claude/skills/cron-detect-loop/SKILL.md` Job 2 — pre-gate script result routes to subagent spawn on non-ALL_GREEN); confirmed no new alert code was added inside this READ-ONLY script (consistent with its own pure-shell/no-MCP-calls invariant, unchanged from pre-existing design) | PASS (inherited, not re-tested — pipeline itself out of this task's file scope) |
| 60 pre-existing tests unbroken | full 79/79 re-run includes all pre-existing T1-T23 cases, all green | PASS |

### 4. Live (unmocked) probe run — real production-state confirmation
Ran `bash scripts/agents-flow/auditor-tier1-probe.sh` directly (no fixtures/env overrides) against this host's real `launchctl list`:
```
{
  "verdict": "FAILURE",
  "detail": "launchd_agents: launchd not loaded: com.vn-market.cowork-guaranteed-slot-firer(not-loaded) com.vn-market.socat-bridge(not-loaded) ; ",
  "last_healthy_at": "2026-07-04T19:14:14Z"
}
```
Correctly names the 2 labels genuinely absent from `launchctl list` on this host right now:
- `com.vn-market.cowork-guaranteed-slot-firer` — expected: its `launchctl load` install is a separate ops-owned gated task (F1-LAUNCHD-COWORK-BACKSTOP §5 row 4), out of this task's declared scope, and per that task's own QA report is confirmed not-yet-loaded.
- `com.vn-market.socat-bridge` — a pre-existing local gap unrelated to this fix (out of scope for this task; noting for router/ops awareness only, not a blocking finding here).

This is a real, unrehearsed positive-detection result on live host state (not a fixture) — strong confirmatory evidence the check genuinely works end-to-end, beyond the mocked test suite.

### 5. DDD / Security / mock-guard
Not TS domain code — pure bash, no import-layer surface. `grep -n "process\.env\|password\|secret\|token"` on both files → no hits (comment-only prose, no values). mock-guard not applicable (no production TS source in scope).

### Verdict: DONE_VERIFIED
tests: 79 passed / 0 failed (own re-run) | mutation-test: 10/79 correctly flip when check is disabled, confirming real detection power | ddd: N/A (bash) | security: PASS

Board flip: `docs/data/orch/orch-state.json` `task_board.review[]` → `task_board.done_verified[]` via `scripts/qa-fix-auditor-t1-peer-firer-health-degraded-done-verified.jq` + `scripts/orch-apply.sh` (CAS-guarded, validated). `.head` idle-reset (`status:"done"`, `next_agent:"router"`, `active_task_id:null`).
