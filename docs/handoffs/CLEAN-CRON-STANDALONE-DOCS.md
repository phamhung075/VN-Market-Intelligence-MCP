---
sprint: CLEAN-CRON-STANDALONE-DOCS-SUPERSEDED-BY-COWORK
branch: clean/cron-standalone-deprecation
size: S
zone: cross-service/
depends_on: []
blocks: []
---

## TLDR
Mark 4 standalone cron authoring docs DEPRECATED using the pattern from `cron-fb-market-poster.md`. Each file documents a CronCreate registration for agents that are exclusively dispatched through cowork-schedule.json. None are registered in any of the 3 sanctioned re-arm skills; they are structurally orphaned specs that mislead cadence audits.

## [PM] Planning Context

### Zone
**Zone:** `cross-service/` — this task involves cross-service documentation and does not fall into any dev-* specialist zone.

### Acceptance Criteria

**AC-1** Mark all FOUR files DEPRECATED using the pattern from `cron-fb-market-poster.md` (deprecated 2026-06-28):
- Header: `# <cron-name> Cron — DEPRECATED`
- Blockquote note with deprecation statement
- Explicit pointer to the live cowork-schedule.json slot(s) that supersede it
- The `/cron-cowork-team` re-arm path

Example from cron-fb-market-poster.md (lines 1-10):
```markdown
# fb-market-poster Cron — DEPRECATED

> **DEPRECATED as of 2026-06-28 (sprint FB-COWORK-FOLD / TASK_1996-1999).**
> Do NOT re-arm standalone `CronCreate` crons for the fb-market-poster.
> Scheduling is now owned by the cowork team dispatcher.
>
> **Re-arm path:** `/cron-cowork-team`
```

**AC-2** Each deprecation notice must name its superseding cowork slot(s) EXACTLY:
- `cron-tran-ngoc-bau.md` → slot `tnb-audit` (cron: `13 20 * * *`, 20:13 UTC = 03:13 VN next day)
- `cron-digest-predict.md` → slots `digest-daily` AND `digest-sunday` (note: the old doc only documented Sunday leg; say it is factually incomplete as well as redundant)
- `cron-refine-bctc.md` → slots `refine-bctc-slot-1` through `refine-bctc-slot-4` (four parallel off-market slots)
- `cron-unified-agent.md` → cowork `chef-*` slots (`chef-morning`, `chef-intraday`, `chef-eod`, `chef-evening`)

**AC-3** `cron-unified-agent.md` carries an additional P0-DELETE-ON-SIGHT note:
- This cron is **dead by construction**, not merely redundant
- The file declares cron `29 * * * *` (every hour at :29 minutes)
- The dispatcher in `docs/agents/unified-agent/flow/main.md` (lines 11-14) matches windows: `:23`, `:13-08:13` (range), `:37` only
- Minute `:29` matches NONE of these (main.md line 23 explicitly documents "Any other time -> EXIT")
- Result: if armed, this would spawn 24 real subagent sessions per day for provably zero possible output
- Flag: P0-DELETE-ON-SIGHT if ever found armed again in a future CronList audit

**AC-4** SCOPE FENCE — do NOT touch:
- `.claude/commands/crons/cron-market-watcher.md` or `cron-news-scout.md`
- `docs/agents/market-watcher/flow/main.md`
- Both are HOLD per user greenlight (see HOLD-CRON-MARKETWATCHER-NEWSSCOUT-MARKETHOURS-MODES-PRODUCT-DECISION)
- Touching either is a SCOPE VIOLATION; QA will reject

**AC-5** This task is **plain-markdown doc edits ONLY**. ZERO scheduler-tool calls:
- No `CronCreate`, `CronDelete`, `CronList` calls
- No invocation of `/cron-cowork-team`, `/cron-detect-loop`, `/cron-standalone-team`, or any `crons:cron-*` skill
- These files are authoring docs; editing them arms nothing
- QA must grep-confirm zero such calls were made

**AC-6** Confirm by grep that none of the 3 re-arm skills reference the 4 files:
- `.claude/skills/cron-cowork-team/SKILL.md`
- `.claude/skills/cron-detect-loop/SKILL.md`
- `.claude/skills/cron-standalone-team/SKILL.md`
- If any reference IS found, STOP and escalate to PO

**AC-7** COMMIT-ZONE BACKSTOP (closes feedback_commit_zone_excluded_agent_ships_board_stays_stale):
- `.claude/commands/` is NOT in agent-father's declared `commit_zone.allowed` (docs/agents/agent-father/init.md:63)
- Yet agent-father DID successfully commit this file class in commit 36e109170 (2h ago)
- Developer does NOT have an explicit `commit_zone` declaration
- Implementer MUST land a real commit touching all 4 files and record its SHA on the orch-state task row
- Do NOT leave edits uncommitted and self-report DONE
- If developer cannot commit `.claude/commands/` paths, escalate to agent-father (the proven-working actuator per 36e109170) rather than guessing

