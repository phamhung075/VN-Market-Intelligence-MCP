# cron-standalone-team — Register (lazy-load detail)

Loaded from `.claude/skills/cron-standalone-team/SKILL.md` Step 1 ONLY when at least one of the
5 entries is missing — typically once per session restart.

**SSOT:** each `CronCreate` call below is ported VERBATIM from that cron's own
`.claude/commands/crons/cron-*.md` authoring doc. If a cadence or prompt ever changes in an
authoring doc, re-sync the matching Job below in the SAME commit.

---

## Step 2 — Register missing crons

Only execute `CronCreate` for entries NOT found in Step 1.

**Job 1 — db-data-integrity, weekday session+settlement window**

See `.claude/skills/cron-standalone-team/register-job-db-integrity-weekday.md` for full `CronCreate` definition.
CADRAT-2 (2026-08-04): schedule-split + `db-integrity-probe.sh`-gated prompt. If CADRAT-2 has
not landed yet, this row BLOCKS.

**Job 2 — db-data-integrity, daily off-hours backstop**

See `.claude/skills/cron-standalone-team/register-job-db-integrity-offhours.md` for full `CronCreate` definition.
Same prompt as Job 1 (byte-identical) — only the cron expression differs.

**Job 3 — agent-father, daily orphan+roster sweep**

See `.claude/skills/cron-standalone-team/register-job-agent-father.md` for full `CronCreate` definition.

**Job 4 — claude-manager-helper, Mon+Thu repo drift heal**

See `.claude/skills/cron-standalone-team/register-job-claude-manager-helper.md` for full `CronCreate` definition.
⚠️ CronCreate fires at MACHINE-LOCAL time (France), NOT UTC — see authoring doc's DST note.

**Job 5 — code-janitor, every 6h DRY-hygiene sweep**

See `.claude/skills/cron-standalone-team/register-job-code-janitor.md` for full `CronCreate` definition.

**Job 6 — market-db-journal-guard, every-15-min WAL re-arm runtime detector**

See `.claude/skills/cron-standalone-team/register-job-market-db-journal-guard.md` for full
`CronCreate` definition. AC-1 of `FIX-MARKETDB-JOURNALMODE-GUARD-SHIPPED-BUT-NEVER-ARMED`
(2026-08-06) — no subagent spawn, prompt runs the probe script directly and branches on exit code.

---

## Execution

On each success: log `[cron-standalone-team] Registered <job-name> (id=<id>).`

On each failure: log error verbatim +
`send_telegram(channel="bug", "[cron-standalone-team] CronCreate FAILED for <job-name>: <error>")`.
Do NOT retry. Continue with remaining jobs.

---

## Why a NEW skill, not an extension of `cron-detect-loop`

PO decision, `docs/architecture-briefs/2026-08-04-cadence-rationalization.md` §8 item 4: these
crons share no dispatch-loop relationship with dev-team/system-auditor Tier-1/2/3 the way
`cron-detect-loop`'s name implies, AND `cron-detect-loop/SKILL.md`'s own size-justification
requires its Step-1 idempotency guard to stay a 4-condition hot path (~46-48 of 48 dev-team
ticks/day) that never loads `register.md` — doubling it to 8+ conditions for these unrelated
crons would tax that hot path 48x/day for zero benefit to the loop it actually guards. This skill
mirrors `cron-cowork-team`'s shape instead: single-purpose idempotency guard + N `CronCreate`
calls, no dispatch-loop logic.

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
- **SSOT divergence discipline:** Job 1-6 `CronCreate` calls (§ Step 2 above) are ported VERBATIM
  from each cron's own `.claude/commands/crons/cron-*.md` authoring doc — if a cadence or prompt
  ever changes there, re-sync here in the SAME commit. Hand-porting without re-syncing is the
  documented mechanism that spreads drift across artifacts (see `cron-detect-loop/register.md`'s
  own SSOT note for the prior, now-accepted, divergence this skill does NOT repeat —
  db-data-integrity/agent-father/claude-manager-helper/code-janitor/market-db-journal-guard all
  stay byte-identical between their authoring doc and this register, by design).
- **`.claude/skills/cron-detect-loop/SKILL.md` and `register.md` are NOT modified by this skill**
  — that is the whole point of the extend-vs-new-skill PO decision above.
