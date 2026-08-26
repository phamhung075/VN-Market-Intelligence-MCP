# agents-architect — Notebook

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

---

## 2026-08-24T19:25:40Z

**Brief:** `docs/architecture-briefs/2026-08-24-market-watcher-cadence-dedup-already-shipped.md`

Row `FIX-CADENCE-COWORK-DUP-MARKET-WATCHER` (P1, cross-service) — investigated, found this row is a duplicate of already-shipped, already-DONE_VERIFIED work from my own 2026-08-14 brief (`docs/architecture-briefs/2026-08-14-market-watcher-eod-offhours-notebook-collision.md`): commits `662d1fcc3` (supersede-mutex script + wiring into `cowork-match-slots.js` `finish()`) + `5918c55fe` (schedule `supersedes` field + pathspec fixes), both QA `DONE_VERIFIED` 2026-08-14T17:38-39Z, cold-evicted to `docs/data/orch/archive/2026-08.json` before this row was promoted 2026-08-15T00:40Z off the identical incident. Re-verified live this cycle (not cited from either prior artifact): cron values unchanged (still structurally colliding by construction), test suite re-run 32/0 pass, and independently confirmed working on TODAY's real 16:00Z tick — `market-watcher-eod` fired alone (commit `3c3f18bc6`), `market-watcher-offhours.last_fired` stayed at `12:04:50Z` (did not advance), two independent planes (git notebook history + schedule file bookkeeping) agree. Recommended remedy: none new — the shipped declarative same-tick supersede-mutex already IS the correct primary (achieves de-overlap's goal with zero cron-timing change; per-slot notebook split re-rejected, 4 `fb-market-poster` files still read `market-watcher.md` by fixed path, re-confirmed live). One non-blocking loose end flagged for agent-father: stale "Field is INERT..." wording in `cowork-schedule.json` `market-watcher-eod._note`.

**Signal dropped:** `docs/signals/fix-cadence-cowork-dup-market-watcher-dedup-review.json` → po

---

## 2026-08-26T18:04:48Z

**Brief:** `docs/architecture-briefs/2026-08-26-behavioral-verification-gate-deploy-aware-ordering.md`

User escalation (direct, no pre-existing row): agents pass every gate and still ship unobserved behaviour. Re-verified the router-supplied anchor myself rather than trusting it: `FIX-DASH-CRON-LAYERB-NEVERFIRED-FALSE-LABEL` commit `4b4bfea7a` landed 19:15:49Z, qa `DONE_VERIFIED` 19:53:57Z, frontend image built 20:06:57Z — DONE_VERIFIED 13min before the image existed, confirmed via `git show`/`docker images`, not narrated. Root-caused past the single row: two live qa verification paths exist (`docker-deployment-runbook.md` Close Gate Step 5, deploy-aware but for branch-based work; `qa/flow/main.md` Direct-Commit Verify, no rebuild step, and per its own header the path for "every one of its 32 live source rows" — the anchor case's actual path). The defect is a flow gap, not a skipped step.

Found and explicitly routed around two more dead substrates rather than depending on either: `scripts/verify-deploy-sha.sh`'s `vn.market.git_sha` label — live-probed 9/11 running services report `"unknown"`, `docker-compose.yml` has zero `GIT_SHA` wiring, already tracked (`FIX-FLEET-DEPLOYED-VS-MAIN-UNANSWERABLE-GIT-SHA-BUILD-ARG-IS-OMITTABLE`, P1 backlog, not re-minted); and orch-sentinel's own OH-2 ("Behavioral-Verification Coverage Map") — scorecard frozen at its first LITE run 2026-07-22, OH-2.1-3 still read "(pending first FULL run)" 5 weeks later, FULL cron never armed, already tracked (`FIX-ORCH-SENTINEL-OH4-CRONS-NEVER-ARMED...`, P2 backlog, `depends_on` a P3 that's also unpicked, not re-minted).

Design: mint-time `behavior_predicate{cmd,expect}` (P0/P1 `apps/` rows only — the ~6.9%-of-commits population that ships in a built image) + deploy-time `behavior_probe` riding ops's already-mandatory Post-Rebuild Health Verification (timestamp-gated against the row's commit, since the SHA label is dead — not a new gate on every commit, sampled once per rebuild batch) + new orch-sentinel check OH-2.4 (a genuinely new 5th axis — "does the product behave," not a duplicate of OH-2's existing 4 policy/architecture/tool/file axes — promoted to FULL+LITE so it gets real data from the cron that actually runs) + a PO-gated 3-rung remediation ladder reusing the existing `oh2_2/oh4_2/oh4_3`-style OH-STATE consecutive-failure counter, no new infra. Explicit removals: qa's per-behavioral-AC free-text re-derivation is replaced by a probe citation; Close Gate Step 5's unstructured prose gets the same machine-checked predicate; zero new crons/agents — rides two already-unconditional steps. 7 files scoped for agent-father in brief §9.

**Signal dropped:** `docs/signals/behavioral-verification-gate-deploy-aware-ordering-2026-08-26T18:04:48Z.json` → agent-father
