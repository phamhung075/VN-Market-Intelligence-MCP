# cron-cowork-team — Register (lazy-load detail)

Loaded from `.claude/skills/cron-cowork-team/SKILL.md` ONLY when Step 1 finds the master dispatcher
missing or stale (Step 1d's "missing"/"mismatch" branch reaches Step 2 here), or when you need the
durability-layer background, the admin (`CronList`/`CronDelete`) reference, or the historical
rollout notes. The hot path — Step 1 (1a-1d), run on every `/cron-cowork-team` invocation — never
needs this file.

---

## Why this skill exists — Durability layer inventory

The master CronCreate dispatcher is **session-scoped** — it evaporates on CLI session end.
Invoking `/cron-cowork-team` at session start ensures it is live again within one tick (≤15 min).

**Durability layer inventory** (TASK-COWORK-DOC-TRUTH-LAYER-INVENTORY, agent-father 2026-08-23;
figures re-measured that date, not copied forward):

| Layer | Mechanism | Scope | State |
|---|---|---|---|
| **A** | 12 cloud RemoteTriggers | was 12 guaranteed/hourly slots | **RETIRED 2026-06-22** — mechanism gone (`cowork-schedule.json` `._notes.layer_a_deletion_gate`, STANDING `feedback_no_remote_trigger_all_local`). `trigger_status` tally, 23 slots: 0 active, 5 superseded, 5 deleted, 13 absent. |
| **B** | this skill's `*/15 * * * *` dispatcher | all 21 enabled slots | **Session-scoped.** Evaporates on CLI exit. |
| **C** | launchd `com.vn-market.cowork-guaranteed-slot-firer`, `StartInterval=900` | the 8 `guaranteed:true` slots | **Loaded, working** (last exit 0). **Awake-scoped**: no run while host sleeps; wake coalesces missed intervals into one fire, does not replay them. |

**Consequence:** during a host-sleep window B and C are down **simultaneously**, no catch-up —
no layer survives a sleeping host. Layer C is *awake*-durable only; Layer A is not a fallback.

**`guaranteed` is NOT the durability discriminator.** Measured 2026-08-23: 12/21 enabled slots
fired within 48h, 9 had not — 5/8 guaranteed fresh vs 7/13 non-guaranteed, essentially the same
rate. The load-bearing variable is host-awake / CLI-up at the scheduled minute, not `guaranteed:
true`. Mis-citing the retired RemoteTrigger layer as still-active is exactly what caused a live P0
row to mis-diagnose an 8-hour miss.

---

## Step 2 — Register the master CronCreate

Reached from Step 1d's "missing" or "mismatch" branch (mismatch branch runs `CronDelete` first,
immediately above).

<!-- BGFAN-1: The dispatcher that runs on each tick (cowork-team/flow/main.md → spawn-fanout.md) MUST spawn all cowork agents with run_in_background=true. Canonical rule → docs/protocols/agent-chaining-protocol.md § Background Spawn Mandate -->

> **TOKEN-ECONOMY-TICK-PREFLIGHT WU-2 (2026-07-13, TE-T01):** this prompt now mirrors dev-team
> Job 1 (`.claude/skills/cron-detect-loop/SKILL.md`) — the preflight script runs FIRST, directly
> from the cron prompt, so the ~80% of ticks that are SILENT/LOST_ELECTION/DEFER never pay the
> 15,916-byte `main.md` read at all. Rationale identical to dev-team's: `CronCreate` is LLM-narrated,
> unreachable from the script's own transport, so the script-first gate can only live in the prompt
> text, not inside main.md (main.md's own Step 0 — unchanged — remains the correct entry point for
> manual/ad-hoc invocations of this flow, e.g. testing or a direct operator run).

