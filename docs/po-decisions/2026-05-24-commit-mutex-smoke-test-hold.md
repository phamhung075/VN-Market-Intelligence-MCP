---
title: "PO Smoke-Test Decision — Commit-Mutex on main (HOLD WITH GAP)"
date: "2026-05-24"
author: "po"
type: "smoke-test-decision"
verdict: "HOLD — DO NOT LIFT SERIALIZATION"
gap_severity: "BLOCKER"
ratifies: "docs/po-decisions/2026-05-24-commit-mutex-ratification.md (C-1..C-4)"
design_brief: "docs/architecture-briefs/2026-05-24-commit-mutex-on-main/00-design.md"
skill_under_test: ".claude/skills/commit-mutex/SKILL.md"
dev_done_signal: "docs/signals/dev-commit-mutex-impl-complete-20260524T091800Z.json"
frozen_anchor: "debba8eaff0724d1fb32fc9d28640201cc32d1cc"
head_at_decision: "b5b7bdd87cf777191627b02664a79afa7bd69480"
next_actor: "developer"
---

# PO Smoke-Test Decision — Commit-Mutex on main

## Verdict: HOLD — interim single-committer serialization STAYS IN FORCE

The commit-mutex flow/skill layer (skill, protocol doc, 34-site flow wiring) is correctly authored.
But the **load-bearing mechanism — the `commit-mutex` lock kind itself — does not exist in the live
deployed mcp-server.** The smoke test cannot acquire even ONE claim, so the singleton-deny and
stale-reclaim proofs (the conditions for LIFT) are unreachable. This is a deployment gap of exactly
the class the task-lock protocol's own "Deployment-verified Ritual" (`docs/protocols/task-lock-protocol.md`
§ lines 139-152) was written to catch: **source-doc registration ≠ live tool availability.**

LIFT requires (per ratification §3): C-1 wiring complete AND smoke test passes AND one clean cycle.
The smoke test FAILS at step 1. Serialization stays.

---

## 1. The Smoke Test (design brief §10.4 / ratification §3)

**Goal:** prove the lock is a true fleet singleton + reclaim works, against the live `coordination.db`
via the real `task_claim` / `task_release` MCP path.

### 1.1 What I found FIRST — the lock kind is not deployed

The deployed mcp-server (`vn-market-intelligence-mcp-mcp-server-1`, container built ~40h ago, the
relevant code last committed `b144f560` "Phase 1") implements `task_claim` over a SQLite table whose
schema and tool-boundary zod enum both **exclude `commit-mutex`**:

- `apps/mcp-server/src/infrastructure/db/coordinationStore.ts:127`
  `CHECK(task_kind IN ('cowork-slot','sprint-task','dashboard-row'))` — no `commit-mutex`.
- `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts:82` and `:188`
  `z.enum(["cowork-slot", "sprint-task", "dashboard-row"])` — no `commit-mutex`.
- `grep -rn "commit-mutex" apps/mcp-server/src/` → **ZERO hits.** The lock kind is absent from the
  server source entirely. The developer amended the markdown protocol doc + authored the skill +
  wired flows, but never touched the MCP server that *implements* the lock, and never rebuilt the
  container.

### 1.2 Live-DB empirical proof (actual tool outputs)

I ran the EXACT `claimTask()` SQL path against the LIVE `/app/data/coordination.db` inside the
running mcp-server container (throwaway task_ids, cleaned up):

**Proof A — plain INSERT (no OR IGNORE) reveals the real rejection:**
```
INSERT ... task_kind='commit-mutex' ...
→ REJECTED: CHECK constraint failed: task_kind IN ('cowork-slot','sprint-task','dashboard-row')
```

**Proof B — the actual `task_claim` path (INSERT OR IGNORE) SILENTLY swallows it:**
```
INSERT OR IGNORE ... task_kind='commit-mutex' ...  → changes = 0   (no error, no insert)
```
`INSERT OR IGNORE` treats the CHECK-constraint failure as an ignorable conflict: 0 rows affected,
no exception thrown.

