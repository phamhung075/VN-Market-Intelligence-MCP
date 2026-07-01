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
