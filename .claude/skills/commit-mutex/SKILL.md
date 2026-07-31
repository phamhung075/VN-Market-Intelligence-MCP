<!-- size-justification: ~85L — TE-T08 lazy-load inversion (2026-07-31). Was 235L (all backoff table/jitter,
     push rebase-retry bash, and No-Heartbeat/TTL rationale inline); now under the 200L skill-file cap without
     a justification even being required. Kept ONLY: INV-GATEWAY-1 scope gate, C-2/C-2b fail-closed gates
     (verbatim), the PATHSPEC-SCOPED commit gate (verbatim — the only in-context instruction preventing
     bare-commit sweep-guard TOCTOU warns, per po landmine 2026-07-31T0132), foreign-restore gate, and the
     always-release step. Moved backoff table/jitter formula, full push rebase-retry bash, and No-Heartbeat/TTL
     rationale to `reference.md` (loaded only on genuine contention or a failed push) — see
     `docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-08`. -->
# Skill: commit-mutex

> **INV-GATEWAY-1 (enforced 2026-06-07):** This skill is DISPATCHER-ONLY. Dev-*/qa/ba/pm/architect
> specialist sub-agents MUST NOT invoke this skill — they lack the MCP gateway binding required to
> call `task_claim`. Specialists commit directly (explicit paths). The dispatcher session (dev-team
> dispatcher or developer team-lead) invokes this skill after the specialist returns its diff.
> See: `docs/architecture-briefs/2026-06-07-wf3-dev-gateway-binding-ruling.md`

**Trigger:** any flow step that performs `git add` + `git commit`
**Design brief:** `docs/architecture-briefs/2026-05-24-commit-mutex-on-main/00-design.md`
**Protocol reference:** `docs/protocols/task-lock-protocol.md` (§ commit-mutex kind)
**PO ratification:** `docs/po-decisions/2026-05-24-commit-mutex-ratification.md` (C-1..C-4 binding)
**Reference (lazy-load):** `.claude/skills/commit-mutex/reference.md` — backoff table/jitter, push
rebase-retry bash, No-Heartbeat/TTL rationale. Load on: `claimed=false` WITH `current_holder`
(contention), OR `git push` non-fast-forward.

## Purpose

Eliminate the verify→commit race on the shared git index. Only the agent holding
`commit-mutex:main` may be inside the `git add → git diff verify → git commit` critical section.
Scope: ONLY that seconds-long section — read/build/test/generate/signal-emit stay lock-free.

## Protocol (happy path — hot card)

**1. Acquire.**
```
task_claim(task_id="commit-mutex:main", task_kind="commit-mutex", owner_agent="<agent>",
  owner_client_session="<resolved CLAUDE_CODE_SESSION_ID — the ACTUAL value, NEVER the literal
  text "$CLAUDE_CODE_SESSION_ID">, ttl_seconds=90, payload=JSON({paths:[...], intent:"<summary>"}))
```
- **[C-2 FAIL-CLOSED]** MCP error / db_unavailable / tool-not-found → do NOT stage or commit →
  `send_telegram(channel="bug", "[<agent>] commit-mutex: task_claim UNAVAILABLE — skipping commit, retry next tick")` → EXIT.
- **[C-2b FAIL-CLOSED]** `claimed=false` with NO `current_holder` AND NO `error` → mechanism broken
  (schema/enum drift), NOT contention → do NOT backoff/stage/commit →
  `send_telegram(channel="bug", "[<agent>] commit-mutex: claimed=false with no holder — mechanism broken. Skipping, retry next tick.")` → EXIT.
- `claimed=false` WITH `current_holder` → genuine contention → `reference.md § Backoff`.
- `claimed=true` → proceed.

**2. Critical section** (exactly this order, no deviation):
```bash
git add <path1> <path2> ...                # 2a. explicit paths ONLY — NEVER -A / . / dir
STAGED=$(git diff --cached --name-only)     # 2b. foreign-path check
# any path in STAGED not in own-paths → git restore --staged <foreign-path> ONLY (never own
# path, never `git reset HEAD`) → re-check; still foreign → release (step 3) → ABORT → bug-telegram

git commit -m "$(cat <<'EOF'                # 2c. PATHSPEC-SCOPED — NEVER bare, NEVER `.`/dir.
<type>(<scope>): <task-id> <summary>          # Git resolves the listed paths atomically at commit
EOF                                            # time (its own scratch index) so a peer's concurrent
)" -- <path1> <path2> ...                     # `git add` can never be swept in, even if present in
                                               # the shared index right now (FIX-COMMIT-PATH-PEER-
                                               # INDEX-SWEEP-GUARD-SKILLS). Same paths as 2a, always.

git push origin main                        # 2d. non-fast-forward → reference.md § Push retry
                                             #     (bounded rebase-retry, max 2 attempts, no auto-resolve)

git diff --cached --name-only               # 2e. must be EMPTY post-commit; non-empty → bug-telegram
```

**3. Release — always**, even on abort/failure:
```
task_release(task_id="commit-mutex:main", owner_client_session="<same value as step 1>")
# ok=false acceptable (expired/already released) — log DEBUG, not error.
```

## Wiring (for flow authors)

Replace any bare `git add ... && git commit` with:
```
→ skill: .claude/skills/commit-mutex/SKILL.md
  own_paths: ["<exact paths this flow commits>"]
  intent:    "<one-line summary>"
```
This skill is the ONLY permitted path to the git index for commit operations. An agent that
bypasses it bypasses its own flow's output boundary — a fail-loud-protocol violation.
