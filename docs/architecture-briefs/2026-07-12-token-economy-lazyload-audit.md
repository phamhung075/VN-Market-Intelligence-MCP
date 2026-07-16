<!-- size-justification: cold reference brief (audit deliverable, 2026-07-12) — never loaded by any flow or cron; read on demand by user/PO. Line count exempt from hot-path governance. -->
# Token-Economy Audit — Lazy-Load & Main-Flow/Subflow Proposals

**Date:** 2026-07-12 · **Origin:** ultracode 7-auditor parallel workflow (dimensions: hot-path-router, cowork-flows, devteam-flows, tools-docs, skills-hygiene, recurring-io, flow-architecture) · **Raw findings:** 54 → **33 merged proposals** · **Synthesis:** router session

## How to read this

- **Cost model:** ~12 tokens/line; recurring cost = file size × fire cadence. Cadences taken from cowork-schedule.json, cron-* skills, and git-log activity.
- **Stacking caveat:** some savings overlap (flagged per entry). T-01 gating reduces the marginal value of T-03/T-13 on the same files. Gross sum of all estimates ≈ 1.5-1.8M tokens/day; **honest net after overlap discount ≈ 800k-1.2M tokens/day**.
- **Priorities:** P1 = big recurring saving + low risk. Effort: S = single-session mechanical edit, M = needs a dev-team task with QA gate.
- The completeness-critic pass was killed by a session rate limit; its highest-value check (do any scripts hard-reference the files proposed for split?) was re-run by the router: **grep over `scripts/` + launchd plists found pointer-comments only — no line-offset parsing into any flow/SKILL file. All proposed splits verified safe.** `scripts/agents-flow/cowork-tick-preflight.sh` (T-01 dependency) exists with tests.

## Executive summary — where the tokens go

Three structural patterns account for most of the waste:

