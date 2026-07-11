# Decision Journal — Sprint ANALYSIS-QUALITY-CONVERGENCE · qa

**Sprint goal:** BA-driven convergence lanes (FR-1..FR-7) — momentum/RS/52w/insider indicator wiring + anti-fabrication gate extensions across 6 flows, CCATO claim-truth-gate wiring, CHEF synthesis endpoint/card, recon SPIKE.
**Agent:** qa
**Started:** 2026-07-11T00:00:00Z

---

### STEP qa-S1 · qa · 2026-07-11T00:00:00Z
**task-id:** FR-1-CHEF-LEG-FR-2-ATOMIC
**what-done:** RAW-verified dev commit 3ab600af9 (chef.md wiring+regex) + board-move 639ea9796 against architect brief §2.2 atomicity + BA AC-6; tested the AF-1 regex directly (not eyeballed).
**what-considered:**
- Atomicity claim (both legs in one commit) — confirmed TRUE via `git show 3ab600af9`
- Family-count claim (5→9) — confirmed TRUE (5 old + 4 new families = 9)
- Regex functional correctness — tested all 14 patterns against sample tokens (python re.search)
**why-decision:** `pct_from_52w_high \d+\.?\d*` (chef.md:355) lacks the `-?` sign that pct_from_52w_low/roc/z_score/net_sentiment_score all carry. Go backend contract (`proximity_service_test.go:128`) proves real values are always ≤0 — so this is the common case, not an edge case. A fabricated negative pct_from_52w_high citation will NEVER trigger the AF-1 self-check — defeats BA AC-6 for that sub-token. Same root-cause (sign misread) also makes chef.md:190's "`pct_from_52w_high > 80%`" threshold unreachable dead logic. CHANGES_REQUESTED, not APPROVE — this is the literal deliverable FR-2 exists to ship, and it has a real hole.
**why-change:** No change from plan (standard RAW-verify gate); the regex-testing depth (actual re.search runs vs eyeballing) is what surfaced the defect the dispatch explicitly asked me to check for.

---

### STEP qa-S2 · qa · 2026-07-11T08:15:35Z
**task-id:** FR-1-CHEF-LEG-FR-2-ATOMIC
**what-done:** Round-2 re-review of fixer commit ceab8e25c. Re-ran AF-1 regex myself (python re.search) against required cases + full 14-pattern family sweep; verified D2 threshold coherence against Go sign-convention test; diffed commit for scope creep; grepped chef.md to confirm round-1 wiring untouched. Flipped board row REVIEW→DONE via proper lane-move (review[]→done[], not status-only flip).
**what-considered:**
- D1 fix: `pct_from_52w_high -?\d+\.?\d*` — tested against "pct_from_52w_high -12.5" (MATCH), "pct_from_52w_high 0" (MATCH), "pct_from_52w_low -3.2" (MATCH, unaffected pattern). All 14 individual blocked-token patterns re-tested (RSI/MACD/BB/σ/MA, roc/z_score/decile, percentile/rs/composite_score, pct_from_52w_high/low, net_sentiment_score) — zero regressions vs round-1 baseline.
- D2 fix: chef.md:190 `pct_from_52w_high > -5%` — cross-checked against `apps/technical-analysis/pkg/domain/proximity_service_test.go:110-133` (`TestProximityService_Plausibility` hard-asserts `pct_from_52w_high <= 0`, drawdown-from-high convention). Values near 0 (e.g. -5%..0%) correctly denote "near 52w-high" — threshold now reachable and semantically coherent. Adjacent `pct_from_52w_low < 20%` clause untouched by fixer and confirmed still correct (pct_from_52w_low >= 0 convention, was never broken).
- Scope: `git show --stat ceab8e25c` = exactly 2 files (chef.md, orch-state.json), both diff hunks are the 2 targeted one-line edits — no scope creep. `git log 3ab600af9..ceab8e25c -- chef.md` shows only the fixer commit touched the file since round-1 approval.
- Round-1 wiring intact: grep confirms Step 0 tool calls (chef.md:111-114), Step 3 guidance (188/190/192), Step 4 conviction-scoring (222-226), Step 6.7 self-check tool-source cross-reference (359) — all present, unmodified beyond the two D1/D2 edits.
**why-decision:** Both defects from round 1 are fixed at the exact reported root cause (sign-convention misread), minimum targeted diff, no new defects introduced, no scope creep, round-1 approved scope fully intact. APPROVE.
**why-change:** No change from plan — round-2 re-review scope as dispatched (re-verify raw, confirm scope, verdict + lane-move), no full re-audit needed since round-1 already validated atomicity/wiring/family-count.
