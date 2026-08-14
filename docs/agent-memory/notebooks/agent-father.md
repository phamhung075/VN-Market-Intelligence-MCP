# Agent Father — Notebook

<!-- Entry 2026-08-07 12:58 UTC (Keep/maintenance) split to
     docs/agent-memory/notebooks/archive/agent-father-archive-20260812.md on 2026-08-12
     (self-prune, byte cap 12000B breached at 172L/15376B) — CLEAN-NB-AGENT-FATHER-MIXED-
     HEADING-OVERCAP-DISARM. Also disarmed the sentinel-immunity trap that made this file's
     one dated heading look like "oldest": every retained ## heading below now carries an
     explicit YYYY-MM-DD token. Nothing deleted; full record in the archive file and git
     history. -->

## EDIT 2026-08-14T22:12Z — task UC-CCA-P3 (7x FR-3 subtasks), router-dispatched, session
`632721c2-41e4-4aff-8d06-a47cf80dc0d7`
- Router-spawned as `developer` onto the umbrella row UC-CCA-P3 with an explicit flag: the 7
  FR-3 children's `next_agent` field (`dev-alert-commander`/`dev-bctc-analyst`/`dev-unified-agent`/
  `dev-digest-predict`/`dev-fb-market-poster`/`dev-cowork-team`/`dev-tran-ngoc-bau`) does not match
  any real agent type — checked `docs/references/agent-roster.md` + `system-map.json
  .project.agents[]` myself, confirmed none exist. Root cause: PM's 2026-08-08 decomposition
  minted synthetic per-cowork-agent placeholder labels, never resolved to a real dispatch target.
- Resolved via direct precedent, not guesswork: `UC-CCA-P2` (same day, same shape — one shared
  skill wired into the same 6 cowork agent families) has an architect ruling on file
  (`docs/handoffs/UC-CCA-P2-BA-spec.md architect_review_note`) stating `agent-father/flow/
  edit-prepare.md` Step 1 is single-agent-name-scoped, so an N-agent-family task is a genuine
  PM-decomposition into N single-agent subtasks, each routed `next_agent=agent-father`. PM
  decomposed UC-CCA-P2 that way; router assigned `next_agent=agent-father` on 6 of 7 resulting
  subtasks (verified live in `archive/2026-08.json`). Same real owner applies here — the 7
  UC-CCA-P3-FR3-* children are `docs/agents/<cowork-agent>/flow/` edits, not `apps/` code; no
  dev-* zone owner exists for cowork flow docs (system-map.json zones cover `apps/` only).
