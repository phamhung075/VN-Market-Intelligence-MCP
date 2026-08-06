# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa (continuation, qa-3 byte-capped)

**Sprint goal:** cowork guaranteed-slot catch-up (ambient sprint at time of this entry; task below is unrelated dev-team Review-Lane QA-Drain work routed to qa)
**Agent:** qa
**Started:** 2026-08-06T20:18:18Z

---

### STEP qa-S55 · qa · 2026-08-06T20:18:18Z
**task-id:** FIX-PRESSURE-HOST-HEADROOM-WRONG-MACHINE-WRONG-QUANTITY
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`) of `98917416a` (source fix) + `d19d6cdc5` (CI-RED-cdd5fa5a-FIX follow-up), both on main ancestry. Re-verified against post-fix tree per PO gate note, not the original commit alone.
**what-considered:**
- Source: `computeContainerVmHeadroomMb()` (macOS branch deleted, `free -m` available-column only, null sentinel) confirmed live in tree; `spawn-fanout.md`/`telemetry.md`/`cadence-policy.json._fanout` consumers all read `container_vm_headroom_mb`, floor re-derived vs 8GB Docker VM budget — no stale `host_headroom_mb` left in any live consumer (grep-swept, only archival docs remain).
- Re-ran myself, not trusted from prose: `bun test emit-pressure-state.test.ts` 31/31 pass (macOS, real unmocked negative-control leg = null); `bun tsc --noEmit` 0 errors; `mock-guard.sh` PASS.
- Deploy-gap (po_deploygap note) closed: live `pressure-state.json` now emits `container_vm_headroom_mb`. Fresh two-plane same-second proof: `bun run` the real exported fn inside the live `mcp-server` container = 3345 vs independent `docker exec free -m` available = 3342 (0.09% delta, within 10%). Negative control on this macOS host (no `free`) = null, live.
- CI-RED-cdd5fa5a-FIX (this row's own commit caused it): fixed by `d19d6cdc5`, ancestor of main; prior qa-S7 entry already raw-verified `gh run` green downstream + recorded close-out fingerprint. Current main CI red streak today is GitHub Actions "Service Unavailable" runner infra outage (checked `gh run view --log-failed`) — unrelated to this code.
**why-decision:** APPROVED, DONE_VERIFIED. All 4 deliverable items + both acceptance clauses (two-plane agreement, negative-control-to-null) independently reproduced live, not read from review_note alone.
**why-change:** none — verified exactly what the row scoped; noted the acceptance's "(not degraded mode)" parenthetical is satisfied in spirit (null→honest, not a wrong number) though it still numerically drives `max_parallel_degraded`, matching the deliverable's own "degrades safely" framing — not a blocking discrepancy.

### STEP qa-S56 · qa · 2026-08-06T22:40:00Z
**task-id:** FIX-NOTEBOOK-AUTOPRUNE-SAMEDAY-TIE-DROPS-NEWEST
**what-done:** Direct-commit verify (`qa[]` row, no `.commit`/`.files[]` — fallback path). Derived commit via `git log -- scripts/agents-flow/notebook-auto-prune.sh{,.test.sh} docs/data/notebook-section-order.json`: `c280e00cd` (2026-07-30T11:11:35Z), `Task:` trailer matches row id verbatim, on main ancestry, stat matches review_note's claimed 3-file scope exactly.
**what-considered:**
- Read live tie-break block (post 2 later refactor commits 9b0764631/7552421bc that moved the logic into `lib/notebook-section-direction.sh`): case-statement still correct — `newest_first`→drop physically-LAST of tied group (keeps newest, physically-first under prepend), `oldest_first`→drop physically-FIRST. Matches review_note's claim; not regressed by the later extraction.
- Re-ran `scripts/agents-flow/notebook-auto-prune.test.sh` myself: 8/8 PASS (T5/T6/T7 = the 3 tie-break cases + T8 added by an unrelated later hook-crash-discriminator commit, sourced from same file — count discrepancy vs review_note's "7/7" is explained, not a red flag).
- Built my OWN independent fixture (outside the shipped suite) — a prepend-convention notebook with 3 same-day-tied sections as the file's actual global minimum (fixed a first attempt where my own fixture bug made a non-tied section the min, defeating the test) plus one distinguishing newer anchor. Ran the real hook against it live: correctly consumed the tied group oldest-to-newest across 3 shrinking-tie-group loop iterations (3-way tie → 2-way tie → unique), NEVER dropped the physically-first/newest tied member until it was the sole remaining section — confirms the mechanism generalizes beyond the shipped fixture's single-iteration case.
- `mock-guard.sh` N/A (no apps/ source, bash+JSON only) — consistent with review_note.
**why-decision:** APPROVED, DONE_VERIFIED. Commit real, on-main, matches claimed file scope; tie-break logic independently confirmed correct (newest survives) both via re-run of shipped tests and a fresh multi-iteration scenario I constructed myself.
**why-change:** none — verified exactly what the row scoped.

### STEP qa-S57 · qa · 2026-08-06T22:55:00Z
**task-id:** FIX-DEVTEAM-BACKGROUND-SPAWN-LOCK-RELEASED-AT-SPAWN-NOT-COMPLETION
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`) of `adb426877`, on main ancestry (`git merge-base --is-ancestor` confirmed). `git show --stat`/diff matches claimed scope exactly: all 4 sites (S2 :484-500, SLS :571-596, RLC :624-653, QA-Drain :675-708 at commit-time line refs) converted `finally: task_release` → `except: task_release; raise` — success-path release deleted, `ttl_seconds:3600` on `outer_claim` is now the sole lifetime bound.
**what-considered:**
- Did NOT trust `architect_review_note` prose alone: grepped `LOCK-LIFETIME` in current live `main.md` (7 hits, all 4 claimed sites intact today + 2 newer sites — DRS, QA-Drain-headdecoupled — correctly adopting the same convention post-fix, no regression from later unrelated edits).
- Re-ran the row's own cited live-proof myself against the REAL `task_claim`/`task_release` MCP primitives (`mcp-call.sh`, not a mock): held-lock (no release) → peer same-window reclaim `claimed:false` (POSITIVE); explicit release → reclaim `claimed:true` (completion path proceeds); `ttl_seconds:60` lapse + no release → 65s later reclaim `claimed:true,stolen:true` (crash-recovery backstop preserved). All 3 matched architect's claim exactly.
- `po_still_reproducing_20260729T1049` note (defect reproduced 3x live AFTER this commit) forensically resolved: checked out `main.md` as of that timestamp — the cited `main.md:503` line IS inside the already-fixed S2 except-block (LOCK-LIFETIME comment), proving the flow-doc text was correct at the time of the report. Reproduction is therefore an LLM-dispatcher execution-adherence gap (agent not following its own correct instructions), not a text defect in this row's deliverable — corroborated by today's dev-team notebook (2026-08-06) explicitly citing/following the same except-path convention correctly, no reproduction reports since 07-29.
- Found a genuinely NEW, still-open 6th call site with the identical unconditional-release-on-success shape, NOT covered by this row's 4-site scope and NOT separately tracked: S4 UNBLOCK dispatch (main.md:908-929) + S4 CLEAN dispatch (:931-952) — matches the row's own `dev_team_tick_corroboration_20260728T1637Z_s4unblock` finding verbatim, still unfixed as of this review (the sibling 5th site, execute-tier.md Phase-3.5, WAS separately fixed+QA-approved by me earlier today per `FIX-EXECUTETIER-PHASE35-...`). Out of THIS row's acceptance scope (which named only 4 sites); flagged in the row's own note for architect/po to mint a narrow follow-up, not folded into this verdict.
- No `apps/` TS touched (docs/flow-doc only) — bun test/tsc N/A; `mock-guard.sh --files docs/agents/dev-team/flow/main.md` → PASS (no production source).
**why-decision:** APPROVED, DONE_VERIFIED. All 4 claimed sites verified against live code + re-run regression, not the note's prose; the still-reproducing signal is explained (adherence gap, not a doc defect) and does not implicate this row's actual deliverable. Flagged the S4 UNBLOCK/CLEAN gap as a distinct, uncovered 6th site for follow-up.
**why-change:** none — verified exactly what the row scoped; S4 UNBLOCK/CLEAN gap flagged separately, not folded into this verdict (mirrors this sprint's own execute-tier.md precedent).

### STEP qa-S58 · qa · 2026-08-06T23:10:00Z
**task-id:** FIX-CI-RED-ALERTOUTCOME-CLOCK-SEAM
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`) of `760498706` on main ancestry, `--name-only` diff matches claimed `.files[]` exactly (alertStore.ts, alertOutcomeJob.ts, 1847d-C test).
**what-considered:**
- Read diff myself: `readPendingOutcomeAlerts(windowDays, db, now=new Date())` — default preserves prod (1 call site, alertOutcomeJob.ts now passes its own `now`). Genuine clock-seam fix, not cosmetic.
- Live A/B proof, not trusted from prose: git-worktree'd pre-fix prod files + post-fix test file → TEST-10 FAILS pre-fix (`evaluated`=0, expected >0), PASSES post-fix. Full pre-fix file today (2026-08-06, past predicted 08-02 rot date) = 2 pass/8 fail (degraded further, confirms time-bomb was real); post-fix = 10/10 pass live, right now — fix durably removes the rot, doesn't defer it.
- `bun tsc --noEmit` 0 errors; `mock-guard.sh` PASS; no `any`/`process.env`/unguarded `!` introduced (diffed).
- AC-3 gate: `gh run list` raw (not prose) — latest CI run 31106283894 (2026-08-06T13:31Z, SHA≠4381b08b1) = `bun test` job "15029 pass / 40 skip / 0 fail". Two `failure` runs today (16:09/15:45Z) independently confirmed via `--log-failed` = GH Actions "Service Unavailable" infra outage, unrelated.
- Full local per-file-isolation re-run: 15034/40/5 fail; target file NOT in failed list; the 5 failing files (rotated vs review_note's 3, per script's own documented CPU-oversubscription flake) grep-confirmed to NOT import alertStore/alertOutcomeJob.
**why-decision:** APPROVED, DONE_VERIFIED. Commit real, on-main, exact file-scope match; AC-1/AC-2/AC-3 all independently reproduced live (not read from review_note/ci_plane_verified prose alone).
**why-change:** none — verified exactly what the row scoped.
