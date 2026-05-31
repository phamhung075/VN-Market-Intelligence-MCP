# PO Notebook

## Cycle 2026-05-31T14:59Z — FU-TRUST-REFRESH EXIT-WITH-CAVEAT + SPLIT → BANK-AWARE-BCTC

Operator decision cycle: recurring bank-vs-corporate bug-class surfaced 4× → rule scope + mandate architect root-cause.

**Raw verification (live gateway, NOT relayed badges — `feedback_router_verify_raw_not_badges`):**
- `get_bctc_full(FPT)` → real balanced numbers (TA 68.586,1 / Eq 40.122 / Liab 28.464,1 / NRev 12.480 / Gross 4.244,9≠Net / NP 2.476,8; conf 81%). Op/EBITDA/Cash=0 = known TR-2/BCTC-LAYOUT-FIRST, NOT regression. FPT consumable.
- `get_bctc_full(ACB)` → "balance sheet has no decomposition — forced-zero pass suspected". Block confirmed live. ACB scalars (per QA bun:sqlite + router) correct+balanced; gross NULL-legal (bank). DATA trustworthy, SERVING blocked.

**RULING 1 — SPLIT (not hold).** Core goal (kill mock data → real verified scalars FPT+ACB; FPT fully consumable) MET + raw-verified. Residual ACB block = distinct cross-cutting "bank-awareness across BCTC consumers" theme (B02-TCTD), NOT a continuation of OCR-seam/re-refine. Holding would conflate themes, keep ENV-P2 gated on already-achieved data-trust, and invite another point-fix. → FU-TRUST-REFRESH EXIT-WITH-CAVEAT (caveat stated explicitly so it's not a hidden false-green); new sprint BANK-AWARE-BCTC.

**RULING 2 — ARCHITECT ROOT-CAUSE FIRST (hard gate).** Class patched 3× this sprint (FU-6d aggregator, FU-6f B-1 eval anchors, FU-6f B-3 PUB-3-corporate-only) + still blocks ACB → `feedback_recurring_bug_escalation` + `feedback_silent_swallow_serial_bugs`. BANK-ARCH must enumerate EVERY corporate-assuming consumer (codes 100–440, gross_profit-mandatory, decomposition guard, eval stage-6 balance extraction, PUB-1..4, grep hardcoded codes) + design ONE discriminator-based (is_bank_form/B02-TCTD) handling for ALL in one pass. NO point-fix PUB-3-for-banks alone. Routed: BANK-ARCH (architect) → pm → dev-mcp-server.

**RULING 3 — new sprint seeded.** SPRINT_GOAL §BANK-AWARE-BCTC (vision/scope/SM/constraints) + TASKS BANK-ARCH→BANK-DEV→BANK-OPS→BANK-QA. FU-TRUST-REFRESH EXIT recorded with explicit caveat. Brief target `docs/architecture-briefs/2026-05-31-bank-aware-bctc.md`.

**ENV-ISOLATION-P2 GATE: 🟢 RELEASED.** OD-C required P2 schema to wait for the genuine re-refine — which HAPPENED (FU-1 seam + real FPT+ACB scalars). FU-4 data-trust intent MET. Residual ACB SERVING block is consumer-layer, does NOT touch P2's schema/refine write-path → does NOT extend the gate. P2 schedulable. NOTE: serialize EI-P2-2 mcp-server rebuild vs BANK-OPS rebuild (both `apps/mcp-server/` zone).

**Locks:** `task_release(task:FU-TRUST-REFRESH)` ok=false (TTL expired, acceptable). `task_claim(task:BANK-AWARE-BCTC)` claimed:true.

## Carry-over
- **NEXT dispatch (router):** spawn `architect` for BANK-ARCH (run `docs/agents/architect/flow/main.md`) — the hard-gated one-pass bank-aware enumeration. Do NOT spawn dev before the brief lands.
- ENV-ISOLATION-P2 now schedulable (gate released). When it runs, serialize its mcp-server rebuild against BANK-OPS (same zone) — flag to router.
- TOOL-SURFACE-HYGIENE: TSH-1 (dev-mcp-server deregister get_market_hexagram) still pending, ships first there; TSH-5 stat reconcile last.
- **TASKS.md cap:** 81L vs 80L cap (-1L vs the 82L I inherited; net improvement). All content load-bearing active scope — flag for janitor, do NOT trim sprint scope.
- FU-EI-COMPOSE backlog still pickable (ungated).