```
CronCreate(
  description : "cowork-team master dispatcher — fires every 15 min, fans out to schedule SSOT (agents spawned run_in_background=true per BGFAN-1)",
  cron        : "*/15 * * * *",
  prompt      : "Run: bash scripts/agents-flow/cowork-tick-preflight.sh (requires $CLAUDE_CODE_SESSION_ID) and read its one-line JSON verdict. On verdict=SILENT: done, no further reads needed (script already emitted pressure state and released the election lock). On verdict=WORK: read and execute docs/agents/cowork-team/flow/main.md starting at '§ WORK continuation' (script already handled presence/election/one-shot claims/blind guard/slot matching — do NOT re-run Steps 0b/0b.3/0c/1-4b, per main.md's own JUMP-TO table). On verdict=LOST_ELECTION: done, no further reads needed (script already sent the work-channel telegram — peer session leads this tick). On verdict=DEFER: done, no further reads needed (AF-1 backstop-window defer — retries automatically at the next 15-min tick). On verdict=TOMBSTONED: done, no further reads needed (pressure-state.json's tick_id already matched this nominal tick — a prior session already completed it; script made ZERO task_claim calls on cron:cowork:<tick>, suppressed before the election attempt — FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE FR-1/FR-3). On verdict=ERROR: read and execute docs/agents/cowork-team/flow/preflight-error-fallback.md starting at Step 0a (original inline pseudocode, unabridged fallback, hosted in this sibling file to main.md since TE-T03 2026-08-11 — do NOT re-run Step 0's preflight script, its result is undefined). On any other/unrecognized verdict string: done, EXIT — do NOT default to the WORK continuation path (stale prompt or script bug, neither justifies running the dispatch body).",
  durable     : true
)
```

**On success:** log `[cron-cowork-team] Master dispatcher registered. Next tick: <next UTC :00 or :15 or :30 or :45>. Dispatcher: docs/agents/cowork-team/flow/main.md`.

**On failure:** log error verbatim + send `send_telegram(channel="bug", "[cron-cowork-team] CronCreate FAILED: <error>")`. Do NOT retry. Report to user.

---

## Manage — CronList / CronDelete

### List all active crons (inspect dispatcher health)

```
CronList
```

Expected output includes an entry with:
```
description : cowork-team master dispatcher
cron        : */15 * * * *
durable     : true
```

If this entry is ABSENT after a session reset → the dispatcher evaporated → invoke `/cron-cowork-team` to re-arm.

### Delete the master cron (admin only — requires explicit user intent)

```
# 1. Get the cron id from CronList output
CronDelete(id="<cron-id-from-CronList>")
# 2. Verify it no longer appears in CronList
CronList
```

**Warning:** deleting the master dispatcher silences all sub-hourly cowork slots (news-scout-market, market-watcher-market, alert-commander-market) — and, unlike what this warning used to claim, there is no RemoteTrigger layer still firing the hourly/guaranteed ones (Layer A retired 2026-06-22, see § Why this skill exists above). The only thing left is launchd Layer C, which covers **8 guaranteed slots only** and is awake-scoped. Only delete if replacing with a new registration immediately.

---

## Notes

- The dispatcher reads `docs/data/cowork-schedule.json` at each tick and fans out only to slots whose `next_fire_at ≤ now` (±2 min window via `scripts/agents-flow/cowork-match-slots.js`).
- `durable: true` makes the cron persist across CLI process restarts within the same session. It does NOT survive session-end (CLI exit / restart). That is why this skill exists.
- The session-independent backstop is launchd **Layer C** (`com.vn-market.cowork-guaranteed-slot-firer`, `StartInterval=900`), covering the 8 `guaranteed:true` slots and **only while the host is awake** — missed intervals are coalesced on wake, not replayed. It is NOT the 12 RemoteTriggers: that layer was retired 2026-06-22 and 0 slots carry `trigger_status:"active"` (see § Why this skill exists above for the full three-layer inventory and the measurements behind it).
- Full silence-detection + recovery procedure: `docs/protocols/cowork-master-cron-runbook.md`.
- **TOKEN-ECONOMY-TICK-PREFLIGHT WU-1 (2026-07-02) → superseded by WU-2 (2026-07-13, TE-T01):**
  WU-1 shipped the deterministic `scripts/agents-flow/cowork-tick-preflight.sh` script and wired
  it into `main.md`'s own Step 0, but left the `CronCreate prompt:` text pointing straight at
  `main.md` — so every tick still paid the full 15,916-byte file read before Step 0 ever ran the
  script. WU-2 (Step 2 above) moves the script call into the prompt itself, so SILENT/LOST_ELECTION/
  DEFER ticks (~80% of fires) skip the `main.md` read entirely. main.md's own Step 0 and § Step 0
  JUMP-TO table are unchanged and still serve as the entry point for manual/ad-hoc runs of this flow.

