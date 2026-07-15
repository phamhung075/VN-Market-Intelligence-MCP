# tnb-audit double-dispatched — its dedup gate is unreachable because the agent has no MCP tool

**Detected:** 2026-07-15T20:30Z by cowork-team dispatcher (tick 20:30Z), RAW-verified post-completion.
**Status:** PLAN-ONLY — no fix attempted. Router/dispatcher does not implement.
**Severity: MED-HIGH.** Confirmed live double-dispatch. No data was lost **this time**, and that was
luck, not design — see § 4.

## 1. What happened — verified sequence

| Time (UTC) | Event | Evidence |
|---|---|---|
| 20:21:40 | cowork dispatcher (session `d0ec32a5`) spawns `tran-ngoc-bau` slot=tnb-audit; stamps `last_fired`; **releases `cowork-slot:tnb-audit` right after spawn** (spawn-fanout.md try/finally, by design) | `cowork-schedule.json` `tnb-audit.last_fired = 2026-07-15T20:21:40.417Z` |
| 20:29:19 | peer **router** session `5e928dde` registers session-presence | `task_list_held` — `session-presence:5e928dde…`, `owner_agent: router` |
| 20:29:37 | peer claims `intent:tran-ngoc-bau:tnb-audit`, payload `{"site":"router","intent":"tnb-audit"}`, TTL 600s | `task_list_held` — `claimed_at: 1784147377` |
| ~20:29:40 | peer's `tran-ngoc-bau` instance begins a **second full c110 audit** of the same slot/cycle | notebook `## c110-collision-note` |
| ~20:34:46 | dispatcher's instance finishes: chef.md auto-cure ×2, notebook `## c110`, `tnb-audit-latest.md`, signal | agent report + file mtimes |
| ~20:35 | peer's instance tries to write the notebook → **Edit tool reports stale content** → defers | notebook L71–73 |

Both instances ran to completion. Two full audits, one slot, one cycle.

## 2. The dedup gate that should have stopped it — and why it didn't

`docs/agents/tran-ngoc-bau/flow/main.md` L31–48 specifies a proper FR-P2-7-style gate:

```
WEEK_PERIOD      = call_tool(server="vn-market", tool="get_week_period", arguments={})
PUBLISH_TASK_ID  = "published:tnb-audit:" + WEEK_PERIOD.periodKey
PUBLISH_CLAIM    = call_tool(server="vn-market", tool="task_claim", arguments={…ttl 691200…})
if PUBLISH_CLAIM.claimed != true: EXIT "duplicate-publish blocked"
```

`.claude/agents/tran-ngoc-bau.md` frontmatter:

```
tools: Read, Edit, Write, Glob, Grep
```

**No `mcp__gateway__call_tool`.** The gate is specified entirely in a tool the agent does not have.
It is **dead code** — unreachable on every cycle, not just this one.

Three independent confirmations:

1. The agent's own completion report lists **"PUBLISHED MARKER GATE claim"** first among steps it
   could not execute.
2. RAW probe at 20:37Z — `task_list_held({})` filtered to `published:*` → **zero markers held**.
   If the gate had ever run this week, `published:tnb-audit:<periodKey>` would be held (TTL ~8d).
3. The peer's instance hit the same wall — it also never claimed the marker.

So the guard exists on paper, has existed long enough to be cited as "pattern source:
spawn-fanout.md § Published marker gate (FR-P2-7)", and has **never once executed**.

## 3. Why nothing else caught it — every other guard is out of scope by design

- **cowork fire-election** (`cron:cowork:<TICK>`) — released at telemetry.md Step 6 on the normal
  path. Scoped to the tick, not the work.
- **per-slot token** (`cowork-slot:tnb-audit`, TTL 180s) — released immediately after spawn per
  spawn-fanout.md's try/finally. Scoped to the spawn, not the work.
- **router intent PRE-CLAIM** (`intent:tran-ngoc-bau:tnb-audit`) — a *different key namespace*. It
  does not consult cowork slot/election state, and cowork does not consult it.

The published marker is the **only** guard designed to span the work window — identical to the
chef finding's § "Secondary finding — election bypass". For chef the marker existed and was
*released too early*; for tnb-audit the marker **cannot be claimed at all**. Same hole, two causes.

## 4. No damage this time — but the save was accidental

