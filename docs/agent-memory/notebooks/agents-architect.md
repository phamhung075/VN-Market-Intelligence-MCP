# agents-architect — Notebook

## 2026-08-23T11:01:46Z

**Task:** `FIX-QA-VC-LANEMOVE-PROSE-ONLY-NO-ORCHAPPLY-ACTUATOR` (P0, dev-team Design-Router Sweep dispatch) — no new brief authored (`po_scope_note` on the row: design already fully specified in `desc`, one-hop signal only; independently re-verified before honoring that ruling).

Re-verified live at source: `docs/agents/qa/flow/main.md` vc-approved/vc-changes Direct-Commit-Verify exits (L189/L198 per the row, L205/L214 in current file) are both still prose-only board mutations, no `orch-apply.sh` pipe — matches desc verbatim, in-file WF-1 block (L30-33) already shows a working local precedent. Dropped signal `docs/signals/2026-08-23-qa-vc-lanemove-orchapply-actuator.json` → agent-father with copy-executable jq+orch-apply.sh patches for AC-1/AC-2 (test-executed against synthetic fixtures, both pass) + AC-3 self-verify shape, mirroring the FIX-PO-BATCH-MINT-NO-WRITE-ACTUATOR template (commit 3ce726a6e); flagged AC-4/AC-5 as outside agent-father's commit_zone (`scripts/`) — same split as that precedent, hand to a developer-owned row. Flagged, not folded in: AC-2's qa[]→review[] move crosses into a `scripts/orch-row-prose-ceiling-check.mjs` guarded lane from an unguarded one — same D3 defect already tracked separately (`FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS`, ready[], next_agent=developer). Routed the task_board row `next_agent`/`owner` → `po` (not `agent-father` directly — off the DRS allowlist, unreachable by automated dispatch, precedent `FIX-COMMITCONVENTION-MANDATES-BARE-COMMIT`); `.head` idle-reset in the same write.

**Signal dropped:** `docs/signals/2026-08-23-qa-vc-lanemove-orchapply-actuator.json` → agent-father

---

## 2026-08-23T14:04:55Z

**Brief:** `docs/architecture-briefs/2026-08-23-fix-cowork-published-marker-ttl-cadence-mismatch-design.md`

Row `FIX-COWORK-PUBLISHED-MARKER-TTL-28H-EXCEEDS-24H-DAILY-CADENCE`: root-caused to Step 2.4's prefix-only match in `dispatch-claim/SKILL.md` (not chef.md's own exact-match gate, not any `MARKER_TTL` constant — that gate compares exact per-period strings and never collides). Ruled Axis D (cadence-bounded prefix match, keyed on `cowork-schedule.json`'s already-live `publish_date_basis` field, zero date-basis duplication, zero `apps/mcp-server` change) landed together with Axis C (AC-3/AC-5 stale-owner presence check) in one Step 2.4 revision — Axis D closes AC-1 deterministically where presence-only would only close it contingent on the claiming dispatcher session having died. New finding: `digest-sunday` carries the identical latent overlap defect at weekly scale (691200s TTL vs 604800s cadence = 86400s/week window), closed for free by the same fix.

**Signal dropped:** `docs/signals/fix-cowork-published-marker-ttl-cadence-mismatch-2026-08-23T14:04:55Z.json` → pm

---

## 2026-08-23T14:15:51Z

**Brief:** `docs/architecture-briefs/2026-08-23-pm-decompose-closeout-lane-resolution-and-fail-loud.md`

Row `FIX-PM-DECOMPOSE-CLOSEOUT-STEP-UNREACHABLE-PAST-RETURN-AND-MINT-OMITS-NEXTAGENT` (P0, review[], qa CHANGES_REQUESTED retracting its own DONE_VERIFIED 25min earlier). qa's blocker is real and it is **my own 08-14 brief's illustrative jq** that shipped it, not agent-father's implementation (`e6a4858ae` is faithful to §5 verbatim). Reproduced end-to-end on synthetic fixtures via `ORCH_APPLY_LIVE_FILE_OVERRIDE`: on a `ready[]` parent the closeout branch's `null + {...}` yields an id-less ghost row (validator string reproduced exactly) **and** the `|| echo` tail swallows it to shell exit 0; the partial branch is a schema-valid identity write that still resets `.head`, so it applies, exits 0, and leaves the parent stale — worse than the closeout branch, and byte-for-byte the occ-1/2/3 symptom. Live census matches qa's: children[]-bearing rows backlog 10 / done 9 / ready 6 / in_progress 1.

Root cause named one level up from the lane list: **a hand-enumerated lane subset substituted for the schema's lane set — in the transform AND in the 08-14 acceptance fixture that was supposed to catch it** (§8 enumerated the branch matrix, never the lane matrix; the commit's own AC says "replayed manually", and `scripts/audits/` has no pm-decompose or reachability verifier at all). So I explicitly **rejected qa's proposed fix list** (`backlog/ready/in_progress/active_sprints`) as another hand-list — it still omits `review`/`qa`/`done_verified`/`archive`/`closed_sprints`. Adopted invariant LANE-SET-DERIVATION: discover lanes structurally from `.task_board`, hand-name only the TERMINAL set, apply it as an exclusion from a live default so a future lane is searched, not skipped.

