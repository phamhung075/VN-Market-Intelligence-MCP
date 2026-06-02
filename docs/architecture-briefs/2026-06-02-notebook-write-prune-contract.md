<!-- size-justification: ~130L — root-cause brief with 4 resolved questions + precise change scope; per-class contract table replaces child-extract as table is self-contained and required for agent-father to implement without ambiguity -->

# Architecture Brief — Notebook Write/Prune Contract

**Date:** 2026-06-02 | **Author:** agents-architect | **Status:** DECIDED  
**Promotes:** NB-NOTEBOOK-WRITE-FLEET-ALIGN (backlog → active)

---

## Root Cause (Verified, Not Relayed)

Four distinct failure modes, not one. Ranked by severity:

**F-1 — Intra-section accumulation (unified-agent, 223L)**  
`## Prior cycles` is a permanent named section whose body grows without bound. The SKILL's AC-2 prune fires on whole `##` blocks; it cannot see inside a block. `## Prior cycles` currently holds ~145L of `###` sub-entries appended each dish cycle. AC-2 is structurally blind to this accumulation; NB-PRUNE-1 anchor-widening was inert because the prune unit is always the whole `## ` block, not its contents.

**F-2 — Double-write conflict in bctc-analyst (172L)**  
`stage-log-notify.md` L16 says "Overwrite" (full-file replace). `cowork-end-cycle` SKILL (called at end of same cycle) calls `notebook-write` SKILL which does section-append+prune. The agent follows `cowork-end-cycle` → append path, making the "Overwrite" instruction dead. With 6 `## cNNN` sections accumulating (not capping at 3), prune should fire at 4th section but apparently does not — because the agent reaches AC-5 only if it follows the SKILL's AC-3 protocol, which the flow bypasses by inlining its own notebook write template before hitting `cowork-end-cycle`.

**F-3 — AC-5 write-time guard absent from flow invocation paths**  
The guard lives in the SKILL (AC-5, SKILL.md L72-91), is marked MANDATORY, but is invoked only when an agent fully delegates to the SKILL. Any flow that inlines its own `wc -l` gate (none do) or skips the SKILL's steps silently bypasses it. Chef flow Step 8 specifies its own append template without routing through `notebook-write` SKILL → AC-5 never fires. bctc-analyst `stage-log-notify.md` likewise inlines the write, then chains `cowork-end-cycle` after commit, so AC-5 runs too late (post-commit).

**F-4 — market-watcher OVERWRITE contract written but not enforced at section granularity (156L)**  
`cycle.md` Step 5 says "OVERWRITE, target ≤50L, hard cap 80L". The agent writes a single large OVERWRITE (the whole file, 156L) because the format template in `cycle.md` enumerates far more fields than ≤50L can hold. The OVERWRITE contract is correct in intent but the template is not trimmed to match the cap.

---

## Resolved Questions

**Q1 — Prune granularity: per-`##` block delete vs per-section line budget vs hard total truncation?**

DECISION: **Two-tier enforcement, not one.**

Tier-A (overwrite class): Single-section overwrite. File stays bounded by the template itself; cap enforced at write time by trimming the template to ≤50L/≤80L depending on agent class.

Tier-B (append class): Per-cycle section ≤60L + 3-section retention (AC-2/AC-3 as written) + **mandatory intra-section pruning** for agents that use a single permanent accumulator heading (`## Prior cycles` pattern): the permanent heading's content must itself be pruned to ≤3 sub-sections (oldest `### ` block deleted each cycle) using the same Edit-delete pattern as AC-3. This is a new rule: **AC-2b — intra-section prune for permanent accumulator headings.**

Hard total-line truncation (AC-5) is the last-resort backstop, not the primary mechanism.

**Q2 — Overwrite vs append by agent class: resolved.**

| Class | Agents | Contract | Cap |
|---|---|---|---|
| OVERWRITE | po, market-watcher | Single-cycle full-file replace; no section accumulation; preamble + 1 section only | ≤50L (po), ≤80L (market-watcher) |
| APPEND | unified-agent (CHEF), news-scout, bctc-analyst, agents-architect, digest-predict, fb-market-poster | Section-append + 3-section retention (AC-2) + AC-2b intra-section prune if permanent accumulator present | ≤200L file; ≤60L per section |

