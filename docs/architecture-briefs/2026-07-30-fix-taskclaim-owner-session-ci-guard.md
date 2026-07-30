<!-- size-justification: task-lock schema-drift closeout brief — root cause, per-file fix list,
     CI guard design, and the fleet-wide baseline discovery are one coherent record; splitting would
     separate the guard's rationale from the debt it grandfathers. -->

# FIX-TASKCLAIM-OWNER-CLIENT-SESSION-MISSING-FLEET-FLOW-DOCS — Closeout Brief

**Status:** SHIPPED (fixed subset) + BASELINE OPENED (fleet-wide remainder)
**Author:** agent-father
**Date:** 2026-07-30

---

## 1. Root Cause

`apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts:104-110` declares
`owner_client_session: z.string()` with **no** `.optional()` on `task_claim` (:82-127). The same
requirement holds on `task_heartbeat` (:160-172) and `task_release` (:194-206). This is the sole
ownership discriminator (P1-FINAL / TASK_1980) — a call that omits it is rejected by Zod before it
ever reaches `coordinationStore.ts`. A flow/skill doc that documents such a call without
`owner_client_session` anywhere in the call teaches every future reader (human or agent) a call
shape the live server has rejected since TASK_1980 shipped.

Verified directly against the TypeScript source (not the MCP tool description, not a sibling doc) —
see `docs/agents/tools/list/task_claim.md` for the canonical parameter table this brief re-derives
independently.

## 2. Live Incidents Caused By This Defect Class

- **refine_bctc_md** — `task_claim` call at `flow/main.md:37-38` omitted `owner_client_session`
  entirely → schema validation failure on every fire, BLOCKED.
- **alert-commander** — published-marker `task_claim` was REJECTED on 2026-07-30T00:12Z; the agent
  then published a CRITICAL signal WITHOUT the double-publish tombstone lock. **Root-cause note:**
  alert-commander's own flow doc (`docs/agents/alert-commander/flow/stage-dispatch-log.md:33`)
  already documents `owner_client_session=<expanded session id>` correctly — the live failure here is
  a DIFFERENT, already-tracked defect (`.claude/agents/alert-commander.md` grants no `Bash`, so the
  agent cannot resolve `$CLAUDE_CODE_SESSION_ID` itself and no spawn-prompt channel currently supplies
  it either — tracked separately as
  `FIX-ALERT-COMMANDER-NO-BASH-GRANT-NOTEBOOK-UNCOMMITTABLE`, BACKLOG, next_agent=agent-father). This
  task's fix does **not** close that row; re-verification confirmed the doc was already compliant and
  the blocker is structural, not doc drift. Do not double-count it as closed by this brief.

## 3. Files Fixed (this task's scope — 7 named files + 1 own-zone file)

