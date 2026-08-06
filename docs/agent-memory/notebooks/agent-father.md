# Agent Father — Notebook

## Keep (maintenance) 2026-08-06T13:18Z — scheduled (cron-agent-father 23:14 UTC slot)
- Trigger: scheduled. Pre-Check gate (`git diff --name-only HEAD~3..HEAD`) hit only
  `docs/data/orch/*` — zero `.claude/agents/*.md`/`docs/agents/*/flow/*.md` matches → Steps 1-2
  (orphan+roster scan) skipped per CADRAT-3, straight to Steps 3-5 with empty scan-orphans output.
- Top-5 sweep, all 42 agents (`.claude/agents/*.md` × `docs/agents/<id>/init.md`): Check #1
  (fail-loud-protocol) + #3 (boundary_rules) fail ONLY for `semble-search` (minimal tool-style
  single-shot search wrapper, own flow/main.md self-declares "No multi-step flow", no notebook
  writes, `tools: Bash, Read` — reads as an intentional exception never written into the guide).
  Check #4 (flow path resolves) clean for all 42 (initial hits were a BSD-sed `\s` false positive
  in my own grep, re-verified with `[[:space:]]`). Check #5 (version >90d stale): agent-father's
  own `init.md` was 91d stale (2026-05-07) — **auto-fixed** to 2026-08-06 (mechanical rule).
- Check #2 (Error Boundary in flow): 17 raw grep hits on `<id>/flow/main.md`, 9 false positives —
  thin-dispatcher `main.md` routes to a sub-flow (`cycle.md`/`weekly.md`/`daily-predict.md`/
  `chef.md`/`keep.md`) that DOES carry the line; verified all 9 individually (agent-father,
  alert-commander, bctc-analyst, digest-predict, market-watcher, news-scout, qa-responder,
  unified-agent). **Real finding (escalated, not auto-fixed — Step 4 forbids):** 8 microservice
  dev-* agents (dev-alert-engine, dev-api-gateway, dev-kinh-dich, dev-macro-indicators,
  dev-pdf-extractor, dev-rag-service, dev-stock-price, dev-technical-analysis) all dispatch to
  the shared `docs/agents/developer/flow/microservice-main.md`, which itself has zero "Error
  Boundary" mentions — single-file fix closes all 8 (dev-mcp-server/dev-frontend declare their
  own Error Boundary line before delegating, so they're clean).
- Step 5 stale-notebook report (>30d): 4/46 — idea-forge.md (95d), market-analyst.md (95d),
  qa-responder.md (70d), semble-search.md (95d). Info only.
- Step 5b team-tool-recheck: wrote `team-tool-recheck-2026-08-06-1318.md`. Findings identical to
  same-day 07:39Z run — 3 CRITICAL unchanged (alert-commander/market-watcher/news-scout: `Bash`
  granted vs unqualified "No other filesystem writes permitted", origin `610110e16`, already
  handed off to po). Mechanical-enforcement status unchanged: prose-only.
