## Task Report 1961c
date: 2026-05-20
outcome: APPROVED

changed: [scripts/smoke-task-lock-phase2.ts (exec only), scripts/smoke-task-lock-phase3.ts (exec only)]
type: SMOKE RE-RUN — Phase 2 (9 cases) + Phase 3 (10 cases) against live MCP gateway post-1961a container rebuild

### Phase 2 Smoke (scripts/smoke-task-lock-phase2.ts)

| Test | Description | Result |
|------|-------------|--------|
| T1 | Session A claims cowork-slot:news-scout — claimed=true | PASS |
| T2 | Session B same slot → claimed=false (collision blocked) | PASS |
| T3 | current_holder.owner_session matches Session A | PASS |
| T4 | Session A release + Session B re-claim → claimed=true | PASS |
| T5 | Session A claims slot-2 → wonSlots includes slot-2 | PASS |
| T6 | Session A claims slot-3 → wonSlots includes slot-3 | PASS |
| T7 | Session B: heldByOther=2, wonSlots=0 (all-held branch) | PASS |
| T8 | all_held=true when Session B has zero wins | PASS |
| T9 | Zero dangling cowork-slot locks after release cycle | PASS |

Phase 2: **9/9 PASS**

### Phase 3 Smoke (scripts/smoke-task-lock-phase3.ts)

| Test | Description | Result |
|------|-------------|--------|
| T1 | Session A claims sprint-task:1960c → claimed=true | PASS |
| T2 | Session B same task → claimed=false, holder=SESSION_A | PASS |
| T3 | Session A heartbeat → ok=true, expires_at renewed | PASS |
| T4 | Session B heartbeat (non-holder) → ok=false | PASS |
| T5 | A releases, B re-claims → claimed=true | PASS |
| T6 | Session A claims dashboard-row → claimed=true | PASS |
| T7 | Session B same dashboard-row → claimed=false | PASS |
| T8 | After A release: zero dangling dashboard-row locks | PASS |
| T9 | TTL backdate → Session C stale-steal: claimed=true, stolen=true | PASS |
| T10 | sprint-task:X and dashboard-row:X are independent (cross-kind) | PASS |
| G1-G9 | Flow integration grep checks (8 flow files) | 9/9 PASS |
| P1-P2 | pipeline-state.json SSOT fields preserved | 2/2 PASS |
| M1 | All flow files use call_tool() meta-syntax (not curl) | PASS |

Phase 3: **22/22 PASS** (10 smoke + 9 grep + 2 pipeline + 1 MCP grammar)

### Live MCP Gateway Verification

Container: vn-market-intelligence-mcp-mcp-server-1 Up 2 minutes (healthy) post-1961a rebuild

| Tool | Live Response |
|------|---------------|
| task_claim | {"claimed":true} — LIVE |
| task_heartbeat | {"ok":false,"expires_at":0} — LIVE (owner_session mismatch expected — server-injected) |
| task_release | LIVE (server-session-scoped — behavioral correct) |
| task_list_held | {"locks":[...],"count":1} — LIVE |

All 4 tools confirmed in gateway tools/list response.

### Totals

- Phase 2 smoke: 9/9 PASS
- Phase 3 smoke: 22/22 PASS (10 runtime + 12 static checks)
- Live gateway: 4/4 tools reachable
- Combined smoke cases: **19/19 PASS** (target met)

verdict: APPROVED
signal: docs/signals/qa-1961c-approved.json
next: 1961d (po — patch docs/protocols/task-lock-protocol.md)
