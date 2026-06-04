# PO Notebook

## c · 2026-06-04T04:31Z — operator bug fast-track: cascade NER mis-tags city abbrev as ticker → NER-PLACE-1 FIX DONE-LIVE-VERIFIED

**Intent:** operator-reported tracked-code bug, router pre-localized → right-sized as ONE single-zone FIX (NO ba→architect→pm; ~60-line guard + test). Bug: headline "'Ông lớn' bất động sản **TP HCM** đề xuất giảm sở hữu nhà nước" tagged `[DirectCodeNER+DomainRule: HCM]` (broker CTCP Chứng khoán TP.HCM). "TP HCM" = Ho Chi Minh CITY, not ticker HCM.

**Root cause RAW-VERIFIED (not relayed):** cascadeEngine.ts `isDirectTickerMention` (~L3287) → `hasUppercaseWordBoundary` accepts any all-caps, space-bounded hit. "HCM" in "TP HCM" passes both the upper- and lower-case word-boundary checks; NO preceding-token context guard. HCM is the salient collision (city abbrev == HOSE broker ticker). seedText = title+summary (L3247).

**Fix (definitif, class not symptom):** module-level `isPrecededByPlacePrefix(text, idx)` — diacritic-tolerant (NFD + strip \p{M}), data-light set {tp, t.p, tinh} + two-word "thanh pho", trailing-dot/glue strip handles the joined "TP.HCM" form. Called from `hasUppercaseWordBoundary`: reject a place-preceded occurrence and **keep scanning** for a genuine standalone hit. Generalizes to any place-prefix + all-caps-ticker collision, not an HCM special-case.

**DoD met:** 5 new NER tests (`FIX-NER-PLACE-ticker-guard.test.ts`: TP HCM + TP.HCM + "Thành phố HCM" → no HCM; "HCM tăng trần"/"Chứng khoán HCM" regression preserved) + 376 cascade tests green, tsc0. Commit **afbc63a2** (raw `git show`: exactly 2 files, no force-add, RUN-SOLO explicit-stage + commit-mutex). ops rebuilt+recreated mcp-server (healthy, marker x2 in /app/src). **LIVE run_impact_chain** via gateway, BOTH directions: (a) offending headline → `[DirectCodeNER: HCM]` tag GONE (HCM now only generic securities sector tác-động-gián-tiếp 44%, same as VCI/SSI/VDC — correct, headline truly mentions securities domain); (b) "HCM tăng trần ... Chứng khoán TP.HCM" → `[DirectCodeNER+DomainRule: HCM]` STILL fires (true positive preserved; guard suppressed only the TP.HCM occurrence, found the standalone HCM).

**LESSON:** a place-prefix guard at the all-caps gate (with continue-scanning, not early-reject) kills the false-direct-mention class while preserving true tickers in the SAME headline ("Chứng khoán TP.HCM" present in the genuine case but the standalone "HCM" still matched). Live raw-verify on BOTH the offending AND a true-positive headline is what proves no regression — green tests alone never were the gate [[feedback_router_verify_raw_not_badges]]. Right-sizing: tracked-code bug with a clear ~60-line guard ⇒ direct dev-mcp-server FIX, skip the full chain.

---

## c · 2026-06-03T13:09Z — dev-team triage: D/E WATCH = REAL serve-lie + REFLOW gap (same root) → BATCH 2 FIX

**Inputs:** head=idle, wip=0, devq=0. Drain = 4 cowork heartbeats (not dev-actionable) + 1 context_bloat (dev-mcp-server.md, self-healed to 65L, routed to claude-manager-helper). 0 NEW signals. Tick priority = the D/E WATCH (briefed quick-verify) + the 2 MED BCTC-LAYOUT-FIRST items.

