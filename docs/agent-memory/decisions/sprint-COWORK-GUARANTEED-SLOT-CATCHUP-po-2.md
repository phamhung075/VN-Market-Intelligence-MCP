# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · po (continuation 2)

**Sprint goal:** Make cowork `guaranteed:true` an honored contract — bounded catch-up/look-back for missed slots, or correct the label.
**Agent:** po
**Started:** 2026-07-30T09:44:20Z
**Rolled from:** `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po.md` (625L > 600L cap, `### CAP-REACHED · 2026-07-30T04:57:52Z`). Per `.claude/skills/decision-journal/SKILL.md` § Cap Check the continuation filename is `sprint-<id>-<agent>-2.md`. Two sibling files written earlier today (`ruling-20260730T0906Z-po-triage-po.md`, `ruling-20260730T0921Z-sqlite-mechanism-po.md`) are off-contract names and, because `scripts/agents-flow/decision-journal-archive.sh` globs `sprint-*.md` only, are invisible to journal archival — logged as evidence on FIX-DECISION-JOURNAL-BYTECAP-NO-ACTUATOR, not re-fixed here.

---

### STEP po-S63 · po · 2026-07-30T09:44:20Z
**task-id:** FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE
**what-done:** DEFERRED the ctx-bloat prune on `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-architect.md` (46429B vs 36000B) and minted the actuator-side root-cause row instead.
**what-considered:**
- File a claude-manager-helper prune/split → rejected: sprint is live (4 READY + 5 BACKLOG tasks), file uncommitted-modified at triage, content load-bearing design rationale; splitting races the live editor.
- Defer until sprint close, per the standing playbook → rejected as a FALSE PREMISE once probed: the id is in neither `active_sprints[]` nor `closed_sprints[]`, so it can never close and the deferral can never expire.
- Fold into existing P2 FIX-DECISION-JOURNAL-BYTECAP-NO-ACTUATOR → partially: that row's premise covers only NON-sprint-scoped journals; extended its scope + raised P2→P1, but the third-state hole needed its own row.
**why-decision:** Resolving all 40 referenced sprint ids showed 34 dangling — so this is a fleet-wide registry gap (513 journals / 5.5MB unarchivable, largest 331592B = 9.2x cap), not one file's bloat. Dogfood: this very journal resolved to the same dangling id.
**why-change:** Marked supervised+plan_only against the usual preference for dispatchable rows, because a dry-run proved the obvious fix (fail-loud referential check in `orch-validate.mjs`) would reject EVERY board write today. Reconcile must precede gate-arm; that sequencing is a design call.

### STEP po-S64 · po · 2026-07-30T09:44:20Z
**task-id:** FIX-NOTEBOOK-DUPHEADING-DETECTOR-NO-DEDUP-NO-ACTUATOR
**what-done:** Minted one FIX for the `## Prior cycles` duplicate in `unified-agent.md`, covering emitter dedup + a repair path + the upstream anchor-uniqueness gap.
**what-considered:**
- Treat as hook re-fire noise only → rejected: lines 51/53 are a real, unrepaired corruption with an orphaned footer at 55.
- Treat as a duplicate of FIX-NOTEBOOK-AUTOPRUNE-SAMEDAY-TIE-DROPS-NEWEST (minted 09:18Z, same file) → rejected: that is a drop-loop selection-order bug; this is dedup + missing actuator. Same file, different mechanisms.
- Prune the notebook to cap → rejected: file is 100L/11996B, already under BOTH caps, so cap pressure is not the mechanism and a trim would erase the evidence.
**why-decision:** Six identical signals today (05:25:51Z→09:01:31Z), not the three the drain forwarded, so the condition is persistent AND the emitter has no dedup — it burned 3 of 7 signal slots this tick. All three governance layers are blind at once: emitter has no state, actuator was never built (detection-only by design), and the pre-commit immutability gate skips un-dated rolling headings by scope.
**why-change:** Overturned the script's deliberate "detection-only" choice for ONE signature only — two adjacent identical `## ` headings with blank-only between them contain zero content by construction, so deleting the first is provably lossless and cannot be the "legitimately-repeated content" that comment protects. Every other duplicate shape keeps current behaviour.

### STEP po-S65 · po · 2026-07-30T09:44:20Z
**task-id:** FIX-ALERT-COMMANDER-NO-BASH-GRANT-NOTEBOOK-UNCOMMITTABLE
**what-done:** Escalated the existing row P2→P1 with new evidence; returned it as UNBLOCK rather than minting anything new.
**what-considered:**
- Mint a new row for the task_claim rejection → rejected: same root cause (no Bash → no session id), so it belongs as scope on the existing row.
- Set supervised=true to signal caution → rejected: `supervised` alone is strictly the worst pairing (buys BOUNDED-1 exclusion, does not buy the SLS lane).
- Set supervised+plan_only to guarantee a lane → rejected: the fix is a known one-line tools-grant edit; quarantining it to planning adds a hop for nothing.
**why-decision:** Two reports corroborate on different planes — notebook commits dead 6 cycles (was 3), and a CRITICAL alert fired with NO published-marker tombstone because `task_claim` requires `owner_client_session`. That promotes it from memory hygiene to a live duplicate-publish exposure. RAW-verified structural, not self-reported: `.claude/agents/alert-commander.md:5` has no Bash.
**why-change:** No change from plan; left the flags untouched on purpose and recorded the measured strand (BOUNDED1=false, SLS=false) in the row so the next tick sees why it needs deliberate dispatch.
