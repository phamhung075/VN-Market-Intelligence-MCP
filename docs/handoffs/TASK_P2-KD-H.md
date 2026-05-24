---
sprint: P2-KD
task_id: P2-KD-H
title: "G5c — Zero TODO.*migrat Audit + G5 Evidence Sign-Off"
type: qa
owner: qa
zone: apps/kinh-dich-service
size: S
depends_on: [P2-KD-G]
blocks: [P2-KD-I]
estimated_hours: 0.5
ac_count: 5
goal_advanced: [G5b, G5c]
goal_flip: false
ssot_path: docs/data/pilot-status-kinh-dich.json
---

## TLDR

Read-only audit: confirm zero TODO.*migrat comments across kinh-dich-service and affected mcp-server tool directory. Verify G5b rewire (HTTP port 5005, zero direct domain imports) post-completion. Compile G5 evidence summary. This is the final G5 confirmation gate before G3 cleanup task.

## [PM] Planning Context

**Zone:** apps/kinh-dich-service (read-only) + apps/mcp-server/src/interface/mcp/tools/kinhdich/ (read-only)

**Blocked by:** P2-KD-G DONE (commit 6fc7b6b3 — MCP→HTTP rewire complete, all 4 new endpoints verified, 14/14 sandbox green)

**Blocks:** P2-KD-I (G3 composition root cleanup ≤80L + OpenAPI contract)

**Acceptance Criteria:**

- [ ] **AC-1 — Zero `TODO.*migrat` markers:**
  - ```bash
    grep -rn "TODO.*migrat" \
      apps/kinh-dich-service/ \
      apps/mcp-server/src/interface/mcp/tools/kinhdich/ \
      --include='*.ts'
    ```
  - Must return 0 matches. No migration-comment debt in kinh-dich-service or the rewired tool handlers.

- [ ] **AC-2 — Zero `TODO.*migrat` in `_deprecated/` paths:**
  - ```bash
    grep -rn "TODO.*migrat" apps/kinh-dich-service/src/_deprecated/ 2>/dev/null
    ```
  - Must return 0 matches. The deprecated files (moved in P2-KD-F) must not carry TODO.*migrat markers.

- [ ] **AC-3 — Zero direct domain imports from parallel mcp-server copy (post-rewire confirmation):**
  - ```bash
    grep -rn "from.*kinhDich\|from.*hexagramLibrary\|from.*hexagramBacktester" \
      apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts
    ```
  - Must return 0 matches. G5b rewire is confirmed clean — no regressions introduced after P2-KD-G commit.

- [ ] **AC-4 — HTTP port confirmed in mcp-server client:**
  - ```bash
    grep -n "5005\|kinh-dich-service" apps/mcp-server/src/infrastructure/microservices/clients.ts
    ```
  - Returns ≥1 match. HTTP client routes to correct port 5005 per system-map.json.

- [ ] **AC-5 — G5 evidence compiled in handoff:**
  - Create `docs/handoffs/TASK_P2-KD-H-g5-evidence.md` with:
    - `g5a_deprecated_path: apps/kinh-dich-service/src/_deprecated/services_v1.ts (moved in P2-KD-F)`
    - `g5b_zero_direct_domain_imports: YES (AC-3 confirmed)`
    - `g5b_http_client_present: YES (port 5005 in clients.ts per AC-4)`
    - `g5b_new_endpoints: 4 (/readings/{code}/history, /hexagram/{number}/transitions, /backtest/{code}, /hexagram/{number}/explain per P2-KD-G AC-3)`
    - `g5c_zero_todo_migrat: YES (AC-1 confirmed)`
    - `g5_ready_to_grade: YES`
  - Emit `docs/signals/qa-kd-P2-KD-H-g5-evidence-done-<UTC>.json` with same verdict fields.

## Files to read first

- `docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-2-task-plan-ts.md` (§P2-KD-H AC specification + G5 background)
- `docs/handoffs/TASK_P2-KD-G.md` (P2-KD-G completion summary — what the 6 tools rewire delivered)
- `docs/data/pilot-status-kinh-dich.json` (phase2.tasks.P2-KD-G verdict + completion details)

## Files to create

- `docs/handoffs/TASK_P2-KD-H-g5-evidence.md` — G5 evidence summary (5 fields above)

## Files to modify

- none (read-only audit only)

## Dependencies

- P2-KD-G DONE (6fc7b6b3, MCP rewire + 4 endpoints verified)
- Phase-2 baseline: G4 fence complete, G5a/G5b complete, sandbox 14/14 stable

## Knowledge needed

- `docs/policies/dev-standards.md` (commit convention, signal file format)
- Phase 2 task plan §P2-KD-H (read-only audit scope)
- Git grep command patterns (TODO.*migrat search syntax)
- QA evidence compilation format (handoff + signal)

## G-Goal Posture

**NO goal flips.** G5 evidence is complete but PO flips G5 only at 12/12 terminal Phase-3 close. Charter §4.5 SSOT untouched:
- `decisionMatrix` stays all TBD
- `goalsEarned` stays 0
- `phase2.current_task` = P2-KD-H (set by PM on dispatch)

## Historical Context

**Phase 2 status:** P2-KD-A through P2-KD-G DONE. G4 fence proven (P2-KD-B/C/D), G5a move complete (P2-KD-F), G5b rewire complete (P2-KD-G, commit 6fc7b6b3 all 8 ACs PASS, sandbox 14/14).

**P2-KD-G key facts:** Zero live imports from mcp-server parallel copy in kinhDichTools.ts; 4 new endpoints added to kinh-dich-service; score-computation helpers remain in mcp-server per design; port 5005 confirmed in microservices client.

---

## Commit Convention

**Commit subject pattern (QA evidence commit):**
```
chore(qa/kinh-dich): P2-KD-H — G5 evidence sign-off (zero TODO.*migrat, G5b rewire confirmed)
```

**Trailers:**
```
AC: AC-1, AC-2, AC-3, AC-4, AC-5
Task: P2-KD-H
```

---

## RETURN

When complete, emit signal `docs/signals/qa-kd-P2-KD-H-g5-evidence-done-<UTC>.json`:
```json
{
  "agent": "qa",
  "task_id": "P2-KD-H",
  "status": "DONE",
  "commit_sha": "<your-commit-sha>",
  "ac_verdicts": {
    "AC-1": "PASS",
    "AC-2": "PASS",
    "AC-3": "PASS",
    "AC-4": "PASS",
    "AC-5": "PASS"
  },
  "g5_chain_summary": {
    "g5a_deprecated_path": "apps/kinh-dich-service/src/_deprecated/services_v1.ts",
    "g5b_zero_direct_domain_imports": true,
    "g5b_http_client_present": true,
    "g5b_http_port": 5005,
    "g5b_new_endpoints": [
      "/readings/{code}/history",
      "/hexagram/{number}/transitions",
      "/backtest/{code}",
      "/hexagram/{number}/explain"
    ],
    "g5c_zero_todo_migrat": true
  },
  "next_actor": "pm",
  "next_action": "mark P2-KD-H DONE, sequence P2-KD-I (G3 composition root cleanup)"
}
```

Signal file: `docs/signals/qa-kd-P2-KD-H-g5-evidence-done-<UTC>.json`

---

## Acceptance Gate

All 5 ACs PASS + G5 evidence compiled + anchor INTACT (debba8eaff0724d1fb32fc9d28640201cc32d1cc is ancestor of HEAD).