**Proof C — full `claimTask()` simulation: what the MCP tool returns to the agent:**
```
task_claim("commit-mutex:main", task_kind="commit-mutex")  →  {"claimed": false}
   (no current_holder, no error field)
```
Step 1 INSERT OR IGNORE → changes=0 (silently rejected) → Step 2 stale-steal UPDATE → 0 rows
(no row exists to steal) → Step 3 SELECT holder → no row → returns bare `{claimed: false}`.

> Note: at the live MCP tool boundary the zod enum (lines 82/188) would reject `task_kind:
> "commit-mutex"` with a validation error *before* the SQL even runs. Either way the claim cannot
> succeed. The SQL-path proof above is the lower-level confirmation that even bypassing zod, the
> DB CHECK constraint blocks it.

### 1.3 Singleton-deny + stale-reclaim test result: UNREACHABLE

The required proof (claimant-A succeeds → claimant-B denied while A holds → A releases → B succeeds
→ stale TTL reclaim) **cannot be run**: claimant-A never succeeds. There is no first holder, so there
is nothing for a second claimant to be denied against, and no TTL row to expire-and-reclaim. The
mechanism is non-functional for `commit-mutex` against the live server. **Smoke test: FAIL.**

---

## 2. Why this is worse than a clean failure (and is NOT the C-2 fail-closed path)

The skill (`.claude/skills/commit-mutex/SKILL.md`) maps `task_claim` results as:
- `claimed:true` → enter critical section (commit).
- `claimed:false` → "another agent holds the lock" → **Step 2 backoff** (6 retries, ~125s) → give-up → bug-telegram → SKIP.
- MCP error / `db_unavailable` (C-2) → fail-CLOSED, skip immediately, bug-telegram.

The live server returns `{claimed:false}` with **no `error` field** — so the skill takes the
**backoff branch**, not the C-2 branch. It mistakes a *permanent schema rejection* for *transient
contention*. Practical effect if this were wired live and serialization lifted:

- EVERY agent's EVERY commit returns `claimed:false` forever → backs off ~125s → gives up → skips
  the commit. **The entire fleet would stop committing**, each commit burning ~125s of backoff +
  a BUG telegram per cycle. Work would pile up un-committed in working trees (the convoy/starvation
  failure C-4 was meant to merely make observable — here it would be total and permanent).

So the direction is fail-safe (it never commits *unsafely*), but the outcome is a fleet-wide commit
freeze, not a working mutex. This is unambiguously HOLD.

---

## 3. The other gates (reviewed — these are GREEN; the gap is solely the live DB)

### 3.1 Skill critical-section ORDER — CORRECT
Read `.claude/skills/commit-mutex/SKILL.md`:
- Step 1 `task_claim` (BEFORE any staging) → Step 3a `git add <explicit paths>` → 3b `git diff
  --cached --name-only` verify (foreign-restore via `git restore --staged <foreign>` only; never
  own-path, never `git reset`) → 3c `git commit` heredoc → 3d post-commit empty-verify → Step 4
  `task_release` (always, every exit path).
- Claim BEFORE `git add`, release AFTER `git commit`: correct. Foreign-restore rule preserves the
  incident-2 clause. L84 explicit-path staging enforced inside the lock.

### 3.2 Fail-CLOSED path (C-2) — CORRECT AS WRITTEN, but blind to the §2 state
Step 1's C-2 branch: on tool-not-found / db_unavailable / exception → "DO NOT stage or commit, SKIP,
bug-telegram, EXIT." Correct fail-closed logic. **Gap:** it keys off an `error`/`db_unavailable`
return; the live server's `{claimed:false}`-without-error for an unknown lock kind does NOT trigger
it (see §2). The skill needs a guard for "claimed:false with no current_holder" = treat as
mechanism-broken, not contention.

