# PO Notebook

## c · 2026-06-09T02:55Z — CI-RED-RECONCILE: FU-P6 REVIEW->DONE + open FU-P7 (5th touch) + raw-verify 2 auditor CRITICALs (po-S19)

**Trigger:** OOB ci_red `docs/signals/ci-p6-gate-result-507e3cee-20260609T0250Z.json` (router CI-measured P6 + reverted b9e305ae) + 2 deferred auditor Tier-2 CRITICALs (sau-...3050/3051, NEW in signal_queue). PO owns board; router owns push+gate. DJ-GATE-1.

**FU-SCHEMA-DRIFT-P6 = DONE (spike sound, direction (b) disproven — same pattern as P5).**
- SPIKE diagnosis correct (closeDb() afterAll nullifies _db singleton; prod getDb() fallback hits empty :memory:). Only direction (b) afterAll-reinit failed: native 629->630 (+1 WORSE), ZERO residual classes healed, buckets byte-identical to after-P4. Reinit re-runs the SAME incomplete canonical schema -> cannot heal tables it omits. Router reverted 3 test files; apps/ byte-identical to e442cf11. No phantom FIX-P6-IMPL task existed (router impl'd directly) — recorded in P5-SELFHEAL note, NOT invented to flip.

**Opened FU-SCHEMA-DRIFT-P7 = ARCHITECT SPIKE (5th touch, recurring-bug). ONLY untried root-cause lever.**
- All 4 prior levers exhausted: P5 prod getDb self-heal (+6/created_at-drift), P6 afterAll-reinit (+1/zero-heal), P4 per-file inline-DDL (per-file isolation only), 9454baad mechanized injection (+219). Residual buckets byte-identical P4/P5/P6 = canonical initDatabase()/slices NEVER CREATE the dominant tables (agent_signals/sbv_rates_history/positions/commodity_prices*/imf_indicators). LEVER: ADD missing CREATE TABLE IF NOT EXISTS into canonical (additive, IF NOT EXISTS, low prod risk) — exactly what P4 gate flagged. HARD: source each DDL from OWNING prod module, NOT invent (invented DDL sank P5).

**2 auditor CRITICALs — RAW-VERIFIED MYSELF (verify-raw-not-badges):**
- sau-...3051 bctc-discover B-02: REAL. get_sla_status bctc 598min/120min breached. vn-bctc-fetch healthy but data stale = discovery/write dead = vnstockFundamentals crash. FOLD into FIX-VNSTOCK-FUNDAMENTALS-CRASH-SPIKE (TODO critical). No new task.
- sau-...3050 news-vps B-11: REAL + RECURRING. get_sla_status news 84/30min breached + get_vps_service_health vn-news-fetch UNHEALTHY uptime 1h21m. 2nd occ/48h (06-07 same ~1h44m; FIX-NEWS-VPS-PROBE DONE but did NOT stick). ~1h uptime = crash-restart loop. Recurring-bug rule -> opened FIX-NEWS-VPS-CRASH-LOOP (ops-vps-fetch, def fix not probe).

**LESSON:** When a spike's diagnosis is correct but its chosen fix-direction fails empirically, the SPIKE stays DONE and a NEW spike opens for the next lever — don't REWORK a sound spike. After 4 failed levers on the same surface, return to the root-cause recommendation the FIRST gate already flagged (add missing canonical tables) instead of re-trying isolation tricks. A recurring service crash-restart (~1h uptime twice in 48h) is a def-fix recurring-bug, not a transient — a prior PROBE that didn't make it stick = escalate.

## Carry-over
- ROUTER OWNS: push (notebook+journal+orch-state commit) + dispatch FU-SCHEMA-DRIFT-P7 to ARCHITECT (SPIKE 120m, add-missing-canonical-tables) BEFORE any dev re-impl + route FIX-NEWS-VPS-CRASH-LOOP to ops-vps-fetch (journalctl -u vn-news-fetch recon) + FIX-VNSTOCK-FUNDAMENTALS-CRASH-SPIKE already TODO (covers bctc-discover). Next P7 gate = native fail+error DROP vs 629 + residual buckets shrink.
- EPIC target: monotonic native DROP; P7 add-canonical-tables cures the singleton-pollution residual.
- vn-news-fetch + vn-bctc-fetch BOTH in crash-restart class — if recon shows shared VPS infra-exhaustion, fold into one VPS-stability spike.
- Still open (file as WIP frees, <=2): A-33 fundamentals crash (now also = bctc B-02 staleness root); BCTC get_bctc_full empty #3106; pollNews 0-items #3102.
- agent-father: auditor weekday-mislabel signal pending (gate = next 2 runs match `date +%A`). DWF AC-P0-3-6 canary stays RED (never fix).
