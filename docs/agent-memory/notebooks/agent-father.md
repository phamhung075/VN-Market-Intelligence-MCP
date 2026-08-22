# Agent Father — Notebook

<!-- Entry 2026-08-07 12:58 UTC (Keep/maintenance) split to
     docs/agent-memory/notebooks/archive/agent-father-archive-20260812.md on 2026-08-12
     (self-prune, byte cap 12000B breached at 172L/15376B) — CLEAN-NB-AGENT-FATHER-MIXED-
     HEADING-OVERCAP-DISARM. Also disarmed the sentinel-immunity trap that made this file's
     one dated heading look like "oldest": every retained ## heading below now carries an
     explicit YYYY-MM-DD token. Nothing deleted; full record in the archive file and git
     history. -->

## FIX 2026-08-22T18:40Z — FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE, WF-3 lane-move
gap (router-dispatched directly, row's own `next_agent=agent-father`; architect had just completed
diagnosis + brief correction, no task_claim — same no-gateway-binding condition, solo-operation).

- Root cause (architect-diagnosed, not re-litigated here): `main.md` WF-3's escalation jq flipped a
  bound-exceeded row to `status:BLOCKED` in place inside `.task_board.in_progress[]` without lane-
  moving it into `backlog[]` in the same write — violates `execute-tier.md:116`
  CANONICAL:SSOT-STATUSFLIP-LANEMOVE(c); traces to the architecture brief's own §5c code sample
  (`2026-08-07-devteam-head-pin-stale-threshold-resume-bound.md`), which the 08-14 implementation
  pass copied verbatim, not an implementation deviation.
- Applied architect's corrected §5c verbatim to `docs/agents/dev-team/flow/main.md`'s WF-3 block
  (the `resume_attempts>=3` branch): jq now conditionally appends the flagged row (with
  `status:BLOCKED`/`hold_reason`/`resume_attempt_bound_exceeded_at`/`_by`) to `backlog[]` and
  removes it from `in_progress[]` in the SAME write, mirroring WF-1's BLOCKED-task check
  (`main.md:331-338`); also added the missing `(<Xh Ym>)` duration parenthetical to WF-3's BUG
  telegram (WF-4's sibling message already had it, §4 spec always required it). +21L (1276→1297).
  Dry-run verified the corrected jq against a synthetic in_progress[]-row fixture before landing —
  row moved to `backlog[]` with `BLOCKED`/lane fields, `in_progress[]` emptied, as expected.
  Dated entry appended to the file's own top size-justification comment (established convention).
- Board row: near the 12000B prose-ceiling guard (measured 14968B, unchanged by this write —
  ceiling check confirms 0 growth). Kept the row write minimal/structural only:
  `next_agent: "agent-father" → "qa"` + `updated_at`/`updated_by` bump — net -10B, no new prose
  field added (full narrative lives here instead) — routes back through Review-Lane QA-Drain
  (`review[]`, `status==REVIEW`, `next_agent=="qa"` selector) for re-verification rather than
  self-certifying DONE_VERIFIED on orchestration-core dispatch logic (same practice as the 08-14
  original pass).
- No MCP gateway tool binding this session — could not `send_telegram` a work-channel notice;
  flagging in RETURN for the router to relay.

## FIX 2026-08-22T19:43Z — FIX-TRIAGE-INBOX-CLEAR-OWNERSHIP-PO-SELF-READ, dev-team-vs-po CLEAR ownership contradiction

Router-dispatched directly (no task-board row existed; router flagged the contradiction PO surfaced
during today's triage and declined to arbitrate itself — correctly, per PO's own boundary_rules).

- **Contradiction:** `docs/agents/po/flow/triage-signals.md:7` said the subtractive CLEAR on
  `.dev_team_idle_chain.pending_triage_inbox[]` belongs to `docs/agents/dev-team/flow/main.md` §
  Step 1, never PO. PO's own notebook (~90 min earlier, same session) cited that exact line to
  decline the clear. 90 minutes later the router's own direct-to-PO dispatch prompt (per
  `.claude/skills/dispatch/SKILL.md`'s "queue / triage" dispatch-table row) instructed PO to do the
  clear instead — contradicting the doc. A 64-envelope backlog (including an already-correctly-
  dispositioned 08-15 `ci_red`) had regrown because nothing reliably cleared it.
- **Root cause, verified before picking a side (not just "router guessed wrong once"):** dev-team's
  Step 1 CLEAR code (`main.md:1100-1129` before this fix) was well-formed and workable IN ISOLATION
  — it ran, in-session, immediately after PO's spawn returned, using the SAME `pendingSignals` var
  captured before spawn. But `.claude/skills/dispatch/SKILL.md:40` has a standing, sanctioned
  dispatch-table row — "queue / triage — what should we work on? → po → main" — that spawns PO
  DIRECTLY, bypassing `dev-team/flow/main.md` entirely. On that path, dev-team's Step 1 CLEAR
  block is never reached — physically unreachable, not merely skipped. Confirmed live: today's
  contradiction was exactly this — the router took the direct-dispatch path and had to improvise.
  So dev-team-Step-1-owns-it was not survivable as written; the real question was which party is
  present on BOTH invocation paths — that's PO (`docs/agents/po/flow/main.md`'s own "Called from"
  line only ever named the dev-team path — also stale, also fixed here).