### 3.3 C-1 wiring spot-checks (4 high-frequency cron commit sites) — LANDED
| Flow | commit-mutex skill referenced at commit step |
|------|----------------------------------------------|
| `.claude/flows/report-analyzer/cycle.md:59` | YES — "Commit (mutex-guarded) → skill: …commit-mutex/SKILL.md" |
| `.claude/flows/qa-responder/cycle.md:78` | YES |
| `.claude/flows/pm/task-archive.md:40` | YES |
| `.claude/flows/dev-team/post-cycle.md:34` | YES |
| `.claude/flows/market-watcher/cycle.md` | N/A — per-cycle commit REMOVED (line 96 comment; batches at eod.md). No wiring needed. |

Fleet-wide: 34 flow files reference `commit-mutex/SKILL.md`. The 4 raw-`git commit` files NOT in the
wired set are false positives (prose/comments: market-watcher comment, dev-team/main.md +
execute-tier.md + po/channel-audit.md prose references) — spot-checked, no bare unwired commit block
among the high-frequency committers. **C-1 wiring is substantially complete and correct.** It is the
LIVE TOOL, not the wiring, that is missing.

---

## 4. The Gap (single BLOCKER — what the developer must do)

The flow/skill/doc layer is done well. The implementation is missing its foundation: the
`commit-mutex` lock kind in the deployed MCP server. Required to clear the gap:

1. **Add `commit-mutex` to the schema CHECK constraint** in
   `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` (`CHECK(task_kind IN
   ('cowork-slot','sprint-task','dashboard-row','commit-mutex'))`) AND the `TaskKind` type union AND
   the `ClaimInput` typing. Note: `CREATE TABLE IF NOT EXISTS` will NOT alter the already-created
   live table — the constraint change needs a migration (recreate table or `ALTER`-equivalent) since
   the live `task_locks` table already exists with the old CHECK. Handle the existing-table case.
2. **Add `commit-mutex` to both zod enums** in
   `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` (lines 82 and 188), or the
   tool-boundary will reject the claim before SQL.
3. **Rebuild + redeploy** the mcp-server container (`docker compose up -d --build mcp-server`) and
   follow the Deployment-verified Ritual (`docs/protocols/task-lock-protocol.md` §139-152): verify
   container reports `Up <minutes>` and `healthy`, then call the live tools and record outputs.
4. **Harden the skill (defense-in-depth):** add a guard so `claimed:false` WITH no `current_holder`
   (i.e. unknown-kind / schema-reject) is treated as mechanism-broken → fail-CLOSED skip + a distinct
   BUG message, NOT 6 rounds of contention backoff. Otherwise a future schema/enum drift silently
   freezes the fleet.
5. **Then** re-run THIS smoke test (singleton-deny + stale-reclaim with real tool outputs) and
   re-signal PO for the lift decision.

The developer's noted C-3 bootstrap observation (the impl race bit its own commits twice — edits
correct in HEAD, 2 under foreign commit messages) is consistent with what BOTH my prior PO cycles
hit this session (notebook 09:12Z and 09:03Z). It re-confirms the interim serialization MUST stay
until a *working* mutex is live — it does NOT count as the mutex working.

---

## 5. Constraints honored this cycle

Anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` verified ancestor of HEAD (`b5b7bdd8`) at decision
time. No branches, no force, no history rewrite, no `--no-verify`. All coordination.db touches were
throwaway task_ids inside the container, cleaned up (no real lock disturbed). Did not touch
SI-2 / closed pilots / `.golangci.yml`. mcp-server source NOT modified (that is the developer's job —
this is a PO decision cycle, not implementation).

## Decision
**HOLD.** Interim single-committer serialization stays in force. Gap → developer.
Lift remains a future PO decision, unauthorized until a working `commit-mutex` lock kind is live and
the singleton+reclaim smoke test passes.
