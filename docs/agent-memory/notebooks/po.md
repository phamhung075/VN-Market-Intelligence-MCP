# PO Notebook

## Cycle 2026-05-30 — TRUST-EXIT: BCTC-TRUST-RED SIGNED OFF (critique-before-approve, live-verified)

Data-integrity RED closed. Trust layer was green-stamping fabricated FPT/ACB refine data (`refine_status=DONE`, confidence 0.80-0.85 on ordered digit-run values pushed via `push_bctc_refined_unit`; ACB gross=net_rev + zeroed equity/liab/cash passing a forced-zero balance check). Surfaced to analyst via `get_bctc_full`.

**Did NOT trust the ledger — spot-checked LIVE via gateway:**
- `get_bctc_full(FPT)` → "Chưa có dữ liệu BCTC" (zero financial numbers). Publish guard holds.
- `get_bctc_full(ACB)` → same refusal.
- `get_bctc_refined(e8ea3df5-…)` → "no refined units found" (purged).
- Code spot-check: ingest gate `validateBctcUnit` at `pushBctcRefinedUnitTool.ts:111` → BLOCK ⇒ `window_status='REJECTED_SANITY'` + `{ok:false, rejected_reason}` (never DONE). Publish guard `checkPublishability` PUB-1..4 at `bctcFullTools.ts:507` after `latestRow`. All 6 dev/test SHAs present on main.

**Verdict — anomaly CANNOT recur silently:** future fabricated push is REJECTED_SANITY at ingest (write seam); structured feed refuses to publish absent-decomposition / REJECTED_SANITY reports (serve seam). Gated at both seams.

Shipped: TR-0 (ingest gate + publish guard + purge), TR-1 (DDD-pure `bctcSanityValidator` DT-1 digit-run + `bctcMagnitudeValidator` DT-2/3/4). QA re-sweep a3f83b88 APPROVED, bun test exit 0, counts 8/18/17/5/13/59/19 @ 0-diff. ops rebuilt mcp-server fresh image (not restart). Updated `docs/SPRINT_GOAL.md` + pruned `docs/TASKS.md` 84→79L (≤80 cap), closed cluster as SHIPPED.

## Carry-over
- **KNOWN-OPEN:** (a) FU-TRUST-REFRESH — FPT+ACB now PENDING/empty; need genuine re-refine (real OCR, off-HOSE 02:00-08:59 UTC Mon-Fri) to restore real data — NOT this sprint. (b) TR-2 coverage folded into BCTC-LAYOUT-FIRST LF-QA gates. (c) DWF-TSC-DEBT — 19 tsc errors in `DWF-routing-policy-fence.test.ts` from DYN-WF commit 8105f8fd (`lastRule` undefined), pre-existing — belongs to DWF, tracked in TASKS not BCTC-TRUST-RED.
- TASKS.md scoped `git add <file>` ONLY — tree has MANY unrelated files (DWF/HCM/BTB); NEVER `-A`. main only, no branches.
- DYN-WF-FOUNDATION still GREENLIT (Phase 0+2), DWF-BA NEXT. Settled — never relitigate: 0+2 cut, 0→2→1 order, deterministic-router (OQ-6), single-JSON pressure-state, opportunistic-leader.
- Open parallel sprints: FF-DEAD (HIGH, vps uncontended), BCTC-LAYOUT-FIRST, SELF-IMPROVE X-1, CHEF-ATTN, FU-MON.
- Every new lock/policy MUST ship deliberate-violation proof, NOT "exit 0" (feedback_fence_false_green).
- Sign-off + ledger language = ENGLISH; Vietnamese only for FB posts + MARKET Telegram group.
