<!-- size-justification: ~220L — two coupled defects (misplaced note + registration-layer dedup
gap) plus one newly-discovered, higher-severity finding (fire-election RE-ENTRANT hole) that shares
the exact same root cause; each needs a falsifiable root-cause citation (file:line) and an
implementable pseudocode diff for agent-father, matching this repo's evidentiary bar for
coordination-system briefs (see 2026-08-06-cron-rearm-cross-session-dedup.md, same class).
PLAN-ONLY — no Cron*/task_claim/task_heartbeat call made authoring this brief; the two `ps`
Bash calls run were read-only process inspection to validate the proposed fingerprint mechanism,
not coordination-tool calls. -->

# Cowork Cron-Registration Sibling-Process Defer — Marker Fingerprint + Misplaced-Note Fix

**Date:** 2026-08-15
**Author:** agents-architect
**Trigger:** Router-dispatched — user hand-authored a "Block/Interdit" defer note in the wrong file
(`cron-detect-loop/register.md`, inert there) intending to stop THIS session from registering the
cowork-team `*/15` dispatcher because "another terminal" already owns it.
**Status:** PLAN-ONLY. No `Cron*`/`task_claim`/`task_heartbeat` tool called authoring this brief.

---

## 0. Two defects restated, one correction, one new finding

1. **Misplaced note (confirmed).** The user's note lives in `.claude/skills/cron-detect-loop/
   register.md`, which is lazy-loaded only by `cron-detect-loop/SKILL.md` Step 1d, itself gated on
   Step 1 finding one of that skill's OWN 4 jobs missing. It governs nothing about the cowork `*/15`
   dispatcher (a wholly separate skill/marker: `cron-cowork-team/SKILL.md`, marker `task_id=
   "cron-registration:cowork-team"`). Confirmed via `git diff` — appended after the P3-addendum
   reference line, zero other readers exist. **Fix: relocate, don't delete the intent (§3).**

2. **Registration-layer dedup gap (confirmed, root-caused).** `cron-cowork-team/SKILL.md` Step 1a's
   fast path (`task_heartbeat(task_id="cron-registration:cowork-team",
   owner_client_session=$CLAUDE_CODE_SESSION_ID)` → `hb.ok==true` → skip straight to local `CronList`
   classify) keys **exclusively** on `owner_client_session`. Two OS processes that happen to share one
   `$CLAUDE_CODE_SESSION_ID` (verified live this session — see §1) both pass this check, then each
   independently runs Step 1d's local `CronList`/`CronCreate` — invisible to each other's `CronList`
   by design (`CronCreate`/`CronList` are strictly per-process; the skill's own header says so). Result:
   two local `*/15` cron entries under one session.

3. **Correction to the router's cited evidence.** The router's dispatch reasoned that
   `owner_session` (e.g. `pid-1-ts-1786648720503`, present on every lock row) "already captures a
   process+boot identifier... but is never checked," implying it could discriminate the two sibling
   processes. **This is wrong — verified by reading the source, not asserted:**
   `apps/mcp-server/src/interface/mcp/tools/system/coordination/taskClaimTool.ts:25-30` computes
   `SERVER_SESSION_ID = pid-${process.pid}-ts-${Date.now()}` **once, at MCP-server module load** —
   it is the **MCP server's own** process+boot identifier, injected identically into every claim from
   every client/terminal the server currently serves. `coordinationTools.ts:18` labels it explicitly:
   `"owner_session (DIAGNOSTIC): server-side process discriminator... MUST NOT be used as the
   ownership key."` It changes only when the MCP server itself restarts — never when a different CLI
   terminal calls it. **It cannot and does not discriminate client OS processes.** No existing field,
   anywhere in the coordination surface, does. This also means the router's `session-presence` count
   ("exactly ONE live row") is **not** counter-evidence either: `task_id = "session-presence:" +
   $CLAUDE_CODE_SESSION_ID` (`.claude/skills/dispatch-claim/SKILL.md:162,173,199`) is a per-**session**
   singleton by construction — two sibling processes sharing one UUID would both heartbeat the exact
   same row, still showing as "1 live row" either way. The architecture genuinely has zero visibility
   into this ambiguity today.

