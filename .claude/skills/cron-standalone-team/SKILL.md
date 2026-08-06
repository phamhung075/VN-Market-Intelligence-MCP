---
name: cron-standalone-team
description: >
  Session-start hook. Idempotently registers the 6 CronCreate entries for the
  5 standalone crons that sit outside the cowork-team/dev-team/system-auditor
  loops: db-data-integrity (2 entries, post-CADRAT-2 schedule split),
  agent-father, claude-manager-helper, code-janitor, market-db-journal-guard.
  Invoke after every Claude Code CLI session restart. Second invocation is a
  no-op.
---

# cron-standalone-team — Standalone Crons Re-Arm Skill

**Trigger:** `/cron-standalone-team`
**Purpose:** Re-arm 6 session-scoped `CronCreate` entries covering the 5 standalone crons that
had **zero** automated re-arm coverage before this skill (confirmed by grep — neither
`cron-cowork-team` nor `cron-detect-loop` names any of them):
`.claude/commands/crons/cron-db-data-integrity.md` (2 entries post-CADRAT-2 split),
`cron-agent-father.md`, `cron-claude-manager-helper.md`, `cron-code-janitor.md`,
`cron-market-db-journal-guard.md` (added 2026-08-06,
`FIX-MARKETDB-JOURNALMODE-GUARD-SHIPPED-BUT-NEVER-ARMED` AC-1).

**Why a NEW skill, not an extension of `cron-detect-loop`** (PO decision,
`docs/architecture-briefs/2026-08-04-cadence-rationalization.md` §8 item 4): these crons
share no dispatch-loop relationship with dev-team/system-auditor Tier-1/2/3 the way
`cron-detect-loop`'s name implies, AND `cron-detect-loop/SKILL.md`'s own size-justification
requires its Step-1 idempotency guard to stay a 4-condition hot path (~46-48 of 48 dev-team
ticks/day) that never loads `register.md` — doubling it to 8+ conditions for these unrelated
crons would tax that hot path 48x/day for zero benefit to the loop it actually guards. This skill
mirrors `cron-cowork-team`'s shape instead: single-purpose idempotency guard + N `CronCreate`
calls, no dispatch-loop logic.

**Detail (lazy-load — read ONLY when Step 1 finds a missing entry):** the 6 `CronCreate` prompt
bodies (Job 1-6) live in `.claude/skills/cron-standalone-team/register.md`. The common
all-6-registered path never needs that file.

---

## Step 1 — Cross-session registration guard (FIX-CRON-REARM-CROSS-SESSION-DEDUP §1.2/§2)

CronCreate/CronList are strictly per-CLI-session — a peer terminal's registration is invisible to
`CronList`. This step uses a cross-session marker (`task_id="cron-registration:standalone-team"`,
`task_kind="sprint-task"` reused per `coordinationStore.ts:446-451` precedent, ONE marker for all
6 jobs) so two sessions never both `CronCreate` the same job, THEN runs the local `CronList`
classify below. Full mechanism spec:
`docs/architecture-briefs/2026-08-06-cron-rearm-cross-session-dedup.md` §1.2-1.4.

**Step 1a — Fast path (cheap, blind heartbeat):**
```
hb = call_tool(server="vn-market", tool="task_heartbeat", arguments={
  task_id: "cron-registration:standalone-team", owner_client_session: $CLAUDE_CODE_SESSION_ID
})
```
`hb.ok == true` → this session already owns the marker → **GOTO Step 1d** (local classify).
`hb.ok == false` → not found, or owned by someone else → continue to Step 1b.

**Step 1b — Read the marker + resolve the holder:**
```
marker_rows = call_tool(server="vn-market", tool="task_list_held", arguments={kind: "sprint-task"})
# no task_id filter exists on this tool — filter client-side for
# task_id == "cron-registration:standalone-team"
```
- No matching row → **GOTO Step 1c** (register).
- Matching row, `owner_client_session == $CLAUDE_CODE_SESSION_ID` → race with Step 1a — heartbeat it
  again, **GOTO Step 1d**.
