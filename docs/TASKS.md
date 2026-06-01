# TASKS — VN Market Intelligence MCP

> **Active sprints only.** Historical: `docs/TASKS_ARCHIVE.md` | WIP≤2 | Decisions: `docs/po-decisions/` | Goals: `docs/SPRINT_GOAL.md`

---

## Closed sprints (live follow-ups only — full records in briefs/archive)

- BCTC-TRUST-RED ✅ e0c900d0 → FU-TRUST-REFRESH ✅ EXIT-WITH-CAVEAT 2026-05-31 → BANK-AWARE-BCTC ✅ PO-EXIT 2026-05-31 (941bf552 HYBRID; QA 040409f9; live img 7f413304; ACB B02-TCTD serves raw + FPT B01-DN 0-regression, both router-raw-verified; 🔄 FU-BANK-CODECOL below) · BCTC-AI-INPUT-TAB ✅ b4ed9266 · BCTC-HUMAN-CONFIRM ✅ 441f8e18 · BCTC-AGENTIC-REFINE ✅ 🔄 AR-FU-DETERMINISM DEFERRED · DATA-PIPELINE-INTEGRITY ✅ 🔄 FU-C DEFERRED ⏳ FU-MON (Monday) · BCTC-TABLE-BOUNDARY ✅ FU-BTB-OCR registered
- DYN-WF-FOUNDATION ✅ DWF-EXIT 2026-05-31 (84643927…eee22112) · DWF-PHASE1 ✅ P1-PO-EXIT 2026-05-31 (5a19485e…38d241c5) ⛔ Phase 3+ DEFERRED · MACRO-CMDTY-DELTA ✅ PO-EXIT 2026-05-31 (e510e5df…fdc17265) 🔄 FU-MON · FF-DEAD ✅ fixed 0cbce0b4 ⏳ FU-MON · PEK-INTEGRATE ✅ DONE-PENDING-G9 2026-05-28 (12 corpus has_pek:true; awaits USER verbal G9)
- VPS-NEWS-CAFEF-VNECO ✅ 2026-06-01 (814088b0+91bdb305, QA APPROVED; P1 is_blocked() fix restored cafef+vneconomy feed; P2 /proxy/article-body on VPS:8765, 5k/8k body extract). 🔄 FU-OPS-CAFEF-1/2 (spot-check ≥2 cycles cafef-market/biz>0 zero PERMANENTLY_BLOCKED; verify beautifulsoup4 + extraction cap) · 🔄 FU-DEV-CAFEF-1 (wire /proxy/article-body into /api/push-news = next sprint candidate) · **RESUME-ECONOMY** ✅ 2026-06-01 (b38ac812; brief `…/2026-06-01-context-resume-economy.md`): DASHBOARD delta-read + mandatory PRUNE + pipeline-state v2 head/narrative + main.md Step 0b head-only — ALL 3 phases shipped same session (router raw-verified). 🔄 RE-CAP-1 below = sole residual; stale cache linecount self-heals next write (brief §5).

---

## Sprint FLEET-HOST-SAFETY — on 16GB host, fleet must NEVER be `up`

**Status:** BACKLOG 2026-05-31. Pri: HIGH/MEDIUM. Zone: agents-architect → agent-father. Root: 3 false-positive auditor triggers in 48h (host-panic risk). 🔄 Backlog items: AUD-ND-1 (PLAN-ONLY forbid destructive ops) · DRAIN-INJECTION-SAFE (no shell interpolation of payloads) · A-01-EXPECTED-SET (check intended-runtime-set only) · AUDITOR-SLA-CADENCE (per-source staleness SLA) · VPS-SOCAT-PERSIST (durable launchd/CF routing). Full items in `docs/SPRINT_GOAL.md` §FLEET-HOST-SAFETY.

---

## Sprint VPS-DEPLOY-PLACEHOLDER-GUARD — Consolidate deployer (DECISION-A)

