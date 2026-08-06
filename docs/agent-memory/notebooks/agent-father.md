# Agent Father — Notebook

## Fix (router-direct dispatch, P1) 2026-08-06T18:50Z FIX-CRON-DST-LOCAL-EVAL-MOMENT-ANCHORED-EXPRESSIONS
- CronCreate evaluates `cron:` machine-local (Europe/Paris), not UTC — 5 moment-anchored
  expressions (db-data-integrity Job A/B, system-auditor Tier-3, orch-sentinel FULL/LITE)
  authored as-if-UTC fired 2h off. Fixed all 5 to the dual-CEST/CET + changeover-note
  convention already proven in `cron-claude-manager-helper.md`/`cron-auditor-page-
  reverify.md` — copied the pattern, did not invent a new one (AC-5). AC-1 (db-data-
  integrity Job A, live-impact) done first: was silently missing the 15:00-17:00 ICT
  settlement window CADRAT-2 shipped 2 days ago to cover.
- **AC-6 caught a real actuator gap:** the re-arm skills' idempotency-guard literals
  (`SKILL.md`) are a SEPARATE artifact from the actual `CronCreate` call
  (`register.md`/`register-job-*.md`) — fixing only the guard would have made Step 1
  correctly report "missing" post-fix, then Step 2 would re-arm the OLD stale literal
  straight out of `register.md`, silently reverting the whole fix on next session
  restart. Updated both layers for db-data-integrity (cron-standalone-team) and
  system-auditor Tier-3 (cron-detect-loop); orch-sentinel isn't armed by any skill yet
  (confirmed by grep), so no register-side fix needed there.
