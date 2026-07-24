# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · architect

**Sprint goal:** Make cowork `guaranteed:true` an honored contract — bounded catch-up/look-back for slots whose window elapsed during host standby / session-down, or correct the label.
**Agent:** architect
**Started:** 2026-07-22T22:03:07Z

---

### STEP architect-S1 · architect · 2026-07-22T22:06:54Z
**task-id:** BA-COWORK-GUARANTEED-SLOT-CATCHUP
**what-done:** Designed the shared catch-up module extension (new pure domain sibling `cowork-catchup-predicate.js`, mirroring `cadence-policy.js`; `task_list_held` delivery-check kept per-caller/infrastructure per DDD golden rule); ruled explicitly on FR-8 (raise `FIRE_TIMEOUT_SECONDS` per dish_type + accept bounded residual) and Track-B (document residual, no keep-awake daemon); reassigned owner=developer/next_agent=pm on all 5 consolidated rows + the umbrella task.
**what-considered:**
- FR-3/FR-7 delivery-check inside the pure matcher (rejected — breaks domain/infrastructure DDD rule, no I/O in a sync CLI) vs per-caller conditional `task_list_held` call reusing the SAME response for both catch-up-eligibility AND `last_fired` reconciliation (chosen — zero extra gateway calls, NFR-3 preserved).
- FR-7 Option (a) per-flow self-write vs Option (b) reconciler (chosen — (a) reintroduces the exact lost-update race class `last-fired.md`'s batched-write was built to avoid, and contradicts live prior art already on `FIX-COWORK-LASTFIRED-DECOUPLE-FROM-DELIVERY`'s own board note requiring a path-agnostic delivery-proof source).
- FR-6 "which plane stands down" vs "ratify published-marker as sole symmetric arbiter" (chosen the latter — a stand-down mechanism would be a NEW derived signal, repeating this exact sprint's own root-cause class of staleness bug).
- FR-8 raise-timeout vs diagnose-flow-duration vs accept-risk (chose raise + accept-residual — shortening the TNB 6-layer methodology is a PO/BA product call, out of architect's boundary; diagnosis is ops/developer's job, not mine).
**why-decision:** Each choice was grounded in a live-verified brownfield finding (grep-confirmed zero MCP access in the firer script, zero `last_fired` write call-sites, `claimed_at` field existing in `listHeldTasks()`, chef.md's 812-line sequential-no-subagent-fanout structure) rather than the BA spec's prose alone — matches `never_design_without_reading`.
**why-change:** New brownfield finding not in BA spec: `digest-daily` keys its published marker on UTC-date, not VN-date (unlike the other 3 flows) — ruled to mirror, not correct, in this sprint (scope discipline, avoids a duplicate-post regression at the day-boundary).

### STEP architect-S2 · architect · 2026-07-24T16:58:00Z
**task-id:** FACTORY-GUARD-CI-size-lint-justification
**what-done:** Verified zero existing CI/lint mechanism covers `apps/**/*.ts|py|go` file-size (only doc-plane `context-bloat-backstop.sh` hook exists, explicitly "code NOT governed"); live-counted 748 files >120L, 733 unjustified (ticket's "600+" stale); designed baseline/ratchet CI gate (grandfather today's debt, fail only new/regrown offenders); minted child dev row `FACTORY-GUARD-CI-SIZELINT-IMPL`.
**what-considered:**
- Blanket hard-fail on all 733 offenders now (rejected — would red every push instantly; ticket intent is "stop regrowing", not "fix today").
- Diff-only (touched-files) CI check vs baseline-manifest ratchet (chose baseline manifest — a full-tree scan at CI time also catches non-Claude-tool edits the doc-plane hook structurally misses, which is the whole point of a real CI gate vs a session hook).
- Routing child task to `agent-father` (dispatcher's suggestion, rejected — live-verified `agent-father` init.md disclaims production code, and sibling row UC-ASL-P6 is `supervised:true` for exactly this un-routable next_agent+zone combo) vs `developer` (chosen — zone-detect Tier-3 for `cross-service/`).
**why-decision:** Ticket prose ("<!-- --> for TS/MD") was syntactically wrong (HTML comments invalid in `.ts`) and the offender count was stale — both corrected against live grep/wc evidence, not assumed.
**why-change:** Backlog note said "scope via spike FACTORY-GUARD-CI-REGRESSION-SPIKE first" — that spike is still unclaimed; scoped this row standalone per direct dispatch since design is self-contained and creates no rework risk for the spike later.
