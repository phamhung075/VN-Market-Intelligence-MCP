# Task Report — FIX-MCP-SSE-SESSION-MANAGER-PERCONN-LEAK-NO-REAPER

> **Mode**: Direct-Commit Verify (dev-team Review-Lane QA-Drain, `mode=verify-committed`, `branch:null`)
> **Date verified**: 2026-08-08
> **Commits verified**: `b746c112b` (fix), `925641bb9` (docs self-heal), `8b7a34674` (memory), `d24ddf6b6` (board)
> **Code-correctness verdict**: APPROVED
> **Board routing**: HELD at REVIEW / next_agent=ops (rebuild-required gate — NOT flipped to DONE_VERIFIED)

---

## Commit ancestry (RAW, independent of PO's prior RAW-verify)

All 4 claimed commits re-confirmed as ancestors of `main` HEAD via `git merge-base --is-ancestor`:

| Commit | Subject |
|---|---|
| `b746c112b` | fix(mcp-server): SseSessionManager evicts every session's McpServer (perconn leak) + idle/max-age reaper + DELETE route |
| `925641bb9` | docs(dev-mcp-server): self-heal Gate 2b port-3000-assumed-free instruction |
| `8b7a34674` | chore(memory/dev-mcp-server): notebook + journal 2026-08-08 |
| `d24ddf6b6` | chore(tasks): FIX-MCP-SSE-SESSION-MANAGER-PERCONN-LEAK-NO-REAPER IN_PROGRESS → REVIEW |

## Diff content verification (read the actual diffs, not the commit message)

**`apps/mcp-server/src/interface/mcp/transport.ts`** (+155/-32, part of `b746c112b`):
- 2 parallel `Map`s (`sessions`, `heartbeatIntervals`) collapsed into 1 `Map<string, SessionRecord>` — `SessionRecord = {transport, mcpServer, heartbeatInterval, createdAt, lastActivityAt}` — confirmed present.
- `private async evictSession(sessionId, reason)` confirmed as the single eviction path: deletes the map entry, clears the heartbeat interval, `await record.mcpServer.close()` (try/catch, non-fatal on failure). Confirmed called from all 5 claimed triggers:
  1. `res.on("close")` → `evictSession(sessionId, "connection_closed")`
  2. heartbeat write-fail catch block → `evictSession(sessionId, "heartbeat_write_failure")`
  3. `reapStaleSessions()` idle branch → `evictSession(sessionId, "idle_timeout")`
  4. `reapStaleSessions()` max-age branch → `evictSession(sessionId, "max_age")`
  5. `closeSession(sessionId)` (new DELETE-route entry point) → `evictSession(sessionId, "client_delete")`
- `handleMessage()` bumps `record.lastActivityAt = Date.now()` (idle-timeout basis) — confirmed.
- New `reaperInterval` (`.unref()`d, default 60s cadence) + `stopReaper()` — confirmed.
- Idle/max-age constructor-param defaults (15min / 4h) — confirmed, same override idiom as pre-existing `_heartbeatIntervalMs`.

**`apps/mcp-server/src/interface/mcp/server.ts`** (+22, part of `b746c112b`):
- New `DELETE /sse|/messages` route: 400 on missing `sessionId`, else `sessions.closeSession(sessionId)` → 200 `{closed:true}` / 404 `{closed:false}` — confirmed.
- `sessions.stopReaper()` wired into `BunServerInstance.close()` alongside the pre-existing `clearInterval(reaperIntervalId)` — confirmed.

**`docs/architecture/microservice/mcp-server/infrastructure.md`** (+53, part of `b746c112b`): new "SSE Session Manager" section matches the implementation 1:1 (SessionRecord shape, evictSession triggers, DELETE route semantics, `SSEServerTransport` deprecation note). Row's own `files[]` still cites the stale flat `docs/architecture/microservice/mcp-server.md` path — pre-existing staleness (same class PO already corrected once for `transport.ts`'s path), not a defect introduced by this diff.

