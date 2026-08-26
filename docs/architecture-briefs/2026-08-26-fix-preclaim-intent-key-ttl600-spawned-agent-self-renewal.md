# FIX-PRECLAIM-INTENT-KEY-TTL-600-EXPIRES-UNDER-LONG-RUNNING-AGENT — Design

**Zone:** `.claude/skills/dispatch-claim/`
**Files:** `.claude/skills/dispatch-claim/CARD.md`, `.claude/skills/dispatch-claim/SKILL.md`
**Related:** `FIX-DEVTEAM-RESUME-KEY-TTL-3600-LAPSES-UNDER-LIVE-AGENT-REOPENING-DOUBLE-SPAWN-WINDOW` (sibling,
shipped `faf84a6f6` + `ecb825731`, now in `review[]`) — **SIBLING, NOT DUPLICATE.** That fix heartbeats
`task:<row-id>` (`sprint-task` kind, ttl 3600). It never touches `intent:<agent>:<key>` (`intent` kind,
ttl 600) — the exact namespace `.claude/skills/dispatch-claim/CARD.md` itself calls "the hard gate."
**Scan clean:** true — brownfield check confirmed `intent:` is claimed/released ONLY at the two sites
this brief edits (`CARD.md` § Phase B, `SKILL.md` § Pattern — Router-Scope Dispatch Wrap); no other file
constructs an `intent:` lock.
**BUILD-STANDARD:** not-applicable (bug-fix, in-zone, no new primitives).

---

## 0. Evidence (carried forward from the row, do not re-derive)

Row `status_note` + occurrence trail, 4 independent measured samples across 4 agent types, same
defect shape, all in `docs/data/orch/orch-state.json` today:

| Agent | Runtime | `intent:` claimed | Result at return |
|---|---|---|---|
| architect | 1,369,909 ms (~22m50s) | ttl=600 | `task_release` → `ok:true released:0` (already gone, ~12m50s unguarded) |
| agent-father | 669,440 ms (~11m10s) | ttl=600 | `released:1` only by lucky race |
| po | 1,009,293 ms (16m49s) | ttl=600 | `released:0` (~7m unguarded), 2 live peer sessions in the roster at that moment |
| agent-father (2nd sample) | 1,082 s | ttl=600 | `released:0` |

Zero-impact-so-far is luck (no peer actually raced into the window), not a property of the design.
**Live corroboration from THIS dispatch:** this exact architect run's own `intent:architect:<key>` was
claimed at ttl=600 by the same mechanism being fixed.

---

## 1. Root cause — why this is architecturally different from the sibling, not a copy-paste fix