**Status:** OPEN 2026-06-01. **Pri: HIGH.** Zone: dev-vps-crawls + ops + qa. Brief: `docs/architecture-briefs/2026-06-01-vps-deployer-consolidation.md`. Root: cafef 814088b0 + VULTR dead. **DECOMPOSITION:** T1 pre-gate, T2/T3 parallel, T4 env, T5 deploy, T6 gate. **RETIRED:** PLACEHOLDER-GUARD-1/2/3/QA + VPS-BS4-INSTALL.
- 🔄 **T1-OPS-RECON (ops)** — SSH Vinahost verify: no leaks, all 5 active, socat alive. HARD GATE. → `TASK_VPS-DEP-T1-OPS-RECON.md`
- 🔄 **T2-GUARD1-MIGRATE (dev-vps-crawls)** — Port GUARD-1 into 9 blocks. Gates T1. Parallel T3. → `TASK_VPS-DEP-T2-GUARD1-MIGRATE.md`
- 🔄 **T3-GUARD3-MIGRATE (dev-vps-crawls)** — Section 10 article-body-fetcher+bs4. Gates T1. Parallel T2. → `TASK_VPS-DEP-T3-GUARD3-MIGRATE.md`
- 🔄 **T4-RETIRE-ENV (dev-vps-crawls)** — Post-verify, del vps-proxy.sh, VULTR_* from .env. Gates T2/T3. → `TASK_VPS-DEP-T4-RETIRE-ENV.md`
- 🔄 **T5-OPS-DEPLOY (ops)** — Execute deploy; verify 9 active + 14-feed HTTP=200. Gates T4. → `TASK_VPS-DEP-T5-OPS-DEPLOY.md`
- 🔄 **T6-QA-GATE (qa)** — Gate: GUARD-1 blocks dirty, clean passes, SSH detects leak, TE_API_KEY OK, vps-proxy gone, .env clean. Gates T5. → `TASK_VPS-DEP-T6-QA-GATE.md`

---

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
- 🔄 **FU-EI-COMPOSE (backlog, NOT gated):** 2 pre-existing non-P1 items (alert-engine DB_PATH, run-bt7-backfill import path). Compose/scripts only.
---

## Sprint SELF-IMPROVE-GATE — Gated Self-Improvement Loop

**Status:** OPEN — Phase 2 (lane-B code gate) live 2026-05-28. PO APPROVE-WITH-CONDITIONS (062a6569 + ef109a76). **Pri: HIGH.** Zone: `apps/mcp-server/`. ✅ Phase1 (brief `…/2026-05-27-gated-self-improvement-loop.md`) + Phase2 code (selfImproveOrchestratorJob + degradationRules + improveCheckStore, GATE-PROOF PROVEN-RED). 🔄 SIG-FOLLOWUP-DRYRUN (X-1): synthetic dry-run, D-IMPROVE emit path e2e.

---

## Sprint NB-PRUNE-FIX — Notebook prune anchor-format mismatch (fleet bloat)

