# FIX-TASKLOCK-OWNER-SESSION-SERVER-SCOPED-DEFEATS-MUTEX — Root-Cause Re-Verification: Already Fixed

**Date:** 2026-07-10
**Author:** architect
**Status:** DONE — no code change recommended
**Slug:** tasklock-owner-session-already-fixed
**Task:** FIX-TASKLOCK-OWNER-SESSION-SERVER-SCOPED-DEFEATS-MUTEX (PLAN-ONLY, `docs/data/orch/archive/backlog-detail.json`)

---

## 0. Executive Summary

**The bug described in this ticket no longer exists in the live codebase.** It was fixed — thoroughly,
independently, and with regression coverage — by the `CROSS-SESSION-MULTI-TEAM-ORCH` sprint's P1 chain
(TASK_1973 → TASK_1981), which shipped **2026-06-28**, two days *after* this ticket was minted
(2026-06-26T05:31:34Z) but as a separately-initiated, broader initiative that was never cross-linked
back to this backlog row. The two efforts diagnosed the identical root cause independently and arrived
at materially the same fix.

**Decision:** do not implement option (a) or (b) as new work. The durable fix already live is a
hardened variant of option (b) — see §3. **Recommendation: close this task as SUPERSEDED/RESOLVED**,
citing the commits and tests below. No `dev-mcp-server` dispatch is needed.

---

## 1. Root-Cause Re-Verification (fresh read, 2026-07-10)

### 1.1 What the ticket's 2026-06-26 root-cause claimed

`apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts:52-56` — `SERVER_SESSION_ID`, a
single module-level const (`pid-${process.pid}-ts-${startMs}`), was stamped as `owner_session` on
**every** `task_claim` call regardless of caller identity, so two concurrent clients on one
`mcp-server` process collapsed to the same ownership identity and a second client's claim on an
already-held lock was treated as a re-entrant self-reclaim (`claimed:true`) — mutual exclusion
defeated.

### 1.2 What the live code shows now (re-read in full, not from memory)

`SERVER_SESSION_ID` still exists at `coordinationTools.ts:49-54` — **but it is no longer the ownership
key.** The file's own header comment (lines 11-22) now states the model explicitly:

```
owner_client_session (AUTHORITATIVE): per-CLAUDE_CODE_SESSION_ID UUID.
  Supplied by the CALLER via the tool input field; NOT injected server-side.
owner_session (DIAGNOSTIC): server-side process discriminator (pid + boot timestamp).
  Server-injected for diagnostics only. MUST NOT be used as the ownership key.
```

Verified in `coordinationTools.ts:104-110`: `owner_client_session` is a **required** Zod field
(`z.string()`, no `.optional()`) on `task_claim`, `task_heartbeat` (:165-171), `task_release`
(:199-205), and `task_force_release_orphan` (:294-299) — a caller that omits it gets a validation
error, not a silent server-side fallback.

Verified in `coordinationStore.ts` — every ownership-bearing WHERE clause uses `owner_client_session`
**exclusively**, with zero `owner_agent`/`owner_session` fallback:
- `claimTask` stale-steal UPDATE (:665-687) sets and matches on `owner_client_session`
- `heartbeatTask` (:723-755): `WHERE task_id=? AND owner_client_session=? AND expires_at >= now`
- `releaseTask` (:768-788): `WHERE task_id=? AND owner_client_session=?`
- `releaseOrphanTask` (:853-923): `SELECT ... WHERE task_id=? AND owner_client_session=?`, plus the
  independent heartbeat-freshness guard

`owner_session` (`SERVER_SESSION_ID`) is stamped into the row (`coordinationTools.ts:132`) but is
**never read in any ownership WHERE clause** — it is diagnostic-only, exactly as the header comment
claims.

**Conclusion: the 2026-06-26 root cause is stale.** The mechanism it describes (server-process-scoped
`owner_session` as the sole ownership key) has been structurally replaced by a client-supplied,
required, per-session token. Two concurrent clients sharing one `mcp-server` process now get
*identical* `owner_session` (unchanged — still process-scoped, by design, diagnostic only) but
*distinct* `owner_client_session`, which is the field every ownership decision actually keys on.

