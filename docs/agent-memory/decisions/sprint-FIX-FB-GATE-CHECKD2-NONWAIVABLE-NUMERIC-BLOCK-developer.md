# Decision Journal — Sprint FIX-FB-GATE-CHECKD2-NONWAIVABLE-NUMERIC-BLOCK · developer

**Sprint goal:** fb-gate Check-D2 (numeric) must not inherit Check-C's (prose) false-positive waive
**Agent:** developer
**Started:** 2026-07-25T16:30Z

---

### STEP developer-S1 · developer · 2026-07-25T16:33Z
**task-id:** FIX-FB-GATE-CHECKD2-NONWAIVABLE-NUMERIC-BLOCK
**what-done:** Zone check: `docs/agents/fb-market-poster/` + `scripts/` — cross-service, no dev-* specialist owns either (fallback → developer handles directly). Read orch-state board row full JSON (not just router prompt) — the `.note` field carries the actual live-miss diagnosis: Check-D2 (VN-Index %-vs-live under `--frame=weekly`) already BLOCKed 2/2 rounds on the real post (post -3,29% vs live -5,67%) and the flow PROCEEDED anyway. "Sibling rows ... DETECT correctly — this is the waiver path, not detection."
**what-considered:**
- Router's task prompt separately listed 3 "numeric defects" (VHM self-contradiction, daily>weekly-range, USD/VND stale threshold) and said "a correct Check-D2 must BLOCK on all three" — read literally this could imply 3 NEW detection checks are needed.
- Rejected inventing new checks: the board row's own `.note` (written by the router at mint time, with the actual live gate transcript in hand) is authoritative over my own re-derivation from the post text, and it explicitly scopes root cause to the waiver prose, not detection. Empirically verified before committing to this scope (S2).
**why-decision:** trust the dispatcher's own diagnosis over speculative re-derivation once independently confirmed; S-sized ticket, adding 3 new arithmetic checks would blow scope and duplicate sibling tickets' territory (Check-B/H/J already exist for adjacent numeric classes).
**why-change:** no change from plan.

