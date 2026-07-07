# Agent Father — Notebook

## c301 · 2026-06-17T14:50Z — DESIGN-GATHERER-EXEC-PROOF-FAILLOUD (EP-1..EP-4)

- Task: Implement architecture brief gatherer-exec-proof-failloud (brief 6eb16082 → impl cbbe2e2d)
- EP-1: Created .claude/skills/exec-proof-gate/SKILL.md — generic terminal gate; EXEC_PROOF_1 (notebook TS >= cycle_start_utc) + EXEC_PROOF_2 (fetch_result_count > 0 AND macro fetchedAt >= cycle_start_utc); FAIL path: BUG telegram + signal file + notebook entry + EXIT; no log_agent_work(completed)
- EP-2: Patched .claude/skills/cycle-bootstrap/SKILL.md — "Execution Proof Bootstrap" section; CYCLE_START_UTC anchor captured post-bootstrap; exec-proof-gate mandate added
- EP-3: Patched docs/agents/news-scout/flow/stage-log-notify.md — Step 3e gate before log_agent_work(completed); explicit CYCLE_START_UTC/NOTEBOOK_PATH/FETCH_RESULT_COUNT/FETCH_MACRO_TS/AGENT_ID
- EP-4: Patched docs/agents/market-watcher/flow/cycle.md — Step 4e gate before WORK ping; items_fetched / MACRO_HEALTH.fetchedAt bindings
- GENERIC: one shared skill, both gatherers inherit; no per-agent hardcode; no date literals
- commit-boundary: RULE 1 explicit 4 files ✓, RULE 2 zone (.claude/skills/ + docs/agents/ only) ✓, RULE 3 git show --name-only exact 4 ✓

## c302 · 2026-06-29T00:00Z — TASK_1996 FB-COWORK-FOLD: add fb-daily + fb-weekend slots

- Change: Added slots fb-daily (cron="15 9 * * 1-5") and fb-weekend (cron="13 13 * * 6,0") to cowork-schedule.json; fb-market-poster added to cowork-team Team Boundary
- Files modified: 2 (+ orch-state.json via orch-apply.sh); Cascade: none — JSON read live
- Validation: 21 slots total, field set 19/19 matches template, no duplicate slot_ids

## 2026-06-29 — HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING

- Task: Implement architect's design — fleet-wide AC-5 BLOCKING + headless prune hook + fence
- Task A: SKILL.md AC-6 APPEND list 25→37 agents + AC-5 advisory→BLOCKING; file-size-caps.json parity update; one commit (8e5084d6)
- Task B: scripts/agents-flow/notebook-auto-prune.sh — PostToolUse backstop, drop-oldest ## loop until ≤200L, atomic mv, safe-fail breach signals
- Task C: scripts/audits/notebook-class-fence.sh — FENCE-A (unregistered writers), FENCE-B (SSOT parity), FENCE-C (hook wired), --self-test ghost injection
- Task D: .claude/settings.local.json — notebook-auto-prune wired BEFORE context-bloat-backstop; not git-tracked (global gitignore; live on disk)
- Proofs: --self-test PASS (ghost caught); full fence exit 0 (all 3 fences); scratchpad 559L→184L (5 oldest dropped, 3 newest retained, no corruption)
- orch-state: head.next_agent architect→qa; task REVIEW→DONE; commits: 8e5084d6 · 402baa07 · 0d5626be

## 2026-07-01T07:05Z — TASK-EVIDENCE-HOP2-AGENTS (BA-PREDICTION-EVIDENCE-REVIVAL hop2)