- **Structural finding (escalated):** this flow's Commit step prescribes `commit-mutex/SKILL.md`
  (`task_claim` via `mcp__gateway__call_tool`), but agent-father's tool grant (`Read, Edit, Write,
  Glob, Grep, Bash`) has no MCP binding — confirmed live, call errored "No such tool available".
  Same gap `team-tool-recheck.md` already names for its live-probe subset. Committed directly with
  explicit pathspec (no `-A`/bare), `INV-GATEWAY-1` "specialists commit directly" precedent — no
  lock acquired, tool doesn't exist for this agent. Recommend keep.md's Commit step get corrected.
- Self-caught bug: first notebook-write attempt used a malformed heading (`13:18Z 2026-08-06`,
  time-before-date) — the auto-prune hook's date regex only captures date-only when no T-time
  immediately follows, defaulted my new section's sort-key to midnight, mis-ranked it OLDEST, and
  silently dropped it (file reverted byte-identical to pre-edit HEAD). Re-wrote with proper
  ISO8601 (`2026-08-06T13:18Z`) matching this file's own convention.
- Committed `bbe732740` (init.md version fix + health report), pushed clean (tsc PASS).
- Escalations: N=1 substantive (microservice-main.md Error Boundary gap, 8 agents) + 1 structural
  (commit-mutex tool-access gap) + 1 policy question (semble-search exception class, LOW) →
  folding into Step 7 PO handoff.

## Split (router-direct dispatch, P1) 2026-08-06T10:22Z TE-T26 (TOKEN-ECONOMY-AUDIT wave 3)
- Split `docs/agents/fb-market-poster/flow/main.md` (994L) at the MODE ROUTER, per
  `docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-26`. New
  `docs/agents/fb-market-poster/flow/daily.md` (902L) holds STEP 0-8 of the DAILY pipeline
  (TNB 6-layer walk, T-45 gate, compose, 4 pre-write gates, write, notebook) — pure
  relocation, diff-verified byte-identical to the pre-split content outside the 2
  brief-authorized deletions. `main.md` slimmed to 88L: SELF-IDENTITY GUARD + PRIVACY
  GUARD (unchanged, stays SSOT) + MODE ROUTER (now JUMPs all 3 modes, DAILY included) +
  new `## SHARED OUTPUT SSOT` section (disclaimer block verbatim + hashtag composition
  rule + jargon-pointer, relocated out of daily.md's STEP 3 so weekly-recap.md/
  weekly-prediction.md keep pointing at the still-loaded slim main.md — no duplication).
- Deleted the 29L forbidden-English jargon table (dup of `scripts/fb-jargon-gate.sh`,
  known false-green/drift class) → 1-line pointer. Trimmed daily.md's 26L hashtag
  composition-rule prose → pointer at main.md § SHARED OUTPUT SSOT + kept only the
  DAILY-specific dynamic-tag derivation note.
- Repointed every `main.md STEP X` cross-ref in weekly-recap.md/weekly-prediction.md
  (STEP 0/1b/2b/2c/3/4/4a/4b/4c/4d/5/6, ~20 sites total) to `daily.md`, since those STEPs
  moved out of main.md; PRIVACY GUARD/SELF-IDENTITY GUARD/MODE ROUTER pointers unchanged
  (those stayed in main.md). Also updated `.claude/skills/fb-jargon-gate/SKILL.md`'s
  invocation heading and `docs/policies/dev-standards.md`'s STEP 4b owning-flow comment.
- Registered `daily.md` in `init.md` document_registry + Extensions — and, while touching
  that exact table, also registered the 2 pre-existing unregistered weekly siblings
  (weekly-recap.md/weekly-prediction.md were live MODE ROUTER JUMP targets but never in
  document_registry — anti-ghost gap closed as a small adjacent fix, same duty this split
  itself triggers).
- **Board:** TE-T26 lane-moved `backlog[]→review[]`, `status=REVIEW`, `next_agent=qa` via
  `orch-apply.sh` (router explicitly directed this write). **Did NOT commit**
  `docs/data/orch/orch-state.json` myself — `commit_zone.excluded` (`FU-AGENT-FATHER-ORCH-SCOPE`)
  stands regardless. Doc commit (`main.md`, `daily.md`, `weekly-recap.md`,
  `weekly-prediction.md`, `init.md`, `fb-jargon-gate/SKILL.md`, `dev-standards.md`) done
  and pushed within my own zone.

## Fix (router-direct dispatch, P1) 2026-08-06T10:16Z FIX-DEVTEAM-RESUME-GATES-OMIT-READY-LANE
- **Root cause:** Step 0b's 3 resume gates (WF-1 task_status lookup, WF-1b terminal-lane,
  WF-2 should_hold) all scanned `[in_progress, active_sprints, done, done_verified]` (WF-1/
  WF-1b) / `[in_progress, review, qa, done, done_verified]` (WF-2) — neither included `ready[]`.
  A row handed off into `ready[]` while `.head` still names it `in_progress` (measured live
  2026-08-06T09:48Z on `UC-CRITIC-HOOKS-ENFORCEMENT`: architect finished, wrote
  `next_agent=developer` on row + `.head`, left the row `ready[]`-resident) is invisible to
  every carve-out and falls through to a duplicate S2 spawn. 5th instance of the
  pipeline-resume duplicate-spawn family (`feedback_pipeline_resume_stale_placeholder_duplicate_spawn_risk`).
  Live board had already self-healed by the time I read it (`.head` back to idle) — reproduced
  the exact scenario with synthetic scratch fixtures instead (positive: `ready[]`-resident
  head-pin correctly short-circuits before S2; negative: genuine `in_progress[]` row still
  resolves to normal resume) run against the real jq filters before committing.