- Matching row, peer session owns it → continue to Step 1b.1.

**Step 1b.1 — Peer liveness cross-check (session-presence — the ONLY practical staleness signal
for this family; see §1.4 T=120 rationale below):**
```
presence_rows = call_tool(server="vn-market", tool="task_list_held", arguments={kind: "session-presence"})
# find the row whose owner_client_session matches the marker's owner_client_session
```
- **LIVE** (row found, unexpired) → compare the marker's `payload.jobs[].cron_expression` (all 6)
  against canonical (Step 1d table). All match → **STOP, no-op.** Log
  `"[cron-standalone-team] already armed by live peer session <SID>. No-op."`
  Any mismatch → **STOP** — do NOT register a 2nd copy (no cross-session `CronDelete`/`CronCreate`
  exists). Log + `send_telegram(channel="work", "[cron-standalone-team] peer session <SID> holds a
  live but stale-valued standalone-team registration — will self-heal next time that session
  re-runs the skill, or fix manually in that terminal.")`.
- **DEAD** (no presence row, or expired) →
  ```
  release = call_tool(server="vn-market", tool="task_force_release_orphan", arguments={
    task_id: "cron-registration:standalone-team", owner_client_session: <marker's owner_client_session>,
    orphan_threshold_seconds: 120
  })
  ```
  `T=120` is the tool minimum (deliberate — no natural per-tick renewal hook exists for this
  family, session-presence liveness is the entire practical staleness signal, see §1.4).
  - `released:true` → **GOTO Step 1c** (register).
  - `released:false` (fresh heartbeat — race) → treat conservatively as LIVE → **STOP, no-op.**
  - `released:false` (lock not found — peer already rotated it) → re-read from Step 1b.

**Step 1c — Register the marker:**
```
claim = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: "cron-registration:standalone-team", task_kind: "sprint-task",
  owner_agent: "cron-standalone-team", owner_client_session: $CLAUDE_CODE_SESSION_ID,
  ttl_seconds: 691200,
  payload: {"jobs":[
    {"identity":"CADRAT-2 Job A","cron_expression":"15,45 4-11 * * 1-5"},
    {"identity":"CADRAT-2 Job B","cron_expression":"0 0 * * *"},
    {"identity":"agent-father/flow/main.md","cron_expression":"23 14 * * *"},
    {"identity":"claude-manager-helper/flow/main.md","cron_expression":"30 19 * * 1,4"},
    {"identity":"code-janitor/flow/main.md","cron_expression":"0 */6 * * *"},
    {"identity":"verify-market-db-journal-mode.sh","cron_expression":"*/15 * * * *"}
  ],"registered_at":"<ISO8601 now>"}
})
```
`claim.claimed == true` → **GOTO Step 1d.** `claim.claimed == false` → a peer won a race between
Step 1b's read and this claim → abort, re-run from Step 1b.

**Step 1d — Local two-phase classify (stale-vs-missing guard fix, §2 — Job1/Job2 identity anchor
FIXED here, see note below):**
```
CronList
```
For each of the 6 jobs below: Phase 1 — IDENTITY (stable, cadence-independent); Phase 2 — VALUE,
only for identity-matched entries (compare `cron_expression`).

| Job | Phase 1 identity anchor | Phase 2 canonical `cron_expression` |
|---|---|---|
| 1 (db-integrity weekday) | `description` contains `"CADRAT-2 Job A"` | `15,45 4-11 * * 1-5` |
| 2 (db-integrity off-hours) | `description` contains `"CADRAT-2 Job B"` | `0 0 * * *` |
| 3 (agent-father) | prompt contains `agent-father/flow/main.md` | `23 14 * * *` |
| 4 (claude-manager-helper) | prompt contains `claude-manager-helper/flow/main.md` | `30 19 * * 1,4` |
| 5 (code-janitor) | prompt contains `code-janitor/flow/main.md` | `0 */6 * * *` |
| 6 (market-db-journal-guard) | prompt contains `verify-market-db-journal-mode.sh` | `*/15 * * * *` |