---

## 2. Live Re-Verification (2026-07-10, this session)

Per the task instruction to independently re-verify rather than trust the 2026-06-26 note:

**a) Test suite, RAW-run (not trusted from a prior report):**
```
cd apps/mcp-server && bun test src/__tests__/1980-p1-final-required-flip.test.ts
  → 12 pass / 0 fail / 36 expect() calls

cd apps/mcp-server && bun test src/__tests__/task-lock-coordination-store.test.ts \
  src/__tests__/task-lock-coordination-tools.test.ts \
  src/__tests__/commit-mutex-coordination.test.ts \
  src/__tests__/DWF-coordination-phase2.test.ts
  → 104 pass / 0 fail / 319 expect() calls
```

**b) Live gateway probe** (`scripts/agents-flow/mcp-call.sh`, reachable this session):
```bash
source scripts/agents-flow/mcp-call.sh
mcp_call "task_list_held" '{}'
```
Returned 2 live locks:
```json
{"task_id":"session-presence:6120a9e8-...","owner_session":"pid-1-ts-1783442538255","owner_client_session":"6120a9e8-75d1-4d89-89c9-e2bbd8dd494b"}
{"task_id":"esc-datacov:MBB:...","owner_session":"pid-1-ts-1783053517106","owner_client_session":"d3292ca4-a9ab-471a-8d8c-d0c723546258"}
```
`owner_client_session` is populated, distinct per row, and UUID-shaped as expected. (These two rows
carry different `owner_session` because the container restarted between claims — not two concurrent
same-lifetime clients — so this sample does not itself exercise the "two concurrent claimers, one
process lifetime" case; that case is exercised deterministically by the AC-C test in
`1980-p1-final-required-flip.test.ts`, confirmed GREEN above.)

**c) Live call-site audit** (production code, not tests):
```
grep -rn "claimTask(" apps/mcp-server/src --include="*.ts" | grep -v __tests__
  apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts:129
  apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts:321
```
Both call sites supply `owner_client_session`. No production caller regressed to omitting it (which
would now be a hard Zod/type error, not a silent bug).

**d) Independent transport-layer corroboration for why Option (a) cannot work here** (read directly,
not cited from a prior brief): `apps/mcp-server/src/interface/mcp/server.ts:299-321` and `:430-456` —
every `/mcp` HTTP request gets a **brand-new** `WebStandardStreamableHTTPServerTransport({})` (no
`sessionIdGenerator` configured) and a brand-new `McpServer` instance via `createMcpServerInstance()`,
both explicitly closed in a `finally` block immediately after the single request completes. Line
320-321's own comment: *"Gateway dials a new SSE connection per-call (sessionId never fires)."* There
is no stable per-connection transport session for the server to observe across two tool calls from the
same logical client — confirming structurally that `RequestHandlerExtra.sessionId` cannot serve as an
ownership discriminator in this deployment's gateway architecture, independent of whether the SDK
plumbing was ever wired up.

---

## 3. Decision: Option (b), Already Shipped — Option (a) Correctly Rejected

**Option (a)** (derive `owner_session` from the per-request MCP transport session,
`RequestHandlerExtra.sessionId`) **is not viable** in this deployment. §2d above independently confirms
what the 2026-06-28 `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md`
(§1.2 Site 3) also found: the gateway dials a fresh SSE connection per tool call, and the `/mcp` HTTP
handler opens/closes a fresh transport + server pair per request. There is no server-observable
identity that persists across two calls from the same client — the server structurally cannot derive
this. Only the client can supply it.

