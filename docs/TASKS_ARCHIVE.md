# TASKS Archive — VN Market Intelligence MCP

Index of completed sprints. Full details in `docs/archive/` files — load only when needed.

Active board → `TASKS.md`

---

## Archive — Added 2026-05-18 by PO c200 (Sprint 1949/1950/1951a-d rotation)

**Period:** 2026-05-18 | **Rows archived:** 11 (Sprint 1949/1950/1951a-d Done rows — sprints closed, freeing TASKS.md headroom for new Sprint 1952 Backlog entries)

| Task ID | Title | Priority | Type | Owner | Completed |
|---------|-------|----------|------|-------|-----------|
| SPIKE-1951d | DONE 2026-05-18 PO — Option C accepted (hourly fallback for 4 sub-hourly slots); brief §2.4 updated; follow-up 1951e. | HIGH | SPIKE | po | 2026-05-18 |
| 1951a | DONE 2026-05-18 PARTIAL — 12/16 RemoteTriggers created; 4 failed (cron <1h rejected); commits bb4ed0c3 + 2cc526a2. | HIGH | TASK | agent-father | 2026-05-18 |
| MAINT-1950b | DONE 2026-05-18 — Archived 5 oversized agent notebooks (>200L cap) to docs/archive/notebooks/. Live notebooks truncated to ≤200L. | LOW | MAINT | agent-father | 2026-05-18 |
| MAINT-1950c | DONE 2026-05-18 — semble-search YAML model field added; 2 orphan news-scout notebooks moved to archive. | LOW | MAINT | agent-father | 2026-05-18 |
| MAINT-1950d | DONE 2026-05-18 — Cleaned workflow-map.md L103 stale "monday predict" residue; verified cron-jobs.md SSOT unchanged. | LOW | MAINT | agent-father | 2026-05-18 |
| SPIKE-1951a | DONE 2026-05-18 — Resolved OQ-1/OQ-2/OQ-3; RemoteTrigger MCP tool identified; Sprint 1951 Phase 1 unblocked. | HIGH | SPIKE | claude-code-guide | 2026-05-18 |
| MAINT-1950a | DONE 2026-05-18 — Removed 3 stale agent-memory test files: task-lock sandbox, pre-dispatch debug, finalization check. Freed 48 KB. | LOW | MAINT | system-auditor | 2026-05-18 |
| 1950-PILOT-FEASIBILITY | DONE 2026-05-17 — Pilot feasibility proof-of-concept shipped 2026-05-14; 3 agents operational since. Archived per 1950-close signal. | HIGH | RESEARCH | architect | 2026-05-17 |
| 1949-PHASE2-SCOPE-EXPANSION | DONE 2026-05-16 — Phase 2 scope expanded 6→9 goals; risk gates documented; architect sign-off 2026-05-15; signal processed. | HIGH | SCOPE | architect | 2026-05-16 |
| MAINT-1950e-LEGACY-CLEANUP | DONE 2026-05-18 — Removed 2 deprecated agent files (pre-1950 dispatch pattern). No active references. | LOW | MAINT | agent-father | 2026-05-18 |
| 1951-OPEN-QUEUE | DONE 2026-05-18 — Sprint 1951 queued; Phase 1 ready for kickoff. PO c192 dispatch signal ready. | HIGH | META | po | 2026-05-18 |

---

## Archive — Added 2026-05-24 by claude-manager-helper (Backlog + Done pruning for TASKS.md ≤80L compliance)

**Period:** 2026-05-24 | **Rows archived:** 86 (Phase 0/2 Backlog tasks + Done section rows — archived to meet TASKS.md ≤80L invariant; Phase 0/2 active tasks retained in TASKS.md)

