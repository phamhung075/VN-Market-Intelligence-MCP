# Decision Journal — Sprint TOKEN-ECONOMY-AUDIT · po

**Sprint goal:** Recover ~800k-1.2M tok/day (honest net after overlap) via lazy-load / main-flow-subflow splits per docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md
**Agent:** po
**Started:** 2026-07-17T04:46:00Z

---

### STEP po-S1 · po · 2026-07-17T04:46:00Z
**task-id:** TOKEN-ECONOMY-AUDIT (rerank of 27 remaining TE rows)
**what-done:** Re-ranked the 27 remaining TE backlog rows in BOUNDED-1's (priority_rank, backlog-idx) pick order via scripts/orch-apply.sh; wrote NB-AUDITOR-MAIN-SPLIT supersede marker.
**what-considered:**
- Lift-ALL above ULTRACODE + 6 active high sprints (blanket max elevation)
- Interleave/stage: P1 for high-ROI sequenced waves 2+3, front-of-P2 for governance/cleanup, P0 untouched — CHOSEN
- Elevate to P0 (rejected: token hygiene must not tie/jump genuine criticals incl UC-RDL-P1)
**why-decision:** BOUNDED-1 is the idle-capacity lane (WIP-cap 1) and is INDEPENDENT of the supervised sprint lane (wip_max=2) that drains the 6 active sprints — so elevating TE here cannot starve those sprints; the only real guard needed is not jumping the 6 P0 criticals. Staged lift: Band-1 (waves 2+3, 13 rows P2->P1, idx 0-12) captures ~90% of recoverable tokens (flow splits T-02/T-03/T-05 ~200k+200k+165k, skill cards T-08/T-11/T-12 etc.) and drains right after P0; Band-2 (13 rows @ front-of-P2, idx 13-25 — governance T-24/T-25/T-20 lifted P3->P2 as regression-stoppers that lock in Band-1 savings, unwaved-P2 T-18/T-19/T-22/T-27/T-28, cleanup T-29..T-33 lifted P3->P2) drains ahead of the generic P2 backlog without jumping genuine P1 product work. Simulated sort confirms 3 eligible P0 FACTORY rows still pick first, then all 13 Band-1 rows before every other P1.
**why-change:** No change from router intent. Dep gates already live (TE-T23 depends:[TE-T12] both P1, T-12 ordered first; TE-T03 depends:[TE-T01]=done_verified). TE-T15 left UNTOUCHED — already supervised:true (held out of BOUNDED-1 drainer), stays P3 at idx 308 (last), coordinated with RC-ORCHMONO per its own note. TE-T06 supersede note already present; added defensive superseded_by:TE-T06 on NB-AUDITOR-MAIN-SPLIT (priority=low, cannot pick before P1 TE-T06).

### STEP po-S2 · po · 2026-08-22T20:51:47Z
**task-id:** TE-T23 (review-lane ruling: QA CHANGES_REQUESTED vs dev-team no-op claim)
**what-done:** Ruled QA's 2026-08-14 CHANGES_REQUESTED UPHELD after re-verifying all 4 grounds against live HEAD; moved TE-T23 review[]→ready[] with next_agent=developer + 8 explicit ACs; minted companion FIX-DISPATCHCLAIM-CARD-TTL-ARG-SHORTHAND.
**what-considered:**
- Overrule QA, sign off DONE_VERIFIED as no-op (dev-team/BOUNDED-1's original claim) — REJECTED, claim is factually false on 4 of 4 counts
- Uphold QA, re-dispatch developer with delta-based ACs — CHOSEN
- Uphold QA but keep the brief's absolute ~58L target verbatim — REJECTED, baseline moved since 2026-07-12
**why-decision:** Verified live, not from either party's prose: step-2.5 is CLAUDE.md:7-14 = 8L (not the claimed 2L — the review_note counted only L7-8 and omitted the 3-row table at L10-14); `wc -l CLAUDE.md` = 64L, so the review_note's "63L, under the 58L target" is wrong twice (63≠64, and 63>58 is over not under); CLAUDE.md:8 is field-for-field identical to CARD.md:28-29 and L10-14's three outcomes map 1:1 onto CARD.md:31/32-33/35, so the 3-copy drift is live; commit 92ba46360 (TE-T12) says verbatim "Unblocks sibling row TE-T23 (... out of scope here)". Root cause of the false no-op claim: commit aef457f38 (2026-07-15, UC-RDL-P5) had already shrunk the block 21L→8L for a DIFFERENT task, so partial completion read as full completion — BOUNDED-1 compared against the wrong baseline instead of the AC.
**why-change:** Two PO additions beyond QA's note. (1) AC-7 is delta-based (−7L, 64→~57L) not the brief's absolute ~58L — the file took unrelated additions (f8d3891c6, 5a6cd5216, 9af50bb26) since the brief was written, so chasing 58L absolute would push a developer to delete unrelated lines. (2) Found a materialized instance of the very drift T-23 exists to kill: CARD.md:17/19/29 use non-canonical `ttl=` while CLAUDE.md:8 and SKILL.md:133/177/234 use `ttl_seconds`. Deleting CLAUDE.md:8 promotes CARD.md's wrong spelling to sole hot-path copy, so the companion row must land alongside; filed as its own agent-father row (.claude/skills/ is outside developer scope, agent-father init.md:63) rather than widening T-23's scope. AC-3 also pulls CLAUDE.md:17 into scope — the brief's own span measurement always included it, and orphaning the release half of a try/finally would be incoherent.