**Job1/Job2 identity anchor fix (§2):** both jobs' `prompt` is byte-identical by design (both
contain `db-integrity-probe.sh`) — that substring cannot disambiguate them, and the OLD guard only
told them apart via `cron_expression`, exactly the field that can be stale. Switched to
`description`, which already carries a unique, cadence-independent per-job token: `"CADRAT-2 Job A"`
(Job1) vs `"CADRAT-2 Job B"` (Job2) — confirmed live in `register-job-db-integrity-{weekday,offhours}.md`.

Per job: no identity match → missing → CronCreate (read `register.md` Step 2, this job only).
Identity match + value match → present-and-correct, no-op. Identity match + value mismatch →
present-but-WRONG → `CronDelete(id=<found_id>)` THEN CronCreate the canonical entry (read
`register.md` Step 2, this job only) — replace in place, never add a 2nd copy.

**If ALL 6 present-and-correct → STOP. Log:**
`[cron-standalone-team] All 6 crons already registered. No-op.`

If any subset is missing-or-stale → read `.claude/skills/cron-standalone-team/register.md` and
execute its Step 2 for ONLY those entries (after any required `CronDelete` per the table above).

---

## Step 3 — Verify

```
CronList
```

Confirm all 6 entries now appear. Log:
`[cron-standalone-team] Verified — standalone crons live. Jobs: <id1>, <id2>, <id3>, <id4>, <id5>, <id6>.`

If any entry still missing after CronCreate reported success → log WARN +
`send_telegram(channel="bug", "[cron-standalone-team] WARN: CronCreate success but entry absent in CronList: <job>")`.

---

## Manage — CronList / CronDelete

```
CronList
```

```
CronDelete(id="<cron-id-from-CronList>")
```

Only delete a standalone-team entry with explicit user intent — each of these 5 crons is a
distinct, independent maintenance sweep (DB anomaly detection, agent-registry orphan sweep,
repo drift heal, code/doc DRY-hygiene, market.db WAL re-arm detection); deleting one silences
only that sweep, not the others.

---

## Notes

- **Fire-election / period-key locks:** explicitly OUT of scope for this skill (per the owning
  architecture brief §8 item 4) — none of these 5 crons has a multi-session collision history,
  unlike dev-team/cowork-team's `*/N`-interval fire-time election. `market-db-journal-guard`
  (Job 6) shares the same `*/N`-interval cadence SHAPE as dev-team/cowork-team, but its own
  read-only-probe-then-alert action is idempotent under a duplicate concurrent fire (worst case:
  two identical BUG-channel alerts on the same tick, never a correctness defect) — so it does not
  need the fire-election machinery either. If a collision incident is ever observed on any of
  these 5, that is a separate, lower-priority follow-up, not a reason to widen this skill today.
- **`durable: true`** makes each cron persist across CLI process restarts within the same
  session. It does NOT survive session-end (CLI exit / restart) — that is why this skill exists.
- **SSOT divergence discipline:** `register.md`'s Job 1-6 `CronCreate` calls are ported VERBATIM
  from each cron's own `.claude/commands/crons/cron-*.md` authoring doc — if a cadence or prompt
  ever changes there, re-sync `register.md` in the SAME commit. Hand-porting without re-syncing
  is the documented mechanism that spreads drift across artifacts (see `cron-detect-loop/
  register.md`'s own SSOT note for the prior, now-accepted, divergence this skill does NOT
  repeat — db-data-integrity/agent-father/claude-manager-helper/code-janitor/
  market-db-journal-guard all stay byte-identical between their authoring doc and this skill's
  register.md, by design).
- **`.claude/skills/cron-detect-loop/SKILL.md` and `register.md` are NOT modified by this skill**
  — that is the whole point of the extend-vs-new-skill PO decision above.