- **Implemented all 7 directly, not just re-routed** (this same session already executed the
  identical "no Agent-tool binding → act as agent-father directly" pattern for UC-CCA-P2's 6
  near-identical subtasks a few hours earlier in this same cycle — repeated it). Wired
  `.claude/skills/published-marker-gate/SKILL.md` (FR-1/FR-2, already `DONE_VERIFIED`, live-read
  before use) into all 6 gates per architecture brief `2026-08-08-uc-cca-p3-published-marker-
  gate-skill.md` §4 — converted each EARLY `task_claim` (before the flow's own pipeline) into a
  Phase-1 read-only `task_list_held` probe, and added the mandatory Phase-2 `task_claim`
  immediately before each flow's real irreversible publish action:
  - `chef.md` Step 0.5 → probe only; `chef-dish.md` Step 7 → claim (gates BOTH Block A/B). R1
    cross-file threading verified both directions; `chef-dish.md`'s Input line corrected per the
    brief's exact diff.
  - `stage-dispatch-log.md` (alert-commander) / `stage-log-notify.md` (bctc-analyst) — Phase-2
    only (no Phase 1, per skill's own design note), inline prose swapped for the skill pointer.
    bctc-analyst's `task_kind` normalized `sprint-task`→`cowork-slot` (Q-taskkind resolved YES).
  - `fb-market-poster` all 3 pipeline files (`daily.md`/`weekly-recap.md`/`weekly-prediction.md`)
    — probe at STEP 0a, claim before each file's own STEP 5/4 file `Write` (no MARKET
    `send_telegram` exists anywhere in this flow, R2).
  - `digest-predict/main.md` — both gates (daily+Sunday) → probes only; `weekly.md` → claim
    before `send_telegram(market)`; `daily-predict.md` → claim before the P-5
    `create_prediction_claim()` loop.
  - `tran-ngoc-bau/main.md` → probe only; `auto-cure-and-handoff.md` Step 7 → claim before the
    WORK send.
  - `spawn-fanout.md` — trimmed the superseded ~78L FR-P2-7 inline pattern block to a 1-line
    pointer (doc-debt cleanup, Q-skill-siting).
- **2 own findings beyond the brief, both documented per-row and in the umbrella's status_note:**
  (1) digest-predict's brief-cited daily-path target (`daily.md`) is dead/unrouted code — live
  Dispatch table routes the daily window to `daily-predict.md`; a 2026-07-12 audit brief already
  recommended removing `daily.md`, never executed — same stale-anchor class as UC-CCA-P2's own
  fb-market-poster Q-file-count-correction; redirected the claim to the real file, left `daily.md`
  untouched (flagged for code-janitor). (2) `chef.md`'s UC-CCA-P2 Step-0-GW comment claimed to
  protect "the Step 0.5 task_claim mutation window" — that mutation moved to `chef-dish.md` Step 7
  by this fix; corrected the comment to flag the now-partially-stale rationale and a possible new
  gateway-coverage gap (not resolved here — different task's zone).
- 7 commits on `main`, one per subtask: `f1eb75143` (spawn-fanout cleanup), `e0aa2cc21`
  (alert-commander), `9ba9f97e5` (bctc-analyst), `e7a8b3996` (tran-ngoc-bau), `636efc128`
  (digest-predict), `1ce429ef6` (fb-market-poster), `3b10e4f74` (chef). RAW-verified post-edit:
  zero `task_claim(` remaining in any Phase-1-only section; all 13 touched files reference the
  skill (grep count ≥1 each).
- Board disposition: all 7 rows `ready[]` → `review[]`, `status: READY → REVIEW`,
  `next_agent: <placeholder> → qa`, `agent_father_implementation_note` per row (findings above,
  condensed), via `scripts/orch-apply.sh` (validate + conservation-check both PASS, `task_total`
  unchanged 688→688). Umbrella `UC-CCA-P3` `status_note` appended (not overwritten) with the same
  findings + `next_agent → qa`; stays `IN_PROGRESS` — QA review of the 7 children (esp.
  `UC-CCA-P3-FR3-CHEF`'s R1 threading) is the real remaining work before this umbrella can close.
  Applied via `scripts/orch-apply.sh`, left UNCOMMITTED per `FU-AGENT-FATHER-ORCH-SCOPE` (matches
  S47/S48/S49/UC-CCA-P2 precedent above) — write is on disk, ready for the next commit sweep.

## EDIT 2026-08-14T23:03Z — task TASK_2008c (UC-CDC-P1 3-way split, agent-father slice),
router-dispatched, session `632721c2-41e4-4aff-8d06-a47cf80dc0d7`
- Context: UC-CDC-P1 (compute `calendar_status` server-side, break the circular self-recycling
  loop) decomposed by PM into 3 tier-1/independent tasks — TASK_2008a (dev-mcp-server, FR-A1/A2),
  TASK_2008b (developer, FR-A3), TASK_2008c (this row, agent-father, FR-A4/A5,
  `docs/agents/cowork-team/flow/` zone). Zero `depends_on`; no coordination needed with 2008a/2008b.
- FR-A4: deleted `telemetry.md` Step 6.0's `"calendar_status": "<CALENDAR_STATUS from Step 4.3>"`
  arg (L15) from the `emit_pressure_state` call_tool block — the WORK-path half of the
  self-recycling loop (dispatcher read the value out of pressure-state.json in Step 4.2, then
  wrote it straight back on Step 6.0); TASK_2008a closes the server-compute half. Step 6.0's own
  MANDATORY/un-skippable invariant untouched — only the one arg line removed. Confirmed L63's
  payload `calendar_status` field (Step 6.1 observability write) is a distinct purpose, out of
  FR-A4 scope, left as-is.
- FR-A5: `pressure-read.md` Step 4.3 previously silently fell through to the no-suppression branch
  for ANY value outside `["holiday","weekend"]` — indistinguishable from a legitimate `"unknown"`,
  the exact mechanism that let a stale `"closed"` literal persist undetected for days. Added
  explicit `CALENDAR_STATUS_DOMAIN=[open,half_day,weekend,holiday,unknown]`; any value outside it
  now logs + `send_telegram(channel="bug", message="[pressure-read] out-of-domain calendar_status:
  <value>")` before falling through to the SAME unchanged no-suppression path — no new blocking
  behavior, no rate-limit (self-heals within one tick once TASK_2008a lands). Style matched to
  existing `spawn-fanout.md` IDENTITY_CHECK=FAIL `channel="bug"` precedent.
- Refreshed both files' stale `size-justification` headers to actual post-edit counts:
  `telemetry.md` 153L→163L (net −1, still over the 120L flow-file cap, pre-existing exemption),
  `pressure-read.md` 90L→117L (net +12, now under the 120L cap outright). No unit-test twin for
  either FR (Step 4.3 is pure LLM-narrated prose, no JS/TS mirror) — verification is live-tick
  notebook observation per the row's own AC.
- Lock: no gateway binding (tool grant Read/Edit/Write/Bash only) — Solo operation exception
  applied (`.head.status=idle`, `active_task_id=null` at read time) per `commit-boundary/SKILL.md`;
  no lock claimed, none needed.
- Board disposition: `TASK_2008c` `ready[]` → `review[]`, `status: TODO → REVIEW`,
  `next_agent: null → qa`, `agent_father_implementation_note` added, via `scripts/orch-apply.sh`
  (validate + conservation-check both PASS, `task_total` unchanged 695→695). Left UNCOMMITTED per
  `FU-AGENT-FATHER-ORCH-SCOPE` — write is on disk, ready for the next commit sweep.
