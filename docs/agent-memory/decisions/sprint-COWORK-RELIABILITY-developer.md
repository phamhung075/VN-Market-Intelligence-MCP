# Decision Journal — Sprint COWORK-RELIABILITY · developer

**Sprint goal:** COWORK-RELIABILITY (task frontmatter sprint id; orch-state active sprint_goal is COWORK-GUARANTEED-SLOT-CATCHUP, this row's own sprint tag used per handoff frontmatter)
**Agent:** developer
**Started:** 2026-07-31T00:00:00Z

---

### STEP developer-S1 · developer · 2026-07-31T00:00:00Z
**task-id:** FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE
**what-done:** Implemented the 6-file tombstone fix exactly per PM handoff / architect brownfield design — no design decisions made here, straight implementation.
**what-considered:**
- only path: handoff was prescriptive down to exact insertion points and pseudocode; deviating would re-litigate an already-ratified design (po→ba→architect→pm chain)
**why-decision:** NFR-1 landmine (second- vs minute-precision tick_id) is the single highest-risk element — implemented the normalization exactly as specified (`${raw_tick_id%:*}Z`) with the literal "DO NOT SIMPLIFY THIS AWAY" comment, and wrote the two positive-control tests to replay both real incident timestamps verbatim so a future naive-`==` regression fails loudly, not silently.
**why-change:** One deviation from plan: `scripts/agents-flow/cowork-tick-preflight.test.sh`'s pre-existing `log_count()` helper (`grep -c ... || echo 0`) double-emits "0\n0" when the match count is genuinely zero (grep exits 1 on zero-match even though it still prints "0"), which corrupted the new AC-1 zero-claims assertion (`-eq 0` on a two-line string). Fixed `log_count()` to capture into a var before falling back, since the AC-1 assertion (architect's own explicit requirement — "zero task_claim calls... at the tool-call level") cannot be verified without it; in-scope because it's the same test file the handoff already lists for editing.

---

### STEP developer-S2 · developer · 2026-08-08T03:28:25Z
**task-id:** TASK-COWORK-SIGNAL-DERIVE-WINDOWKEY
**what-done:** Wrote a spec (not code — plan_only+supervised, inherited from parent `FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING`) for `derive_window_key()`, task 1/4 of the parent's Phase-1 decomposition. `docs/handoffs/TASK-COWORK-SIGNAL-DERIVE-WINDOWKEY-spec.md`. Branches 1/3 carried forward unchanged from the architect brief; branch 2 replaced per PO's binding `amendment_3_FR1_WINDOWKEY_MIDNIGHT_STRADDLE`.
**what-considered:**
- Nearest-occurrence vs most-recent-at-or-before: rejected the latter — it is correct for the late-fire case (test case 2) but wrong for the early-fire case (test case 1), where the most-recent-at-or-before occurrence is the PREVIOUS day's window, reproducing the exact clobber this row exists to close. Only a symmetric min-|delta| rule is correct for both directions PO named as reachable.
- Candidate-set width: proved 3 candidates (`{yesterday, today, tomorrow}` at `CRON_HOUR:00Z`) are always sufficient — consecutive once-daily-cron occurrences are 24h apart and `live_mcp_fetched_at` always falls inside one UTC calendar day, so the true nearest occurrence can never be more than 1 day away in either direction. Did not consider a wider window; unnecessary and would add no correctness benefit.
- Tie-break: dispatch instruction required stating one explicitly even though PO's own amendment text calls both reachable cases (early-fire, late-fire) non-tied. Verified a tie requires a fire exactly 12h off its own nominal slot — not reachable under the live bctc cron table (15/18/21/0 UTC) today, but specified anyway (earlier-candidate-wins-by-scan-order, no special-case code needed) for robustness against a future schedule change.
- Return format: the brief's own prose ("YYYYMMDDTHHMMSSZ-style") and its two concrete worked examples (`20260807T2100Z`, no seconds) disagree. Deferred to the concrete examples — they are what actual filenames/Naming-Contract text will contain — and flagged the discrepancy explicitly in the spec so a future implementer doesn't add a spurious `SS` field.
**why-decision:** Both PO-mandated test cases (slot-4 early-fire D 23:57Z → `(D+1)T0000Z`; slot-3 late-fire (D+1) 08:00Z → `(D)T2100Z`) worked through with exact candidate/delta tables in the spec, both resolving correctly — this is the load-bearing verification PO asked for, sized so PO can spot-check from the board row's `developer_review_note` alone without opening the file.
**why-change:** None — designed strictly against Amendment 3 as given, no re-litigation, no scope creep into tasks 2/3/4 or into FR-4 (explicitly descoped by Amendment 1, not this task's concern).

---

### STEP developer-S3 · developer · 2026-08-08T03:56:10Z
**task-id:** TASK-COWORK-SIGNAL-BCTC-REKEY
**what-done:** Wrote a spec (not code — plan_only+supervised, inherited from parent) for bctc-analyst's FR-2 (filename rekey) + FR-7 (routine-mode explicit emit line) + WINDOW_KEY sequencing pin, task 2/4 of the parent's Phase-1 decomposition. `docs/handoffs/TASK-COWORK-SIGNAL-BCTC-REKEY-spec.md`. All 4 target files' edits specified with live-verified line anchors; none of the 4 files edited.
**what-considered:**
- Whether to re-derive or restate `derive_window_key()`'s algorithm inline for readability vs. citing task 1's spec: cited only (signature, return format, NFR-3 contract) — restating it would duplicate a just-shipped SSOT and risk drifting from it under future edits to either doc.
- FR-7 insertion point: the brief names "end of Step 4c, immediately before the `---`/`## Release Mode` header" — verified live that Step 4c's actual last sentence (the `bctc_revenue_growth`/`bctc_pe_ratio`/`bctc_debt_equity` never-seeded caveat, line 80) is followed directly by the section-closing `---` at line 82 with no other content between — confirmed the brief's placement instruction maps to a real, unambiguous single insertion point, not an approximation.
- stage-consolidate.md cross-reference fix: confirmed by re-reading `stage-log-notify.md` in full (not just grepping for "bctc_signal") that Stage 5 (5a-5e) genuinely contains zero `bctc_signal` write instructions — the stale pointer isn't merely imprecise, it names a file section that literally cannot perform the claimed merge, which is why the correction is necessary for a future implementer to land the logic correctly the first time.
- stage-log-notify.md §5d-1: considered whether renaming `cycle_tick_ISO`→`WINDOW_KEY` needed any change to the guard's own claim/skip decision logic — no, both are the same nominal-slot-fire-time value at HH:00Z granularity; only the computation site changes (Step-0c pin, once, vs. a second recompute at Stage 5). Confirmed this is what the brief's own §3.1 means by "no logic change to the guard itself."
**why-decision:** Every edit spec sourced from a live re-read of the actual flow file (not the brief's paraphrase alone) — cycle.md Step 0c ordering, stage-analyze.md's confirmed routine-mode emit-line gap, stage-consolidate.md's confirmed-stale cross-reference, stage-log-notify.md's exact §5d-1 token — so a future unsupervised developer dispatch can implement verbatim without re-verifying the brief's claims against source.
**why-change:** None — designed strictly against architecture brief §3 as given (all 4 subsections), no re-litigation, no scope creep into tasks 1/3/4 (`derive_window_key()` cited not redefined; `unified-agent`/`tran-ngoc-bau` flow dirs untouched; naming-contract subsection untouched).