- FR-2.1: wired `record_evidence_fragment` into 3 producer flows — news-scout/flow/stage-sentiment.md (`news_sentiment_stock`+`news_sentiment_macro`, `stock="MARKET"` for macro-wide), bctc-analyst/flow/stage-analyze.md (`bctc_valuation_premium`/`bctc_roe_strong`/`bctc_roe_ratio`/`bctc_regulatory_compliance`/`bctc_report_overdue`/`bctc_net_profit`), market-watcher/flow/cycle.md (`price_momentum_5d`/`price_momentum_20d`, parsed from `get_technical_indicators`'s `Tổng thể:` text conclusion line — live-verified `technicalIndicatorTools.ts:471-484`, not JSON fields) + matching tools_package docs (news-scout/bctc-analyst/market-watcher.md, new "Evidence Pipeline" table section)
- Bonus fix: `docs/agents/tools/list/record_evidence_fragment.md` had a stale wrong contract (`thesis_id`/`content`/`source`) that would have misled any agent consulting it for exact params — corrected to the live schema (`stock`/`evidence_type`/`direction`/`magnitude`/`confidence`/`source_agent`/`ttl_days`), live-verified against `evidenceTools.ts:77-122`
- All evidence_type strings cross-checked live (docker exec bun:sqlite query on `evidence_likelihood_ratios`) against architecture brief §0-C3 — none invented; `bctc_revenue_growth`/`bctc_pe_ratio`/`bctc_debt_equity` (tool-docstring examples, never seeded) explicitly excluded
- FR-3: stripped false "Sharpe>1.0 hard gate" language from digest-predict/init.md — rewrote `workflows.validate_prediction_claims.steps` to advisory-only framing + softened capabilities line 13 (B1=design B, PO-approved)
- Pre-existing size debt noted, not silently breached: bctc-analyst/stage-analyze.md 131L→154L (header was stale at 120L), market-watcher/cycle.md 233L→253L (header was stale at 191L, already over 200L pre-edit) — both headers updated with drift note + FR-2.1 delta, flagged as out-of-scope structural refactor
- orch-state: task_board.ready[TASK-EVIDENCE-HOP2-AGENTS] status READY→REVIEW, next_agent→qa (via orch-apply.sh, RAW-verified); hop1 (dev-mcp-server, apps/mcp-server/) parallel, zero file overlap

## 2026-07-04T00:11Z — ESC4-HEURISTIC-FIX-TAXBASIS-SOE (router-dispatched)

- Task: recurring ESC-4 false HIGH on GVR (fired 4x byte-identical data 06-30..07-03, escalation ceiling). Opus deep-dive bca-ddres-20260703T215200Z (conf 0.9) confirmed root cause: non-op-income share heuristic mixed tax bases (pre-tax item / after-tax net profit).
- AC-1: new `non_operating_share = (PretaxProfit − OperatingProfit) / PretaxProfit` formula, both terms pre-tax — replaces the retired mixed-basis calc. AC-2: SOE-conglomerate exception class (GVR, PHR, DPR, TRC, HRC) — auto structural-context tag downgrades ESC-4 severity HIGH→INFO on the `non_operating_share` arm only (`related_party_pct` arm unaffected).
- Files: created `docs/agents/bctc-analyst/flow/esc-4-nonop-heuristic.md` (formula + exception class, mirrors the ESC-3 `esc-coverage-guard.md` referenced-sub-doc pattern); edited `flow/main.md` (ESC-4 gate + signal_row severity no longer hardcoded HIGH), `flow/stage-pass-pl.md` (T2 One-Off Gain Dressing uses same formula), `flow/deep-dive-opus.md` (ESC-4 Opus verdict checks SOE-class before recommending flag_for_human_review).
- Cascade: none (no frontmatter/identity/permissions/routing change — heuristic/flow content only). Out of zone (not touched): dev-team's drain-esc-dispatch.md still dispatches Opus regardless of severity — flagged as a separate dev-team-owned follow-up, not this task's scope.
- Validation: all 4 touched files re-read post-edit; line counts 62/81/128/132 (all ≤200L cap); grep confirms zero UUID leakage.

## 2026-07-07T21:09Z — DOC-COWORK-CRON-RUNBOOK-FRESHEN (router-dispatched, brief docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md)

- Task: docs/protocols/cowork-master-cron-runbook.md still said RemoteTrigger "Layer A" was "permanently active and MUST COEXIST" + deletion-locked, 3 weeks after STANDING feedback_no_remote_trigger_all_local (2026-06-22) retired it in favor of the single session-scoped `*/15` CronCreate dispatcher — a future incident responder would misdiagnose against a mechanism that no longer exists.
- Rewrote §1/§2/§5/§8/§9: RemoteTrigger recovery steps marked retired-do-not-use; documented the session-scoped-dispatcher SPOF explicitly + pointed to in-flight `F1-LAUNCHD-COWORK-BACKSTOP` (owner developer, same brief) as the coming session-independent layer, with an explicit "update this doc again when it ships" instruction so it doesn't stale a 2nd time. Archived (not deleted) the never-filled §9.stability_log table for history.
- `docs/data/cowork-schedule.json._notes.layer_a_deletion_locked`: true→false (moot once the guarded mechanism is retired, not paused). Hot-file: did targeted mtime-guarded `jq` write (no orch-apply-style wrapper exists for this file) — verified diff only touched `._notes`, no clobber of concurrent `last_fired` churn from live agents.
- orch-state: `DOC-COWORK-CRON-RUNBOOK-FRESHEN` `task_board.ready[2]`→`task_board.done` via `scripts/orch-apply.sh` (CAS+Zod, 119 pre-existing non-blocking coherence warnings unrelated to this change). Two separate explicit-path commits (docs+schedule, then orch-state) — never `git add -A` on this heavy-churn tree.
- Independent of `F1-LAUNCHD-COWORK-BACKSTOP` / `FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED` (same brief) — did not wait on either, doc-fixed what's true now.

## 2026-07-07T20:15Z — FIX-COWORK-SUBAGENT-GATEWAY-BLIND-BOOTSTRAP (dev-team dispatch)

- Task: bctc-analyst-slot-2 gateway-blind 3x same session (session 6120a9e8) + out-of-band PO-triage
  subagent (this session 5a45feda) also blind — structural, not one-off. Memory:
  `feedback_local_cowork_subagents_gateway_blind.md` shows root cause is a session-level MCP
  transport gap (fixed at config layer 2026-06-23 commit b3612720, recurs after outages until
  `/mcp` reconnect), NOT a missing tool grant — fleet grep confirmed all 11 cowork
  `.claude/agents/*.md` already declare `mcp__gateway__call_tool`. So the only actionable fix is
  Option B: a bootstrap-stage gateway-blind guard, not a tool-grant edit.
- Traced bctc-analyst's REAL live bootstrap path: `main.md → cycle.md → stage-bootstrap.md` →
  `.claude/skills/cycle-bootstrap/SKILL.md` § Error handling (NOT `step-0-cowork/SKILL.md`, which
  the dispatch spec named but is only reached via each agent's `always_load` knowledge list, not
  the operative Step-0 pointer in any live flow file — confirmed via grep across all 6
  step-0-cowork consumers' init.md vs their actual stage-bootstrap.md files, all 11 point at
  cycle-bootstrap directly).
- Fix (both files, same guard logic, cycle-bootstrap gets the full write-up, step-0-cowork a
  condensed cross-reference): classify Step 0 errors CONFIRMED-BLIND ("no such tool"/"tool not
  found"/"unknown tool" — skip retry, tool categorically absent) vs TRANSIENT (retry once as
  before); on CONFIRMED-BLIND, do NOT call `send_telegram` (it's itself a gateway call and fails
  identically — this exact flaw is what forced 4 independent 2026-07-07 ad-hoc raw-Write
  escalations, 2 of which used divergent bespoke schemas, one silently breaking
  `drain-signals.js`'s `{from}→{to}` routing). Instead: `Write` the canonical
  fail-loud-protocol.md § Output Boundary item 5 schema directly to
  `docs/signals/<agent-id>-<ts>-gateway-blind.json`, append a DEFERRED notebook line, EXIT cleanly
  (graceful per-cycle DEFER — next `*/15` tick retries fresh, no lock held so no orphan risk).
- Files: `.claude/skills/cycle-bootstrap/SKILL.md` (primary, live-execution SSOT for all 6
  step-0-cowork consumer agents), `.claude/skills/step-0-cowork/SKILL.md` (mirrored, as named in
  dispatch spec). Left `cowork-error-boundary/SKILL.md` untouched — broader 40+-file generic
  error boundary, out of "bootstrap-stage" scope; catching gateway-blind at the FIRST gateway
  touchpoint (bootstrap) means no downstream step in the cycle is ever reached to need its own guard.
- Decision journal: `docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-agent-father.md` S2.
- Verify criterion (per dispatch spec): next bctc off-market fire produces a real
  `get_cycle_bootstrap` call OR — if still blind — a clean canonical-schema Write-fallback signal
  instead of a divergent ad-hoc one, with a graceful DEFER (not a hard STOP/crash). Handing to qa.