**D/E WATCH RAW-VERIFIED (not relayed) → REAL serve defect, NOT a dismiss.** Live `get_bctc_full` FPT+VNM both serve `D/E 0.00x`. Container DB (action_code, latest): FPT short_term_debt=0 + long_term_debt=0 but **total_liabilities=28,464,058** (28.5T, balances); VNM STD=0 LTD=0 but **total_liabilities=18,829,355** (18.8T). balance_sheet_json liabilities decomposition is EMPTY/micro-residual on both (FPT currentLiabilities.total=0.000001, VNM all 0). So D/E=0.00x is arithmetic from debt≈0 — NOT debt-free truth; FPT carries 28.5T liabilities. Net Debt/EBITDA confirms: VNM -0.13x = -cash(1794.9)/ebitda(13776), FPT -2.53x = -cash(7993.6)/ebitda(3157.7) — both = -cash/ebitda exactly (debt term contributes 0). Corpus census: **5/8 DONE reports have debt-scalars=0 while carrying real total_liabilities** (FPT-Q1, VNM, EIB, SHB, DHG); only HPG has a real STD. A reader sees "D/E 0.00x" → concludes debt-free → materially false → publishable misrepresentation with NO guard (current_ratio already serves honest N/A for the same empty-decomposition; D/E does not).

**FU-LF-VALIDATION-STATUS-REFLOW RAW-CONFIRMED (briefed MED, real).** Every DONE-refined report carries a STALE `validation_status` from the original 2026-05-24 OCR-parse: FPT-2026Q1 serves balance-EXACT (assets 68,586 = equity 40,122 + liab 28,464, router-verified) yet `validation_status='failed'` w/ note "Liabilities (0) + Equity (0)". VNM/HPG/SHB/DHG/EIB/BSR likewise failed/low_confidence on pre-refine notes. A consumer filtering `validation_status='passed'` skips now-correct data.

**SAME ROOT (key finding):** the stale validation_notes literally say "Liabilities (0)+Equity (0)" — refine corrected the AGGREGATE scalars (total_liabilities, equity_total) but never propagated to the DECOMPOSITION layer (liabilities components, debt scalars) NOR re-ran validation. D/E=0 and the failed-verdict are two faces of the same "refine fixes aggregates, leaves derived/decomposition + verdict frozen" class — kin [[feedback_derived_column_fix_needs_reflow]] + the BAL-1a stale-ratio class. Architect BAL-1 spike premise (brief L56 "base scalars are correct, only ratios stale") was FALSE for the debt/decomposition path.

**RECURRING-BUG JUDGMENT — split the two pieces:**
- The DISPLAY LIE (D/E served as confident 0.00x when debt-decomp empty + liab>0) = narrow serve-honesty FIX, the exact N/A-on-implausible-input pattern BAL-1f just established (1 prior commit on the recompute block; new edge). Direct FIX, no spike — ceremony otherwise.
- The DATA GAP (why refine produces empty liabilities decomposition + zero debt scalars on balance-complete reports) = UPSTREAM extraction/decomposition-mapping, same family as BCTC-LAYOUT-FIRST + BEQ scalar-mapping. This layer HAS ≥2 fix cycles AND the spike premise was wrong → **architect SPIKE**, not another point-patch. Deferred this tick (not in batch — multi-week, upstream-data class like BCTC-HIST-SEED) → opened FU-DE-DECOMP-MAPPING (architect, backlog).

**DISPOSITION → BATCH 2 (WIP=2), both dev-mcp-server, zone apps/mcp-server/ (serialize commits — same file family, shared index):**
1. **FU-LF-VALIDATION-STATUS-REFLOW** (FIX, M) — re-run balance/identity validation at finalize (finalizeBctcRefineTool.ts) from CORRECTED scalars + recompute-on-read of validation_status in get_bctc_full serve path so the now-correct corpus is consumable WITHOUT a re-finalize pass (definitif: kills the stale-verdict class on read, mirrors BAL-1a-BACKFILL Option R). DoD = LIVE raw: FPT-2026Q1 validation_status no longer 'failed' (assets=liab+equity now holds); VNM consistent; a genuinely-broken report (BSR conf0.13) still NOT passed.
2. **FU-DE-SERVE-HONEST** (FIX, S) — D/E recompute (bctcFullTools.ts ~L979) must serve N/A (not 0.00x / not 2.7e-13) when short_term_debt+long_term_debt is implausibly-tiny/zero AND total_liabilities>0 (decomposition absent), mirroring current_ratio honest-N/A. Add D/E plausibility to PUB-6 so a false "debt-free 0.00x" never reaches MARKET/FB. DoD = LIVE raw get_bctc_full(FPT) shows D/E N/A; HPG (real STD) still shows its true D/E; unit-green NOT sufficient. ops REBUILD after.

