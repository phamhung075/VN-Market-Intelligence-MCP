# TASKS — VN Market Intelligence MCP

> **Active sprints only.** Historical: `docs/TASKS_ARCHIVE.md` | WIP≤2 | Decisions: `docs/po-decisions/` | Goals: `docs/SPRINT_GOAL.md`

---

## Sprint VNH-SECTOR-FIX → ✅ CLOSED 2026-05-29T17:45Z

**Status:** DONE. VNH domain real_estate→agriculture in seed + live market.db (rebuilt container); DomainType field typed string→DomainType (compile-time guard); 3 comment fixes (DAG/TCH/DPM). QA 24/24 green, tsc clean, anti-false-green PROVEN (bogus domain → TS2322). PO done-bar sign-off: independent live `get_cycle_bootstrap(market-watcher)` confirms `VNH [HNX] agriculture` (NOT real_estate); QA's `news-scout` bootstrap agreed. Both done-bar conditions met. Commits: dev 9713118f, qa 29d5629f. **Lesson:** seedWatchlist domain field was typed `string` (compiled bad enum values silently); tightening to `DomainType` makes the whole seed compile-checked — see backlog note on fleet-wide string-vs-enum hardening. Created/closed 2026-05-29.

> Closed-out detail (was OPEN — BA spec next; Priority HIGH fleet-wide data-integrity public-facing leak; Zone apps/mcp-server/ + live DB; user-tracked bug):

**Bug:** `seedWatchlist.ts:83` seeds VNH as `domain: "real_estate"`. VNH = CTCP Đầu tư Việt Việt Nhật = seafood/food import-export (xuất nhập khẩu thủy hải sản & thực phẩm), HNX. Wrong label seeded into market.db → propagates via `get_cycle_bootstrap` to ALL cowork agents (alert-commander, news-scout, market-watcher, CHEF/unified, fb-market-poster) → mislabels VNH as real-estate in alerts/notebooks/signals/public FB draft.

**PO decision — sector value:** `agriculture` (NOT a new `seafood` value). Rationale: canonical union is `DomainType` in `apps/mcp-server/bctc-schema.ts:26-47` and it does NOT contain `seafood`/`food`/`consumer`. `SECTOR_NAME_VI[agriculture] = "Nông nghiệp & Thủy sản"` (Agriculture & **Seafood**) and `agriculture` already maps to seafood/aquaculture peers VHC/ANV (sectorPeers.ts:120-121). Setting `"seafood"` would break `Record<DomainType,string>` (no key) — exactly the "don't invent enum value" trap. `agriculture` is the in-union home for seafood.

**Audit (PO spot-check vs real identities) — comments factually wrong, value defensible:**
- `seedWatchlist.ts:85` TCH comment "Techcombank (high-vol)" is WRONG — TCH = Hoang Huy Investment Financial Services (real estate/auto); Techcombank is TCB (banking). `domain: real_estate` is OK; FIX the comment.
- `seedWatchlist.ts:87` DPM comment "Daphaco" is WRONG — DPM = Đạm Phú Mỹ / PetroVietnam Fertilizer; `domain: chemicals` OK; FIX the comment.
- `seedWatchlist.ts:69` DAG comment "Da Nang Rubber Group" is WRONG — DAG = Đông Á Plastic Group; "Da Nang Rubber" is DRC; `domain: machinery` defensible (plastics/industrial); FIX the comment. (pre-existing, low-risk; BA to confirm scope)
- Only VNH has a WRONG `domain` value (the data-integrity bug). Others are comment-only.

**Tasks (chain: ba → dev-mcp-server → ops → qa → po):**
- ✅ VNH-BA (ba) — spec complete: `docs/REQ_VNH-SECTOR-FIX.md` (FR-1..6, 0 blockers, DomainType type-tighten + guard test + DB migration approach all specified).
- ✅ VNH-IMPL (dev-mcp-server) — edit `seedWatchlist.ts` (VNH value + comment + 3 audit comments) + add idempotent `UPDATE watchlist SET domain='agriculture' WHERE code='VNH'` correction in seed/migration path (seed UPSERT alone fixes fresh DBs; running DB needs explicit UPDATE since UPSERT only fires on re-insert) + guard test (pattern: `1787-gvr-sector-fix.test.ts`) asserting WATCHLIST_SEED has no `real_estate` VNH and every seed `domain` ∈ DomainType union.
- ✅ VNH-DEPLOY (ops) — apply correction to LIVE market.db in running container + rebuild/restart mcp-server (memory: rebuild-after-dev-change). Verify via direct in-container `market.db` query (bun, no sqlite3): `SELECT code,domain FROM watchlist WHERE code='VNH'` → must read `agriculture`.
- ✅ VNH-QA (qa) — confirm one agent's next `get_cycle_bootstrap` shows VNH NOT under real_estate + guard test RED-on-regression. QA APPROVED 2026-05-29. Handoff: `docs/handoffs/VNH-QA-handoff.md`.
- ✅ VNH-EXIT (po) — signed off 2026-05-29T17:45Z. Done bar met; independent spot-check confirms.

