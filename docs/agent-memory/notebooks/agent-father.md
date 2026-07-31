# Agent Father — Notebook

## Fix (dev-team S79 tier-1 dispatch) 2026-07-31T15:19:08Z FIX-PO-MANUAL-DISPATCH-SWEEP-FLAG-WITHOUT-DISPATCH-STRANDS-ROW
- `manual-dispatch-sweep.md` Step 1's `po_manual_dispatch_flagged_at` exclusion was PERMANENT
  (stamp/dispatch not atomic) — any row whose BATCH was deferred (WIP cap) became invisible to
  every future sweep forever. Live: `TE-T12`, flagged 06:56:27Z, still BACKLOG ~8h later.
- Fixed with a bounded staleness window (`flag_reentrant($now_epoch; 14400)`, 4h) — fresh stamp
  stays excluded, stale stamp is re-admitted exactly like unflagged. Chose this over a Step-3
  "fold highest-priority stale row when Step 2 stamps nothing" fallback: smaller/more mechanical,
  reuses the `$now_epoch` arg the script already computed but never used. Same-tick double-BATCH
  stays structurally impossible regardless (Step 1 computes its candidate list once, before Step
  2 stamps). `docs/policies/dev-standards.md:504-526` mirror updated in lockstep.
- Verify script: `G-ALREADY-FLAGGED` negative control switched from a hand-typed stale-dated
  fixture (would have gone stale itself and started FALSE-passing the wrong branch as this repo's
  clock advanced) to a relative-fresh timestamp computed via jq `todateiso8601` off `$NOW_EPOCH`
  — portable, no BSD/GNU `date` divergence. New `M-STALE-FLAGGED-REENTRANT` positive control
  (same offset math, past the window) — this is the check that would have failed pre-fix.
- Live-replayed Step 1's exact jq against the real board (read-only, no orch-apply.sh call):
  `TE-T12` now surfaces top-ranked with `reflag:true`, confirming the re-admission path fires on
  the actual stranded row, not just the synthetic fixture.
- DID NOT flip the board row `in_progress[]→review[]` myself — own init.md `commit_zone.excluded`
  names `orch-state.json` "NEVER in agent-father commits except the ONE allowed signal-queue
  DONE-mark", and `.head.active_task_id` at write time was a sibling task's id anyway (not mine).
  Supplied the exact `orch-apply.sh` transform (no `.head` sync — condition not met) in RETURN.

## Clean (router-dispatched, PO manual-dispatch DRS-STRANDED-OFF-ALLOWLIST) 2026-07-31T15:37:59Z TE-T12
- Split `.claude/skills/dispatch-claim/SKILL.md` (497L, no size-justification, worst
  project ≤200L breach) per T-12 brief: created `.claude/skills/dispatch-claim/CARD.md`
  (38L hot path — ownership key, Phase A orphan-probe w/ N_MAX/ESCALATED skeleton, Phase
  A.5 roster read, Phase B intent PRE-CLAIM try/finally) and pointed CLAUDE.md step 2.5
  at CARD.md instead of the full SKILL.md.
- SKILL.md stays as the lazy-loaded full reference (namespace spec, Fire-Time Election,
  Step 0a detail, sprint-task wrap, two-tier model) — CARD.md's edge-path pointers route
  back to it by section name, matching how cowork-team/dev-team main.md already inline
  their own Step 0a instantiation instead of reading SKILL.md § Step 0a verbatim.
- Trimmed "Reference Commits" (11L pure git-SHA history, dup of git log) to a one-line
  git-log pointer; added a `<!-- size-justification -->` header to SKILL.md explaining
  the intentional post-split size (lazy reference, not hot path).
- Grepped all live callers before/after: cowork-team/dev-team main.md, orch-sentinel
  flow+init, task-lock SKILL.md, dev-standards.md, cron-orch-sentinel.md all reference
  named §-sections (Step 0a, Fire-Time Election, Inheritance note) that remain intact in
  SKILL.md at the same path — none stale. Only CLAUDE.md's step 2.5 needed the swap.
