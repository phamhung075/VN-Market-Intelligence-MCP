# PO Decision Journal — ANALYSIS-QUALITY-CONVERGENCE (+ cross-sprint triage)

## PO TRIAGE SWEEP — 2026-07-11T09:17Z (post PM closeout, commit a3351d49d)

**Context:** PM closed the ANALYSIS-QUALITY-CONVERGENCE wave (4/4 DONE, qa APPROVED: FR-1-CHEF-LEG-FR-2-ATOMIC,
FR-1-REMAINING-5-FLOWS, SPIKE-EARNINGS-REV-VALUATION-PCTILE-FEASIBILITY, CCATO-T3-FLOW-WIRING-6PT). PM flagged
`sprint_goal.entries=16 > soft-cap 15` for PO triage and left FR-3 gated. Standing mission: analysis precision —
expert-grade data wired end-to-end, all data planes converge into ONE synthesis, minimal working-history bloat.

### 1. sprint_goal.entries 16 → 14 (two evidenced actions; no legitimate active work lost)

**MERGE — FB-POSTER-LAUNCHD-FIRER → COWORK-GUARANTEED-SLOT-DURABILITY**
- Evidence: `docs/standards/cron-jobs.md` L200 — the generalized durability firer "generalizes and RETIRES the
  fb-only `com.vn-market.fb-daily-firer`". The generalized plist `launchd/com.vn-market.cowork-guaranteed-slot-firer.plist`
  is installed AND loaded (`launchctl list` → `com.vn-market.cowork-guaranteed-slot-firer`; live logs present).
- FB-specific residual board tasks (`FB-LAUNCHD-QA-FIRE-VERIFY-DEDUP` backlog, `FIX-FB-WEEKEND-DEDUP-GATE` review)
  RE-POINTED `.sprint = COWORK-GUARANTEED-SLOT-DURABILITY` so the merge is board-coherent (no orphaned sprint ref).
- Entry 14 (durability ruling) retained as the single tracking anchor for the launchd-firer theme.

**ARCHIVE — NARRATIVE-TRUTH-CCATO-GATE**
- Evidence: both board tasks DONE — `CCATO-T2-CLAIM-TRUTH-SKILL` [DONE], `CCATO-T3-FLOW-WIRING-6PT` [DONE, qa-APPROVED
  per PM closeout, commit ca2375c54]. Deliverable = claim-truth-gate skill + 6-flow wiring, both shipped. Zero open work.
- Live-flow CCATO effect (gate rejecting fabricated absence-claims) is now continuously exercised by every cowork
  narrative cycle; any regression surfaces as a NEW signal, not a reason to keep the sprint vision open.

**RETAINED (12 remaining active/planned) — not pruned:**
- Core mission (KEEP active): ANALYSIS-QUALITY-CONVERGENCE (FR-3 pending), FIX-BCTC-BANK-SUMMARY-MAPPING (2 BLOCKED review),
  OHLCV-UNIT-CONTAM, S2-DATA-HONESTY, MONEY-RADAR-P0, MERGE-MONEY-RADAR-INTO-MOMENTUM, SYSTEMIC-REMAKE-P1, VN-MACRO-TOOLING.
- Peripheral (KEEP, NOT deferred — deferring = losing the only intent record; none have a backlog home):
  QUE-REFERENCE-PAGE, KINHDICH-HOVER-DETAIL, DOCLANG-SERIALIZE, FE-PAGE-REORG, PREDICTION-CLAIMS-DAILY-CADENCE.
  Revisit for pruning only if slot pressure returns above 15.
- MONEY-RADAR-P0 vs MERGE-MONEY-RADAR-INTO-MOMENTUM: NOT duplicates — a build→surface pipeline (P0 = radar tools/composite;
  MERGE = unify radar+momentum into one /dashboard/momentum). Both kept.

**Result: 14 entries, one slot of headroom under soft-cap 15. task_total=458 held (sprint_goal edits touch visions,
not board rows — orch-apply conservation-check confirmed 458=458).**

### 2. FR-3 gate — GAP-CHEF-SYNTHESIS-B (endpoint+card) blocked on GAP-CHEF-SYNTHESIS-A live-cycle verification

- A (`GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST`, REVIEW) added chef.md Step 7.6 (07-10) that persists the TNB 6-layer
  synthesis to `docs/data/unified-agent-synthesis-<DATE>-<SLOT>.json`.
- **Cannot verify now:** artifact does NOT yet exist (`ls docs/data/unified-agent-synthesis-*` → none). No CHEF dish has
  fired since Step 7.6 landed — today is Saturday, so weekday dishes (Morning 05:15Z / Intraday XX:13Z / EOD 08:45Z, all
  `* * 1-5`) are dark.
- **Verification path (decided):** next NATURAL CHEF cycle.
  - Nearest: **Evening Preview 19:45Z Sat 07-11** (daily slot `45 19 * * *`, guaranteed via cowork-guaranteed-slot-firer launchd).
  - Reliable full-dish fallback: **Mon 07-13 Morning 05:15Z or EOD 08:45Z** (richer conviction/sector coverage).
  - **Who/what:** qa (or dev-team tick) after the cycle fires — deterministic artifact check:
    file exists AND `.conviction_calls|length>0` AND `.sector_phases|length>0` → flip A REVIEW→DONE_VERIFIED →
    GAP-CHEF-SYNTHESIS-B (FR-3) auto-unblocks.
  - **No new board row minted** (conservation-neutral): the existing REVIEW row IS the tracking; annotated its
    `review_note` with the concrete window + verify predicate.

### 3. Next lane for the quality mission

- **Primary next lane = FR-3 (GAP-CHEF-SYNTHESIS-B-ENDPOINT-CARD)** — the convergence spine's next step; stays BACKLOG,
  auto-eligible once A verifies (evening 07-11 or Mon 07-13). dev-mcp-server adds GET synthesis endpoint + frontend card.
- **SPIKE-EARNINGS-REV-VALUATION-PCTILE — does NOT graduate.** Verdict INFEASIBLE for both (a) earnings-consensus-revisions
  and (b) VN-Index multi-year P/E history (live HTTP probe, PLAN-ONLY). Correctly closed; zero FR-7 follow-on per its own
  mandate + BA AC-12. No build lane.
- **Idle-slot fill (WIP 1/2; peer OPS-BCTC-REFINE-REPASS-NONBANK-5T owns the other slot — untouched):** left to the
  dev-team loop's priority pick. Did NOT ready `BA-ANALYSIS-QUALITY-CONVERGENCE` (stale — the wave already consumed its BA
  spec; readying it would be a stale-pick). Top unblocked mission-aligned backlog candidates (pre-verified `depends:none`):
  `CONTAM-11-REMEDIATE` (OHLCV-UNIT-CONTAM — repair 3023 contaminated sub-1000 rows) and `WATCHLIST-DB-SYSMAP-DRIFT-FIX`
  (MONEY-RADAR-P0 — resync SQLite watchlist from system-map SSOT). Both data-integrity/core-mission; PO leaves them in
  backlog for the loop rather than force-readying into a peer-owned WIP window.

**Hazards honored:** dry-run diff before apply (all lane lengths + rest-of-doc identical; entries[] stayed array-of-objects,
no map→array flip); status-flips paired with lane-moves (none needed — no board flips this pass); orch-apply.sh wrapper only.