4. **New finding — the same gap reopens the P3 fire-time election's core guarantee, not just cron
   housekeeping.** `docs/agents/cowork-team/flow/leader-lock.md` (and its `*/15`-tick copy inside
   `scripts/agents-flow/cowork-tick-preflight.sh`, plus dev-team's Step [3] and the auditor-tier
   fire-elections built the same way per `docs/architecture-briefs/2026-06-28-fire-time-leader-
   election-P3-addendum.md` §C) treat `current_holder.owner_client_session == $CLAUDE_CODE_SESSION_ID`
   as unconditionally safe to **heartbeat + proceed** ("RE-ENTRANT" branch, `leader-lock.md:118-128`).
   That branch was designed for "this exact process restarted mid-tick." If a SIBLING process shares
   the UUID (§2/§3) and each independently holds a local `*/15` cron (the exact bug in §2), then when
   BOTH fire near the same tick boundary, the second process's `task_claim` on `cron:cowork:<TICK>`
   returns `{claimed:false, current_holder.owner_client_session == self}` — the RE-ENTRANT branch —
   and it **proceeds to run the full dispatch pipeline a second time**, defeating the exact
   "exactly one dispatch per tick" guarantee P3-QA (TASK_1995) smoke-tested and shipped. This is a
   **correctness bug** (double work-dispatch), not merely wasted `CronCreate` housekeeping — more
   severe than how the task's own framing described it. **Scope decision (§5): flagged here, NOT
   fixed in this brief's implementation contract** — its blast radius spans `leader-lock.md`,
   `dev-team/flow/main.md` Step [3], all 3 auditor-tier flows, AND the router's own generic
   RE-ENTRANT pattern in `.claude/skills/dispatch-claim/CARD.md`/`SKILL.md` (used before every single
   agent spawn) — too large to bundle into the user's stated ask without PO scoping. Recommending a
   dedicated follow-up (§5).

---

## 1. Live verification — a usable client-side process fingerprint exists, tested this session

Two `ps` calls (read-only, no coordination-tool calls) confirmed a stable, cheap, already-portable
discriminator: `$PPID` (this shell's parent — the actual CLI process; `$$` itself changes every Bash
tool call and is useless) plus that PID's own start time (`ps -o lstart=`, guards PID-reuse):

```
call 1: pid=23422 ppid=97033  →  ps -p 97033 -o lstart=  →  "Mer 12 aoû 19:53:59 2026"
call 2: pid=23484 ppid=97033  →  ps -p 97033 -o lstart=  →  "Mer 12 aoû 19:53:59 2026"  (identical)
```

`$$` changed between calls (fresh subshell per Bash invocation, as expected); `$PPID` + its `lstart`
did not — a stable per-CLI-process fingerprint across many tool calls within one live session.
Separately, `ps -ax -o pid,ppid,comm | grep claude` shows **4 distinct live `claude` processes on
this host right now** (pids 2802, 4442, 24882, 97033) — confirming the multi-terminal precondition
this brief addresses is not hypothetical on this machine. (Whether any pair of those 4 actually share
one `$CLAUDE_CODE_SESSION_ID` was not and cannot be verified from inside this sandboxed subagent —
flagged as an open item, not asserted as confirmed live.)

`GNU`/`BSD ps` both support `-o lstart=`; no new dependency.

---

## 2. Fix design — process-fingerprint field in the existing marker payload (no schema change)

**Reject:** a new MCP tool field/column (`apps/mcp-server` schema change) — out of agent-father's
scope per `commit-boundary/SKILL.md`'s zone table, and unjustified: the existing `payload` field on
`task_claim`/`task_list_held` is already free-form JSON (`coordinationTools.ts` — no schema touch
needed to carry one more string).