| File | Sites fixed |
|---|---|
| `.claude/skills/commit-mutex/SKILL.md` | 4 (Step 1 acquire, Step 4 release, Quick-Reference steps 1+7 — 3 simultaneous schema drifts: missing `owner_client_session`, `kind=` → `task_kind=`, `ttl=` → `ttl_seconds=`) |
| `.claude/skills/commit-boundary/SKILL.md` | 1 (R-HANDOFF pm protocol — also replaced the non-existent tool name `task_release_or_expire` with the real `task_release`) |
| `docs/agents/pm/flow/main.md` | 4 (2× `task_heartbeat`, 1× `task_claim`, 1× bogus `task_release_or_expire` → `task_release`) |
| `docs/agents/pm/flow/task-archive.md` | 3 (1× `task_claim`, 2× `task_release`) + new Step 0 session-resolution note |
| `docs/agents/market-watcher/flow/cycle.md` | 1 (prose reference to `coverage-stamp.sh`'s internal mutex — rewritten to name `owner_client_session` explicitly; the underlying script, `scripts/agents-flow/coverage-stamp.sh`, was already schema-correct) |
| `docs/agents/news-scout/flow/stage-log-notify.md` | 1 (same class as market-watcher, mirrored) |
| `docs/agents/refine_bctc_md/flow/main.md` | 4 (1× `task_claim`, 1× `task_heartbeat`, 2× `task_release`) + new session-sourcing note (see §5) |
| `docs/agents/agent-father/flow/edit-apply.md` | 3 (own zone, found during the fleet-wide verification sweep in §4 — fixed opportunistically, zero scope-creep risk since it is this agent's own flow) |

Every fix substitutes a literal-placeholder pattern (`"<resolved CLAUDE_CODE_SESSION_ID>"`) with an
explicit instruction to resolve the ACTUAL value first (via `Bash: echo $CLAUDE_CODE_SESSION_ID`, or
the literal value a dispatcher already substituted into the spawn prompt) — never to write the bare
text `$CLAUDE_CODE_SESSION_ID` inside a `call_tool` argument. An LLM-issued `call_tool` is a direct
function call, not a shell command; the variable is not expanded, and the literal string would be
sent as the session id, silently defeating the lock (session memory:
`feedback_llm_issued_call_tool_does_not_expand_session_id_variable`).

## 4. Fleet-Wide Verification Sweep — Scope Was Larger Than The Dispatched 6 Files

Per AC-1 ("re-derive parameter names from `coordinationTools.ts` directly, do not copy from a
sibling doc that may carry the same drift"), a full sweep was run across the live-protocol universe
— `docs/agents/*/flow/*.md`, `docs/agents/*/init.md`, `.claude/skills/*/SKILL.md` (266 files) — using
the same detection logic later wired into the CI guard (§6). It found **23 additional non-compliant
call sites across 9 files** beyond the 6+1 named in the dispatched task:

`docs/agents/ba/init.md` (2) · `docs/agents/dev-team/flow/drain-esc-dispatch.md` (5) ·
`docs/agents/dev-team/flow/execute-tier.md` (2) · `docs/agents/dev-team/flow/post-cycle.md` (4,
commented-out example code) · `docs/agents/developer/init.md` (2) · `docs/agents/pm/init.md` (2) ·
`docs/agents/po/flow/sprint-kickoff.md` (1) · `docs/agents/po/flow/sprint-signoff.md` (2) ·
`docs/agents/qa/flow/main.md` (2) · `docs/agents/unified-agent/flow/chef.md` (1).

`docs/agents/dev-team/flow/execute-tier.md` is dev-team's own per-tier parallel-spawn dispatcher-wrap
— arguably higher blast radius than commit-mutex, since every tier spawn in dev-team's core loop
routes through it.

**Disposition:** out of scope for this task (dispatched as size S against a named 6+1 files; these 9
additional files belong to other agents' zones — dev-team, po, qa, ba, developer, unified-agent — and
each carries real risk if edited without the same per-flow verification depth applied to the 8 files
actually fixed here). Grandfathered explicitly in `docs/data/task-claim-owner-session-baseline.json`
(§6) rather than silently laundered as fixed or left to break CI on files nobody asked this task to
touch. **Recommend a dedicated P1 follow-up task** (PO to size/dispatch) to burn this baseline down —
`execute-tier.md` and `drain-esc-dispatch.md` first, given dev-team's fleet-wide reach.

## 5. `refine_bctc_md` — Doc Fix Alone Does Not Close The Live Victim

`refine_bctc_md` holds `Read, Write, mcp__gateway__call_tool` only — **no Bash**
(`.claude/agents/refine_bctc_md.md`). It cannot resolve `$CLAUDE_CODE_SESSION_ID` itself. The value
must arrive as a literal string via the spawn prompt. Checked
`docs/agents/cowork-team/flow/spawn-fanout.md` § Step 5.2 (`IDENTITY_PREAMBLE` composition) and the
live `trigger_prompt` text for all 4 `refine-bctc-slot-*` entries in `docs/data/cowork-schedule.json`
— **neither currently carries a session-id coordination parameter.** The doc fix in this task (§3)
is necessary (correct call shape, correct parameter names) but **not sufficient** to make the live
call path succeed end-to-end: cowork-team's spawn composition must also inject the literal session id
into the prompt, mirroring the pattern this very dispatch used to reach agent-father
(`owner_client_session = 64c7c677-...` handed as spawn-prompt prose). That injection change is in
`docs/agents/cowork-team/flow/spawn-fanout.md`, a different agent's zone and a materially different
kind of change (dispatcher prompt composition, not a doc-only parameter-name fix) — flagged here as a
**required follow-up**, not silently claimed as done. `refine_bctc_md/flow/main.md` now documents this
gap explicitly (SELF-IDENTITY GUARD section) so the next fire that fails schema validation points
straight at the actual missing channel instead of re-discovering it from scratch.

## 6. CI Guard — `scripts/audits/task-claim-owner-session-lint.sh`

Baseline/ratchet design (mirrors `size-lint-justification.sh`, NOT zero-tolerance like
`metric-mask-lint.sh`/`dead-code-gate.sh` — the fleet-wide debt found in §4 makes zero-tolerance
impossible without either breaking CI on unrelated files or silently laundering known debt).

- **Scan set:** `docs/agents/*/flow/*.md`, `docs/agents/*/init.md`, `.claude/skills/*/SKILL.md` — the
  live-protocol universe agents actually execute from. Deliberately excludes
  `docs/architecture-briefs/` (historical, this file included), `docs/agent-memory/` (notebooks/health
  logs), `docs/handoffs/` (point-in-time specs), and `docs/agents/tools/{list,package}/*.md`
  (reference tables) — including those floods the gate with non-actionable historical false positives
  (verified live: dozens of pre-TASK_1980 architecture-brief mentions predate the
  `owner_client_session` rebind entirely and would never converge).
- **Detection:** any line opening a `task_claim`/`task_release`/`task_heartbeat` call (either
  `call_tool(server=..., tool="task_X", ...)` or bare `task_X(...)` shorthand) opens a window running
  to the next call-start match (exclusive) or 20 lines, whichever is first. FAIL if
  `owner_client_session` is absent from that window.
- **Baseline:** `docs/data/task-claim-owner-session-baseline.json`, keyed on the EXACT
  `(file, line, snippet)` triple — editing a grandfathered line at all (not just adding the field)
  forces re-triage; the ratchet cannot be silently defeated by touching a baselined line for an
  unrelated reason. 23 entries opened at ship time (§4's findings).
- **Escape hatch:** `task-claim-lint-allow: <reason>` comment on the matched line or the line
  immediately preceding it — for a genuine prose-only tool-name mention with no argument list (none
  needed live at ship time; included for completeness, same convention as
  `hardcode-scan-allow:`/`size-justification:`).
- **Tests:** `scripts/audits/task-claim-owner-session-lint.test.sh` — 7/7 passing, covering live-repo
  pass, synthetic missing/present cases, the escape hatch (+ negative control), the ratchet
  (edited-baseline-line re-fails), and the bare-shorthand detection form.
- **CI wiring:** new job `task-claim-owner-session-lint` in `.github/workflows/ci.yml`, alongside the
  other pure-bash/grep guardrail jobs (size-lint, metric-mask-lint, dead-code-gate,
  no-hardcode-allowlist-scan).

## 7. Re-Verification Against The Live Schema (AC-5)

This agent (agent-father) holds no `mcp__gateway__call_tool` grant in this session and cannot issue a
live `task_claim` call to empirically re-run the two incidents end-to-end. What was verified instead:

- **Syntactic re-verification:** every fixed call in §3, read back against
  `coordinationTools.ts:82-218` line-by-line, now supplies exactly the parameter names/types the live
  Zod schema requires (`task_id`, `task_kind`, `owner_agent`, `owner_client_session`, optional
  `ttl_seconds`/`payload` for `task_claim`; `task_id` + `owner_client_session` for
  `task_heartbeat`/`task_release`) — a call issued exactly as now documented would pass schema
  validation.
- **refine_bctc_md:** doc-level defect closed; live-path defect (spawn-prompt channel, §5) remains
  open and is now explicitly named rather than silently assumed fixed.
- **alert-commander:** doc was already compliant pre-task; the live incident's actual root cause is a
  separate, already-tracked row (§2) — not touched by this task, not falsely claimed as closed.
