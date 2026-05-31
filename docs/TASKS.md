# TASKS — VN Market Intelligence MCP

> **Active sprints only.** Historical: `docs/TASKS_ARCHIVE.md` | WIP≤2 | Decisions: `docs/po-decisions/` | Goals: `docs/SPRINT_GOAL.md`

---

## Closed sprints (live follow-ups only — full records in briefs/archive)

- BCTC-TRUST-RED ✅ e0c900d0 → FU-TRUST-REFRESH ✅ EXIT-WITH-CAVEAT 2026-05-31 → BANK-AWARE-BCTC ✅ PO-EXIT 2026-05-31 (941bf552 HYBRID; QA 040409f9; live img 7f413304; ACB B02-TCTD serves raw + FPT B01-DN 0-regression, both router-raw-verified; 🔄 FU-BANK-CODECOL below) · BCTC-AI-INPUT-TAB ✅ b4ed9266 · BCTC-HUMAN-CONFIRM ✅ 441f8e18 · BCTC-AGENTIC-REFINE ✅ 🔄 AR-FU-DETERMINISM DEFERRED · DATA-PIPELINE-INTEGRITY ✅ 🔄 FU-C DEFERRED ⏳ FU-MON (Monday) · BCTC-TABLE-BOUNDARY ✅ FU-BTB-OCR registered
- DYN-WF-FOUNDATION ✅ DWF-EXIT 2026-05-31 (84643927…eee22112) · DWF-PHASE1 ✅ P1-PO-EXIT 2026-05-31 (5a19485e…38d241c5) ⛔ Phase 3+ DEFERRED · MACRO-CMDTY-DELTA ✅ PO-EXIT 2026-05-31 (e510e5df…fdc17265) 🔄 FU-MON · FF-DEAD ✅ fixed 0cbce0b4 ⏳ FU-MON · PEK-INTEGRATE ✅ DONE-PENDING-G9 2026-05-28 (12 corpus has_pek:true; awaits USER verbal G9)
- BRIEF-SECTOR-DRIFT ✅ DONE/QA-APPROVED 2026-05-31 (4670393a BSD-1+2 · ef146e1a+61b0e224 BSD-3) — VNH/PLX/GVR brief sector→seed SSOT; **Sector**: line dropped from template+43 briefs+2 flows (drift structurally impossible); test 4/4, tsc 0, zone-split clean

---

## Sprint FLEET-HOST-SAFETY — on this 16GB host the full fleet must NEVER be `up` (theme: AUDITOR-NO-DESTRUCT + DRAIN-INJECTION-SAFE + A-01-EXPECTED-SET)