**Reject as primary mechanism, keep as documented FALLBACK only:** reintroducing the retired
`feedback_router_cowork_defer_to_live_leader` human convention. P3 (TASK_1994/1995) deliberately
replaced exactly this class of manual "who owns cowork" bookkeeping with code-enforced election
specifically because operator discipline doesn't scale/isn't reliable — resurrecting it as the
primary fix here would silently reverse that decision without re-arguing it. §4 below formalizes it
as an explicit, clearly-labeled fallback (same posture the P3 addendum itself used for its own
memory-convention retirement — "fallback until the code gate is proven").

**Accepted: extend `cron-registration:cowork-team`'s payload with a `registering_process`
fingerprint, checked on Step 1a's fast path.**

### 2.1 Compute (client-side, once per `/cron-cowork-team` invocation)

```bash
if ps -p "$PPID" -o lstart= >/dev/null 2>&1; then
  PPID_START="$(ps -p "$PPID" -o lstart= | tr -s ' ' '_')"
else
  PPID_START="unknown"
fi
LOCAL_FP="ppid-${PPID}-start-${PPID_START}-host-$(hostname)"
```

### 2.2 Step 1a — rewrite (`.claude/skills/cron-cowork-team/SKILL.md`, current lines 35-42)

```
hb = call_tool(server="vn-market", tool="task_heartbeat", arguments={
  task_id: "cron-registration:cowork-team", owner_client_session: $CLAUDE_CODE_SESSION_ID
})

if hb.ok == false:
  → continue to Step 1b (UNCHANGED — different-session-UUID path untouched)

else (hb.ok == true):
  marker_rows = call_tool(server="vn-market", tool="task_list_held", arguments={kind:"sprint-task"})
  # filter client-side for task_id == "cron-registration:cowork-team"
  STORED_FP = marker_row.payload.registering_process   # may be absent — pre-fix marker

  if STORED_FP is absent:
    # Pre-fix marker, no fingerprint recorded yet. Conservative one-time backfill — do NOT
    # false-positive-defer on the first tick after this fix ships:
    call_tool(server="vn-market", tool="task_release", arguments={
      task_id:"cron-registration:cowork-team", owner_client_session:$CLAUDE_CODE_SESSION_ID})
    call_tool(server="vn-market", tool="task_claim", arguments={
      task_id:"cron-registration:cowork-team", task_kind:"sprint-task",
      owner_agent:"cron-cowork-team", owner_client_session:$CLAUDE_CODE_SESSION_ID,
      ttl_seconds:691200, payload:{...marker_row.payload, "registering_process": LOCAL_FP}})
    → GOTO Step 1d

  else if STORED_FP == LOCAL_FP:
    → GOTO Step 1d   # true re-entrant: same OS process, unchanged happy path

  else:
    # SIBLING-PROCESS mismatch: same session UUID, different OS process registered it.
    # marker_row.heartbeat_at is renewed EXCLUSIVELY by the fingerprinted process's own
    # per-tick script (scripts/agents-flow/cowork-tick-preflight.sh Step 2 — grep-confirmed,
    # this session) — a faithful, cadence-specific liveness proxy for THAT process's local
    # */15 cron, unlike session-presence (renewed by ANY activity under this session — see §0.3).
    age_seconds = now - marker_row.heartbeat_at

    if age_seconds <= 1800:   # <= 2x the 15-min native tick, generous jitter margin
      log "[cron-cowork-team] session <SID> already armed by a SIBLING process
        (registering_process=<STORED_FP> vs this process's <LOCAL_FP>) — deferring, no
        local CronCreate this invocation."
      send_telegram(channel="work", "[cron-cowork-team] sibling-process collision — session
        <SID> already armed by another live terminal sharing this session ID. This terminal
        will NOT register its own */15 dispatcher. See docs/architecture-briefs/
        2026-08-15-cowork-cron-registration-sibling-process-defer.md.")
      STOP — do not proceed to Step 1d/1b/any Cron* call this invocation.

    else:
      # Sibling's marker gone stale relative to its OWN 15-min cadence — presumed dead
      # (terminal closed). Steal + re-register (self-heal, same posture as Step 1b.1 DEAD branch).
      task_claim(task_id:"cron-registration:cowork-team", task_kind:"sprint-task",
        owner_agent:"cron-cowork-team", owner_client_session:$CLAUDE_CODE_SESSION_ID,
        ttl_seconds:691200,
        payload:{...,"registering_process": LOCAL_FP,
                 "note":"re-armed after stale sibling-process marker, age_seconds="+age_seconds})
      log "[cron-cowork-team] sibling-process marker STALE (age="+age_seconds+"s) — presumed
        dead, this process re-arms as new fingerprint holder."
      → GOTO Step 1d
```