## Backlog

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| TASK_P0-1 | **NEW 2026-05-22T18:00Z (pm dispatch Phase 0 pilot tasks)** — Create `docs/data/bug-inventory.json` baseline (G10 metric). Scan last 60 days: git log + docs/signals + agent notebooks. Extract: bug-id, module, fixCycles, status, date. Schema per charter §Baseline Metric Capture. Min 20 bugs. `baselineCycleCount` = avg fix cycles for TA bugs or system-wide 4-6. AC-1..AC-5: file exists, valid JSON, ≥20 bugs, TA-specific or system baseline, status field valid. Estimate: 2h. Size=M. Zone=`docs/data/`. Owner=system-auditor (audit authority). Pilot=technical-analysis. Phase=0. Unblocks Phase 0 exit gate verification. | HIGH | TASK | system-auditor | docs/handoffs/TASK_P0-1-bug-inventory.md | — |
| TASK_P0-2 | **NEW 2026-05-22T18:00Z (pm dispatch Phase 0 pilot tasks)** — Create `docs/data/pilot-status.json` SSOT for 12 goals + decision matrix. Initialize all G1-G12 to `TBD`, decision matrix (speed/trust/scale) to `TBD`, status to `ACTIVE`, `sprintKickoff`/`sprintDeadline` to TBD. Schema per charter §Status Tracking (6-field goals dict, 3-field decision matrix). AC-1..AC-4: file exists, valid JSON, all 12 goals present, decision matrix present, all fields valid. Estimate: 1h. Size=S. Zone=`docs/data/`. Owner=architect (specification contract). Pilot=technical-analysis. Phase=0. PO uses file to gate Phase 0→1 transition. | HIGH | TASK | architect | docs/handoffs/TASK_P0-2-pilot-status.md | — |
| TASK_P0-3 | **NEW 2026-05-22T18:00Z (pm dispatch Phase 0 pilot tasks)** — Verify or create `flows/dev-technical-analysis/main.md` + `.claude/agents/dev-technical-analysis.md`. Check existence; if missing, create via agent-md-factory standards. Flow MUST include G12 hard rule: "Do not mark task DONE until sandbox dashboard shows all TA scenarios green." AC-1..AC-5: files exist, YAML frontmatter valid, G12 rule present, factory compliance, load without errors. Estimate: 1h. Size=S. Zone=`.claude/`. Owner=agent-father (factory authority). Pilot=technical-analysis. Phase=0. Flow enables dev-technical-analysis zone dispatch for Phases 1-3. | HIGH | TASK | agent-father | docs/handoffs/TASK_P0-3-dev-ta-flow.md | — |
| TASK_P0-4 | **NEW 2026-05-22T18:00Z (pm dispatch Phase 0 pilot tasks)** — Audit `apps/technical-analysis/` (read-only). Identify all 9 src files + current composition-root-equivalent. Document findings in `docs/architecture-briefs/2026-05-22-refactor/p0-4-composition-root-plan.md`. Output: current state analysis, issues found, clean rewrite plan per DDD (composition-root.ts wires module only, no business logic). AC-1..AC-5: audit complete, 9 files documented, plan sufficient for Phase 1 dev rewrite, G3 gates referenced, DDD compliance scoped. Estimate: 2h. Size=M. Zone=`apps/technical-analysis/`. Owner=dev-technical-analysis (zone owner, read-only). Pilot=technical-analysis. Phase=0. Plan unblocks Phase 1 composition-root rewrite (G3 goal). | HIGH | TASK | dev-technical-analysis | docs/handoffs/TASK_P0-4-composition-root-plan.md | — |
| 1965d-JANITOR-PATHFIX | **NEW 2026-05-22T03:22:35Z (po c247 cron-0307Z dispatch)** — tasksMdJanitor cron #1 fired at 03:00Z and logged `done — held=1 divergences=0 errors=2`. Both errors are container-path resolution bugs: (1) `R-2 pipeline-state.json not found` + (2) `R-3 TASKS.md not found`. Root cause: `apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts:501` uses local helper `const projectRoot = resolve(import.meta.dir, "..", "..", "..", "..", "..");` which resolves to `/` inside container (not `/app`). Identical anti-pattern to 1960-DAILYDASH (just shipped as 2f0a74e9). docker-compose mounts files at `/app/docs/...`; janitor looks at `/docs/...` → ENOENT. Fix: (1) replace local helper with `import { getProjectRoot } from "../../infrastructure/projectRoot.js"`; (2) add lint test under `apps/mcp-server/src/__tests__/lint/` that fails build if any scheduler file matches regex `const projectRoot\s*=\s*resolve\(import\.meta\.dir`. AC-1: tasksMdJanitorJob.ts imports getProjectRoot, local helper removed. AC-2: lint test GREEN (scans scheduler/ tree, asserts zero matches). AC-3: tsc 0 errors. AC-4: smoke-tasks-md-janitor.ts still 12/12 GREEN. AC-5: post-deploy next 03:00Z janitor fire (23T03Z) logs `errors=0`. Soak coupling: this fix RE-VALIDATES OBSERVE-1965c-soak final pass on 23T03:00Z (soak ends 23T18Z); c247 declares pass #1 (this cycle) as OBSERVE-AMBIGUOUS (no crash, no BUG flood, but errors!=0) and defers final SOAK_PASS/FAIL verdict to qa-1965c-soak-result.json post-23T18Z. Estimate: 1h. Size=XS. Zone=`apps/mcp-server/`. Owner=dev-mcp-server. NFR-3 BCTC-freeze: not BCTC-touching, NOT blocked. Recurring-bug-escalation: this is 2nd projectRoot-anti-pattern fix in 4h (after 2f0a74e9 DAILYDASH), but grep confirms tasksMdJanitorJob.ts:501 is the LAST occurrence in the codebase — AC-2 lint test seals the regression door, so no architect rethink needed (closing not chasing). | HIGH | FIX | dev-mcp-server | docs/signals/po-c247-cron-0307Z-batch-fix.json | — |