**Status:** BACKLOG 2026-05-31. **Pri: HIGH (AUD-ND-1, DRAIN-INJECTION-SAFE) / MEDIUM (A-01).** Zone: agents-architect (policy) → agent-father (auditor .md/flow) + cross-service (dev-team drain script). Root: intended runtime = minimal mcp-server + mcp-gateway only; the other 11 compose svcs are dev-zone/Factory-v2, NOT deployed; any path that starts/restarts them (or false-flags their absence) risks host kernel panic (project_host_memory_panic). Three live triggers in two ticks.
- 🔄 **AUD-ND-1 (agents-architect → agent-father)** — system-auditor flow MUST be detect/PLAN-ONLY: forbid ALL destructive/runtime-mutating shell ops (docker stop/kill/rm/restart, compose down, kill, rm -rf of live dirs). Any "remediation" emits a signal/DASHBOARD row, never acts. Add explicit "NEVER run destructive docker/kill/rm" invariant to auditor .md + guard/allowlist narrowing effective Bash to read-only probes. AC: simulated ENOSPC false-positive → DASHBOARD/signal row + ZERO infra mutation; invariant present in flow; regression note links incident (9c381ed3 + Telegram report 3016). Trigger: 2026-05-31 21:08Z P0 false-positive A-30-HOST-DISK ENOSPC → auditor `docker stop` mcp-server → ~9–129min outage. Route po→architect→agent-father.
- 🔄 **DRAIN-INJECTION-SAFE (agents-architect → agent-father; cross-service drain script)** — dev-team `drain-signals.md` MUST forbid interpolating signal/agent-authored payload text into a shell command line (a cowork payload held backtick `docker compose up -d` → /bin/sh command-substitution STARTED THE FULL FLEET; router stop+rm 11 in ~2min, host 62% free, no panic). Fix: DB writes via temp-SQL-file `sqlite3 db < file.sql` or bun:sqlite bound-params (no shell); add invariant + guard note; optional host defense blocking `compose up` of non-runtime svcs. AC: a payload containing backticks/$()/quotes drains with docker ps unchanged before/after AND the DB row written correctly (anomaly absent 7 days). Pri HIGH. Route po→architect→agent-father.
- 🔄 **A-01-EXPECTED-SET (agents-architect → agent-father; sibling AC of AUD-ND-1)** — system-auditor A-01 container-check compares live `docker ps` against the FULL compose definition (12 svcs) → false CRITICAL "fleet outage" (retracted row TIER1-…-SERVICES-DOWN 94237862; 2nd auditor false-positive in 2 ticks). Define an intended-runtime-set SSOT (e.g. `docs/data/system-map.json` active-services) and have A-01 check THAT set; defined-but-not-in-runtime = INFO, never CRITICAL. AC: on minimal-stack host, A-01 emits 0 CRITICAL for not-deployed dev-zone svcs for 7 days. Pri MEDIUM. Same architect→agent-father chain — bundle with AUD-ND-1.

## Sprint TOOL-SURFACE-HYGIENE — Clean the vn-market MCP tool surface

