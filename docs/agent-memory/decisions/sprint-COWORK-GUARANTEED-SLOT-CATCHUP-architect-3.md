# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · architect

**Sprint goal:** cowork guaranteed-slot catch-up + related supervised-lane FIX rows
**Agent:** architect
**Started:** 2026-08-06T07:01:55Z

---

### STEP architect-S1 · architect · 2026-08-06T07:01:55Z
**task-id:** GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC
**what-done:** Wrote plan-only architecture brief (docs/architecture-briefs/2026-08-06-guard-cowork-notebook-agent-write-boundary.md) for the recurring cowork-agent self-edit-flow-doc class.
**what-considered:**
- Strip Edit/Write from the 7 agents — rejected, already false-premised by PO's own row note (breaks docs/signals/*.json routing, ~207 committed files by design).
- Patch each of the 15 flow-file call sites individually — rejected, violates always_extend_not_duplicate; traced root cause to ONE shared skill (cowork-end-cycle → doc-self-heal) with zero boundary awareness.
- New bespoke boundary-config file vs extending docs/data/system-map.json .project.agents[] — chose extend (CLAUDE.md names it the structural-data SSOT; agents[] entries already exist).
- New heavy improvement_proposal-style PO-critique lane for doc-fix-proposal vs a light single-verify lane — chose light (factual/schema-typo class doesn't need 5-field critique + LANE-A/B/C; reuses edit.md apply engine as-is).
**why-decision:** Root-caused via grep (cowork-end-cycle Step 3 → doc-self-heal, loaded by all 7 at 15 sites incl. the exact incident's own "Doc self-heal" self-report string) rather than treating 4 instances as 4 separate agent bugs — fixes the single control point instead of the symptom sites. Mechanism (PreToolUse hook keyed on the verified Claude Code agent_type hook field, confirmed by reading the installed CLI's own Zod schema, not assumed) makes the boundary real per the row's explicit ask ("mechanism, not prose"); doc-self-heal's new Step 0 gives the redirected agent something to DO instead of a dead end, closing item 3 in the same design.
**why-change:** No change from plan; PLAN-ONLY scope honored throughout — no code/config shipped, brief + board update + signal only.

### STEP architect-S2 · architect · 2026-08-06T07:36:18Z
**task-id:** FIX-DEVTEAM-PIPELINE-RESUME-TERMINAL-LANE-BLIND
**what-done:** Designed 2 in-place edits to main.md Step 0b (WF-1 task_status source-array widen + new WF-1b terminal-lane self-heal branch; WF-2 row-lookup widen as defense-in-depth) + a new synthetic-fixture regression verifier spec; wrote full design into the row's `architect_review_note`, set `next_agent=developer`, moved `backlog[]→ready[]` for RLC pickup.
**what-considered:**
- Widen WF-1's task_status source lanes only (no new branch) — rejected: "DONE" still != "BLOCKED" so the existing `if` never fires; the S2 spawn still happens. Only an explicit new branch that JUMPs away satisfies AC-2.
- Patch WF-2's should_hold alone to add done[]/done_verified[] — rejected as the SOLE fix: a non-supervised terminal row already yields should_hold=false today and would STILL fall through to S2; kept only as literal-AC-1 defense-in-depth, documented as provably unreachable once WF-1b lands.
- Reuse `is_terminal_task_status`/`normalize_task_status` (scripts/lib/devteam-eligibility.jq, already backing wip_in_progress + wrapper-autoclose) vs. a fresh literal DONE/DONE_VERIFIED check — chose reuse (always_extend_not_duplicate).
**why-decision:** Traced the exact control-flow reason should_hold-only or lane-widen-only fixes silently fail to prevent the S2 spawn (neither JUMPs away); WF-1b mirrors the BLOCKED carve-out's proven shape (idle-reset + JUMP TO drain-signals) minus its lane-move, since a terminal row is already correctly lane-placed by the closing specialist (INV-GATEWAY-1 — it just can't write `.head`).
**why-change:** Found the row's stated duplicate-mint already self-resolved by po (`po_dedup_fold_20260806T0726`) before this pass started — no dedup work needed, verified live via jq/python before writing (file had been concurrently edited since first read).