**Option (b)** (explicit owner-token arg to `task_claim`, opt-in) is the correct shape and **is already
implemented — as a stricter, non-optional variant.** The shipped design does not make the token
"opt-in": it makes `owner_client_session` **mandatory** (required Zod field, no fallback path), which
closes the exact failure mode option (b)'s "opt-in" framing would have left open — a caller silently
forgetting to pass the token and falling through to a shared identity. This is the P1-FINAL
"point-of-no-return" gate (TASK_1980): a migration was run first (nullable column, optional field,
fallback-ladder matching) to avoid breaking pre-migration callers, then the fallback was deliberately
removed once every caller was confirmed passing the field. This phased-then-locked approach is *more*
durable than either option as originally scoped, and matches this project's `feedback_recurring_bug_escalation`
standard (root-fix, not another band-aid) explicitly — the closing task's own title says
*"point of no return"* and the handoff doc states dropping the gate "re-opens the same-role multi-team
bug."

**No third option is proposed** — the shipped design is sound and independently re-verified.

---

## 4. Acceptance Criteria — Verified Against Live Code (not green-tick, RAW)

| AC (from backlog-detail.json) | Status | Evidence |
|---|---|---|
| Two concurrent claimers on one mcp-server lifetime show DISTINCT **owner_session** in `task_list_held` | **Wording is stale, intent is met.** `owner_session` stays process-scoped by design (diagnostic only, per header comment) — it does NOT become per-client. The field that actually discriminates ownership, `owner_client_session`, is distinct per claimer and is the sole key used in every WHERE clause. This AC was written under the pre-fix mental model where `owner_session` itself was expected to become per-client; the shipped design instead *introduced a new authoritative field* and *demoted* the old one to diagnostic-only. Functionally equivalent to the AC's intent; literally worded against a field that was deliberately NOT repurposed. See §5 for a proposed one-line AC wording fix (non-blocking). | `coordinationTools.ts:11-22` header; `coordinationStore.ts` WHERE clauses; AC-C test `1980-p1-final-required-flip.test.ts:216-242` (`current_holder.owner_client_session` returned, distinct per claimer) |
| A second client claiming a held lock gets `claimed:false` + `current_holder` | MET | `coordinationStore.ts:694-705` (Step 3 SELECT + return); test AC-C `1980-p1-final-required-flip.test.ts:229-242` |
| Existing own-restart orphan-release path (`FU-LEADER-LOCK-OWNER-SESSION`) still works | MET — improved | `releaseOrphanTask` (`coordinationStore.ts:853-923`) now matches on `owner_client_session` (which **survives** a server rebuild, unlike the old `owner_session`) with an independent heartbeat-freshness safety gate; tests `DWF-coordination-phase2.test.ts` AC-SL-6 (wrong-session → `lock_not_found`) and AC-SL-7 (fresh heartbeat → `heartbeat_fresh`, live peer never stolen from), both GREEN |
| No regression vs the 2026-06-02 dup-spawn discriminator | MET | `DWF-coordination-phase2.test.ts:884-926`, explicitly labeled `"AC-SL-7: Lock with fresh heartbeat → released:false (dup-spawn safety preserved, P1-FINAL)"`, GREEN |

---

## 5. Residual Non-Blocking Item (documentation only, not a functional gap)

The backlog record's acceptance-criteria wording ("distinct `owner_session`") reflects the ticket's
2026-06-26 mental model, predating the field-repurposing decision made in the 2026-06-28 architecture
brief. This is a **documentation nit only** — no code or behavior gap. If PO wants the letter of the
AC to match the shipped field names, a one-line edit to the closed backlog record (`owner_session` →
`owner_client_session` in the AC text) is sufficient; this is not being filed as a new backlog item
per this task's PLAN-ONLY scope (no new work recommended) — flagging here for PO visibility only.

---

## 6. Timeline (for the record)