**LESSON:** a WATCH "verify before scoping" pays off — D/E 0.00x looked like a benign coverage truth but was a publishable lie; the discriminator was total_liabilities>0 with empty decomposition (verify the aggregate AND the breakdown, not the served ratio). Two MED-flagged items collapsed to ONE root once raw-checked. Per [[feedback_router_verify_raw_not_badges]] + [[feedback_derived_column_fix_needs_reflow]].

---

## c · 2026-06-03T12:13Z — dev-team triage: router contradiction CONFIRMED → 1 FIX (BAL-1f), backlog held

**Inputs:** head=idle, devq=0. Drain = 4 cowork heartbeats (3 SILENT + 1 WON = normal 12:00 off-hours news-scout+market-watcher spawn). NO dev-actionable cross-team signal. Router-found BCTC ratio contradiction = the tick priority.

**CONTRADICTION RAW-VERIFIED (not relayed):** `get_bctc_full(code=FPT)` live serves `Current Ratio: 41527873060120.00x` + `Operating Profit (0.0%)`. Both REAL OPEN defects in the b7329f54 recompute-on-read block (bctcFullTools.ts L825-903), NOT the DONE label. Raw DB (FPT latest): net_revenue=12,479,997 M, operating_profit=2,747,764 M (→ true op margin 22.02%) but persisted `operating_margin_pct=0` (stale incomeBroken-at-parse artifact; gross 34.0% / net 19.8% ARE correct). `current_assets=41,527,873 M`, `balance_sheet_json.currentLiabilities.total=0.000001` (near-zero parse artifact) → 41.5e12x; recompute guard `clTotal>0` passes for 0.000001, no plausibility floor; PUB-6 (L684-713) bounds ROA/ROE/NetDebt/EPS but has NO current_ratio band.

**TWO root causes:** (1) recompute current_ratio guard is exact-zero only, not implausible-tiny → 41e12x. (2) recompute block omits the 3 margin columns (operating/gross/net) → serve reads stale persisted operating_margin_pct=0. Same class as [[feedback_derived_column_fix_needs_reflow]] — BAL-1a-BACKFILL fixed 5 of ~8 derived cols + used exact-zero guard.

**DISPOSITION → BATCH 1 (WIP=1):** BAL-1f FIX, zone apps/mcp-server/, owner developer. (a) current_ratio recompute: implausible denom (clTotal below sane floor relative to current_assets, e.g. clTotal/current_assets < ~1e-3, OR resulting ratio out of plausible band ~[0,1000]) → N/A, mirroring VNM. (b) recompute operating_margin_pct (and gross/net for class-completeness) = profit/net_revenue×100 with incomeBroken guard, mutate latestRow. (c) defense-in-depth: add current_ratio band to PUB-6 sanitizedRatios. baseline_pass = LIVE raw get_bctc_full(FPT) shows Current Ratio N/A (or plausible) + Operating Profit ~22% AFTER rebuild — NOT unit-test-green only (BAL-1a-QA carried DONE-FAIL-VERDICT; this layer has prior live-fail history). Ops must REBUILD mcp-server after.

**RECURRING-BUG JUDGMENT:** direct FIX, no architect spike. Rule = same DEFECT recurring ≥2 fixes, not same FILE. This recompute block has 1 prior commit (b7329f54); a narrow new edge (tiny-denom + 3 omitted cols), crisp root cause, formula already exists in ratioComputer.ts. Spike would be ceremony.

**BACKLOG HELD (not lost):** BCTC-LAYOUT-FIRST FU-FPT-OCR-PAGES-20-46 (med), FU-LF-VALIDATION-STATUS-REFLOW (med), FU-ORPHAN-TOLERANCE (low); FLEET-HOST-SAFETY FU-PDFX-HEALTHCHECK / FU-PEK-GUARD-RETRYAFTER (low); BAL-1e-DEV (low EPS footnote). NB-FLOW-SETTLED-WRITE self-heals next chef write.

