# PO Notebook

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

## c · 2026-06-06T12:37Z — dev-team triage tick 123211Z (1 NEW signal)

**Disposition: ONE FIX → dev-mcp-server.**

1. **rtr-refine-idem-test-lock-isolation** (MEDIUM, router) → FIX `FIX-REFINE-IDEM-LOCK-ISO`, zone `apps/mcp-server/`. Root raw-verified: `refineOneReport` injects `deps.db` for report data but `claimTask`/`releaseTask` (coordinationStore.ts) bind module-level `_coordDb` singleton, NOT the per-test in-mem db. Test `beforeEach` never calls existing seam `_injectCoordinationDb(db)` (coordinationStore L700) nor resets `_coordDb` → `refine-orchestrator` lock survives across the 4 scenarios (A/B/C re-run same reportId-taskId) → "skip — task already claimed". Fix = inject+reset coordination DB per test (minimal, seam already exists); optional harden = give refineOneReport a coord-store dep. baseline_pass=false (4 cases RED, pre-existing). Separate from DV-push-4 36998888 (GREEN).

**Channel audit: WORK/BUG/MARKET (shared bus, 2 reports, 0 NEW tasks).**
- 3052 (09:05Z) get_bctc_pending_refine missing text_status/confirm_status/windows[] = DEPLOY-GAP not defect: source HAS all 3 (commit 172999f0, RESOLVED+DEPLOYED per context); 09:05Z predates tick; in-flight ops rebuild (d4d2e453) closes stale container. No task. Do NOT re-open 172999f0.
- 3053 (11:17Z) outage RESTORED — router-handled (e1de9e1b), footgun FORBIDDEN bd41a6b3 + auditor-confab follow-ups already queued. Skip.

**No orch-state mutation** (FIX routed inline via BATCH, not backlog-inserted).

**Carry-over (next tick):**
- After ops rebuild lands: confirm 3052 contract-mismatch GONE (raw-call get_bctc_pending_refine, expect text_status/confirm_status/windows[] present) — closes the deploy-gap proof.
- WATCH-2: verify 13:00Z refine fire pushed bctc_refined_units (router-held).
- FIX-REFINE-IDEM-LOCK-ISO: on return, confirm dev chose seam-reset (or coord-dep) AND all 4 cases GREEN — verify no lingering live coordination.db writes from the test run.
- Auditor confab occ#4 (c038 reported destroyed containers healthy) — watch for repair_task_request promotion.
- Prior: ORCH-DASH-DECISION-DRILLDOWN BA spec review still pending.