The sibling's fix works because `dev-team` (the party holding `task:<row-id>`) **cannot itself call the
Task/Agent tool a second level deep** (`feedback_devteam_flow_needs_nested_agent_spawn_subagent_cannot`
— a subagent structurally cannot spawn a grandchild subagent). So `dev-team`'s own `Agent(..., 
run_in_background=true)` call in `main.md` (S2/RLC/DRS/ILC) is **not a literal spawn** — it is
`dev-team` handing the decision back up to its own parent (the true router) and exiting its own tick
within milliseconds. `task:<row-id>` is therefore claimed-and-never-released-on-success by design
(`FIX-DEVTEAM-BACKGROUND-SPAWN-LOCK-RELEASED-AT-SPAWN-NOT-COMPLETION`) and its liveness is proven the
only way `dev-team` *can* prove it: by a **later, independent cron tick** re-visiting the same
`.head.active_task_id` and renewing on the peer-held branch, using `current_holder.owner_client_session`
verbatim (never guessed) — cadence 30 min, ttl 3600s, 2x headroom, self-heals via WF-3/WF-4 if the
dispatcher genuinely dies.

`intent:<agent>:<key>` is claimed one layer further OUT, by the **true router** — the session that
physically executes `Agent(subagent_type=<agent>, prompt=...)` as a real, literal spawn. Unlike
`dev-team`'s internal hand-off, this call is a genuine blocking invocation: the calling context does not
resume its own turn — and therefore cannot interleave any other tool call, including a renewal — until
the spawned agent's run actually completes. That is exactly what all four measured samples show: release
consistently lands at the spawned agent's real completion time, 10–25 minutes later, never near-instantly
after the (fast, logical) dispatch decision. There is no "next tick" for the router to piggyback a
renewal on **within the span of one single spawn** the way `dev-team`'s own cron cadence gives `task:`.

**The only entity that is provably executing (making tool calls) throughout that whole span is the
spawned agent itself.** No amount of restructuring the *router's* side of Phase B closes this — the
router's own context is inert for the entire window by construction. This is the reasoning behind the
row's own "Preferred direction: heartbeat the intent key while the spawned agent is provably live, with
an externally-held bound" — and it is the only structurally viable option, not merely the preferred one.

---

## 2. Options considered (decision-journal `what-considered`)

1. **Raise `ttl_seconds` on the Phase B claim itself (600 → 3600).** REJECTED per the row's own explicit
   constraint and the sibling's own AC-4 precedent: "moves the cliff, does not remove it" — a developer
   L-sized task or an agent-father fleet-wide sweep can plausibly exceed even 3600s; a static bump just
   changes which measured sample eventually reproduces the bug. Also does nothing for the row's own
   negative control (see §4).
2. **Cross-check the corresponding `task:<task_id>` lock (already self-renewing per the sibling fix) as
   a liveness backstop when `intent:` is found free.** Works ONLY for sprint-task-class dispatches that
   happen to carry both locks; does nothing for pure ad-hoc router-user-intent dispatches (namespace
   table, "Router user-intent dispatch" row) that have no `task:` counterpart at all. Rejected as
   incomplete coverage for a fix that must hold at the Phase B layer generically (Phase B is invoked "by
   any dispatcher... for sprint-task, intent, or cowork-slot work" — CARD.md's own trigger line).
3. **Have the router run a concurrent background heartbeat loop while the one blocking spawn call is
   in flight.** Rejected: per §1, the router's own context does not regain control until the spawned
   agent's call returns — there is no concurrent tool-call slot available to interleave a heartbeat in
   the first place. This is not an implementation gap; it's the actual constraint the whole row exists
   to work around.
4. **Wire a periodic self-heartbeat into every individual agent flow file** (architect, developer, ba,
   pm, qa, agent-father, ops, ...). Would work, but the row's own `files:` scope is
   `.claude/skills/dispatch-claim/{CARD,SKILL}.md` only — touching ~20 flow files is a different-order
   blast radius for an S-sized FIX row and duplicates the same boilerplate 20 times. Rejected for scope;
   flagged as a residual-risk fast-follow in §6 for agent classes with a plausible >60min tail.
5. **CHOSEN: single, bounded, opportunistic self-renewal, delivered via the spawn prompt text itself
   (not via any agent flow file), executed by the spawned agent as one of its own first tool calls.**
   Detailed in §3.

---

## 3. Chosen design

**Mechanism:** the router (whichever dispatcher is running Phase B — CARD.md's "any dispatcher") embeds
one additional, self-contained instruction block into the `prompt` string it already constructs for
`Agent(subagent_type=<agent>, prompt=...)`. The spawned agent, executing that instruction as one of its
own first tool calls, renews the **exact same** `intent:<agent>:<key>` row the router claimed a moment
earlier — using the router's own `owner_client_session` (already passed to every spawned agent today as
the `coordination_session=$CLAUDE_CODE_SESSION_ID` parameter, per SKILL.md § Passing
`$CLAUDE_CODE_SESSION_ID` to Subagents — **no new parameter, no new plumbing**), never its own session
id. This is the identical "renew using `current_holder`'s session, never guessed" honesty rule the
sibling fix already established and proved safe (`taskHeartbeatTool.ts` Rung A: match is solely on the
supplied `owner_client_session` value, not on which MCP client made the call).

`ttl_seconds:3600` on this ONE heartbeat call — not a new magic number, the same already-vetted
sprint-task value (`task-lock-protocol.md` § TTL Reference) — gives ~2.6x headroom over the worst
measured sample (1,369,909 ms ≈ 1370s) and matches the sibling's own ratio discipline (its
`dev-team-cron-singleton` precedent sizes TTL at "1.5x observed 99th-pct duration").

### 3.1 New spawn-prompt block (embedded verbatim by the claiming dispatcher)

```
COORD-SELF-RENEW (best-effort, non-blocking — call this as one of your first tool calls, at or
around your own Step 0a; do not let a failure here block or delay your own work):
call_tool(server="vn-market", tool="task_heartbeat", arguments={
  task_id:              "intent:<agent>:<key>",
  owner_client_session: "<the coordination_session value passed above — the DISPATCHER's
                          $CLAUDE_CODE_SESSION_ID, never your own>",
  ttl_seconds:          3600
})
If this errors or returns ok:false: log one line and continue — never retry, never treat as blocking.
```

`<agent>` / `<key>` are the exact same literals the dispatcher used for its own Phase B claim moments
earlier — substituted at spawn-prompt-construction time, not derived by the spawned agent.

### 3.2 CARD.md diff (Phase B block)

```diff
 ## Phase B — intent PRE-CLAIM (the hard gate)
 ```
 c = task_claim(task_id="intent:<agent>:<key>", task_kind="intent", owner_agent=<role>,
                owner_client_session=$SID, ttl=600, payload={site:"router", intent:<key>})
 if c.claimed:
-  try: spawn(agent)  finally: task_release("intent:<agent>:<key>", $SID)
+  try: spawn(agent, prompt+=SELF_RENEW_BLOCK)   # § Step 2.5b (SKILL.md) — spawned agent
+       finally: task_release("intent:<agent>:<key>", $SID)  # self-renews its OWN guard once
 elif c.current_holder.owner_client_session == $SID:
   task_heartbeat(...) # re-entrant — proceed to spawn as above
 else:
   log "PRE-CLAIM collision"; send_telegram(work); EXIT  # no spawn, no cost
 ```

 Step 0a self-registration, Fire-Time Election, sprint-task `task:` wrap → SKILL.md (dispatchers already
-inline their own Step 0a instantiation — see cowork-team/dev-team `main.md`).
+inline their own Step 0a instantiation — see cowork-team/dev-team `main.md`); intent: self-renewal
+prompt block (SELF_RENEW_BLOCK) → SKILL.md § Step 2.5b.
```

(Net +1 line body, CARD.md stays close to its own <=40L hot-path convention.)

### 3.3 SKILL.md diff

(a) Update § Pattern — Router-Scope Dispatch Wrap's own code block to match §3.2's shape (same
one-line-to-two-line change, plus the same comment), and insert a new subsection immediately after it,
before § Sprint-Task Outer Wrap (which is out of scope — that namespace is the sibling's, already
fixed):

```diff
   try:
     Agent(subagent_type=<agent>, prompt="run docs/agents/<agent>/flow/main.md
-          coordination_session=$CLAUDE_CODE_SESSION_ID task=<intent-key>")
+          coordination_session=$CLAUDE_CODE_SESSION_ID task=<intent-key>
+          " + SELF_RENEW_BLOCK)   # § Step 2.5b below
   finally:
```

(b) New section, inserted between § Pattern — Router-Scope Dispatch Wrap and § Sprint-Task Outer Wrap:

```markdown
## Step 2.5b — Intent-Lock Self-Renewal (Spawned-Agent Keepalive)

**Sprint:** FIX-PRECLAIM-INTENT-KEY-TTL-600-EXPIRES-UNDER-LONG-RUNNING-AGENT
**Design:** `docs/architecture-briefs/2026-08-26-fix-preclaim-intent-key-ttl600-spawned-agent-self-renewal.md`

**Root cause this closes:** the router's Phase B `intent:<agent>:<key>` claim (ttl=600) is released only
when the spawned agent's real work actually completes (a genuine blocking spawn — unlike `dev-team`'s own
internal `task:<row-id>` hand-off, which cannot itself call the spawn tool a level deeper and exits
within milliseconds). Measured runtimes of 10–25 minutes across 4 agent types (architect, agent-father,
po) routinely outlive the 600s claim, so the guard is free for the tail of nearly every normal run —
confirmed live 4 times same-tick, 2026-08-26. The router's own context is inert for that whole span (a
single blocking tool call, no interleaved renewal slot exists on that side) — only the spawned agent is
provably executing throughout, so only it can renew.

