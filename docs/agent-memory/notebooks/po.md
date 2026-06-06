# PO Notebook

## c · 2026-06-06T17:20Z — dev-team triage tick 172047Z (1 HIGH signal → BATCH 1 FIX, WIP=1)

**Disposition: ONE FIX → dev-vps-crawls. This is the planned implementation leg of last tick's SPIKE — the SPIKE DoD (recon doc capturing the live request recipe) is now SATISFIED, so the FIX is greenlit.**

1. **dev-vps-crawls recon-complete** (HIGH, ops-vps-fetch→dev-vps-crawls) → **FIX** `FIX-VPS-SSC-CURL-SCRAPER`, zone `dev-vps-crawls` (maps to `cross-service/` — VPS host script, not a deployed apps/ service). Root chain raw-verified end-to-end this tick:
   - **Recon DoD met:** `docs/vps-sources/ssc-bctc-newsearch/recon.md` (387L) has full Implementation Notes (L253-362): complete 4-step Python skeleton `discover_from_ssc_curl()` + 8 key impl details (DOM row offset=15, row-matching via existing `matches_quarter_and_year()`, ViewState reuse, 10h session, exchange map HOSE=1/HNX=0/UPCOM=2, Content-Disposition filename). verdict VIABLE-CURL, anti_bot=none, **proven_on_vps=true** (GAS Q1/2026 15.4MB + HPG annual 6.2MB, both %PDF-1.7 valid, NO Chromium).
   - **Target raw-confirmed:** `vps-scripts/discover-bctc-urls-browser.py` (872L). Replace `_ssc_newsearch_playwright()` (L576, async/playwright). Helpers recon reuses ALREADY EXIST: `matches_quarter_and_year` (L238), `is_cover_letter_title` (L171). Call sites to rewire: `discover_from_hose_ssc` (L758), `discover_from_ssc` (L779), `discover_bctc_pdf` (L794 step-3). New fn = sync stateful-HTTP `discover_from_ssc_curl()` per recon skeleton; DELETE the playwright path (kills forbidden Chromium dep — policy `no_chromium:true`).
   - **Policy-mandated, not just root-fix:** `dev-vps-crawls` init.md forbids Chromium/Playwright (VPS RAM). The SSC path's pthread_create EAGAIN crash (in-flight row rtr-bctc-playwright-thread READ) IS the symptom of that violation. This FIX removes the dep = definitif.
   - baseline_pass=false (the playwright path is currently the only HOSE-SSC discovery and it crashes every 6h cycle — i.e. broken-RED baseline; the FIX makes it green). files: `vps-scripts/discover-bctc-urls-browser.py` (+ recon.md read-only).

**Closes in-flight row** rtr-bctc-playwright-thread-202606061545 (READ) only when a LIVE chromium-free SSC discovery cycle succeeds — Saturday's 6h cycle gives a real proof window today (off-market, free capacity).

**Channel audit (read_telegram_reports new + list_unresolved): 2 NEW reports, 0 NEW tasks.**
- **3054** (14:38Z, auditor c045 4 VPS CRITICALs) — SAME report I root-caused last tick. 3/4 false (prices+foreign_flow weekend-gate, sbv 37m blip), 1 real = bctc 21.3h (THIS playwright crash — now being FIXED above). FIX-SLA-WEEKEND-AWARE (shipped 9e74cf0a last tick, live-proven Sat) removes the 2 false-CRITICAL class going forward; auditor c045 fired 14:37Z, possibly pre-deploy. NO new task — covered. Watch next auditor pass goes green on prices/foreign_flow.
- **3055** (16:47Z, BCTC-1345b CTG 2026-Q1 composite=0.00 financial=0.00 conviction skipped, "VNM/VEA OCR-corruption pattern assets<equity") — this is the **BCTC-ANALYTICS-LAYER / OCR-confidence class**, NOT a dev-vps-crawls concern and NOT this tick's lane. Confidence=0 → skip-insert is the DESIGNED low-confidence guard ([[reference_low_confidence_handling]]), behaving correctly (it suppressed a bad signal). Whether CTG Q1 is genuinely OCR-corrupt is a separate refine/extraction investigation. NOT promoting to a FIX this tick (keep batch ≤2, stay in-lane); NOTING for next triage — if CTG-Q1 OCR corruption recurs/persists it earns a BCTC-OCR task. Do NOT conflate with the VPS scraper.

