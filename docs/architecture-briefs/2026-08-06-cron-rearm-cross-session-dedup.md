<!-- size-justification: ~340L — covers 3 independent skill files + 1 shared coordination-store change + a 9-job manual remediation list, each requiring per-item precision (exact task_id/task_kind/threshold values, exact identity-vs-value guard fields per job) so agent-father/PM/developer can implement without re-deriving; a shorter summary would strip the falsifiability this repo's fail-loud discipline requires. PLAN-ONLY — no CronCreate/CronList/CronDelete/task_claim call made authoring this brief (grep-confirmed in RETURN). -->

# Cron Re-Arm Cross-Session Dedup — Marker Mechanism + Stale-vs-Missing Guard Fix + One-Time Remediation

**Date:** 2026-08-06
**Author:** agents-architect
**Trigger:** User directly observed live cross-session cron duplication across 3 concurrently-running CLI sessions; router cross-referenced live `CronList` output against the 3 skills' Step-1 guards and confirmed 4 duplicate pairs + 3 stale-valued live entries (2 confirmed-live-wrong, 1 confirmed-live-stale-different-value-than-a-correct-sibling).
**Status:** PLAN-ONLY. No `Cron*`/`task_claim`/`task_heartbeat` tool called authoring this brief.

---

## 0. Problem — restated from the router's diagnosis (verified, not re-derived)

`CronCreate`/`CronList`/`CronDelete` are strictly per-CLI-session. Each of the 3 re-arm skills'
Step-1 idempotency guard runs `CronList` and can only ever see jobs armed **in its own session** —
never a peer terminal's. Two independent defects compound:

1. **Cross-session blindness** — two sessions each independently conclude "not registered yet" and
   both `CronCreate` the same recurring dispatcher. Confirmed live: cowork-tick-preflight
   (`517b043c`/S1 + `79ed4a20`/S2), detect-loop self-arm (`d981cc7c`/S1 + `21c32d72`/S3), auditor
   Tier-1 (`0b51b50c`/S1 + `815ed711`/S3), auditor Tier-2 (`0d15b010`/S1 + `1d5be825`/S3).
2. **Stale-value blindness (single-session, different bug)** — the guard's match test is an exact
   string comparison (`cron_expression == X AND prompt contains Y`). A live entry with the identity
   right but the *value* wrong (drifted cadence, stale prompt) does not match the canonical
   condition, so the guard concludes "missing" and would **add** a duplicate rather than replace the
   wrong one. Confirmed live-and-wrong right now: Session 1's db-integrity Job A (`25595adc`,
   `15,45 2-9 * * 1-5`, pre-CADRAT-2-DST-fix — misses the settlement window it was built to cover)
   and Job B (`99e76a71`, 22:15 UTC-local-literal instead of midnight). Confirmed self-flagged in the
   `cron-cowork-team/SKILL.md` FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE rollout note: *"A bare
   `/cron-cowork-team` re-run after this fix ships is a no-op... it does not diff or re-propagate the
   `prompt:` text"* — this is the exact same bug class, already hit once, currently worked around by a
   manual required redeploy step instead of a structural guard fix.

Both defects must be fixed together — fixing only (1) without (2) still leaves Session 1's
stale db-integrity jobs live-and-wrong forever (nothing would ever replace them); fixing only (2)
without (1) still lets two sessions duplicate a *correctly-valued* job.

**Constraint that rules out the naive fix:** a cross-session marker that outlives the session that
set it re-creates the exact regression `project_cowork_guaranteed_slot_needs_live_cli_session`
already documents — a dead session's marker must not block a fresh session's restart-time
self-arm, or the guaranteed-slot-missed bug returns.

---

## 1. Marker mechanism — cross-session dedup without a stuck marker

### 1.1 Reuse, don't add a task_kind