(Abbreviated: 82 additional Backlog + Done rows archived. See git history for full content prior to 2026-05-24.)

---

## Done

(80+ Done rows archived from TASKS.md. See git history for full content prior to 2026-05-24.)

---

## Archive — Added 2026-05-26T14:30Z by PO (dev-team triage) — Deep-Module Refactor Rollout 11/11 + Frontend (3 closed sections)

**Period:** 2026-05-25 → 2026-05-26 | **Sections archived:** 3 (Frontend SCALE Pilot Phase-0/1/2 full ledger; mcp-server SCALE Pilot Phase-0/1 full ledger; BUILD-WAVE SEQUENCING governance). Reason: the 2026-05-22 three-tier deep-module+DDD rollout reached its end-state — both remaining pre-0 pilots terminally closed verdict=scale; the "rebuild + verify the 2 last services" goal is ACHIEVED. Authoritative state = the two pilot-status SSOT files (NOT the board). Full per-task detail in git history at HEAD~ of this archive commit.

| Sprint / Section | Terminal state | Close SHA | SSOT |
|---|---|---|---|
| Frontend SCALE Pilot (Phase 0 + Phase 1 MVR WAVE-A + Phase 2 P2-A..Z) | **DONE — 10/12 YES + G3/G5 N/A-justified, verdict=scale, decisionMatrix 3×YES.** G9 graded via ops live-recheck (Playwright 4/4 vs live :3001 + macro keyed-object fix a0364390), NOT user verbal sign-off (awaitingUserG9Signoff RETIRED). Container rebuilt FE-REBUILD 2026-05-25T19:31Z (605035cf) + P2-H 13fe4167. | `2f33d871` (PO close) + `c7f184ad` (pipeline-state) ; QA P2-Z `723ef803` | `docs/data/pilot-status-frontend.json` |
| mcp-server SCALE Pilot (Phase 0 + Phase 1 host-side P1-A..H + P1-QA/EXIT) — FINAL/11th | **DONE — 12/12 YES, verdict=scale.** Deep-module rollout 11/11 COMPLETE. | `8972a155` (2026-05-26T07:40Z) | `docs/data/pilot-status-mcp-server.json` |
| BUILD-WAVE SEQUENCING (PO governance) | **EXECUTED — A frontend → B mcp-server-SOLO → C ops rebuild → D QA all complete.** No open wave remains. Concurrency policy (serialized BUILD, mcp-server RUN-SOLO) honored throughout. | — | — |

**Lessons preserved:** frontend is the FIRST pilot with terminal N/A-with-justification goals (G3 Remix=composition-root; G5 no prior mcp-server location) — N/A excluded from the YES tally, 12-goal set reduces to 10 gradeable, all YES. mcp-server G5 was the INVERSE goal (remove dead/migrated tool code, every handler proven HTTP-routed). G9 trust-verification = ops live-recheck per `feedback_trust_verification_is_system_job` (NOT user verbal sign-off) — applied consistently to both terminal closes.

---

## Archive — Added 2026-05-26 by PO (dev-team :07 triage — net-reduce closed news-fetch + NF-LD ledgers)

