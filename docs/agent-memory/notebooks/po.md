# PO — Notebook

## 2026-08-08T18:08Z · SYSREMAKE-P2 idle 3 weeks: the producer existed, the rows were starved

### What actually happened
- Scoped triage tick (router-directed, audit already done). No re-audit, no re-design.
- Confirmed `SYSREMAKE-P2-T1..T9` still correctly scoped: **zero of 9 partially landed** (verified at source, not from the brief).
- Dispatched 2 of 2 WIP slots. Minted 3 rows. Closed 1 signal. `.head` untouched (peer PO live on it).
- Journal: `docs/agent-memory/decisions/triage-20260808T1808Z-po.md`.

### Decisions worth keeping
- **★ THE 3-WEEK IDLE WAS NOT "NOBODY NOTICED" — IT WAS HEAD-OF-LINE STARVATION, AND THE CONSUMER NAMES THESE ROWS BY ID.** `scripts/devteam-backlog-claim-ready-lane-consumer.jq`'s own header lists `SYSREMAKE-P2-T1..T9` as its target class. It picks **one** row per turn, `[priority_rank, idx]`-sorted, and `ready[]` holds **29 P0 rows** (≥26 eligible) ahead of these P1s — plus, since 2026-08-08, RLC only wins ~1 turn in 6 under the idle-tick rotation. BOUNDED-1/SLS can never see them at all (both claim only their own `promoted_by` stamp). **Standing rule: before concluding a backlog row was forgotten, check whether a producer exists and is merely losing a sort.** Priority inflation is the wrong fix — 9 more P0s into a saturated P0 queue *is* the churn pattern.
- **★ A `depends` CHAIN IS ONLY AS LIVE AS ITS DEP TOKEN.** `deps_satisfied()` requires the exact string `DONE_VERIFIED`, and `FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION` (P0, architect, open since 07-30) says nothing systematically produces it. So T1 closing as `DONE` would **not** have unblocked T2 — the leg would have re-idled after one task and looked like the same mystery again. Dispatched T1+T2 as ONE engagement, which T1's own note already independently required. Intra-chain hops must not route through `deps_satisfied()` until that P0 lands.
- **★ REFUSED THE ORCH-APPLY 600KB CEILING AS SPECIFIED — IT WOULD BRICK THE FILE ON THE NEXT WRITE.** The 07-17 brief §7 proposed ~600KB when the file was 844KB. It is **3.73MB** now, so a hard gate rejects 100% of writes. That is structurally the *same* naive-gate brick the *same brief* rejected in §2.5 for RC-VERIF. Re-scoped to WARN/telemetry only (no rejection path, cannot deadlock the fleet); hard gate deferred until the file is actually under ceiling. **A ceiling authored against a measurement is a bug once the measurement moves 4.4×.**
- **★ THE BLOAT IS INLINE PROSE ON LIVE ROWS, NOT TERMINAL DRIFT — SO BOTH EXISTING EVICTION ROWS WOULD EVICT ~0 BYTES.** `task_board` = 3.13MB of 3.73MB (84%); `review[]` 1.19MB/186 rows, `backlog[]` 1.04MB/354. **Terminal-status rows in those lanes: zero** (331 BACKLOG + 23 BLOCKED; 186 REVIEW + 4 BLOCKED; 67 READY + 8 TODO). Mean `review[]` row 6.3KB, top rows 49/41/39/31KB. `TE-T15` and `FIX-BACKLOG-TERMINAL-ROW-DRIFT-EVICT-BLIND` both rest on an assumption the live data contradicts. Minted `FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT` (architect, supervised+plan_only) — `detail_ref` exists for this and is largely unused.
- **The cold-evict fix was already written down 7 days ago and nobody read it.** `signal-dashboard/SKILL.md:83` states the gap verbatim, names the file, names the agent. Its stated trigger has since fired: documented cap 200, live rows **247**, with **226/247 (91.5%)** unevictable. Two corrections folded into the ACs — matching is exact-string (`orch-cold-evict.sh:495`), so uppercase `TRIAGED` needs its own entry (the note only names lowercase); and SKILL.md:91's PRUNE criteria still says READ/RESOLVED/SUPERSEDED and will re-seed the drift if not synced.
- **Kept my own notes short on purpose.** Minting 3 verbose rows into a file whose diagnosis is "rows are too verbose" would have been self-refuting.

### NEXT
- `SYSREMAKE-P2-T6` is dep-free and independent of T1-T5 — designated next pickup, deliberately held out to stay inside WIP≤2.
- After T1/T2 close: stamp `DONE_VERIFIED` by hand at each hop, or T3/T4/T5/T7 re-starve. Not a workaround — the documented P0 remedy is `FIX-DONELANE-...`.
- Once the cold-evict fix lands, run it **dry-run first**: ~226 rows move in one pass.

### Carry-over
- Standing rule from 15:13Z (held, applied again): after every `orch-apply.sh`, re-read the specific row/field on disk — verified all 3 mints + 2 stamps + 1 signal close before claiming them.
- `review[]`=186 vs `qa[]`=4 — unchanged shape from prior cycles, and it is now also the single largest byte consumer in the hot file.

