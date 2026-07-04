# Decision Journal — Sprint MERGE-MONEY-RADAR-INTO-MOMENTUM · agent-father

**Sprint goal:** no goal set (active sprint marker at task time; ESC4-HEURISTIC-FIX-TAXBASIS-SOE is an unrelated agent-heuristic-doc fix, journaled here per the resolver's active-sprint fallback)
**Agent:** agent-father
**Started:** 2026-07-04T00:11:20Z

---

### STEP agent-father-S1 · agent-father · 2026-07-04T00:11:20Z
**task-id:** ESC4-HEURISTIC-FIX-TAXBASIS-SOE
**what-done:** Fixed bctc-analyst ESC-4 non-op-income heuristic: AC-1 pre-tax-consistent formula `(PretaxProfit-OperatingProfit)/PretaxProfit` replacing the mixed after-tax/pre-tax calc; AC-2 SOE-conglomerate class (GVR/PHR/DPR/TRC/HRC) HIGH->INFO downgrade.
**what-considered:**
- Inline the fix directly in main.md ESC-4 bullet (rejected — buries a reusable formula + growing exception table in a 2-line gate check, breaks the ESC-3 precedent)
- New referenced sub-doc `esc-4-nonop-heuristic.md`, mirroring the existing `esc-coverage-guard.md` (ESC-3) pattern — chosen, keeps main.md thin + consistent with established convention
- Touch dev-team's drain-esc-dispatch.md to gate Opus spawn on severity — rejected, out of agent-father's zone (docs/agents/bctc-analyst/ only, per task FILES scope)
**why-decision:** Sub-doc mirrors the live ESC-3 esc-coverage-guard.md pattern exactly, keeps main.md/deep-dive-opus.md/stage-pass-pl.md under the 200L cap, and gives one single formula definition reused by all 3 call sites (no duplicate/drifting computation).
**why-change:** no change from PO promote_note spec — implemented AC-1 + AC-2 verbatim as specified.
