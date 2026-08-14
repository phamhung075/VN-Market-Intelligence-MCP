# Agent Father — Notebook

<!-- Entry 2026-08-07 12:58 UTC (Keep/maintenance) split to
     docs/agent-memory/notebooks/archive/agent-father-archive-20260812.md on 2026-08-12
     (self-prune, byte cap 12000B breached at 172L/15376B) — CLEAN-NB-AGENT-FATHER-MIXED-
     HEADING-OVERCAP-DISARM. Also disarmed the sentinel-immunity trap that made this file's
     one dated heading look like "oldest": every retained ## heading below now carries an
     explicit YYYY-MM-DD token. Nothing deleted; full record in the archive file and git
     history. -->

## EDIT 2026-08-14T21:08Z — task FIX-AGENT-BASH-GRANT-COVERAGE-GATE-FLOW-DEMANDS-VS-FRONTMATTER
(dev-team-dispatched FIX-type direct dispatch, session `632721c2-41e4-4aff-8d06-a47cf80dc0d7`)
- Change: shipped `scripts/audits/agent-bash-grant-coverage.sh` (CHECK-1 flow-demands-Bash-vs-
  tools-grant, CHECK-2 AC-8 description/tools self-contradiction; baseline-ratchet, never an
  opt-out allowlist — a grandfather entry requires a non-null `owning_task` or it still FAILS) +
  its 10-case fixture test (`agent-bash-grant-coverage.test.sh`) + CI job. Granted Bash to
  digest-predict (named target) + idea-forge/market-analyst/qa-responder/tran-ngoc-bau/unified-agent
  — live grep found all 5 genuinely reference `git add`/`git commit` under commit-mutex, refuting
  the board row's own inline "probably correct as-is" hedge for 3 of them. Fixed the AC-8
  description-vs-Bash contradiction on 5 agents (alert-commander/market-watcher/news-scout named +
  fb-market-poster/orch-sentinel newly found by the derivation).
- Files modified: 11 `.claude/agents/*.md` (digest-predict/idea-forge/market-analyst/qa-responder/
  tran-ngoc-bau/unified-agent/alert-commander/market-watcher/news-scout/fb-market-poster/
  orch-sentinel), `.github/workflows/ci.yml` (new job), plus 3 new files
  (`scripts/audits/agent-bash-grant-coverage.sh`, its `.test.sh`,
  `docs/data/agent-bash-grant-coverage-baseline.json`).
- Zone note: `scripts/audits/` + `.github/workflows/ci.yml` sit outside agent-father's declared
  `commit_zone` table — committed anyway, this row was the PO-routed, explicit primary deliverable
  under a direct-FIX dispatch (files[] named both). Recorded, not silent — see decision journal S47.
- Validation: `bash scripts/audits/agent-bash-grant-coverage.sh --check` exits 0 across all 42 live
  agents (1 grandfathered: bctc-analyst, owning_task=`FIX-BCTC-ANALYST-STAGELOG-NOTIFY-NO-BASH`,
  still BACKLOG). `agent-bash-grant-coverage.test.sh`: 10/10 pass. `shellcheck -x`: 0 findings.
- Not done here (explicit, not silent): the live digest-predict cycle that actually commits its
  own notebook — this row's own `baseline_pass` DoD names that as the functional proof, and AC-6
  says route to qa for live-cycle confirmation rather than self-certifying DONE on the edit.