**Period:** 2026-05-24 | **Sections archived:** 6 (News-Fetch SCALE Pilot Phase 0/1/2 full ledgers; NF-LD live-data follow-on; NF-LD-4 served-dashboard; NF-LD-5 refresh-button). Reason: all six are terminally closed or PO-signed-off with only an ops-deploy gate outstanding — they carried ~170 lines of per-task detail that the SSOT files + git history already hold. Pulled to keep TASKS.md under the 80-line working board norm during the FETCH-ANALYZE FIX dispatch. Full per-task detail in git history at HEAD~ of this archive commit + the handoff files cited.

| Sprint / Section | Terminal state | Close SHA | SSOT / Handoff |
|---|---|---|---|
| News-Fetch SCALE Pilot Phase 0 | **CLOSED 2026-05-24T07:34Z (P0-NF-EXIT PASS).** All 5 deliverables DONE + architect verification. Anchor `news-fetch-pre-refactor` @ 31483c8c. | P0-NF-EXIT (PO) | `docs/data/pilot-status-news-fetch.json` |
| News-Fetch SCALE Pilot Phase 1 | **CLOSED/APPROVED 2026-05-24T08:39Z.** All 10 tasks DONE; QA close-gate APPROVED `c8a2f7cb`; 7 goals EARNED-PENDING. | `c8a2f7cb` (QA) | `docs/data/pilot-status-news-fetch.json` |
| News-Fetch SCALE Pilot Phase 2 — PILOT DONE | **CLOSED 2026-05-24T09:45Z. 12/12 YES, goalsEarned=12, verdict=scale (6th pilot to SCALE).** QA P2-NF-Z `41e4b2ce` → PO terminal atomic close. | `41e4b2ce` (QA) ; closure `po-news-fetch-closure-20260524T094500Z.json` | `docs/data/pilot-status-news-fetch.json` |
| NF-LD live-data inspection view | **DONE + CLOSED 2026-05-24T17:58Z (PO NF-LD-EXIT).** Read-only `GET /api/news-fetch/live` on mcp-server over real `rag_analyses`; pilot 12/12 frozen. | `5a91e12f` + `45fd7f74` ; QA `59bd79f7` | `docs/handoffs/TASK_NF-LD.md` |
| NF-LD-4 served dashboard | **PO SIGNED OFF 2026-05-24T20:05Z (Option B: serve from mcp-server:3000 /dashboards/news-fetch/).** Terminal gate was NF-LD-4-OPS (ops rebuild + prove served URL 200). | `e160fe04` + `6b012fc8` + `d32398f4` ; QA `a315ac99` | `docs/handoffs/TASK_NF-LD.md` |
| NF-LD-5 refresh button (MVP) | **PO SIGNED OFF 2026-05-24T21:35Z.** Refresh/Load-latest button re-calls existing endpoint, no new write path. Terminal gate was NF-LD-5-OPS (ops rebuild + prove button live). | `12600a1f` + `15d9b034` ; QA `2a02d3e3` | `docs/handoffs/TASK_NF-LD.md` |

**Lessons preserved:** (1) news-fetch is a STATELESS scraper with NO DB — live-data view MUST be a read-only mcp-server route over `rag_analyses`, never give the scraper DB creds (design-regression guard). (2) Served-dashboard Option B (same-origin from mcp-server:3000) removes the CORS/`file://` degrade risk class; anti-drift gate = committed served copy must equal `sync-news-fetch-dashboard.sh` output (idempotent md5). (3) NF-LD-4/5 ops-deploy gates may still be outstanding — verify the running mcp-server image carries `15d9b034`+ before declaring the served dashboard + refresh button live; the FETCH-ANALYZE ops rebuild this tick will also pick these up if not yet deployed.

---

## Archive — Added 2026-05-29 by claude-manager-helper (Governance context-bloat cleanup: 6 completed sprints)

**Period:** 2026-05-27 → 2026-05-28 | **Sprints archived:** 6 (HCM-DISAMBIG, MACRO-LIVE-PRICES, NEWS-FULLDAY, RECAP-CMD, NEWS-CMD, and partial PDF-INSPECT). Reason: 6 sprints signed off by PO across 2026-05-27/28, carrying ~360 total lines of per-task detail. Archived to bring TASKS.md under the 80-line working-board cap while preserving complete history in git + archive file for future reference.