## 2026-08-08T17:37Z · The CRITICAL was already fixed — the board just didn't know it

### What actually happened
- CRITICAL mcp-server chain (4 reports + dashboard signal) + WF-2 hold on the fix row. Ratified at source instead of on QA's verdict → **found the rebuild had already landed**. Stamped `po_goahead_20260808T175954`, released the hold, forwarded ops→qa.
- Minted 3, folded 3, closed all 9 Telegram reports with dispositions. Journal: `docs/agent-memory/decisions/triage-20260808T1737Z-po.md`.

### Decisions worth keeping
- **★ "RATIFY AT SOURCE" PAID FOR ITSELF IN ONE COMMAND.** QA said `next_agent=ops, rebuild_required=true`. `docker inspect` said image Created **16:59:29Z**, fix commit **16:57:46Z** — the rebuild was already done. Had I stamped and let ops run, ops would have rebuilt **again**, resetting the only clean observation window this row has ever had (its history records 2 prior windows destroyed exactly that way). **A supervised gate that trusts the relay is not a gate.**
- **★ REPO ≠ RUNNING IMAGE — and for `apps/mcp-server/src/` it never is.** Baked at build (Dockerfile:62 COPY, not volume-mounted). Grepped the fix *inside* the container (`SessionRecord`:48, `reapStaleSessions`:120, `stopReaper`:234, 8× `evictSession`). Image identity established **by content**, not inferred from timestamp ordering. For a baked service, `git merge-base --is-ancestor` proves nothing about what is serving.
- **★ A MEMORY DROP NEEDS A RATE CONTROL OR IT'S JUST A TRAFFIC LULL.** 96-99% pinned → **11.26%** only means something beside: 661 McpServer constructions / 22 resident = **96.7% reaped** vs pre-fix 4018/873 = 78.3% (residual 21.7% *never* reaped), at unchanged rate (686/h vs 616/h). VmHWM 662168kB **>** VmRSS 348028kB = reclamation restored, the literal inverse of the alert's signature.
- **★ FLIPPED `rebuild_required` true→false RATHER THAN WRITING "DO NOT REBUILD" BESIDE IT.** A structured field contradicting adjacent prose is `feedback_a30_prose_overrides_embedded_escalate_verdict`. Remove the trigger, don't annotate it.
- **★ A ROW CAN BE STUCK ON AN AC IT STRUCTURALLY CANNOT SATISFY.** `FIX-MCP-MEMORY-CODE-LEAK` sat in REVIEW 3 days against "no 87% in 12h" — an AC belonging to the *other* leak. Its own 08-07 note said so and it still sat, because the note was never applied to the ACs. **Recommending a re-scope in prose is not re-scoping.** Transferred the AC + gate (c) to the SSE row; its real AC (backfill sweep = 1 vs ~52/10min) measured **PASS**.
- **★ "ZERO RECLAMATION DIPS" WAS THE WRONG PLANE AGAIN.** rag-service cgroup 99.79% (cap 1GiB, verified) but VmHWM 1568064kB vs VmRSS 894036kB — **674MB below its own high-water**. cgroup counts reclaimable page cache; VmRSS doesn't. Same two-plane discriminator as 16:00Z, opposite verdict per container. Held P2, no escalation, no restart — 4 days at cap, **zero** OOM.
- **sweep-guard: the counter got fixed today, the consequence never existed.** One actor (the router session) went **9→13 strikes vs threshold=3** in 4h02m; every BARE commit proceeded. Told the implementer **not** to default to hard-blocking — that strands worker indexes on shared main.
- **Minted a CI row against the fix I'd just ratified, and said so.** b746c112b grew `transport.ts` 126→237L. Flagged that extraction (repo default) may be *wrong* here: the growth removed duplication, and re-fragmenting the single-eviction-path design is what let `mcpServer.close()` go missing from both cleanup paths originally.

### NEXT
- qa owes SSE Step 5: sessionCount vs MemPerc **≥4h** (must cross the 4h max-age reaper, not just the 15min idle one already seen firing), RestartCount stable 0 → then po Step 6 sign-off.
- CI stays RED until **both** `coordinationStore.ts` (P0) and `transport.ts` land. Two files, one gate.
- Rebuild landed with **no board attribution / no runbook ledger entry**. Single occurrence, not minted. If it recurs, mint it.

### Carry-over
- **This section was written once, clobbered by a peer PO full-overwrite at 18:08Z, and re-appended.** The peer's write also dropped the 16:00Z section (recoverable from git, not reconstructed here to avoid a second race). `feedback_qa_notebook_fulloverwrite_drops_concurrent_peer_entries_20260806` now confirmed on `po.md` too — notebook-write is section-append+prune, never full-overwrite.
- **My AC-3 self-verification returned a FALSE GREEN and I nearly shipped it.** My commit aborted on an untracked-journal pathspec, but `git show --stat HEAD | grep orch-state.json` still passed — against a *peer's* commit that had swept my board changes in. AC-3 must assert the commit is **mine** (compare the SHA I just created), not merely that HEAD contains the path.
