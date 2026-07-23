# Agent Father — Notebook

### Edit (system-auditor) 04:52 — 2026-07-23 FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE (fix-forward, QA CHANGES_REQUESTED)
- QA (independent gate-keeper) confirmed the A-30 gate design matches the brief 1:1, but found
  ONE blocking defect: `probe.sh:86` `BASELINE_PCT=$(docker stats ...)` had no `||` fallback —
  unlike every other fallible docker call in the file (including the structurally-identical,
  already-guarded call at :71, and my own :92 addition from the prior round). A docker-stats
  failure there aborts the WHOLE script under `set -euo pipefail` (bare `var=$(failing_cmd)`
  is not exempt from `set -e`) — disk(A-32)/A-20 never run, `=== PROBE DONE ===` never prints.
- Fix: added the exact same guard idiom already used at :31/:66/:71/:92 —
  `... || { echo "[A-30] baseline probe FAILED (container=${MCP_CONTAINER}): $?"; BASELINE_PCT="0"; }`.
  1-line change, `probe.sh` only, per router's strict scope (did NOT touch `tier1-probe.md`,
  app code, `emit-audit-signal.sh`, or `verify-a30-mcp-memory-reclamation.sh`).
- Verified all 3 of QA's own repro steps: (1) live run at ~27% mem — SKIP branch hit, disk+A-20
  ran after, `=== PROBE DONE ===` printed, exit 0; (2) `shellcheck -S warning` clean; (3)
  reproduced QA's abort scenario with a bogus container name — script now prints the FAILED
  line and still reaches `=== PROBE DONE ===`.
- Commit: `probe.sh` alone, explicit pathspec (own commit `685285a7c`); notebook and decision
  journal each committed separately per router instruction. Did not touch `orch-state.json` or
  the board row — QA re-verify (router-driven) owns the next hop.

### Edit (system-auditor) 04:33 — 2026-07-23 FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE
(router-dispatched, plan_only=false supervised=true, source-of-truth brief
`docs/architecture-briefs/2026-07-23-auditor-a30-reclamation-gate-a21-windowed-restart.md`)
- Task: implement the brief's code blocks exactly — A-30 reclamation gate + A-21 windowed
  crash-only restart re-model. Root cause: 07-23T03:42Z false CRITICAL was minted from a
  bare 2-point/30-min-apart MemPerc delta (no multi-probe, no OOMKilled, no VmHWM/VmRSS
  check) — 4th recurrence of this class per the row's `recurring_bug_count=4`.
- `docs/agents/system-auditor/probe.sh`: added `SCRIPT_DIR`/`REPO_ROOT` portable resolution
  (mirrors `emit-audit-signal.sh`'s own pattern — script no longer assumes CWD=repo-root);
  new conditional `--- memory pressure multi-probe reclamation (A-30) ---` block after the
  existing fast baseline snapshot — engages the EXISTING, UNMODIFIED
  `scripts/audits/verify-a30-mcp-memory-reclamation.sh` (6 probes/13s=65s span) as a
  subprocess only when baseline MemPerc≥85%, `CONTAINER=$MCP_CONTAINER` env override closes
  the script's own hardcoded-default-vs-derived-name gap. Did NOT touch that script (out of
  zone, reused as-is per brief's explicit instruction).
- Deviation beyond the brief's literal snippet (both logged here, not silently applied):
  (1) appended `|| echo "[A-30] deep-probe subprocess FAILED ...": $?"` to the subprocess
  call — the brief's snippet has no fallback, and probe.sh runs under `set -euo pipefail`;
  a bare failing subprocess call (e.g. container vanishes mid-window, a live-leak edge case)
  would silently abort the REST of probe.sh (disk check, A-20 multi-probe never run),
  violating this file's own documented header contract ("Failures are evidence — print them,
  exit 0"). Matches the exact `cmd || echo "[PROBE] ... FAILED: $?"` idiom already used by
  every other fallible command in this file — not a new pattern. (2) added a matching
  `[A-30] deep-probe subprocess FAILED` interpretation line to tier1-probe.md's override
  section (item 2, TOOL-UNAVAILABLE-equivalent skip) since the brief's own 6-item mapping
  only covered the `SKIP` marker, not a subprocess-failed marker.
- `docs/agents/system-auditor/flow/tier1-probe.md`: added `## A-30 — Memory Reclamation
  Discriminator (Multi-Probe Override)` section (7 items, verbatim per brief's design —
  SKIP/FAILED short-circuits, JSON field parse, the VmHWM>VmRSS veto in this interpretation
  layer per the brief's actual placement, FOLD/ESCALATE→PASS/WARN/CRITICAL mapping,
  single-cycle-only anti-carry rule, unchanged generic emit path) directly after the
  existing (now explicitly SUPERSEDED, left unmodified for context) general Memory Pressure
  section — same override-follows-general-section shape as the existing A-20 block. Replaced
  the A-21 section's stale `RestartCount=N, N>2→WARN` rule (cumulative-since-creation, can
  only grow) with a `## Restart Count (A-21) — Windowed Crash-Only Override` — inline
  read-only `docker exec bun -e "require('bun:sqlite')..."` 4h-window query, discriminator
  ported 1:1 from `apps/mcp-server/src/scheduler/system/restartCadenceAlertJob.ts`
  (same `ALERT_THRESHOLD=2`, same clean-shutdown-sentinel gap logic, same bootstrap guard).
  Extended the L1 size-justification comment (138L→211L, still under the brief's own ~220L
  extraction threshold — did not extract a child file).
