---
name: cron-standalone-team
description: >
  Session-start hook. Idempotently registers the 5 CronCreate entries for the
  4 standalone crons that sit outside the cowork-team/dev-team/system-auditor
  loops: db-data-integrity (2 entries, post-CADRAT-2 schedule split),
  agent-father, claude-manager-helper, code-janitor. Invoke after every
  Claude Code CLI session restart. Second invocation is a no-op.
---

# cron-standalone-team — Standalone Crons Re-Arm Skill

**Trigger:** `/cron-standalone-team`
**Purpose:** Re-arm 5 session-scoped `CronCreate` entries covering the 4 standalone crons that
had **zero** automated re-arm coverage before this skill (confirmed by grep — neither
`cron-cowork-team` nor `cron-detect-loop` names any of them):
`.claude/commands/crons/cron-db-data-integrity.md` (2 entries post-CADRAT-2 split),
`cron-agent-father.md`, `cron-claude-manager-helper.md`, `cron-code-janitor.md`.

**Why a NEW skill, not an extension of `cron-detect-loop`** (PO decision,
`docs/architecture-briefs/2026-08-04-cadence-rationalization.md` §8 item 4): these 4 crons
share no dispatch-loop relationship with dev-team/system-auditor Tier-1/2/3 the way
`cron-detect-loop`'s name implies, AND `cron-detect-loop/SKILL.md`'s own size-justification
requires its Step-1 idempotency guard to stay a 4-condition hot path (~46-48 of 48 dev-team
ticks/day) that never loads `register.md` — doubling it to 8 conditions for 4 unrelated crons
would tax that hot path 48x/day for zero benefit to the loop it actually guards. This skill
mirrors `cron-cowork-team`'s shape instead: single-purpose idempotency guard + N `CronCreate`
calls, no dispatch-loop logic.

**Detail (lazy-load — read ONLY when Step 1 finds a missing entry):** the 5 `CronCreate` prompt
bodies (Job 1-5) live in `.claude/skills/cron-standalone-team/register.md`. The common
all-5-registered path never needs that file.

---

## Step 1 — Idempotency guard

```
CronList
```

Scan output for existing entries. Check for ALL 5 of:
1. `cron_expression` = `15,45 2-9 * * 1-5` AND prompt contains `db-integrity-probe.sh`
2. `cron_expression` = `15 22 * * *`      AND prompt contains `db-integrity-probe.sh`
3. `cron_expression` = `23 14 * * *`      AND prompt contains `agent-father/flow/main.md`
4. `cron_expression` = `30 19 * * 1,4`    AND prompt contains `claude-manager-helper/flow/main.md`
5. `cron_expression` = `0 */6 * * *`      AND prompt contains `code-janitor/flow/main.md`

**If ALL 5 found → STOP. Log:**
`[cron-standalone-team] All 5 crons already registered. No-op.`

If any subset is missing → read `.claude/skills/cron-standalone-team/register.md` and execute
its Step 2 for ONLY the missing entries.

---

## Step 3 — Verify

```
CronList
```

Confirm all 5 entries now appear. Log:
`[cron-standalone-team] Verified — standalone crons live. Jobs: <id1>, <id2>, <id3>, <id4>, <id5>.`

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

Only delete a standalone-team entry with explicit user intent — each of these 4 crons is a
distinct, independent maintenance sweep (DB anomaly detection, agent-registry orphan sweep,
repo drift heal, code/doc DRY-hygiene); deleting one silences only that sweep, not the others.

---

## Notes

- **Fire-election / period-key locks:** explicitly OUT of scope for this skill (per the owning
  architecture brief §8 item 4) — none of these 4 crons has a multi-session collision history,
  unlike dev-team/cowork-team's `*/N`-interval fire-time election. If a collision incident is
  ever observed on one of these 4, that is a separate, lower-priority follow-up, not a reason to
  widen this skill today.
- **`durable: true`** makes each cron persist across CLI process restarts within the same
  session. It does NOT survive session-end (CLI exit / restart) — that is why this skill exists.
- **SSOT divergence discipline:** `register.md`'s Job 1-5 `CronCreate` calls are ported VERBATIM
  from each cron's own `.claude/commands/crons/cron-*.md` authoring doc — if a cadence or prompt
  ever changes there, re-sync `register.md` in the SAME commit. Hand-porting without re-syncing
  is the documented mechanism that spreads drift across artifacts (see `cron-detect-loop/
  register.md`'s own SSOT note for the prior, now-accepted, divergence this skill does NOT
  repeat — db-data-integrity/agent-father/claude-manager-helper/code-janitor all stay
  byte-identical between their authoring doc and this skill's register.md, by design).
- **`.claude/skills/cron-detect-loop/SKILL.md` and `register.md` are NOT modified by this skill**
  — that is the whole point of the extend-vs-new-skill PO decision above.
