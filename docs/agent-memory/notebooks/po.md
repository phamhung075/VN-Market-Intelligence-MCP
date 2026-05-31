# PO Notebook

## Cycle 2026-05-31 — BANK-AWARE-BCTC PO-EXIT (CLOSE)

QA signalled sprint-complete (040409f9). EXIT sign-off on bank-form B02-TCTD awareness across 7 BCTC consumers via single SSOT discriminator `bctcFormType.ts`.

**VERDICT: ✅ CLOSE.** All gates GREEN + independently router-raw-verified (NOT relayed badges — `feedback_router_verify_raw_not_badges`).

**My own raw verify (live `get_bctc_full` via gateway, I opened the values):**
- ACB (bank B02-TCTD): SERVES RAW, NO "no decomposition/forced-zero" refusal (the FU-EXIT block is GONE). Balance reconciles TA 1.030.900,7 = Liab 932.149,7 + Eq 98.751,1. Gross absent (NULL-legal), Current Ratio "N/A (bank)".
- FPT (corporate B01-DN): 0-regression. Gross 4.244,9 (34%) RESTORED, Current Ratio 1.00x, balance TA 68.586,1 = 28.464,1 + 40.122, conf 81%.
- Discriminator grep-confirmed = brief: ROMAN_SECTION anchored Roman/section regex AND `^[0-9]{3}` corporate veto (L76-78). toolCount 154, health ok, live img 7f413304.

**Process win — both standing rules fired:**
- recurring-bug-escalation: 3rd touch on bctcFormType.ts forced architect root-cause, not another point-fix. 4 iterations: domain-keyed → no-3-digit=bank → any-letter=bank → HYBRID (941bf552 FINAL).
- router-verify-raw-not-badges: caught the DEV-3 FPT regression INVISIBLE to the green suite — FPT real VAS codes 411a/420a/420b/26b contain letters, so architect's "corporate codes purely numeric" premise was empirically false. Only live get_bctc_full reading exposed it. DV test now seeded with FPT's REAL codes → iteration #5 cannot regress silently.

**Follow-ups seeded (do NOT block EXIT):**
- FU-BANK-CODECOL (TASKS Backlogs) — VN label text leaks into `code` column of bctc_table_rows (markdown→rows column-alignment defect). Hybrid immune (anchored regex won't match prose) but real data-quality bug. NOT gated.
- Out-of-scope, recorded not seeded (pre-existing/unrelated): VCB refine_status=PENDING/0-rows placeholder; FPT YoY 2025-Q4 gross-margin-100% prior-period contamination (FU-TRUST-REFRESH #16 caveat, current 2026-Q1 clean); 135 pre-existing full-suite failures.

**Writes:** SPRINT_GOAL §BANK-AWARE-BCTC status→PO-EXIT/CLOSED + full sign-off block. TASKS.md: section removed → closed-sprints follow-up line (68L, was 81L, under 80L cap). FU-BANK-CODECOL seeded to Backlogs.

## Carry-over
- ENV-ISOLATION-P2 schedulable; serialize EI-P2-2 mcp-server rebuild vs any future apps/mcp-server rebuild (BANK-OPS now done, no longer a collision). Flag to router.
- TOOL-SURFACE-HYGIENE: TSH-1 (deregister get_market_hexagram) still pending, ships first; TSH-5 stat reconcile last (expect toolCount 153 after — note: live is 154 with hexagram still present).
- FU-BANK-CODECOL pickable when apps/mcp-server has no active reliability sprint.
- ACB confidence shows 38% live — tied to known code-column/pre-finalization artifacts, not a BANK-AWARE regression.