### 2.3 Step 1c — add one payload field (current lines 78-86)

Add `"registering_process": LOCAL_FP` alongside the existing `"jobs"`/`"registered_at"` keys in the
`task_claim` payload. No other change.

---

## 3. Misplaced-note fix

**Remove** the trailing "Block/Interdit" paragraph from `.claude/skills/cron-detect-loop/
register.md` (the uncommitted user addition — lines 165-167 in the current working tree) — it has
zero readers there and its cadence text (`*/15`, `cowork-tick-preflight.sh`) doesn't even belong to
this skill's own 4 jobs.

**Land the equivalent, actually-enforced intent** as a new documented FALLBACK subsection in
`.claude/skills/cron-cowork-team/SKILL.md`, placed immediately after the existing
`P3-OBSERVE-ONLY-RETIREMENT` section (so its wording/gate structure mirrors that section exactly):

```markdown
## Sibling-Process Defer — Fallback Only (not primary; §2's fingerprint check is primary)

If §2's `registering_process` fingerprint check is ever suspected unreliable (e.g. the `$PPID`/
`lstart` assumption doesn't hold in some future runtime), the safe fallback is operator discipline:
if you know this terminal should never run the cowork dispatcher (another terminal is the designated
owner), simply do not invoke `/cron-cowork-team` here. This mirrors the same two-step posture P3 used
for `feedback_router_cowork_defer_to_live_leader` (§ P3-OBSERVE-ONLY-RETIREMENT above) — code-enforced
first, human convention kept only as an explicitly-labeled fallback, never silently primary.
Retire this note once §2's fingerprint check has 2+ observed clean sibling-process defers with no
false-positive (a live terminal wrongly told to stand down) — track in this session's or a future
session's notebook, not a formal smoke-test gate (this fix is `.md`-only, no dev-team QA sprint).
```

---

## 4. Why this design, not the alternatives

