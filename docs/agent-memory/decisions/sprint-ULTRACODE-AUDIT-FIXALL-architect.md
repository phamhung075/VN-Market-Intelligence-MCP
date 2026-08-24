# Decision Journal — Sprint ULTRACODE-AUDIT-FIXALL · architect

**Sprint goal:** Drain CONFIRMED/RESCOPE findings from the 2026-07-12 ultracode workflow audit.
**Agent:** architect
**Started:** 2026-07-13T20:00:00Z

---

### STEP architect-S1 · architect · 2026-07-13T20:00:00Z
**task-id:** UC-RDL-P1
**what-done:** Adjudicated the mint's framing before designing; split it into two separate claims and verified each independently against server code + live flows (not trusted from the critic's one-liner or the prior audit brief alone).
**what-considered:**
- Treat `intent:` vs `task:` as the drift (as literally worded in the mint) → falsified: coordinationTools.ts's 7-kind enum, its own task_id format describe(), and tasksMdJanitorJob.ts's KNOWN_LEGIT_PREFIXES allowlist all treat `intent:` as a deliberately separate, board-row-less category.
- Treat `sprint-task:` (doc) vs `task:` (100% of live flows + server) as the drift → confirmed: zero live call sites use `sprint-task:` as a task_id value; the SKILL's own "mismatch = no protection" warning is self-refuting given its own example.
**why-decision:** Empirical live evidence (this cycle's own dispatch lock was `task:UC-RDL-P1`, not `intent:architect:...`) plus server-code enum/allowlist proof outweighs the mint's prose framing — REJECT the intent:/task: merge, CONFIRM the sprint-task:/task: doc fix (already independently verified in the 07-12 audit's own verifier pass).
**why-change:** Mint conflated two SKILL.md sections (generic Phase B intent: pattern vs Sprint-Task Outer Wrap section) into one claim; scoped the fix to the section that's actually wrong.

### STEP architect-S4 · architect · 2026-07-21T23:57:05Z
**task-id:** FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD
**what-done:** Ruled the 3 architect-decidable calls BA deferred (FR-5 bundle, backlog+BLOCKED classification, I10 batching); ratified DDD layers + FR-1/FR-2 file-level design; wrote blueprint.
**what-considered:**
- FR-5: bundle now (shared resolver, same commit) vs spin `dev-team-loop-I9` standalone — chose bundle: identical defects, same file/lines, not container-rebuild-gated, and un-bundling would leave FR-4's widened guard produce zero-board-trace adoptions.
- backlog+BLOCKED: route to active (symmetric with in_progress+BLOCKED) vs terminal — chose terminal, grounded in a live board example (TASK_2005 in_progress→backlog+BLOCKED on new depends_on) showing the real meaning is "paused pending external precondition," plus asymmetric safety cost (wrong-active risks the MATERIALIZED incident repeating; wrong-terminal only delays, self-heals via existing promote gate).
- I10: leave for successor to fix in any order vs sequence as hard precondition — chose precondition-first: successor's own heartbeat-loop deliverable cannot function without I10's owner_client_session binding landing first at the same claim call; also found the :64 release call shares the same defect (BA only flagged :42-48).
**why-decision:** Each call resolved by grounding in live evidence (line-exact code read, a real board row, the Zod-required-field schema) rather than the abstract framing alone — matches the standing "ratify BA's judgment call with independent verification" pattern from S2/S3.
**why-change:** No change from BA's scope — all 3 were explicitly flagged as architect-owned engineering calls, not PO/business calls.

### STEP architect-S2 · architect · 2026-07-16T04:40:00Z
**task-id:** UC-ASL-P2
**what-done:** Verified BA's 6 copy-site inventory + all cited precedent files (mcp-call.sh, auditor-notebook-commit.sh, orch-apply.sh exit codes, context-bloat-backstop.sh's actual dead-gate boundary) line-exact at HEAD; resolved the 3 ARCH-RATIFY items and the 2 items BA explicitly deferred (CAS-retry loop shape, E-3-only mode flag); wrote design to handoff.
**what-considered:**
- ARCH-RATIFY-2 (severity-escalation bypass): keep FR-3's bare-string ledger (`{key: ts}`, no severity) and skip the bypass rule entirely vs amend the ledger value to `{ts, sev}` to make the bypass computable.
- E-3-only mode: infer "no E-1" from absence of certain detail_json fields (BA's first option) vs one explicit `--e3-only` flag (BA's second option, self-flagged as the unambiguous one).
- Ledger concurrency: add flock-style locking for concurrent Tier-2/Tier-3 same-tick invocations vs accept the bounded lost-update risk unlocked (mirrors sibling tmp+mv writers).
**why-decision:** A no-op on EC-4 would silently leave a worsening CRITICAL re-alert muted for up to 7 days — worse than doing nothing per the brief's own "passive health masks" anti-pattern class; the 1-field ledger amendment is the minimum schema change that makes BA's own non-binding recommendation implementable, so took it. Explicit `--e3-only` flag chosen over inference because BA's own FR-6 text flagged inference as ambiguous ("rather than inferred") — an explicit switch is unambiguous for both the developer and future call sites. Locking rejected — effort=M scope, worst case is a redundant Telegram send (never a lost E-1/E-3), and 2 already-shipped sibling writers accept the same unlocked tmp+mv tradeoff.
**why-change:** No change from BA's scope — both resolved items were explicitly flagged by BA as architect-owned technical decisions, not scope additions.

### STEP architect-S3 · architect · 2026-07-16T15:50:00Z
**task-id:** UC-CRITIC-GATEWAY-CONTRACT-DRIFT
**what-done:** RAW-verified all 6 BA fix-table lines + FR-3's §6 no-other-hit claim at exact line numbers (all matched byte-for-byte); ruled on BA's 3 open questions; ratified canonical-binding + historical-exclusion.
**what-considered:**
- Q1 (I11/I14 fold-or-separate): discovered via grep that these are NOT bare unfiled findings — they're already sub-bullets P9/P12 inside two live BACKLOG SPIKE rows (`UC-RDL-UNVERIFIED-BATCH`, `UC-CCA-UNVERIFIED-BATCH`), each an 8-9 item PLAN-ONLY umbrella awaiting a future full BA-spike-then-decompose cycle before ANY bullet ships.
- Q2 (settings symmetry): checked `.claude/settings.local.json` tracking status directly.
- Q3 (historical exclusion): spot-checked the frozen audit brief + po-decisions.md rolling-log edge case; no repo policy doc explicitly codifies "never rewrite dated records" but the audit brief's own P9 note ("git history IS the audit trail") is a live precedent for the same principle.
**why-decision:** Q1 FOLD IN — same mechanical 1-line class already being batched 6x in this task, near-zero marginal risk, and waiting for the two P2 SPIKE batches to individually clear would duplicate the verification work already done this cycle; flagged for PM to have those 2 batch rows' notes struck (P9/P12) post-ship so a future spike doesn't re-investigate shipped work. Q2 LEAVE AS-IS — `.claude/settings.local.json` is globally gitignored (`~/.config/git/ignore:1`), zero commit surface exists in this repo for it, and global `~/.claude/settings.json` is outside repo control entirely; `defaultMode:"auto"` already covers the gap functionally (BA-confirmed live this session). Q3 RATIFY BA's exclusion list as-is — no exceptions found on spot-check.
**why-change:** No change from BA's scope — all 3 were explicitly flagged by BA as non-blocking architect judgment calls.

### STEP architect-S4 · architect · 2026-08-06T09:43:54Z
**task-id:** UC-CRITIC-HOOKS-ENFORCEMENT
**what-done:** Read all 4 load-bearing hook scripts + both settings files end-to-end; designed FR-1 (drop outer `2>/dev/null||true` on the 4 CRITICAL/HIGH invocations, uniform exit 0/1 convention), FR-2 (new shared `hook-guard.sh` crash-discriminator, applied at named input-boundary guards only), FR-3 (new A-33 system-auditor check reusing `emit-audit-signal.sh`), test scope (NFR-5). Appended to `ba_handoff`; moved board `in_progress[]→ready[]`, `next_agent=developer`.
**what-considered:**
- FR-2 retrofit scope: every `exit 0` guard in all 4 scripts (21 sites in notebook-auto-prune.sh alone) vs only the input-boundary guards BA explicitly cited — chose the narrow scope.
- FR-3 fire-evidence (d): build new fire-log plumbing vs descope — descoped (violates FR-4/NFR-4 "no new plumbing").
- Stop-hook exit code for branch-hygiene-stop.sh: exit 2 (real blocking capability, delays session end) vs uniform exit 1 — chose uniform 1, flagged exit-2 as a noted-not-adopted future option (avoids introducing new blocking behavior BA never asked for).
- Mid-verification found (not in BA's spec): `.claude/settings.local.json` is gitignored/untracked (`git check-ignore` confirmed) — the FR-1 edit is a direct live-file edit, not a git commit. Amended handoff + board note with this addendum before closing the cycle rather than shipping a design silently blind to its own delivery mechanism.
**why-decision:** Narrow FR-2 scope matches BA's own example + SPIKE timebox; deeper internal guards already have partial signal coverage. FR-3 (a)+(b)+(c) alone already closes both edge cases BA names in §5 — (d) would be scope-inflating new infra. Uniform exit-1 avoids shipping an untested new blocking capability inside a fail-loud hardening task (ironic footgun risk). The untracked-settings-file finding was corroborated against 2 independent prior decision-journal entries (developer + po) before being written up, not asserted from a single grep.
**why-change:** No change from BA's scope on FR-1/FR-2/FR-3/FR-4; the untracked-settings-file addendum is a proactive risk-flag (architect's own remit), not a scope change — recommendation left non-gating.

### STEP architect-S5 · architect · 2026-08-13T20:00:32Z
**task-id:** UC-RDL-P7
**what-done:** Read all 21 BA-inventoried files at source (not just cited lines) + the coordination-sibling brief; resolved the 3 open calls BA flagged; found a 22nd file (`docs/agents/po/flow/main.md`) BA's own grep missed. Wrote brownfield brief to `docs/architecture-briefs/2026-08-13-uc-rdl-p7-branch-policy-reconciliation.md`.
**what-considered:**
- FR-7(b) pipeline-vs-verify-committed: collapse outright vs keep both, strip pipeline's checkout/merge to a no-op. Chose the latter — `pipeline`'s DDD-boundary/secret greps + BCTC eval gate are richer first-pass checks for fresh code that `verify-committed` deliberately omits (lighter re-verify of already-shipped rows); merging would either bloat verify-committed or thin pipeline, a real behavior change EC-4 rules out.
- FR-7(c)/FR-10 CLEAN retire-or-repurpose: repurpose to worktree-only vs retire entirely. Chose retire — branch-half is dead by construction (no branch ever created); worktree-half fully redundant with dev-team's own unconditional PREFLIGHT T5 (`git worktree prune -v`, every tick)/T6 (24h lock sweep); confirmed via grep that PO's own `BATCH()` `type` enum (ephemeral triage-time tag) is independent of persisted board rows' coincidental `.type=="CLEAN"` values (tech-debt category, unrelated) — retiring breaks nothing live.
- FR-13 delete-vs-repoint: repoint (1-line pointer) for `.claude/WORKFLOW.md` + 3 bundle files, matching BA's own recommendation — repointing preserves historical single-load convenience shape at near-zero cost vs delete, and dev-standards.md/tree-map.md still list WORKFLOW.md as a tree-map entry (non-knowledge-load, harmless).
**why-decision:** All 3 picked the smaller, lower-risk diff consistent with EC-4 (zero runtime behavior change) and this codebase's "reuse existing pattern over new one" precedent (dev-team's T5/T6 already exists; NFR-1's pointer pattern already exists in dev-standards.md § Commit Format).
**why-change:** `docs/agents/po/flow/main.md` (lines 21/25/27/59 — BATCH type enum, priority order, CLEAN definition, "branch workflow" cross-ref) added to the file inventory as file #22 — BA's repo-wide grep excluded no directory that should have caught it; live CLEAN-routing dependency, must land in the SAME wave as FR-7(c)'s CLEAN retirement or PO keeps emitting a `type:"CLEAN"` batch dev-team no longer has a section for.

### STEP architect-S6 · architect · 2026-08-14T12:16:48Z
**task-id:** UC-CCA-P2
**what-done:** Ratified BA's 6 FRs against all 10 live files (zero drift, same-day). Designed FR-1/FR-2's DMS-2 ladder restructure for gateway-availability-gate/SKILL.md (classify→30s-backoff→sibling-corroborate→suppress-or-escalate, new DEFER notebook template distinct from BLOCKED, additive payload-suffix keeping FR-2's "unchanged" literally true) — ~171-176L post-edit, inside AC-1's 200L cap. Resolved all 3 open questions.
**what-considered:**
- Found beyond BA's text: alert-commander/cycle.md + bctc-analyst/cycle.md are thin-dispatcher files whose Dispatch TABLE (not body prose) is the real execution-order SSOT — body-only insertion (BA's literal text) would leave the table inaccurate. Added table-row edits to both, same files, no new file count.
- chef.md placement (BA's own choice): after Bootstrap, before Step 0.5 — the ONE of 5 FR-4/FR-5 targets landing Step 0-GW AFTER that flow's own first gateway call, not before. Considered flagging as a defect to fix vs ratify-as-intentional. Ratified: cycle-bootstrap's own Step-0 already gates the general confirmed-down case; BA's placement protects the narrower task_claim-mutation race specifically — correct on its own stated rationale, not an oversight.
- NEXT: pm vs direct agent-father (the FIX-CHEF-BIZCTX/USDVND precedents in this same zone skipped PM). Checked agent-father/flow/edit-prepare.md Step 1: `agent_name` is a single input, Glob-validated against `.claude/agents/<name>.md` — architecturally single-agent-scoped. This task spans 6 agent families + 1 shared skill, unlike the 1-agent precedents. Routed to pm for real decomposition (~7 subtasks), not agent-father directly.
**why-decision:** The single-agent-scope finding on agent-father's own edit-flow input contract is decisive and mechanical (not a judgment call) — a direct agent-father route here would either silently fail Step 1's validation or require agent-father to improvise outside its documented flow, 6x over.
**why-change:** No change from BA's FR scope. Added the 2 structural refinements (table-row edits, chef.md rationale note) as proactive risk flags per architect's own remit — neither changes what BA specified, both close a doc-drift/false-consistency risk before implementation starts.

### STEP architect-S7 · architect · 2026-08-22T16:52:00Z
**task-id:** UC-DDDRISK-P1
**what-done:** Brownfield DDD risk review across all 11 `apps/**` services (direct router dispatch, no BA spec). Re-ran every existing mechanized gate (composition-root-logic-gate, no-hardcode-allowlist-scan, metric-mask-lint, dead-code-gate, shared-package-import-check) + grepped every domain/ layer for cross-layer imports across TS/Go/Python — 0 live violations. Found 6 stale/missing points in `docs/ARCHITECTURE.md` and corrected them directly this cycle; found 2 actionable non-doc findings (rag-service import-linter fence unenforced in CI; dead TS scaffold in apps/stock-price/) and minted both as backlog rows.
**what-considered:**
- ARCHITECTURE.md write: fix directly (architect has read+write SSOT authority per init.md) vs route through PM — fixed directly, since these are factual corrections to architect's own owned doc, not a microservice-doc edit (those stay routed to dev-*, per the doc-ownership rule).
- Finding minting: mint backlog rows directly (precedent: FACTORY-GUARD-CI-SHAREDPKG-IMPL brief did this) vs route everything through PM first — minted directly with `next_agent` set to the correct `dev-*` specialist via zone-detect Tier-1, leaving PM only the promote/dispatch sequencing (not task-breakdown judgment) — matches the cited precedent exactly.
- VPS diagram: the most consequential single finding this cycle — verified against server.ts line-by-line rather than trusting the diagram's data-type-association framing; all 5 VPS services actually push into MCP Server alone (single ingress), not 4 different downstream services as previously drawn.
**why-decision:** Direct ARCHITECTURE.md edits kept in scope because they are pure fact-correction (language/port/topology) with zero domain-judgment risk, unlike the 2 code findings which need a dev-* specialist's actual implementation call. Backlog-row minting (vs a bare brief with no board trace) chosen so the 2 findings are actually pickable by the dev-team idle-chain rather than only living in a brief no scheduled process reads.
**why-change:** No BA/PM step preceded this cycle (direct dispatch) — used the flow's own Step-5 handoff-file convention with a fresh `UC-*` task id since no existing docs/handoffs/ file or task_board row existed for this scope.

### STEP architect-S8 · architect · 2026-08-22T19:05:00Z
**task-id:** UC-DDDFAB-ARCHDOC-XREF (recommendation (a), `docs/architecture-briefs/2026-08-22-agent-fabric-ddd-debug-logger-tool-optimization.md`; routed back to architect by agent-father, who lacks `docs/ARCHITECTURE.md` write authority + spawn capability)
**what-done:** Added 1-line cross-reference in `docs/ARCHITECTURE.md` § DDD Layer Order → `docs/policies/dev-standards.md § DDD Layer Rules`, after confirming both anchors live (ARCHITECTURE.md:5-7 omits `infrastructure/` from the layer chain while asserting the golden rule; dev-standards.md:1662 `## DDD Layer Rules` carries the fuller table incl. `infrastructure/` + the same golden rule).
**what-considered:**
- Cross-reference line vs duplicating the full layer→folder table in ARCHITECTURE.md — router's dispatch explicitly scoped this to a pointer, not a table copy (avoids 2 tables drifting independently).
- Broader ARCHITECTURE.md pass this cycle vs strict 1-line diff — kept to the 1-line diff; a separate broader DDD-risk review (`UC-DDDRISK-P1`, this same session/journal, STEP-S7) already covered the file this cycle, re-litigating would duplicate work.
**why-decision:** Cheapest fix that closes the mini-SSOT gap (chain lists 4 layers, golden rule references a 5th) without creating a second maintained copy of the layer table.
**why-change:** No change from the router's dispatch scope — verified diff is exactly `git diff --stat docs/ARCHITECTURE.md` → 1 insertion, no other lines touched.

### STEP architect-S9 · architect · 2026-08-24T15:55:00Z
**task-id:** UC-MDH-P2
**what-done:** Designed the atomic FR-3/FR-4/FR-6 deploy-gated bundle (exact line ranges in agentMemoryUpdateTools.ts/registry.ts, 3-generator regen chain for tool-registry.json+project-stats.json+tools/list/INDEX.md, system-map.json manual line, 1300b test corrections) + ruled B2 YES (agent-father exclusive lane, evidence-backed).
**what-considered:**
- Verified `scripts/gen-tool-registry.ts`/`gen-project-stats.ts`/`gen-tools-index.sh` are live working generators (not aspirational) — FR-4 needs almost no manual JSON surgery, just re-run order.
- Found BA's 13-consumer FR-5 list conflates instructional docs (safe-now) with structural-inventory docs (must land atomically w/ FR-3). Reclassified `tools/list/append_session_record.md` (orphaned stub, no generator deletes it) + `tools/list/INDEX.md` (GENERATED, hand-editing it during safe-now would violate its own header) from FR-5 → FR-4-extended. FR-5 real safe-now scope = 10 files, not 13.
- BA's FR-6 "delete the 2 test cases" undercounts — live read of the test file found 6 to delete + 2 to surgically edit (both exercise update_memory_file too, deleting outright would drop coverage). Documented exact line ranges.
- B2: verified structurally (agent-father's own commit_zone + create/edit-flow file lists + live dev-standards.md:1987 precedent on the identical file class), not asserted from convention alone.
**why-decision:** Every correction traces to a live file read (generator scripts, agent-father's own flow docs, the test file itself), not to re-trusting BA's counts — matches the flow's "never design without reading" constraint and closes 2 real desync hazards (a still-registered tool's structural inventory going stale early) before PM decomposes.
**why-change:** No change to BA's 7 FRs or their intent — reclassified 2 files' *gate*, corrected 1 FR's *count*, both within FR-4/FR-6's own stated scope, zero new FRs invented.
