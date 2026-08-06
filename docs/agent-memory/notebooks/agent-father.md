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

## Fix (router-direct dispatch, P0) 2026-08-06T15:19Z FIX-REFINE-SUBFLOW-OPTIONC-CONTRACT-DRIFT
- **Root cause confirmed exactly as PO's escalation stated:** `refine_bctc_md/flow/main.md:94`
  called `execute_sub_flow_logic(window)` — zero definitions repo-wide — while all 4 sub-flow
  docs still carried Option-B "Task return value"/"the orchestrator collects" language, never
  rewritten when the agent converted to Option-C inline. Shipped AC-1..AC-6 (`da489f36f`):
  Phase 2 rewritten as literal inline steps (explicit per-page_type `Read` instruction, an
  ANTI-CONFABULATION line telling the model it IS the parser, and the 4-value STATUS enum
  — DONE/PARTIAL/FAILED/SKIPPED — restated at the loop site with PARTIAL now explicitly
  requiring `pushed_this_fire >= 1`, closing the exact gap that let a live agent invent
  `PARTIAL_EXIT` on a 0/12-push fire); 4 sub-flow docs' RETURN sections + stray "orchestrator"
  mentions reworded to inline-result language; `.claude/agents/refine_bctc_md.md` chunk-size
  doc corrected 7→12 (drifted since commit `524a87cc`, docs/ copy fixed then, `.claude/` never
  was); `cowork-schedule.json` slots 1-3 `enabled:false`, slot-4 (last good fire
  2026-08-05T16:40Z) kept as sole canary.
- **main.md grew 139L→182L, over the 120L flow-file cap** — added a `size-justification` header
  (established convention already used by this same agent's `disagreement-verify.md`) rather
  than trim: the added content (explicit Read step, anti-confab guard, restated enum) directly
  closes this task's root cause; compressing it back down would re-introduce the ambiguity.
- **AC-7 (re-enable slots 1-3 + close the board row) intentionally NOT done this cycle:** it
  requires slot-4's next live cron fire (2026-08-06T16:30Z) to RAW-confirm via `get_bctc_refined`
  that report `a3a41225` gained pushed units — I hold no MCP tool binding in this session
  (`Read, Edit, Write, Bash` only) to observe that live signal, and the fix landing does not
  itself prove the fix works. Did not flip board status or lane-move, and did not write a
  signal_queue row (the "DONE-mark" carve-out is for an actually-done task; this one has a
  standing, verifiable-only-later AC) — returned `PIPELINE: blocked-pending-live-verification`
  to router/PO with the exact re-check spelled out instead. Full rationale:
  `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-agent-father.md` STEP S24.

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