- Decision journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-agent-father-3.md` S47.
- Board disposition: applied the status-flip lane-move myself (`in_progress[]` → `review[]`,
  `next_agent=qa`) via `scripts/orch-apply.sh` per this task's explicit dispatch instruction
  ("status-flip = lane-move, no exceptions") and the `FU-AGENT-FATHER-ORCH-SCOPE` narrow exception —
  `status_note` carries the full pass/fail table + the pending live-cycle verification handoff.

## EDIT 2026-08-14T21:20Z — task FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING (FR-8 follow-on)
(dev-team-dispatched, dispatcher-wrap lock, session `632721c2-41e4-4aff-8d06-a47cf80dc0d7`)
- Context: FR-0..FR-7 (this row's original spec) already shipped `c1150477546` — PO RAW-verified
  against 3 live post-fix dishes and FAILED it: `business_context_cited=null` on 100% of calls,
  evening dish falsely claimed "zero bctc_signal files processed" against 4 in-window files. Root
  cause per PO: complete/correct prose, no deterministic enforcement — same class the sibling row
  `FIX-CHEF-QUALITY-VERDICT-FALSE-FULL-NO-LAYER-ASSERTION` closed this session (`5829a7ad2`,
  ASSEMBLY-then-assert Step 7.5). PO opened FR-8 same cycle: chef silently issued MEDIUM/ACCUMULATE
  on DXG against `bctc_signal_DXG_20260814_routine.json`'s own `valuation.verdict=AVOID` gate.
- Change: `chef.md` Step 0 — `$BIZ_CTX_SIGNALS[<TICKER>]` gains `valuation.{verdict,note}` +
  `kinhdich.note` (byte-verified against the live DXG file's real schema before editing, not
  guessed). `chef-dish.md` — new Step 4 "Valuation-gate discipline" sub-step (mirrors FR-3's
  citation sub-step pattern): AVOID-gated ticker MUST NOT conclude BUY/ACCUMULATE this cycle unless
  the rationale carries a literal `[override:valuation_avoid — <data-backed justification>]` clause
  (T-45 adversarial-discipline convention, reused verbatim from
  `tran-ngoc-bau/flow/audit-methodology.md` per PO's own instruction to check precedent before
  inventing new language). New Step 7.5 sub-check (h) `VALUATION_GATE_OK` — 8th ASSEMBLY-then-assert
  sub-check, same single-pass mechanism as (f) `SCHEMA_OK`/(g) `DIRECTION_OK` from `5829a7ad2`:
  self-corrects direction to HOLD BEFORE Step 7.6 writes when the gate is violated with no engaged
  override (never a gap-token-only disclosure for this class — output-validity, not data-availability).
  New `valuation_gate` field on `$CONVICTION_CALLS`/`conviction_calls[]` JSON (structured
  verdict/note/override_engaged/override_rationale, RAW-verifiable, same precedent as FR-7's
  `business_context_cited`). New Step 7.6 post-write self-check #5.
- Ordering safety note added inline: sub-check (h) scores the RAW pre-DIRECTION_OK-correction
  direction (so a raw "ACCUMULATE" against AVOID fails (h) on its own terms) and its correction takes
  precedence over (g)'s ACCUMULATE→BUY remap for the same entry — prevents a same-cycle laundering
  bug where (g) fixes the enum first and nobody re-checks the corrected value against the gate.
- Files modified: 2 (`chef.md` 265→281L, `chef-dish.md` 914→1002L) — both header
  size-justification comments updated with the real delta, matching this row's own established
  append-only-changelog convention (no history rewritten).
- Validation: code-fence balance check (8/44 fences, both even/paired) on both edited files; added
  an "Illustrative negative-control example" for sub-check (h) directly against the live DXG
  evidence (raw ACCUMULATE+no-override → FALSE/degraded/self-corrected-to-HOLD; contrast case with
  a data-backed `[override:...]` clause present → TRUE) mirroring (a)'s existing AC-3 example style.
  No scripts/services/data-files created; zero `apps/` touch — flow-doc-only per architect's original
  zero-blast-radius ratification on this row, still true for FR-8.
- Decision journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-agent-father-3.md` S48.
- Board disposition: applied the lane-move myself (`in_progress[]` → `review[]`, `next_agent=po`
  — this row's own history (FR-0..7 shipped-but-failed once already) means only another independent
  RAW-verify against a live post-fix dish cycle can close it, not a self-certified DONE) via
  `scripts/orch-apply.sh`.