Did NOT re-open the `next_agent: null` claim — independently re-verified qa's non-confirmation (`HeadSchema:324` is `.nullable()`). Separately ruled `del(.next_agent)` on the terminal row shape, and said in the brief why that is a different thing, so nobody reads it as re-litigating.

Beyond the lane fix, five things the live pm cycle proved that the shipped binary cannot express: the disposition is **3-way not 2-way** (pm wrote both open states today — B DELEGATED-HELD vs C PARTIAL differ only by `hold_reason`, and C without it gets its pm re-entry hop stolen by `devteam-wrapper-autoclose.jq`, which is armed on 8 live rows incl. `IVC-PM-DECOMPOSE`); `children[]` must be the **union** with pre-existing children (4 of pm's 10 rows needed only that); closing a decomposed parent to `DONE` **strands its dependents forever** because `deps_satisfied` demands `DONE_VERIFIED`; an in-place disposition on an over-ceiling guarded-lane row hard-rejects at **+34 bytes** (21 such rows live); and the fail-loud needs 3 layers because an LLM executor ignores exit codes. Ruled the transform out of the flow doc into `scripts/pm-decompose-closeout.jq` — an inline heredoc cannot be unit-tested, which is exactly why the ACs were only ever replayed by hand and why pm hand-rolled two variants in one day. All replacement jq is fixture-executed, copy-runnable. 4 rows specified, zone-split, sequenced (agent-father XS hotfix ships now, independent of the developer script row).

**Signal dropped:** `docs/signals/fix-pm-3e-closeout-lane-resolution-2026-08-23T14:15:51Z.json` → agent-father

---

## 2026-08-23T14:28:14Z

**Brief:** `docs/architecture-briefs/2026-08-23-flow-file-cap-glob-fix-and-doc-plane-baseline-ratchet.md`

Row `FIX-FILESIZECAPS-FLOWFILE-GLOB-NESTED-DIR-ONLY-173-FLOW-FILES-UNGOVERNED` (P2) — its `verification_gate` required a recorded rollout decision *before* the one-character glob fix may land, so this is a policy brief, not a patch. Re-executed the defect: bash `case` has no globstar, so `docs/agents/*/flow/**/*.md` demands a directory below `flow/` and 173/173 real flow files match nothing. Corrected pattern `docs/agents/*/flow/*.md` verified against positive and negative fixtures. Noted that the sibling `.claude/skills/**/*.md` works only by corpus accident — same broken idiom, opposite outcome — so it is not evidence the flow cap should work.

Measured the full 173-file cohort myself rather than trusting the row (FENCE `feedback_fleetwide_gate_validated_on_one_file_optout_allowlist`): 98 clean / 12 line-over absorbed by a current header / 3 line-only unjustified / 60 byte-cap = **63 emitters** (row estimated 62/59/13). Sharpest number is **26** — files carrying a current, in-tolerance `size-justification` header that would emit anyway, because TE-T24 rules a header declares LINES only and never honors bytes. The existing escape hatch structurally cannot cover this cohort's dominant breach dimension; any rollout ignoring that asks 26 authors to re-justify into a mechanism that cannot accept it.

Corrected the row's risk framing in both directions: the hook always `exit 0`, is not wired to any CI gate (`size-lint` is code-plane only and never reads the pattern table), and dedups per file — so it is a one-shot ≤63-signal burst into an already drain-behind inbox at `priority:high`, **not** "permanent every-edit breach emitters". The risk is inbox flooding, not blocked work.

Ruled (a)+(b) and explicitly **not a new mechanism**: port the live code-plane sibling (`size-lint-justification.sh` + `size-lint-baseline.json`, 648 grandfathered entries, ±10%/min-5 tolerance, wholesale `--update`, zero tolerance for new offenders). Rejected (c) and (d) with reasons. Did **not** retune `cap:120` — measured p50=102L, the line cap is right; the miscalibrated knob is BC-1's hardcoded 60 B/line (measured p50=54, p90=88, max=1190). 3 rows, order load-bearing R1→R2→R3 so the glob flips last: byte-dimension header (preserves TE-T24's intent rather than reversing it — an explicit reviewable byte figure is not a free pass), then the doc-plane baseline seeded from the 63, then the one-character glob. Reported not fixed: **272 of 445** `docs/agents/**/*.md` match no cap pattern at all (68 over 120L) — flow files are the smaller ungoverned half.

**Signal dropped:** `docs/signals/fix-filesizecaps-flowfile-glob-rollout-2026-08-23T14:30:00Z.json` → po