**Status:** OPEN 2026-05-31 (recurring `context_bloat_breach`; manual prune 41c9ac73). **Pri: HIGH.** Zone: `.claude/skills/` + agent flow `.md` (disjoint from peer `apps/mcp-server/`). Fresh first-fix — normal chain.
- **Defect (call-site/contract mismatch, skill internally correct):** `.claude/skills/notebook-write/SKILL.md` prune+guard (AC-2/3/5) greps ONLY `^## c[0-9]`, but agents emit `## <ISO-ts>`/`## Session:` headings → prune Edits no-op, retention never fires → unbounded growth (ops 5871L, dev-alert-engine 389L, unified-agent 377L, agents-architect 316L; ALL 0 `## c` sections). Notes also inconsistent: po/main.md L126 "OVERWRITE ≤50L" vs developer L125 "append c<NNN>".
- ✅ **NB-PRUNE-1 (developer)** — DONE 2026-05-31 (7166db01). APPROVED by QA. Anchor widened to `^## ` in SKILL.md (104L ≤120L). QA repro (deliberate-violation, 3 fixtures): Session-style 5871L→344L (3 sections retained, AC-5 guard fires correctly); ISO-ts 316L→27L; c-format 166L→58L. Preamble preserved in ISO+c-format fixtures. Exactly-3 no-prune edge case confirmed. Fenced-code-block `## ` over-count risk is theoretical only (0 live occurrences). TODO po/developer invocation-note contradiction: non-blocking (po.md=26L, deferred reconciliation acceptable).
- 🔄 **NB-BLOAT-FLOW-OVERWRITE (developer, ACTIVE FIX 2026-06-01)** — PROMOTED from backlog. system-auditor.md re-breached 26L→**249L** within hours of prune 1013a624 (≥10 prepend notebook commits in one night) → emits `context_bloat_breach` every 30-min Tier-1 audit = highest-frequency drain noise. NB-PRUNE-1 fixed the SKILL anchor but system-auditor STILL PREPENDS per agent behavioral drift vs `docs/agents/system-auditor/flow/main.md` L427 (full-overwrite). Durable FIX = make overwrite instruction unambiguous in the flow (e.g. 'DELETE all prior content; write ONLY current cycle block ≤50L; never prepend') via agent-md-factory discipline. Zone: agent flow `.md` (cross-service). AC: system-auditor.md ≤50L after one audit cycle + no prepend recurrence 14 days + no `context_bloat_breach` for that file 14 days. NOTE: requires agent-md-factory skill (touches agent-system flow) → architect/agent-father chain, but the actual one-file edit is developer-scoped per backlog routing — route via Step 2 planning. · **2026-06-01 :07 EVIDENCE+MANUAL-SWEEP** — `context_bloat_breach` fired for news-scout.md (221L); dispatcher swept all 38 notebooks via claude-manager-helper, manually pruned 5 over-cap (news-scout 221→98 [trigger], bctc-analyst 218→124, qa 243→63, agents-architect 326→37, ops 5914→275); ALL git-safe (dropped sections in HEAD history). PROVES NB-PRUNE-1 anchor-fix did NOT propagate to news-scout (still grew to 6 sections → its flow likely never invokes notebook-write prune). RESIDUAL — 3 files CANNOT reach cap via last-3 prune: ops.md 275 (3-section floor), dev-alert-engine 389L & dev-rag-service 223L (single verbose section). WIDEN this item's AC to ALSO mandate within-section trimming / max-section-size, not only prepend→overwrite.
- 🔄 **RE-CAP-1 (agents-architect → agent-father, MEDIUM)** — sibling cap-compliance item (same skill/flow-.md theme). PROMOTED from RESUME-ECONOMY residual; resolves persistent `context_bloat_breach` ×2. `.claude/skills/signal-dashboard/SKILL.md` = **192L vs 120 cap (overage 72)**. ROOT: b38ac812 added the now-load-bearing delta-read/PRUNE/cache contract → over cap. NOT a naive prune (signal #2 correctly flagged: deleting content breaks the resume-economy contract every fleet agent depends on). FIX = agent-md-factory lazy-load: extract verbatim blocks (PRUNE thresholds, payload-pointer rules, signal-type + per-type-doc tables) to a pointered sibling `.md`; keep §READ/WRITE/PRUNE *contracts* in SKILL ≤120L. AC: SKILL ≤120L; the 3 contracts present-or-pointered (not deleted); drain-signals.md PRUNE call still resolves; 0 breach 14d. Zone: `.claude/skills/`. Route po→architect→agent-father.

## Sprint BCTC-LAYOUT-FIRST · CHEF-ATTN · OTHER READY

**BCTC-LAYOUT-FIRST:** Phase 0 READY. Zone: multi. Brief `…/2026-05-26-bctc-layout-first-pipeline.md`. 🔄 LF-EXTRACT · LF-OVERLAY · LF-DEPLOY/QA.  
**CHEF-ATTN:** Per-stock diversity cap. Status READY (2026-05-27). Pri: MEDIUM. Zone: `apps/mcp-server/`. 🔄 BA → IMPL → DEPLOY → QA → EXIT.

---

## Backlogs
- TNB-GATEWAY-PROBE / CW-STEP47-HYGIENE (agent-father, LOW) · NB-BLOAT-FLOW-OVERWRITE → PROMOTED (Sprint NB-PRUNE-FIX) · FU-BANK-CODECOL / BCTC-TABLE-2 / KD-QREF-LANG · VPS-PROXY-RESTORE ✅ 2026-06-01 (B-02/B-06/B-03 cleared) · SSC-IBOARD-MIGRATE (dev-vps-crawls, MED) · Phase 0/1 pilot frozen → `docs/TASKS_ARCHIVE.md`

---

**Binding:** explicit-file staging; no `-A`/`--force`; all on `main`; no `pilot-status-*.json` edits; main terminal commits.