**LESSON:** a "recompute-on-read" fix delivers the SCOPE it enumerated — verify EVERY served derived field on a real subject, not just the one (VNM) used to prove the formula. The omitted-column and exact-zero-vs-implausible edges hide behind a green DONE on the columns that WERE covered. Per [[feedback_router_verify_raw_not_badges]] + [[feedback_derived_column_fix_needs_reflow]].

---

## c · 2026-06-02T18:37Z — dev-team triage (GOAL complete-all-task): 2 actionable FIX, residual confirmed BACKLOG

**Inputs:** Telegram new=1 (bctc-analyst c012 "no bash, files uncommitted" — maintenance housekeeping, NOT a sprint; next drain commits). orch head=idle, prior GOAL cycle CONCLUDED. git -30 clean.

**5 drained signals dispositions:**
1. **context_bloat_breach ×3 (news-scout.md 222L > 200 cap)** — VERIFIED live (wc=222; sections c30=31 / 05:05=48 / 04:07=31 / 00:08=26 / 16:08=30 / 12:06=29 / c31=16). APPEND-class cap = ≤200L file / ≤60L section. Actionable now → **NB-NSCOUT-PRUNE** (claude-manager-helper, maintenance lane).
2. **brief_complete (BAL-1)** — STALE REPLAY confirmed: BAL-1a/b/c/d/e all DONE in task_board. No action.
3. **COWORK-HEARTBEAT-DRIFT (router finding)** — INVESTIGATED, router consequence PARTIALLY CORRECTED:
   - (a) "drain SKIPS non-envelope → accumulate forever" = **FALSE.** drain-signals.md 0a-1 globs `docs/signals/*.json` and processes EVERY file by fingerprint regardless of envelope shape (mv→processed/). The 37 cowork-team files pile up only because cowork writes 1/tick (15min) and dev-team drains less often; they DO get drained. Also: 32/37 are ALREADY enveloped (autosilent.sh L31-52 + Step-6 L754 BOTH emit {from,to,type:cowork-fire,createdAt}); only 5 are envelope-less.
   - (b) "L534 backlog miscount distorts adaptive cadence" = **TRUE + load-bearing.** `SIGNAL_BACKLOG=$(ls docs/signals/*.json|wc -l)` = 44, of which 37 (84%) are cowork's OWN heartbeats → PRESSURE_STATE.signal_backlog (L574) → computeTiers L271-272 → signal_backlog_tier PINNED HIGH (≥10) permanently from self-telemetry; also breaks L317/L330 deep-sleep guards (`signal_backlog==0` can never be true). Self-referential feedback defect. → **CW-BACKLOG-MISCOUNT** (FIX, flow read live no rebuild).

**Residual async/infra RE-CONFIRMED BACKLOG (NOT in-session completable):** BCTC-HIST-VPS-BACKFILL (HIGH ops — VPS lacks pre-Q4-2025 PDF cache, upstream), BCTC-ENRICHER-OLD-QUARTERS (MED dev — enricher 0 URLs old quarters), BCTC-CURRENT-404-INVESTIGATE (HIGH ops — Q1-2026 fetch 10/10 404), BCTC-HIST-VCB-REFINE (MED analyst — 2 PENDING rows), FU-EI-P2-COV-1/2/DEV-VOLUME (LOW). DO-NOT-REBUILD: BAL-1e-DEV, LF-EXTRACT, LF-OVERLAY, CHEF-ATTN-1.

