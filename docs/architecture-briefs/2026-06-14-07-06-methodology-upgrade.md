# Architecture Brief — 07-06 Methodology Upgrade: Macro/Top-Down Layer

**Date:** 2026-06-14T18:06:57Z
**Author:** agents-architect
**Source spec:** `docs/analysis-briefs/07-06-methodology-gap.md`
**Technique range:** T-15..T-45 (07-06 roundtable, Báu / Thành / Trường)
**Status:** IMPLEMENTED — all file changes landed by agents-architect directly

---

## Problem

The cowork team has no macro/top-down methodology layer. T-1..T-14 (31-05 roundtable) cover company/equity bottom-up. T-15..T-45 (07-06 roundtable) fill the macro layer above: inflation decomposition, FX stability mechanics, trade-deficit anatomy, and BOP reasoning. Without this layer, CHEF dishes and market-watcher signals are grounded only in price + BCTC data, missing the macro transmission channel (oil→CPI, CNY coupling, fiscal-trap liquidity, BOP FX-incidence). tran-ngoc-bau's audit has no adversarial gate.

---

## Scope (agents-architect lane only)

New skills + cowork agent flow upgrades. MCP tool commissioning (get_vn_trade_balance, get_vn_bop, get_vn_macro_indicators, get_cpi_components, get_vn_liquidity_state) is PO's parallel lane — not in this brief.

---

## Deliverables (all implemented in this session)

### A — Two new cowork skills

**1. `macro-health-read`** (`.claude/skills/macro-health-read/SKILL.md`)
- Techniques: T-15/T-16/T-17/T-18/T-21/T-22/T-24/T-25
- Six tracks: production (PMI MA, IIP YTD), consumption (real vs nominal), inflation (CPI peak-detection), investment (đầu tư công + FDI quality), FX (CNY coupling, SJC gap), liquidity (OMO trend)
- Degraded mode: runs off `get_macro_snapshot` + `get_policy_signals`, marks all tracks `is_estimate=true`
- Live mode: upgrades track-by-track as `get_vn_macro_indicators`, `get_cpi_components`, `get_vn_liquidity_state` are deployed
- Output: 6-track JSON with momentum verdicts (STRONG/AVERAGE/WEAK), never absolute snapshots

**2. `trade-fx-pressure-decomp`** (`.claude/skills/trade-fx-pressure-decomp/SKILL.md`)
- Techniques: T-26/T-33/T-34/T-35/T-36/T-38/T-40/T-42
- Five steps: two-bloc split (FDI vs domestic), HS attribution (electronics ~70–80%), processing-margin gate (NEGATIVE-MARGIN-TRAP when margin < 1 and volume rising), FX-incidence test (FDI_BENIGN vs DOMESTIC_PRESSURE), duration prior (~1yr cycle)
- Degraded: structural priors for electronics_margin (0.65), HS shares, is_estimate=true throughout
- Live: upgrades when `get_vn_trade_balance` and `get_vn_bop` are deployed
- Output: deficit anatomy + fx_incidence + margin_trap_flag + cycle_stage + fx_pressure_verdict

### B — Two EXTENDs to existing skills

**`regime-extraction`** — PMI MA3 extension (T-16): raw PMI print replaced by 3-period MA when `PMI_TREND` declared in flow Variables. Source: `get_vn_macro_indicators(transform=ma3)` live; `get_macro_snapshot()` PMI degraded.

**`four-factor-synthesis`** — Decompose-before-conclude gate (T-44): 3-question macro decomposition check (which component / direct-or-indirect to wallet / policy-shock-or-trend) added before scenario verdict. Failure to answer any question → downgrade macro leg to LOW, set `decompose_gap=true`.

### C — Six cowork agent flow upgrades