- **Fix — ownership moved to PO, made self-sufficient on either invocation path:**
  - `docs/agents/po/flow/triage-signals.md`: PO's Step 0-SIG now does its own fresh
    `.dev_team_idle_chain.pending_triage_inbox` read as SSOT (never trusts a caller-supplied
    array), and owns the CLEAR unconditionally as its own last step (new executable
    `ORCH_APPLY_DECLARED_INBOX_TRIAGED`-guarded block, same shape dev-team used, `_updated_by:
    "po"`). Framing/header rewritten to name both invocation paths explicitly.
  - `docs/agents/dev-team/flow/main.md` § Step 1: removed the CLEAR write; its own durable-inbox
    read is kept, re-scoped to the no-op short-circuit gate + convenience-pass only. History
    comment appended (established convention).
  - `docs/agents/po/flow/main.md`: "Called from: dev-team Step 1" / "Receives: pendingSignals[]
    from Step 0a" lines corrected to name both paths + PO's self-read (this was flagged as a known
    residual gap by `FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION` 2026-08-09 and left untouched then —
    closed now, same task).
  - `docs/agents/dev-team/flow/drain-signals.md`: cross-reference pointer that named
    `dev-team/flow/main.md § Step 1` as the CLEAR site re-pointed to `po/flow/triage-signals.md §
    Step 0-SIG` — no functional change to this file's own append-only logic.
- **`docs/policies/dev-standards.md` — drafted then REVERTED, out of zone:** that file's own
  "Inbox row-identity dimension" CANONICAL block (~L351-373) also names
  `docs/agents/dev-team/flow/main.md § Step 1` as the CLEAR site and is now stale by the same
  measure as drain-signals.md's pointer above. Drafted the identical pointer correction, then
  reverted it (`git checkout -- docs/policies/dev-standards.md`) on re-checking
  `commit-boundary/SKILL.md`'s per-agent zone table + my own init.md `commit_zone.allowed` — neither
  lists `docs/policies/` for agent-father (allowlist model: `docs/agents/`, `docs/agent-memory/`,
  `.claude/skills/`, `.claude/agents/` only). **Flagged via RETURN as a residual follow-up** for
  whichever agent owns `docs/policies/` commits — exact before/after text: replace `` Wired ONLY
  into `docs/agents/dev-team/flow/main.md` § Step 1 "Durable-inbox CLEAR" — the SOLE legitimate
  remover of inbox entries `` with `` Wired ONLY into `docs/agents/po/flow/triage-signals.md` §
  Step 0-SIG "Durable-inbox CLEAR" (moved off `docs/agents/dev-team/flow/main.md` § Step 1 by
  `FIX-TRIAGE-INBOX-CLEAR-OWNERSHIP-PO-SELF-READ`, 2026-08-22 — that call site was unreachable
  whenever PO is spawned directly by the router instead of via a dev-team tick) — the SOLE
  legitimate remover of inbox entries `` (same section header + one earlier "Step-1 triage pass"
  wording tweak a few lines above it) — mechanical text-only fix, no logic change, low risk to hand
  off.
- **Not touched (deliberate):** the architecture brief
  `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` and the closed
  `docs/handoffs/TASK_FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION.md` — historical design/handoff
  records of what was implemented at the time, not live specs an agent re-reads each cycle; SUPERSEDED-
  not-deleted convention applies. Did not edit PO's notebook or decision journal (another agent's
  memory — out of scope; PO's own entry `docs/agent-memory/decisions/triage-20260822T1927Z-po.md`
  already documents the incident from PO's side and was cross-checked, not modified).
- No task-board row minted — pure flow-doc/spec-clarity correction across 4 docs (all within
  agent-father's `docs/agents/` commit zone) + this notebook entry; no code/orch-state.json
  touched, `docs/policies/dev-standards.md` handed off (see bullet above) rather than self-committed
  out-of-zone. Committed directly per the task's own "lighter-weight, sufficient resolution"
  allowance.