**Mechanism:** the claiming dispatcher appends `SELF_RENEW_BLOCK` (verbatim text below) to the spawn
prompt it already constructs. The spawned agent executes it as one of its own first tool calls,
`owner_client_session` sourced from the SAME `coordination_session` value the dispatcher already passes
(§ Passing `$CLAUDE_CODE_SESSION_ID` to Subagents below) — never the spawned agent's own session id
(Rung A ownership match is solely on the supplied value, `taskHeartbeatTool.ts`; this is the identical
never-guessed pattern the sibling fix (`ecb825731`) already established for `task:<row-id>`).

```
SELF_RENEW_BLOCK =
"COORD-SELF-RENEW (best-effort, non-blocking — call this as one of your first tool calls, at or
around your own Step 0a; do not let a failure here block or delay your own work):
call_tool(server=\"vn-market\", tool=\"task_heartbeat\", arguments={
  task_id:              \"intent:<agent>:<key>\",
  owner_client_session: \"<coordination_session value passed above>\",
  ttl_seconds:          3600
})
If this errors or returns ok:false: log one line and continue — never retry, never treat as blocking."
```

**Bound properties (never unbounded — same discipline the sibling's AC-6 forced onto `task:`):**
- The BASE Phase B claim's own `ttl_seconds:600` is UNCHANGED — this fix never touches the claim call.
- This is a SINGLE opportunistic extension, never a recurring loop. An agent that hangs past 3600s
  still lets the lock lapse naturally — the same crash-recovery guarantee every other TTL lock in this
  system already relies on. There is no path by which this fix makes an `intent:` row permanently
  un-reclaimable (the row's own negative control, `po_occ3_20260826T0729Z`).
- An agent that dies (or is killed) before reaching this instruction — including one that never starts
  at all — leaves the lock on its untouched original 600s TTL: byte-identical to today's pre-fix
  behavior. No regression, no new stuck-lock class.
- Failure of the heartbeat call itself (F1/F3/F5, `docs/protocols/task-lock-protocol.md` § Failure
  Modes) is explicitly non-fatal to the agent's own work — logged, never retried, never blocking.
- `intent`-kind rows are not in the reaper's `ORPHAN_EMIT_ALLOW_LIST` (only `sprint-task`,
  `cowork-slot`, `dashboard-row` are — § Non-Adoptable above) — this fix does not interact with, and
  does not need to interact with, Phase A orphan-adoption at all.

**Residual risk — bounded, not closed (same convention as § Step 2.4's own Residual risk note):** a
single early renewal does not protect an agent whose run plausibly exceeds ~60 minutes (a large
developer L-sized implementation, or an unusually broad agent-father fleet sweep) — none observed in the
4 measured samples (max 22m50s), but not structurally impossible. Closing that tail would require either
a second renewal checkpoint inside the individual agent's own flow file (out of this row's
`.claude/skills/dispatch-claim/` scope — flagged as a follow-up row, NOT implemented here) or a
genuinely different mechanism (e.g. an external watchdog). Not implemented in this row.
```

(c) Extend § Passing `$CLAUDE_CODE_SESSION_ID` to Subagents with one cross-reference sentence noting the
same value is now also the `owner_client_session` used by `SELF_RENEW_BLOCK` (§ Step 2.5b) — no
duplication of the existing DO/DO NOT guidance there.

---

## 4. Verification plan (for agent-father / QA, not executed by this brief)

1. **AC-1 (guard doesn't expire while genuinely live):** replay against a scratch `coordination.db` copy
   (never live) — claim `intent:test-agent:x` ttl=600, sleep past 600s, issue the exact
   `SELF_RENEW_BLOCK` heartbeat, confirm the row is still claim-blocked (peer `task_claim` returns
   `claimed:false`) at t=1200s (past the original ttl, inside the renewed one).
2. **AC-2 (crash recovery preserved, proven not asserted):** a second scratch run that claims but never
   issues the self-renewal — confirm the row IS claimable by a peer at t=601s, unchanged from today.
   A third run that renews once then "dies" (no further activity) — confirm the row is claimable again
   at t>3600s from the renewal, never permanently stuck.
3. **AC-3 (negative control, carried from `po_occ3_20260826T0729Z`):** confirm a session whose presence
   row has actually expired (dead terminal) is unaffected — this fix adds no new path that keeps a truly
   dead session's `intent:` lock alive past its last renewal.
4. **AC-4 (real fleet measurement):** re-run the same measurement the row's own occurrences used
   (compare `task_release`'s `released:` field across a handful of real dispatches post-fix) — expect
   `released:1` (or a legitimately-already-expired `released:0` only when no renewal ever fired, e.g. a
   sub-10-minute agent that finished before even reaching Step 0a's renewal call — should not occur in
   practice since the renewal is one of the agent's first actions).
5. `scripts/audits/devteam-dispatch-gate-satisfiability.sh` structurally cannot exercise this (same
   reasoning the sibling row's own AC-5 already recorded — no `.jq` file backs either `task_claim` or
   `task_heartbeat` call sites); a new synthetic-fixture harness (stubbed `call_tool` responses) is the
   right instrument if QA wants one — flagged as a PENDING Reusable-Scripts candidate, not built here
   (scripts/ is outside architect's own commit scope for this row).

---

## RETURN

DONE: Design complete — spawned-agent self-renewal of `intent:<agent>:<key>` via a prompt-injected,
best-effort, bounded (ttl=3600, single-shot) heartbeat, sourced from the already-passed
`coordination_session` value. Base claim ttl (600s) is UNCHANGED per the row's own constraint. Findings
written to this brief; row's own `architect_review_note` carries a pointer + one-paragraph summary.
ZONE: `.claude/skills/dispatch-claim/`
NEXT: agent-father | apply the CARD.md + SKILL.md diffs in §3.2/§3.3 verbatim, run the verification plan
in §4 against a scratch `coordination.db` copy (never live), update
`docs/protocols/task-lock-protocol.md` § TTL Reference with an `intent` row if desired (not this row's
own `files:` scope, optional fast-follow).
HANDOFF: docs/architecture-briefs/2026-08-26-fix-preclaim-intent-key-ttl600-spawned-agent-self-renewal.md
PIPELINE: continue
