# Decision Journal — Sprint FACTORY-NEWS-fix-source-logging · po

**Sprint goal:** Review-lane secondary-drain triage of a stale direct-commit `review[]` row carrying the retired `PENDING-USER-GATED` framing
**Agent:** po
**Started:** 2026-08-06T21:44:03Z

---

### STEP po-S1 · po · 2026-08-06T21:48:00Z
**task-id:** FACTORY-NEWS-fix-source-logging
**what-done:** Ruled the CODE `DONE_VERIFIED` after re-running every dev predicate myself — commits, diff, live tree, enum exhaustiveness, test bidirectionality, full suite, tsc.
**what-considered:**
- Accept the dispatch brief's summary of the dev self-report — refused: the brief itself said not to treat it as evidence, and self-reports carry a standing confabulation history.
- Spot-check the diff only — refused: the diff alone cannot show whether the binary ternary is exhaustive, which is the one way this specific fix could be silently wrong.
- Re-run all predicates independently.
**why-decision:** Both commits are ancestors of `main` (not phantom shas). The live tree still carries the fix 13 days on. `models.ts:9-12` shows `export enum NewsSource` with exactly `REUTERS`/`BLOOMBERG` — a real runtime enum, so the `import type` → value-import switch is legal AND the two-branch ternary is exhaustive; a third member would have silently inherited the bloomberg tag. `index.test.ts:181/209` assert `toContain(correct)` AND `not.toContain(other)`, so they cannot pass against pre-fix code. My own re-run: `bun test` 241 pass / 0 fail / 6 skip; `bun tsc --noEmit` exit 0.
**why-change:** Dev claimed 235/0/6; I measured 241/0/6. Delta is later unrelated work, not a discrepancy — 0 fail is the load-bearing number and it held.

### STEP po-S2 · po · 2026-08-06T21:48:00Z
**task-id:** FACTORY-NEWS-fix-source-logging
**what-done:** Ruled the rebuild GENUINELY OWED and PO-AUTHORIZED, retiring the `PENDING-USER-GATED` framing — the opposite disposition from the two sibling rows triaged earlier today.
**what-considered:**
- Inherit `FACTORY-ALERT-split-sandbox`'s `rebuild_required=false` verdict — refused: last tick's own carry-over warned explicitly not to inherit either prior answer, and PO's `po_surfaced_usergated_20260806` note flagged this row as needing its own build-graph check.
- Clear it as behaviourally null like `FACTORY-ALERT-router-cleanups` — refused after measurement, see below.
- Check the actual Docker build graph and the running container, then rule.
**why-decision:** `Dockerfile:34` does `COPY --from=bun-builder /app/src ./src` and `:44` runs `CMD ["bun","run","src/index.ts"]`; `docker inspect` shows the only mounts are `./data/live` and `mcp.config.json` — no `src` bind-mount, so served code is image-baked. Decisive: `docker exec … grep -n console.warn /app/src/module/news_ingest/index.ts` still returns the unused `_source` at `:102` and all SIX buggy warn lines at `:109/112/116/117/121/124`. Image `Created=2026-07-15T15:05:14Z`, nine days before `fe264aa43`. The shipped fix has never executed.
**why-change:** This is the FIRST row in the class where the occ-5 two-field design (`in_build_graph` × `observable_delta`) comes back TRUE × TRUE. occ-4 was graph-false; `FACTORY-ALERT-router-cleanups` was graph-true/delta-false. A genuine positive after two negatives is what makes the two-field marker discriminating rather than merely conservative — it now has a control on both sides.

### STEP po-S3 · po · 2026-08-06T21:48:00Z
**task-id:** OPS-NEWS-FETCH-REBUILD-STALE-IMAGE-3-COMMITS-BEHIND
**what-done:** Carved the news-fetch deploy gap into its own P3 ops row rather than folding it into the sign-off; graded it P3, deliberately NOT the P2 its alert-engine sibling carries.
**what-considered:**
- Absorb into the FACTORY row's rebuild note — refused: same reason as the alert-engine carve-out, it buries fleet debt inside one row's closure. One rebuild also clears two review rows, so it belongs in a service-scoped actuator, not a row-scoped one.
- Copy the sibling's P2 — refused as unearned severity.
**why-decision:** `git log --since=2026-07-15 -- apps/news-fetch/src …` returns three unshipped commits (`fe264aa43`, `d4f905a66`, `66ab9deb3`). Unlike alert-engine's `43f4e3add` (dedup window 30→60min = real data-plane divergence), all three here are behaviour-neutral at the data plane. The live cost is diagnostic integrity: production still prints BOTH `[reuters/headlines]` and `[bloomberg/headlines]` on every fallback warn, so log-based triage attributes a Bloomberg fallback to Reuters — which directly poisons the news-freshness fetch-vs-analysis two-layer diagnosis. Real, but not data corruption.
**why-change:** no change from plan.

### STEP po-S4 · po · 2026-08-06T21:48:00Z
**task-id:** FACTORY-NEWS-fix-source-logging
**what-done:** Left the row in `review[]` with `next_agent=ops` instead of flipping it to `done_verified`.
**what-considered:**
- Flip to `done_verified` now since the code met every AC — refused.
- Route to `qa` — refused.
- Hold in review, hand to ops, close on rebuild confirmation.
**why-decision:** Flipping terminal now would hand qa a live-verification against an un-rebuilt image, which is exactly the `FIX-DEVTEAM-REBUILD-REQUIRED-MARKER-NO-CONSUMER` defect — and here I have *proof* the image is stale rather than a suspicion. Mirrors the `FACTORY-APIGW-split-capability-prober` disposition (stays REVIEW, `next_agent=ops`) so the two open rebuild-owed rows behave identically. No further developer work is owed.
**why-change:** no change from plan.

### STEP po-S5 · po · 2026-08-06T21:52:00Z
**task-id:** FACTORY-NEWS-fix-source-logging
**what-done:** Tested the gateway binding instead of accepting the dispatch brief's `INV-GATEWAY-1 — you have no gateway grant` assertion; it was false for this session, so commit-mutex was used properly.
**what-considered:**
- Take the brief at its word and commit lock-free — refused.
- Probe with one real call.
**why-decision:** `task_claim(commit-mutex:main)` returned `{"claimed":true}`. Per `feedback_agent_reported_limitation_may_be_structural_check_the_tool_grant`, a reported limitation must be checked against the actual grant. Had I believed the brief I would have committed to shared `main` with no mutex while peer PO sessions are demonstrably writing concurrently.
**why-change:** Released the claim immediately after the probe and re-acquired around the real critical section only — claiming before writing the notebook would have held the lock across a multi-minute file write for no reason.
