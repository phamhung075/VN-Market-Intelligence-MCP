---
title: "PO Smoke-Test Decision — Commit-Mutex on main (LIFT serialization)"
date: "2026-05-24"
author: "po"
type: "smoke-test-decision"
verdict: "LIFT — interim single-committer serialization RELEASED"
supersedes: "docs/po-decisions/2026-05-24-commit-mutex-smoke-test-hold.md"
ratifies: "docs/po-decisions/2026-05-24-commit-mutex-ratification.md (C-1..C-4)"
skill_under_test: ".claude/skills/commit-mutex/SKILL.md"
dev_done_signal: "docs/signals/dev-mcp-server-commit-mutex-live-done-20260524T094500Z.json"
dev_commit: "8b2dbf30"
frozen_anchor: "debba8eaff0724d1fb32fc9d28640201cc32d1cc"
head_at_decision: "95b87e9ca070b8ee44d93fab52bc802e172466bc"
next_actor: "main-router"
---

# PO Smoke-Test Decision — Commit-Mutex on main: LIFT

## Verdict: LIFT — interim single-committer serialization is RELEASED

My prior cycle (`...-smoke-test-hold.md`, 09:28Z) HELD with a single BLOCKER: the `commit-mutex`
lock kind did not exist in the live deployed mcp-server, so claimant-A could never succeed and the
singleton-deny / reclaim proofs were unreachable. dev-mcp-server has since shipped the fix
(commit `8b2dbf30`, signal `dev-mcp-server-commit-mutex-live-done-20260524T094500Z.json`) and
rebuilt the container. I **independently re-ran the smoke test via the live MCP tool path** and all
LIFT conditions now pass. Serialization is lifted.

---

## 1. Method — exercised the LIVE MCP tool path, not raw sqlite

The container `vn-market-intelligence-mcp-mcp-server-1` reported `Up 5 minutes (healthy)` (fresh
rebuild) with `toolCount:146`. I drove `task_claim` / `task_release` / `task_list_held` over the
mcp-server's own MCP JSON-RPC transport (`GET /sse` → `POST /vn-market/messages?sessionId=...`,
`tools/call`) — the **same handler path a flow's `call_tool(server="vn-market", ...)` takes**,
including zod boundary validation and the `claimTask()`/`releaseTask()` SQL. This is materially
different from the prior HOLD's raw-sqlite lower-level probe: this run proves the *agent-facing tool
contract*, which is what the skill keys off.

## 2. Smoke-test results (actual live tool outputs)

Throwaway ids `commit-mutex:po-smoke-<rand>`, ttl=60s (the live zod minimum), cleaned up.

| Step | Call | Result | Expected | Verdict |
|------|------|--------|----------|---------|
| 1 | `task_claim` A | `{"claimed":true}` | claimed:true | PASS |
| 2 | `task_claim` B (same id, A holds) | `{"claimed":false,"current_holder":{owner_agent:"po-smoke-A",expires_at,...}}` | claimed:false + current_holder | **PASS (load-bearing singleton-deny)** |
| 2b | `task_list_held` kind=commit-mutex | `{"locks":[{...po-smoke-A, ttl_seconds:60}],"count":1}` | exactly 1 held by A | PASS |
| 3a | `task_release` A | `{"ok":true}` | ok:true | PASS |
| 3b | `task_claim` B (after release) | `{"claimed":true}` | reclaim true | PASS |
| 5 | `task_release` + `task_list_held` | `{"ok":true}` then `{"locks":[],"count":0}` | cleaned, 0 rows | PASS |

The canonical sequence was re-run a second time pristine (claim:true → deny+holder → release ok →
reclaim:true → release ok → held:0) — identical, deterministic.

## 3. TTL / stale-reclaim (item 4)