The L95 TODO contradiction is RESOLVED: po uses OVERWRITE (intentional, ≤50L); developer/CHEF use append-and-prune (also intentional). These are different agent classes. The SKILL should document both classes explicitly instead of embedding a TODO comment.

**Q3 — Why isn't AC-5 firing at write time across ≥3 agents?**

AC-5 is absent from the effective write path in all three breaching agents:
- unified-agent CHEF: Step 8 inlines append spec, routes to `cowork-end-cycle` only after notebook write is done. `cowork-end-cycle` → `notebook-write` SKILL would re-run the write, creating double-write risk. In practice agents skip the second invocation.
- bctc-analyst: `stage-log-notify.md` runs its own Write/Overwrite before `cowork-end-cycle`. The SKILL's AC-5 is never reached.
- news-scout: Same pattern — inline append in `stage-log-notify.md`, then `cowork-end-cycle` at end. AC-5 is advisory at best.

Fix: AC-5 must run as an explicit post-write bash check in **each flow's own notebook-write step**, not delegated to a chained skill. The pattern: write → `wc -l` check → prune-if-needed → commit.

**Q4 — Exact scope of changes.**

---

## Change Scope (agent-father implements)

**S-1: `docs/agents/unified-agent/flow/chef.md` Step 8** (APPEND class, F-1 fix)  
Replace the current free-form append spec with:  
(a) Append new `## Session: <date>` section (≤60L, bullet list of dish summary only — not full TNB walkthrough).  
(b) After append: count `grep -c "^## " notebook` → if ≥4, delete oldest `## ` block (AC-3).  
(c) Locate `## Prior cycles` block → count `grep -c "^### " inside block` → if ≥4, delete oldest `### ` sub-block (AC-2b).  
(d) Run `wc -l` gate → if >200, trim current section to ≤60L.  
(e) Commit. Remove `cowork-end-cycle` notebook delegation (step already done inline — keep session-log + doc-self-heal + self-critique from cowork-end-cycle, but skip the notebook-write step to avoid double-write).

**S-2: `docs/agents/bctc-analyst/flow/stage-log-notify.md`** (APPEND class, F-2 fix)  
Change "Overwrite" to "Append section" using SKILL AC-3 protocol. The cycle summary template stays (already ≤60L per section). After append: AC-3 prune + AC-5 wc-gate + commit. Remove the redundant `cowork-end-cycle` notebook delegation (same as S-1).

**S-3: `docs/agents/news-scout/flow/stage-log-notify.md`** (APPEND class, F-3 fix)  
After the inline append, add explicit AC-5 wc-gate check before commit. Remove `cowork-end-cycle` notebook delegation (same rationale). The preamble header line (1L of dense summary) must be capped: truncate to 200 chars or move to a separate `## Summary` section that gets overwritten each cycle.

**S-4: `docs/agents/market-watcher/flow/cycle.md` Step 5** (OVERWRITE class, F-4 fix)  
Trim the cycle-write template to ≤80L. Move the per-stock signal table to a `## Carry-over` section (overwritten) + a compact `## Metrics` block. Total must be ≤80L including all content. Add post-write `wc -l` guard: if >80L, fail-loud (not silent).

**S-5: `.claude/skills/notebook-write/SKILL.md`** (contract clarification)  
Replace L95 TODO comment with explicit two-class table (OVERWRITE class / APPEND class) matching Q2 decision above. Add AC-2b rule for permanent accumulator headings. Remove ambiguity.

**S-6: `docs/data/file-size-caps.json`** (add sub-cap)  
No file-level change needed (200L cap correct for APPEND class). Document-only note: OVERWRITE agents target ≤80L; this is a template discipline, not a backstop cap.

---

## Not in Scope

- Changing the backstop hook (context-bloat-backstop.sh) — it is working correctly.
- Changing claude-manager-helper reactive prune — it is the right last-resort.
- Any changes to non-breaching agents (digest-predict, fb-market-poster, agents-architect, po) — their current line counts are within cap.

---

## Handoff to agent-father

Implement S-1 through S-5 in one commit. S-6 is documentation-only, can be bundled.  
QA proof: after implementation, run each agent through one full cycle and verify `wc -l < notebook_path` returns ≤200. No manual backstop-prune should trigger.
