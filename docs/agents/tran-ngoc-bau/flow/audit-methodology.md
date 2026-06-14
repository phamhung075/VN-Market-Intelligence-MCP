> Parent: [./main.md](./main.md)

# Tran Ngoc Bau — Phase 2.5: Methodology Audit (Báu + Long/Tuấn framework)

**Step 4b — Score every reviewed agent against `tnb-methodology.md` Layer 5.**

For each agent notebook surveyed in Phase 2 + every MARKET investment thesis from Phase 1, walk the 9-step decision tree:

| Step | Check | Source |
|------|-------|--------|
| A | Highest-frequency indicator opens the analysis (monthly > quarterly) | Layer 1.1 |
| B | Threshold crossings flagged (PMI ↔ 50, USD/VND ↔ 26500, US10Y ↔ 4.5%, FII carry ↔ 0) | Layer 1.2 |
| C | Cause + transmission chain attached (Level 1 → Level 4 of `market-analysis.md`) | Layer 1.3 |
| D | US calls: PMI (with sub-components) checked **before** consumer / services; Fed liquidity claims reference EFFR–IORB spread | Layer 2 |
| E | VN calls: VIRA cited (or VIRA-absence noted while VPS scraper is pending), IMF/ADB/WB never primary, **no WiData** (paid, off-limits) | Layer 3 |
| F | Investment theses: pillar count of {M2, COC, EPS, POL} ≥ 3 | Layer 4 |
| G | BCTC opinions: NI vs OCF compared **and** ≥1 forensic gate (M-Score / F-Score / accruals / BTN trick check) | Layer 7 |
| H | Investment theses: cycle phase declared **and** pyramid tier matches phase | Layer 8 |
| I | All macro claims trace to a Tier 1–3 source (no social-media-as-primary) | Layer 9 |

Score: ≥7/9 = GOOD | 4–6 = NEEDS_ATTENTION | ≤3 = CRITICAL
(Steps G, H, I = `n/a` when output type doesn't apply — n/a is neutral, max stays effective.)

Log per agent:
```
[Methodology] {agent} A=✓ B=✗ C=✓ D=✓ E=✓ F=2/4 G=n/a H=✗ I=✓ → NEEDS_ATTENTION
  gap: {pull entry from tnb-methodology.md "Common methodology gaps" catalogue}
```

If the same gap appears 3+ cycles in the same agent's notebook → **AUTO-CURE (Step 6 in report-cycle.md)** using the auto-cure column of the catalogue table. If gap is not in the catalogue, append it there first (do NOT inline new gaps in the flow).

---

### T-45 — Adversarial cross-examination gate

Before this audit cycle's WORK report is finalised: confirm that at least one dish this week contained an adversarial exchange — a claim that was challenged and either defended with data or explicitly down-weighted.

**Check:** Scan the CHEF-DETAIL WORK messages (Phase 1–2 audit, Step 4). Look for any of:
- A thesis that was contradicted by another signal and the contradiction was resolved (not ignored)
- An explicit confidence downgrade citing conflicting evidence
- A gap marker `[gap: ...]` that forced a decomposition (T-44 gate in four-factor-synthesis)

**Verdict:**
- `adversarial_gate = PASS` if at least 1 instance found in last 7 days of CHEF dishes
- `adversarial_gate = FAIL` if no challenge found — append to Step 7 WORK audit row:
  ```
  [tnb-audit] adversarial-gate FAIL — no claim challenged this week. Model: Báu vs Thành China-PPI exchange
  (07-06 roundtable T-45): force one decompose-before-conclude check on next morning dish.
  ```

Log: `[adversarial] gate={PASS|FAIL} — {evidence or "none found"}`