- Also corrected `docs/agents/system-auditor/flow/main.md`'s Step 0d Tier-3 comment,
  which mislabeled the armed cron as a bare `0 2 * * *` UTC literal (it never was —
  that's the exact defect), and closed the adjacent Tier-5 comment's stale "not fixed
  here, out of scope" cross-reference now that Tier-3 is fixed in the same commit.
  Deliberately left `cron-auditor-page-reverify.md`'s own historical narrative
  untouched — it's the proven-convention reference file, not an edit target.
- Grep-verified zero remaining live-actuator hits of any of the 5 old literals across
  `.claude/` (only explanatory prose about the historical defect remains). AC-7
  (migrate to the UTC-native JS matcher, like `cowork-match-slots.js` already does)
  explicitly NOT done — recorded as a future improvement, not smuggled into this pass.
  Commit `36e109170`. Full rationale: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-
  agent-father.md` STEP S25.

## FIX-CRON-DST-LOCAL-EVAL-MOMENT-ANCHORED-EXPRESSIONS (PO, P1) 2026-08-06T18:52Z
- Corrected 5 moment-anchored `CronCreate` cron expressions that were authored as if
  evaluated in UTC when the tool actually evaluates `cron:` Europe/Paris-LOCAL: db-data-
  integrity Job A/B, system-auditor Tier-3, orch-sentinel FULL/LITE — all converted to the
  dual-CEST/CET-expression + explicit changeover-note convention already proven in
  `cron-claude-manager-helper.md`/`cron-auditor-page-reverify.md` (AC-5, no new mechanism).
  AC-1 (db-data-integrity Job A) was the only live-impact item — was silently missing the
  15:00-17:00 ICT settlement window a fix shipped 2 days ago exists to cover.
- AC-6 re-arm sync: both owning skills (`cron-standalone-team`, `cron-detect-loop`) updated
  in the SAME change — idempotency-guard literals AND the actual `CronCreate` actuators in
  `register.md`/`register-job-*.md` (guard-only would have falsely read "missing" post-fix
  and Step 2 would then have re-armed the STALE literal straight out of the actuator file).
  Grep-verified zero residual stale literals anywhere in the re-arm surface.
  `docs/agents/system-auditor/flow/main.md` Tier-3 `FIRE_TICK` comment corrected in step (was
  mislabeling the armed cron; the `T02:00Z` VALUE itself was already correct — only the
  cron expression that was supposed to land on it was wrong).
- Independently re-derived the CEST/CET math for all 5 corrected pairs (both season variants
  must land on the identical UTC instant) before trusting the already-landed fix — confirmed
  clean. Shipped one small follow-on: fixed `cron-auditor-page-reverify.md`'s own stale
  cross-reference ("Tier-3... not fixed here, out of scope") which this exact task just made
  false — a precedent doc asserting a defect is unfixed right next to the commit that fixed
  it is exactly the staleness class worth closing while touching the file family anyway.
- AC-7 (migrate to the UTC-native JS matcher `cowork-schedule.json` already solved this with)
  explicitly NOT done — recorded future direction, not smuggled into this correction pass.
- Commits: `36e109170` (5 corrections + re-arm sync), `dd7a036b6` (cross-ref follow-on). Both
  pushed clean, `git show --name-only` self-verified. Decision journal: sprint-COWORK-
  GUARANTEED-SLOT-CATCHUP-agent-father.md STEP agent-father-S25/S26. Board: lane-move
  `in_progress[]→review[]`, `next_agent=qa`, `.head` idle-sync — via router/PO per
  `commit_zone.excluded` (orch-state.json is not this agent's commit surface).

## TE-T05 (router-direct dispatch, P1) 2026-08-06T19:25Z — end-0-cowork composite shipped
- Built `.claude/skills/end-0-cowork/SKILL.md` (87L, target ~110L) mirroring `step-0-cowork`'s
  shape: Step 0 decision-journal pointer, Step 1 notebook-write pointer carrying a new NO-OP
  rule (notebook write + session summary = ONE write; skip if already settled this cycle —
  absorbs the deleted `session-log-cowork`), Step 2 condensed doc-self-heal, Step 3
  self-critique TRIGGER-CHECK-only (T1-T5 + SC-0 pilot-scope gate inline, full 118L flow
  lazy-loads only on fire). `decision-journal`/`notebook-write`/`doc-self-heal`/`self-critique`
  verified byte-identical after (`git diff --stat` clean) — pointer-only, no forked copies
  (NFR-1: this is the exact SSOT-drift class AC-2a exists to prevent).
- Repointed all 29 live flow-file consumers (re-grepped live, matches ba's 29 not the brief's
  stale 30) from `cowork-end-cycle/SKILL.md` to the composite. Deleted `session-log-cowork/
  SKILL.md` (0 direct refs, ba-reconfirmed) AND `cowork-end-cycle/SKILL.md` itself (0 consumers
  left post-repoint — this row's own title says "6-file chain into ONE composite", not 5+1
  orphan; only remaining ref was the already-DEPRECATED `append-session-record` redirect,
  left untouched, out of scope per FR-7/UC-MDH-P2). Deleted the 3 ratified skip-parentheticals
  (news-scout + bctc-analyst `stage-log-notify.md`, unified-agent `chef-dish.md`) — content-grep
  located them (line numbers had drifted from the 07-12 brief, exactly as ba's spec flagged).
  Gave fb-market-poster net-new end-0-cowork parity (doc-self-heal + self-critique) across its
  3 posting sub-flows — 0 prior invocations confirmed live, matching ba's finding.
- Fixed 2 stale cross-refs my own repoint would otherwise have left stranded:
  `developer/flow/main.md`'s "(chains session-log...)" annotation and `cycle-bootstrap/
  SKILL.md`'s informational End-of-Cycle pointer (outside the 29-file flow-dir grep scope,
  found by a repo-wide follow-up grep before declaring done).
- B2 (cowork-boundary vs cowork-error-boundary dedup, ~20k tok/day, unrelated file pair) —
  SPLIT, not bundled: filed `docs/signals/po-20260806T191500Z.json` as a new-backlog-candidate
  (needs its own consumer-audit; bundling would muddy this row's higher-risk notebook-write
  pointer diff). Same signal also flags `scripts/audits/notebook-class-fence.sh:35`'s SCAN_SET
  grep (`"cowork-end-cycle\|notebook-write"`) as now under-scanning post-repoint — out-of-zone
  (scripts/), routed to developer/dev-team, non-blocking.
- Commit(s): see RETURN. Board is QA-GATED per the row's own `note` — did not self-close;
  lane-move `in_progress[]→review[]`/`next_agent:qa` left to router/PO per `commit_zone.excluded`
  (orch-state.json not this agent's commit surface), same as every prior TE-T## agent-father row.
