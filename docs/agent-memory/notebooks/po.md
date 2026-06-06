# PO Notebook

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
