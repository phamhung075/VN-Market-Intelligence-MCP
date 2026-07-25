# Decision Journal — Sprint FIX-FB-GATE-CHECKC-NEGATION-LEXICON · developer

**Sprint goal:** fb-gate Check-C negation-lexicon gap (lesson L4) + \d BSD-grep portability
**Agent:** developer
**Started:** 2026-07-25T04:37Z

---

### STEP developer-S1 · developer · 2026-07-25T04:55Z
**task-id:** FIX-FB-GATE-CHECKC-NEGATION-LEXICON
**what-done:** Zone check: `scripts/` is cross-service/, no dev-* specialist owns it (fallback → developer handles directly, per zone_dispatch rule).
**what-considered:**
- only path: dispatcher pre-confirmed both root causes at exact source lines (617, 636); re-verified live before editing — both were genuinely unfixed (not already-applied).
**why-decision:** re-verify-then-fix is cheaper than a speculative re-dispatch; single-file S-size fix, no zone ambiguity.
**why-change:** no change from plan.

### STEP developer-S2 · developer · 2026-07-25T04:58Z
**task-id:** FIX-FB-GATE-CHECKC-NEGATION-LEXICON
**what-done:** FIX(1) line 617 `SELLOFF_AFFIRM_LINES` negation-strip: added `chưa( phải| từng)?` alternation.
**what-considered:**
- bare `chưa` substring alone (already generic since grep -vE is substring, not anchored) vs the mandate's literal-suggested `chưa (phải|từng)?` form.
- rejected: hardcoding only the 2 observed phrases ("chưa hoảng loạn"/"chưa phải bán tháo") — violates GENERIC MANDATE.
**why-decision:** used `chưa( phải| từng)?` — matches bare "chưa" AND the phải/từng variants in one alternation, self-documenting the 2 named variants while remaining substring-generic for any other chưa-prefixed clause on the line.
**why-change:** no change from plan.

### STEP developer-S3 · developer · 2026-07-25T05:00Z
**task-id:** FIX-FB-GATE-CHECKC-NEGATION-LEXICON
**what-done:** Audited every `\d` in the 1751-line script (25 total). FIX(2): line 636 `chỉ \d mã sàn` → `chỉ [0-9] mã sàn` (the only real bash `grep -ciE` occurrence). 24 other `\d` at lines 433/452/469/515/528/542/985/1006/1306/1308/1476/1482/1488/1494/1500/1639/1664/1672/1685/1686/1697/1698/1699 confirmed inside `python3 - ... <<'PYEOF'` heredocs (Python `re` raw strings) — cross-referenced against every PYEOF block boundary in the file, all fall strictly inside; SKIPPED, untouched (correct as `\d` under Python `re`).
**what-considered:**
- only path: mechanical classification by heredoc-boundary containment — no ambiguous cases found.
**why-decision:** line 636 was the sole bash-grep `\d`; all others provably Python-context.
**why-change:** no change from plan.

### STEP developer-S4 · developer · 2026-07-25T05:15Z
**task-id:** FIX-FB-GATE-CHECKC-NEGATION-LEXICON
**what-done:** Built persistent regression harness `scripts/test-fb-gate-checkc-negation.sh` (3 assertions) + proved RED→GREEN via pathspec-limited `git stash push/pop -- scripts/fb-data-integrity-gate.sh` (NOT whole-tree stash — repo has 200+ pre-existing peer stash entries from concurrent agent sessions; pathspec-limited avoids any collision risk).
**what-considered:**
- initial fixture A put "chưa hoảng loạn"/"chưa phải bán tháo" on the SAME line as "không có mã nào giảm sàn" — confounded: the PRE-EXISTING "không có" negation marker already stripped that whole line pre-fix, so RED did not reproduce (false-negative regression test). Corrected: rewrote fixture A so the chưa-negated clause carries no other negation marker on its line, isolating the "chưa" gap.
**why-decision:** RED must prove the SPECIFIC gap being fixed, not an already-covered case — caught own test-design bug before trusting a false RED-skip.
**why-change:** fixture content changed from first draft; core assertions and fix unchanged.

### STEP developer-S5 · developer · 2026-07-25T05:18Z
**task-id:** FIX-FB-GATE-CHECKC-NEGATION-LEXICON
**what-done:** A/B result — RED (stashed pre-fix): 4/6 pass, assertion (1) FAILS reproducing the exact false-BLOCK ("[BLOCK] Check-C breadth-narrative... live VN-Index=-0.8%"). GREEN (fix popped back): 6/6 pass.
**what-considered:**
- FIX(2)'s BSD-`\d`-literal bug does NOT reproduce on this sandbox's `/usr/bin/grep` (BSD grep 2.6.0-FreeBSD, GNU-compatible build) — `\d` IS accepted as a digit class here under `-E`, contradicting the classic BSD-grep-treats-\d-literally story for this specific build.
**why-decision:** documented transparently as informational (not fabricated RED) — `[0-9]` is still strictly correct/required since \d support is a non-portable extension not guaranteed on every grep the gate may run under (incl. the production host where the bug was originally observed); assertion (3) is designed to degrade gracefully to informational-PASS rather than force a false FAIL when the local grep happens to be more permissive.
**why-change:** none — fix applied regardless of local reproducibility, per explicit dispatcher mandate.

### STEP developer-S6 · developer · 2026-07-25T05:20Z
**task-id:** FIX-FB-GATE-CHECKC-NEGATION-LEXICON
**what-done:** Fences: `bash -n` clean on both files; `shellcheck -S style` on `fb-data-integrity-gate.sh` before/after diff = empty (0 new warnings); `test-fb-gate-checkc-negation.sh` SC2001 (style, `sed 's/^/  /'`) matches the identical pre-existing pattern in committed `scripts/test-narrative-truth-gate.sh` — accepted project style, not a regression. Live sanity: ran gate against real `docs/social/fb-post-2026-07-24.md` with the live MCP server — 0 violations, no crash.
**what-considered:**
- no repo Makefile/CI shellcheck target exists — manual `shellcheck` invocation is the fence.
**why-decision:** rebuild_required=false (host shell script) — no container gate; QA verifies via `bash scripts/test-fb-gate-checkc-negation.sh` (no LIVE gateway RAW-verify needed for this fix class).
**why-change:** no change from plan.