**LESSON:** A router "finding" is still a HYPOTHESIS — verify its stated CONSEQUENCES at source before scoping. Here the "drain skips non-envelope" half was wrong (drain is shape-agnostic), but the backlog-miscount half was real AND the more serious defect (cowork's own heartbeats poison its own pressure tier). Scope the PROVEN defect, drop the disproven one. Definitif fix = narrow the count to actionable inbound (exclude self-telemetry), not prune-the-symptom. Per [[feedback_router_verify_raw_not_badges]].

---

## c · 2026-06-02T10:56Z — SIGNOFF BEQ-9/10 DONE-WITH-CAVEATS + NEW sprint BCTC-ANALYTICS-LAYER (publish-integrity gap closed)

**Context:** Router raw-verified (get_bctc_full live, post-rebuild) the bctc-analyst BEQ-9/10 self-report. Scalar recovery GENUINE but self-report masked a separate defect layer. Did NOT relay the analyst verdict — acted on router raw evidence.

**DECISIONS:**
1. **BEQ-9 DONE-WITH-CAVEATS + BEQ-10 PARTIAL-DONE-ACCEPTED.** Core incident RESOLVED: garbage-as-truth eliminated, no false-DONE, balance EXACT for VNM/FPT/HPG/DHG. NOT a re-open — residual defects pre-date BEQ-9; refine merely populated scalars that made them visible. Parent sprint BCTC-EXTRACT-QUALITY → DONE-WITH-CAVEATS (BEQ-1..10 closed, signoff note on sprint).
2. **PUBLISH-RISK VERDICT = GAP CONFIRMED.** The triage-referenced "BCTC-TRUST-RED / Task #13" semantic-sanity guard does NOT exist in orch-state (searched active+backlog). DONE reports flow into chef `unified-agent/flow/market-analysis.md` + `market-analyst` (grep-confirmed consumers) → broken ratios (VNM ROE/ROA=0, DHG ROA 7.8M%, NetDebt/EBITDA -7.5e13x), false YoY (FPT -82% cumulative-vs-quarter), parent-only HPG conf44%-as-headline CAN reach MARKET unattended. Opened **BAL-0** (publish semantic-sanity hard-fail gate, dispatch FIRST, fb-jargon-gate pattern). Added watch_item.
3. **NEW sprint BCTC-ANALYTICS-LAYER (active_sprints[0], HIGH).** recurring-bug-escalation → architect root-cause not point-patch. **BAL-1 SPIKE** (agents-architect) pins 4 clusters to modules + owner split: (a) ratio-compute, (b) bank B02-TCTD serving (kin BEQ-8/FU-BANK-CODECOL), (c) period cumulative-vs-quarter semantics (BEQ-4b guarded refine_status but NOT this), (d) parent-vs-consolidated entity scope. next_agent=agents-architect; signal po-bctc-analytics-layer-20260602T1056Z emitted.
4. HPG parent-only conf44% folded into cluster-d + caught by BAL-0 (no standalone TRUST-RED flag needed).
5. Residual fetch backlog INTACT: BCTC-CTG-ATTACHMENT-FETCH, BCTC-REFETCH-ZERO-ROW (DGC/DIG/VCB), VEA deferred. FU-PARTIAL-SCALAR-SERVE (high) still open — overlaps cluster-a, architect to dedup in BAL-1.

**LESSON:** A "DONE" from a single-discipline agent (bctc-analyst) can be locally-true (scalars/balance) yet globally-misleading — its scope blinds it to the downstream serving/ratio layer that consumes its output. Router raw-verify caught it; I scoped the masked half as a separate sprint rather than re-opening (clean ownership + recurring-escalation to architect). Per [[feedback_router_verify_raw_not_badges]] + recurring-bug-escalation. A claimed "publish guard" must be verified to EXIST in SSOT before trusting it gates anything ([[feedback_fence_false_green]]).

**Carry-over (deferred, valid):** BAL-0/BAL-1 (architect, next) · FU-PARTIAL-SCALAR-SERVE (high, dedup in BAL-1) · FLEET-HOST-SAFETY AUDITOR-SLA-CADENCE · MCP-SURFACE-GAPS MSG-1/3 · FU-FIXER-NO-FORCE (HIGH) · BCTC-LAYOUT-FIRST LF-EXTRACT/OVERLAY · BCTC-TABLE-2 · FU-BANK-CODECOL · FU-BCTC-TOOL-PARAMS · FU-ORCH-HEAD-CAS · FU-SIGNAL-DASHBOARD-CAP/RE-CAP-1 · EI-P2-* · CHEF-FLOW-CAP-REFACTOR · FU-CHEF-MARKER-INFLOW · DRAIN-INJECTION-SAFE-2 · 1967b architect audit.
