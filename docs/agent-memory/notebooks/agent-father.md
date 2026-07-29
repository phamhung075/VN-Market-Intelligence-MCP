# Agent Father — Notebook

## Correction (router-dispatched) 08:47 — 2026-07-29 citation typo in prior section
- The prior section below cited commit `9b27e97236d2eeb1` for the retained-section-rewrite
  root cause. That is a transposed-character typo (`eeb1`/`eeb2`); the correct, verified prefix
  is `9b27e97236d2` (resolves unambiguously via `git log -1 9b27e97236d2`). Per this cycle's own
  new AC-2a immutability invariant, the retained section itself is NOT edited in place — this is
  the correct pattern (new note, not silent history rewrite) — my own `_check_notebook_immutability`
  hook correctly REJECTED my first attempt to fix it in place, which is itself a live validation
  that the gate works as designed.

## Edit (router-dispatched) 08:37 — 2026-07-29 FIX-NOTEBOOK-COMPOSE-REWRITES-RETAINED-PRIOR-SECTIONS
- Fixed the shared notebook-write path (`.claude/skills/notebook-write/SKILL.md` — the SSOT for
  37 APPEND-class agents): reconciled AC-2 (keep 3) vs AC-3 Step 1c (drop-one) into a converging
  WHILE-loop; added AC-2a IMMUTABILITY INVARIANT (retained `## ` sections must be byte-identical
  across a cycle — only drop-whole/AC-2b-subblock/trim-own-section are authorized mutations);
  reordered the cap-pressure ladder so the agent trims its OWN new section FIRST, never a
  retained one. Mirrored the same reconciliation into `system-auditor/flow/main.md`'s local copy
  of the algorithm (the flow that actually produced the observed data loss).
- Root-caused on RAW git archaeology, not the incoming premise: commit `9b27e97236d2eeb1` (2026-
  07-29, `system-auditor.md`) rewrote 4 retained sections in place (e.g. 25L→10L, dropping the
  "A-29 Cron Health Check"/"Freshness Sweep"/"Signals emitted" prose) on top of 2 whole-section
  drops — measured recurrence ≥5/12 recent notebook commits per the PO board row.
- Added a code-level gate, not more prose (prose already failed twice — same precedent as
  `_check_auditor_heartbeat_shapes`): `_check_notebook_immutability` in
  `scripts/git-hooks/pre-commit` hashes every `## `-delimited section in HEAD vs staged for every
  APPEND-class notebook and REJECTS the commit if any heading present on both sides has a
  different body hash. Zero new deps (git + shasum only). VALIDATED live: true-positive 4/4 on
  the real bad commit's before/after blobs, true-negative on a real clean drop-commit (found +
  fixed one false-positive class along the way — a section's trailing-blank-line inclusion
  differs when it moves from non-last to last position; normalized by trimming trailing blanks
  before hashing), plus a real staged-file REJECT/restore round-trip against the live
  `system-auditor.md` (git status confirmed byte-identical after revert).