**Done bar (MET):** seed corrected + market.db row corrected in RUNNING container (verified by direct query) + mcp-server rebuilt + ≥1 agent bootstrap shows VNH no longer real_estate. (Today's already-written FB draft/notebooks are artifacts — fixed by a separate path; this sprint stops recurrence at source+DB.)

**Backlog note (do NOT action now):** the string-vs-enum hardening (seed `domain` field was `string`, now `DomainType`) likely applies to other seed/config arrays that type structural fields as bare `string` — a fleet-wide one-pass audit could catch the next silently-compiled bad enum value before it leaks. Worth a SPIKE next triage.

---

## Sprint BOOTSTRAP-ENUM-BCTC — get_cycle_bootstrap agent_name enum drift

**Status:** OPEN — dispatched 2026-05-29T17:30Z dev-team triage. **Type: FIX (XS).** **Priority: HIGH (recurring string-vs-enum class).** Zone: `apps/mcp-server/`.

**Bug (CONFIRMED LIVE 2026-05-29T17:29Z):** `get_cycle_bootstrap({agent_name:"bctc-analyst"})` → `invalid_enum_value`. The agent_name Zod enum = `[news-scout, financial-analyst, market-watcher, alert-commander, digest-predict, qa-responder, unified-agent, report-analyzer]` — `bctc-analyst` (a real roster agent, report #3009) is rejected. Workaround in use: bctc-analyst impersonates `financial-analyst`, polluting that agent's bootstrap attribution. Same recurring drift class as commit-mutex enum + verified_decision enum.

**Fix:** add `"bctc-analyst"` to the `get_cycle_bootstrap` agent_name Zod enum (and any sibling bootstrap-agent enum it shares). Verify roster source — agent_name list SHOULD derive from `docs/data/system-map.json` agent roster, not be a hardcoded literal (root-cause = duplicated agent list drifting from SSOT). If literal, file the SSOT-derivation as the durable fix; minimal fix = add the value + guard test that every roster cowork agent resolves. baseline_pass: tsc clean + new guard test RED-on-removal.

- 🔄 BENUM-IMPL (dev-mcp-server) — add enum value + guard test
- ⏳ BENUM-DEPLOY (ops) — rebuild mcp-server (restart≠rebuild gate)
- ⏳ BENUM-QA (qa) — live `get_cycle_bootstrap(bctc-analyst)` returns ok + guard RED-on-regression
- ⏳ BENUM-EXIT (po)

---

## Note — MACRO-SEED-WIRING (report #3003, 4-cycle recurring) → FALSE-RED this tick, MONITORING

PO live-probe 2026-05-29T17:29Z: `get_macro_snapshot` returns `dataSource:"live"` (oil 90.74, gold 4594.6, usdvnd 26255, fetchedAt 17:29Z) — matches live bootstrap range. The 2026-05-23 stale-seed HEADLINE symptom (oil 82.5/gold 2350/usdvnd 24500) is **NOT reproducible** → no FIX dispatched. Residual: the `carry` + `yield` sub-signals still carry `computedAt:"2026-05-23"` (derived/cached sub-computations with a stale recency label, NOT the headline ±2σ gold miscalibration the analysis-agent claimed). Report #3003 marked `monitoring`. If a future tick re-probes a STALE headline snapshot, escalate to a real cache-TTL FIX then. Backlog candidate: fold carry/yield recompute-recency into the next macro touch.

---

## Sprint SELF-IMPROVE-GATE — Gated Self-Improvement Loop

**Status:** OPEN — Phase 2 (lane-B code gate) live 2026-05-28. PO verdict: APPROVE-WITH-CONDITIONS (commits 062a6569 + ef109a76). All conditions met; X-1 (synthetic-data dry-run) open. **Priority: HIGH.** Zone: `apps/mcp-server/`.

- ✅ SIG-DESIGN + SIG-PO-GATE + SIG-IMPL-MD (phase 1): flow wiring → `docs/architecture-briefs/2026-05-27-gated-self-improvement-loop.md`
- ✅ SIG-IMPL-GATE phase 2 (code): `selfImproveOrchestratorJob` + degradationRules + improveCheckStore live, GATE-PROOF PROVEN-RED
- 🔄 SIG-FOLLOWUP-DRYRUN (X-1): synthetic-data dry-run, D-IMPROVE emit path end-to-end

---

## Sprint PEK-INTEGRATE — Re-engine apps/pdf-extractor on PDF-Extract-Kit

**Status:** ✅ DONE-PENDING-G9 (2026-05-28). Render-seam fix LIVE; FPT e71f845d = 7 fresh PEK units; all 12 corpus has_pek:true; mcp-server rebuilt. **Condition:** USER verbal G9.

- ✅ All phases DONE: spec (docs/REQ_PEK-INTEGRATE.md) + design + code (8535b175) + multipage fix (2e228f0d + ed347661) + deploy + QA PASS (12/12 corpus)

---

## Sprint BCTC-LAYOUT-FIRST — Document-Structure-First Extraction

**Status:** OPEN — Phase 0 READY (LF-DESIGN done). LF-EXTRACT + LF-OVERLAY ready in parallel. **Priority: HIGH (recurring-bug RCA).** Zone: multi (pdf-extractor + mcp-server).

- ✅ LF-BA + LF-DESIGN: spec + blueprint → `docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md`
- 🔄 LF-EXTRACT (dev-pdf-extractor): Tier 0-3 + zone-geometry JSON
- 🔄 LF-OVERLAY (dev-mcp-server): `POST /api/push-bctc-layout` + zone toggle
- 🔄 LF-DEPLOY + LF-QA + LF-EXIT: sequential single-doc, DIRECT DB arbiter

---

## Sprint BCTC-TABLE-3 → ✅ CLOSED 2026-05-26T00:12Z

**Status:** DONE. FPT Q4 = 79 clean rows, 0 orphans, 0 junk, balance_delta=0. Root cause: dual-path drift → architect FILTER-STRATEGY ruling → live-substrate fixture mandate. **Lesson:** AC-0 fixture regenerated from live poppler OCR; positive-keep + positional-cutoff; balance badge alone FORBIDDEN as gate.

---

## Sprint BCTC-TABLE-2 → QUEUED

Multi-ticker quarterly coverage (follow-up post-TABLE-3). Next: dispatch after LF-EXTRACT + LF-OVERLAY close.

---

## Sprint CHEF-ATTN — Bootstrap Attention Diversity Cap

**Status:** READY (2026-05-27). Pre-redesign targeted fix: per-stock diversity cap on `buildAlertsSection`. **Priority: MEDIUM.** Zone: `apps/mcp-server/`.

- 🔄 CHEF-ATTN-BA (ba) → CHEF-ATTN-IMPL (dev-mcp-server) → CHEF-ATTN-DEPLOY (ops) → CHEF-ATTN-QA (qa) → CHEF-ATTN-EXIT (po)

---

## Sprint MCPZONE-HARDEN-1 → ✅ CLOSED 2026-05-26T18:04Z

MZH-1 (DB-verified rows_stored) + MZH-2 (prod-db test guard) shipped 2d4f71d9. Write-wedge gone; health 200, 146 tools, 2.6GB/8GB.

---

## Sprint PDF-INSPECT → ✅ CLOSED 2026-05-24T19:34Z

Served FastAPI viewer `http://localhost:3000/api/bctc-inspect` reads real `market.db`. User acceptance MET on real data.

---

## Phase 0/1 Backlogs (Stock-Price Pilot 3 | pdf-extractor SCALE)

See `docs/TASKS_ARCHIVE.md`. Pilots frozen; post-pilot correctness work active.

---

## Follow-On Enhancements (POST-PILOT)

- KD-QREF → ✅ CLOSED: 64-Quẻ reference | KD-QREF-LANG — OPEN: EN/VI switch

---

**Binding:** explicit-file staging; no `-A`/`--force`; all on `main`; no `pilot-status-*.json` edits; main terminal commits.
