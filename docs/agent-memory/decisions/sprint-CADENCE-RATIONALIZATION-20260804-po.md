# Decision Journal — Sprint CADENCE-RATIONALIZATION-20260804 · po

**Sprint goal:** Implement the user-greenlit subset of docs/architecture-briefs/2026-08-04-cadence-rationalization.md (§8 items 1-7 minus 8/9, plus §9 rows 13 and 4). Fleet stays dormant — no re-arm.
**Agent:** po
**Started:** 2026-08-04T19:49:43Z

---

### STEP po-S1 · po · 2026-08-04T19:52:23Z
**task-id:** CADRAT-1..7 (batch mint)
**what-done:** Minted 7 READY rows from the brief's 9 greenlit items after verifying every named file/line against the live tree.
**what-considered:**
- 9 rows, one per greenlit item — 1:1 traceability
- 7 rows, folding item2+§9row13 and item3+item5
**why-decision:** Item 2 and §9 row 13 both edit `.claude/commands/crons/cron-db-data-integrity.md`; two rows = a file-contention race for zero traceability gain. Items 3 and 5 are the identical diff-gate pattern and the brief itself says batch them.
**why-change:** Parent asked for TASK_NNN ids; live board convention is descriptive kebab ids. Used `CADRAT-*` so the batch stays greppable as one unit.

### STEP po-S2 · po · 2026-08-04T19:52:23Z
**task-id:** CADRAT-4-CRON-STANDALONE-TEAM-REARM-SKILL
**what-done:** Resolved the brief's open sub-decision (§8 item 4): NEW `cron-standalone-team` skill, not a widened `cron-detect-loop`.
**what-considered:**
- Extend cron-detect-loop — fastest, reuses the existing idempotency-guard shape
- New lightweight skill mirroring cron-cowork-team
**why-decision:** `cron-detect-loop/SKILL.md:14-17` carries an explicit size-justification that its hot path (~46-48 of 48 dev-team ticks/day) must never load register.md. Going 4→8 CronList conditions taxes that hot path 48x/day for 4 crons outside the loop — a documented-rationale regression, on top of the naming-accuracy smell the brief already flagged.
**why-change:** Brief expressed no preference; PO picked rather than deferring.

### STEP po-S3 · po · 2026-08-04T19:53:00Z
**task-id:** CADRAT-1-ALERT-COMMANDER-CADENCE-POLICY-ROWS
**what-done:** Found live backlog row FIX-COWORK-CADENCE-DANGLING-POLICY-ID specifying a CONTRADICTORY value set for the same file; attached a supersede/reconcile note instead of minting blind.
**what-considered:**
- Mint CADRAT-1 as-is and let whoever lands second win
- Attach a reconcile note pinning which spec governs and what survives
**why-decision:** Both rows author alert-commander rows into cadence-policy.json — the old row demands `interval_minutes:15/240`, the brief demands `null + _cron_fallback:true`. Silent overwrite either way. The brief's spec wins because 15/240 ships an unmeasured 16x cadence change into a dormant, unobservable fleet.
**why-change:** No change to plan — this is the mandatory prior-art check catching a real collision.

### STEP po-S4 · po · 2026-08-04T19:53:00Z
**task-id:** CADRAT-1..7 (batch-wide constraint)
**what-done:** Embedded the NO-RE-ARM constraint verbatim in all 7 rows' `note`, plus a dedicated hard AC on CADRAT-2 (AC-10) and CADRAT-4 (AC-6/AC-7).
**what-considered:**
- State it once in the sprint goal
- Repeat per-row + make it a gradeable AC
**why-decision:** CADRAT-4's deliverable is literally a file full of CronCreate calls. A sprint-level note is not read by a row-scoped implementer; an AC that must be signed off is. Precedent: `feedback_chef_dryrun_publishes` — an agent authoring a publish path executed it "to verify".
**why-change:** no change from plan.