- Also fixed AC-1's `c<NNN>` generation rule (root cause of the `## ad265f86 · ...` session-UUID
  leak — confirmed: `ad265f86` is this dispatch's own `$CLAUDE_CODE_SESSION_ID` prefix, live in
  the committed notebook before I touched anything): MUST be a real incrementing counter (see
  `bctc-analyst.md`'s clean `c125`→`c126`) or a fixed source label, NEVER a session-id fragment.
  This is part (a) — "agent instructions via agent-father" — of the sibling
  `FIX-AGENT-NOTEBOOK-UUID-PROVENANCE` row (owner/next_agent `architect`, untouched); part (b),
  the CI/pre-commit UUID-shape guard, is left to architect per that row's own disposition.
- Deliberately NOT implemented this pass: a third, distinct defect (a genuine ALL_GREEN cycle,
  commit `f26526d0e`, wrote the notebook anyway — bypassing the Notebook Append Gate at
  `system-auditor/flow/main.md:684-690`). Single occurrence so far (not yet the repo's own 2+
  recurrence bar), and a mechanical fix would require fragile regex-parsing of audit prose rather
  than a clean byte-hash — rowed with full evidence + a ready-to-implement acceptance criterion
  instead of rushing an unvalidated gate. Journal:
  `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-agent-father.md` §agent-father-S5.

### Edit (cowork-team) 04:51 — 2026-07-29 FIX-COWORK-SPAWN-IDENTITY-PREAMBLE-OFFFLOW (dev-team-dispatched,
PO recurring-bug escalation — 3rd occurrence of TASK_1967-04, PLAN_ONLY+SUPERVISED, executed direct out
of BACKLOG per recurring-bug policy, no lane wait)
- Task: 2026-07-12 fix (`FIX-MARKET-WATCHER-NARRATE-NOT-EXECUTE-GUARD`) guarded market-watcher's OWN
  `flow/main.md` — did not stop recurrence because a 2026-07-29T04:00Z cowork spawn never opened that
  flow file at all: it ran the project-root CLAUDE.md router protocol on itself (session-presence,
  orphan-adoption, PRE-CLAIM, dispatch table) and returned router-dispatch-shaped prose, then still let
  `last_fired` get stamped (04:05:51Z, confirmed live in `cowork-schedule.json`) as fabricated success.
- Synthesized PO's two recorded design options (A: spawn-prompt identity preamble; B: liveness-gated
  `last_fired` stamp) rather than picking one: self-report from an already-displaced agent is a vacuous
  reader-is-writer check (memory `feedback_reader_writes_its_own_trigger_field_check_is_vacuous`), and
  literal notebook-mtime B would false-positive against legitimate silent EXIT paths in market-watcher's
  own Step -0/Step 0-GW. Landed both, in `docs/agents/cowork-team/flow/spawn-fanout.md` (the ONE
  dispatcher chokepoint every cowork slot's spawn prompt passes through — fleet-wide fix, not
  market-watcher-specific): Step 5.2 prepends an `IDENTITY_PREAMBLE` to every `ENTRY_PROMPT` (cheap
  belt-and-suspenders, suppresses CLAUDE.md router-protocol inheritance); new **Step 5.3** is the
  load-bearing exogenous detector — cowork-team (never itself displaced) positive-matches each spawn's
  raw returned text against verbatim router-protocol terms (PRE-CLAIM/session-presence/orphan-adoption
  + the incident's own observed heading shape), excludes any hit from `WON_SLOTS` before the Step 5b
  `last_fired` write (`last-fired.md` new AC-P1-7-4), and fires a loud BUG telegram instead.
- Verified the marker terms are safe (zero false-positive risk): grepped every cowork-spawnable agent's
  own flow/init files for the chosen markers — zero hits outside cowork-team/dev-team/router docs, so no
  legitimate gatherer output could ever trip the detector.
- Re-ran `scripts/agents-flow/cowork-schedule-consistency.test.js` post-change — 9/9 pass, all 23 live
  slots agree — confirms no regression to the `trigger_prompt`/`flow_path` invariant Step 5.2 also owns
  (untouched: `IDENTITY_PREAMBLE` is composed into `ENTRY_PROMPT` only, never written into
  `slot.trigger_prompt` itself).
- Files: `spawn-fanout.md` (309→409L, size-justification comment updated), `last-fired.md` (+AC-P1-7-4),
  `main.md` (JUMP-TO table row updated). Journal:
  `docs/agent-memory/decisions/sprint-FIX-COWORK-SPAWN-IDENTITY-PREAMBLE-OFFFLOW-agent-father.md`.
- Board row flipped `BACKLOG`→`QA`, `next_agent: qa`, `plan_only: true`, `supervised: true` (via
  `orch-apply.sh`) — verification gate is behavioral (next live off-flow-displacement incident, or a QA
  dry-run injecting a synthetic off-flow return string into Step 5.3's matcher); cannot be confirmed in
  this dispatch. Did not touch `docs/data/orch/orch-state.json` in this notebook's own commit (router-
  owned per `FU-AGENT-FATHER-ORCH-SCOPE`) — the `orch-apply.sh` write lands directly on the live file,
  left uncommitted for the router/drain sweep.

### Disposition (po/router-dispatched) 19:13 — 2026-07-28 UNBLOCK-AGENT-MODELS-SWITCH-COMMIT-DISPOSITION
- Disposition for po: `current_mode: performance` was a **stale one-off local verification run**,
  not the intended standing fleet state — no sprint/task/journal declared it, `README` labels
  `normal` as production/default, and the dirty-file mtime lands ~82min after the switch-script fix
  commit (289a9d8e2) whose own message says its test was sandbox-only, never touching real files.
  Reverted (did NOT commit) all 21 files; `git diff`/`git status --porcelain` on
  `.claude/agent-models.json` + the 20 `.claude/agents/*.md` paths is now empty.
- `switch-agent-models.sh normal` alone did NOT clean the diff — found live `modes.normal.agents`
  preset drift vs committed frontmatter for 3 agents (ops preset=sonnet/live=haiku,
  po preset=haiku/live=opus, semble-search preset=haiku/live=claude-haiku-4-5; ops/po drift was
  already flagged out-of-scope in a98c47ce1, semble-search is new). Restored true HEAD via
  `git checkout -- <exact 3 paths>`. Filed `FIX-AGENT-MODELS-NORMAL-PRESET-DRIFT` (P3/XS/backlog,
  owner agent-father) so this doesn't silently bite the next real `normal`-mode switch.
- Board: `UNBLOCK-AGENT-MODELS-SWITCH-COMMIT-DISPOSITION` `ready[]`→`done[]` (DONE) + new FIX row
  minted into `backlog[]`, same `orch-apply.sh` write. Journal:
  `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-agent-father.md` §agent-father-S1.

### Edit (qa) 06:55 — 2026-07-25 qa-flow-quality-audit-checklist-freshness (router-dispatched)
- Task: "QA adds+verifies quality-audit checklist items, driven by architect doc + freshness
  demand, mints dev-team task for gaps" existed only as an ephemeral router spawn prompt (zero
  grep hits in `docs/agents/qa/flow/main.md`) — made it durable.