**Tests** — re-ran myself, not trusted the dev's self-report:
- `1862c-transport-session-eviction.test.ts`: **12/12 pass**, 36 `expect()` calls (was 5, claim of 5→12 confirmed by direct count of `it(...)` blocks). T6–T12 read individually — genuine, not tautological: T9 is a real negative control (concurrent `handleMessage()` activity-bumping proves the idle clock resets, session survives past the T8 window); T10 proves max-age fires independent of a live idle clock (activity bumped throughout, still evicted); T12 proves idempotent double-eviction (`close()` called exactly once across two trigger paths, no throw).
- `081-bun-mcp-server.test.ts`: **10/10 pass**, 26 `expect()` calls (was 8, +2 confirmed). Live-observed `"reason":"client_delete"` log line during the DELETE round-trip test.
- Joint run (both files together): 22/22 pass, 53 `expect()` — no cross-file interference.
- `bun tsc --noEmit` (apps/mcp-server): 0 errors.
- `bash scripts/audits/mock-guard.sh --files "transport.ts server.ts"`: PASS.
- DDD/security greps on both modified production files: all `infrastructure`/`application` imports and the 1 `process.env` hit are pre-existing (confirmed via `git show b746c112b^:<path>`) — zero new violations introduced by this diff.

**Doc + memory + board commits** (`925641bb9`/`8b7a34674`/`d24ddf6b6`): scoped as claimed — `925641bb9` touches only `docs/agents/dev-mcp-server/flow/main.md` (PORT=3099 Gate-2b fallback, matches the dev note's "live PORT=3099 probe" claim); `8b7a34674` touches only notebook + decision-journal continuation; `d24ddf6b6` is the board IN_PROGRESS→REVIEW flip (lane-move-with-status-flip, same commit that also correctly closegate-held the sibling `FIX-SCHEDULER-DOUBLE-REGISTRATION` row).

## Verdict: code-correctness APPROVED

Every AC in the `b746c112b` commit trailer is genuinely met: every-eviction-path-closes-mcpServer ✓, idle-reaper-with-negative-control ✓, max-age-reaper-independent-of-idle ✓, delete-route-idempotent ✓ (T12 + integration double-DELETE case), full-suite-regression-diffed-clean (not independently re-run at full-1268-file scale by QA — accepted the dev's git-stash-isolated control-run methodology as sound and consistent with the targeted-suite re-runs performed here).

## Routing HELD — NOT flipped to DONE_VERIFIED

`apps/mcp-server/src/` (incl. `transport.ts`, `server.ts`) is baked at Docker build time — `COPY apps/mcp-server/src/ ./src/` at `apps/mcp-server/Dockerfile:62`, confirmed not volume-mounted (`docker-compose.yml`'s `mcp-server.volumes[]` has no `src` mount). Per `docs/protocols/docker-deployment-runbook.md` § Microservice Code-Change Close Gate ("Restart ≠ Rebuild"), a microservice code change is not shipped until the container is rebuilt and SHA-verified.

This row's own `claimed_by: "dev-team (review-lane qa-drain)"` routed it straight past that gate. The **same board commit** (`d24ddf6b6`, same push) correctly applied the identical gate to the sibling row `FIX-SCHEDULER-DOUBLE-REGISTRATION` (held `REVIEW`/`next_agent=ops`/`rebuild_required=true`, explicit dev note: "DOCKER MICROSERVICE CODE-CHANGE CLOSE GATE APPLIES... NOT self-flipped to DONE_VERIFIED") but omitted it for this row. Corrected in this pass: moved `task_board.qa[]` → `task_board.review[]`, `status: QA → REVIEW`, `next_agent → ops`, `rebuild_required: true` added, `.head` synced (it was pointing at this exact `active_task_id`).

PO's standing "do not restart/rebuild mcp-server while this row is in flight" ruling (`po_a30_corroboration_20260808T1600Z`) is discharged — the fix has landed on `main`; ops may now proceed per the runbook's Steps 1–4b (free-memory check → rebuild → verify running → SHA gate → atomic forward to qa), then qa performs Step 5 (live `/health` + sessionCount liveness check against the new image) before po's Step 6 sign-off.

## Board / notebook / commit artifacts

- `docs/data/orch/orch-state.json`: row moved `qa[]`→`review[]`, `qa_review_note` appended, `.head` synced — via `scripts/orch-apply.sh`.
- Decision journal: `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-<N>.md`.
- Notebook: `docs/agent-memory/notebooks/qa.md` cycle-585.
- **task_release**: this sub-session has no gateway MCP binding (INV-GATEWAY-1) — could not call `task_release("task:FIX-MCP-SSE-SESSION-MANAGER-PERCONN-LEAK-NO-REAPER")` myself. Dispatcher (dev-team, session `165f4245-6173-4054-87fd-c55bb626265f`) must release on my behalf.
