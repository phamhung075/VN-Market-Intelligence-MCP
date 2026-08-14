# Agent Father — Notebook

<!-- Entry 2026-08-07 12:58 UTC (Keep/maintenance) split to
     docs/agent-memory/notebooks/archive/agent-father-archive-20260812.md on 2026-08-12
     (self-prune, byte cap 12000B breached at 172L/15376B) — CLEAN-NB-AGENT-FATHER-MIXED-
     HEADING-OVERCAP-DISARM. Also disarmed the sentinel-immunity trap that made this file's
     one dated heading look like "oldest": every retained ## heading below now carries an
     explicit YYYY-MM-DD token. Nothing deleted; full record in the archive file and git
     history. -->

## EDIT 2026-08-13T22:35Z — task FIX-DEVFLOW-MICROSERVICE-MAIN-NO-ERROR-BOUNDARY (router-direct
rework, session `632721c2-41e4-4aff-8d06-a47cf80dc0d7`)
- PO's `po_review_verdict_20260813.ac2_gap`: commit `6ddb1a812` narrated "matches all 3 live
  phrasings" but its diff only added 2 (`Run shared flow:`/`Run sub-flow:`), never `Run flow:` — the
  real live phrasing for all 9 dev-* consumers. Re-read that diff myself (`git show`) before trusting
  it — confirmed the gap exactly as PO described, not just re-asserted.
- Fix: `sweep-fixes.md:21` Check #2 trigger widened to 3 phrasings + arrow tolerant of `->`/`→`.
  Script-driven (not manual) re-run of Check #2 as literally written, over all 14 `docs/agents/dev-*/`
  dirs: OLD regex → 9 FAIL (dev-alert-engine, dev-api-gateway, dev-kinh-dich, dev-macro-indicators,
  dev-news-fetch, dev-pdf-extractor, dev-rag-service, dev-stock-price, dev-technical-analysis) exactly
  matching PO's list; NEW regex → 14/14 PASS, all 9 resolving one-hop to `microservice-main.md`.
  Did not touch microservice-main.md/dev-mcp-server/dev-frontend (AC-1/AC-3 fenced, already landed).