| Agent | Flow file edited | Techniques wired |
|---|---|---|
| market-watcher | `flow/cycle.md` Step 2 | T-16 (via macro-health-read), T-20 oil→CPI immediate, T-21 CPI peak, T-27 SJC gap, T-28 CNY coupling, T-32 leading-data, T-43 China PPI, T-41 fake-FDI |
| unified-agent/CHEF | `flow/chef.md` Step 1.5 + Step 3 | T-31 fiscal-trap, T-39 BOP walk, macro-health-read as Layer-1 source, trade-fx-pressure-decomp for electronics/IZ/banking clusters |
| digest-predict | `flow/weekly.md` Step 0c + synthesis | T-23 bank-survey consensus (VIRA/VARA), T-42 trade-cycle duration prior (1yr), macro-health-read weekly |
| bctc-analyst | `flow/stage-analyze.md` Step 2 | T-19 price_driven tag (retail/consumer), T-37 intercompany-loss flag (electronics/FDI assemblers) |
| news-scout | `flow/stage-signals.md` | T-41 fake-FDI detector (loss-cover vs organic FDI) |
| tran-ngoc-bau | `flow/audit-methodology.md` | T-45 adversarial cross-examination gate (weekly PASS/FAIL check) |

### D — Tree-map registration

Both new skills added to `docs/references/tree-map.md` under the tnb-methodology section. Existing TNB skills (SKILL-1..SKILL-6, regime-extraction) backfilled as pointers in the same block.

---

## Degraded-mode contract

All new skill outputs carry `is_estimate=true` per track until live MCP tools are deployed. Consumers (market-watcher, CHEF, digest-predict) must:
1. Log any `is_estimate=true` track at cycle start
2. Never assert HIGH conviction on an `is_estimate=true` macro leg
3. Include degradation note in WORK message (matching the existing degraded-dish floor in chef.md)

This contract ensures the skills are operationally safe NOW and auto-upgrade track-by-track as PO's MCP tool sprint ships.

---

## Dependencies

| Dependency | Owner | Status |
|---|---|---|
| `get_vn_trade_balance` | dev-vps-crawls + dev-macro-indicators | PO lane — pending |
| `get_vn_bop` | dev-vps-crawls + dev-macro-indicators | PO lane — pending |
| `get_vn_macro_indicators` | dev-macro-indicators | PO lane — pending |
| `get_cpi_components` | dev-macro-indicators | PO lane — pending |
| `get_vn_liquidity_state` | dev-macro-indicators + dev-vps-crawls | PO lane — pending |

---

## Signal to agent-father

`docs/signals/07-06-methodology-upgrade-20260614T180657Z.json` — agent-father must verify file integrity post-commit (no implementation work needed: all files were written directly by agents-architect in this session as authorised by user instruction).

---

## AC (Acceptance Criteria)

- [ ] `.claude/skills/macro-health-read/SKILL.md` exists, YAML frontmatter on line 1, ≤120L
- [ ] `.claude/skills/trade-fx-pressure-decomp/SKILL.md` exists, YAML frontmatter on line 1, ≤120L
- [ ] `regime-extraction/SKILL.md` contains PMI MA extension section
- [ ] `four-factor-synthesis/SKILL.md` contains decompose-before-conclude gate section
- [ ] `market-watcher/flow/cycle.md` Step 2 references macro-health-read skill and encodes T-20/T-21/T-27/T-28/T-32/T-43/T-41
- [ ] `unified-agent/flow/chef.md` Step 1.5 sources macro-health-read; Step 3 includes T-31 + T-39 + trade-fx-pressure-decomp
- [ ] `digest-predict/flow/weekly.md` Step 0c invokes macro-health-read; synthesis includes T-23 + T-42
- [ ] `bctc-analyst/flow/stage-analyze.md` has T-19 price_driven tag + T-37 intercompany-loss flag
- [ ] `news-scout/flow/stage-signals.md` has T-41 fake-FDI detector
- [ ] `tran-ngoc-bau/flow/audit-methodology.md` has T-45 adversarial gate
- [ ] `docs/references/tree-map.md` lists both new skills