- **`docs/agents/dev-team/flow/main.md` (AC-1 + AC-2):** WF-1's `task_status` array and WF-2's
  `$row` array both gained `(.task_board.ready // [])[]`, APPENDED LAST (after
  done/done_verified) to preserve the `first`-prefers-live-copy STATUSFLIP-LANEMOVE ordering
  discipline. New **WF-1c READY-LANE check** inserted between WF-1b (terminal-lane) and WF-2
  (supervised-hold) — mirrors WF-1b's shape: `task_status == "READY"` → idle-reset `.head`, NO
  lane-move (row already correctly resident in `ready[]`), JUMP TO drain-signals, **before**
  WF-2 ever evaluates `should_hold` on it (a `ready[]`-resident row is staged, not "held" —
  WF-2's hold/resume contract doesn't apply). Chose this disposition over the alternative
  (folding `ready[]` into WF-2's hold semantics) because a staged row was never resumed in the
  first place, so "hold until po_goahead" is the wrong mental model for it — explicitly stated
  per PO's AC-2 requirement, not left implied by the array widening alone. WF-2's ordinal
  retitled BLOCKED→TERMINAL-LANE→READY-LANE→WF-2; S2 fall-through summary line corrected to
  name all three carve-outs; top-of-file changelog + Reusable Scripts section updated in place.
- **`docs/agents/po/flow/supervised-goahead.md` (AC-3):** re-synced Step 1's `should_hold` jq
  to be byte-identical to `main.md`'s corrected block — the file had drifted on TWO axes: (1)
  its `$row` array was still 3 lanes against `main.md`'s already-widened 5 (from the
  same-day `FIX-DEVTEAM-PIPELINE-RESUME-TERMINAL-LANE-BLIND`, never mirrored here), (2) it used
  a `-L scripts/lib` + bare `include "devteam-eligibility"` mechanism instead of `main.md`'s own
  `include "scripts/lib/devteam-eligibility";` — two working-but-textually-different ways to
  load the same library, which defeats a literal byte-diff drift guard. Fixed both; diffed the
  two files' jq program text (normalized only for the per-file `--arg tid` bash variable name)
  to confirm byte-identical. Fixed the stale `469-478`/`467-483` line references (also stale in
  `docs/agents/po/flow/main.md`'s own pointer) — switched both to a named-section pointer
  (`§ WF-2 SUPERVISED-HOLD check`) with an explicit "line numbers drift, re-read live" caveat
  rather than a hardcoded number, since this exact file has now drifted from `main.md` twice.
- **AC-4/AC-5 (verifier extension + drift guard, `scripts/`) — NOT implemented, flagged as a
  companion developer row** per PO's own split precedent (TE-T02/TE-T12, `scripts/` outside
  `commit_zone.allowed`): documented the exact spec as a new Reusable Scripts PENDING bullet in
  `main.md` (positive/negative control for WF-1c + a mechanical byte-diff drift guard between
  the two `should_hold` copies) and dropped `signal_queue` row `age-20260806T101656` (`to: po`)
  — read-back confirmed present. Did NOT mint the board row myself (`commit_zone.excluded`
  covers `orch-state.json` structurally, not just commits).
- **Board:** lane-moved `backlog[]→review[]`, `status=REVIEW`, `next_agent=qa` via
  `orch-apply.sh` (router explicitly directed this in the dispatch prompt, same precedent as
  TE-T16 below). **Did NOT commit** `orch-state.json` myself — flagged via the same signal row
  above. Verified both pre-existing regression verifiers still PASS after the widening:
  `devteam-pipeline-resume-terminal-lane-verify.sh` and `po-goahead-producer-verify.sh`.