- Decision journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-agent-father-2.md` STEP `agent-father-S38`.
- Board disposition: row moved `backlog[]`→`review[]`, `next_agent:po` via `scripts/orch-apply.sh`
  (`FU-AGENT-FATHER-ORCH-SCOPE` — orch-state.json outside commit_zone, applied not committed by me).

## EDIT 2026-08-13T22:58Z — task FIX-CI-TASKCLAIM-QA-FLOW-OWNER-SESSION-PAYDOWN (dev-team
Ready-Lane Consumer direct dispatch, session `632721c2-41e4-4aff-8d06-a47cf80dc0d7`)
- Both `task_release` call sites in `docs/agents/qa/flow/main.md` (WF-1 STOP-RELEASE block +
  Approved-path release) omitted `owner_client_session`. Fixed both — param names re-derived from
  live `coordination/taskReleaseTool.ts` (file split off `coordinationTools.ts` 2026-08-09, old
  doc line-refs stale). Deliberately did NOT run `--update` (PO status_note + the lint's own FAIL
  text both explicitly forbid re-grandfathering). `lint --check`: PASS/exit0 both BEFORE (with the
  untrimmed 19-entry baseline, to isolate the real fix) and AFTER the commit — "0 new offenders
  (scanned 276 files)". Committed+pushed `ef4b5b29c` (main.md + decision journal only).
- Baseline trim (drop 2 stale `qa/flow/main.md` entries, count 19→17) prepared as a ready-to-apply
  diff but NOT committed — `docs/data/` is outside `commit_zone.allowed`, same precedent as the
  exact sibling fix `21e97ab66`/`7b4a3c91b` (PO-flow task), which handed its own baseline-trim off
  rather than landing it directly. Diff handed to po in RETURN.
- Board: `in_progress[]`→`review[]`, `next_agent:po`, applied via `orch-apply.sh`, deliberately left
  uncommitted (`FU-AGENT-FATHER-ORCH-SCOPE`) — same precedent as every prior closeout above. `.head`
  re-checked fresh and idled in the SAME write (still named this task).
- Gateway-blind this session too (no native `mcp__gateway__call_tool`) — used
  `scripts/agents-flow/mcp-call.sh` bridge for `task_release(task:<id>, owner_client_session=
  632721c2-...)`: `{ok:true,released:1}`, sprint-task lock cleanly released.

## EDIT 2026-08-14T04:33Z — task FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING (router-direct
dispatch, session `632721c2-41e4-4aff-8d06-a47cf80dc0d7`)
- Architect ratified BA's FR-0..FR-7 (10 flow-doc edit sites, chef.md + chef-dish.md) — `.head`
  routed straight to agent-father, zero PM decomposition, zero application code.
- **Action taken:** applied all 10 sites verbatim. Per architect's own risk-flag R1 (files had
  already drifted BA→architect, +44L chef-dish.md/+5L chef.md from an unrelated 2026-08-13 commit),
  anchored every edit on grepped quoted text, never on either agent's cited line numbers — my own
  earlier edits in this same pass kept shifting later-file line numbers, confirming R1 was right.
  FR-0a/FR-0b temporal-scope the two stale "14/16 blocked" AUTO-CURE comments; FR-1 names
  `$BIZ_CTX_SIGNALS` at chef.md Step 0 GATHER (the missing handle); FR-2 carries it across the
  chef.md/chef-dish.md session-state handoff; FR-3 adds the mandatory Step 4 citation sub-step
  producing `$BIZ_CTX_CITED`; FR-4 folds it into the Step 6.5 causal chain; FR-5 closes the
  filename-only citation loophole in Step 7 Block B; FR-6 redefines `BIZ_CTX_OK` against the new
  artifact instead of a bare gap-token-of-convenience; FR-7 persists `business_context_cited` into
  `conviction_calls[]` (the field this row's own `verification_gate` RAW-verifies against). Post-edit
  grep confirmed all 10 tokens landed exactly once each at the intended anchor; blast-radius grep in
  the handoff already confirmed zero non-doc consumers.
- Task-lock: gateway-blind this session (no native `mcp__gateway__call_tool`) — the `task:<id>` row
  was already held by this SAME session (router pre-claim, `owner_client_session` match); released
  via `scripts/agents-flow/mcp-call.sh` bridge at closeout (`{ok:true,released:0}` — row already gone
  on re-check, clean either way).
- Committed+pushed `c11504775` (chef.md + chef-dish.md only, explicit pathspec).
- **Board disposition:** `in_progress[]`→`review[]`, `next_agent:po` — `verification_gate` needs a
  live chef dish RAW-verified against `unified-agent-synthesis-*.json` (not self-testable this cycle,
  prose/gate-logic wiring only). `.head` reset in the same write (was pointing at this task).

## EDIT 2026-08-14T06:33Z — task FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE
(dev-team Review-Lane SECONDARY-Drain owner-triage, session `632721c2-41e4-4aff-8d06-a47cf80dc0d7`)
- Row was REVIEW/`next_agent:agent-father` carrying a full architect blueprint
  (`docs/architecture-briefs/2026-08-07-devteam-head-pin-stale-threshold-resume-bound.md`) whose §5
  was explicitly "agent-father's deliverable" — not a bare sign-off/triage row, an implementation
  handoff. Live-reread `docs/agents/dev-team/flow/main.md` first (brief's own §1 flagged 12+ edits
  landed since the brief's line-number citations) — confirmed entry-gate/WF-2/S2 anchor text still
  matched verbatim, applied on live text via exact-match edits, never the brief's stale line numbers.
- **Applied:** dropped the `head.updated_at < 24h` clause from Step 0b's entry gate; inserted new
  WF-3 RESUME-ATTEMPT-BOUND (`.head.resume_attempts`/`last_resume_at`, 3-attempt bound → row `BLOCKED`
  + `hold_reason` + `resume_attempt_bound_exceeded_at/_by`, `.head` idle-reset, BUG signal) and WF-4
  STALE-AGE (2h, keyed off row `claimed_at` never `.head.updated_at` — the latter self-defeats the
  moment WF-3's own counter writes `.head` — git-log corroboration before reset, BUG signal) between
  WF-2 SUPERVISED-HOLD and S2; S2 gained a 6-line increment write on its successful-claim path; deleted
  the old 24h stale-crash sibling branch + fixed a stale cross-ref to it in S2's own LOCK-LIFETIME
  comment. Dry-ran all 3 new jq transforms against a synthetic fixture before treating the patch as
  done — all produced the exact shape specified. +78L (1152→1230), size-justification header entry
  added per this file's own per-edit convention.
- **Not routed through `edit.md`:** `dev-team` has no `.claude/agents/dev-team.md` roster entry (the
  router's own orchestration loop, not a spawnable agent) — `edit-prepare.md` Step 1's existence Glob
  would false-block. Applied directly, same precedent as my own 2026-08-13/08-14 chef/qa entries above.
- Decision journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-agent-father-2.md` STEP `agent-father-S41`.
- **Board disposition:** stayed `review[]` (no status flip — still `REVIEW`, so no
  STATUSFLIP-LANEMOVE obligation), `next_agent: agent-father → qa` (routes to the pre-existing QA-Drain
  PRIMARY selector next tick) via `scripts/orch-apply.sh` (`FU-AGENT-FATHER-ORCH-SCOPE` — outside
  `commit_zone`, applied not committed by me) + `agent_father_implementation_note` field added
  documenting the change for qa. Not self-certified `DONE_VERIFIED` — orchestration-core dispatch
  logic, no live multi-tick head-pin scenario reproducible in one session; qa to smoke/diff-verify.
