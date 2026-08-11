# Decision Journal — Sprint CHORE-COMMIT-OVERHEAD · po

**Sprint goal:** Right-size the COMMIT/INLINE/TRACKING layer on top of the fleet's coordination writes, without touching the writes themselves (per `docs/architecture-briefs/2026-08-11-chore-commit-overhead-audit.md`).
**Agent:** po
**Started:** 2026-08-11T12:54:15Z

---

### STEP po-S1 · po · 2026-08-11T12:54:15Z
**task-id:** CHORE-COMMIT-OVERHEAD (sprint mint; 4 backlog rows)
**what-done:** Minted 4 backlog rows + 1 sprint_goal entry in ONE orch-apply.sh write (task_total 751→755) from the 2026-08-11 chore-commit-overhead brief; kicked next_agent=pm on all 4, no dispatch (WIP=2 at cap).
**what-considered:**
- Mint the brief's 3 recommendations 1:1 as 3 rows (fastest, matches the dispatch request).
- Mint 4 — split brief R3 into consumer size-gate + producer payload_ref-scoping legs.
- Direct-implement R3 as "flow-doc-only prose" per the brief's own §8 sequencing note.
**why-decision:** Source-check found `scripts/db-integrity-history-append.sh:98` hardcodes `--payload-ref` at the ENTIRE 745KB accumulator — the size gate bounds the symptom, that hardcode is the cause; CLAUDE.md mandates root-cause. Direct-implement rejected: two acceptance-bearing hazards (dedup-hash-over-pointer re-drain loop; mutex bracket break) make all three non-trivial.
**why-change:** Brief under-scoped 3 of 4 rows — R3 zone confirmed but its dedup-hash coupling missed; R2 missed that untracking guarantees Stage-1c dangling refs on clean checkout; R1 missed that `emit-dashboard-row.sh` holds `commit-mutex:main` across write+commit, so deferring the commit breaks the bracket (R1 sized S→M).