- Created `docs/agents/qa/flow/quality-audit.md` (66L, new sub-flow): source-union (quality-audit
  framework brief + `docs/data/frontend-data-coverage-map.json` live freshness-SLA SSOT +
  freshness briefs + docs/policies/ re-glob) → diff vs `docs/data/quality-checklist.json`
  (74-cap live SSOT, traced full serve chain to confirm it's the one declaration point) → 6 hard
  verification rules (live-runtime-only, badge≠evidence, empty≠pass, two-layer freshness, real
  `date -u`, no fabrication) → gap escalation (prior-art grep → git-log-since → mint
  `.task_board.backlog[]` via `orch-apply.sh`, `next_agent` resolved via zone-detect/system-map,
  never guessed).
- `docs/agents/qa/flow/main.md`: added ONE dispatch-table row (`→ Run sub-flow:
  ./quality-audit.md`, per jump-to SKILL.md's cross-file invariant, not an in-file `JUMP TO`);
  corrected stale `size-justification` header (claimed 227L, was actually 274L pre-edit, now
  275L) — did not add any procedure inline, stayed under the "don't inflate main.md" constraint.
- `.claude/agents/qa.md` frontmatter checked (`Read,Edit,Write,Glob,Grep,Bash`) — sufficient for
  the new sub-flow (no MCP call needed, backlog mint goes through `jq|orch-apply.sh`); no gap,
  left untouched.
- Journal: `docs/agent-memory/decisions/sprint-qa-flow-quality-audit-checklist-freshness-
  agent-father.md` (2 STEP entries). Did not touch frontend routes or `orch-state.json` (peer qa
  instance's zone, per router instruction) and did not invent/arm a cron.
