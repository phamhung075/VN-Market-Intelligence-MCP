<!-- size-justification: 309L — Step 5: blind guard, published-marker gate contract, and the
     UC-CDC-P4 headroom-gated bounded batcher (Step 5.1 MAX_PARALLEL computation + Step 5.2
     batch fan-out with inter-batch wait) are one tightly sequential dispatch unit, child of
     main.md. UC-CDC-P4 QA AC1 fix 2026-07-23 (+21L): replaced the inline `_fanout` shadow-copy
     fallback with a `degraded_serial` MODE downgrade (MAX_PARALLEL=1 sentinel, no SSOT numeric
     literals) mirroring pressure-read.md Step 4.2's missing-policy pattern; Step 5.2 inter-batch
     wait gained a matching mode branch since FANOUT_POLICY does not exist in that mode.
     FIX-PRESSURE-HOST-HEADROOM-WRONG-MACHINE-WRONG-QUANTITY 2026-07-28 (+4L, count also
     corrected for pre-existing drift): field consumer rename host_headroom_mb ->
     container_vm_headroom_mb. FIX-COWORK-SPAWNFANOUT-FLOWPATH-BYPASSES-DIGEST-DAILY-DEDUP-GATE
     2026-07-29 (+41L): Step 5.2 now dispatches slot.trigger_prompt (was: a prompt composed
     from slot.flow_path alone, which silently bypassed digest-daily's dedup gate — flow_path
     and trigger_prompt named different files for that one slot) plus a fail-loud consistency
     check refusing any slot whose two entry-point fields diverge, one predicate shared with
     scripts/agents-flow/cowork-match-slots.js's extractPromptFlowPath().
     FIX-COWORK-SPAWN-IDENTITY-PREAMBLE-OFFFLOW 2026-07-29 (+95L, 3rd occurrence of
     TASK_1967-04's identity-overflow class): Step 5.2 now prepends an IDENTITY_PREAMBLE to
     every ENTRY_PROMPT (suppresses CLAUDE.md router-protocol inheritance on the spawned
     session's one guaranteed input, the prompt string itself) and new Step 5.3 adds an
     exogenous off-flow detector on each spawn's own returned text — the load-bearing half of
     the fix, since a self-report from an already-displaced spawn is a vacuous reader-is-writer
     check. Fixes the WRONG-LAYER gap left by FIX-MARKET-WATCHER-NARRATE-NOT-EXECUTE-GUARD
     (2026-07-12), which guarded market-watcher's OWN flow/main.md — unreachable when the spawn
     never opens that file at all. -->
<!-- BGFAN-1: every Agent spawn in this file MUST use run_in_background=true; UC-CDC-P4 bounds
     CONCURRENCY ACROSS batches via Step 5.1/5.2, it does not relax background=true within a
     batch. Canonical rule + batcher carve-out → docs/protocols/agent-chaining-protocol.md
     § Background Spawn Mandate -->

## Step 5 — Bounded parallel fan-out (headroom-gated batcher, UC-CDC-P4)

## Step 5.0 — Blind guard (second enforcement point)

```
if SESSION_BLIND == true:

  # Classify each matched slot by backstop coverage
  # Source of truth: docs/data/cowork-schedule.json .slots[].trigger_id + ._superseded_by
  # trigger_status is DEPRECATED as a discriminator (FIX-COWORK-STEP5-BACKSTOP-TRUSTS-STALE-TRIGGER-STATUS,
  # 2026-07-08): never resynced after the 2026-06-22/23 cloud RemoteTrigger decommission
  # (STANDING feedback_no_remote_trigger_all_local) — reads "active" on slots with zero live
  # cloud backstop. _superseded_by is live-maintained: null == still cloud-trigger-backed
  # (safe to defer); non-null == cloud role already retired for this slot — NOT backstop-covered.
  # DO NOT hardcode slot names — derive from schedule at runtime via jq
  BACKSTOP_SLOTS    = [s for s in WON_SLOTS if s.trigger_id != null AND s._superseded_by == null]
  NO_BACKSTOP_SLOTS = [s for s in WON_SLOTS if s.trigger_id == null OR s._superseded_by != null]

  for each slot in BACKSTOP_SLOTS:
    log: "[cowork-team] BLIND — deferred to cloud backstop: <slot.slot_id>"
    # cloud RemoteTrigger will deliver the real post; skip local spawn

  for each slot in NO_BACKSTOP_SLOTS:
    log: "[cowork-team] BLIND — UNDELIVERABLE this tick (no cloud backstop): <slot.slot_id>"
    append to errors[]: { slot_id: slot.slot_id, error: "undeliverable-gateway-blind" }
    # telemetry Step 6 picks up errors[]

  # Emit ONE work-channel summary per tick (not per slot)
  WORK_MSG = "[cowork-team] gateway-blind session — " +
    len(BACKSTOP_SLOTS) + " slots deferred to backstop, " +
    len(NO_BACKSTOP_SLOTS) + " undeliverable; " +
    "durable fix = register gateway in .mcp.json + reconnect " +
    "(see docs/handoffs/GATEWAY-BLIND-USER-ACTION-2026-06-18.md)"
  call_tool(server="vn-market", tool="send_telegram", arguments={ channel: "work", message: WORK_MSG })

  EXIT Step 5 — skip all subagent spawns. Proceed to Step 5b (last-fired) and Step 6 (telemetry).

# SESSION_BLIND == false → fall through to normal fan-out (behavior unchanged)
```

<!-- Published marker gate (FR-P2-7, DWF-DEV-CROSS-4 Phase 2 — ARCH-DECIDE-C):
     The spawned agent flow MUST claim a published marker BEFORE calling send_telegram.
     This is belt-and-suspenders with the per-work-item token: the token prevents duplicate
     spawns; the publish marker prevents duplicate sends if a spawn somehow executes twice.

     Pattern each spawned agent MUST follow (in its own flow, before send_telegram):
       1. Compute work_date = current VN date (GMT+7) in YYYY-MM-DD format
       2. Claim the published marker:
          publish_claim = call_tool(server="vn-market", tool="task_claim", arguments={
            task_id:              "published:" + slot_id + ":" + work_date,
            task_kind:            "cowork-slot",
            owner_agent:          "<agent_id>",
            owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED — P1-FINAL (TASK_1980)
            ttl_seconds:          100800   # 28h per ARCH-DECIDE-D (daily slots)
          })
       3. if publish_claim.claimed == false:
            log "[cowork] publish blocked — already published work-id=" + slot_id + ":" + work_date
            EXIT (do not call send_telegram)
       4. if publish_claim.claimed == true:
            proceed with send_telegram(...)
     Weekly slots (digest-sunday only — FIX-CADENCE-TNB-AUDIT-WEEKLY-MARKER-BLOCKS-DAILY-CRON
     2026-07-29 removed tnb-audit from this list; tnb-audit's cron is daily, so it now follows
     the daily-slot template below, same as chef-morning/eod/evening/fb-daily):
     FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP (2026-06-14):
       (A) use get_week_period MCP tool to get the canonical week period (not local `date +%G-W%V`)
       (B) key the mutex on periodKey (date-range "YYYY-MM-DD/YYYY-MM-DD"), NOT weekLabel.
       e.g. "published:digest-sunday:2026-06-08/2026-06-14" not "published:digest-sunday:2026-W24".
       ttl_seconds=691200 (8d) per spawn-fanout.md.
     INVARIANT: a marker's key period MUST equal its slot's cron period — daily cron -> daily
     key (ttl 100800), weekly cron -> ISO-week periodKey (ttl 691200). Check the target slot's
     actual cron cadence before copy-pasting either pattern onto a new slot.
     The publisher owns the marker — the dispatcher (this flow) does NOT call publish markers. -->

**Important — Published marker gate (FR-P2-7):** Each spawned agent MUST check and set a
published marker BEFORE calling `send_telegram`. This is the final belt-and-suspenders
defense against duplicate Telegram posts: the per-work-item token (Step 4.6) prevents
duplicate spawns; the published marker prevents duplicate sends if a spawn somehow executes
twice (e.g. retry under transport lag).

The key identifies CONTENT, not the dispatch attempt: `published:<slot_id>:<YYYY-MM-DD>`.
A new date = genuinely new content = new key, so the next day's dish is never blocked.

```
# In the spawned agent flow — BEFORE send_telegram:

WORK_DATE=$(TZ="Asia/Ho_Chi_Minh" date +%Y-%m-%d)   # VN date (GMT+7)
PUBLISHED_KEY="published:<slot_id>:${WORK_DATE}"

MARKER_CLAIM=$(call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              PUBLISHED_KEY,
  task_kind:            "cowork-slot",
  owner_agent:          "<agent_id>",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED — P1-FINAL (TASK_1980)
  ttl_seconds:          100800    # 28h for daily slots (ARCH-DECIDE-D) — includes tnb-audit
                                  # Weekly slots (digest-sunday only): ttl_seconds = ~8 days
                                  # (see coordinationStore TTL cap)
}))

if MARKER_CLAIM.claimed != true:
  log "[cowork] publish blocked — already published work-id=<slot_id>:<WORK_DATE>"
  EXIT   # Do NOT call send_telegram — already published today

# Marker claimed → proceed with send_telegram(channel="<target>", message="<content>")
```

TTL values:
- **Daily slots** (`ttl_seconds: 100800` = 28 hours): covers the full 24h content cycle
  with a 4h buffer against timezone drift. A 24h TTL risks a same-day retry leaking through
  at a 23h59m gap.
- **Weekly slots** (`ttl_seconds` = ~8 days, see coordinationStore TTL cap): digest-sunday
  uses ISO week as `work_date` (`YYYY-WW` format, e.g. `2026-W22`). tnb-audit's cron is daily
  (`13 20 * * *`) — it uses the daily-slot pattern above, NOT this one (moved here 2026-07-29,
  FIX-CADENCE-TNB-AUDIT-WEEKLY-MARKER-BLOCKS-DAILY-CRON — a weekly key on a daily cron silently
  blocked 5 of 6 daily audits per ISO week).

Where this gate lives: inside each spawned agent's own flow, co-located with `send_telegram`.
The dispatcher (this file) does NOT set published markers — the publishing agent is responsible.
See `docs/protocols/dwf-ops-runbook.md` § Published Marker Interaction for ops context.

## Step 5.1 — Compute MAX_PARALLEL (headroom-gated batch cap, UC-CDC-P4)

<!-- UC-CDC-P4 (2026-07-23): replaces the prior "fire all WON_SLOTS in one message block, no
     sequential gating" line. Rationale + full design: docs/architecture-briefs/
     2026-07-12-ultracode-workflow-improvement-audit.md #cowork-dispatcher-cron-P4. Thresholds
     are SSOT in docs/data/cadence-policy.json `_fanout` — never hardcoded here. -->

```
# Load fan-out thresholds — self-contained read (do not assume Step 4.2's POLICY_OBJ is still
# in scope; this step must degrade safely even if it runs in isolation).
POLICY_FILE = "docs/data/cadence-policy.json"   # same SSOT as Step 4.2
FANOUT_MODE = "policy"   # default; may downgrade to "degraded_serial" below

if POLICY_FILE is missing or fails JSON parse or its `_fanout` key is missing:
  # Mirrors pressure-read.md Step 4.2's missing/malformed-policy pattern: downgrade MODE,
  # do NOT synthesize the SSOT's numeric values inline (no shadow copy of _fanout — UC-CDC-P4
  # QA AC1). MAX_PARALLEL=1 is a single conservative non-threshold sentinel (fully serial) —
  # it is not read from, and does not stand in for, any of the 5 _fanout keys. Since no
  # thresholds are available at all, the headroom/load gate below is skipped entirely rather
  # than partially reconstructed.
  FANOUT_MODE  = "degraded_serial"
  MAX_PARALLEL = 1
  log "[cowork-team] WARN: cadence-policy.json _fanout missing/unreadable — degraded_serial mode, MAX_PARALLEL=1 (fully serial, no threshold numbers available)"
  → skip HEADROOM/LOAD computation below; proceed directly to Step 5.2 with MAX_PARALLEL=1
else:
  FANOUT_POLICY = JSON.parse(readFile(POLICY_FILE))._fanout

  # HEADROOM — reuse PRESSURE_STATE / PRESSURE_MODE set at Step 4.2 (pressure-read.md, same tick,
  # same session). If PRESSURE_MODE == "legacy" (pressure-state.json missing/stale/malformed —
  # Step 4.2's own isStale gate already fired), headroom is unknown → fail-safe degraded, per the
  # same NFR-P1-3 "never worse than today" posture Step 4.2 already applies.
  # FIX-PRESSURE-HOST-HEADROOM-WRONG-MACHINE-WRONG-QUANTITY (2026-07-28): field
  # renamed host_headroom_mb -> container_vm_headroom_mb — it measures the
  # mcp-server container's own Docker VM (free -m 'available'), never the
  # macOS host; null when unavailable (unchanged fail-safe below).
  if PRESSURE_MODE == "adaptive" and PRESSURE_STATE.container_vm_headroom_mb is a number:
    HEADROOM_MB = PRESSURE_STATE.container_vm_headroom_mb
  else:
    HEADROOM_MB = null   # unknown → forces the degraded branch below

  # LOAD / CORES — dispatcher-level bash (proven available: scripts/agents-flow/
  # cowork-tick-preflight.sh already runs bash+jq+curl at this same dispatch step).
  LOAD_1MIN = bash: `uptime | awk -F'load average' '{print $2}' | awk -F',' '{gsub(/[^0-9.]/,"",$1); print $1}'`
  CORES     = bash: `sysctl -n hw.ncpu 2>/dev/null || nproc`   # macOS dev host; nproc fallback for Linux containers

  DEGRADED = (HEADROOM_MB == null) OR (HEADROOM_MB < FANOUT_POLICY.headroom_floor_mb) \
             OR (LOAD_1MIN > FANOUT_POLICY.load_per_core_factor * CORES)

  MAX_PARALLEL = FANOUT_POLICY.max_parallel_degraded if DEGRADED else FANOUT_POLICY.max_parallel_default

  log "[cowork-team] fan-out gate — headroom_mb=" + (HEADROOM_MB ?? "unknown") + " load1m=" + LOAD_1MIN + \
      " cores=" + CORES + " degraded=" + DEGRADED + " max_parallel=" + MAX_PARALLEL
```

## Step 5.2 — Bounded batch fan-out (UC-CDC-P4)

Guaranteed slots fill batch 1 first — never delayed behind non-guaranteed work:

```
ORDERED_SLOTS = [s for s in WON_SLOTS if s.guaranteed == true] + [s for s in WON_SLOTS if s.guaranteed != true]
BATCHES = chunk(ORDERED_SLOTS, MAX_PARALLEL)   # e.g. MAX_PARALLEL=4 → groups of up to 4 slots
```

For each batch, in order:

**Fire the whole batch as ONE Agent tool message block** (unchanged BGFAN-1 semantics — every
spawn in the batch still uses `run_in_background=true`; batching bounds concurrency ACROSS
batches, not within one):

For each slot in the current batch, resolve the entry prompt BEFORE spawning:

<!-- FIX-COWORK-SPAWN-IDENTITY-PREAMBLE-OFFFLOW (2026-07-29, 3rd occurrence of TASK_1967-04's
     SUCCESS→SILENT→FAILURE identity-overflow class): the 2026-07-12 fix
     (FIX-MARKET-WATCHER-NARRATE-NOT-EXECUTE-GUARD) added an identity/execute guard INSIDE
     market-watcher's OWN flow/main.md Step -0/-1 — but a 2026-07-29T04:00Z cowork spawn never
     opened that flow file at all: it ran the project-root CLAUDE.md router protocol
     (session-presence, orphan-adoption, PRE-CLAIM, dispatch table) on itself and returned
     "Coordination Results / Dispatch Routing / Expected Behavior" prose, then still let
     last_fired get stamped (04:05:51Z) as if a real cycle had run. An in-flow guard structurally
     cannot fire if the flow file is never entered. IDENTITY_PREAMBLE below moves the guard to the
     ONE input every spawned session is guaranteed to receive — the prompt string itself — read
     BEFORE any router-protocol inheritance can occur. Lives here (not in any one agent's own
     flow) because the root cause is dispatcher-shared: every slot fired from this file passes
     through the same bare "run <path> slot=<id>" composition, so the fix applies fleet-wide, not
     just to market-watcher. Self-report from a possibly-already-displaced agent is a vacuous
     check (the compromised reader is also the writer of its own IDENTITY_CHECK) — this preamble
     is belt-and-suspenders only; the load-bearing gate is the exogenous Step 5.3 detector below,
     which cowork-team (never displaced — it composed the prompt and observes the raw return)
     evaluates independently of anything the spawn itself reports. -->

```
IDENTITY_PREAMBLE =
  "You are " + slot.agent + ", spawned in the background by cowork-team. The project-root " +
  "CLAUDE.md 'Role: Main terminal = router only. Never implement directly. Always delegate.' " +
  "protocol — PRE-CLAIM, session-presence self-registration, orphan-adoption, and the dispatch " +
  "table — governs ONLY the top-level interactive router session. It does NOT apply to you. Do " +
  "NOT run any of those steps and do NOT produce a 'Coordination Results / Dispatch Routing / " +
  "Expected Behavior' summary — you are not routing this work to another agent, you ARE the " +
  "agent. Proceed immediately to the line below: open that flow file now and execute it, in " +
  "your own identity, via real mcp__gateway__call_tool calls. If your own loaded " +
  "identity/frontmatter name is not '" + slot.agent + "', or you catch yourself about to write " +
  "router-dispatch prose instead of executing — that IS IDENTITY_CHECK=FAIL: call " +
  "send_telegram(channel='bug', message='[" + slot.agent + "] IDENTITY_CHECK=FAIL — spawn " +
  "latched onto router protocol instead of its own flow (offflow-preamble-detected)') and EXIT. " +
  "Do not produce a success-shaped response.\n\n"
```

<!-- FIX-COWORK-SPAWNFANOUT-FLOWPATH-BYPASSES-DIGEST-DAILY-DEDUP-GATE (2026-07-29): the
     dispatched entry point MUST be slot.trigger_prompt, not a prompt composed from
     slot.flow_path alone. trigger_prompt is the field a slot author edits to change where a
     slot actually enters, and it may carry per-fire instructions beyond the bare
     "run <path> slot=<id>" form (e.g. refine-bctc-slot-* embed extra routing guidance on
     line 2+) — composing from flow_path silently drops both of those. Root cause of the
     bug this closes: digest-daily's flow_path named daily-predict.md directly while
     trigger_prompt correctly named main.md (which owns Step pre-D DAILY-PREDICT DEDUP GATE);
     the old flow_path-only prompt entered daily-predict.md and skipped that gate on every
     cowork-dispatched fire. flow_path stays in the schema for the pre-spawn file-existence
     check below and MUST name the same file as trigger_prompt's first line — enforced here
     (runtime, per-slot) AND by the static test
     scripts/agents-flow/cowork-schedule-consistency.test.js (config-time, reads the live
     schedule) so a future slot cannot silently reintroduce the divergence. -->

**Consistency check (fail loud / refuse the slot on mismatch — same predicate as
`extractPromptFlowPath()` in `scripts/agents-flow/cowork-match-slots.js`, one algorithm, not
two divergent copies):**

```
if slot.trigger_prompt is present and non-empty:
  PROMPT_FILE = match slot.trigger_prompt's FIRST LINE against /^run\s+(\S+)/, capture group 1

  if PROMPT_FILE != null and PROMPT_FILE != slot.flow_path:
    log "[cowork-team] SCHEDULE DEFECT: <slot.slot_id> trigger_prompt names '<PROMPT_FILE>' but flow_path names '<slot.flow_path>' — refusing spawn, fix docs/data/cowork-schedule.json"
    send_telegram(channel="bug", message="[cowork-team] schedule defect: <slot.slot_id> trigger_prompt/flow_path file mismatch — spawn refused")
    add to errors[]: { slot_id: slot.slot_id, error: "trigger_prompt_flow_path_mismatch" }
    call_tool(server="vn-market", tool="task_release", arguments={
      task_id: "cowork-slot:" + slot.slot_id, owner_client_session: $CLAUDE_CODE_SESSION_ID
    })   # per-work-item token was already claimed in Step 4.6 — release it since no spawn occurs
    continue to next slot in batch — do NOT spawn

  ENTRY_PROMPT = IDENTITY_PREAMBLE + slot.trigger_prompt
else:
  # No trigger_prompt on this slot — compose from flow_path (legacy fallback; every live
  # slot as of this fix carries trigger_prompt, so this branch is defensive only)
  ENTRY_PROMPT = IDENTITY_PREAMBLE + "run " + slot.flow_path + "  slot=" + slot.slot_id
```

Note: `IDENTITY_PREAMBLE` is prepended to BOTH branches (never to `slot.trigger_prompt` stored
in `cowork-schedule.json` itself — that field stays untouched so the consistency check above and
`scripts/agents-flow/cowork-match-slots.js`'s `extractPromptFlowPath()` keep matching its literal
first line unmodified). The preamble is composed into `ENTRY_PROMPT` only, at spawn time.

**Spawn:**

```
subagent_type      : <slot.agent>
prompt             : ENTRY_PROMPT
description        : "<slot.slot_id> dispatch"
run_in_background  : true   # (background) — BGFAN-1; cowork agents are independent → genuine parallel fan-out
```

Track spawn results: success (no error) vs failure (agent tool returns error).

**On spawn failure for any slot:**
- Log to `errors[]` in telemetry (Step 6).
- `send_telegram(channel="work", message="[cowork-team] spawn failed: <slot.slot_id> — <one-line error>")`
- Continue remaining spawns in this batch and subsequent batches. R4: one slot failure never blocks others.

**On flow path missing** (slot.flow_path does not exist as a file — verify before spawn; this
is also the file `trigger_prompt` will enter, per the consistency check above):
- `send_telegram(channel="work", message="[cowork-team] flow missing: <slot.slot_id> → <slot.flow_path>")`
- Add to `errors[]`. Skip this slot's spawn.

**After each spawn attempt (success OR failure) — release per-work-item token immediately (try/finally):**

```
try:
  spawn agent for slot
finally:
  call_tool(server="vn-market", tool="task_release", arguments={
    task_id:              "cowork-slot:" + slot.slot_id,
    owner_client_session: $CLAUDE_CODE_SESSION_ID    // REQUIRED — P1-FINAL (TASK_1980)
  })
  # ok=false is acceptable (already expired, stolen, or crashed) — ignore release errors
  # NOTE: key uses slot.slot_id (suffix-free) matching the claim in Step 4.6
```

**Inter-batch wait (REQUIRED — naive back-to-back batching of `run_in_background=true` spawns is
a no-op, since each spawn call returns immediately; without an explicit wait, batching would not
actually bound peak concurrency).** Skip this wait after the LAST batch — proceed straight to
Step 5b.

```
if FANOUT_MODE == "degraded_serial":
  # MAX_PARALLEL=1 (Step 5.1) → every batch here is already a single slot. There is no
  # FANOUT_POLICY object to read a timeout/re-probe threshold from in this mode, so the wait
  # is unconditional: fire one slot, wait for its genuine completion, then fire the next.
  # Concurrency is already bounded to 1 by MAX_PARALLEL — no timeout/re-probe math is needed.
  wait for the single spawn in this batch to return its task notification (genuine completion)
else:
  elapsed = 0
  while elapsed < FANOUT_POLICY.batch_wait_max_seconds:
    if every spawn in this batch has returned its task notification (genuine completion): break
    re-probe LOAD_1MIN (same `uptime` command as Step 5.1)
    if LOAD_1MIN <= FANOUT_POLICY.load_per_core_factor * CORES: break
    sleep 5s; elapsed += 5

  if elapsed >= FANOUT_POLICY.batch_wait_max_seconds:
    log "[cowork-team] batch wait timeout (" + FANOUT_POLICY.batch_wait_max_seconds + "s) — continuing at degraded cap"
    send_telegram(channel="work", message="[cowork-team] fan-out batch wait timeout — continuing remaining slots at max_parallel_degraded")
    MAX_PARALLEL = FANOUT_POLICY.max_parallel_degraded
    BATCHES = chunk(remaining not-yet-fired slots, MAX_PARALLEL)   # re-chunk only what's left
```

The `batch_wait_max_seconds` cap (default 120s) is well inside both the 600s per-work-item token
TTL (Step 4.6) and the 15-min tick cadence — a full timeout on every batch still finishes the
tick with room to spare. Step 5.0 blind guard above is unchanged.

## Step 5.3 — Off-flow router-latch detector (exogenous check, FIX-COWORK-SPAWN-IDENTITY-PREAMBLE-OFFFLOW)

Runs once per batch, immediately after that batch's inter-batch wait resolves — the earliest
point the spawn's own return text becomes available to this dispatcher session. **Exogenous by
design:** evaluated by cowork-team on the raw returned text of each completed spawn, never
self-reported by the spawned agent (a compromised spawn's own IDENTITY_CHECK is a vacuous
reader-is-writer check — see the Step 5.2 comment above). This is a THIRD failure class,
distinct from Step 5.0's gateway-blind guard and the plain spawn-tool-error handling above: the
Agent tool call itself succeeded and returned cleanly, but the returned content proves the
spawned session never entered its own flow file.

For each slot in this batch whose spawn returned its task notification this wait (skip any slot
still in-flight after a wait timeout — nothing to inspect yet; it is picked up by the normal
next-tick due-check like any other unconfirmed spawn):

```
RETURN_TEXT = <the Agent tool's own returned result text for this spawn>

OFFFLOW_MARKERS = ["Coordination Results", "Dispatch Routing", "PRE-CLAIM", "session-presence",
                    "orphan-adoption", "Expected Behavior"]
  # Verbatim section headings / terms from the project-root CLAUDE.md router dispatch protocol.
  # A genuinely-executing gatherer's own RETURN/WORK-ping vocabulary (DONE:/PIPELINE:/WORK ping,
  # defined in each agent's own cycle/eod flow) never contains these strings — positive-match on
  # the KNOWN BAD shape, not absence of a good one, so legitimate quiet EXIT paths (Step -0
  # identity-fail, Step 0-GW sibling-corroborated gateway skip — neither of which touches the
  # notebook or emits this vocabulary) are never mistaken for an off-flow latch.

if RETURN_TEXT contains ANY marker in OFFFLOW_MARKERS (case-insensitive):
  log "[cowork-team] OFF-FLOW DETECTED: " + slot.slot_id + " (" + slot.agent + ") returned
    router-dispatch-shaped prose instead of executing its own flow — treating as fabricated
    success, last_fired will NOT be stamped"
  send_telegram(channel="bug", message="[cowork-team] IDENTITY_CHECK=FAIL (exogenous) — " +
    slot.agent + " spawn (" + slot.slot_id + ") latched onto router protocol instead of its own
    flow; last_fired NOT stamped, will retry next due tick")
  add to errors[]: { slot_id: slot.slot_id, error: "offflow_router_latch_detected" }
  WON_SLOTS = WON_SLOTS.filter(s => s.slot_id != slot.slot_id)   # exclude from Step 5b's write —
    # conservative under-suppress (retries next due tick), same posture last-fired.md already
    # applies on write failure (AC-P1-7-3) and TICK-SNAPSHOT's own held/won bookkeeping.
# else: no signature hit — slot stays in WON_SLOTS, proceeds to Step 5b unchanged.
```

This does not replace or weaken Step 5.0 (gateway-blind) or the plain spawn-failure handling
above — those gate distinct failure classes before or at the spawn call itself. Step 5.3 gates
the one class neither of them can see: a spawn that returned successfully but never ran.