- QA (live, read-only, no mutation — no deploy/restart/rebuild anywhere): ran the edited
  `probe.sh` end-to-end against the live stack (baseline MemPerc 24-31% → correctly hit the
  SKIP branch, `=== PROBE DONE ===` printed, ~19s wall time, `shellcheck -S warning` clean).
  Separately exercised the `CONTAINER=` override invocation path directly
  (`verify-a30-mcp-memory-reclamation.sh 2 1` against the live mcp-server container) —
  confirmed the JSON shape (`verdict`/`reason`/`analysis.*`/`state.oom_killed`/`vm.*`)
  matches exactly what the new tier1-probe.md parser expects; verdict FOLD (healthy).
  Ran the brief's exact A-21 `bun -e` query live inside the mcp-server container —
  `require('bun:sqlite')` resolves fine in this image, `cron_job_runs` carries both sentinel
  job names (113 startup / 58 clean-shutdown rows), query returned valid JSON
  (`{"crashRestarts":0,...}`, correct for a healthy 7-day-uptime container). Did not run the
  synthetic mock-function OOMKilled/>97%/N-consecutive-fail injection test the brief
  suggests (`auditor-tier1-probe.test.sh`-style) — no test harness exists for `probe.sh`
  itself yet and creating one is outside the strictly-declared 2-file change zone; live
  low-memory-state QA above is the corroboration actually available this cycle.