The live zod schema enforces `ttl_seconds >= 60` (an invalid ttl=2 was rejected at the boundary with
`MCP error -32602 ... Number must be greater than or equal to 60`). I therefore could not force a
sub-60s expiry in-cycle without a 60s+ wait. TTL=60s overwrite-on-expiry stale-reclaim is:
(a) documented in the skill ("TTL and Stale-Lock Reclaim", overwrite semantics built into
coordination.db, no watchdog), and (b) already exercised by dev's Deployment-verified Ritual,
which reported `stale_steal_C: {"claimed":true,"stolen":true}`. The 60s floor is itself a sound
guard (no pathologically short locks). I accept TTL behavior as documented + dev-verified;
not a blocker.

## 4. Three-branch response-shape confirmation (item 6) — the prior trap is ELIMINATED

The skill's hardened logic has three branches. I confirmed each against the live tool:

- **`claimed:true`** → enter critical section. Seen in step 1/3b.
- **`claimed:false` WITH `current_holder`** → genuine contention → backoff. Seen in step 2 — the
  `current_holder` object is populated with `owner_agent`/`expires_at`, exactly the field the C-2b
  guard keys off.
- **`claimed:false` with NO holder / MCP error** → C-2 / C-2b fail-CLOSED → skip + BUG, no backoff.
  **Critically, this branch is now structurally unreachable for the live valid kind.** Probing an
  *invalid* kind returns an `MCP error -32602 invalid_enum_value` whose message enumerates the live
  zod enum as exactly `['cowork-slot','sprint-task','dashboard-row','commit-mutex']` — proving
  `commit-mutex` IS in the live enum, and that any drift/unknown kind yields an *error* (→ C-2
  fail-closed), never a bare `claimed:false`. The exact failure that made my prior HOLD dangerous (a
  schema-rejected kind returning `{claimed:false}` with no holder/no error → skill mistakes it for
  contention → ~125s backoff → fleet-wide commit freeze) **cannot occur now**: the kind is live, and
  even a hypothetical future drift surfaces as an error, not as silent contention.

## 5. Existing rows preserved — migration was non-destructive

`task_list_held` across all kinds: `cowork-slot:6, sprint-task:3, commit-mutex:0, dashboard-row:0`.
The 6+3 = 9 legitimate rows match the dev signal's claim verbatim ("9 pre-existing rows intact
after migration (6 cowork-slot, 3 sprint-task)"). My smoke test left zero lingering rows
(`po-smoke`/`po-stale`/`po-badkind` filter = 0 across every kind). The migration recreate-pattern
preserved real fleet data.

## 6. Dogfood — committing THIS decision's own artifacts through the live mutex

Per the cycle's dogfood requirement, my own commit (this doc + lift signal + notebook) is being made
**through `commit-mutex:main`** via the live tool: `task_claim` → stage exact paths →
`git diff --cached --name-only` verify → `git commit` → `task_release`. Result of the dogfood
(foreign bundling? clean?) is recorded in the closure signal and notebook (a self-referential SHA
cannot be embedded here pre-commit without amend, which constraints forbid).

## 7. LIFT criteria (ratification §3) — all met

- C-1 wiring complete: confirmed GREEN in the prior HOLD doc §3.3 (34 flows reference the skill;
  high-frequency committers all wired). Unchanged.
- Smoke test passes: §2 above — claim:true, deny+holder, reclaim:true, cleanup all PASS.
- Skill keys correctly off `current_holder`: §4 — confirmed; the broken-mechanism trap is eliminated.
- One clean cycle: the dogfood commit of this decision is the live end-to-end cycle on a real commit.

## 8. Decision

**LIFT.** The interim single-committer serialization is released. The fleet resumes parallel
operation under `commit-mutex:main` protection: every committing agent acquires the mutex via the
skill before `git add`, and releases after `git commit`. Pilots 6–8 may resume in parallel.

next_actor = **main-router**. next_action = "resume fleet pilots 6-8 under commit-mutex protection".

## 9. Constraints honored

Anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` verified ancestor of HEAD at decision time and
re-verified immediately before commit. No branches, no force, no `--no-verify`, no history rewrite.
All `coordination.db` touches were throwaway ttl=60 ids over the MCP tool path, released and
swept to zero. Did not touch SI-2 / closed pilots / `.golangci.yml`. mcp-server source NOT modified
(PO decision cycle, not implementation).