**No orch-state mutation** (FIX routed inline via BATCH; router applies + commits notebook at tick close).

**Carry-over (next tick):**
- FIX-VPS-SSC-CURL-SCRAPER: on return verify (a) playwright import/async path DELETED from discover-bctc-urls-browser.py (raw-grep `playwright` == 0), (b) new sync `discover_from_ssc_curl()` present + wired into all 3 call sites, (c) LIVE proof — the Saturday 6h VPS bctc cycle ran a SSC discovery chromium-free and queue drained (10-item Q1/2026 backlog ACV/BDI/D2D/DAG/DLC/GVR/HCM/HPG/HSG/HVN). ONLY then close row rtr-bctc-playwright-thread. Verify via raw bctc freshness / new cache PDFs on VPS, NOT a green badge.
- Report 3054: confirm next auditor Tier-2 pass does NOT re-emit prices/foreign_flow weekend CRITICAL (FIX-SLA-WEEKEND-AWARE live-proof, carried from last tick).
- Report 3055 (CTG-Q1 OCR confidence=0): if recurs next triage → candidate BCTC-OCR FIX; cross-check against VNM/VEA prior corruption pattern. Not actioned this tick.
- Prior still open: WATCH-2 refine slot-2 refire ~18:04Z (router-held verification); FIX-SLA-WEEKEND-AWARE Sun proof; FIX-REFINE-IDEM-LOCK-ISO 4-cases-GREEN; ORCH-DASH-DECISION-DRILLDOWN BA spec review.

## c · 2026-06-06T16:25Z — dev-team triage tick 162040Z (3 signals → BATCH 2, WIP=2)

**Disposition: SPIKE (VPS recon) + FIX (mcp-server SLA), 1 informational skip.** Weekend = free dev capacity; both fit WIP=2.

Dedup: neither router signal had an actionable backlog entry — they were only NOTED inside DONE `UNBLOCK-VPS-FETCH-RESUME` (c7d80e02) close-out, never created as tasks. Now disposed.

1. **rtr-bctc-playwright-thread** (MEDIUM/P2, router→system_issue) → **SPIKE** `SPIKE-VPS-SSC-CURL-RECIPE`, zone `cross-service/`. Root raw-confirmed by ops-vps-fetch c006 recon: VPS `vn-bctc-fetch` HOSE-SSC discovery uses **Playwright/Chromium** which fails `pthread_create: Resource temporarily unavailable (11)` every cycle since <=Jun 5 → 10-item Q1/2026 queue (ACV BDI D2D DAG DLC GVR HCM HPG HSG HVN) SKIPs every 6h. **KEY: this is a STANDING-POLICY VIOLATION — `dev-vps-crawls` init.md mandates `no_chromium: true` (VPS RAM); the SSC path never should have used Chromium.** Option (b) curl-based HTTP scraper is therefore the definitif AND policy-mandated fix — not option (a) raise LimitNPROC (band-aid that keeps a forbidden Chromium dep). Chain: ops-vps-fetch recons the SSC discovery endpoint request recipe (the prereq the recon doc flags as missing) → SPIKE output = recon doc → unblocks dev-vps-crawls FIX (write curl scraper, wire into PULL pipeline). Spiking first because the request-recipe is not yet captured; jumping straight to FIX would guess the endpoint.

2. **rtr-sla-weekend-aware** (LOW/P3, router→system_issue) → **FIX** `FIX-SLA-WEEKEND-AWARE`, zone `apps/mcp-server/`. SLA monitor + /api/vps-proxy-health have no market-hours/weekend awareness: prices+foreign_flow fetch loops are dow/hour-gated (Mon–Fri 02:00–08:59Z, confirmed ops c006) but staleness thresholds run 24/7 → guaranteed false-CRITICAL every weekend (yesterday burned a full auditor escalation + triage + 2x SSH recon on 2 HEALTHY services). Fix = calendar-aware expected-push schedule per source; also track foreign_flow separately (currently embedded in price push, invisible to monitor). SLA logic = `apps/mcp-server/src/interface/mcp/tools/market-data/dataFreshnessTools.ts` + `.../system/vpsProxyTools.ts`. baseline_pass=true (pure-add gating). **Live-proof window: THIS weekend (Sat/Sun Jun 6-7) — ship before Monday = free real proof the false-CRITICAL class is killed.**