| Option | Verdict | Reason |
|---|---|---|
| Check `owner_session` (server pid+boot) | **Rejected** | §0.3 — proven not a client-process discriminator; would silently never fire (false negative on every real collision) |
| New MCP schema field for client fingerprint | **Rejected** | Unjustified — `payload` already carries free-form JSON; a schema/tool-surface change routes through PM→dev-team for zero added capability |
| Human "this terminal defers, always" convention as primary | **Rejected as primary** | Directly reverses P3's rationale (operator discipline doesn't scale) without re-arguing it; kept as explicit fallback only (§3) |
| Client-side `$PPID`+`lstart` fingerprint in existing marker payload | **Accepted** | No schema change, `.md`-only (agent-father's own zone), empirically verified stable this session (§1), self-heals via `heartbeat_at` staleness (§2.2) — same guaranteed-slot-missed protection the 2026-08-06 dedup brief's own §0 constraint requires |

---

## 5. Routing / scope boundary

**This brief's implementation contract (agent-father, direct — `.md`-only, own zone):**
1. `.claude/skills/cron-detect-loop/register.md` — remove the misplaced Block/Interdit paragraph (§3).
2. `.claude/skills/cron-cowork-team/SKILL.md` — Step 1a rewrite (§2.2), Step 1c payload addition
   (§2.3), new Sibling-Process Defer fallback subsection (§3).

**Explicitly NOT in this brief's implementation contract — flagged for PO scoping, not silently
dropped:** §0.4's fire-election RE-ENTRANT double-dispatch hole. Recommend PO mint a dedicated
follow-up (own architecture-brief cycle or direct dev-team task) covering: `leader-lock.md`,
`cowork-tick-preflight.sh`'s inline copy, `dev-team/flow/main.md` Step [3], the 3 auditor-tier fire-
elections, and the router's own generic RE-ENTRANT pattern in `dispatch-claim/CARD.md`+`SKILL.md`
(hot path before every spawn) — same `$PPID`+`lstart` fingerprint mechanism applies, but needs its
own scoping pass given the blast radius (5+ files, includes the router's own hot path) and because
the per-tick execution context (cron-fired, not interactive) needs empirical re-verification that
`$PPID` stays stable there too (§1's test was interactive-session-only).

---

## 6. AC / verification gate

1. Two OS processes sharing one `$CLAUDE_CODE_SESSION_ID`, both invoking `/cron-cowork-team` — the
   first registers (fingerprint stored), the second's Step 1a comparison mismatches → defers, zero
   local `CronCreate`, WORK telegram sent, no duplicate `*/15` entry.
2. Same process re-invoking `/cron-cowork-team` later in the same session (e.g. after a mid-session
   restart) → fingerprint matches → Step 1d proceeds exactly as before this fix (no regression).
3. Registering process's terminal genuinely closes → sibling's next `/cron-cowork-team` invocation,
   after `age_seconds > 1800`, steals the marker and re-arms → no permanent guaranteed-slot-missed
   regression (mirrors 2026-08-06 dedup brief's own §0 constraint).
4. Pre-fix marker (no `registering_process` in payload) → first post-fix invocation backfills the
   field without a false-positive defer.
5. `cron-detect-loop/register.md` carries no cowork-team-related content after the fix; `git diff`
   on that file (post-fix, pre-commit) shows only the removal, no other lines touched.

---

## RETURN

```
DONE: Brief authored + notebook committed. Root-caused the registration-layer dedup gap to Step 1a's
owner_client_session-only fast path (cron-cowork-team/SKILL.md), corrected the router's owner_session
evidence (server-process diagnostic, not a client-process discriminator — file:line cited,
taskClaimTool.ts:25-30/coordinationTools.ts:18) and its session-presence "1 live row" inference (also
a per-session singleton, uninformative on this question — dispatch-claim/SKILL.md:162-199). Live-
verified (2 read-only `ps` calls) a usable client-side fingerprint ($PPID + lstart($PPID)), stable
across Bash-tool calls within one session, and confirmed 4 distinct live `claude` processes currently
on this host (multi-terminal precondition non-hypothetical here). Designed a no-schema-change fix:
embed the fingerprint in the existing marker's free-form payload, compare on Step 1a, defer on
mismatch with a heartbeat_at-based self-heal (avoids the guaranteed-slot-missed regression class).
Rejected the human-convention-as-primary option per P3 retirement rationale, kept it as an explicit,
narrowly-scoped FALLBACK subsection replacing the misplaced note. NEW FINDING (flagged, not fixed
here): the identical shared-session-UUID gap also defeats the P3 fire-time election's RE-ENTRANT
branch (leader-lock.md + dev-team Step[3] + auditor tiers + the router's own dispatch-claim hot path)
— a correctness bug (double dispatch), not just registration waste; recommend PO scope a dedicated
follow-up given its 5+-file blast radius including the router's own hot path.
NEXT: agent-father — implement §2.2/§2.3/§3 (register.md removal + SKILL.md Step 1a/1c + fallback
subsection), all `.md`-only, agent-father's own zone. PO — scope the §0.4/§5 follow-up (fire-election
RE-ENTRANT hole) as a separate task; not actioned in this brief.
HANDOFF: docs/architecture-briefs/2026-08-15-cowork-cron-registration-sibling-process-defer.md
PIPELINE: continue
```