`apps/mcp-server/src/infrastructure/db/coordinationStore.ts:346-353` — `task_kind` is a real 7-value
Zod enum **and** a SQLite `CHECK` constraint (`coordinationStore.ts:140`). Adding an 8th kind is a
schema migration, not a doc change. The codebase already has a sanctioned precedent for exactly this
situation: `coordinationStore.ts:446-451` documents that `cron:<flow>:<TICK>` fire-election markers
and `dev-team-cron-singleton` **reuse `task_kind:"sprint-task"`** ("kind is intentionally reused to
avoid enum-drift") and are excluded from orphan-signal adoption **by `task_id` prefix**, not by kind
(`ORPHAN_EMIT_ALLOW_LIST` scan guard, `coordinationStore.ts:520-522`: `task_id NOT LIKE 'cron:%'` /
`!= 'dev-team-cron-singleton'`). Do the same:

- `task_kind: "sprint-task"` (reused — zero schema change)
- `task_id: "cron-registration:<family>"`, one marker per **skill**, not per job (matches the
  observed failure grain: the confirmed duplicates cluster by whole-skill invocation — S1/S3 each
  hold 3-of-4 detect-loop jobs together, not one stray job — and each skill's own Step-1 guard
  already gates all-or-nothing at the family level):
  - `cron-registration:cowork-team`
  - `cron-registration:detect-loop`
  - `cron-registration:standalone-team`
- `owner_agent`: the skill name (`"cron-cowork-team"` etc.)
- `owner_client_session`: `$CLAUDE_CODE_SESSION_ID` (authoritative key, unchanged convention)
- `ttl_seconds: 691200` (max allowed — deliberately a backstop, not the primary staleness signal;
  see 1.3)
- `payload`: `{"jobs":[{"identity":"<stable substring>","cron_expression":"<canonical>","description":"<canonical>"}],"registered_at":"<ISO8601>"}`

**One required server-side change** (developer-owned, ~1 line, same file/pattern as the existing
`cron:%` exclusion): add `AND task_id NOT LIKE 'cron-registration:%'` to the `ORPHAN_EMIT_ALLOW_LIST`
scan-guard WHERE clause (`coordinationStore.ts:520-522`) so a marker that does eventually expire
(the 8-day backstop) GCs silently instead of minting a bogus orphan-signal and triggering a
nonsensical "adopt this registration flag as abandoned work" cycle.

### 1.2 Guard flow (replaces each skill's pure-local Step 1)

```
0. (Re-entrant fast path) If this session already claimed cron-registration:<family> earlier
   this session → task_heartbeat it, then skip to the skill's existing local CronList check
   (covers "CronCreate silently died even though the marker exists" — defensive, cheap).

1. marker_rows = task_list_held(task_kind="sprint-task")   // no task_id filter exists on this
                                                             // tool — filter client-side for
                                                             // task_id == "cron-registration:<family>"
2. If no matching row → GOTO Register (§1.2 step 5).
3. If matching row found, owner_client_session == $SID → re-entrant, same as step 0.
4. Else (peer session owns the marker):
   a. presence = task_list_held(kind="session-presence")   // read-only, same DoD-P15-2 pattern
                                                             // orphan-adoption already uses to
                                                             // probe published:<kind>:<period>
   b. Find the presence row whose owner_client_session matches the marker's owner_client_session.
   c. LIVE (row found, unexpired) → compare marker.payload's recorded cron_expression/description
      per job against canonical (§2). All match → STOP, no-op, log
      "[skill] already armed by live peer session <SID>. No-op."
      Any mismatch → live peer holds a stale-valued copy this session CANNOT safely touch
      (no cross-session CronDelete/CronCreate exists). Log + send_telegram(channel="work",
      "[skill] peer session <SID> holds a live but stale-valued <family> registration — will
      self-heal next time that session re-runs the skill, or fix manually in that terminal.").
      STOP — do not register a 2nd copy.
   d. DEAD (no presence row, or expired) → task_force_release_orphan(
        task_id="cron-registration:<family>", owner_client_session=<marker's stored SID>,
        orphan_threshold_seconds=<per-family T, §1.3>)
      - released:true → GOTO Register (step 5).
      - released:false, reason="heartbeat_fresh" → contradiction/race — treat conservatively
        as LIVE, STOP (never duplicate on ambiguity).
      - released:false, reason="lock_not_found" → peer already rotated it; re-read from step 1.

5. Register: task_claim(task_id="cron-registration:<family>", task_kind="sprint-task",
     owner_client_session=$SID, ttl_seconds=691200, payload=<manifest>).
   - claimed:true → run the skill's EXISTING local-CronList-guarded CronCreate calls, per corrected
     3-way identity/value match (§2) — only for jobs actually missing-or-stale locally.
   - claimed:false → a peer won a race between step 1's read and this claim → abort, re-run from
     step 1 (defer to whoever won).
```

### 1.3 Staleness oracle — session-presence first, marker heartbeat second (both required)

- **Primary signal (fast, ~≤30 min bound):** `session-presence:<SID>` rows already carry a 1800s TTL
  with 600s renewal (`dispatch-claim/SKILL.md` § Step 0a, already-shipped P2 infra). The moment a
  session's CLI process actually dies, its presence row simply stops renewing and expires within
  ≤30 min — independent of whatever TTL this brief's marker itself carries. This is what makes a
  fresh session's restart-time re-arm fast and safe: it does **not** wait out the marker's own
  8-day TTL, it detects real death via the already-battle-tested presence mechanism and force-steals
  immediately. This directly satisfies the guaranteed-slot-missed constraint from §0.
- **Secondary confirmation (mechanical steal gate):** `task_force_release_orphan` only fires when
  `heartbeat_at` is stale past `orphan_threshold_seconds` — this is a **second, independent**
  liveness check server-side, preventing a race where session-presence looks momentarily stale
  (e.g. a renewal in flight) from wrongly stealing a genuinely-live marker. Requires the marker's
  `heartbeat_at` to be periodically refreshed while the owning session is alive (see §1.4).
- Per-family `orphan_threshold_seconds`: cowork-team/detect-loop `T=7200` (2h — generous relative to
  their natural renewal cadence below, session-presence already did the fast detection so this is
  pure defense-in-depth). standalone-team `T=120` (tool minimum — session-presence is the *only*
  practical signal here since no natural per-tick renewal hook exists for these low-frequency crons;
  see §1.4).

### 1.4 Renewal — scoped to the 3 already-cron-specific dispatch flows, NOT the universal hot path

Deliberately does **not** touch `.claude/skills/dispatch-claim/CARD.md` Step 0a (that file fires
before *every* `Agent()` spawn across the whole fleet — adding 3 more heartbeat calls there taxes a
path this codebase's own TE-T* lazy-load discipline treats as sacred, for zero benefit to sessions
that never ran a `/cron-*` re-arm skill). Instead, piggyback on the natural per-tick execution point
each family already has:

- **cowork-team** (`docs/agents/cowork-team/flow/main.md` — Step 0a session-presence block, already
  fires every `*/15` tick): add one `task_heartbeat(task_id="cron-registration:cowork-team", ...)`
  call, best-effort (no-op if this session doesn't own it).
- **detect-loop** (`docs/agents/dev-team/flow/preflight-fallback.md` + `system-auditor/flow/main.md`
  Step 0d — both already fire a per-tick presence/fire-election block): same addition,
  `cron-registration:detect-loop`. Multiple flows heartbeat the same marker — harmless/idempotent,
  whichever fires most recently wins.
- **standalone-team**: **no natural per-tick hook exists** (correctly, by the skill's own documented
  design — these 5 crons explicitly have no fire-election/tick infra, per its own Notes section) —
  do not manufacture one. Renewal here happens only via the guard's own re-entrant `task_heartbeat`
  (§1.2 step 0/3) whenever `/cron-standalone-team` is itself re-invoked. This is why §1.3 sets its
  `orphan_threshold_seconds` to the tool minimum (120s) — for this one family, session-presence
  cross-check is the *entire* practical staleness signal, and the marker's own 8-day TTL is the
  real (rarely-hit) backstop.

---

## 2. Stale-vs-missing guard-logic fix (the second, distinct bug)

Restructure each skill's Step-1 match test from a single `identity AND value` binary
(found/missing) into an explicit two-phase classify:

```
Phase 1 — IDENTITY (stable, cadence-independent substring/field):
  find any live CronList entry whose description or prompt contains the job's identity anchor.
Phase 2 — VALUE (only for identity-matched entries):
  compare cron_expression (and, where the current guard doesn't already encode it, a
  content-distinguishing description/prompt fragment) against canonical.

  identity match + value match      → present-and-correct, no-op (existing happy path, unchanged)
  identity match + value mismatch   → present-but-WRONG → CronDelete(found_id) THEN
                                       CronCreate(canonical) — replace in place, never add
  no identity match                 → genuinely missing → CronCreate (existing add path, unchanged)
```

**Per-job identity anchors** (most already exist as the current guard's own prompt-substring
condition — reuse verbatim, just stop conflating them with the value check):

| Job | Existing anchor (keep as identity) | Fix needed |
|---|---|---|
| cowork-team master | `description` contains `"cowork-team master dispatcher"` | none — already unique |
| detect-loop Job1 (dev-team) | prompt contains `dev-team/flow/main.md` | none — already unique |
| detect-loop Job2/3/4 (auditor T1/T2/T3) | prompt contains `AUDIT_TIER=1`/`2`/`3` | none — already unique |
| standalone Job1 (db-integrity weekday) | prompt contains `db-integrity-probe.sh` | **BROKEN — shared with Job2, see below** |
| standalone Job2 (db-integrity off-hours) | prompt contains `db-integrity-probe.sh` | **same** |
| standalone Job3-6 (agent-father/claude-manager-helper/code-janitor/market-db-journal-guard) | prompt contains `<flow-path>`/`verify-market-db-journal-mode.sh` | none — already unique |

**standalone Job1/Job2 fix:** both jobs' `prompt` is byte-identical by design (`register.md`'s own
note: "Same prompt as Job 1... only the cron expression differs") — `db-integrity-probe.sh` cannot
disambiguate them, and today's guard only tells them apart via `cron_expression`, which is exactly
the field that can be stale. Switch their identity anchor to `description`, which already carries a
unique, cadence-independent per-job token: `"CADRAT-2 Job A"` (Job1) vs `"CADRAT-2 Job B"` (Job2).

**One naming trap to avoid when implementing:** detect-loop Job1's own `description` field
("dev-team every 30 min — signal drain + task planning") bakes the cadence into the description
text itself. Do not use `description` as its identity anchor — keep using the prompt-substring
`dev-team/flow/main.md` already in the table above, which stays valid even if the cadence changes.

This structural fix supersedes the manual-redeploy workaround note in `cron-cowork-team/SKILL.md`'s
own FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE section — once shipped, a bare `/cron-cowork-team`
re-run correctly detects a stale `prompt:` and replaces it, closing that already-self-flagged gap.

---

## 3. One-time remediation — for the user to run personally in each of the 3 terminals

**Neither this agent nor router can reach these sessions — `CronCreate`/`CronDelete` are strictly
local to the calling process.** This is a literal command list, not a code change. Verified against
canonical values in `.claude/skills/cron-detect-loop/register.md` and
`.claude/skills/cron-standalone-team/register-job-db-integrity-{weekday,offhours}.md` (both
confirmed live-read this session, matching the router's stated cadences exactly).

### Session 1 (terminal that ran all 3 skills)

```
# db-integrity Job A — stale cadence, replace in place
CronDelete(id="25595adc")
CronCreate(description="db-data-integrity — weekday session+settlement window (CADRAT-2 Job A)",
           cron="15,45 4-11 * * 1-5", recurring=true, durable=true,
           prompt=<verbatim from .claude/commands/crons/cron-db-data-integrity.md
                   "prompt (both jobs, byte-identical)" block>)

# db-integrity Job B — stale cadence, replace in place
CronDelete(id="99e76a71")
CronCreate(description="db-data-integrity — daily off-hours backstop (CADRAT-2 Job B)",
           cron="0 0 * * *", recurring=true, durable=true,
           prompt=<same verbatim block as Job A>)

# d923766f, 721edebd, 508f67f0, e3b60362 — already correct, no action
# 517b043c (cowork), d981cc7c (detect-loop), 0b51b50c (auditor T1), 0d15b010 (auditor T2),
# 101f2dff (auditor T3) — all correct, KEEP as the surviving copy (see Session 2/3 below)
```

### Session 2 (terminal that only ran /cron-cowork-team)

```
# 79ed4a20 duplicates Session 1's already-correct 517b043c — delete the redundant copy
CronDelete(id="79ed4a20")
```

### Session 3 (terminal that ran /cron-detect-loop)

```
# 21c32d72 duplicates Session 1's already-correct d981cc7c — delete the redundant copy
CronDelete(id="21c32d72")

# 815ed711 duplicates Session 1's already-correct 0b51b50c — delete the redundant copy
CronDelete(id="815ed711")

# 1d5be825 duplicates Session 1's already-correct 0d15b010 — delete the redundant copy
CronDelete(id="1d5be825")

# e7a0fb53 — stale-valued AND redundant: Session 1's 101f2dff is already correct at 4:00 AM
# local (CEST) = 02:00 UTC. Do NOT CronCreate a "fixed" replacement here — that would just
# create a SECOND correct copy, re-introducing the duplicate this whole exercise is closing.
# Delete only.
CronDelete(id="e7a0fb53")
```

**After this sequence:** Session 1 becomes sole owner of cowork-team + detect-loop +
standalone-team's live crons (matching how it organically ended up positioned); Session 2 and
Session 3 hold zero cron registrations. Run `CronList` in each terminal afterward to confirm.

---

## 4. Implementation routing + sequencing

1. **Guard-logic fix (§2)** — `.md`-only, all 3 files own zone (`docs/agents/*/flow` +
   `.claude/skills/cron-*-team/{SKILL,register}.md`) — **agent-father implements directly**, no
   dev-team sprint needed.
2. **Marker mechanism (§1.2-1.4)** — same zone, same skills — **agent-father implements directly**
   for the guard pseudocode + the 2-3 per-family flow-file heartbeat additions (cowork-team/main.md,
   dev-team/preflight-fallback.md, system-auditor/main.md — all agent-file territory).
3. **`coordinationStore.ts` 1-line WHERE-clause exclusion (§1.1)** — production TypeScript,
   **out of agent-father's scope** (`agent-father` `not_my_job`: "Writing production code — that's
   developer"). Routes through PM → dev-team (developer implements, QA verifies) — same convention
   this codebase already used for the sibling coordination-store work
   (`docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md` §6: "Not
   plan_only — PM should decompose into a dev-team task").
4. **Sequencing constraint:** item 3 must land and be deployed (rebuild) **before** items 1-2 go
   live, otherwise a marker that legitimately expires (rare 8-day backstop) mints a bogus
   orphan-signal for `cron-registration:*` and pollutes the orphan-adoption queue with un-adoptable
   noise. Low real-world exposure (8-day TTL rarely elapses) but sequencing costs nothing here.
5. **§3 (one-time remediation)** is independent of 1-4 — the user can run it any time, in any order,
   without waiting on either implementation track. It is the only part of this brief with zero
   agent involvement by design (per task instruction: no `Cron*` tool call from this agent or router).

---

## 5. PO ratification — flagged, not decided (per task instruction)

Recommend a PO check-in before dev-team sprint kickoff on item 3 (§4) specifically — **not** because
this is a policy tradeoff like `2026-08-06-cadence-reanalysis-v2.md` (which asked the user to choose
among competing REMOVE/keep options), but because of blast radius: `coordinationStore.ts`'s
`gcExpiredLocks` WHERE clause is shared, always-hot infrastructure (every `task_claim` call in the
whole fleet triggers an opportunistic GC pass through it, per `claimTask`'s own `gcExpiredLocks(db,
300, input.task_id)` call at line 629) — the same class of "touches everyone" surface that made the
original CROSS-SESSION-MULTI-TEAM-ORCH locking system (TASK_1977-1995) a structured PM/dev-team/QA
sprint rather than an ad-hoc edit, even though the specific diff here is a single `AND task_id NOT
LIKE` clause matching an already-shipped precedent exactly. Items 1-2 (agent-father's own `.md`
zone) do not need the same gate — same posture as every other agent-father-owned brief this session.

---

## 6. AC / verification gate

1. Two sessions independently invoking the same `/cron-*` skill within the same live window →
   exactly one `CronCreate` fires per job; the second session's guard resolves to no-op (session-
   presence cross-check finds the first session live).
2. A session that legitimately dies (no presence renewal) → the next session to invoke that skill
   detects deadness within ≤30 min (session-presence TTL, not the marker's own 8-day TTL) and
   re-arms without waiting — verifies the guaranteed-slot-missed constraint is not reintroduced.
3. A live-but-stale-valued entry (matching identity, wrong cron_expression/prompt) is replaced via
   `CronDelete`+`CronCreate`, never duplicated — verify against the standalone Job1/Job2
   description-anchor fix specifically, since that is the one identity anchor this brief changes.
4. `gcExpiredLocks` never emits an `orphan-signal` for any `cron-registration:*` task_id (verify via
   `task_list_held(kind="orphan-signal")` after forcing a marker to expire in a test harness).

---

## RETURN
DONE: Brief authored + notebook committed
NEXT: agent-father (§2 guard fix + §1.2-1.4 marker mechanism, own zone, direct implement) | PM → dev-team (§1.1 coordinationStore.ts 1-line change, developer-owned, QA-verified) | user (§3 one-time remediation, manual, any of the 3 terminals, any order)
HANDOFF: docs/architecture-briefs/2026-08-06-cron-rearm-cross-session-dedup.md
PIPELINE: continue
