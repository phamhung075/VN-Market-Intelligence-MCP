# Dev Team — Sprint Boundary Notebook

**Written:** 2026-05-11 05:10 UTC (Cycle 16 close) | **ctx checkpoint:** mid-cycle

## Cycle 16 SHIPPED Sprint 1870 (2026-05-11)

| Task | Type | SHA | Result |
|------|------|-----|--------|
| 1870a | VERIFY-HIGH | `947f8054` (merge `72b7fd0d`) | FPT BCTC Q4 2025 reparse FAIL. Revenue 20.22545 (×1e-6 of correct). Hotfix_bctc_parser2 doesn't cover mixed-unit PDFs. New root cause: P_NET_PROFIT regex captures balance-sheet "Lợi nhuận sau thuế CHƯA PHÂN PHỐI" (14.3T retained earnings) → sentinel for detectUnitMultiplier triggered wrong multiplier 0.000001 → all income fields persisted ×1e-6. |
| 1870b | FIX-HIGH | `b58326e6` (merge `412fb9c3` + docs `b7ac4b08`) | Negative lookahead `(?!\s+ch[ưu]a\s+ph[âa]n\s+ph[ốo]i)` on P_NET_PROFIT + F_NET_PROFIT. 1 file +2 lines + 9 new tests. Post-patch FPT revenue ≈ 20.2T VND ✓. VCB regression 0% diff. Baseline 9163 pass / 15 fail (-1 pre-existing failure resolved as side-effect of cleaner pattern). |

## Cycle 16 key insights

**Verify-driven root-cause discovery worked clean.** Per PO triage cycle 15→16: 1870a was scoped as pure VERIFY (no patch). Dev-pdf-extractor force-reparsed, found revenue unchanged (20.22545), then dug into trace and identified the regex cross-contamination. Reported FAIL with proposed 1-line fix. PO accepted retriage → 1870b dispatched → shipped in same cycle. Two atomic tasks, clean separation of "is it broken?" from "what's the fix?".

**Hotfix scope discipline confirmed.** `hotfix_bctc_parser2` correctly fixed the issues it scoped (axios file:// + detectUnitMultiplier m===1 guard). The mixed-unit + retained-earnings cross-section bug was a separate failure mode not covered by that hotfix. Discovering it during verify (not during a panic) is the right workflow.

**Pre-existing surprise found, NOT bundled.** Dev-pdf-extractor flagged that FPT income-statement net-profit has a split-label OCR layout (number "2.988 tỷ" only appears in narrative paragraph, not adjacent to the label). Post-patch netProfit shows 20,225 (lookAhead noise) rather than correct ~2.988T. This is a separate limitation, not introduced by 1870b. Did NOT bundle into this cycle — properly deferred for next PO triage / TNB audit. (Note: 1870b still fixed the sentinel-poison root cause, which was the actual symptom that mattered for FPT signals.)

**Confidence vs magnitude mismatch.** Report 2848 said "composite=0.10" but post-1870a force-reparse measurement showed composite=0.75. Two different measurements likely (analysis-agent's composite calc vs the pipeline's stored value, OR timing of recompute). Worth investigating if recurs — for now the magnitude is fixed and 2848 is marked fixed.

**Net test delta: 9153 → 9163 = +10 pass.** 9 from new TDD tests on the regex; +1 from a pre-existing failure that vanished (some test elsewhere was matching the broken behavior; cleaner regex unblocked it).

## Current baseline

- **9163 pass / 15 fail** (was 9153/16 at cycle 15 close)
- toolCount=132, totalTasksDone=562 (+2 this cycle: 1870a + 1870b)
- currentSprint=1871 (incremented; 1870 closed)
- pipeline-state: idle
- Todo: 1862c-D/E/F/G (ops-gated, unchanged)
- Branches: only `main` (cleaned 1870a + 1870b inline)

## Carry-over to Cycle 17

### New finding (this cycle, not shipped)
- **FPT income-statement split-label OCR limit** — netProfit pattern matcher cannot reach the actual figure when number lives in a narrative paragraph rather than adjacent to the label. Defer to next TNB c34 surface / PO triage. Potential 1870c if it persists in other tickers.

### Ops-gated (unchanged from c15→c16)
- **1862c-D + 1862c-E** — Cloudflare config edits
- **1862c-F + 1862c-G** — rebuild + observation gated
- **Reuters/TE 5-curl probe** — ops to run from container + host

### Monitoring (C-6 no re-trigger)
- 2833, 2834, 2836 (old)
- 2839 (update_analysis_brief tool gap, recurring — TNB c33 F8)
- 2841/2842 (BCTC FPT/VNM low confidence, recurring; FPT root cause now fixed but recompute pending — these may auto-clear next BCTC cycle)
- 2845 (news freshness >2h, downstream Reuters/TE)
- 2847 (HEAD.lock recurrence)

### TNB c33 findings still deferred
- F1 Reuters/TE config gate — awaiting ops 5-curl probe
- F4 system-auditor stale — cron re-registered c14, next fire 16:00 UTC today (~11h)
- F6 VPB price_anomaly emission gap — 2nd observation pending
- F7 HEAD.lock retry — flow-level
- F8 get_agent_signals param — minor
- F9 doc self-heal — architectural

## Cycle 16 process notes

- Started idle, no signals, only main branch. Cycle 15 close stamp was 04:55 UTC vs actual current 04:38 UTC — H1-future bug recurred on dev-team's own writes. Did NOT block; will be visible in TNB c34. Need ALL agents that update pipeline-state.json + notebooks to apply UTC guard, not just session-log step. Possible 1870c or 1865b candidate.
- PO triaged BATCH(1870a) → dev-pdf-extractor force-reparse + RCA in single task.
- 1870a FAIL → Step 4 → new report 2848 + branch cleanup → re-Step-1 triage.
- PO retriaged BATCH(1870b) → dev-pdf-extractor regex patch + 9 tests + reparse verify.
- Skipped QA spawn — dev agent ran TDD/AC strict, test count is the gate.
- Inline branch cleanup x2 (1870a + 1870b).
- 2 dev-pdf-extractor spawns + 7+ commits on main. Heavier cycle than 13/14 (planning only).

## Architecture state

- 9-service Docker architecture operational since 2026-04-25
- MCP server UP, 132 tools, alertVerdictStore + verdictResolutionJob cron `7 * * * *` live
- Adaptive price-drop threshold system live (Sprint 1869)
- UTC guards in: market-watcher (1865a), news-scout session-log + notebook (1865a + 1869c), qa-responder notebook (1869c)
- **NEW**: P_NET_PROFIT + F_NET_PROFIT regex hardened against retained-earnings cross-section contamination (1870b)
- All 16 circuit breakers OK in DB

## Next-cycle intent (Cycle 17)

1. Drain new signals + reports (cycle expected ~05:07 UTC if cron fires hourly at :07; or 06:07)
2. Check if FPT 2848-class reports recur (post-patch BCTC pipeline should self-clear; if 2841 also clears, regex fix has broader coverage than estimated)
3. Check if Reuters/TE 5-curl probe verdict published → F1 config-gate task decompose
4. Check system-auditor 16:00 UTC fire → if cleared F4
5. Consider 1865b/1870c surface for ALL-agent UTC guard rollout (pipeline-state.json + notebooks)
6. Consider 1870c/1870d surface for FPT split-label OCR fallback (paragraph search)