### STEP architect-S3 · architect · 2026-08-06T08:20:00Z
**task-id:** FIX-VNINDEX-CROSS-PLANE-PLAUSIBILITY-GATE
**what-done:** Ratified BA's FR-1 target (vn_index_cache/market_prices.VNINDEX) but with a load-bearing correction: read the actual Go adapter (`repositories_market_index.go`, BA never opened it) — macro-indicators' own tier-1 PRIMARY query reads `market_prices.VNINDEX` directly off the SAME physical SQLite file, so on the tier-1 path this is not a second plane, it's the same row twice. Designed `evaluateVnIndexPlausibility()` (new domain guard) + exact `macroTools.ts` wiring (single mutation point before both `text` render and raw `data` passthrough) + EC-1's fail-open/fail-closed branches. Appended full design to `docs/handoffs/FIX-VNINDEX-CROSS-PLANE-PLAUSIBILITY-GATE-BA-spec.md`; moved board row `backlog[]→ready[]`, `next_agent=dev-mcp-server`; annotated sibling `FIX-VNINDEX-ESTIMATE-IMPLAUSIBLE-DELTA-GATE` with a fold-forward pointer (not closed — fold happens on completion per BA §7).
**what-considered:**
- market_prices raw query (BA's literal wording) vs the existing typed `getVnIndexCache()` reader — chose the reader (already typed, already carries `fetched_at`, avoids a 2nd ad-hoc query; same underlying write event either way, verified via `vnIndexRefreshJob.ts`).
- New "≤10 min" staleness constant (BA's EC-1 wording) vs reusing `freshnessSlaChecker.ts`'s existing `signalType:"price"` SLA — chose reuse: it's already market-hours-aware (EC-2's requirement satisfied for free, no weekend/holiday false-staleness) and avoids a duplicate hardcoded threshold.
- Whether to overclaim FR-2's "tier-1 misreport" defense — traced it precisely: catches the fixture-fallback incident class + tier-mislabeling, does NOT catch a corrupted-but-honestly-tier1-reported value (same physical row both sides) — documented the limit explicitly rather than let a stronger-than-true guarantee ship in a code comment.
- Route `next_agent` to `pm` vs directly to `dev-mcp-server` via `ready[]` — chose direct-to-dev-mcp-server (design is fully atomic: 1 zone, 2 new files + 1 wired file, exact insertion point + field-level gap-token spec already given), matching the S2 precedent (RLC picks up an architect-resolved ready[] row, no PM decomposition needed).
**why-decision:** Brownfield-first: read `repositories_market_index.go` before ratifying BA's "genuinely independent write path" claim — it wasn't, on the tier-1 path — and that correction changes what the shipped code-comment is allowed to claim. Self-caught a live jq comma-in-`|=`-RHS bug on the first orch-apply attempt (multi-field update silently dropped all but the first clause) — verified via read-back before treating the write as done, then re-applied correctly with `+` merge.
**why-change:** No change to the durable AC (Part 2 / FR-1 cross-plane gate) — refinement is entirely in the documented scope-of-defense and the reuse choices, not the requirement itself.

### STEP architect-S4 · architect · 2026-08-06T09:03:00Z
**task-id:** FU-RAG-DEPLOY-MEMORY
**what-done:** First confirmed OOMKill on rag-service (router RAW-verified docker events). Designed the sizing remediation: raise docker-compose.yml memory limit 768m→1g / reservation 256m→512m, plus a structural idle-unload timer for the embedder singleton (no unload path existed).
**what-considered:**
- Verify actual host/VM headroom before recommending a number, rather than trusting the "16GB host" framing on the row — live `docker info`/`free -h` inside the VM shows Docker Desktop is capped at 8192MiB (7.75GiB), not 16GB; sum of all container limits is already ~12.25GiB (1.58x over-commit) against ~2.74GiB actual usage.
- Cap-raise only vs cap-raise + idle-unload — chose both: the raise closes today's crash, but the corpus grows unboundedly and the embedder has no release path, so a bigger cap just re-fails later at a higher number.
- New idle-unload machinery vs some other footprint reduction (smaller model, quantization) — idle-unload is symmetric to the EXISTING lazy-load pattern (GFD-13) already proven safe in this exact file, lowest-risk structural option.
**why-decision:** Host macOS swap is separately at 86% (sysctl vm.swapusage) — flagged as an independent, pre-existing risk, but a container memory LIMIT is a ceiling not a reservation, so raising it does not itself add host pressure unless usage grows into it; verified this distinction live before recommending the number.
**why-change:** no change from plan — PO explicitly framed the choice as "raise cap, reduce footprint, or both"; this delivers both rather than picking one.

### STEP architect-S5 · architect · 2026-08-06T09:03:00Z
**task-id:** FIX-SYSTEM-AUDITOR-CYCLE-FINDINGS-NOT-SELF-PERSISTED
**what-done:** Tested PO's background-vs-foreground discriminator (consistent with, not provable from repo evidence alone) and found independent, non-self-report proof of the failure class: 6 orphaned empty `.auditor-cycle-markers-<TICK>.tmp` scratch files (3 known Tier-2 ticks + 3 NEW Tier-1 ticks from 2026-08-05, previously unflagged) — each one mechanical evidence a cycle won its fire-election and died before its own final cleanup line, with zero matching notebook sections. Designed a plan_only fix: Step 0b stale-marker/stale-draft sweep (external detectability within one tick) + reorder notebook-write earlier + durable scratch-draft-then-compose (self-heals via deterministic script/skill logic, not model reconstruction).
**what-considered:**
- Trust the discriminator as given vs go find independent evidence — went looking, found the 6 orphaned markers were an EVEN STRONGER, mechanically-provable signal than the discriminator itself.
- Fix only the notebook-write step vs treat it as a whole-cycle durability gap — the empty (zero-marker) content of all 6 orphans shows death happens very early, before any anomaly emission, so scoping the fix to "the write step specifically" would under-diagnose it.
- Add more instructions/emphasis to the flow doc vs convert to a checked, self-healing mechanism — chose the latter, matching this codebase's own established precedent (`auditor-notebook-commit.sh`'s header: narrated sequences for hard invariants cannot be trusted).
**why-decision:** The false-peer-citation symptom PO flagged (citing an unrelated session's c44 as its own) is the signature of a model reconstructing lost content from memory near the end of a long turn — the fix must make reconstruction unnecessary (durable draft persisted at composition time), not just detect the loss after the fact.
**why-change:** no change from plan — plan_only preserved per router's instruction; moved BACKLOG→READY (design complete) with next_agent=pm since the fix spans a flow doc + a shared skill, not a single atomic file.

### STEP architect-S6 · architect · 2026-08-06T09:03:00Z
**task-id:** FIX-CHEF-PUBLISHED-MARKER-RELEASE
**what-done:** Corrected the row's own premise (grep found zero live `task_release` call sites on any `published:*` key — the 08-06 release was a manual PO action on a content judgment, not an automated "chef.md cleanup"). Designed unified with sibling FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR per PO's "one lifecycle, one design" ruling: Component A propagates `scheduled_utc_time` (already computed by `cowork-catchup-predicate.js`, unconsumed) into `spawn-fanout.md`'s trigger_prompt for BOTH live and catch-up fires so retries can never re-derive a different key; Component B adds a mechanical Published Marker Release Gate (delivery-evidence check) before any future release, human or automated.
**what-considered:**
- Redesign TASK-COWORK-CATCHUP-3's dispatcher wiring from scratch vs reuse it — reused; it's already READY/developer-owned with a full handoff, my gap-find was that it only covers the catch-up path, not live matches, which I closed by extending `cowork-match-slots.js` symmetrically instead of duplicating logic.
- Silently correct the row's premise vs state it plainly on the board — stated it plainly; the row's title otherwise misdirects an implementer toward deleting code that doesn't exist.
- Flip FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR's own status/next_agent since I designed its content too vs leave it untouched — left it untouched (out of this cycle's assigned scope), added an additive cross-reference field only so PM/developer don't re-derive the same mechanism twice.
**why-decision:** The 08-06 incident showed a release performed on a content judgment ("wrong dish on this slot") where a delivery check would have refused it — Component B targets exactly that gap, not a hypothetical automated-release code path that no longer exists.
**why-change:** no change from plan — BACKLOG→READY, next_agent=pm (multi-file, multi-zone fix needs decomposition), blocked_by cleared (PO's own note already ruled it unblocked this cycle).