### STEP developer-S2 · developer · 2026-07-25T16:38Z
**task-id:** FIX-FB-GATE-CHECKD2-NONWAIVABLE-NUMERIC-BLOCK
**what-done:** Empirically ran the UNMODIFIED `scripts/fb-data-integrity-gate.sh --frame=weekly` against the live fixture `docs/social/fb-post-2026-07-25.md` with a correct period-close snapshot (VNINDEX prior close 1787 → curr close 1686.11, matching the board note's ground-truth `get_price_history` read) — confirmed exit=1, `[BLOCK] Check-D2 VN-Index-pct` fires. Detection confirmed correct pre-fix; zero changes needed to `scripts/fb-data-integrity-gate.sh`.
**what-considered:**
- The parser actually grabs a coincidental "+1,85%" (a mid-week rebound figure) near the FIRST "VN-Index" mention in the post rather than the "intended" weekly headline % — noted as a parser-quality quirk, not in scope: the delta vs live (7.5pp) is still >> tolerance, so Check-D2 correctly BLOCKs regardless of which VN-Index-adjacent % it picked up.
**why-decision:** ran the real script against the real fixture before writing any doc prose or test, so the fix is grounded in observed behavior, not assumption.
**why-change:** no change from plan.

### STEP developer-S3 · developer · 2026-07-25T16:40Z
**task-id:** FIX-FB-GATE-CHECKD2-NONWAIVABLE-NUMERIC-BLOCK
**what-done:** Fixed the waiver prose in all 3 flow docs (`main.md` STEP 4b GATE-LOOP HARDENING + its later bullet list; `weekly-recap.md` STEP 3b; `weekly-prediction.md` STEP 4b) — replaced the ambiguous "EXIT-only-on-real-fabrication posture" pointer (which defaulted every non-Check-A/non-breadth BLOCK into the honest-gap-and-PROCEED fallback) with explicit per-check waivability: Check-C's negation-blind prose pattern is the ONLY waivable check; every numeric check (A/B/D/D1/D2/E/F/H/J) is non-waivable — EXIT after 2 rounds, never proceed with a known-wrong number. Added a Check-D2-specific fix protocol: on BLOCK, recompute the period baseline as the PRIOR period's close (never the first session's own close inside the reported period) and re-derive all dependent figures before re-running.
**what-considered:**
- Considered leaving the general "after 2 rounds → honest gap → PROCEED" bullet gate-wide and only adding a Check-D2-specific EXCEPTION carve-out. Rejected: that keeps the failure mode alive for every OTHER numeric check (B/E/F/H/J) not explicitly named — the router's ticket asks for a structural rule (numeric vs prose), not a single point-fix for one check letter.
**why-decision:** per-check classification (prose=waivable, numeric=non-waivable) is the generalizable rule the router's diagnosis actually calls for ("Check-D2 compares two computed numbers and has NO false-positive mode, so it must be non-waivable") — scoping the fix to exactly Check-D2 would leave the same defect reachable via Check-B/H/J.
**why-change:** no change from plan.

### STEP developer-S4 · developer · 2026-07-25T16:45Z
**task-id:** FIX-FB-GATE-CHECKD2-NONWAIVABLE-NUMERIC-BLOCK
**what-done:** New persistent regression harness `scripts/test-fb-gate-checkd2-nonwaivable.sh` (10 assertions), mirroring `scripts/test-fb-gate-checkc-negation.sh`'s shape. (1)/(2) runtime proof: LIVE fixture `docs/social/fb-post-2026-07-25.md` (untouched, per instruction — do not edit the post to make the gate pass) + correct weekly snapshot MUST BLOCK on Check-D2; a correctly-baselined contrast fixture MUST PASS (no regression). (3a–3d) doc-prose assertions: ambiguous phrase gone from the 2 weekly step bodies (excluding the size-justification header, which legitimately still names the old phrase to document its own removal); main.md carries NON-WAIVABLE + Check-D2 fix protocol; Check-C's own honest-gap path is still intact (fix narrowed, didn't delete); both weekly docs reference the task ID.
**what-considered:**
- Whether to also write fixtures individually pinpointing the VHM self-contradiction and the daily>weekly-range defects as separate BLOCK assertions. Rejected for this ticket: current gate has no per-ticker weekly-frame live data (`build_period_snapshot` only fetches the 4 index tickers, not per-post tickers) and no dedicated daily-vs-range arithmetic check — adding those is genuinely NEW detection surface, a separate ticket's scope (flagged in notebook, not silently absorbed here).
**why-decision:** RED→GREEN proven via pathspec-limited `git stash push/pop -- <3 flow docs>` (not whole-tree — repeats the sibling ticket's precedent given concurrent-agent stash entries in this repo). RED (pre-fix): 4/10 pass, all 6 doc-prose assertions FAIL as expected. GREEN (post-fix): 10/10 pass.
**why-change:** no change from plan.

### STEP developer-S5 · developer · 2026-07-25T16:47Z
**task-id:** FIX-FB-GATE-CHECKD2-NONWAIVABLE-NUMERIC-BLOCK
**what-done:** Fences: `bash -n` clean on the new harness. No-regression check: `scripts/test-fb-gate-checkc-negation.sh` (sibling harness, unrelated to this diff) still 6/6 PASS — confirms zero collateral damage since `scripts/fb-data-integrity-gate.sh` itself has NO diff in `git status`. `shellcheck` not installed in this sandbox; two SC2001-class style findings noted (`sed 's/^/  /'` for indent) — identical accepted pattern already present in the sibling harness and `scripts/test-narrative-truth-gate.sh`.
**what-considered:**
- Whether to lift the standing DO-NOT-PASTE hold on `docs/social/fb-post-2026-07-25.md` by editing/regenerating it. Explicitly rejected per task instruction ("Do NOT edit the post to make the gate pass — fix the gate") — the hold lifts by virtue of the gate/flow fix landing, not by touching the post file; left it byte-identical (0 diff).
**why-decision:** rebuild_required=false — host shell scripts + markdown docs only, no container gate.
**why-change:** no change from plan.
