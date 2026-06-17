# Agent Father — Notebook

## 2026-06-17 — FIX-FB-POSTER-FABRICATES-STALE-EOD (P1)

- Task: Edit fb-market-poster flow + init — anti-fabrication rules for per-ticker numeric spine
- Files modified: docs/agents/fb-market-poster/flow/main.md (718L→758L, +40L) + docs/agents/fb-market-poster/init.md (version bump + 2 responsibility rules + 2 forbidden_output entries) + docs/handoffs/FIX-FB-POSTER-FABRICATES-STALE-EOD-developer.md (new)
- Change A: STEP 1b renamed "HARD-REQUIRED for recap spine"; ANTI-FABRICATION RULE block added — CHEF notebooks are narrative-only; per-ticker % must trace to live get_market_snapshot this cycle; FAIL-LOUD honest-gap ("công cụ chưa trả số") when tool fails; ±7% HOSE sentinel discards physically-impossible values
- Change B: STEP 4b DATA-INTEGRITY PLAUSIBILITY GATE added after STEP 4a jargon gate; references scripts/fb-data-integrity-gate.sh (sibling task FIX-FB-POST-DATA-INTEGRITY-GATE); non-zero exit = BLOCK; gate-not-found = SKIP log (graceful pending deploy)
- Task lane: ready → review (orch-state updated atomically)
- commit-boundary: RULE 1 explicit stage ✓, RULE 2 zone check (docs/agents/ + docs/handoffs/ only) ✓

## 2026-06-16 — AF-1-LEADER-LOCK-BACKSTOP-DEFER (Root A gatherer double-fire fix)

- Task: Edit leader-lock.md — insert Backstop-Window Defer Gate (new error/timeout branch)
- File: docs/agents/cowork-team/flow/leader-lock.md (84L → 113L, +29L)
- Change: added separate code fence between LEADER_CLAIM call and claimed==true branch; keys on LEADER_CLAIM error/timeout path; defers (EXIT) when UTC.hour ∈ {0,4,8,12,16,20} AND UTC.minute < 15; proceeds outside that window
- Constraint: BOUNDARY_HOURS expressed as generic rule ("0 */4" cadence), no date literals, no slot hardcoding
- commit-boundary: RULE 1 explicit stage ✓, RULE 2 zone check (docs/agents/ + docs/agent-memory/) ✓, RULE 3 git show --name-only ✓

## 2026-06-16 — FB-POSTER-TNB-UPGRADE (Tasks A–D implemented)

- Task: Edit — insert STEP 2b (TNB 6-layer synthesis gate) + STEP 2c (T-45 adversarial gate) + extend STEP 1b + rewire STEP 3
- File: docs/agents/fb-market-poster/flow/main.md (489L → 718L, +229L)
- Task A: STEP 1b widened — get_technical_indicators, get_legal_risk_signals, get_sentiment_trend, get_earnings_calendar
- Task B: STEP 2b — 6 mandatory layers, CHEF shortcut, $tnb_synthesis per-ticker conviction schema
- Task C: STEP 2c — T-45 adversarial gate, 5 hard-fail rules (cross-ticker, false-precision, is_estimate-as-fact, noise-scale, contradiction)
- Task D: STEP 3 rewired — Phân tích reads $tnb_synthesis.regime; Dự đoán reads T-45 survivors; known_gaps blocks fabrication
- Commit: 4bcf50b2 · push BLOCKED (dirty tree cowork churn); commit local per feedback_push_blocked_by_perpetual_dirty_tree

## c297 · 2026-06-14 — FIX-MCP-TOOL-PARAM-SCHEMA-DRIFT-DOCS (P2)

- Task: Edit (param schema drift fix) — 7 tool schemas corrected in list/ + package/ + flow docs
- B3 get_bctc_full: ticker→code | B6 get_patterns: ticker+pattern_type→{stockCode,eventKeyword} | B7 get_sentiment_trend: stock_code req | B8 get_kinhdich_reading: ticker→code | B9 get_agent_signals: agent req | B11 get_market_summary: period req | get_financial_summary: code→actionCode
- Commit: 0e81b642 · pushed main

## c296 · 2026-06-13 — factory hygiene: dashboard-protocol + signal prune

- dashboard-protocol.md size-justification updated 80L → 190L (§WRITE/§READ/§PRUNE always co-loaded)
- Removed stale signals: context-bloat, orch-state-read-discipline, origin-lag-push-discipline
- Commit: 0ce17639 · pushed → origin/main..HEAD = 0

## c295 · 2026-06-13 — agent-md-factory recheck pass-5 (2h cycle)

- Agents scanned: 41 init.md + 42 .claude/agents/*.md | Auto-fixes: 0 | Escalations: 0 | Orphans: 0
- All frontmatter line-1 checks pass; all SKILL.md refs resolve; no new drift since pass-4
- Lesson: head -3 not head -1 for size-justification presence (YAML frontmatter on line 1)

## c300 · 2026-06-15 — FIX-CHEF-INTRADAY-MARKER-CADENCE

- Task: Edit chef.md Step 0.5 — cadence-derived publish marker key + TTL
- Root: single marker key blocked every intraday tick after first; chef-intraday fires 7×/day
- Fix: generic cadence detection from cowork-schedule.json cron field; multi-fire → per-window key + TTL=3600; single-fire → per-date key unchanged
- Files: 1 (chef.md 350L→391L). No rebuild required.

## c301 · 2026-06-17T14:50Z — DESIGN-GATHERER-EXEC-PROOF-FAILLOUD (EP-1..EP-4)

- Task: Implement architecture brief gatherer-exec-proof-failloud (brief 6eb16082 → impl cbbe2e2d)
- EP-1: Created .claude/skills/exec-proof-gate/SKILL.md — generic terminal gate; EXEC_PROOF_1 (notebook TS >= cycle_start_utc) + EXEC_PROOF_2 (fetch_result_count > 0 AND macro fetchedAt >= cycle_start_utc); FAIL path: BUG telegram + signal file + notebook entry + EXIT; no log_agent_work(completed)
- EP-2: Patched .claude/skills/cycle-bootstrap/SKILL.md — "Execution Proof Bootstrap" section; CYCLE_START_UTC anchor captured post-bootstrap; exec-proof-gate mandate added
- EP-3: Patched docs/agents/news-scout/flow/stage-log-notify.md — Step 3e gate before log_agent_work(completed); explicit CYCLE_START_UTC/NOTEBOOK_PATH/FETCH_RESULT_COUNT/FETCH_MACRO_TS/AGENT_ID
- EP-4: Patched docs/agents/market-watcher/flow/cycle.md — Step 4e gate before WORK ping; items_fetched / MACRO_HEALTH.fetchedAt bindings
- GENERIC: one shared skill, both gatherers inherit; no per-agent hardcode; no date literals
- agent-md-factory: P-1..P-6 ✓; Q-3 exec-proof-gate 75L <= 80L ✓; Q-1 no duplicates ✓
- commit-boundary: RULE 1 explicit 4 files ✓, RULE 2 zone (.claude/skills/ + docs/agents/ only) ✓, RULE 3 git show --name-only exact 4 ✓
- Signal: docs/signals/agent-father-20260617T145010Z.json → board flip DESIGN-GATHERER-EXEC-PROOF-FAILLOUD in_progress → review; next_agent=qa
- No rebuild required. PUSH held per brief. QA live test: next offhours gatherer ~16:00Z
