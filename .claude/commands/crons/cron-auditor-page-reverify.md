Create system-auditor's D-PAGE (Tier-5) cron with CronCreate.

**NOT YET ARMED.** This file documents the cron so the router can register it later via
`CronCreate` — agent-father authors the spec, never arms it. Do NOT call `CronCreate` from
this doc. Do NOT add to any live cron config as part of authoring this file.

**Session-only, must be re-armed after every session restart.** Crons registered via
`CronCreate` in this environment do not survive a session restart on their own — whoever
arms this must re-check the Prerequisite block below at ARM TIME (not just once, historically),
since a restart can land between this doc's authoring and the actual `CronCreate` call.

---

## Tier-5 — Quality-Audit Freshness Rotation (daily 03:30 UTC = 10:30 VN)

> ⚠️ **CronCreate fires at MACHINE-LOCAL time (France), NOT UTC** — same class of defect this
> exact dimension exists to catch (data-freshness checks are market-hours-blind if fired at
> the wrong hour). Host = France (CEST=UTC+2 summer / CET=UTC+1 winter); VN is fixed UTC+7.
> Target 03:30 UTC = 10:30 VN (mid-morning trading, inside the 09:00–15:30 VN session — the
> ORIGINAL, still-correct intent). A naive `30 3 * * *` literal fires 03:30 FRANCE-LOCAL, i.e.
> (current season, CEST) 01:30 UTC = 08:30 VN — 30min BEFORE market open, not 90min after as
> intended (CET season: 02:30 UTC = 09:30 VN — still wrong, still before the intended target
> hour). Caught before arming (2026-07-25 coordinator review) and fixed below.

**Dimension:** D-PAGE — see `docs/agents/system-auditor/audit-dimensions.md` §D-PAGE and
handler `docs/agents/system-auditor/flow/page-freshness.md`.

Rotating, partitioned re-verification of `docs/data/quality-checklist.json`'s Data
Freshness/SLA checks (74 at authoring time, `cksum(check_id) mod 7` partition — one weekday
each, 7-day full-coverage window) plus `docs/data/frontend-data-coverage-map.json` page
rows (`cksum(page) mod 7`). Detect-only: BOTH source files stay fully read-only — never
writes `quality-checklist.json` (qa remains sole writer) or the coverage map (an earlier
design stamped `verified_at` onto the map directly and self-triggered qa's mtime-based
re-sync check; confirmation-recency now lives only in this dimension's own
`docs/data/auditor-page-reverify-ledger.json`). Findings route through the existing
`data_stale`/`system_issue` → `anomaly-task-bridge` → PO pipeline, unchanged — including a
new scoped trigger in `docs/agents/qa/flow/quality-audit.md` so a D-PAGE finding actually
reaches a qa re-sync.

- **cron**: `30 5 * * *` (summer/CEST: 05:30 local = 03:30 UTC = 10:30 VN. Winter/CET: `30 4 * * *` — same 03:30 UTC = 10:30 VN target, switch at DST changeover)
- **recurring**: true
- **durable**: true
- **prompt**:
  ```
  Launch subagent (subagent_type=system-auditor). Read and execute docs/agents/system-auditor/flow/main.md
  AUDIT_TIER=5
  MCP: https://zenmidi.com/vn-market/mcp
  ```

**Offset rationale (revised — do not trust the sibling absolute-time claims at face value):**
`docs/agents/system-auditor/flow/main.md` computes this dimension's own `FIRE_TICK` as a
hardcoded `03:30Z` literal — that part is trustworthy regardless of scheduler mechanics,
because it's UTC-native code, not a cron expression. The cron expression above independently
achieves that real 03:30 UTC fire time via the CEST/CET conversion. Tier-3's cron
(`cron-system-auditor.md`, `0 2 * * *`, labeled "daily 02:00 UTC") and the D4/D-N `03:00Z`
label derived from it carry **no MACHINE-LOCAL disclaimer** and almost certainly exhibit the
same defect this file just fixed — `0 2 * * *` most likely fires ~00:00 UTC (CEST) / ~01:00
UTC (CET), not the stated 02:00 UTC, since D4/D-N run inside the same Tier-3 process rather
than on their own cron. That means the *relative* spacing this dimension was originally
justified on ("90min after Tier-3, 30min after D4/D-N") is NOT a claim this file can verify —
it reasons across two different, unverified time frames. What IS verified: this dimension's
own 03:30 UTC / 10:30 VN fire time, independent of whether Tier-3 actually fires when it says
it does. Fixing `cron-system-auditor.md` is a separate, not-yet-filed issue — out of scope
here (that cron is already live-armed; this file only documents its own).

**Prerequisite before arming:** confirm (1) `.claude/agents/system-auditor.md` frontmatter
write-contract lists `docs/data/auditor-page-reverify-ledger.json` and explicitly states
BOTH `quality-checklist.json` and `frontend-data-coverage-map.json` are read-only; (2)
`docs/agents/qa/flow/quality-audit.md` Trigger includes the D-PAGE signal-based trigger
(`PG-DRIFT`/`PG-STALE`/`PG-MAP-SELF` dedup suffixes) — otherwise a D-PAGE finding never
reaches a re-sync and capability #2 of the original demand stays unclosed; (3) the cron
expression above matches the CURRENT season (CEST `30 5 * * *` roughly late-Mar–late-Oct,
else CET `30 4 * * *`) — re-check at arm time, not from this doc's authoring date. All landed
in coordination_session=93587c5d-9135-42df-a0e7-170d0f8358b2 (2026-07-25, incl. two same-day
coordinator-review revisions). If any is not live/current, arming this cron either produces a
runtime refusal that reads as a false "limitation", ships a detector nothing consumes, or
fires at the wrong hour relative to VN market open.

## Manage
`CronList` | `CronDelete <id>`