---

## FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE rollout note (NFR-5(b)/(c)) — SUPERSEDED

**SUPERSEDED by FIX-CRON-REARM-CROSS-SESSION-DEDUP (2026-08-06/07).** Step 1d's two-phase
classify now checks Phase 2 VALUE for the `"TOMBSTONED"` prompt fragment — a bare
`/cron-cowork-team` re-run detects a stale `prompt:` (identity match + value mismatch) and
self-heals via `CronDelete`+`CronCreate`, closing the gap this note flagged. Kept for incident
record; the manual rollout requirement below no longer applies.

**Before this fix, a bare re-run was a no-op:** the OLD Step 1 guard matched only
`cron_expression`+`description`, never diffed/re-propagated `prompt:`, so a live armed cron kept
running the OLD prompt (no `TOMBSTONED` clause) until explicitly replaced via:
```
CronDelete(id=<current-id-from-CronList>)
```
then re-run Step 2 to `CronCreate` with the updated `prompt:`. Runner: main terminal (or whoever
holds `CronCreate`/`CronDelete`) — session-scoped, not spawnable by dev-team agents.

---

## P3-OBSERVE-ONLY-RETIREMENT (TASK_1994 — activation gate: TASK_1995)

**What is superseded:**

The operator convention `feedback_router_cowork_defer_to_live_leader` ("Router cowork OBSERVE-ONLY — parallel terminal owns cowork") is superseded by the code-enforced fire-time election in `docs/agents/cowork-team/flow/leader-lock.md`.

Under P3:
- Any session attempting the cowork dispatcher claims `cron:cowork:<TICK>` atomically.
- Only the winner fires the full dispatch pipeline (Steps 0c–6).
- The loser EXITs cleanly — no operator discipline required.
- Cross-session mutual exclusion is now code-enforced, not operator-enforced.

**Activation gate:**
This supersession takes effect in code from TASK_1994 merge. The MEMORY.md pointer for `feedback_router_cowork_defer_to_live_leader` is marked SUPERSEDED ONLY after P3-QA (TASK_1995) passes its 3 smoke tests:
1. Two sessions fire cowork tick simultaneously → exactly one {claimed:true}.
2. Session loses fire-election → EXITs cleanly with WORK telegram.
3. Dispatch completes → lock released → next tick elects fresh.

Until TASK_1995 sign-off, the operator convention remains as FALLBACK (if the code gate fails, the operator convention prevents double-dispatch).

**Period-key formula (reference):**
`cron:cowork:<TICK>` where `TICK = floor(current_minute / 15) * 15 → YYYY-MM-DDTHH:MMZ`.
See `docs/architecture-briefs/2026-06-28-fire-time-leader-election-P3-addendum.md` §A for full spec.

---

## Sibling-Process Defer — Fallback Only (not primary; Step 1a's fingerprint check is primary)

If Step 1a's `registering_process` fingerprint check is ever suspected unreliable (e.g. the
`$PPID`/`lstart` assumption doesn't hold in some future runtime), fall back to operator discipline:
if this terminal should never run the cowork dispatcher (another terminal owns it), simply do not
invoke `/cron-cowork-team` here. Mirrors the P3-OBSERVE-ONLY-RETIREMENT posture above —
code-enforced first, human convention kept only as an explicit fallback, never silently primary.
Retire once Step 1a has 2+ observed clean sibling-process defers with no false-positive — track in
notebook, not a formal smoke-test gate (`.md`-only fix, no dev-team QA sprint).

Full spec: `docs/architecture-briefs/2026-08-15-cowork-cron-registration-sibling-process-defer.md` §3.