The peer's instance was blocked by the **Edit tool's optimistic-concurrency check** ("file modified
since read"), not by any system guard. It then behaved impeccably — it deferred rather than
retrying, and said so (notebook L71–73):

> **Collision detected:** … a second, independent tran-ngoc-bau session had already completed a
> full, well-sourced c110 audit (above) before this session's write landed. **Deferring to that
> entry as authoritative** … Not overwriting or duplicating it.

**Why this must not be read as "the system handled it":**

- `tran-ngoc-bau` frontmatter grants **`Write` as well as `Edit`**. `Write` is a full overwrite with
  no stale-read check. The flow's notebook step is an append (hence Edit), but nothing structural
  forces that — `auto-cure-and-handoff.md` and the c110 report both write whole files
  (`tnb-audit-latest.md` is an overwrite). A collision on an overwrite path is silent.
- Ordering was arbitrary. Had the peer's write landed *first*, the dispatcher's instance — the one
  that actually produced the auto-cure — would have been the one deferring.
- The deferral depended on the agent's *judgment*, which was good here. That is not a guarantee.

Cost even in the clean case: one redundant full audit (~195K subagent tokens, 54 tool calls, ~14min).

## 5. Second confirmed instance of the router-intent-bypass class

| Date | Slot | Agent | Guard state | Outcome |
|---|---|---|---|---|
| 2026-07-15 ~19:53 | chef-evening | unified-agent | marker claimed, then **released** by the agent | **MARKET double-publish, ids 932+933** |
| 2026-07-15 ~20:29 | tnb-audit | tran-ngoc-bau | marker **unreachable** (no MCP tool) | 2 concurrent audits; clobber avoided by Edit stale-check |

Two different slots, two different agents, two different guard failures — **one shared enabler**:
a peer router session dispatching cowork work through `intent:<agent>:<key>` while the cowork
dispatcher's own instance is still running, with no shared key between the two paths.

Per `feedback_recurring_bug_escalation` (2+ occurrences → block), the *enabler* now warrants
rank-1 banding on its own, separately from the two per-slot guard bugs.

## 6. Board dedup — checked before writing (do NOT mint duplicates)

| Existing row | Lane | Covers | Gap |
|---|---|---|---|
| `FIX-CHEF-PUBLISHED-MARKER-RELEASE` | BLOCKED | chef releases marker post-publish | chef-specific; not the dispatch path |
| `UC-CCA-P3` | BACKLOG | "PUBLISHED-MARKER LIFECYCLE — one marker-gate skill, publish-state-conditioned immunity; wire into the 6 copy-paste sites" | **Closest fit.** A shared marker-gate skill would fix tnb *only if* tnb can call it — which it cannot. See § 7. |
| `FU-CHEF-MARKER-INFLOW` | BLOCKED | chef self-enforces marker before send_telegram | chef-specific |
| `SPRINT-CCATO-TRUTHGATE-MCP-NATIVE` | BACKLOG | "Expose CCATO claim-truth-gate as a gateway-native MCP tool so **no-Bash cowork narrative agents** can enforce the gate" | **Same shape as this bug, different gate.** Precedent that no-tool agents can't run gates written for them. |
| `FIX-COWORK-FLOWS-GATEWAY-BLIND-BRIDGE-FALLBACK` | BACKLOG (P1) | "Retrofit gateway-blind-affected cowork agent flows with `scripts/agents-flow/mcp-call.sh` curl-bypass fallback" | **Owns the capability gap. See § 6a — the remedy does not fit tran-ngoc-bau.** |
| `TASK_1993/1994/1995` | DONE | cowork fire-time election design/impl/verify | in-family only; router intent path was out of scope |

**No row covers the router-intent → cowork-dispatch bypass.** That is the mint-worthy item.

## 6a. CORRECTION — the capability gap is NOT a new discovery (added 20:47Z, same tick, before commit)

An earlier draft of this handoff presented the missing-MCP finding as fresh dispatcher analysis.
**It is not.** `tran-ngoc-bau` has been reporting it itself for **14 consecutive cycles (c97–c110)**
as `F-MCP-SUBAGENT-SYSTEMIC`, and po already minted a **P1** row for it. Its own signal this cycle
(`docs/signals/tran-ngoc-bau-20260715T2021Z-gateway-blind.json`) states it plainly:

> "mode A — no `mcp__gateway__*` … function bound at all, **verified LIVE this session by inspecting
> own tool schema, not inferred from notebook history** per fail-loud-protocol.md anti-hallucination
> rule. 14th consecutive tnb-audit cycle (c97–c110) with zero MCP surface."

Corrected rather than deleted, so the error stays visible. What **is** new here is the *consequence
linkage*, and it is what makes the known gap worse than "TNB can't fetch data":

> Because MCP is unreachable, `main.md:39-41`'s published-marker gate — TNB's **only** dedup —
> has never executed. The 14-cycle capability gap silently disarms the guard that would have
> blocked today's double-dispatch. The gap is not just a data-access problem; it is a
> **concurrency-safety** problem.

**And the P1's chosen remedy does not fit this agent.** The row prescribes the
`scripts/agents-flow/mcp-call.sh` curl-bypass — **that is a Bash script, and `tran-ngoc-bau`'s
frontmatter grants no Bash either** (`Read, Edit, Write, Glob, Grep`). The fix as written is
unexecutable for the very agent that has filed the bug 14 times. Whoever picks up
`FIX-COWORK-FLOWS-GATEWAY-BLIND-BRIDGE-FALLBACK` must first partition the affected agents by what
they actually hold:

- **has Bash, no MCP** → `mcp-call.sh` curl-bypass works as specced.
- **has neither** (tran-ngoc-bau) → needs a frontmatter grant (`mcp__gateway__call_tool` and/or
  `Bash`) from **agent-father**, or the flow must be re-specced to its real toolset, or the
  dispatcher must claim the marker on its behalf pre-spawn. The current row would close as "done"
  while TNB stays blind.

That partition is the actionable output of this handoff. TNB's own recommendation —
*"1 cycle/~1 day with zero movement on PO's own P1 mint — recommend promotion not re-diagnosis"* —
is endorsed: this is now a 14-cycle recurrence with a confirmed concurrency consequence, well past
`feedback_recurring_bug_escalation`'s 2+ threshold.

## 7. Suggested next step (po / agents-architect triage)

Three separable items, in dependency order:

1. **The enabler (new).** Decide whether the router intent PRE-CLAIM path may dispatch cowork
   slot agents at all while the cowork dispatcher owns that slot. Cheapest correct fix: have the
   router's §2.5 PRE-CLAIM *also* probe `cowork-slot:<slot_id>` / the published marker for cowork
   slot agents, or key both paths on the same task_id namespace so they collide by construction.
   Today they cannot collide — different keys, so `task_claim` is a no-op mutex across paths.
2. **The unreachable gate (blocks UC-CCA-P3 for tnb).** `tran-ngoc-bau` needs
   `mcp__gateway__call_tool` in frontmatter, **or** main.md's gate must be re-specced to something
   its actual toolset can enforce, **or** the dispatcher must claim the marker on the agent's
   behalf before spawn. Note UC-CCA-P3's "wire into the 6 copy-paste sites" silently assumes every
   site *can* call the skill — tnb-audit is a counter-example that should be surfaced in that row's
   spec before it's estimated. Route via agent-father (frontmatter is its SSOT).
3. **The wider capability audit.** `tran-ngoc-bau`'s flow also specifies `get_week_period`,
   `read_telegram_reports`, `get_macro_snapshot`, `get_system_status`, `get_agent_signals`,
   `send_telegram`, and a `task_claim commit-mutex:main` → `git commit` protocol
   (`auto-cure-and-handoff.md:50`) — **all requiring MCP or Bash, neither of which it has.** Its
   `main.md:78` claims "full MCP data access", which is false. Grep every cowork agent's flow for
   `call_tool`/Bash usage and diff against its frontmatter `tools:`; this is the same class as
   `SPRINT-CCATO-TRUTHGATE-MCP-NATIVE`. Consequence already visible: TNB's auto-cure edits to
   `chef.md` have sat **uncommitted since 2026-07-13** (last commit touching it: `bf808eede`,
   07-13 14:58) because its own commit protocol needs a Bash tool it lacks.

## 8. Dispatcher actions taken this tick

- Reviewed the completed instance's 2 auto-cure edits to `docs/agents/unified-agent/flow/chef.md`
  (Step 6 `$L6_GAP_TOKENS` store, Step 8b notebook surface). **Both additive, in-boundary, kept** —
  unlike the alert-commander case, `tran-ngoc-bau` has no notebook-only clause and auto-cure is a
  declared output (`main.md:81`, `auto-cure-and-handoff.md`).
- Committed the stranded TNB outputs on its behalf (it has no Bash — it explicitly asked for a
  git-capable pickup), same as alert-commander's notebook last tick.
- Did **not** spawn agent-father / agents-architect: `cowork-team/flow/main.md:16` — maintenance
  agents are never spawned by this dispatcher.
- Did **not** attempt to stop the peer session's instance — out of scope, and it had already
  self-deferred.

## 9. Loose end — doc-hygiene drift (LOW, no row)

`chef.md` line-1 `size-justification` header now reads `724L`; the file is **760L**. The c110
auto-cure added ~15 lines without updating the header. Noted here rather than filed — the header is
governed by `TE-T13` (the last commit to touch this file was exactly a size-justification purge).
Flagging only because a stale size header is what a context-bloat gate reads.
