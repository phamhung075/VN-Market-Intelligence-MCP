<!-- size-justification: 506L — Step 5: blind guard, published-marker gate contract, and the
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
     never opens that file at all.
     FIX-COWORK-SPAWNFANOUT-NO-SESSION-ID-IN-LEAF-ENTRY-PROMPT 2026-07-31 (+11L, 5th occurrence
     of the "documented consumer, no documented producer" defect class): NEITHER ENTRY_PROMPT
     branch below, nor IDENTITY_PREAMBLE, ever carried a session identifier for the leaf worker
     to use — `docs/agents/refine_bctc_md/flow/main.md`'s SELF-IDENTITY GUARD hard-requires
     `owner_client_session` as a spawn-prompt literal (it has no Bash to resolve
     `$CLAUDE_CODE_SESSION_ID` itself) and EXITs before claiming when absent. Recurred twice live
     (2026-07-30 slot-4 raw schema error, 2026-07-31 slot-2 clean self-guard EXIT — same root
     cause, symptom only changed once the guard existed). Both ENTRY_PROMPT branches now append a
     `SESSION_ID_LINE` carrying cowork-team's OWN resolved session id as a concrete literal string
     (uniform — every leaf worker, not scoped to only those with a known SELF-IDENTITY GUARD;
     matches the router's own unconditional `CLAUDE.md` step-3 precedent and does not require a
     future flow author to remember to opt in). `slot.trigger_prompt` in `cowork-schedule.json`
     stays byte-identical — `SESSION_ID_LINE` is appended to the composed `ENTRY_PROMPT` only,
     never written back to the stored field.
     UC-CCA-P3-FR3-SPAWN-FANOUT-CLEANUP (agent-father, 2026-08-14): -78L — trimmed the FR-P2-7
     inline published-marker pattern block (task_claim/TTL/key prose, the original copy-paste
     source of the 4 EARLY-claim defect instances) to a 1-line pointer at .claude/skills/
     published-marker-gate/SKILL.md, now the single documented source for the Phase-1/Phase-2
     pattern across all 6 cowork guaranteed-slot gates. No logic changed — pure doc-debt
     reduction, architecture brief 2026-08-08-uc-cca-p3-published-marker-gate-skill.md §4.
     FIX-COWORK-SPAWNFANOUT-STEP53-OFFFLOW-DETECTOR-UNSPECIFIED-SURFACE-AND-SELF-INJECTED-MARKERS
     (agent-father, 2026-08-23): +107L (25L of it this header entry) — Step 5.3 gained an
     explicit extraction-surface contract (final assistant text turn; the `.output` transcript-
     symlink trap named with measurements), a corrected marker-provenance comment (the old one
     attributed the six markers to CLAUDE.md; only 3 of 6 appear there at all, and all 6 are
     injected by IDENTITY_PREAMBLE in THIS file), a mandatory fail-open negative control, a
     before-scripting fixture requirement, and a >=2-DISTINCT-marker threshold replacing the old
     match-ANY rule; the Step 5.2 comment gained the matching exogeneity caveat. The threshold is
     not new analysis — it closes a SECOND, independently-confirmed false positive that the
     surface contract alone does not reach (a 1/6 bare-'PRE-CLAIM' hit on a compliance disclaimer,
     docs/signals/cowork-team-2026-07-30T001827Z-alertcmd-session-id-gap.json, whose own
     recommendation this adopts; that signal's other recommendation was already implemented as the
     2026-07-31 SESSION_ID_LINE entry above, this half was never actioned and the signal is still
     unprocessed in docs/signals/).
     Doc-only, no runtime change — Step 5.3 is still LLM-interpreted. Declared count also
     re-synced 309L→506L (stale since the 2026-07-29 +41L entry; the honor-tolerance is ±10%, so
     the old figure had stopped covering the file).
     KNOWN, NOT FIXED HERE (two separate things): (1) this file is ~29KB against the flow-file
     class's 7200B byte cap, and a size-justification header can only ever honor the LINE
     predicate (TE-T24) — splitting Step 5 into siblings is a structural task, not a doc-accuracy
     fix; (2) measured 2026-08-23 while validating this edit, NOTHING currently enforces either
     cap on this path — file-size-caps.json's `docs/agents/*/flow/**/*.md` pattern is matched with
     bash `case`, where `**` is plain `*`, so it only matches files one level BELOW flow/. All 173
     real flow files sit directly in flow/ and match no pattern at all; context-bloat-backstop.sh
     exits 0 on this file and on the 1425L system-auditor/flow/main.md alike. Reported separately
     (agents-architect owns the glob policy — widening it governs 173 files at once).
     FIX-COWORK-FLOWDOC-STALE-WEEKEND-SUPPRESSION-AND-BGFAN1-RETURN-PRESUMPTION (agent-father,
     2026-08-23): +28L (506→534) — Step 5.3 gained an explicit TIMING CONTRACT distinguishing the rare
     SAME-TICK path (Step 5.2's wait genuinely observed a real return within
     batch_wait_max_seconds) from the ordinary DEFERRED path under BGFAN-1 (the batch's task
     notification lands after this dispatcher's own turn has already reached Step 5b) — confirmed
     live 2026-08-23, a 3-slot batch's returns all landed after this session's turn ended, router
     re-ran Step 5.3 by hand once they arrived. Detector match logic (>=2-DISTINCT-marker
     threshold, fail-open negative control) is UNCHANGED — only WHEN its result is applied
     (pre-write WON_SLOTS filter vs. post-write last_fired de-stamp, last-fired.md AC-P1-7-4)
     and WHO applies it changes.
     FIX-CHEF-MARKER-KEY-ANCHOR-3 2026-08-23 (agent-father, architect brief
     2026-08-06-cowork-marker-lifecycle-anchor-and-release.md §2 Component A bullet 2): +51L
     (534→585) — Step 5.2's ENTRY_PROMPT composition gains SCHEDULED_UTC_LINE, appended to BOTH branches
     alongside SESSION_ID_LINE, propagating the tick's NOMINAL cron fire instant
     (`slot.scheduled_utc_time`, produced by ANCHOR-1) so no spawned worker re-derives its
     published-marker window from its own wall clock. ONE site, no is_catchup branch — every
     guaranteed slot inherits the token. Omitted (not nulled) when the producer degrades. Plus a
     consumer-contract paragraph naming the wired consumers. In-place growth in the existing
     Step 5.2 block, no new section.
     FIX-COWORK-LAYERC-NO-IDENTITY-PREAMBLE 2026-08-28 (developer, architect brief
     2026-08-28-fix-cowork-layerc-no-identity-preamble.md): +8L (585→593) — Step 5.2's
     IDENTITY_PREAMBLE inline literal moved to ONE shared script
     (scripts/agents-flow/cowork-identity-preamble.sh <agent>, byte-fidelity
     regression-tested; both planes consume it — Layer C composes the SAME preamble in
     cowork-guaranteed-slot-firer.sh). ENTRY_PROMPT composition lines unchanged
     (cowork-spawn-entry-prompt-session-id.test.js TC-1..4 still match). Step 5.3 negative
     control + OFFFLOW_MARKERS provenance now reference the shared script. -->
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

<!-- UC-CCA-P3-FR3-SPAWN-FANOUT-CLEANUP (agent-father, 2026-08-14, Q-skill-siting doc-debt cleanup):
     the ~78L pattern block that used to live here (FR-P2-7 inline task_claim/TTL/key prose) was
     the original copy-paste source the 4 EARLY-claim defect instances (chef, fb-market-poster,
     digest-predict, tran-ngoc-bau) were cloned from — now fully superseded by the shared skill
     below, which documents the correct Phase-1 (optional)/Phase-2 (mandatory, late-claim) pattern
     once for all 6 gates. Trimmed per architecture brief 2026-08-08-uc-cca-p3-published-marker-
     gate-skill.md §4/§Q-skill-siting. -->

**Published marker gate:** See `.claude/skills/published-marker-gate/SKILL.md` — the spawned
agent claims the marker immediately before its own irreversible publish action (never here).
The dispatcher (this flow) does NOT call publish markers — the publisher owns the marker
(unchanged invariant). Ops context: `docs/protocols/dwf-ops-runbook.md` § Published Marker
Interaction.

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
  # LOAD_1MIN — ONE scripted comma-safe probe (FIX-COWORK-FANOUT-LOAD1MIN-COMMA-
  # LOCALE-PARSE, cowork-fire 30d983ac). The old inline `awk -F','` parse truncated
  # comma-locale uptime to its integer part ("2,19" -> "2"; live: "4,22" -> "4") and
  # per-tick improvisations with `tr -d ','` produced "219" > 2*CORES, silently
  # inverting NORMAL -> DEGRADED. The probe emits the dot-decimal 1-min load in BOTH
  # locales ("2,19" -> "2.19"); exit!=0 / empty output = probe failed (fail-loud —
  # treat load as unknown, fail-safe per NFR-P1-3). Edit the script, never a second
  # copy of the parse here.
  LOAD_1MIN = bash: `bash scripts/agents-flow/cowork-load-probe.sh`
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
     is belt-and-suspenders only; the load-bearing gate is the Step 5.3 detector below, which
     cowork-team (never displaced — it composed the prompt and observes the raw return) evaluates
     independently of anything the spawn itself reports.
     CAVEAT (FIX-COWORK-SPAWNFANOUT-STEP53-OFFFLOW-DETECTOR-UNSPECIFIED-SURFACE-AND-SELF-INJECTED-
     MARKERS, 2026-08-23): "exogenous" holds ONLY under Step 5.3's surface contract. The preamble
     below names all six OFFFLOW_MARKERS verbatim — in the NEGATIVE, which a substring detector
     cannot see — so on any surface that includes the spawn prompt the detector reads dispatcher-
     authored text and the exogeneity argument above collapses. Measured 2026-08-23: the 1515-byte
     prompt for refine-bctc-slot-1 scores 6/6 on its own. Step 5.3's surface scoping is what keeps
     this comment true; do not weaken one without the other.
     FIX-COWORK-LAYERC-NO-IDENTITY-PREAMBLE (2026-08-28, developer): the preamble text below is
     now a REFERENCE to the ONE shared source — scripts/agents-flow/cowork-identity-preamble.sh
     (<agent> substituted). Edit that script, never a second copy of this text; Layer C
     (cowork-guaranteed-slot-firer.sh _fire_one_slot) composes the SAME preamble from the SAME
     script. -->

```
IDENTITY_PREAMBLE = <output of: bash scripts/agents-flow/cowork-identity-preamble.sh <slot.agent>>
# ^ ONE shared preamble source (FIX-COWORK-LAYERC-NO-IDENTITY-PREAMBLE): the preamble
#   text and its single substitution (the agent name, 3x — "You are <agent>",
#   "frontmatter name is not '<agent>'", "[<agent>] IDENTITY_CHECK=FAIL") live ONLY in
#   scripts/agents-flow/cowork-identity-preamble.sh. Edit THAT script, never a second
#   copy of this text. The six OFFFLOW_MARKERS vocabulary still lives inside that text,
#   named in the NEGATIVE — Step 5.3's marker list and this comment's exogeneity
#   argument are unchanged. The dispatcher demonstrably has bash at this step
#   (Step 5.1 runs `uptime`/`sysctl`; cowork-tick-preflight.sh runs bash+jq+curl at the
#   same dispatch step). Fidelity is regression-guarded by
#   scripts/agents-flow/cowork-identity-preamble.test.sh (byte-equal to the frozen
#   Step-5.2 text). Layer C composes the SAME preamble via the SAME script in
#   scripts/agents-flow/cowork-guaranteed-slot-firer.sh _fire_one_slot.
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

<!-- FIX-COWORK-SPAWNFANOUT-NO-SESSION-ID-IN-LEAF-ENTRY-PROMPT (2026-07-31): SESSION_ID_LINE
     carries cowork-team's OWN resolved session id into ENTRY_PROMPT as a concrete literal
     string, so a leaf worker with no Bash grant (e.g. refine_bctc_md) has something real to
     put in owner_client_session for its own task_claim/task_heartbeat/task_release calls.

     `$CLAUDE_CODE_SESSION_ID` below denotes cowork-team's own resolved value — the SAME value
     this file already resolves and uses directly for its own task_claim calls (Step 4.6,
     published-marker template above), substituted into a concrete string BEFORE ENTRY_PROMPT
     is dispatched. This is NOT the forbidden pattern (memory:
     feedback_llm_issued_call_tool_does_not_expand_session_id_variable): the forbidden pattern
     is writing the UNRESOLVED TOKEN TEXT "$CLAUDE_CODE_SESSION_ID" into a prompt string that a
     DIFFERENT LLM session receives as its own input — that session has no shell and cannot
     expand it. Here cowork-team performs the substitution itself, with its own Bash/env access,
     at composition time; the spawned leaf worker only ever sees the already-resolved concrete
     value as plain text, never the token.

     SCOPE DECISION (documented per row AC-3): injected UNCONDITIONALLY for every leaf worker,
     not scoped to only slots whose flow.md is known to declare a SELF-IDENTITY GUARD. Reasons:
     (a) matches the router's own unconditional CLAUDE.md step-3 precedent — every router spawn
     already carries its coordination session regardless of whether the target agent's flow
     happens to need it; (b) a scope-to-guarded-slots allowlist would require every future flow
     author who adds an owner_client_session dependency to remember to also update this
     dispatcher file — exactly the "documented consumer, no documented producer" defect class
     this row is the 5th recurrence of, and the allowlist itself would be the next instance;
     (c) cost of the unconditional line is one extra ignorable text line for leaf workers that
     never read it — no behavioral risk, since IDENTITY_PREAMBLE already established the same
     unconditional-injection precedent for the off-flow guard. -->

<!-- FIX-CHEF-MARKER-KEY-ANCHOR-3 (2026-08-23, agent-father; architect brief
     docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md §2
     Component A bullet 2): SCHEDULED_UTC_LINE propagates the tick's NOMINAL cron fire instant to
     the spawned worker so the worker never re-reads the wall clock to derive its own published-
     marker window. Root defect: a retry that lands after midnight UTC derives a DIFFERENT
     MARKER_KEY than the on-time peer for the SAME window — the 2026-07-22 19:55:41Z / 20:01:30Z
     two-peer straddle, and the 2026-08-06T06:37:39Z post-host-sleep retry that re-anchored to
     "today" instead of the missed 2026-08-05T19:45Z window.

     SINGLE SITE, NO is_catchup BRANCH — deliberate, per the brief. This is the ONE place the
     spawn prompt is composed, so adding the token here reaches chef-morning/eod/evening,
     digest-daily, digest-sunday, fb-daily and tnb-audit identically; a per-agent opt-in would be
     the same "documented consumer, no documented producer" class that SESSION_ID_LINE's own scope
     decision above rejects. Live and catch-up slots share the field AND the derivation
     (`cowork-catchup-predicate.mostRecentCronFireBefore`) — see match-slots.md.

     OMITTED, NOT NULLED, when the producer degrades: `slot.scheduled_utc_time` is null on a
     malformed/absent cron, an unavailable predicate module, or no fire inside the bounded 8-day
     lookback. Emitting the literal "scheduled_utc=null" would hand the worker a value that parses
     as present-but-garbage; emitting nothing lets each worker's own absent-branch fall back to
     `date -u` exactly as it did before this token existed. -->

```
SESSION_ID_LINE = "\n\nCoordination: owner_client_session=" + $CLAUDE_CODE_SESSION_ID
# ^ $CLAUDE_CODE_SESSION_ID here denotes cowork-team's own resolved coordination session id
#   ($DSH_SESSION_ID under DSH, $CLAUDE_CODE_SESSION_ID under Claude Code) —
#   NEVER emit the literal unresolved token text into ENTRY_PROMPT.

if slot.scheduled_utc_time is present and non-null and non-empty:
  SCHEDULED_UTC_LINE = "\nscheduled_utc=" + slot.scheduled_utc_time
else:
  SCHEDULED_UTC_LINE = ""     # producer degraded — say nothing, never "scheduled_utc=null"

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

  ENTRY_PROMPT = IDENTITY_PREAMBLE + slot.trigger_prompt + SESSION_ID_LINE + SCHEDULED_UTC_LINE
else:
  # No trigger_prompt on this slot — compose from flow_path (legacy fallback; every live
  # slot as of this fix carries trigger_prompt, so this branch is defensive only)
  ENTRY_PROMPT = IDENTITY_PREAMBLE + "run " + slot.flow_path + "  slot=" + slot.slot_id + SESSION_ID_LINE + SCHEDULED_UTC_LINE
```

Note: `IDENTITY_PREAMBLE` is prepended and `SESSION_ID_LINE` + `SCHEDULED_UTC_LINE` are appended to
BOTH branches (never written into `slot.trigger_prompt` stored in `cowork-schedule.json` itself — that
field stays untouched so the consistency check above and `scripts/agents-flow/cowork-match-slots.js`'s
`extractPromptFlowPath()` keep matching its literal first line unmodified; appending both lines at the
END of `ENTRY_PROMPT`, after the consistency check already ran against `slot.trigger_prompt`'s own first
line, keeps that FIRST-LINE match unaffected too). The preamble, the session-id line and the
scheduled-utc line are composed into `ENTRY_PROMPT` only, at spawn time.

Resulting tail of every spawn prompt (live and catch-up alike):

```
Coordination: owner_client_session=<resolved session id>
scheduled_utc=2026-08-23T13:47:00.000Z
```

**Consumer contract:** a worker parses `scheduled_utc=<ISO8601>` with the same technique it already uses
for `slot=<slot_id>`, and derives its window key from the token's leading 10 characters — NOT from its
own `date -u` call. If the token is absent (genuine ad-hoc/manual invocation with no scheduler tick, or
a degraded producer), the worker falls back to `date -u +%Y-%m-%d` unchanged. Live consumers wired so
far: `docs/agents/unified-agent/flow/chef.md` Step 0.5, `docs/agents/digest-predict/flow/main.md`
(FIX-CHEF-MARKER-KEY-ANCHOR-4). Every other guaranteed slot receives the token today and can adopt it
with a two-line change to its own Step-0.5-equivalent — nothing here needs editing again to enable one.

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

**TIMING CONTRACT — SAME-TICK vs. DEFERRED reconciliation (FIX-COWORK-FLOWDOC-STALE-WEEKEND-SUPPRESSION-AND-BGFAN1-RETURN-PRESUMPTION, 2026-08-23).** BGFAN-1 (every spawn in this file uses `run_in_background=true`) means the `Agent` tool call itself returns control to this dispatcher IMMEDIATELY, before the spawned session has done any work — Step 5.2's own comment already says as much ("naive back-to-back batching... is a no-op, since each spawn call returns immediately"). The Step 5.2 inter-batch wait loop's poll condition ("every spawn in this batch has returned its task notification") is therefore a BEST-EFFORT short window (`batch_wait_max_seconds`, default 120s), not a guarantee — a spawned cowork leaf agent routinely takes longer than that to complete its own flow. **Confirmed live 2026-08-23:** none of a 3-slot batch's task notifications had landed by the time this dispatcher's own turn needed to proceed to Step 5b; a separate, later pass (the router, in a different turn) had to re-run this exact Step 5.3 match logic by hand once the three returns actually arrived, and found 0/6 markers on each (stamps correctly left standing). That manual pass is the OPERATOR-DEFERRED RECONCILIATION contract this step now documents explicitly — it is not a one-off workaround, it is the NORMAL path for any slot whose spawn is still in-flight when the wait window elapses:

- **SAME-TICK path (uncommon — only when the wait genuinely observes real completion within `batch_wait_max_seconds`):** run the detector below BEFORE Step 5b as originally specified; a `MARKER_HITS >= 2` result removes the slot from `WON_SLOTS` and Step 5b never stamps `last_fired` for it — unchanged, PRE-write gate.
- **DEFERRED path (the common case under BGFAN-1 — any slot still in-flight when the wait window elapses):** Step 5b proceeds and stamps `last_fired` for that slot as scheduled (skipping it would silently starve every genuinely-fast, genuinely-successful spawn of its stamp, which is a worse outcome than the rare off-flow latch this detector exists to catch). This step's own match logic is re-run LATER, against the real return text, by whichever session next observes this batch's task notification — ordinarily the SAME cowork-team session if the notification lands before it ends its turn, otherwise the router or the next cowork-team tick's bootstrap step (`bootstrap.md`), whichever first has the returned text in hand. On a deferred `MARKER_HITS >= 2` result, that session performs a **DE-STAMP**: re-read `docs/data/cowork-schedule.json`, and if the slot's `last_fired` still equals the `FIRED_AT` value Step 5b wrote THIS tick (i.e. no later, genuine fire has since superseded it — never revert a fresher stamp), revert it to whatever value it held immediately before this tick's Step 5b write (never to `null` — Step 5b's own BLOCKER-3 monotonic-forward-only invariant is preserved, this is a correction, not a reset), making the slot due again on its normal cadence. **Scripting this de-stamp write is out of agent-father's `commit_zone` (`scripts/`) — a developer-owned follow-up row should add it to `scripts/agents-flow/cowork-write-last-fired.js` as a `--destamp <slot_id> <prior_value>` mode mirroring the existing script's atomic-write contract; until that ships, the reconciling session performs the equivalent jq-based read→compare→atomic-write by hand, same shape as `cowork-write-last-fired.js`'s own pseudocode in `last-fired.md`.**

**None of the above touches the detector's own match logic — same threshold, same fail-open posture, same marker list.** Only WHEN the result is applied (pre-write gate vs. post-write de-stamp) and WHO applies it changes; see FAILURE POSTURE below, unchanged.

Runs once per batch, either immediately after that batch's inter-batch wait resolves (SAME-TICK path) or later against the batch's eventual return text (DEFERRED path, above) — whichever is the earliest point the spawn's own return text becomes available. **Exogenous only
under the SURFACE CONTRACT below:** evaluated by cowork-team on the returned text of each
completed spawn, never self-reported by the spawned agent (a compromised spawn's own
IDENTITY_CHECK is a vacuous reader-is-writer check — see the Step 5.2 comment above). "Raw
returned text" used to be the wording here and it was too loose — the markers are dispatcher-
authored (see PROVENANCE below), so a surface that includes the prompt makes this check read its
own output and stop being exogenous at all. This is a THIRD failure class,
distinct from Step 5.0's gateway-blind guard and the plain spawn-tool-error handling above: the
Agent tool call itself succeeded and returned cleanly, but the returned content proves the
spawned session never entered its own flow file.

For each slot in this batch whose spawn returned its task notification — either within this
wait (SAME-TICK) or later once the return becomes available for reconciliation (DEFERRED, see
TIMING CONTRACT above): evaluate below. A slot with NO return available yet, at ANY evaluation
attempt, has nothing to inspect — its `last_fired` stamp (already written by Step 5b under the
ordinary DEFERRED default, per the TIMING CONTRACT above) stands until a later attempt has real
return text to evaluate; this is not "picked up by the normal next-tick due-check" — the stamp
means the slot will NOT look due again until its normal cadence elapses, which is exactly why the
DEFERRED de-stamp correction exists for the case where that stamp turns out be wrong (a genuine
off-flow latch, not a merely-slow-to-return legitimate spawn):

**SURFACE CONTRACT (read this before evaluating — a wrong surface makes the detector fire 6/6 on
every spawn, forever).** `RETURN_TEXT` is EXACTLY the spawn's **final assistant text turn** — the
`<result>` block of the task-completion notification this dispatcher receives. Nothing else.

- **NEVER** read `<session-scratch>/tasks/<task-id>.output` for a `local_agent` spawn. Measured
  2026-08-23: that path is a **187-byte symlink** into
  `~/.claude/projects/<encoded-cwd>/<session>/subagents/agent-<id>.jsonl` — the FULL transcript
  (246939 B for refine-bctc-slot-1; 748849 B for a longer peer). All 5 `local_agent` `.output`
  entries in that session were such symlinks. Plain Bash-task `.output` files ARE real files,
  which is exactly what makes the trap easy to miss. The transcript's FIRST record is the spawn
  prompt this file composed, so grepping it scores **6/6 unconditionally**. Same run, final
  assistant text turn only (1155 B): **0/6**. Both numbers re-measured at fix time.
- The prompt, the IDENTITY_PREAMBLE, tool-call logs, thinking blocks and any CLAUDE.md text pulled
  into the spawn's context are all OUT of range by construction.

```
RETURN_TEXT = <final assistant text turn of this spawn — the task-notification <result> block>

OFFFLOW_MARKERS = ["Coordination Results", "Dispatch Routing", "PRE-CLAIM", "session-presence",
                    "orphan-adoption", "Expected Behavior"]
  # PROVENANCE (corrected 2026-08-23 — the previous comment here claimed these were "verbatim
  # section headings / terms from the project-root CLAUDE.md router dispatch protocol", which is
  # measurably false). They are the observed vocabulary of the 2026-07-29T04:00Z off-flow return
  # described in the FIX- header above. Occurrence counts measured 2026-08-23:
  #   project-root CLAUDE.md : PRE-CLAIM 1, session-presence 1, orphan-adoption 1, other three 0
  #   global ~/.claude/CLAUDE.md : all six 0
  #   THIS FILE : all six present via the shared preamble script
  #     (scripts/agents-flow/cowork-identity-preamble.sh), which is prepended to
  #     EVERY spawn prompt, so the dispatcher plants all six in every spawn's context
  #     by design.
  #     (Do not turn this into a fixed occurrence count: this comment block itself contains the
  #      strings, so any count written here changes the thing it measures. Re-grep, don't quote.)
  # So the marker set is NOT exogenous to the dispatcher; only the SURFACE CONTRACT above makes
  # the detector exogenous. Anyone re-deriving this list must re-measure all three files, and
  # must not assume CLAUDE.md is the source.
  # A genuinely-executing gatherer's own RETURN/WORK-ping vocabulary (DONE:/PIPELINE:/WORK ping,
  # defined in each agent's own cycle/eod flow) never contains these strings — positive-match on
  # the KNOWN BAD shape, not absence of a good one, so legitimate quiet EXIT paths (Step -0
  # identity-fail, Step 0-GW sibling-corroborated gateway skip — neither of which touches the
  # notebook or emits this vocabulary) are never mistaken for an off-flow latch. That argument
  # holds for the SHAPE but not for any SINGLE string — see the THRESHOLD note below.

# NEGATIVE CONTROL (mandatory, runs BEFORE the match — this is the guard that would have caught
# the 09:00Z false positive). The extracted surface must not contain the text this dispatcher
# itself wrote. Cheapest sufficient probe: the first 60 chars of the shared preamble — the
# output of `bash scripts/agents-flow/cowork-identity-preamble.sh <slot.agent>` — which every
# spawn prompt starts with and no legitimate return ever reproduces.
if RETURN_TEXT contains first_60_chars_of(IDENTITY_PREAMBLE) OR len(RETURN_TEXT) > 20000:
  log "[cowork-team] Step 5.3 ABORT: extraction surface includes the spawn prompt (or is
    transcript-sized) — detector result is not trustworthy; slot_id=" + slot.slot_id
  send_telegram(channel="bug", message="[cowork-team] Step 5.3 surface-contract violation — " +
    slot.slot_id + " RETURN_TEXT contains dispatcher-authored prompt text; detector SKIPPED,
    last_fired stamped normally. Fix the extraction surface, not the marker list.")
  → skip the detector for this slot; leave it in WON_SLOTS   # FAIL-OPEN, see posture note below
  → continue to the next slot

# THRESHOLD: >=2 DISTINCT markers, not ANY. A single bare marker in an otherwise-clean return is
# a compliance disclaimer, not a latch — IDENTITY_PREAMBLE literally invites the spawn to say it
# did NOT run PRE-CLAIM/session-presence/orphan-adoption, and a substring test cannot see that
# negation. CONFIRMED LIVE, on the correct surface, so the SURFACE CONTRACT above does not close
# this on its own: docs/signals/cowork-team-2026-07-30T001827Z-alertcmd-session-id-gap.json
# § related_off_flow_detector_false_positive — alert-commander's self-report "identity confirmed,
# no router-dispatch prose, no PRE-CLAIM steps applied to myself as instructed" hit 1/6 while the
# agent had genuinely executed its own flow; that signal's own recommendation was this threshold.
# Sensitivity is retained: the real 2026-07-29T04:00Z off-flow return that motivated Step 5.3
# carried THREE distinct markers (Coordination Results, Dispatch Routing, Expected Behavior).
MARKER_HITS = count of DISTINCT markers in OFFFLOW_MARKERS present in RETURN_TEXT (case-insensitive)

if MARKER_HITS >= 2:
  log "[cowork-team] OFF-FLOW DETECTED: " + slot.slot_id + " (" + slot.agent + ") returned
    router-dispatch-shaped prose instead of executing its own flow — treating as fabricated
    success"
  send_telegram(channel="bug", message="[cowork-team] IDENTITY_CHECK=FAIL (exogenous) — " +
    slot.agent + " spawn (" + slot.slot_id + ") latched onto router protocol instead of its own
    flow; will retry next due tick")
  add to errors[]: { slot_id: slot.slot_id, error: "offflow_router_latch_detected",
                     marker_hits: MARKER_HITS, markers: <the distinct markers that matched> }
    # Record WHICH markers fired. The 2026-07-30 FP was only diagnosable because the dispatcher
    # wrote the matched marker into the signal by hand; make that structural, not discretionary.
  if this is the SAME-TICK path (Step 5b has not run yet for this batch):
    WON_SLOTS = WON_SLOTS.filter(s => s.slot_id != slot.slot_id)   # exclude from Step 5b's write —
      # conservative under-suppress (retries next due tick), same posture last-fired.md already
      # applies on write failure (AC-P1-7-3) and TICK-SNAPSHOT's own held/won bookkeeping.
  else:   # DEFERRED path — Step 5b already stamped last_fired for this slot earlier this tick
    perform the DE-STAMP correction described in the TIMING CONTRACT above (last-fired.md AC-P1-7-4)
# else: no signature hit — slot stays in WON_SLOTS (SAME-TICK) / stamp stands, nothing to correct (DEFERRED).
```

This does not replace or weaken Step 5.0 (gateway-blind) or the plain spawn-failure handling
above — those gate distinct failure classes before or at the spawn call itself. Step 5.3 gates
the one class neither of them can see: a spawn that returned successfully but never ran.

**FAILURE POSTURE — asymmetric, deliberately.** A missed off-flow latch costs one wasted slot
fire, recovered next due tick. A false positive empties `WON_SLOTS`, stamps no `last_fired` for
ANY slot, and re-fires every slot every tick forever plus one bug-telegram per slot per tick — a
fleet-wide stamp-suppression outage. So the negative control FAILS OPEN (stamp stands, detector
skipped, operator alerted) while a clean-surface marker hit fails closed. Never invert this. The
DEFERRED de-stamp path (TIMING CONTRACT above) does not change this posture: a de-stamp only ever
fires on a genuine `MARKER_HITS >= 2` match, same threshold, same negative control — it is a LATER
application of the identical fail-closed/fail-open rule, never a separate, looser one.

**BEFORE SCRIPTING THIS STEP.** Step 5.3 is LLM-interpreted today — confirmed 2026-08-23,
`grep -rlniE 'offflow|off-flow' scripts/` returns only two unrelated po-lifecycle files and no
script reads a `.output` path — so it currently survives on the dispatcher picking the right
surface by judgment, which is exactly why the surface contract above had to be written down
first. Any implementer MUST ship these two regression fixtures together with the code:
`(1)` a recorded spawn prompt alone → detector ABORTs on the negative control, never matches;
`(2)` a recorded genuine final assistant turn → 0/6, stamp stands. A run of the real 2026-07-29
off-flow return is the positive control for the match path itself.