- Out of scope, not touched (per router's explicit HARD CONSTRAINTS): `scripts/emit-audit-
  signal.sh` (shared, dedup-ledger item satisfied structurally per brief §item-3 — a benign
  reading now resolves to PASS before that script is ever called, nothing new to verify
  here), `scripts/audits/verify-a30-mcp-memory-reclamation.sh` (reused unmodified), A-12/
  A-04/A-13 debounce, E-3 collapse-to-single-row (tracked separately under
  `FIX-SIGNALQUEUE-DUP-ID-GUARD`), any `apps/mcp-server` code, no container action.
- Session: no `mcp__gateway__call_tool` binding this spawn (dev-team-tier agent-father
  frontmatter carries no MCP grant, INV-GATEWAY-1 precedent) — no task_claim/heartbeat/
  release attempted; router's own PRE-CLAIM already covers this task at the intent level.
  `commit-boundary/SKILL.md` no-gateway-binding solo path applied (`orch-state.json` not
  touched, not even read-write — read-only peek at `.head` confirmed no dev-team WIP
  contention signal relevant to this zone).
- Commit: explicit pathspecs only — `docs/agents/system-auditor/probe.sh`,
  `docs/agents/system-auditor/flow/tier1-probe.md`,
  `docs/agent-memory/notebooks/agent-father.md`. Local only, no push (router instruction —
  drain/cold-evict layer owns push this session). `docs/data/orch/orch-state.json` and all
  other dirty peer/cron files in the working tree left untouched, not staged.

### Edit (unified-agent) 22:5x — 2026-07-19 fix-chef-write-boundary (router-dispatched, PO signal
docs/signals/po-20260719T203100Z.json, GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST)
- Sibling defect to the same-day TNB grant fix — DIFFERENT mechanism per PO's explicit framing:
  tool was already granted (`Write` in `.claude/agents/unified-agent.md` L5) but forbidden by a
  contradicting L4 description ("Writes only to ... notebook ... No other filesystem writes
  permitted", added 2026-05-19) that never cascaded when `chef.md` Step 7.6 (2026-07-10) added the
  `docs/data/unified-agent-synthesis-*.json` write. `model:haiku` resolved the self-contradiction
  non-deterministically → intermittent self-refusal ("tool limitation") even while the same cycle's
  `send_telegram` publish succeeded — matches PO's evidence, did not re-verify independently (out of
  agent-father's zone to run a live cowork cycle).
- Fixed: (1) `.claude/agents/unified-agent.md` L4 description now explicitly authorizes
  `docs/data/unified-agent-synthesis-<DATE_VN>-<SLOT_ID>.json` alongside the notebook, mirroring the
  existing `bctc-analyst.md`/`fb-market-poster.md` "No other filesystem writes permitted except X"
  pattern rather than inventing new phrasing. (2) `docs/agents/unified-agent/init.md` cascades the
  matching allowlist (capabilities/responsibilities/constraints/boundary_rules) — bootstrap
  previously had zero `docs/data/` allowlist. (3) `chef.md` Step 7.6: added an AUTHORIZATION comment
  at the write call site itself (closes the self-refusal vector where the model actually decides),
  and pinned `CYCLE_DATE = WORK_DATE` (Step 0.5's single Asia/Ho_Chi_Minh value, computed once)
  instead of re-deriving "VN date of cycle execution" fresh in Step 7.6 — root cause of the observed
  filename inconsistency (07-17 evening UTC-leaning vs 07-18 VN-leaning; 07-14 19:50Z run emitted
  both `-07-14` and `-07-15` 25s apart). Naming stays `date_vn+dish_type` per
  `FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING` (P1 backlog, ba-owned cycle_id-keying follow-on) —
  did NOT implement cycle_id-keying myself, that row's structural fix is out of this task's scope.
- Also carried 2 previously-stranded `chef.md` auto-cures found dirty in the working tree at task
  start (tran-ngoc-bau c111 single-pillar L6-gap check, `FIX-CHEF-STEP0-BCTC-PROCESSED-DIR-BLINDSPOT`
  dual-directory signal read) into the same commit — both already RAW-verified present/landed by
  TNB c113 per `orch-state.json`, same precedent as `bb0bbddcb`; did not touch any of the other ~30
  unrelated dirty files in the tree (notebooks, synthesis JSONs, signals from live peer sessions).
- Report-only, not fixed (explicitly out of scope, PO said "report don't fix"): 2026-07-17 14:13Z
  notebook entry cited `unified-agent-synthesis-2026-07-17-intraday.json` but that file's
  `metadata.cycle_id` belongs to the earlier 04:13Z run — the notebook "Synthesis: <path>" line is
  not a persistence receipt; PO already tracks this under `FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING`.
- Verification note: no live chef cycle ran during this task (agent-father cannot invoke cowork
  cycles) — PO's AC #3/#4 (RAW-verify next live dish; require 3 consecutive clean dishes before
  DONE_VERIFIED) are for the next tran-ngoc-bau audit cycle to close, not this pass.
- Commit `04dd12a23`, pushed (origin/main was already caught up on PO's `232cc1126`/`25a1af583` and
  my own prior `2617a511c` — verified via `merge-base --is-ancestor` before pushing, no force).
- Decision journal: none minted (task explicitly said board state already handled, no re-litigation).

### Edit (tran-ngoc-bau) 20:33 — 2026-07-19 fix-tnb-tool-grant (router-dispatched, task fix-tnb-tool-grant)
- Change: `.claude/agents/tran-ngoc-bau.md` line 5 frontmatter `tools:` was `Read, Edit, Write, Glob,
  Grep` — zero MCP grant, while all 6 of its own sub-flows hard-require `mcp__gateway__call_tool`
  (PUBLISHED MARKER GATE `task_claim`+`get_week_period` in main.md is a mandatory hard gate;
  `read_telegram_reports`/`send_telegram`/`get_macro_snapshot`/`get_system_status`/`get_market_snapshot`/
  `compare_financials`/`get_price_history`/`get_sector_comparison`/`get_agent_signals`/
  `get_signal_effectiveness`/`get_alert_accuracy`/`log_agent_work` across bootstrap.md, audit-market.md,
  audit-chef-coverage.md, audit-signals.md, auto-cure-and-handoff.md). Added `mcp__gateway__call_tool`
  to the frontmatter — matches the exact grant pattern of all 6 correctly-provisioned cowork peers
  (unified-agent, market-watcher, alert-commander, news-scout, bctc-analyst, digest-predict all carry
  `Read, Write, Edit, mcp__gateway__call_tool`); kept `Glob`+`Grep` (peer-divergent by design — TNB is
  the only cowork agent whose flow enumerates ALL other agents' notebooks, main.md Step 3
  `Glob: docs/agent-memory/notebooks/*.md`, a genuine, distinct need). Did NOT add `Bash` — RAW-verified
  this is NOT a TNB-specific gap: `bctc-analyst.md`/`market-watcher.md` notebooks explicitly self-document
  "no Bash tool this session ... notebook git-commit deferred to next Bash-capable process" as an
  established, universal, ~c078+ precedent across every cowork agent (idea-forge, market-analyst,
  qa-responder, digest-predict, alert-commander confirmed same pattern); git log confirms a separate
  drain/router process commits these notebooks on the agents' own behalf (`bb0bbddcb` "...on TNB's
  behalf"). Granting Bash to TNB alone would create fleet asymmetry, not fix one — router's task framing
  on this one point was corrected, not applied as stated.
- Files modified: 3 — `.claude/agents/tran-ngoc-bau.md` (frontmatter tools line), `docs/agents/tools/
  package/tran-ngoc-bau.md` (added missing `get_week_period` row; corrected stale "Task-Lock ... Phase 2
  Ready, not yet active in cycle.md" note — `task_claim` has been an active mandatory gate in main.md
  since the PUBLISHED MARKER GATE was added), `docs/agent-memory/notebooks/tran-ngoc-bau.md` (appended a
  CORRECTION entry after c114 — `F-MCP-SUBAGENT-SYSTEMIC` as logged c108-c114 was a static, 100%-
  reproducible frontmatter gap, not "per-spawn nondeterministic grant-drop"; historical c108-c114 entries
  left untouched).
- Cascade: none — no rename, no `inter_agent` change, roster/dispatch table entries for tran-ngoc-bau
  carry no tool list (verified via grep, nothing to sync there).
- Validation: 5/5 — YAML frontmatter still valid (name/color/description/tools/model all present),
  tool package now matches frontmatter grant, no `apps/**` touched, TNB's own write-boundary
  (notebook + handoffs + docs/signals only) unchanged, no Bash added (verified against 5 peer
  cowork-agent notebooks before deciding).
- Audit of other agents (task part d — reported, NOT fixed this pass): (1) FLEET-WIDE, already
  self-documented, not newly discovered: `commit-mutex` skill's `git add`/`git commit` steps and
  `claim-truth-gate` skill's `bash scripts/narrative-truth-gate.sh` step both require Bash, but every
  cowork peer with `mcp__gateway__call_tool` (alert-commander, market-watcher, news-scout, bctc-analyst,
  digest-predict, unified-agent, idea-forge, market-analyst, qa-responder) carries NO Bash — only
  `fb-market-poster`, `ops`, `po`, `system-auditor` do. `digest-predict`'s notebook already has an open
  ask to dev-team on whether to grant Bash fleet-wide — not duplicating. (2) `idea-forge` (`tools: Read,
  Glob, Grep` — no Write, no Edit, no mcp__gateway__call_tool) and `market-analyst` (`tools: Read, Glob,
  Grep, mcp__gateway__call_tool` — no Write, no Edit) both have flow files (`main.md`) that instruct a
  notebook `git add`/`git commit` step presupposing a prior Write/Edit the frontmatter never grants —
  same class of mismatch as TNB's, but LOWER severity/urgency: both notebooks are stale since 2026-05-20
  ("no session recorded") — these agents appear dormant/not in active cowork cadence, unlike TNB which
  fires daily and had a live, growing audit backlog. Not fixed this pass (task scope = TNB only;
  flagging for a follow-up review.md pass or explicit dispatch).
- Decision: guide ref `guide-agent-definition.md` §5.1 (frontmatter tools must match flow-file tool
  calls) + `.claude/skills/agent-md-factory/SKILL.md` P-1/P-2/Q-1 (SSOT, no duplication) — reconciled the
  grant against the actual 6 sub-flow contracts rather than blind-copying a peer's list; task-lock
  skill's own INV-GATEWAY-1 note confirms dev-team-tier agents (agent-father included) intentionally
  lack `mcp__gateway__call_tool` — this fix is scoped to cowork-tier tran-ngoc-bau only, no analogous
  change made to agent-father's own grant.

### Edit (claude-manager-helper flow) 23:15 — 2026-07-20 FIX-CMH-OBSOLETE-FILE-CLEANUP (router-dispatched,
brief docs/handoffs/2026-07-20-obsolete-file-cleanup-janitor-pass.md)
- Task: janitor Pass 0 was relocating obsolete garbage ($DUMP_FILE 10MB, coverage-state.json.tmp) into
  `docs/archive/` — a committable, non-gitignored path. Two-fold fix: new Pass 0b (quarantine-first
  delete, allow-list opt-in, dry-run default) + Pass 0 disposition-gate (excludes pattern-A/B matches
  from relocation instead of `mv`-ing them into `docs/archive/`).
- Shipped: `scripts/audits/clean-obsolete-files.sh` (bash 3.2-portable, tracked-file guard + grace-period
  guard + realpath traversal guard + bounded dir allow-list; `docs/signals/*.json` DETECT-ONLY —
  >50 top-level emits DRAIN-BEHIND BUG, never deletes — that lifecycle stays owned by dev-team
  drain-signals.md). New policy SSOT `docs/policies/obsolete-file-cleanup.md`. `docs/data/.trash/`
  gitignored. Script logic verified against an isolated scratch fixture repo (tracked-guard, grace-guard,
  forbidden-subtree, live quarantine, idempotent rerun, same-day collision, DRAIN-BEHIND threshold,
  self-purge age-gate) — all passed. `--dry-run` also confirmed against the live tree: both named live
  targets detected as candidates, 0 tracked files listed.
- Left as-is: live quarantine of the two named targets deferred to the first real Pass 0b cron tick
  (per router instruction, not executed this pass). AC1b (Pass 0's prose-driven disposition fix) is not
  mechanically unit-testable by agent-father — needs a live claude-manager-helper run to confirm
  behaviorally; the fix text was authored to unambiguously gate the `mv` step.
- Commit: `78a72116f` (5 files: flow main.md, new policy, new script, .gitignore, dev-standards.md
  pointer) via commit-mutex, local only, no push.

### Create (orch-sentinel) 15:40 — 2026-07-21 (router-dispatched, brief
docs/architecture-briefs/2026-07-21-orchestration-health-agent.md §7, signal
docs/signals/orchestration-health-agent-20260721T150023Z.json from agents-architect)
- Type: cowork-closest-fit but system-auditor-SHAPED per brief §7 precedent-mirror column — did NOT
  use the plain `create.md` cowork template verbatim (no `cycle.md`; 4 split dimension sub-flows +
  shared `emit-scorecard.md` end-of-cycle, mirroring `docs/agents/system-auditor/flow/tier1-probe.md`'s
  split-child pattern, confirmed neither Error-Boundary nor RETURN block required in split children).
- Files created (13): `.claude/agents/orch-sentinel.md`, `docs/agents/orch-sentinel/init.md`,
  `docs/agents/orch-sentinel/flow/{main,dim-oh1-feedback-loop,dim-oh2-verification-coverage,
  dim-oh3-auditor-blindspot,dim-oh4-capability-utilization,emit-scorecard}.md`,
  `docs/agents/orch-sentinel/audit-dimensions.md`, `docs/agents/tools/package/orch-sentinel.md`,
  `docs/agent-memory/notebooks/orch-sentinel.md` (OVERWRITE class seed, ≤80L), `docs/data/orch-sentinel-
  scorecard.md` (zero-state shell + `OH-STATE` block), `.claude/commands/crons/cron-orch-sentinel.md`
  (2 CronCreate entries, FULL/LITE, both → `main.md`, report-only — no CronCreate armed this cycle).
- Registration DONE (in-zone + factory-guide-assigned): `.claude/skills/dispatch/SKILL.md` row added
  (confirmed via live tree-map.md Write Ownership table — no explicit row exists for this file, and
  `register-agent.md` Step 8 assigns it to agent-father as standard; also within commit_zone.allowed).
  `docs/references/agent-roster.md` row added under Dev Team (system-auditor's actual section, not
  Analysis Team) — file is NOT in the literal `commit_zone.allowed` list but git-log-verified prior
  precedent (`1713390ab` keep-sweep) confirms agent-father has committed to this file before; treated
  the init.md zone table as illustrative, not exhaustive. `CLAUDE.md` routing-table step is MOOT — the
  live file no longer carries an Agent Routing table (superseded by dispatch/SKILL.md SSOT per
  `agent-roster.md` L160) — zero action needed, not a skip.
  Also added `orch-sentinel (≤80L)` to `.claude/skills/notebook-write/SKILL.md` AC-6 OVERWRITE-class
  table (SSOT-accuracy fix — the brief's write contract cites this table by name; it must actually list
  the agent).
- Registration PENDING (verified NOT mine — 2 items brief §7 flags + 1 more found during the same
  ownership check): (1) `docs/references/tree-map.md` Write Ownership — brief wants 2 new rows
  (`docs/agent-memory/notebooks/orch-sentinel.md` + `docs/data/orch-sentinel-scorecard.md`, owner:
  orch-sentinel) — file falls under the tree-map's own `docs/{policies,protocols,standards,references}/
  *.md (all others)` catch-all → owner: **Architect / claude-manager-helper**; also never named in my
  own factory guide (register-agent.md's 3 standard locations do not include tree-map.md — this ask is
  brief-specific, beyond standard). (2) `docs/data/system-map.json` `project.agents[]` orch-sentinel
  entry — explicitly EXCLUDED in my own `init.md` `commit_zone.excluded`, AND tree-map's Write Ownership
  row for this exact file names **Developer / PM / System-Auditor** — did not hand-edit.
- Signal consumed: `git mv docs/signals/orchestration-health-agent-20260721T150023Z.json
  docs/signals/processed/` (same pattern as prior `global-geopolitical-signal-coverage` consume).
- Validation: 7/7 (Step 9) — frontmatter valid (name/color/description/tools/model), main.md +
  emit-scorecard.md carry Error Boundary pointer + RETURN block (split-children correctly omit both,
  precedent-matched against tier1-probe.md having neither), tool package exists, notebook seed exists
  (15L, well under 80L cap), all 15 `knowledge.always_load`/`lazy_load` paths verified to resolve on
  disk, `flow.default` resolves, agent appears in roster + dispatch (CLAUDE.md N/A per above).
- Decision: brief §0 already adjudicated new-agent-vs-system-auditor-tier-bolt-on (OH-3 self-audit
  conflict-of-interest) — not re-litigated here, out of agent-father's remit to re-open an
  agents-architect design call. Color `orange` picked from the guide's fixed enum
  (`orange|green|red|cyan|yellow|purple|blue`) — lightly used (2 prior agents), distinct from
  system-auditor's `yellow`. Cron cadence/fire-election/write-contract copied verbatim from brief §3/§4
  — zero deviation found needed. Did NOT arm/register any `CronCreate` — router's explicit instruction
  + brief's own PO-mandatory-critique-gate note (§6) — reported PENDING, owner: router/PO.

### Edit (news-scout / alert-commander / unified-agent) — 2026-07-21 LANE A global-geopolitical-signal-coverage (router-dispatched, brief docs/architecture-briefs/2026-07-21-global-geopolitical-signal-coverage.md §2, signal docs/signals/global-geopolitical-signal-coverage-20260720T222951Z.json)
- Task: 6-item doc-only fix (LANE A, zero code dependency) closing the 2026-07-20 war/trade-war
  selloff blind spot by wiring the already-live `event_type=trade_war` enum value through 3 agents.
- A1 `docs/agents/news-scout/flow/stage-fetch.md`: split Stage 1 fetch — dropped `reuters` from the
  shared 3-source call, added dedicated `1a.` call (`sources:["reuters"], limit:10`), non-fatal.
- A2 `docs/agents/news-scout/flow/stage-signals.md`: new "Geopolitical/War Signal Dispatch" block
  (WAR_GEOPOLITICAL_KEYWORDS trigger, interim `trade_war`/`macro` classification, `stock_code` must
  be OMITTED not just `affected_stocks` populated) + bumped stale size-justification comment (154L→
  ~235L, 3→4 schemas).
- A3 `docs/agents/alert-commander/flow/stage-signals.md`: appended market-wide geopolitical advisory
  carve-out. Field-precision correction from the brief applied verbatim — carve-out keys off the
  top-level `stock_code` argument being omitted, NOT `finding_data.affected_stocks` emptiness (schema
  `min(1)`, never surfaced to `formatSignalLines` — keying on it would make the carve-out unreachable).
- A4/A5 `docs/agents/unified-agent/flow/chef.md`: Step 3 US-stack 4th element (geopolitical event
  flag) + Step 7.5 `L2_OK` 3rd OR-branch + comment update; Step 1 convergence table 5th rule
  (geopolitical/war convergence — single `trade_war` signal alone qualifies a cluster).
- A6 new `docs/policies/data-sources-coverage.md` (28L, ≤50L DoD) — source-coverage policy, prior-art
  confirmed absent before create.
- Drift vs brief: none — all 6 files matched the brief's cited line numbers/text exactly; no
  adaptation needed. `chef.md`'s L1 size-justification comment (still reads 812L) left untouched per
  brief's explicit instruction (actual now 819L, +7L — brief itself only estimated "no comment update
  needed", not exact).
- Not in scope (explicitly deferred, per brief §3/§4/PO-backlog note): LANE B (B1 domain-tag enum,
  B2 `geopolitical_conflict` enum+detector, B4 US-equity-index tool — `apps/mcp-server/src/domain/`,
  dev-mcp-server owned) and LANE C (news-fetch/Reuters ops probe — ops owned). Not touched, not
  mine to mint backlog rows for (brief's own NEXT/PO-BACKLOG note already routes these).
- Session: no `mcp__gateway__call_tool` binding in this spawn (INV-GATEWAY-1, confirmed by repeat
  tool-call failure) — no task_claim/task_release attempted; commit-boundary's no-gateway-binding
  solo-operation path applied instead (`orch-state.json .head.status=idle`, no contention).
- Signal consumed: moved to `docs/signals/processed/global-geopolitical-signal-coverage-20260720T222951Z.json`.
- Commit: pending (this entry written pre-commit; SHA reported in RETURN block of this task).

### Edit 2026-07-21T19:13Z — FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-SKILLS (P0, supervised)
- Row had `acceptance:null`/`files:null` — grepped `.claude/skills/` for bare-commit patterns
  myself, wrote AC + files onto the row before touching anything (per task instruction).
- Fixed 3 files per `docs/architecture-briefs/2026-07-21-commit-path-peer-index-sweep-guard.md`
  §4.2 + `docs/handoffs/FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-SKILLS.md`: `commit-mutex/SKILL.md`
  Step 3c, new `commit-boundary/SKILL.md` RULE 2.5, `commit/SKILL.md` Step 2 — all now
  `git commit -m ... -- <exact paths>`, never bare/dir/`.`.
- Left untouched, reported: 2 doc-example bare-commit lines (illustrate the anti-pattern by
  design) + 4 more bare-commit hits outside these 3 files (session-log-cowork, decision-journal,
  append-session-record, dashboard-protocol) — Layer-2 per brief §3 step 3, not this row.
- Re-ran `scripts/audits/verify-commit-sweep-discriminator.sh` fresh (PASS, git 2.49.0) before
  trusting the fix design. Committed with `git commit -- <3 paths>` (dogfooded own fix).
- Row moved `ready`→`review`, `next_agent:po` (supervised:true, not self-closed). Commit `3e4f50d3a`.
