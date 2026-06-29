# Agent Father — Notebook

## 2026-06-28 — CROSS-SESSION-MULTI-TEAM-ORCH P3-AF-1 (TASK_1994)

- Task: Fire-time leader election implementation — 5 items per P3 addendum (TASK_1993 REVIEW, design verified)
- Period-key scheme: `cron:<flow-slug>:<YYYY-MM-DDTHH:MMZ>` where TICK = floor(fire_time) to scheduled boundary (ISO-8601 UTC, minute precision). Key insight: date-range string in dispatch-claim SKILL namespace table was the WRONG formula for fire-election (that's artifact dedup); corrected.
- Election layer: DISPATCHER-LEVEL. Per-slot Step 4.6 claims unchanged.
- SF-1 ordering (dev-team): SF-1 (TTL=5400s) first → fire-election (TTL=600s) second → on loss: release SF-1 + EXIT. Independent task_ids → no deadlock.
- Lease: TTL=600s, NO heartbeat, explicit task_release at every exit path (normal + error).
- 9 files modified; 1 full rewrite (leader-lock.md); handoff [Developer] written; notebook written.
- Activation gate documented in 4 places; OBSERVE-ONLY conventions stay as FALLBACK until TASK_1995 P3-QA.
- Live peer (eb8b5309, dev-team) protected: dev-team/flow/main.md changes are additive in PREFLIGHT body only; peer already past PREFLIGHT on current tick.
- TASK_1994 → REVIEW via orch-apply.sh. Blocks: TASK_1995.

## 2026-06-28 — CROSS-SESSION-MULTI-TEAM-ORCH P2-AF-2 (TASK_1991)

- Task: Wire roster READ (Phase A.5) into router step 2.5 — between orphan-probe (Phase A) and PRE-CLAIM (Phase B)
- Files: `CLAUDE.md` (Phase A.5 block in step 2.5) + `.claude/skills/dispatch-claim/SKILL.md` (§ Phase A.5 new section)
- Phase A.5 pattern: `task_list_held(kind="session-presence")` READ-ONLY; log compact roster; duplicate agent_id → WARN non-blocking; never gates dispatch
- Ordering enforced: Phase A (orphan-probe) → Phase A.5 (roster read) → Phase B (PRE-CLAIM)
- Decision journal: `docs/agent-memory/decisions/sprint-CROSS-SESSION-MULTI-TEAM-ORCH-p2-af2-agent-father.md`
- No rebuild required; zero runtime change

## 2026-06-28 — CROSS-SESSION-MULTI-TEAM-ORCH P2-AF-1 (TASK_1990)

- Task: Dispatcher presence self-registration — docs/flow/skill only, zero rebuild
- Files: `.claude/skills/dispatch-claim/SKILL.md` (§ Step 0a new), `.claude/skills/task-lock/SKILL.md` (§ Session-Presence Row — P2 new), `docs/agents/cowork-team/flow/main.md` (Step 0b split), `docs/agents/dev-team/flow/main.md` (PREFLIGHT presence claim + Step 3 heartbeat), `docs/handoffs/TASK_1990.md` ([Developer] section)
- Payload structure: `{agent_id, host, started_at, current_task}` on all presence rows; `task_kind="session-presence"`, `ttl_seconds=1800`
- Key constraint: task_heartbeat does NOT update payload (confirmed coordinationStore.ts:667-691); current_task update via release+reclaim (optional advisory)
- Non-adoptable invariant sourced from code: `ORPHAN_EMIT_ALLOW_LIST` at coordinationStore.ts:395 explicitly excludes `session-presence` (line 392)
- Presence placed BEFORE SF-1 in dev-team so session is visible even on early-exit ticks
- Decision journal: `docs/agent-memory/decisions/sprint-CROSS-SESSION-MULTI-TEAM-ORCH-p2-af1-agent-father.md`

## 2026-06-28 — CROSS-SESSION-MULTI-TEAM-ORCH P1.5-AF-1 + P1.5-AF-2

- Tasks: TASK_1986 (router adoption probe) + TASK_1987 (dev-team orphan drain) → both REVIEW
- Files: `.claude/skills/dispatch-claim/SKILL.md` (+Orphan-Adoption Probe section), `CLAUDE.md` (step 2.5 Phase A/B), `docs/agents/dev-team/flow/main.md` (Step 0a → 0a-A + 0a-B), both handoff [Developer] sections
- Key pattern: Phase A probe (task_list_held read-only) fires BEFORE Phase B PRE-CLAIM on every dispatch; router DEFERS tree-hygiene to dev-team; dev-team does git status --porcelain + git checkout -- before any resume
- All 4 DoD-P15 locks baked: 1=router defers hygiene, 2=task_list_held read-only for published artifacts, 3=redispatch_count carry-forward, 6=honest-bound line verbatim
- Contract sourced from TASK_1983 [Developer] section: orphan-signal task_id = "orphan-signal:<original_task_id>"; payload carries {original_task_id, original_task_kind, original_owner_client_session, owner_agent, last_payload, orphaned_at, redispatch_count}
- Commit: 9b2ef39a | push OK (tsc pass)

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

## 2026-06-24 — FEAT-PREDICTION-CLAIMS-DAILY-CADENCE (Sprint S2/prediction-claims)

- Task: Create daily-predict.md + edit main.md + init.md + cowork-schedule.json per architect brief 2026-06-24-prediction-daily-cadence.md
- Commit: 048cd3e4 (all 4 files, single atomic commit per brief §10)
- daily-predict.md (101L): reuses monday.md P-3..P-5 pipeline; cap=3/day; honest NO-OP on flat days; WORK-only channel
- main.md (137L): DAILY-PREDICT DEDUP GATE (key published:digest-daily:UTC_DATE, TTL=86400s, non-Sunday only); dispatch table adds daily 17:30 UTC slot
- init.md (138L): constraints per-day=3, weekly-ceiling=15; schedule.daily_predict block; daily_predict inter_agent receive entry
- cowork-schedule.json: digest-daily slot after digest-sunday; cron 30 17 * * *; trigger_prompt uses main.md; guaranteed=true; last_fired=null
- signal prediction-daily-cadence-20260624T150457Z.json moved to processed/ before this session
- weekly.md + monday.md untouched (verified git log: not in 048cd3e4)
- Task status: DONE (orch-state confirmed); test-fire AC-1..AC-7 needed before done_verified

## 2026-06-24 — F-EVENING-QUALITY-OVERCLAIM (HIGH) — chef.md Step 7.5 quality gate

- Task: Edit unified-agent chef.md — add deterministic Step 7.5 QUALITY VERDICT GATE
- Root: evening dish (c98 audit MARKET #866) self-reported "QUALITY: full" at 3.5/6 — L2 absent w/ no gap token, L4 1.5/4 pillars, L6 gap catalogue not enumerated
- File: docs/agents/unified-agent/flow/chef.md (444L → 509L, +65L)
- Change A: size-justification header updated (430L → 509L, new entry for gate)
- Change B: Step 7.5 inserted (lines 377–429) — 3-part checklist: (a) L2_OK (US macro walked OR explicit gap token written), (b) L4_PILLARS_OK (all 4 pillars cited OR flagged-missing), (c) GAP_CATALOGUE_OK (no partial layers OR gap catalogue enumerated with ≥1 [gap:X]); single FALSE forces $QUALITY_VERDICT="degraded" + conviction cap MEDIUM; doubt-favors-degraded rule; all dish windows enforced; intraday silent-exit exempt (no layer-walk)
- Change C: Step 8 Step 1d notebook template — "Layers walked" field now uses $LAYERS_WALKED_SUMMARY; "QUALITY" field added using $QUALITY_VERDICT (both sourced from Step 7.5)
- Change D: RETURN block — "QUALITY: full" hardcode removed; uses $QUALITY_VERDICT; degraded variant + silent-exit exempt variant explicitly stated
- EOD path: unchanged (Step 1 degraded-dish floor + Step 6.5 conviction LOW rule already wired; Step 7.5 now captures the same discipline uniformly)
- No shared skill (gate is chef-specific per TNB 6-layer structure; no DRY violation)
- agent-md-factory: P-1..P-6 ✓; Q-1 no duplication (gate only in chef.md) ✓; Q-3 size-justification comment present ✓; Q-5 diff summary in RETURN ✓
- No rebuild required (flow-doc change only)

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

## c302 · 2026-06-29T00:00Z — TASK_1996 FB-COWORK-FOLD: add fb-daily + fb-weekend slots
- Change: Added slots fb-daily (cron="15 9 * * 1-5", 09:15 UTC/16:15 VN) and fb-weekend (cron="13 13 * * 6,0", 13:13 UTC/20:13 VN) to docs/data/cowork-schedule.json; added fb-market-poster to cowork-team Team Boundary scheduled list in docs/agents/cowork-team/flow/main.md
- Files modified: 2 (+ orch-state.json via orch-apply.sh)
- Cascade: none — JSON is read live each tick; .md read at spawn; no rebuild needed
- Validation: JSON parses (21 slots total), field set 19/19 matches digest-sunday template, no duplicate slot_ids, Team Boundary line 9 updated
- Decision: fb-weekend minute shifted :07→:13 (boundary-safe near :15 dispatcher tick, within ±2); depends_on="chef-eod 08:45 UTC + 30min" for fb-daily per PO task note; policy_id=null (pure-cron guaranteed); cowork fold removes DST-sensitive France-local CronCreate dependency