**Status:** OPEN 2026-05-31. **Priority: MEDIUM.** Zone: `apps/mcp-server/` (#1 may route to kinh-dich-service if wire). Live toolCount=154. Full context → `docs/SPRINT_GOAL.md` §.

- ✅ **BA-TSH** — DONE 2026-05-31. Spec `docs/REQ_TOOL-SURFACE-HYGIENE.md`. FR-1: 1a=wire/kinh-dich-zone vs 1b=deregister/mcp-zone. FR-2 DISTINCT (SQLite alerts vs JSON file). FR-3 DISTINCT (3 sources). FR-4 DISTINCT (RAG vs Go TA). FR-5 optional. FR-6 last. NEXT: architect.
- ✅ **ARCH-TSH** — DONE 2026-05-31. Decision: FR-1=**1b DEREGISTER** (`apps/mcp-server/` zone). FR-2/3/4 all DISTINCT — description-clarify tasks. FR-5 WONTFIX-LOW (schema divergence + param shape incompatibility make consolidation harmful). Brief `docs/architecture-briefs/2026-05-31-tool-surface-hygiene.md`. NEXT: pm → dev-mcp-server.
- 🔄 **TSH-1 (dev-mcp-server)** — Remove `server.tool("get_market_hexagram")` block `kinhDichTools.ts:510–546`; remove dead `getMarketHexagram` import if orphaned. AC: tool absent from `list_server_tools("vn-market")` in-container after rebuild; other 5 kinhdich tools intact; 0 new tsc errors. **SHIPS FIRST. Ops rebuild #1 after.**
- ✅ **TSH-2 (dev-mcp-server)** — DONE f4da532f 2026-05-31. mark_alert_outcome (SQLite alerts table, POST-HOC) vs write_alert_verdict (JSON alert-verdicts file, AT FIRE TIME) — descriptions now explicit. Ops rebuild #2 required before live verification.
- ✅ **TSH-3 (dev-mcp-server)** — DONE f4da532f 2026-05-31. get_calibration_report (calibration_snapshots/Brier), get_label_accuracy_report (market_messages/human-label), get_prediction_accuracy (Polymarket precision) — all three now name source + distinct question. Ops rebuild #2 required.
- ✅ **TSH-4 (dev-mcp-server)** — DONE f4da532f 2026-05-31. get_patterns (LanceDB rag_analyses / semantic precedent) vs get_technical_indicators (Go TA service port 5003 / price-derived). Ops rebuild #2 required.
- 🔄 **TSH-5 (PM/system-auditor)** — LAST: reconcile `toolCount` + `infrastructureStatus.toolCount` in `docs/data/project-stats.json` to live count after TSH-1 rebuild (expected 153). AC: both fields + date 2026-05-31; scoped single-file commit.

---

## Sprint ENV-ISOLATION — Fleet-wide test/prod data isolation (split P1/P2)

**Status:** P1 ✅ PO-EXIT 2026-05-31 (9eab754f·89e9b5b8·0c9bed2a, QA cycle-164 APPROVED `reports/TASK_REPORT_EI-P1.md`); P2 ⛔ GATED. **Pri: MEDIUM.** Zone: multi. Brief `…/2026-05-31-fleet-env-isolation-architecture.md` (6e8f3d23). Full shape → `docs/SPRINT_GOAL.md` ENV-ISOLATION §.
- ✅ **EI-P1-1/2/3** — PO raw-verified (not badge): rendered `docker compose config` = 9 `APP_ENV: production` (mcp/pdf/rag/ta/macro/kinhdich/news/stock/alert) + `COORDINATION_DB_PATH` on mcp-server, none on api-gateway/frontend/flaresolverr; both maintenance scripts carry live guard logic (resolved-path print before write + `--force-dev`); `dev-environment.md` (241L) covers start/seed/promote-FK/LanceDB/restore/RISK-5. HCM-DISAMBIG 0-diff, PEK pristine, 3 commits scoped per-file on main.
- 🟢 **P2 (GATE RELEASED 2026-05-31 — FU-TRUST-REFRESH FU-4 data-trust satisfied at FU-EXIT; now schedulable):** EI-P2-1 startup assertion → EI-P2-2 `data_env` ×5 tables → EI-P2-3 `docker-compose.dev.yml` → EI-P2-QA ENV-GUARD-1. Serialize EI-P2-2 mcp-server rebuild vs BANK-AWARE-BCTC BANK-OPS (same zone).
- 🔄 **FU-EI-COMPOSE (backlog, NOT gated):** 2 pre-existing non-P1 items from QA report — (1) `alert-engine` missing `DB_PATH=/app/data/market.db` in compose (brief §2.1); (2) `run-bt7-backfill.ts` ~L20 hardcoded import path. Compose/scripts surface, no schema/refine coupling → pickable independent of P2 gate.

---

## Sprint SELF-IMPROVE-GATE — Gated Self-Improvement Loop

**Status:** OPEN — Phase 2 (lane-B code gate) live 2026-05-28. PO APPROVE-WITH-CONDITIONS (062a6569 + ef109a76). **Pri: HIGH.** Zone: `apps/mcp-server/`. ✅ Phase1 (brief `…/2026-05-27-gated-self-improvement-loop.md`) + Phase2 code (selfImproveOrchestratorJob + degradationRules + improveCheckStore, GATE-PROOF PROVEN-RED). 🔄 SIG-FOLLOWUP-DRYRUN (X-1): synthetic dry-run, D-IMPROVE emit path e2e.

---

## Sprint NB-PRUNE-FIX — Notebook prune anchor-format mismatch (fleet bloat)

**Status:** OPEN 2026-05-31 (recurring `context_bloat_breach`; manual prune 41c9ac73). **Pri: HIGH.** Zone: `.claude/skills/` + agent flow `.md` (disjoint from peer `apps/mcp-server/`). Fresh first-fix — normal chain.

- **Defect (call-site/contract mismatch, skill internally correct):** `.claude/skills/notebook-write/SKILL.md` prune+guard (AC-2/3/5) greps ONLY `^## c[0-9]`, but agents emit `## <ISO-ts>`/`## Session:` headings → prune Edits no-op, retention never fires → unbounded growth (ops 5871L, dev-alert-engine 389L, unified-agent 377L, agents-architect 316L; ALL 0 `## c` sections). Notes also inconsistent: po/main.md L126 "OVERWRITE ≤50L" vs developer L125 "append c<NNN>".
- ✅ **NB-PRUNE-1 (developer)** — DONE 2026-05-31 (7166db01). APPROVED by QA. Anchor widened to `^## ` in SKILL.md (104L ≤120L). QA repro (deliberate-violation, 3 fixtures): Session-style 5871L→344L (3 sections retained, AC-5 guard fires correctly); ISO-ts 316L→27L; c-format 166L→58L. Preamble preserved in ISO+c-format fixtures. Exactly-3 no-prune edge case confirmed. Fenced-code-block `## ` over-count risk is theoretical only (0 live occurrences). TODO po/developer invocation-note contradiction: non-blocking (po.md=26L, deferred reconciliation acceptable).

## Sprint BCTC-LAYOUT-FIRST — Document-Structure-First Extraction

**Status:** OPEN — Phase 0 READY. **Pri: HIGH.** Zone: multi. Brief `…/2026-05-26-bctc-layout-first-pipeline.md`. 🔄 LF-EXTRACT (dev-pdf-extractor) · 🔄 LF-OVERLAY (zone-toggle only, persist ✅ SPIKE_3011 2a4e036d, 177 units) · 🔄 LF-DEPLOY + LF-QA (TR-2: opex 11/24/25/26 + equity + EBITDA + OCF) + LF-EXIT

---

## Sprint CHEF-ATTN — Bootstrap Attention Diversity Cap

**Status:** READY (2026-05-27). Per-stock diversity cap on `buildAlertsSection`. **Pri: MEDIUM.** Zone: `apps/mcp-server/`. 🔄 CHEF-ATTN-BA → IMPL (dev-mcp-server) → DEPLOY (ops) → QA → EXIT (po).

---

## Backlogs

- TNB-GATEWAY-PROBE (agent-father, LOW, weekend-safe) — recurring (c83+c84, 2 consecutive) tnb false "mcp-blocked": bootstrap Step 0c reads empty `.mcp.json` instead of probing the healthy gateway. Fix: Step 0c PROBES gateway by call_tool-ing a real tool, not reading `.mcp.json`. AC: tnb session with healthy gateway emits 0 bug-escalation; .mcp.json read removed from bootstrap. Route po→architect/agent-father next cycle. · CW-DISPATCH-STEP47-ENUM (dev-mcp-server OR agent-father, LOW, zero-blocker) — cowork-team/flow/main.md Step 4.7 calls get_cycle_bootstrap(agent_name="cowork-team") but tool enum rejects it → tick-snapshot errors every dispatcher fire (falls back to direct bootstrap). Fix: pass a valid agent name (first WON_SLOT's agent) OR dev-mcp-server adds "cowork-team" to the enum. AC: dispatcher fire emits 0 bootstrap-enum error 7 days. · NB-BLOAT-FLOW-OVERWRITE (developer, MED, sibling of NB-PRUNE-FIX) — news-scout.md NB 1198L + architect.md 477L (vs 200 cap) still APPEND not overwrite per cycle; NB-PRUNE-1 fixed the prune-skill anchor but not these two flow call-sites. Fix: prune/split both NB + correct cycle-end to OVERWRITE in news-scout + architect flows. AC: both NB ≤200L after one cycle each + no re-bloat 7 days. · FU-BANK-CODECOL (dev-mcp-server, NOT gated) — VN label text leaks into `code` column of bctc_table_rows (markdown→rows column-alignment defect); hybrid discriminator immune (anchored regex won't match prose) but real data-quality bug · BCTC-TABLE-2 → QUEUED (multi-ticker; after LF-EXTRACT + LF-OVERLAY close) · KD-QREF-LANG OPEN (EN/VI switch) · code-janitor DOUBLON CLEAN candidate (3 live + 10 proposed, HELD, batch when apps/mcp-server has no active reliability sprint) · Phase 0/1 pilot backlogs frozen → `docs/TASKS_ARCHIVE.md`

---

**Binding:** explicit-file staging; no `-A`/`--force`; all on `main`; no `pilot-status-*.json` edits; main terminal commits.