1. **No prompt-level gating on high-cadence crons** — the */15 cowork dispatcher and hourly dev-team tick load their full flow files on every fire, though ~80% of ticks conclude "nothing to do." The WU-2 script-first pattern (shipped for dev-team's preflight, never applied to cowork) fixes this at the cron-prompt level. (T-01, T-02, T-03, T-07)
2. **Hard gates are not file boundaries** — flows carry their entire post-gate body (dish recipes, tier sweeps, weekend/daily modes, ERROR fallbacks) inline, so silent/short-circuit fires pay for unreachable text. (T-06, T-16, T-26; template fix T-25)
3. **Shipped token-economy infrastructure with zero adoption** — step-0-cowork composite (built to replace 3 skill reads: 0 adopters), jump-to anchors (5/~150 flows), handoff-delta-read (3 agents). The savings were already designed; they were never wired in. (T-11, T-19, T-20)

Plus two hygiene classes: **reference/history text on hot paths** (po's 54KB script catalog, size-justification changelogs, dispatch-claim's 260L of shipped-sprint history) and **duplicated boilerplate** (tools packages, session-presence protocol ×4).

### Quick-win shortlist (all P1/S — mechanical, single-session each)

| ID | Change | Est. saving/day |
|----|--------|-----------------|
| T-01 | Cowork cron prompt → preflight-script-first (prompt edit + /cron-cowork-team re-arm) | ~300k |
| T-04 | Strip Example-Invocation tails, 6 cowork tool packages | ~150k |
| T-09 | Extract po main.md 54KB script registry | ~77-135k |
| T-07 | Split cron-detect-loop guard card / register bodies | ~85-93k |
| T-08 | commit-mutex → 60L card | ~60-90k |
| T-10 | Dedup tools-package boilerplate | ~65-70k |
| T-11 | Wire step-0-cowork into 11 flows | ~55-160k |
| T-13 | Purge size-justification changelogs | ~30-60k |

### Suggested execution order

1. **Wave 1 (prompt gating + pure extractions, zero logic change):** T-01, T-09, T-07, T-04, T-10, T-13 — ≈ 700k tok/day, all S-effort.
2. **Wave 2 (skill cards + adoption sweeps):** T-08, T-11, T-12, T-14, T-17, T-21, T-23 — needs agent-md-factory discipline per edit.
3. **Wave 3 (flow splits, M-effort, QA-gated):** T-02, T-03, T-05, T-06, T-16, T-26.
4. **Wave 4 (governance so it never regrows):** T-24 (byte cap), T-25 (flow template), T-20 (anchors), T-15 (orch-state eviction — highest risk, do last, orch-apply.sh only).

---

## P1 — Do first (big recurring saving, low risk)

### T-01 — Cowork master dispatcher: apply WU-2 script-first prompt gating (skip main.md on silent ticks)

**Priority:** P1 · **Effort:** S · **Est. saving:** ~300k tok/day

**Files:** `.claude/skills/cron-cowork-team/SKILL.md`, `docs/agents/cowork-team/flow/main.md`

**Problem.** The cowork master cron prompt is still 'run docs/agents/cowork-team/flow/main.md' (SKILL.md line 53), so every 15-min tick loads the full 15,916-byte main.md before the deterministic preflight script even runs. Dev-team got the fix (WU-2: script runs in the cron prompt, main.md read only on RUN/ERROR verdict) but the identical WU-1 change for cowork stopped inside main.md — the prompt was explicitly left unchanged.

**Evidence.** cron-cowork-team/SKILL.md lines 108-112: 'the CronCreate prompt: text below is UNCHANGED — it still just points at docs/agents/cowork-team/flow/main.md'. main.md Step 0 (lines 47-95) states '~80% of ticks are silent off-hours/no-due-work'. Contrast with cron-detect-loop/SKILL.md line 90 (dev-team Job 1 prompt): 'run bash scripts/agents-flow/dev-team-tick-preflight.sh ... On verdict=SKIP: done, no further reads needed.' Cadence: */15 = 96 ticks/day; main.md = 15,916 bytes ≈ 4.0k tokens.

**Proposal.** Edit the CronCreate prompt in .claude/skills/cron-cowork-team/SKILL.md to mirror dev-team Job 1: 'Run bash scripts/agents-flow/cowork-tick-preflight.sh and read its one-line JSON verdict. On SILENT/LOST_ELECTION/DEFER: done, no further reads. On WORK: read docs/agents/cowork-team/flow/main.md starting at § WORK continuation. On ERROR: read main.md from the top (Step 0a fallback body).' The script already handles presence, election, one-shot claims, blind-guard, and slot matching (main.md § WORK continuation, lines 78-95) — zero flow-logic change, prompt-only edit, then /cron-cowork-team re-arm.

**Savings math (canonical auditor).** ~80% of 96 ticks/day are SILENT per main.md's own note ≈ 77 ticks × 4.0k tokens (main.md read replaced by one bash call + short verdict) ≈ 300k tokens/day.

**Merge note.** Found independently by 3 auditors. scripts/agents-flow/cowork-tick-preflight.sh EXISTS with tests (router-verified 2026-07-12) — prompt-only change.

**Corroborating findings (merged duplicates):**
- *cowork-team master cron prompt loads 16KB flow file on every */15 tick — WU-2 script-first pattern not applied* — main.md = 15,916 bytes ≈ 4.0k tokens/read × 96 ticks/day = ~382k tokens/day today. ~77-80 ticks/day are SILENT/LOST → ~300-310k tokens/day saved. Biggest single recurring saving in the repo; proven pa

---
### T-02 — dev-team main.md (48.5KB, 48 fires/day): extract ERROR-fallback + orphan-adoption rare paths

**Priority:** P1 · **Effort:** M · **Est. saving:** ~200k tok/day

**Files:** `docs/agents/dev-team/flow/main.md`

**Problem.** main.md = 694L / 48,521B (~12.1k tokens) read in full every tick (cron 7,37 * * * * = 48 fires/day, not hourly). Three blocks are read every tick but executed rarely: (a) jump:preflight-fallback lines 107–217 (6,045B) — reached ONLY on ERROR verdict from dev-team-tick-preflight.sh; (b) Step 0a-B orphan-adoption lines 294–413 (6,414B) — full adoption/tree-hygiene/checkpoint pseudocode needed only when the task_list_held probe returns rows; (c) BOUNDED-1 gate prose lines 518–521 (line 518 alone = 2,555 chars) — 4 paragraphs of gate history documenting behavior already implemented inside the two .jq scripts.

**Evidence.** sed byte counts: lines 107-217 = 6,045B; 294-413 = 6,414B; 496-522 = 5,873B. Line 108 states the fallback is 'Reached ONLY on ERROR verdict…(or when this flow is run manually)'. Line 100 RUN verdict says 'Do NOT re-run presence/SF-1/fire-election below'. RUN-IDLE row (line 101) exits without ever touching lines 284-694, yet the whole file was already loaded. The system's own jump-to skill exists precisely to skip unreachable steps, but skipping does not avoid the Read cost — only file-splitting does (pattern already proven by drain-signals.md/execute-tier.md/post-cycle.md extractions).

**Proposal.** (a) Move lines 107–217 verbatim to docs/agents/dev-team/flow/preflight-fallback.md; ERROR row in the verdict table becomes '→ Run sub-flow: preflight-fallback.md, then continue at jump:gcc-preflight'. (b) Keep the 8-line task_list_held probe inline in Step 0a-B; move the per-signal adoption loop (tree-hygiene gate, checkpoint verify, board flip, spawn) to orphan-adoption.md gated by 'if orphan_signals non-empty → Run sub-flow'. (c) Replace lines 518–521 with a 6-line summary (promote/claim one-liners + 'gate semantics documented in the .jq script headers') and move the four gate-history paragraphs into comment headers of scripts/devteam-backlog-promote-bounded1.jq. Preserves the WU-2 'kept verbatim, never deleted' guarantee — content is relocated, not deleted.

**Savings math (canonical auditor).** (6,045+6,414+~4,500 trimmed)B ≈ 4.2k tokens per tick × 48 ticks/day ≈ 200k tokens/day. Fallback/adoption files re-read only on ERROR verdicts or when orphans exist (observed: rare).

---
### T-03 — cowork-team main.md: extract fallback/WORK-continuation source (2/3 of file) into sub-flows

**Priority:** P1 · **Effort:** M · **Est. saving:** ~200k tok/day gross; ~40-60k marginal after T-01 (applies to WORK/ERROR ticks only)

**Files:** `docs/agents/cowork-team/flow/main.md`

**Problem.** The WU-1 preflight script correctly makes SILENT ticks a one-bash-call decision, but the flow file still forces every tick to load 307L/15,916B (~4k tokens) because the FALLBACK BODY (lines 97–307: Step 0a drain, 0b presence+election, 0b.3 one-shot routing) lives inline. On a SILENT/LOST_ELECTION/DEFER verdict (the majority at 96 fires/day) none of it is used. The WORK path needs only Step 0a's drain body and Step 0b.3's routing body; the ERROR path needs everything.

**Evidence.** sed -n '97,307p' | wc -c = 8,410B (~2.1k tokens) of the 15,916B file. Line 51: '~80% of ticks are silent off-hours/no-due-work'. SILENT verdict row (line 65): 'No LLM read of Steps 0a-6 needed. EXIT' — yet the read already happened when the file was opened. WORK continuation (lines 82–86) references 'the real drain-and-route-and-mark-READ body of Step 0a below' and 'the routing body of Step 0b.3 below', i.e. the only inline dependencies are 0a + 0b.3.

**Proposal.** Split lines 97–307 into two sub-flows: (1) docs/agents/cowork-team/flow/work-tick.md = Step 0a drain body + Step 0b.3 routing body (the two bodies § WORK continuation actually calls); (2) docs/agents/cowork-team/flow/preflight-error-fallback.md = full verbatim chain 0a/0b/0b.1/0b.2/0b.3/0c for the ERROR verdict. main.md shrinks to ~95L (~1.6k tokens): header, team boundary, Step 0 preflight, verdict table (SILENT/LOST_ELECTION/DEFER rows unchanged; WORK row → 'Run sub-flow: work-tick.md then continue at pressure-read.md'; ERROR row → 'Run sub-flow: preflight-error-fallback.md'). Also compress the 1,106-char line-1 changelog comment (see separate finding).

**Savings math (canonical auditor).** Current: 96 × ~4k = 384k tokens/day. After: 96 × ~1.6k + ~19 WORK ticks × ~1.2k (work-tick.md) + ~1 ERROR × 2.1k ≈ 179k/day. Net ≈ 200k tokens/day.

**Merge note.** Stacks with T-01: after prompt gating, this thins the read on the ~19 WORK ticks + rare ERROR ticks.

**Corroborating findings (merged duplicates):**
- *cowork-team master dispatcher (96 ticks/day): ~150L of ERROR-fallback inline pseudocode read every tick but executed alm* — ~150L × 12 tok × 96 ticks/day ≈ 172k tokens/day potential (fallback path loads only on preflight script error, historically rare). Conservative with prompt-cache discount: ≥80k/day.

---
### T-04 — tools/package/*: strip 100-170L 'Example Invocation' tails from the 6 high-cadence cowork packages

**Priority:** P1 · **Effort:** S · **Est. saving:** ~150k tok/weekday

**Files:** `docs/agents/tools/package/market-watcher.md`, `docs/agents/tools/package/news-scout.md`, `docs/agents/tools/package/alert-commander.md`, `docs/agents/tools/package/unified-agent.md`, `docs/agents/tools/package/qa-responder.md`, `docs/agents/tools/package/digest-predict.md`

**Problem.** Every cron fire spawns a fresh subagent that loads its full tool package (flow header '**Tools:** docs/agents/tools/package/<agent>.md' + cycle-bootstrap skill 'Read your package file first'). 40-55% of each big package is a '## Example Invocation' section of verbose TypeScript pseudo-code that duplicates the per-tool Example sections already lazy-loadable in docs/agents/tools/list/<tool>.md — and the package copies have drifted into being WRONG: market-watcher's get_price_history example (L158-163) passes `tickers: ["VCB","ACB","FPT"]` while the package's own tool table (L36) and list/get_price_history.md both say the param is `code: string` (singular). Agents pay ~1.3-2k tokens per cycle to load stale examples that can teach an invalid call shape.

**Evidence.** Section spans measured: market-watcher.md 290L, Example section L137-270 = 134L (fires 36x/weekday: crons `7 2-8 * * 1-5` + `12,27,42,57 2-8 * * 1-5` + `3 16 * * 1-5` in .claude/commands/crons/cron-market-watcher.md, all three run main.md which loads the package). news-scout.md 249L, Example L125-229 = 105L (fires ~34x/day: `12,27,42,57 2-8 * * 1-5` + `17 */4 * * *`). alert-commander.md 211L, Example L117-190 = 74L (cowork-schedule.json: `*/15 2-8 * * 1-5` + `0 */4 * * *` = ~34/day). unified-agent.md 287L, Example L152-267 = 116L (~10 slots/day in cowork-schedule.json, up to 24/day if `29 * * * *` cron live). qa-responder.md 317L, Example L127-296 = 170L (~2/day). digest-predict.md 349L, Example L164-328 = 165L (~2/day). Every package already prints the lazy path at L22: 'For detailed parameters and return signatures: docs/agents/tools/list/<tool_name>.md', and each list/ file has its own Example block — the package examples are a pure second copy. Drift proof: get_price_history `tickers` vs `code` mismatch above.

**Proposal.** Delete the entire '## Example Invocation' section from each of the 6 files, keeping: header + grammar pointer, the tool tables ('## Tools — <agent>' with Key Params columns — the anti-discovery-mandated minimum per the 2026-05-19 brief), Signal Types, Channel Permissions, Task-Lock table, Related Documentation. Add one line where the section was: 'Per-tool params + worked example → docs/agents/tools/list/<tool_name>.md (lazy-load only when calling an unfamiliar tool)'. The 'Opening Sequence (Required)' sub-block is already SSOT'd in .claude/skills/cycle-bootstrap + step-0-cowork — pointer covers it. Result sizes: market-watcher 290→~155L, news-scout 249→~145L, alert-commander 211→~135L, unified-agent 287→~170L, qa-responder 317→~145L, digest-predict 349→~185L. No behavior change — cowork agents keep the full pre-documented tool table (no-runtime-discovery constraint intact).

**Savings math (canonical auditor).** ~150k tokens/weekday. Math at ~12 tok/L: mw 134L*12*36=58k + ns 105L*12*34=43k + ac 74L*12*34=30k + ua 116L*12*10=14k + qa-r 170L*12*2=4k + dp 165L*12*2=4k ≈ 153k/day (weekday; ~60k on weekends).

---
### T-05 — cowork-end-cycle waterfall: merge 6-file/385L end-of-cycle skill chain into one composite

**Priority:** P1 · **Effort:** M · **Est. saving:** ~130-165k tok/day

**Files:** `.claude/skills/cowork-end-cycle/SKILL.md`, `.claude/skills/session-log-cowork/SKILL.md`, `.claude/skills/notebook-write/SKILL.md`, `.claude/skills/self-critique/SKILL.md`, `.claude/skills/doc-self-heal/SKILL.md`, `.claude/skills/decision-journal/SKILL.md`

**Problem.** cowork-end-cycle (16L) is a pure dispatcher that triggers 5 more skill reads every cycle end: decision-journal 77L + session-log-cowork 33L + notebook-write 94L + doc-self-heal 47L + self-critique 118L = 385L across 6 Read calls, in 30 flow files. Worse, session-log-cowork and notebook-write both target docs/agent-memory/notebooks/<agent-id>.md (market-watcher/init.md: session_log and notebook are the SAME path) — two sequential skills, two git commits' worth of instructions, one file. session-log-cowork is referenced by ZERO flow files directly — it exists only as a cowork-end-cycle sub-read.

**Evidence.** cowork-end-cycle/SKILL.md lines 12-16 list the 5 sub-skill reads. grep 'session-log-cowork' over docs/agents = 0 hits (alive only via cowork-end-cycle). grep 'cowork-end-cycle' = 30 flow files. session-log-cowork appends '## Cycle — HH:MM' + commits notebook; notebook-write section-overwrites + prunes the same notebook — duplicated write+commit choreography.

**Proposal.** Build a composite end-0-cowork skill mirroring the ratified step-0-cowork precedent: single ~110L file inlining (a) decision-journal flush condensed, (b) merged notebook append+prune+commit (fold session-log-cowork INTO notebook-write's section pattern — one write, one commit), (c) doc-self-heal condensed checklist, (d) self-critique TRIGGER CHECK only, with full self-critique/SKILL.md lazy-loaded only when a trigger fires (most cycles: no trigger). Keep notebook-write and doc-self-heal standalone for dev-team flows that reference them directly; delete session-log-cowork after fold (0 direct refs to repoint).

**Savings math (canonical auditor).** ~275L + 5 fewer Reads ≈ 3,300 tok/cycle x ~50 completing cycles/day ≈ 130-165k tokens/day.

**Merge note.** Members: cowork-boundary vs cowork-error-boundary overlap dedup; delete DEPRECATED append-session-record skill (zero references).

**Corroborating findings (merged duplicates):**
- *cowork-boundary vs cowork-error-boundary — two overlapping boundary files both loaded every cowork cycle* — ~15-25L dedup + 1 Read (~100 tok overhead) per cycle ≈ 350 tok x ~65 cycles/day ≈ 20k tokens/day; main win is SSOT (boundary-rule drift eliminated).
- *Dead skill: append-session-record (DEPRECATED) — zero flow references, still on disk and in the skill catalog* — ~30-40 catalog tokens per session spawn x every agent/cron session/day (dozens) ≈ 1-3k tokens/day, plus removes a mis-trigger hazard. Near-zero risk.

---
### T-06 — system-auditor main.md: split Tier-2/Tier-3 bodies into sub-flows (already PO-prescribed, stalled)

**Priority:** P1 · **Effort:** M · **Est. saving:** ~40-110k tok/day (two independent cadence estimates)

**Files:** `docs/agents/system-auditor/flow/main.md`, `docs/agents/system-auditor/flow/tier1-probe.md`

**Problem.** 787L file is read in full by every spawned auditor, but tier dispatch (L74-76) means each spawn takes exactly one branch. Tier-1 spawns (highest cadence) never execute the Tier-2 Freshness Sweep (L153-435, 283L), the Doc/Memory Audit (L438-491, 54L), or the Tier-3 DB Integrity section (L495-655, 161L) — ~500L dead per Tier-1 read. The Emit Sequence (E-1/E-2/E-3 + POST-WRITE READ-BACK) is duplicated verbatim at L292-328 and L593-628 (~72L). File header itself admits: 'Full split to <120L requires Tier-2/Tier-3 extraction sprint — deferred per PO.'

**Evidence.** Cadence from .claude/skills/cron-detect-loop/SKILL.md L46-48: Tier-1 */30 (48 ticks/day, SKIP-SPAWN heartbeat gate ≤60min → realistic ~16-24 full spawns/day), Tier-2 0 */4 (up to 6/day), Tier-3 daily. Tier-1 already lazy-points to tier1-probe.md (L146) proving the sub-flow pattern works here; Tier-2/Tier-3 were never extracted. Zero <!-- jump: --> anchors despite the top dispatch table (jump-to SKILL mandates them for dispatch-table flows).

**Proposal.** main.md → ≤170L dispatcher keeping: AUD-ND-1 invariant, Steps 0a-0d (root/notebook/system-map/fire-election), Tier Dispatch converted to jump-to/`Run sub-flow:` rows, Notebook Append Gate + blessed-script commit + RETURN. Extract L153-435 → flow/tier2-freshness.md and L438-655 → flow/tier3-integrity.md (doc-audit + C-01..C-16). Extract the duplicated emit block → flow/emit-sequence.md referenced from both tier files and tier1-probe.md.

**Savings math (canonical auditor).** Tier-1: ~500L removed × 12 tok × ~16 spawns/day ≈ 96k tokens/day. Tier-2: Tier-3 section+doc-audit ~215L × 12 × 6 ≈ 15k/day. Total ≈ 110k tokens/day.

**Merge note.** Found by 2 auditors; extraction pattern already proven by shipped tier1-probe.md.

**Corroborating findings (merged duplicates):**
- *system-auditor: 787L/53KB three-tier monolith — every tier spawn reads both other tiers; split already prescribed and st* — Tier-2 spawn drops 13.3k → ~6.5k tokens (main 150L + tier2 285L): -6.8k × ~5 spawns/day = 34k; Tier-3 -6.9k × 1/day; Tier-1 failures -11k each. ≈ 40k tokens/day.

---
### T-07 — cron-detect-loop SKILL: split 25L idempotency guard card from ~160L registration bodies

**Priority:** P1 · **Effort:** S · **Est. saving:** ~85-93k tok/day

**Files:** `.claude/skills/cron-detect-loop/SKILL.md`

**Problem.** The operational Job-1 cron prompt (SKILL.md L90) says 'Self-arm FIRST (idempotent): read and execute .claude/skills/cron-detect-loop/SKILL.md' on every dev-team tick, RUN and SKIP alike — 48 fires/day at 7,37 * * * *. The common path (all 4 crons already registered) needs only the Step-1 idempotency checklist (L38-53, ~16L); the other ~180L (four CronCreate prompt bodies L72-146, divergence commentary L14-68, P3 retirement notes L170-196) are only needed when a cron is actually missing, i.e. once per session restart.

**Evidence.** SKILL.md L90 Job-1 prompt text confirms per-tick full read: 'Self-arm FIRST... read and execute .claude/skills/cron-detect-loop/SKILL.md... Then run: bash scripts/agents-flow/dev-team-tick-preflight.sh'. Cadence 7,37 * * * * = 48/day (L88). Adoption gap already on record: docs/signals/processed/context-bloat--claude-skills-cron-detect-loop-SKILL-md-2026-07-04T081320Z.json flagged the file at 203L on 2026-07-04 (routed-to-po); it was trimmed to 196L to duck the 200L cap instead of being structurally split — per-tick read cost unchanged.

**Proposal.** Split: keep SKILL.md as a ~35L card = frontmatter + Step 1 idempotency guard (CronList + 4-entry checklist) + 'ALL 4 found -> STOP, no-op' + pointer 'any entry missing -> read ./register.md and execute only the missing Job blocks' + Step 3 verify. Move Job 1-4 CronCreate bodies, the WU-2/WU-3 divergence commentary, and the P3-OBSERVE-ONLY-RETIREMENT section (~160L) to .claude/skills/cron-detect-loop/register.md. No cron-prompt change needed — the registered prompt already points at SKILL.md, which now costs 35L on the 46-48 no-op ticks/day and lazy-loads register.md only on session restart (~1-2x/day).

**Savings math (canonical auditor).** ~161L removed from the per-tick read x 12 tok/L = ~1,930 tokens/tick x 48 ticks/day = ~93k tokens/day

**Merge note.** Found by 2 auditors. Prior ctx-bloat signal (2026-07-04) was ducked by trimming 203L→196L instead of structural split.

**Corroborating findings (merged duplicates):**
- *cron-detect-loop full 196L re-read on every dev-team tick — hot path is the 25L idempotency guard* — ~150L x 12 tok = ~1,800 tok saved per no-op tick x 47 ticks/day ≈ 85-98k tokens/day.

---
### T-08 — commit-mutex SKILL: invert to ~60L card (its own Quick Reference already proves sufficiency)

**Priority:** P1 · **Effort:** S · **Est. saving:** ~60-90k tok/day (29 flow files reference it; 30-50 mutex commits/day)

**Files:** `.claude/skills/commit-mutex/SKILL.md`

**Problem.** 29 flow files route their commit step through '→ skill: commit-mutex/SKILL.md' (alert-commander, unified-agent x4, bctc-analyst, dev-team post-cycle, po, system-auditor, code-janitor...). Every such commit loads all 235L, yet the file's own closing section (lines 214-235) is a 21-line condensed copy of the ENTIRE protocol — direct proof the happy path fits in ~21L. The 6-row backoff table, jitter formula, 24-line push/rebase-retry bash, No-Heartbeat rationale, and TTL rationale are contention/failure-path content, needed in a minority of commits. The line-1 size-justification claims 'split would break protocol documentation contract' but the in-file Quick Reference already IS the split.

**Evidence.** grep -rln 'commit-mutex/SKILL' docs/agents = 29 files. Lines 64-90 backoff table + jitter (contended path only), lines 122-149 push rebase-retry bash (push-failure path only), lines 192-210 rationale prose (never executed). Lines 214-235 'Quick Reference (copy-paste block for flow wiring)' restates steps 1-7 in 21L.

**Proposal.** Invert the file: SKILL.md keeps header + INV-GATEWAY-1 note + Purpose + the current Quick Reference expanded to ~70L hot protocol (acquire with C-2/C-2b fail-closed rules, critical section 3a-3e happy path, release) + two lazy pointers: 'claimed=false with holder → read ./references/backoff.md' and 'push non-fast-forward or foreign-path found → read ./references/failure-paths.md'. Move backoff table/jitter, rebase-retry bash, No-Heartbeat + TTL rationale there (~140L). Update the size-justification comment per agent-md-factory discipline.

**Savings math (canonical auditor).** ~150L x 12 tok ≈ 1,800 tok per commit x ~50 mutex-guarded commits/day ≈ 90k tokens/day.

**Merge note.** Found by 2 auditors. All gates (C-2/C-2b, fail-closed) stay verbatim on the hot card; only backoff table/bash/rationale lazy-load.

**Corroborating findings (merged duplicates):**
- *commit-mutex 235L read at every mutex-guarded commit — its own Quick Reference proves a ~60L card suffices* — ~175L avoided per commit step x 12 tok/L = ~2.1k tokens/commit x ~30 mutex commits/day = ~63k tokens/day

---
### T-09 — po/flow/main.md: extract 54KB inline 'Reusable triage scripts' registry (78% of file bytes)

**Priority:** P1 · **Effort:** S · **Est. saving:** ~77-135k tok/day

**Files:** `docs/agents/po/flow/main.md`

**Problem.** po/main.md looks like 274 lines but is 69,513 bytes (~17.4k tokens) because the 'Reusable triage scripts' section (line 225 to EOF) packs ~53,990 chars into 50 mega-lines — full per-script harness descriptions, origin stories, and usage strings for a dozen one-shot jq scripts (po-s50…po-s133). Every PO spawn (dev-team Step 1 triage, router decision escalations) pays ~13.5k tokens for a catalog it consults only when authoring a NEW triage script.

**Evidence.** awk '/Reusable/,0' po/flow/main.md = 50 lines / 53,990 chars ≈ 78% of the file's bytes. Single entries run ~2,400 chars each (e.g. line 232 po-s60, line 234 po-s62). dev-team/flow/main.md references spawning po 8 times; PO fires an estimated 4-10x/day off the :07/:37 dev-team cron plus router escalations.

**Proposal.** Move the entire registry to docs/agents/po/flow/scripts-registry.md. Replace in main.md with 3 lines: the ALL-writes-via-orch-apply.sh rule (keep — load-bearing) + pointer 'Reusable triage script catalog → ./scripts-registry.md (load ONLY when minting a new triage script — check for an existing reusable pattern first)'. This matches the existing lazy-load-trigger convention already used for xlsx/docx pointers in the same flows.

**Savings math (canonical auditor).** ~13.5k tokens per PO spawn × ~6 spawns/day ≈ 80k tokens/day.

**Merge note.** Found independently by 3 auditors. Member T-09b: also collapse the 80L PUSH-BACKSTOP never-fires step to a pointer (finding 4, +9-17k/day).

**Corroborating findings (merged duplicates):**
- *po/flow/main.md hides a 54KB one-shot jq-script catalog in 45 mega-lines — extract to lazy-loaded catalog file* — ~13.5k tokens per PO spawn. At a conservative 5–10 PO triage spawns/day (non-idle dev-team ticks): 67k–135k tokens/day. Catalog itself is read maybe 1x/week when a new script is authored (+13.5k that 
- *PO flow main.md is 78% inline jq-script catalog (54KB, 37 entries) read at every PO spawn* — 54KB ≈ 13.5k tokens/read → retained index ≈ 0.6k tokens. ~6 PO spawns/day → ~77k tokens/day saved. Zero behavioral risk: catalog is reference history, invocation rule stays in main.md.
- *po PUSH-BACKSTOP: 80 lines (7.7KB) of a step the file itself says never fires — collapse to pointer* — ~1.7k tokens per PO spawn × 5–10 spawns/day ≈ 9–17k tokens/day (stacks with the catalog extraction: together po main.md drops from ~17.4k to ~2k tokens).

---
### T-10 — tools/package/*: dedup 47L identical 'How to Invoke' + 'log_agent_work Two-Call Recipe' boilerplate

**Priority:** P1 · **Effort:** S · **Est. saving:** ~65-70k tok/weekday

**Files:** `docs/agents/tools/package/market-watcher.md`, `docs/agents/tools/package/news-scout.md`, `docs/agents/tools/package/alert-commander.md`, `docs/agents/tools/package/unified-agent.md`, `docs/agents/tools/package/digest-predict.md`, `docs/agents/tools/package/qa-responder.md`, `docs/agents/tools/package/bctc-analyst.md`, `docs/agents/tools/package/tran-ngoc-bau.md`, `docs/agents/tools/package/fb-market-poster.md`, `docs/agents/tools/package/po.md`, `docs/agents/tools/package/market-analyst.md`, `docs/agents/agent-father/flow/scaffold-files.md`

**Problem.** Two blocks are byte-identical (modulo agent name) across 11 packages and both duplicate an SSOT that is already in the agent's context or one lazy hop away: (a) '## How to Invoke Tools' (L7-23, 17L) restates the exact call_tool grammar that project CLAUDE.md § 'MCP Tools — call_tool wrapper ONLY' injects into EVERY agent's context automatically; (b) '#### log_agent_work — Two-Call Recipe' (~30L each) — verified that docs/agents/tools/list/log_agent_work.md (73L) already documents the full running→completed/error lifecycle including the required id round-trip. The 2026-05-19 brief called shared-tool duplication 'by design' for self-containment, but self-containment only requires the table row, not a 30L worked recipe. agent-father's scaffold template (scaffold-files.md L97: 'following the pattern from reference agents') propagates the bloat into every new package.

**Evidence.** grep -l 'How to Invoke Tools' → 11 package files; grep -l 'Two-Call Recipe' → 11 package files (market-watcher L89-117, digest-predict L125-153, qa-responder L76-104, unified-agent L106-141, news-scout L66-101, alert-commander L71-106, etc. — awk-measured 30L per instance = ~330L fleet-wide). list/log_agent_work.md L10/L18/L22/L72 cover session start, id requirement, and completed/error end — full recipe coverage confirmed. Combined recurring load ≈ 47L per package read; package loads/day ≈ 36(mw)+34(ns)+34(ac)+10(ua)+4(bctc)+2(dp)+2(qa-r)+2(fbmp)+1(tnb)+1(ma)+~5(po via dev-team `7,37 * * * *` triage spawns) ≈ 130.

**Proposal.** In all 11 packages: (1) replace L7-23 'How to Invoke Tools' with 2 lines: 'Invoke via gateway: call_tool(server="vn-market", tool="<name>", arguments={...}) — grammar SSOT: project CLAUDE.md § MCP Tools. Wrong: tool_name/input/vnmarket-mcp.' (2) replace each Two-Call Recipe block with the table row it annotates plus: 'Lifecycle recipe (2 calls, id round-trip) → docs/agents/tools/list/log_agent_work.md'. (3) Root-cause: edit docs/agents/agent-father/flow/scaffold-files.md Step (L97) to scaffold the lean format (grammar pointer + tables + pointers, no example blocks) so future packages don't regress — per agent-md-factory discipline.

**Savings math (canonical auditor).** ~65-70k tokens/weekday: 47L * 12 tok * ~120-130 package loads/day ≈ 68k/day. Independent of finding 1 (non-overlapping line ranges: L7-23 and the Logging & Feedback recipe sit outside the Example Invocation spans).

**Merge note.** Independent of T-04 — non-overlapping line ranges.

---
### T-11 — step-0-cowork composite skill: ZERO adoption — wire into the 11 flow files still loading 3 constituent skills

**Priority:** P1 · **Effort:** S · **Est. saving:** ~55-160k tok/day

**Files:** `.claude/skills/step-0-cowork/SKILL.md`, `docs/agents/unified-agent/flow/chef.md`, `docs/agents/market-watcher/flow/cycle.md`, `docs/agents/alert-commander/flow/stage-bootstrap.md`, `docs/agents/news-scout/flow/stage-bootstrap.md`, `docs/agents/bctc-analyst/flow/stage-bootstrap.md`

**Problem.** step-0-cowork (133L) was built (Sprint 1968c-P02) to replace three per-cycle skill reads — notebook-read (14L) + cycle-bootstrap (165L) + regime-extraction (45L) = 224L — with one file load, error boundaries preserved. grep -rl 'step-0-cowork' docs/agents/*/flow/*.md returns NOTHING: the skill shipped but was never wired into a single flow. 11 flow files still point at cycle-bootstrap/SKILL.md directly, most also reading regime-extraction separately.

**Evidence.** Adoption grep = 0 hits. Direct cycle-bootstrap wiring: chef.md line 22, market-watcher/cycle.md lines 23+28 (bootstrap + regime as two reads), news-scout/stage-bootstrap.md, alert-commander/stage-bootstrap.md, bctc-analyst/stage-bootstrap.md, digest-predict daily/daily-predict/monday, unified-agent/market-bootstrap.md, market-watcher/eod.md, cowork-team/tick-snapshot.md. Combined cadence of the wired agents ≈ 50-60 cycles/day (chef 10, alert-commander 31, news-scout 7, market-watcher 7+, bctc 4, digest 2).

**Proposal.** Per-flow one-line swap: replace the separate '0. Bootstrap → cycle-bootstrap' + '0b. Regime → regime-extraction' (+ notebook-read where present) blocks with the skill's own documented usage line: 'Step 0 → skill: .claude/skills/step-0-cowork/SKILL.md, Variables: <only what this flow needs>'. Flows that deliberately skip the notebook read (e.g. market-watcher) reference § 0b-0c only. 11 mechanical edits under agent-md-factory discipline; no behavior change — the composite embeds the same GATEWAY-BLIND and regime-fallback boundaries.

**Savings math (canonical auditor).** ~90L (≈1.1k tokens) of skill-file reads saved per cycle × ~50 cycles/day ≈ 55k tokens/day.

**Merge note.** Found independently by 3 auditors. The skill shipped (Sprint 1968c-P02) but was never wired into a single flow.

**Corroborating findings (merged duplicates):**
- *step-0-cowork adoption gap — 6 agents double-load cycle-bootstrap + regime-extraction every cycle* — Redundant 210L ≈ 2,520 tok/cycle. Cadence: market-watcher ~28/trading-day + alert-commander ~30/day + news-scout 7 + bctc-analyst 4 + digest ~2 ≈ 65 cycles/trading-day → ~160k tokens/trading-day (cons
- *market-watcher (≈42 fires/weekday, fleet-max cadence): step-0-cowork composite is always_loaded via init.md but cycle.md* — market-watcher alone: redundant 165+45+101 = 311L × 12 tok × 42 fires ≈ 157k tokens/day upper bound; ≥70k/day conservative. Fleet-wide (news-scout 7/day, alert-commander 34/day market-hours) adds ~30-

---
### T-12 — dispatch-claim SKILL (493L): front with ~40L executable CARD; point CLAUDE.md step 2.5 at the card

**Priority:** P1 · **Effort:** M · **Est. saving:** ~54k tok/day (scales with dispatch volume)

**Files:** `.claude/skills/dispatch-claim/SKILL.md`, `CLAUDE.md`

**Problem.** CLAUDE.md step 2.5 points every pre-spawn at dispatch-claim/SKILL.md (493L, ~5.9k tokens). At dispatch time the router needs only: ownership-key rule (compressible to 4L from L11-29), the router-scope PRE-CLAIM wrap (L222-263), the orphan-adoption loop skeleton (~30 load-bearing lines of L317-420), and the 3 action lines of Phase A.5 (L423-480). Cold content read anyway: Fire-Time Election L71-126 (56L — the file's own L121-122 says canonical implementations live in the three dispatcher flow files), Step 0a presence self-registration L129-219 (91L — already instantiated inline in cowork-team main.md L117-145 and dev-team main.md ~L125), sprint-task wrap L267-284, session-id passing L287-303, and Reference Commits L483-493 (11L pure git history). File also breaches the 200L waterfall cap with NO size-justification marker (commit-mutex, signal-dashboard etc. carry one — governance adoption gap).

**Evidence.** Read of full file: hot sections total ~100L of 493L. Both heavy dispatchers already avoid the full read by inlining instantiations (cowork-team main.md L112-145 comment 'dispatch-claim SKILL Step 0a is authoritative — this is the cowork-team instantiation'; dev-team main.md L125 same pattern), proving a compact executable card suffices. grep shows only 3 live callers outside self-refs: CLAUDE.md (3 pointer lines), cowork-team main.md L117, task-lock L159/L236.

**Proposal.** Create .claude/skills/dispatch-claim/CARD.md (<=40L): ownership-key rule (3L) + Phase A orphan-probe executable skeleton with N_MAX/ESCALATED idempotency (12L) + Phase A.5 roster read (4L) + Phase B intent PRE-CLAIM wrap with try/finally release (15L) + edge-path pointers ('escalation detail / resume contract / fire-election spec / presence Step 0a -> SKILL.md section X'). Point CLAUDE.md 2.5 at CARD.md. In SKILL.md: delete Reference Commits L483-493 (move SHAs to the 1962c brief), add size-justification or split to sub-files per waterfall rule.

**Savings math (canonical auditor).** ~450L avoided per full-sequence dispatch x 12 tok/L = ~5.4k tokens/dispatch; at a conservative 10 router dispatches/day (user intents + auditor non-green spawns + orphan probes) = ~54k tokens/day; scales linearly with activity (67 commits landed in last 24h — high-activity days run 2x that)

**Merge note.** Found by 3 auditors. Worst project-authored ≤200L breach (493L, no size-justification marker).

**Corroborating findings (merged duplicates):**
- *dispatch-claim SKILL (493L) read per router dispatch still inlines election/presence machinery that WU-1/WU-2 moved into* — ~1.8k tokens per router dispatch; at ~10–15 dispatches/day ≈ 18–27k tokens/day.
- *dispatch-claim 493L — worst project-authored ≤200L breach; ~260L is reference/history not per-dispatch hot path* — ~260L x 12 ≈ 3,100 tok per router dispatch x ~10-20 dispatches/day ≈ 30-60k tokens/day.

---
### T-13 — size-justification line-1 comments became append-only changelogs — purge to ≤300 chars, cap in factory

**Priority:** P1 · **Effort:** S · **Est. saving:** ~30-60k tok/day across 6 hottest flows

**Files:** `docs/agents/dev-team/flow/main.md`, `docs/agents/system-auditor/flow/main.md`, `docs/agents/fb-market-poster/flow/main.md`, `docs/agents/cowork-team/flow/main.md`, `docs/agents/unified-agent/flow/chef.md`, `docs/agents/market-watcher/flow/cycle.md`

**Problem.** The governance marker meant to justify a file's size has mutated into an append-only sprint changelog living on line 1 of the hottest flow files. dev-team/main.md line 1 = 3,162 chars (~790 tokens) of dated task IDs ('EMIT-DARK-v2 2026-06-05... P3-FIRE-ELECTION 2026-06-28... SYSREMAKE-P2 2026-07-04'); system-auditor = 2,435; fb-market-poster = 1,701; chef = 1,165; cowork-team = 1,107; market-watcher/cycle = 1,005. Total across flows: 23,994 chars ≈ 6k tokens. This history duplicates git log and is dead weight on every read.

**Evidence.** head -1 char counts measured per file (above). Recurring cost of just cowork-team's 1,107-char line 1: 277 tokens × 96 ticks/day ≈ 26.6k tokens/day (until the prompt-gating finding lands). Contrast the compliant form: jump-to/SKILL.md line 9 and market-analyst/main.md line 1 (~330 chars, current-shape-only justification).

**Proposal.** Trim every size-justification marker to ≤300 chars stating only WHY the file is its current size (the market-analyst form). Delete the dated change entries — each already exists as a commit message. Encode the cap in the agent-md-factory skill ('size-justification = justification, not changelog; history belongs to git') so post-edit discipline stops the regrowth. Pure comment edit, zero behavioral risk.

**Savings math (canonical auditor).** ~5k tokens of line-1 history removed across the 6 hot flows; weighted by cadence (cowork 96x, chef 10x, auditor ~7x, dev-team ~15x, market-watcher 7x reads/day) ≈ 30-45k tokens/day.

**Merge note.** Found independently by 3 auditors. History already exists as commit messages; partially overlaps T-01/T-02 gating savings.

**Corroborating findings (merged duplicates):**
- *size-justification comments have become append-only changelogs — dev-team's line 1 alone is 3,162 chars burned 48x/day* — ~760 tokens × 48 (dev-team) + ~250 tokens × 96 (cowork) ≈ 60k tokens/day from the two hottest files; more across the fleet after sweep.
- *size-justification line-1 changelog blobs: append-only history prose re-read on every cron fire across 52 flow files* — ≥55k tokens/day fleet-wide from the five measured files alone; sweep is a one-time 30-min job.

---
## P2 — Next (solid savings or preventive value)

### T-14 — system-auditor Step 0c: jq-extract the 6 needed key-paths instead of full-reading 50.6KB system-map.json

**Priority:** P2 · **Effort:** S · **Est. saving:** ~75k tok/day

**Files:** `docs/agents/system-auditor/flow/main.md`, `docs/data/system-map.json`, `.claude/skills/system-map-query/SKILL.md`

**Problem.** system-auditor/flow/main.md line 50 (Step 0c) says 'Read `docs/data/system-map.json` and extract:' then lists exactly 6 key-paths (microservices, host_runtime_set.services, not_deployed_by_design, data_sources, databases, zones). The file is 1,733L/50,650 bytes. A full Read costs ~12.7k tokens when the 6 named slices are ~2k via jq. CLAUDE.md and system-map-query SKILL already mandate 'Query with jq — never read whole file' — this flow predates/ignores that rule. Every auditor spawn with the runtime_or_fetch_or_db_audit trigger (all three tiers) pays it.

**Evidence.** wc: 1733L / 50,650 bytes. Step 0c text quoted above lists the exact keys, proving a jq projection is sufficient. Cadence: Tier-2 fires 0 */4 (6/day), Tier-3 daily, Tier-1 spawns on non-ALL_GREEN or stale heartbeat (~1-2/day observed via signals) → ~7-9 full reads/day. Contrast: ops/flow/docker.md and tier1-probe.md already reference specific keys jq-style.

**Proposal.** Rewrite Step 0c as a single bash block: `jq '{services: [.project.microservices[] | {id, external_ports, zone}], runtime_set: .project.infrastructure.docker.host_runtime_set, sources: [.project.data_sources[] | {id, expected_cadence_hours, stale_threshold_hours, sla, geo_blocked}], dbs: .project.infrastructure.databases, zones: .project.zones}' docs/data/system-map.json` — pointer to system-map-query SKILL for the patterns. No semantic change: same data, projected.

**Savings math (canonical auditor).** ~12.7k tokens/read → ~2k jq output. ~7 reads/day → ~75k tokens/day saved. Low risk: read-only projection of the same SSOT.

---
### T-15 — orch-state.json hot file 612KB: evict terminal/wrapper task_board bloat via existing cold-evict

**Priority:** P2 · **Effort:** M · **Est. saving:** ~60-150k tok/day (higher risk — orch-state corruption history; route via orch-apply.sh + cold-evict only)

**Files:** `docs/data/orch/orch-state.json`, `scripts/orch-cold-evict.sh`, `docs/agents/pm/flow/main.md`, `docs/agents/po/flow/main.md`

**Problem.** Hot-file key sizes: task_board 446KB (active_sprints 143KB/6 rows — two epic wrappers alone are 70KB [VN-MACRO-TOOLING] + 45KB [BCTC-ANALYTICS-LAYER]; done 62KB/23 rows incl. weeks-old FDA-4/FU-* entries; review 66KB/24; closed_sprints 22KB/19), plus decision_journal 48KB and sprint_goal 32KB top-level. pm's hot path (HSC-3, pm/flow/main.md line 7) reads active_sprints WHOLE — ~36k tokens per planning read. po receives '.task_board' with no slice rule (po/flow/main.md lines 20, 69, 98) — a naive `jq '.task_board'` is ~110k tokens. Cold eviction exists and works (archive/backlog-detail.json 748KB, monthly archives 1.2-1.6MB) but only covers signal rows + backlog detail + terminal sprints — not done[] rows, closed_sprints, or embedded epic-wrapper detail.

**Evidence.** jq per-key byte measurements above (task_board lane breakdown: backlog 144,982B/313 items, active_sprints 143,018B/6, review 66,087B/24, done 61,945B/23, closed_sprints 22,211B/19). MEMORY corroborates both root causes: 'Epic-wrapper closeout gap — parent row can sit open forever after all children DONE_VERIFIED' and 'cold-evict --exclude-ids follow-up minted'. po/flow line ~200 warns non-canonical sprint statuses 'will strand the sprint in active_sprints[] indefinitely' — exactly what the 6 ACTIVE rows show.

**Proposal.** Extend scripts/orch-cold-evict.sh with three predicates: (a) done[] rows older than 48h and referenced by a done_verified/archived sprint → archive/YYYY-MM.json; (b) closed_sprints[] → archive; (c) active_sprints rows >10KB: move body (task lists, retro text) to a backlog-detail.json-style cold sidecar, keep ≤500B stub {id,status,head_task,detail_ref}. Separately add an HSC-3-equivalent slice rule to po/flow/main.md and qa/flow/main.md: '.task_board reads = jq slice {active blockers, backlog[].{id,title,status,priority}} — never the full section.' Route all writes via orch-apply.sh as usual.

**Savings math (canonical auditor).** pm planning read drops ~30k tokens; each PO/QA board query drops 10-80k depending on slice discipline. At ~4-6 board-consumer spawns/day ≈ 60-150k tokens/day. Effort M and higher risk (orch-state has a long corruption-hazard history — keep changes inside orch-cold-evict.sh + orch-apply.sh harness with conservation guards).

---
### T-16 — chef.md: split 564L dish-recipe body at the existing intraday silent-exit gate

**Priority:** P2 · **Effort:** M · **Est. saving:** ~45-50k tok/day

**Files:** `docs/agents/unified-agent/flow/chef.md`, `docs/agents/unified-agent/flow/main.md`

**Problem.** chef.md (699L / 45,450 bytes ≈ 11.4k tokens) is read whole on every fire, but the intraday gate sits at line 135: '$DISH_TYPE == intraday AND 0 clusters qualify → emit SILENT telemetry → EXIT'. Everything after (Steps 1.5 MACRO-HEALTH through Step 8 — layers, compose templates, quality-verdict gate, persist ≈ 564L / ~36.6KB) is unreachable on a silent intraday fire yet loaded every time. chef-intraday fires hourly 02:13-08:13 (7x/weekday); convergence clusters are the exception, not the rule.

**Evidence.** unified-agent/main.md dispatch (lines 11-14): intraday is 'conditional', morning/eod/evening 'guaranteed'. chef.md line 135 'Intraday gate' → SILENT exit. cowork-schedule.json: chef-intraday '13 2-8 * * 1-5' = 7 fires/day, chef-morning/eod/evening = 3 more. Total ~10 chef.md reads/weekday = ~114k tokens/day, of which silent-intraday fires waste the 564L tail.

**Proposal.** Split at the existing gate: chef.md keeps Step 0.5 (published-marker gate), Step 0 GATHER, Step 1 CLUSTER + intraday gate (~150L); new chef-dish.md holds Steps 1.5→8 (macro read, layers 1-6, synthesize, anti-fabrication gates, WRITE DISH, quality verdict, persist, end-of-cycle). Gate-fired contract line moves to the pointer: 'gate fired or DISH_TYPE guaranteed → Run sub-flow: ./chef-dish.md (Steps 2-8 MANDATORY, no third path between SENT and FAILED)'. No logic change — pure relocation along an already-hard branch boundary.

**Savings math (canonical auditor).** ~9.2k tokens (36.6KB tail) × ~5 silent intraday fires/day ≈ 45k tokens/day.

**Merge note.** Member adds: TNB knowledge files (265L) also loaded before the gate; move both loads after it.

**Corroborating findings (merged duplicates):**
- *unified-agent chef.md: intraday-silent cycles read 699L flow + 265L of TNB knowledge but exit at Step 1 — split dish-com* — ~815L avoided on ~5 silent intraday fires/day ≈ 49k tokens/day; plus ~56L (Step 7.6 example) × 12 × 5 published dishes ≈ 3.4k/day.

---
### T-17 — ops notebook 701L (3.5x cap): fix prune bypass (non-Write/Edit writes skip notebook-auto-prune hook)

**Priority:** P2 · **Effort:** S · **Est. saving:** ~18-36k tok/day + prevents same class on all 30 notebooks

**Files:** `docs/agent-memory/notebooks/ops.md`, `scripts/agents-flow/notebook-auto-prune.sh`, `.claude/settings.local.json`

**Problem.** ops.md is 701L/37.6KB with 15 `##` sections while every other notebook is ≤187L. The PostToolUse backstop hook (notebook-auto-prune.sh) is registered but only on matcher `Write|Edit` (settings.local.json line 58) — writes landed via any other path (Bash heredoc/append during the 07-11 Docker-wedge incidents) never trigger it. ops reads its full notebook at Step 0b (notebook-read) on every dispatch, so the breach is a recurring per-cycle tax. Individual sections also breach the 60L section cap (incident sections at lines 421-487=66L, 487-580=93L, 580-641=61L).

**Evidence.** wc -l: ops.md 701 vs next-largest 187 (dev-stock-price). Hook exists (mtime 07-11 04:48), logic verified correct (drop-oldest loop until ≤200L); yet the last section (`Incident Recovery … 2026-07-11T21:11Z`) post-dates the hook — so the writing path bypassed PostToolUse. Untracked `.test-notebook-prune-debug/` (created 07-11 04:52) shows prune was being debugged the same day. Lines 421-641 are three full incident write-ups (~220L) duplicating content already committed as docs/incidents material (commits 95822aa90, ff7df213a, 47075dafb).

**Proposal.** (1) Immediate: run `bash scripts/agents-flow/notebook-auto-prune.sh`-equivalent standalone on ops.md after moving the three incident sections' detail to docs/incidents/ (leave 2-line pointers). (2) Close the bypass class: add a notebook line-cap sweep to code-janitor's existing 6h cron (`for f in docs/agent-memory/notebooks/*.md; wc -l >200 → invoke the same drop-oldest logic`) — catches Bash-written breaches the PostToolUse matcher structurally cannot see. (3) Add to ops/flow/main.md's notebook-commit step (line 86-91) a pre-commit `wc -l` gate mirroring skill AC-5, since ops commits its own notebook by explicit path.

**Savings math (canonical auditor).** 37.6KB ≈ 9.4k tokens/read vs ~2.7k at 200L cap → 6.7k wasted per ops cycle × ~5 ops dispatches/day (close gates + incidents per git log) ≈ 33k tokens/day, plus prevents the same failure class on all 30 notebooks.

**Merge note.** Found by 2 auditors.

**Corroborating findings (merged duplicates):**
- *ops notebook at 701L / 37.6KB breaches the ≤200L standing rule 3.5x — notebook-write prune-to-last-3-sections never appl* — ~500L × 12 ≈ 6k tokens per ops spawn; at 3–6 incident-driven spawns/day ≈ 18–36k tokens/day, plus smaller repeated git-commit/diff payloads.

---
### T-18 — ops tools package 405L → ~110L: delete stale hardcoded 9-service architecture block (contradicts system-map)

**Priority:** P2 · **Effort:** S · **Est. saving:** ~24k tok/day + removes stale-topology misdiagnosis hazard

**Files:** `docs/agents/tools/package/ops.md`

**Problem.** ops.md is the largest package (405L) but only L26-78 (~53L) is actual tool tables. L82-131 ('Architecture Overview', 50L) hardcodes a '9-Service Docker Deployment' with service names/ports (ta-service:4001, bb-service:4002, macro-service:4003, gateway-service:6000, postgres) that do not match system-map.json's 11 microservices (technical-analysis, alert-engine, api-gateway, kinh-dich-service...) — a direct violation of CLAUDE.md 'System Data — Never Hardcode', and actively misleading during Docker incidents (today's active incident involves 12+ compose services, not 9). L144-227 ('Troubleshooting', 84L) + L231-386 ('Example Invocation', 156L) are TS pseudo-code walkthroughs duplicating what L390-405 already points to (vps-setup reference, bctc-extraction-runbook). ops is loaded by 9 flow files (ops/flow/{main,docker,db,vps,bctc,data-validation,cloudflare-mcp}.md + ops-vps-fetch + ops-mainserver-fetch) and ops fires several times daily via dev-team (`7,37 * * * *`) incident dispatches — 3 ops incident commits today alone.

**Evidence.** wc: 405L. Section map read directly: tool tables L26-78; Architecture Overview L82-131; Channel Permissions L134-141; Troubleshooting L144-227; Example Invocation L231-386; pointers L390-405. jq '.project.microservices | length' docs/data/system-map.json = 11 with ids mcp-server/api-gateway/stock-price/technical-analysis/macro-indicators/kinh-dich-service/alert-engine/pdf-extractor/rag-service/news-fetch/frontend — zero overlap with the package's ta-service/bb-service/macro-service/gateway-service/postgres naming. Package 'Last Updated: 2026-05-05' — 2+ months stale.

**Proposal.** Cut to ~110L: keep header+grammar pointer (2L per finding 2), all tool tables L26-78, Task-Lock section L68-78, Channel Permissions, and the Related Documentation pointer block. Replace Architecture Overview with 1 line: 'Service topology → jq docs/data/system-map.json (skill: system-map-query) — never trust a hardcoded list'. Replace Troubleshooting + Example Invocation with 2 pointer lines to docs/protocols/bctc-extraction-runbook.md and reference_vps_setup.md (already listed at L390-405). Bonus: removes a live incident-response hazard (agent restarting 'bb-service' that doesn't exist).

**Savings math (canonical auditor).** ~24k tokens/day: ~290L cut * 12 tok * ~7 ops spawns/day ≈ 24k/day (ops cadence is incident-driven; 3 incidents today, plus scheduled ops-vps-fetch/ops-mainserver-fetch flows). Also removes stale-topology misdiagnosis cost during incidents.

---
### T-19 — handoff-delta-read: extend adoption to ba, architect, architect post-merge-review

**Priority:** P2 · **Effort:** S · **Est. saving:** ~15-40k tok/day

**Files:** `docs/agents/ba/flow/main.md`, `docs/agents/architect/flow/main.md`, `docs/agents/architect/flow/post-merge-review.md`, `.claude/skills/handoff-delta-read/SKILL.md`

**Problem.** grep -rln for handoff-delta-read/last_read_anchor hits only developer, fixer, qa flows + the skill itself. Yet architect/flow/main.md reads the BA spec from docs/handoffs/TASK_NNN.md (line 23) and appends findings (line 67) — a re-read of a file BA just wrote, ideal delta-read case. Worse, architect/flow/post-merge-review.md line 9 requires 'docs/handoffs/TASK_NNN.md for every task in the sprint' — full re-reads of files the architect already read at design time. Handoff files written by the adopting agents already carry `## §N-` anchors, so the anchor contract is in place; the mid-chain readers just don't use it.

**Evidence.** Adoption grep result: only 3 flow files + skill. Handoff sizes: recent-30d 262 files avg 11,148 bytes; historical monsters TASK_BCTC-TABLE.md 262KB, TASK_PEK-INTEGRATE.md 114KB. A 5-task sprint post-merge review = ~55KB ≈ 14k tokens of which ≥70% was already read (skill's own AC-4 smoke test: delta ≤30% of first read).

**Proposal.** Add to architect/flow/main.md Step (receive spec) and post-merge-review.md: '→ skill .claude/skills/handoff-delta-read/SKILL.md — pass last_read_anchor from the DONE signal / prior read'. ba/main.md needs only the writer side (already satisfied — sections use §N anchors). The DONE-signal anchor field plumbing is already specified in the skill's Caller Contract, so this is a pointer-add, not new mechanism.

**Savings math (canonical auditor).** Architect re-read + post-merge passes: ~10-14k tokens per sprint review + ~2-5k per task mid-chain re-read; at current throughput (1-3 sprints/day) ≈ 15-40k tokens/day. The skill itself claims 50-150KB/trading-day for the pattern — this closes its two biggest non-adopters.

---
### T-20 — jump-to anchors: adoption sweep over the 9 un-anchored 200L+ flows (5/~150 files adopted today)

**Priority:** P2 · **Effort:** S · **Est. saving:** ~10-15k tok/day + enabler for WU-2-style targeted-entry prompts

**Files:** `docs/agents/fb-market-poster/flow/main.md`, `docs/agents/dev-mcp-server/flow/main.md`, `docs/agents/market-watcher/flow/cycle.md`, `docs/agents/pm/flow/main.md`, `.claude/skills/jump-to/SKILL.md`

**Problem.** jump-to/SKILL.md mandates anchors + a JUMP TO dispatch table for 'any flow with >3 sequential steps'. Adoption grep: only dev-team (12 anchors), po (5), qa (5), claude-manager-helper (14), market-analyst (4). Zero anchors in fb-market-poster/main.md (945L, 9 STEPs + MODE ROUTER), dev-mcp-server (345L), market-watcher/cycle.md (285L, 10+ steps), pm (200L), weekly-prediction (302L), weekly-recap (238L), dev-vps-crawls (222L), dev-mainserver-crawls (213L), dev-frontend (207L). Concrete cost case: fb-weekend slot (Sat+Sun 13:13) reads all 62.5KB of main.md, hits the MODE ROUTER at line 48, then routes to weekly-recap.md/weekly-prediction.md — the daily body (lines 69-945, ~876L) was loaded for nothing. Anchors are also the enabler for WU-2-style targeted-entry prompts ('read main.md starting at anchor X' — only possible in dev-team today because anchors exist).

**Evidence.** Per-file grep table (jumps/anchors counted for all 150 flow files): 5 adopters listed above; all 200L+ non-adopters enumerated. fb-market-poster MODE ROUTER at line 48; STEP 0 begins line 69; file = 62,555 bytes. cowork-schedule.json: fb-weekend '13 13 * * 6,0'.

**Proposal.** Adoption sweep (agent-father edit lane, one file per task): add <!-- jump:step-N --> anchors + top dispatch table to the 9 listed 200L+ flows per the skill's own format. For fb-market-poster specifically: move MODE ROUTER above the guards' detail (keep guard headlines), and route weekend modes with 'Run sub-flow' BEFORE the daily body — or extract the daily body to daily-post.md so weekend fires never load it.

**Savings math (canonical auditor).** fb-poster weekend alone: ~10.9k tokens × 2 fires/wk ≈ 3k/day-equivalent; anchored-entry unlocks offset reads on the other 8 flows (each ~2-4k tokens/fire when the trigger pre-determines the path) ≈ 10-15k tokens/day total, plus prerequisite value for future prompt-gating findings.

**Merge note.** Found by 2 auditors.

**Corroborating findings (merged duplicates):**
- *jump-to adoption gap: zero anchors in all four biggest cron-fired cowork flows despite the skill mandating them for >3-s* — Enabler finding: direct savings realized through F1/F5/F6 splits; standalone benefit ≈ skipped re-walks on gate-retry/dedup paths, est 5-10k tokens/day.

---
### T-21 — task-lock SKILL 283L: dedup ~70L session-presence protocol duplicated verbatim with dispatch-claim (4 copies fleet-wide)

**Priority:** P2 · **Effort:** S · **Est. saving:** ~10-15k tok/day + kills 4-way drift hazard

**Files:** `.claude/skills/task-lock/SKILL.md`, `.claude/skills/dispatch-claim/SKILL.md`

**Problem.** task-lock/SKILL.md §Session-Presence Row (L211-283, 73L) near-verbatim duplicates dispatch-claim §Step 0a (L129-219, 91L): same claim block, same heartbeat loop, same release+reclaim current_task pattern, same non-adoptable invariant — an SSOT violation on the hot path that both files' readers pay twice. On top: §Phase Status (L186-208, 23L) is shipped-sprint history with commit SHAs (Phase 1-4 SHIPPED 2026-05-20, 10+ SHAs), and §Legacy Backward-Compat (L112-126, 15L) is marked TRANSITIONAL, removed at TASK_1980/P1-FINAL — likely stale since P1 was in flight 2026-06-28 and today is 07-11.

**Evidence.** Diff-by-eye of task-lock L218-233 vs dispatch-claim L145-157: identical task_claim arguments including payload fields; task-lock L258-272 vs dispatch-claim L187-201: identical release+reclaim block. task-lock is referenced by dev-team/flow/main.md L46 and 20+ files under docs/agents/tools/package/*.md. Both dispatcher flows ALSO carry a third inline instantiation (cowork-team main.md L117-145).

**Proposal.** Make dispatch-claim §Step 0a the sole SSOT for session-presence. In task-lock: replace L211-283 with a 3L pointer ('Session-presence claim/heartbeat/non-adoptable invariant -> dispatch-claim/SKILL.md § Step 0a; dispatchers only'); move §Phase Status L186-208 to docs/architecture-briefs/ (or delete — SHAs are recoverable from git); verify TASK_1980 landed, then delete §Legacy Backward-Compat L112-126. Result: task-lock 283L -> ~175L, back under the 200L waterfall cap without needing a size-justification marker.

**Savings math (canonical auditor).** ~108L x 12 tok/L = ~1.3k tokens per task-lock read; at ~8 reads/day (dev-team RUN ticks + lock-implementing agents) = ~10k tokens/day, plus removes a 3-copy drift hazard

**Merge note.** Found by 2 auditors.

**Corroborating findings (merged duplicates):**
- *task-lock 283L breach + session-presence claim block duplicated in 4 places* — ~120L x 12 ≈ 1,450 tok per load x ~5-10 lock-implementation loads/day ≈ 7-15k tokens/day, plus eliminates a 4-way code-block drift hazard.

---
### T-22 — dispatch/SKILL.md: split router step-1 table from dev-team handoff-chain content

**Priority:** P2 · **Effort:** S · **Est. saving:** ~7-14k tok/day

**Files:** `.claude/skills/dispatch/SKILL.md`

**Problem.** CLAUDE.md step 1 mandates reading the dispatch table before every spawn. The file (109L) delivers the table at L28-59 (~32L incl. the cowork-agent exception note) but prepends the Auto-Switch Protocol prose (L10-26, 17L) and appends the Dev Team Handoff Chain + code-simplifier lane + Ops lane (L63-93, 31L) and cross-cutting pointer rows (L97-109, 13L). The handoff chain is dev-team-internal knowledge consumed by dev-team/pm flows mid-sprint, not by the router at intent-routing time — yet the router pays for it on every dispatch.

**Evidence.** CLAUDE.md L5: 'Read .claude/skills/dispatch/SKILL.md dispatch table' — the mandate names only the table. grep shows non-router consumers of the chain content are dev-team flow files and agent-father register-agent.md (which edits the table). 77L of 109L is non-table content.

**Proposal.** Keep SKILL.md = dispatch table + 3-row Auto-Switch summary + cowork exception note + agent-file placement line (~50L). Move Dev Team Handoff Chain, code-simplifier lane, Ops lane, and Cross-Cutting References to .claude/skills/dispatch/chain.md with a 1L pointer; dev-team/pm/ops flows that need the chain reference chain.md directly. agent-father register-agent.md path is unaffected (still edits the table in SKILL.md).

**Savings math (canonical auditor).** ~60L x 12 tok/L = ~720 tokens/dispatch x 10-20 router dispatches/day = ~7-14k tokens/day

---
### T-23 — CLAUDE.md step-2.5 block (21L): compress to 5L — detail belongs in dispatch-claim CARD (T-12)

**Priority:** P2 · **Effort:** S · **Est. saving:** ~11k tok/day (rides into every subagent context)

**Files:** `CLAUDE.md`

**Problem.** CLAUDE.md L5-25 inline a compressed Phase A / A.5 / Phase B protocol (orphan probe conditions, roster-read log formats, full task_claim argument list, claimed:true/false branches, try/finally) — router-only logic. Project CLAUDE.md is injected into EVERY spawned subagent's system prompt (this audit subagent received the full 74L, demonstrably), so ~21 router-only lines are paid by every cowork slot agent, dev specialist, and auditor spawn that can never execute them. It is also a third copy of the protocol (CLAUDE.md + dispatch-claim SKILL + flow instantiations), a proven drift hazard.

**Evidence.** CLAUDE.md lines '2.5 PRE-CLAIM' through 'finally: task_release(...)' = 21 of 74 lines. This session (a spawned subagent) received the full block verbatim despite being unable to dispatch. Fleet spawn volume: cowork-team 96 ticks/day matching multiple slots, dev-team specialists, auditor spawns — conservatively 60 subagent context loads/day.

**Proposal.** After finding #2 lands (CARD.md exists), compress CLAUDE.md 2.5 to ~5L: 'PRE-CLAIM gate MANDATORY -> execute .claude/skills/dispatch-claim/CARD.md (Phase A orphan-probe, A.5 roster read, B intent claim). claimed:false + peer -> log + send_telegram(work) + EXIT. Router never reverts uncommitted files — tree-hygiene is dev-team Step 0a.' Net -16L from CLAUDE.md (74 -> ~58L).

**Savings math (canonical auditor).** 16L x 12 tok/L = ~190 tokens per context load x ~60 subagent spawns/day = ~11k tokens/day, plus the same saving on every main-session system-prompt assembly; eliminates the 3-copy drift risk on the pre-claim protocol

---
### T-24 — Context-bloat governance gate counts LINES only — mega-line files (po main.md 275L/69.5KB) pass clean; add byte cap

**Priority:** P2 · **Effort:** M · **Est. saving:** Preventive — protects all P1 recoveries from regrowth

**Files:** `scripts/agents-flow/context-bloat-backstop.sh`, `docs/agents/po/flow/main.md`

**Problem.** The enforcement backstop classifies governed files exclusively by wc -l (lines 108–134: LINE_COUNT=$(wc -l …); [ $LINE_COUNT -le $MATCHED_CAP ] && exit 0). Agents under line pressure have adapted by writing 1,500–2,600-char single lines: po main.md sits at 275L (near its 229L justification) while carrying ~17.4k tokens — 5–6x the token weight the line cap was designed to bound. This is the root-cause enabler of the po catalog bloat and the size-justification changelogs; without a byte/token dimension the same evasion will regrow after the extractions land.

**Evidence.** grep of context-bloat-backstop.sh shows only wc -l measurement (no wc -c anywhere). awk scan found 49 lines >400 chars across the audited main flows, concentrated in po (34 lines, max 2,585 chars) and dev-team (9 lines, max 3,161 chars). Detector history (docs/signals/processed/context-bloat-*) shows it has only ever fired on line-count breaches.

**Proposal.** Add a second predicate to context-bloat-backstop.sh: BYTE_COUNT=$(wc -c) with cap = MATCHED_CAP × 60 bytes/line (200L governed file → 12KB), same settle-window logic, emitting the existing context-bloat signal type with reason='byte-cap'. Update the token-economy SKILL waterfall table to state both caps. Extend the existing backstop test (context-bloat-backstop.test.sh) with a mega-line fixture.

**Savings math (canonical auditor).** Preventive: protects the ~400k/day recovered by the P1 extractions from regrowth; directly would have caught po main.md ~6 weeks of drift (~100k+ tokens/day at current spawn rates).

---
### T-25 — Codify the standard flow template (news-scout/unified-agent shape) in agent-md-factory as a checkable rule

**Priority:** P2 · **Effort:** M · **Est. saving:** Enabler/regression-stopper for the whole program

**Files:** `docs/agents/news-scout/flow/main.md`, `docs/agents/unified-agent/flow/main.md`, `docs/agents/agent-father/flow/main.md`, `docs/agents/bctc-analyst/flow/cycle.md`

**Problem.** The repo already contains the ideal architecture — news-scout: main.md 22L (identity guard + 'Always → cycle.md') → cycle.md 43L (error-boundary pointer + 5-stage dispatch table) → stage files loaded per stage; unified-agent: main.md 28L pure time-window dispatcher ('MUST NOT do synthesis work itself'); agent-father: 47L trigger/intent dispatch table; bctc-analyst: stage-pass-*.md and esc-*.md loaded only on branch. But no policy names this shape, so new/refactored flows drift to monoliths: fb-market-poster main.md IS its own 945L body, system-auditor packs 3 tiers in one file, chef.md packs gather+gate+recipe+publish in one. The main-flow/subflow contract is folklore, not a checkable rule.

**Evidence.** Lean exemplars measured: news-scout 22+43L, unified-agent 28L, agent-father 47L, alert-commander 22+40L, bctc-analyst 128+100L with conditional esc-/stage-pass files. Violators measured: 945L (fb-poster), 787L (system-auditor), 699L (chef), 345L (dev-mcp-server), 307L (cowork-team pre-WU-1 residue), 285L (market-watcher/cycle). Boilerplate duplication is small and healthy (SELF-IDENTITY GUARD ~7L × 11 files — correctly inlined; error-boundary/end-cycle already one-line skill pointers in 28+ flows), so the gap is structural, not phrasing.

**Proposal.** Codify a flow template in the agent-md-factory skill (the mandatory pre/post-edit gate for all flow edits): (1) main.md ≤50L = identity guard + Tools pointer + dispatch table (trigger → JUMP TO label or Run sub-flow) + fast-path EXIT row + 'MUST NOT do work itself'; (2) any hard gate (silent-exit, tier dispatch, mode router) is a FILE boundary — post-gate body lives in a sub-flow; (3) per-cycle preambles/postambles are one-line skill pointers (step-0-cowork, cowork-error-boundary, cowork-end-cycle); (4) catalogs/registries (reusable scripts, tool lists) never inline — pointer file with a load trigger; (5) size-justification ≤300 chars, no changelog; (6) crons firing >4x/day get a deterministic preflight script verdict in the cron prompt (WU pattern). Enforcement = factory checklist line + the existing ctx-bloat detector.

**Savings math (canonical auditor).** Enabler/regression-stopper: locks in the ~500k tokens/day recovered by the P1 findings above and prevents the next 945L monolith; direct saving realized through findings 1-7.

---
### T-26 — fb-market-poster main.md 946L: MODE ROUTER before daily body; extract daily body so weekend fires skip 880L

**Priority:** P2 · **Effort:** M · **Est. saving:** ~3.4k tok/day avg + brings fleet's largest flow under governance

**Files:** `docs/agents/fb-market-poster/flow/main.md`, `docs/agents/fb-market-poster/flow/weekly-recap.md`, `docs/agents/fb-market-poster/flow/weekly-prediction.md`

**Problem.** MODE ROUTER sits at L48-66, so Sat/Sun fires use only ~66L of the 946L file before executing weekly-recap.md (238L) or weekly-prediction.md (302L) — but the whole 946L is read first (~10.6k tokens, ~880L wasted per weekend fire). On the DAILY path, the forbidden-English-terms table (L442-468, 27L) duplicates scripts/fb-jargon-gate.sh, which L440 itself names as 'SSOT in scripts/fb-jargon-gate.sh' — token cost plus drift risk (table and script can diverge silently). The sub-flows already do pointer-reuse correctly (weekly-recap.md L112/L173 point back to main.md sections), which forces main.md to stay loaded — inverting that dependency fixes both.

**Evidence.** Crons: fb-daily 15 9 * * 1-5 (5/wk), fb-weekend 13 13 * * 6,0 (2/wk). Weekend waste: 880L × 12 tok × 2/wk ≈ 21k tokens/wk. Jargon table: 27L × 12 × 7 reads/wk ≈ 2.3k/wk plus the known false-green/drift class (feedback_fb_poster_gate_false_green). Line-1 changelog blob 1,701 chars (~425 tok/read).

**Proposal.** Restructure: main.md → ≤120L (SELF-IDENTITY GUARD, PRIVACY GUARD SSOT, MODE ROUTER, shared disclaimer/hashtag SSOT block) + new flow/daily.md holding STEP 0-8 of the daily pipeline. Weekly sub-flows re-point their 'SSOT: main.md §…' references to the (still-loaded) slim main.md — no duplication introduced. Delete the L442-468 jargon table body, keep 2 lines: rule statement + pointer to scripts/fb-jargon-gate.sh (the enforced gate). Truncate the L1 changelog (covered by the header-blob finding).

**Savings math (canonical auditor).** Weekend: ~21k tokens/wk. Daily: ~40L removed (jargon table + header blob) × 12 × 5 ≈ 2.4k/wk. Total ≈ 3.4k/day average; main value is drift-risk elimination + bringing the fleet's largest flow file under governance.

---
### T-27 — dev-team drain-signals.md §0a-D-PRUNE contradicts HSC-7 (references removed signal_queue.archive[] lane)

**Priority:** P2 · **Effort:** S · **Est. saving:** ~1-2k tok/day direct; prevents signal_queue hot-file regrowth

**Files:** `docs/agents/dev-team/flow/drain-signals.md`, `.claude/skills/signal-dashboard/SKILL.md`

**Problem.** signal-dashboard SKILL § PRUNE (HSC-7) mandates: evict terminal rows via scripts/orch-cold-evict.sh, 24h threshold, 'NOT inline archive[] — lane removed', and notes 'signal_queue.archive[] is always fully cleared by the script (RC-1 fix: inline archive = dead weight)'. But drain-signals.md lines 56-68 (§0a-D-PRUNE) still inline the OLD procedure: 'Archive rows where status = RESOLVED or READ + ts < now() - 48h: Move to orch-state.json .signal_queue.archive[]'. dev-team runs this flow on every RUN tick (fires 7,37 * * * * = 48/day). An agent following the inline text (which claims to be 'per skill § PRUNE' but isn't) writes rows back into the dead archive[] lane and uses the wrong threshold — the exact hot-file dead weight HSC-7 removed.

**Evidence.** Direct quote conflict: SKILL line 88 'Evict terminal rows to cold archive via scripts/orch-cold-evict.sh (NOT inline archive[] — lane removed)' + 'Criteria: … older than 24h' vs drain-signals.md line 60-61 'status = RESOLVED or READ + ts < now() - 48h: Move to orch-state.json .signal_queue.archive[]'. signal_queue currently 0 rows/150B (recently evicted), so the drift is latent, not hypothetical damage — but each drain following the stale text regrows it.

**Proposal.** Replace drain-signals.md lines 58-68 with: '§0a-D-PRUNE — run `bash scripts/orch-cold-evict.sh` per signal-dashboard SKILL § PRUNE (HSC-7; 24h; never inline archive[]). Then update .dashboard_section_cache and commit orch-state by explicit path.' (~4 lines replacing 13). Also delete the duplicate PRUNE spec so SSOT lives only in the skill — this is the exact drift class the repo's SSOT discipline exists to prevent.

**Savings math (canonical auditor).** Direct: ~110 tokens/RUN-tick read (~10-20 RUN ticks/day ≈ 1-2k/day). Real value: prevents signal_queue hot-file regrowth, which multiplies the cost of EVERY orch-state jq/stat read by every agent (three concurrent writer classes touch this section). Low effort, low risk.

---
### T-28 — 26 registry tools have no tools/list/ doc → anti-hallucination rule reads them as 'tool missing' (false BUG signals)

**Priority:** P2 · **Effort:** S · **Est. saving:** ~3-6k tok/day indirect + kills a false-negative class

**Files:** `.claude/skills/anti-hallucination/SKILL.md`, `docs/agents/tools/list/`, `docs/data/tool-registry.json`

**Problem.** Cross-checked all 157 list/ docs against tool-registry.json (183 tools): zero dead docs (good — no stale entries to delete), but 26 registry tools have NO list doc. anti-hallucination/SKILL.md L55 states: 'SSOT for tool names: docs/agents/tools/list/ ... If a name has no matching file there, it does not exist.' The missing 26 include the P0 indicator suite that IS in market-watcher/alert-commander/unified-agent package tables (get_breadth_thrust, get_volatility_indicators, get_vn_liquidity_state), the entire scheduled-task family the deferred-task scheduler depends on (schedule_task, claim_due_scheduled_tasks, complete_scheduled_task, cancel_scheduled_task, expire_scheduled_task, fail_scheduled_task, list_scheduled_tasks), plus get_market_hexagram, get_vn_trade_balance, get_vn_bop, get_market_breadth, and 12 more. An agent following the skill's verification chain (package says tool exists → skill says list/ is SSOT → file missing) either burns a verification loop + BUG escalation or wrongly SKIPs a real call — both recurring token waste and dropped work.

**Evidence.** comm -23/-13 of sorted basenames vs jq -r '.groups[].tools[]' docs/data/tool-registry.json: 'in list/ but NOT in registry' = empty; 'in registry but NO list doc' = 26 names (full list captured in scratchpad/registry.txt vs listdocs.txt). market-watcher package L48-53 documents get_volatility_indicators/get_breadth_thrust/get_vn_liquidity_state as its P0 suite — all three lack list docs. anti-hallucination L55 quoted verbatim above; same skill L46 makes the package file check Step 1, so the two SSOT claims conflict.

**Proposal.** Generate the 26 missing stubs from tool-registry.json + live schema (gateway list_server_tools at design time) using the existing lean list-doc template (get_price_history.md shape, ~20L each), via a reusable scripts/gen-tool-list-stubs.* — NOT hand-written. Simultaneously fix anti-hallucination L55 to name tool-registry.json as the count/name SSOT (matching CLAUDE.md's '[generated count — see docs/data/tool-registry.json]') with list/ as the detail layer. This is an adoption-gap fix for the existing lazy-load design, not a new pattern.

**Savings math (canonical auditor).** ~3-6k tokens/day indirect: each false 'tool missing' event costs a re-read of anti-hallucination (65L) + package re-read + BUG signal compose (~500-800 tok), observed pattern class in memory (agents claiming tools unavailable). Primary value is correctness: un-blocks 26 real tools incl. the deferred-task scheduler family.

---
## P3 — Cleanup (small direct savings, hazard removal)

### T-29 — dev-mcp-server main.md 345L: drop completed-Phase-1 G12 streak text + lazy-load reparse runbook

**Priority:** P3 · **Effort:** S · **Est. saving:** ~5-12k tok/day

**Files:** `docs/agents/dev-mcp-server/flow/main.md`

**Problem.** The zone flow correctly delegates base steps to microservice-main.md, but retains: (a) § G12 Streak Rule (lines 102–108) naming Phase-1 tasks P1-B/P1-C/P1-D — Phase 1 closed long ago (current work is FACTORY-DOMAIN/FACTORY-FRONTEND splits per ops notebook); (b) § ESLint Fence 'Phase 2 concern / do not implement during Phase 1' (lines 112–120) — a phase-gate note for a phase that ended; (c) § Low-Confidence Reparse Runbook (~line 319+) — needed only for BCTC reparse tasks. dev-mcp-server is the most-spawned zone specialist (mcp-server owns the largest task volume).

**Evidence.** Lines 104: 'The three G12 streak tasks for Phase 1 are P1-B, P1-C, and P1-D'; line 114: 'Phase 1 does NOT require ESLint fence enforcement'. Header grep of lines 121–345 shows Low-Confidence Reparse Runbook as a separate concern block. File = 345L vs its own size-justification claim of 170L (another stale marker).

**Proposal.** (a) Replace §G12 Streak Rule + §ESLint Fence with 2 pointer lines to the phase-1 task-plan/charter briefs (content already SSOT there — lines 108, 120 cite them). (b) Move Low-Confidence Reparse Runbook to docs/agents/dev-mcp-server/flow/reparse-runbook.md, loaded only when the task mentions reparse/low-confidence. Keep G12 two-gate table (lines 55–99) — that is live, every-task content. Net main.md ≈ 220L.

**Savings math (canonical auditor).** ~125L × 12 ≈ 1.5k tokens per spawn × 3–8 spawns/day ≈ 5–12k tokens/day.

---
### T-30 — SELF-IDENTITY GUARD duplicated verbatim in 11 flows: compress 7-8L → 2L, fix factory template

**Priority:** P3 · **Effort:** S · **Est. saving:** ~3.3k tok/day

**Files:** `docs/agents/digest-predict/flow/main.md`, `docs/agents/fb-market-poster/flow/main.md`, `docs/agents/alert-commander/flow/main.md`, `docs/agents/bctc-analyst/flow/main.md`, `docs/agents/news-scout/flow/main.md`

**Problem.** The identical 7-8 line 'SELF-IDENTITY GUARD (read first — non-negotiable)' block appears verbatim in 11 flow files (grep hit list includes market-analyst, qa-responder, digest-predict, refine_bctc_md, tran-ngoc-bau, alert-commander, bctc-analyst, all 3 fb-poster flows, news-scout). High-cadence carriers: alert-commander (~34 fires/day market hours), news-scout (~8/day), bctc-analyst (4/day), refine_bctc (4/day), digest-predict (2/day).

**Evidence.** grep -rln 'SELF-IDENTITY GUARD' → 11 files; block measured at 7L (~85 tokens) in digest-predict/flow/main.md. Aggregate ≈ 85 tok × ~55 carrier-fires/day ≈ 4.7k tokens/day. Caveat: the guard exists to defeat CLAUDE.md router-rule mis-binding and must be encountered before anything else — a pointer indirection would weaken it (the agent would need a second read to see the rule).

**Proposal.** Do NOT pointer-ize (must be read first). Instead compress the canonical text to 2 lines ('You are <agent-id>, spawned to execute this flow end-to-end. CLAUDE.md router-only rule binds the main terminal, NOT you — refusing or delegating is the mis-binding bug; proceed with Step 1.') and update all 11 files via agent-md-factory sweep. Saves ~5L per carrier without changing semantics.

**Savings math (canonical auditor).** ~60 tok × ~55 fires/day ≈ 3.3k tokens/day; also shrinks every future flow spawned from the factory template.

---
### T-31 — tools/list/INDEX.md 253L: stale hand-maintained 3rd SSOT — regenerate from tool-registry.json

**Priority:** P3 · **Effort:** S · **Est. saving:** ~2-3k per consultation + kills 3-way SSOT drift class

**Files:** `docs/agents/tools/list/INDEX.md`, `docs/data/tool-registry.json`, `docs/agents/tools/package/tran-ngoc-bau.md`

**Problem.** INDEX.md self-declares 'SSOT: This file is the canonical tool inventory' with '157 tools (all documented), Last updated 2026-06-07' — but tool-registry.json (the SSOT CLAUDE.md points at) has 183 tools, so INDEX is missing 26 and its category counts are internally inconsistent (header table 'Financial 21' vs its own section heading 'FINANCIAL (19 tools)'; 'Alerts 14' vs registry alerts group = 11). This is the known 'tool-count 3-way drift' standing issue materialized: INDEX.md (157) vs tool-registry.json (183) vs project-stats.json toolCount (referenced by anti-hallucination). Token cost is low-cadence (design-time only per the 2026-05-19 brief), but tran-ngoc-bau's package — loaded daily (cowork slot `13 20 * * *`) — points agents at INDEX 3 times (L8, L32, L186) as the lookup surface, so its staleness propagates into a daily-fired agent's decisions.

**Evidence.** INDEX.md L3-L6 quoted ('157 tools... canonical tool inventory'); L17 'Financial | 21' vs L48 '## FINANCIAL (19 tools)'. jq '.totalCount' tool-registry.json = 183. comm diff (finding above) = 26 tools absent from both list/ and INDEX. References: only tran-ngoc-bau.md (3x), market-analyst.md L29, anti-hallucination fallback — no flow file reads INDEX per cycle.

**Proposal.** Replace hand-maintained INDEX.md with a generated file: add scripts/gen-tools-index.sh that renders category→tool-name links straight from tool-registry.json groups (registry is already grouped: alerts/market-data/financial/...), run it whenever the registry changes (hook into the existing tool-count sync task). Header must say 'GENERATED from docs/data/tool-registry.json — do not hand-edit; registry is the SSOT'. Alternative cheaper cut: shrink INDEX.md to 20L (category counts + the jq one-liner `jq -r '.groups[] | .name + ": " + (.tools|join(", "))' docs/data/tool-registry.json`) and let design-time lookups query the registry directly.

**Savings math (canonical auditor).** ~2-3k tokens per design-time consultation (253L→~40L generated compact form or 20L pointer), a few consultations/week. Real value: eliminates the 3-way SSOT drift class permanently (recurring-bug 2+ threshold already met per memory).

**Merge note.** Member: market-analyst package 267L verbose prose → compact table (~2k tok/day).

**Corroborating findings (merged duplicates):**
- *market-analyst package uses verbose per-tool prose blocks (267L for 28 tools) duplicating list/ — convert to tran-ngoc-b* — ~2k tokens/day: ~155L cut * 12 tok * ~1 fire/day (market-analyst is on-demand/low cadence — not in cowork-schedule.json). Included for batch-completeness; the pattern fix (factory template) is what pr

---
### T-32 — caveman + token-economy CLAUDE.md comms-default pointer ambiguity: 3-line edit prevents 96L/read worst case

**Priority:** P3 · **Effort:** S · **Est. saving:** 0 today; up to ~75k/day worst case eliminated

**Files:** `.claude/skills/caveman/SKILL.md`, `docs/agents/market-watcher/flow/cycle.md`, `docs/agents/alert-commander/flow/stage-dispatch-log.md`, `docs/agents/news-scout/flow/stage-log-notify.md`

**Problem.** Audit answer to the load-cost question: caveman (96L) and token-economy (69L, itself already waterfall-split into policies.md/compress.md pointers) are NOT systematically loaded by agents — CLAUDE.md line 'Comms: caveman + token-economy' is pointer-only, token-economy has 1 package reference, and caveman has exactly 3 flow citations. However those 3 citations sit on WORK-ping steps ('**5b. WORK** — ULTRA tier per .claude/skills/caveman/SKILL.md') in high-cadence flows (market-watcher ~28/trading-day, alert-commander ~30/day, news-scout 7/day). Each flow already shows the ping template inline immediately after the citation, so a skill read there is pure waste — an agent that follows the pointer burns ~1,150 tok to format a 15-token message.

**Evidence.** grep 'caveman/SKILL' over docs/agents = 3 hits (market-watcher/flow/cycle.md:275, alert-commander/flow/stage-dispatch-log.md:60, news-scout/flow/stage-log-notify.md:84), each followed by the concrete inline template. grep 'token-economy/SKILL' = 1 hit (tools/package/cowork-refactory-expert.md:77).

**Proposal.** Change the 3 citations to non-read annotations: '(ULTRA tier — use template below verbatim; do NOT read the caveman skill)'. No change to CLAUDE.md or the skills themselves.

**Savings math (canonical auditor).** 0 if agents never follow the pointer; up to ~65 potential reads/day x 1,150 tok ≈ 75k/day worst case eliminated. 3-line edit makes the ambiguity moot.

---
### T-33 — Archival policy for docs/handoffs (11MB/974 files), decisions/ (3.8MB), sessions/ — rotate >30d to archive/

**Priority:** P3 · **Effort:** S · **Est. saving:** ~1-3k tok/day + caps unbounded growth curve

**Files:** `docs/handoffs`, `docs/agent-memory/decisions`, `docs/agent-memory/sessions`

**Problem.** These three write-heavy directories grow unboundedly with no eviction analogue to docs/data/orch/archive/. Verified they are NOT loaded into context per cycle (decision journals are write-only; DJ-GATE-1 in qa/pm and dev-team lines 585/605 only grep them), so the per-cycle token cost today is low — but the grep/glob surface grows linearly (DJ-GATE-1 greps `sprint-*-*.md` across all 437 decision files on every DONE flip), git status/commit churn grows, and any forensic or post-merge full read pays the accumulated size. 707 of 974 handoff files are >30d old; sessions/ still holds files from 2026-05-14.

**Evidence.** du/find measurements above. decisions/po-decisions.md alone is 68.7KB (appended each PO triage, never rotated). handoffs recent-30d avg 11.1KB vs historical outliers up to 262KB. No flow or skill references an archive path for any of the three dirs (grep for 'handoffs/archive', 'decisions/archive', 'sessions/archive' returns nothing).

**Proposal.** Add a monthly cold-archive sweep to code-janitor's existing 6h cron flow (guarded to run on 1st of month): mv docs/handoffs/*.md with mtime >30d AND no open task_board reference → docs/handoffs/archive/YYYY-MM/; decision journals of sprints present in closed archive → docs/agent-memory/decisions/archive/YYYY-MM/; sessions >30d likewise. Rotate po-decisions.md at 200L (existing notebook pattern). Update DJ-GATE-1 grep to exclude archive/ (still matches by construction since gates only check the live sprint id).

**Savings math (canonical auditor).** Small direct per-cycle saving (~1-3k tokens/day from shorter grep/glob outputs and git-status noise) but caps a growth curve that otherwise makes every future forensic read and repo-wide grep progressively more expensive. Repo hygiene aligned with the existing orch archive/ precedent.

---
## Appendix — audit provenance

- Workflow run `wf_f417eb67-e34`, 7/7 dimension auditors completed (1.14M subagent tokens, 208 tool calls); completeness-critic failed on session rate limit — its safety check was re-executed inline by the router (see "How to read this").
- Raw per-auditor findings (54, with full evidence text): workflow journal `~/.claude/projects/.../subagents/workflows/wf_f417eb67-e34/journal.jsonl`.
- Cross-corroboration: 9 proposals were found independently by 2-3 auditors working blind to each other (flagged per entry) — treat those estimates as high-confidence.