- Known side effect, not mine to resolve: `context-bloat-backstop.sh`'s byte-cap
  predicate (never suppressible by a line-based size-justification, TE-T24 design) still
  fired a `context_bloat_breach` signal for SKILL.md (23KB vs 12KB byte cap) even with the
  justification header present — routed to claude-manager-helper per its `to:` field, left
  untouched (`docs/signals/` outside my `commit_zone.allowed`).
- Did not touch TE-T23 (sibling row, CLAUDE.md 2.5 prose compression) or orch-state.json
  board row — dev-team/router flips status on RETURN per own init.md commit_zone.excluded.

## Fix (dev-team dispatch) 2026-07-31T15:42:17Z FIX-PO-TRIAGE-SIGNALS-CIRED-TEMPLATE-STATUS-TODO-REJECTED-BY-VALIDATOR
- `triage-signals.md`'s `ci_red` mint template + 4 sibling `.task_board.backlog[]` mints
  (`zone_missing_tier3`/`repair_task_request` same file, `channel-audit.md`, `sprint-kickoff.md`)
  hardcoded `status: "TODO"` — `orchStateSchema.ts`'s `LANE_ALLOWED_STATUSES.backlog` only permits
  `{BACKLOG, BLOCKED}` (Stage 1b hard fail). Every mint from these templates aborted at
  `orch-apply.sh` on first attempt (live: `FIX-CI-IMF-INTEGRATION-TEST-NONHERMETIC-LIVE-API`).
- Fixed all 5 to `status: "BACKLOG"` — validator confirmed correct side (every live backlog[] row
  already used BACKLOG); grepped the class across all `po/flow/*.md`, not just the named row.
- New `scripts/audits/po-triage-mint-backlog-status-lane-coherence-verify.sh` (42/42): replays
  each template's exact mint shape through the real `orch-apply.sh` on a throwaway fixture
  (`ORCH_APPLY_LIVE_FILE_OVERRIDE`) — TODO reproduces the Stage 1b abort, BACKLOG passes and lands.
- Did NOT touch `orch-apply.sh`/`orchStateSchema.ts` (explicit out-of-scope) or `orch-state.json`
  (`commit_zone.excluded`) — board flip left to dev-team. Commit `cb6ba9567`.

## Clean (router-dispatched, PO manual-dispatch DRS-STRANDED-OFF-ALLOWLIST) 2026-08-01T00:00:00Z TE-T14
- `docs/agents/system-auditor/flow/main.md` Step 0c was prose `Read docs/data/system-map.json and
  extract:` + a 6-bullet key-path list underneath — the bullets never actually gated the Read, so
  the step full-read the whole 1757L/~50.6KB file (~12.7k tok) every `runtime_or_fetch_or_db_audit`
  cycle regardless. Rewrote as a single `jq -c` projection over the same 6 key-paths (microservices
  id/external_port/zone, host_runtime_set.services + not_deployed_by_design, data_sources
  cadence/threshold/geo_blocked, databases id/path, zones id/specialist) → ~4.8KB/~1.2k tok, plus a
  `jq`-unavailable fail-loud fallback (full-read same paths by hand).
- Verified live before writing: grepped real field names off the file (`external_port` singular,
  not the row's paraphrased `external_ports`) rather than trusting the task description's bullet
  text; ran the exact jq command against the live file post-edit — exit 0, all 6 arrays populated
  (11/12/0/28/7/12). Grepped fleet-wide for `Step 0c` and `jq.*system-map.json` callers — no other
  file references this step's old prose shape, no cascade edit needed.
- Did NOT touch `orch-state.json` (`in_progress[]→review[]` lane-move) — own init.md
  `commit_zone.excluded` names it "NEVER in agent-father commits except the ONE allowed
  signal-queue DONE-mark", and this is a task_board row, not signal_queue. Same precedent as
  TE-T12/S16: declined the dispatch prompt's instruction to run `orch-apply.sh` myself; supplied
  the exact transform in RETURN for dev-team/router to apply.
