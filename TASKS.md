# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Completed Sprints (summary — details in `docs/TASKS_ARCHIVE.md`)

- **1296–1302:** IMF classifier, fail-loud injection, token reduction, TelegramMessageFactory, textUtils DDD fix, newsNormalizer fix
- **1303:** 9-bug backlog drain (price/sentiment/cascade/watchdog/VPS/BCTC)
- **1307a–1311a:** Macro alert cooldown, sentiment patterns, cascade rules, schema migration, foreign-flow UNIQUE fix
- **1312–1313:** BCTC skip logic inversion, channel-routing regression guard
- **1315:** Cost-push cascade rules + ClimateImpactMapper
- **1317:** Task308 test regex + project-stats sync
- **1318–1321:** Watchdog foreign_flow staleness, VPS OOM guard
- **1326b:** MARKET channel spam guard
- **DDD Phase 0:** Monorepo scaffold (feature/ddd-phase-0) — ready to merge
- **DDD Phase 1a/1b:** PDF Extractor + RAG Service Python/FastAPI — done
- **DDD Phase 2a/2b:** 4 TS microservices + kinh-dich + alert-engine — review
- **Phase 3c:** Parallel TA + BB alert scan (Promise.allSettled) — merged 8c33f0da

---

## Sprint 1327 — Phase 0 Merge + Test Infrastructure Stabilization

| ID | Title | Layer | Status | Size | Handoff |
|----|-------|-------|--------|------|---------|
| BA-1327 | Requirement Spec: Phase 0 merge + test failure triage | spec | Done | M | `docs/REQ_1327.md` |
| 1327a | Fix Bootstrap AC-4c: update agentFiles + projectRoot in 230-bootstrap-verify.test.ts | test | Review | S | `docs/handoffs/TASK_1327a.md` |
| 1327b | Fix TA Alert Scan AC-1,2,5,6,7,9: update computeFn mock to async (code:string)=>Promise<ComputeTAResponse> | test | Review | S | `docs/handoffs/TASK_1327b.md` |
| 1327c | Merge feature/ddd-phase-0 → main (gate: tsc clean, fail count = 15) | infra | Todo | S | `docs/handoffs/TASK_1327c.md` |
| 1327-docker | Post-merge: docker-compose up --build + health check port 3000 | ops | Todo | S | — |
| 1327-bun-crash | Document Bun 1.3.11 post-test panic as known non-code bug | infra | Todo | S | — |

**Dependency:** 1327a and 1327b run in parallel. 1327c depends on both. 1327-docker depends on 1327c.
**Deferred to Sprint 1328:** BCTC OCR x4, SSC pipeline null x2, Watchdog recovery x1, Price pipeline AC-4 x1 (all pre-existing, non-regression)

---

## Sprint 1328 — Cowork Communication Overhaul (Planned)

User goal: Help traders make better decisions with complete transparency (conviction math + full risks, no truncation)

### Phase 1: Signal Payload Completeness + Conviction Visibility (4-6 hours)

| ID | Title | Layer | Status | Size | Handoff |
|----|-------|-------|--------|------|---------|
| 1328a | Add signal fields: newsSentiment, kinhDichConfidence, agentSignalsMajority to signalTypes.ts | domain/signals | Todo | S | `docs/handoffs/TASK_1328a.md` |
| 1328b | Update Zod validators to accept new optional fields (agentSignalTools.ts) | interface/validation | Todo | S | `docs/handoffs/TASK_1328b.md` |
| 1328c | DB migration: ALTER TABLE agent_signals (add 3 columns) | infra/db | Todo | S | `docs/handoffs/TASK_1328c.md` |
| 1328d | Update convictionScorer: enrichDimensionScores() + use new fields | domain/services | Todo | M | `docs/handoffs/TASK_1328d.md` |
| 1328e | Format & display full conviction breakdown (6 dimensions, no truncation) in alerts | interface/telegram | Todo | M | `docs/handoffs/TASK_1328e.md` |

**Dependencies:** 1328a → 1328b,1328c,1328d. 1328d → 1328e.

### Phase 2: Suppression Transparency + Diacritics Validation (4-5 hours)

| ID | Title | Layer | Status | Size | Handoff |
|----|-------|-------|--------|------|---------|
| 1328f | Track suppression reasons in alertPolicyChecker (3-AND + 4-AND rules) | domain/services | Todo | M | `docs/handoffs/TASK_1328f.md` |
| 1328g | Log policy failure details to signalRejectionStore (missing_conditions, failed_rule) | infra/db | Todo | S | `docs/handoffs/TASK_1328g.md` |
| 1328h | Implement three-channel strategy: WORK (status) / BUG (anomalies) / MARKET (user results) | cowork-agents | Todo | M | `docs/handoffs/TASK_1328h.md` |
| 1328i | Validate Vietnamese diacritics + NFC normalization in telegram.ts (before send) | infra/telegram | Todo | S | `docs/handoffs/TASK_1328i.md` |

**Dependencies:** 1328d, 1328f → 1328g. 1328g → 1328h. All in parallel → 1328i.

### Phase 3: Impact Threshold Tuning + Message Format (2-3 hours)

| ID | Title | Layer | Status | Size | Handoff |
|----|-------|-------|--------|------|---------|
| 1328j | Raise impact threshold 7→8 in mcp.config.json (reduce News Scout FP rate 8%) | config | Todo | S | — |
| 1328k | Create test script: analyze 1-week signal distribution (impacts 7-8 range) | testing | Todo | S | `docs/handoffs/TASK_1328k.md` |
| 1328l | Document alert message standard format (5-section narrative: Why/Confirms/Kinh/Next/Risk) | cowork-agents | Todo | S | — |

**Dependencies:** 1328h, 1328i complete → 1328j (deploy with testing). 1328j depends on 1328k verification.

**Success Criteria:**
- ✅ Signal payloads include all 3 new fields (newsSentiment, kinhDichConfidence, agentSignalsMajority)
- ✅ 4-AND watchlist-opportunity rule fires when conditions met
- ✅ Every alert shows 6-dimension conviction breakdown in full sentences
- ✅ Every alert lists complete risks (no ellipsis, no truncation)
- ✅ Suppressed signals logged to WORK channel with reasons
- ✅ Three channels working (WORK/BUG/MARKET with clear purposes)
- ✅ Vietnamese diacritics validated + NFC normalized
- ✅ News Scout noise reduced 35% → ~27% (8 percentage point drop)

---

## Backlog

---