### Files to Read First
- `.claude/commands/crons/cron-fb-market-poster.md` (template for deprecation pattern)
- `docs/data/cowork-schedule.json` (to verify slot names and schedules)
- `docs/agents/unified-agent/flow/main.md` (lines 11-23, to verify the :29 minute never matches)

### Files to Modify
- `.claude/commands/crons/cron-tran-ngoc-bau.md` — add DEPRECATED header + blockquote + slot reference
- `.claude/commands/crons/cron-digest-predict.md` — add DEPRECATED header + blockquote + slot reference (dual slots)
- `.claude/commands/crons/cron-refine-bctc.md` — add DEPRECATED header + blockquote + slot reference (quad slots)
- `.claude/commands/crons/cron-unified-agent.md` — add DEPRECATED header + blockquote + P0-DELETE-ON-SIGHT note + slot reference

### Files to Create
None — this is doc-edit only.

### Dependencies
None — this is a standalone cleanup task.

### Knowledge Needed
- `docs/policies/commit-convention.md` (commit hygiene)
- `docs/data/cowork-schedule.json` (slot registry and naming)
- `.claude/commands/crons/cron-fb-market-poster.md` (deprecation pattern template)

### Root Cause (Context from PO)
Six standalone cron authoring docs describe CronCreate registrations for agents that are ALSO — and in practice, only — dispatched through cowork-schedule.json. None of the 3 sanctioned re-arm skills (cron-cowork-team, cron-detect-loop, cron-standalone-team) registers any of them, so even a manual arm evaporates on the next session restart with no recovery path. They are structurally orphaned specs that read as live and mislead every future cadence audit.

Evidence from AC-3: `.claude/commands/crons/cron-unified-agent.md` declares `29 * * * *` while `docs/agents/unified-agent/flow/main.md:11-14` lists only `:23/:13-08:13/:37` dispatch windows. Minute `:29` matches NONE — this cron is dead by construction.

### Why This Matters
Without deprecation markers, the next cadence audit (and every future audit) will:
1. Re-discover these files as active cron registrations
2. Wonder why they're not in the re-arm skills
3. Waste time investigating a resolved issue
4. Risk incorrect remediation (e.g., manually re-arming a dead cron)

Marking them DEPRECATED forecloses all re-discovery cycles and is the only permanent fix.

---

## Handoff Notes for Implementer

### Commit Zone Constraint (AC-7)
`.claude/commands/` is not in any declared `commit_zone.allowed` list (neither developer nor agent-father). Yet a recent commit 36e109170 (2h ago) successfully touched this path. Options:

1. **If you can commit:** Proceed. Land all 4 files in one commit. Record the SHA on the orch-state row.
2. **If you cannot commit to `.claude/commands/`:** Escalate to agent-father (the proven actuator per 36e109170) with your edited files. Do NOT leave edits uncommitted.

### Deprecation Pattern (AC-1)
Copy structure from `cron-fb-market-poster.md` lines 1-10. The pattern is:
```markdown
# <name> Cron — DEPRECATED

> **DEPRECATED as of <date> (sprint <name>).**
> Do NOT re-arm standalone `CronCreate` crons for <agent>.
> Scheduling is now owned by the cowork team dispatcher.
>
> **Re-arm path:** `/cron-cowork-team`
> This re-arms the `*/15` cowork master dispatcher, which picks up the
> `<slot>` slots in `docs/data/cowork-schedule.json` automatically.
> There is nothing else to do.
```

Then list the cowork slots in a table or bullet format with their UTC/VN times.

### Scope Fence (AC-4)
You will see `cron-market-watcher.md` and `cron-news-scout.md` in the same directory. **DO NOT TOUCH THEM.** They are in a separate HOLD row waiting for a product decision. Touching them is a scope violation.

---

## Testing / Verification (QA Gate)

QA must verify:
1. All 4 deprecation notices exist and name correct superseding cowork slots per AC-2
2. Grep confirms ZERO `CronCreate`, `CronDelete`, `CronList` calls and zero `/cron-*` skill invocations
3. Verify `cron-market-watcher.md`, `cron-news-scout.md`, and `docs/agents/market-watcher/flow/main.md` are byte-identical to pre-task state (AC-4 scope fence)
4. Verify commit SHA on orch-state row actually contains all 4 files (AC-7 constraint)

---

## Routing After Implementation

When this task is DONE:
- Move row from `task_board.ready[]` → `task_board.review[]`
- Set `status: "REVIEW"` on the orch-state row
- Route to QA for verification
