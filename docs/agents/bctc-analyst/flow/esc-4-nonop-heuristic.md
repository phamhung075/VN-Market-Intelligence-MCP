---
agent: bctc-analyst
sub_flow: esc-4-nonop-heuristic
version: "2026-07-04"
---

> Parent: [./main.md](./main.md)

# BCTC Analyst — ESC-4 Non-Operating-Income Share Heuristic

Loaded by `main.md` § ESC-4 (gate check), `stage-pass-pl.md` § T2 (One-Off Gain Dressing finding),
and `deep-dive-opus.md` § ESC-4 (Opus deep-dive). Fixes **ESC4-HEURISTIC-FIX-TAXBASIS-SOE**: a
recurring ESC-4 false HIGH fired 4x on byte-identical GVR data (2026-06-30 .. 07-03, active
redispatch loop). Opus deep-dive `bca-ddres-20260703T215200Z` (confidence 0.9) confirmed root
cause: the prior heuristic mixed tax bases in a single ratio.

---

## AC-1 — Pre-Tax-Consistent Formula (mandatory, replaces the retired mixed-basis calc)

**Root cause (retired):** the prior calc divided a pre-tax P&L line item (financial income code
22/23, other income code 31) by after-tax net profit (NPAT / "Lợi nhuận sau thuế") — pre-tax
numerator, after-tax denominator, mixed basis. For GVR: other-income line = 1037.6, mixed calc =
23.5% (> 0.15 threshold → false HIGH), vs. the pre-tax-consistent 35.0% of PBT. Mixing bases
produces a ratio that maps to no real accounting concept and drifts with each ticker's effective
tax rate — not a genuine one-off signal.

**Corrected formula — use this every cycle, both call sites below:**

```
non_operating_share = (PretaxProfit − OperatingProfit) / PretaxProfit
```

- `PretaxProfit` — pre-tax profit (PBT / "Lợi nhuận trước thuế", income-statement row code 50).
- `OperatingProfit` — operating profit BEFORE financial/other income (code 30 "Lợi nhuận thuần từ
  HĐKD", i.e. excluding financial income/expense and other income/expense lines).
- Both terms MUST be pre-tax. Never substitute `net_profit_after_tax` (NPAT/LNST) for
  `PretaxProfit` in either the numerator or the denominator.
- `item_pct` (stage-pass-pl.md T2 evidence field) and `one_off_pct` (main.md ESC-4 gate field) are
  now the SAME `non_operating_share` value — one computation, reused by both call sites. Do not
  compute it twice with different bases.
- **Guard:** if `PretaxProfit == 0` → skip (undefined ratio, no escalation) — same pattern as
  ESC-3's `net_profit_total == 0` guard in `main.md`.

---

## AC-2 — SOE-Conglomerate Exception Class (downgrade HIGH → INFO)

Some state-owned rubber/plantation conglomerates carry a structurally large non-operating share by
business model (land-bank compensation income, JV dividends, non-core asset disposals) — this is
normal for the sector, not earnings manipulation. Granular line-item breakdown is frequently
unavailable before footnote/segment passes complete, so `non_operating_share` alone cannot
distinguish "structural-normal" from genuinely anomalous for this class.

**Membership (SOE-conglomerate class):** `GVR, PHR, DPR, TRC, HRC`
(state ownership > 90% + land-bank/plantation asset base + net-cash balance sheet.)

**Rule:** when `ticker` is in the SOE-conglomerate class AND ESC-4 fires on `non_operating_share`
(this exception does NOT apply to the `related_party_pct` arm — that check is unaffected by the
tax-basis bug and still escalates normally):

1. Auto-tag `structural_context_note = "SOE-conglomerate class ({ticker}): non-operating share
   reflects land-bank/JV structure, not confirmed one-off manipulation. Downgraded pending
   granular line-item availability (footnote/segment passes)."`
2. Downgrade `severity: HIGH → INFO` on the emitted signal (both the `esc-deep-dive-request` signal
   in `main.md` and the `deep_dive_result` signal in `deep-dive-opus.md`, if it still runs).
3. Still escalate (send the signal) at INFO — do NOT suppress silently. PO/market-watcher must
   still see the note for audit trail; it is just no longer treated as an actionable HIGH alarm.
4. Re-arm to HIGH once `stage-pass-footnote.md` / `stage-pass-segment.md` return the granular
   non-operating line-item breakdown for that quarter — re-evaluate against the itemized figures
   at that point, not the aggregate ratio.

---

## Cross-References

- `main.md` § ESC-4 — gate check computes `non_operating_share` per AC-1, applies the AC-2
  downgrade before writing the `esc-deep-dive-request` signal.
- `stage-pass-pl.md` § T2 — One-Off Gain Dressing finding uses this formula for its evidence `pct`.
- `deep-dive-opus.md` § ESC-4 — Opus verdict must cite `non_operating_share` (pre-tax) and check
  SOE-class membership before recommending `flag_for_human_review`.