| Date | Event |
|---|---|
| 2026-06-05 | `FU-LEADER-LOCK-OWNER-SESSION` DONE — fixed the opposite symptom (cross-restart false PEER-HELD), explicitly deferred per-client `owner_session` to "Phase-2" |
| 2026-06-26T05:22Z | Router dev-team tick RAW-verifies the server-scoped-mutex defect live (6 concurrent locks, 4 distinct `owner_agent`s, identical `owner_session`) |
| 2026-06-26T05:31:34Z | PO mints this ticket (`FIX-TASKLOCK-OWNER-SESSION-SERVER-SCOPED-DEFEATS-MUTEX`), PLAN-ONLY, routed to architect |
| 2026-06-28T10:13Z | `agents-architect` writes `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md` (independent initiative — no cross-reference to this ticket found) |
| 2026-06-28T10:23-10:47Z | PO signoff → PM decomposes P1 into TASK_1973-1981 → dev starts |
| 2026-06-28T12:32:09Z | `dea481e40` — TASK_1980 (P1-FINAL): `owner_client_session` REQUIRED, all fallback matching removed — the durable fix |
| 2026-06-28T13:24:21Z | `6fb27f87c` — QA APPROVED, P1 `done_verified` |
| 2026-06-28T14:01Z / 23:09Z | TASK_1989 (enum widen), WAL-checkpoint fix — same-day hardening |
| 2026-07-04T19:07Z | Sprint freeze tick (unrelated) |
| 2026-07-10T15:24Z | BOUNDED-1 idle-capacity auto-pickup claims this now-stale ticket; router corrects `next_agent` to architect (PLAN-ONLY gate) |
| 2026-07-10 (this session) | architect re-verifies: root cause stale, fix already live and GREEN — this brief |

---

## 7. Files Read (citation)

- `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` (full file, 388 lines)
- `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` (full file, 1242 lines)
- `apps/mcp-server/src/interface/mcp/server.ts:295-335, 428-457`
- `apps/mcp-server/src/__tests__/1980-p1-final-required-flip.test.ts` (full file)
- `apps/mcp-server/src/__tests__/DWF-coordination-phase2.test.ts:850-950`
- `docs/handoffs/TASK_1980-p1-final-required-flip-remove-fallback.md`
- `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md` (full file)
- `docs/data/orch/archive/backlog-detail.json` — `FIX-TASKLOCK-OWNER-SESSION-SERVER-SCOPED-DEFEATS-MUTEX` record
- `git log` for `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` and commits `dea481e40`,
  `6fb27f87c`, `1893a9269`, `0e06118cc`, `9b6c0e333`, `fd009d418`, `f01eb0f81`, `f4f642905`

## 8. Commands Run (citation)

```bash
cd apps/mcp-server && bun test src/__tests__/1980-p1-final-required-flip.test.ts
cd apps/mcp-server && bun test src/__tests__/task-lock-coordination-store.test.ts \
  src/__tests__/task-lock-coordination-tools.test.ts \
  src/__tests__/commit-mutex-coordination.test.ts \
  src/__tests__/DWF-coordination-phase2.test.ts
source scripts/agents-flow/mcp-call.sh && mcp_call "task_list_held" '{}'
source scripts/agents-flow/mcp-call.sh && mcp_call "task_list_held" '{"kind":"sprint-task"}'
grep -rn "claimTask(" apps/mcp-server/src --include="*.ts" | grep -v __tests__
git log -1 --format="%H %ad %s" --date=iso-strict dea481e40   # 2026-06-28T12:32:09+02:00
git log -1 --format="%H %ad %s" --date=iso-strict 6fb27f87c   # 2026-06-28T13:24:21+02:00
```

---

## RETURN

DONE: Root cause re-verified — defect already fixed by TASK_1980 (P1-FINAL), CROSS-SESSION-MULTI-TEAM-ORCH
sprint, commit `dea481e40`, 2026-06-28. Live re-verification (test suite + live gateway probe + call-site
audit) confirms GREEN today, 2026-07-10.
ZONE: apps/mcp-server/
NEXT: po — close as SUPERSEDED/RESOLVED (no dev dispatch needed); optional non-blocking AC-wording cleanup per §5.
HANDOFF: docs/architecture-briefs/2026-07-10-tasklock-owner-session-already-fixed.md
PIPELINE: complete