| Sprint | Terminal state | Close DateTime | SSOT / Goal |
|--------|---|---|---|
| HCM-DISAMBIG | **DONE @2026-05-28T HCM-EXIT.** QA 6/6 ACs APPROVED @a2ff3356. Zone: mcp-server (newsNormalizer.ts + chef.md). SPRINT-S sizing. | 2026-05-28T | `docs/SPRINT_GOAL_HCM-DISAMBIG.md` |
| MACRO-LIVE-PRICES | **DONE @2026-05-27T22:36:00Z MLP-EXIT.** PO re-verified END-TO-END: oilUsd 92.86 / goldUsd 4488.5 / usdVnd 26273 (live, not fixture). Escalation #3003 RESOLVED. Zone: macro-indicators. SPRINT-S Option A. | 2026-05-27T22:36Z | `docs/SPRINT_GOAL.md` |
| NEWS-FULLDAY | **COMPLETE @2026-05-27T22:41:51Z NEWS-FD-EXIT.** Success Metric MET; deployed @ 99f433ec. PO user-initiated (explicit `/news` refinement signal). Full-day deduped importance-ranked coverage. Zone: mcp-server `handleNews`. | 2026-05-27T22:41Z | `docs/SPRINT_GOAL_NEWS-FULLDAY.md` |
| RECAP-CMD | **COMPLETE @2026-05-27T22:41:51Z RECAP-EXIT.** Success Metric MET; deployed @ 99f433ec. PO user-initiated (`/recap /recapw /recapm` commands). Sibling of NEWS-FULLDAY, same ops rebuild. Zone: mcp-server `telegramCommands.ts`. | 2026-05-27T22:41Z | `docs/SPRINT_GOAL_RECAP-CMD.md` |
| NEWS-CMD | **DONE @2026-05-27T20:52:50Z NEWS-CMD-EXIT.** All ACs MET. PO signed off (user-initiated `/news` Telegram command). Zone: mcp-server. Goal-armed on user-comprehensibility axis (verbal G9). | 2026-05-27T20:52Z | `docs/SPRINT_GOAL.md` |
| PDF-INSPECT | **DONE + CLOSED @2026-05-24T19:34Z (2 reopens for real-data defects).** Zone migrated mcp-server; impl owner dev-mcp-server; user-facing URL `http://localhost:3000/api/bctc-inspect` LIVE. Read-only inspector over real `market.db`. POST-PILOT feature; pilot frozen 12/12. | 2026-05-24T19:34Z | `docs/handoffs/TASK_PDF-INSPECT.md` |

**Lessons + Notes:**
- (1) HCM-DISAMBIG: forward-hardening on ticker TP.HCM city disambiguation. Follows existing guard in Task 1788 (live prod proof #4144). SPRINT-S scope: no schema/microservice/cron change. Chef.md format-rule + extraction code GEOGRAPHIC_CONTEXT_MAP 2-entry extend.
- (2) MACRO-LIVE-PRICES: real-time oil/gold/usdVnd provisioning for get_macro_snapshot. PO verified live values via the same MCP JSON-RPC path that external tools use (no bypass). 26h staleness bound. Separate MACRO-RATES-LIVE (carry/yield VND/Fed rates) backlogged as later sprint.
- (3) NEWS-FULLDAY + RECAP-CMD: pair of user-initiated feature requests arriving simultaneously 2026-05-27 21:34–21:41Z. Each is single-zone mcp-server (same 99f433ec rebuild). NEWS-FULLDAY refines `/news` (full-day deduped list); RECAP-CMD adds `/recap /recapw /recapm` (day/week/month synthesis). No overlap; each single-purpose. Sibling rebuild → shared ops rebuild cycle. PO verified live comprehensibility + plain-VN (no jargon).
- (4) NEWS-CMD: precursor to NEWS-FULLDAY (earlier `/news` Telegram command). First user-initiated sprint opened 2026-05-27 19:50Z. Goal-armed on comprehensibility axis; machine-checkable ACs all MET (QA 60/0 tests green, tsc 0, live handler routing correct). User verbal G9 sign-off pending but not a blocker per [[feedback_trust_verification_is_system_job]].
- (5) PDF-INSPECT: demoted from pilot-track scale task to dev tool (side-by-side PDF / extracted-text inspector). Real-data reopens 2x (2026-05-24) revealed zone migration need: BCTC data lives in mcp-server market.db, NOT pdf-extractor sandbox db. Final state: live at mcp-server:3000/api/bctc-inspect, read-only over real table. Post-pilot feature; pdf-extractor Phase 1 continues (WIP=1 sequential sandbox runners).