3. **cowork-fire** (INFORMATIONAL, file→processed/) → **SKIP** (no dev work). Clean FIRE, both offhours gatherers spawned, snapToCronBoundary fix e2b5354c VALIDATED live (cadence due at elapsed 3h58m vs 240min pre-fix starvation). Logging this as closing observation for **FU-SNAP-CRON-BOUNDARY** — already shipped+validated, no batch entry needed.

**No orch-state mutation** (both items routed inline via BATCH, not backlog-inserted; dispatcher routes by type — SPIKE→architect/spike track, FIX→Step 3).

**Carry-over (next tick):**
- FIX-SLA-WEEKEND-AWARE: verify live this weekend — auditor Tier-2 should NOT emit prices/foreign_flow CRITICAL Sat/Sun after deploy; raw-check no new signal_queue staleness rows for those 2 sources.
- SPIKE-VPS-SSC-CURL-RECIPE: on return, confirm recon doc captures the actual SSC discovery request (URL/method/headers/payload) — that doc is the DoD; then queue dev-vps-crawls FIX (curl scraper) as follow-up next tick.
- report 3054 (auditor c045 4 VPS CRITICALs) — already root-caused: 3/4 false (weekend-gate x2 + sbv blip), 1 real (bctc playwright, now SPIKE'd). The SLA fix above directly removes the weekend false-CRITICAL class. No new task.
- Prior carry-overs still open: refine slot-1 09:00Z fire proof (WATCH-2), FIX-REFINE-IDEM-LOCK-ISO 4-cases-GREEN, ORCH-DASH-DECISION-DRILLDOWN BA spec review.

## c · 2026-06-06T14:25Z — triage cwk-refine-orchestrator-no-agent-tool (HIGH, agent-capability-gap)

**Verdict: REJECT Option A & B. APPROVE Option C (sequential in-agent, chunked+resumable). Last refine-pipeline blocker.**

**Root cause (raw-verified):** `refine_bctc_md` is a DUAL-DESIGN COLLISION on ONE agent id. flow/main.md L91-124 = orchestrator that fan-outs `spawn_agent()` per window; but init.md L32 `not_my_job: "Spawning sub-agents — this agent is itself a leaf subagent"` + L88-93 inter_agent + `.claude/agents/refine_bctc_md.md` tools = `Read,Write,call_tool` ONLY (NO Agent tool). The agent is BOTH orchestrator and worker = self-recursive, non-runnable.

**Why A/B are dead bets (runtime ground truth):** cowork dispatcher `spawn-fanout.md` L72-78 spawns `subagent_type: refine_bctc_md` via the Agent tool. A SUBAGENT has no nested Agent/Task tool → Phase 2 fan-out wall = structurally identical to §0.7.1 ENOENT. The §0.7 RULING (Option Y) assumed "host CC session, same Agent/Task pattern as all other cowork agents" but cowork-schedule `_runtime` = `*/15 CronCreate` dispatcher that spawns agents AS subagents (dispatcher L18: agent_id maps 1:1 to subagent_type). Nested custom-agent fan-out is NOT available to a spawned subagent. B (split orchestrator+worker ids) hits the SAME wall — the orchestrator id, when dispatcher-spawned, is still a subagent w/o Agent tool.

**Why C is correct & low-risk:** agent already has Read/Write/call_tool + 4 sub-flows (table/prose/continuation/verify) as INLINE LOGIC (not subagent boundaries). Sizing risk (34 windows × haiku one context) → solved by chunk+resume: process N windows/fire, `push_bctc_refined_unit` per window (reset:true ONLY on first push of fresh report — already in flow 4a), resume from un-pushed windows next fire; 2 daily slots drain backlog. NO new schema (reset/append idempotency already supports partial). Stale agent-def description ("writes docs/refine-output/...json — NEVER to DB") contradicts Option-Y push path — fix in same agent-father pass.

**Disposition: ARCHITECT (flow rethink, sign Option C semantics + chunk size + resume contract) → AGENT-FATHER (rewrite flow/main.md + init.md + .claude/agents def). WIP=2.** Next fire refine-bctc-slot-1 tomorrow 09:00Z = first live proof. Do NOT edit agent .md myself; do NOT edit orch-state (router applies).

**Carry-over:** verify tomorrow 09:00Z fire pushes bctc_refined_units rows on a real report (raw get_bctc_refined, NOT badge) — backlog drains. DGC Q4-2025 0c6f0535 (34 windows verified) = canary subject. FIX-REFINE-IDEM-LOCK-ISO (test-only) is SEPARATE & still valid.
