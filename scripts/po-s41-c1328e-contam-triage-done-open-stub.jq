# po-S41 — accept arch-S14 CONTAM verdict (brief fa223773) for Task 1328e.
# (1) Flip C7 holder: record 1328e carve-out as TRIAGE-DONE (reclassified C7->C5 MOCK-CONTAM, routed to 047 fix).
#     C7 stays BACKLOG for its OTHER live seeds (1792 independent, 1352a A-1 independent).
# (2) Open NEW dev-fix task FIX-CI-C1328E-047-CONTAM-STUB (dev-mcp-server, TODO ready to claim).
# Scoped map on active_sprints[24].tasks ONLY. NO ci_absolute mutation. NO long_tail mutation.
.task_board.active_sprints[24].tasks |= (
  map(
    if .id == "FIX-CI-C7-ASSERTION-LOGIC" then
      .carve_outs = ((.carve_outs // []) + [{
        "seed": "1328e-conviction-routing",
        "status": "TRIAGE-DONE",
        "reclassified": "C7 assertion-logic -> C5 MOCK-CONTAM (arch-S14 verdict, brief fa223773)",
        "verdict": "TEST-HARNESS / MOCK CONTAMINATION (classification c). Prod CORRECT — NO prod fix, NO test REMOVE. The 5 failing it() in 1328e-conviction-display.test.ts (10 native fails = 5 it x 2) are VICTIMS of mock.module() contamination leaking from sibling 047-bctc-orchestrator.test.ts.",
        "routed_to": "FIX-CI-C1328E-047-CONTAM-STUB",
        "carved_by": "po-S41",
        "carved_at": "2026-06-09T13:20:00Z"
      }]) |
      .title = (.title + " [po-S41: 1328e CARVED OUT -> reclassified C5 MOCK-CONTAM per arch-S14 brief fa223773, routed to FIX-CI-C1328E-047-CONTAM-STUB. C7 stays BACKLOG for remaining seeds: 1792 (independent), 1352a A-1 (independent).]")
    else . end
  )
  + [{
    "id": "FIX-CI-C1328E-047-CONTAM-STUB",
    "type": "FIX",
    "owner": "dev-mcp-server",
    "status": "TODO",
    "size": "S",
    "zone": "apps/mcp-server/src/__tests__/",
    "priority": "high",
    "sprint": "CI-RED-RECONCILE",
    "depends": [],
    "labels": ["ci-red-reconcile", "mock-contam", "c5-cure", "teardown-restore", "047-contaminator"],
    "root_cause": "mock-contamination (C5) — NOT assertion-logic. 047-bctc-orchestrator.test.ts has a file-top/module-scope mock.module() stub of telegram.js that leaks (never restored) into sibling 1328e-conviction-display.test.ts dispatched after it in the same bun run, breaking the 5 it() (10 native fails) that assert CURRENT-CORRECT prod behavior.",
    "classification": "TEST-HARNESS / MOCK CONTAMINATION (arch-S14 verdict, brief fa223773). Prod is CORRECT — NO prod fix, NO test REMOVE. Fix the CONTAMINATOR (047), not the victim (1328e).",
    "title": "FIX 1328e CONTAM: extend 047-bctc-orchestrator.test.ts telegram stub + teardown-restore (1352a precedent) so its mock.module() no longer poisons 1328e-conviction-display.test.ts. Prod telegram.ts CORRECT (severity gate 553-555 MEDIUM/LOW return false; conviction block 564-569; splitMessage 141 / TELEGRAM_MAX_LENGTH=4096 135 in coreSend 194; fetchFn injection 587-590 -> coreSend 186). Edit ONLY 047; ZERO change to 1328e.",
    "scope": "Edit ONLY apps/mcp-server/src/__tests__/047-bctc-orchestrator.test.ts (the CONTAMINATOR), per the established 1352a teardown-describe precedent: (1) at file top, BEFORE the existing mock.module(), add frozen-real import captures for notifyTelegramAlert, notifyTelegramDocument, formatConvictionBlock, deleteTelegramBug. (2) extend 047's EXISTING telegram stub to include those 4 exports (notifyTelegramAlert/notifyTelegramDocument -> stub noop; formatConvictionBlock -> real; deleteTelegramBug -> stub noop). (3) add mock.module(\"../infrastructure/notifiers/telegram.js\", () => ({ ...frozenReals })) inside/after the existing afterAll to RESTORE on teardown. C5-CURE ABSOLUTE: NO new file-top/module-scope mock.module() may be introduced. ZERO changes to 1328e-conviction-display.test.ts.",
    "gate": "Router gates on CI run: Task 1328e native fail 10 -> 0 (primary). Task 1352a PARTIAL — same 047 stub-extension cures 1 of 1352a's 2 fails (the `SyntaxError: Export named 'notifyTelegramDocument' not found`, 2->1). The OTHER 1352a fail (A-1 `Expected: 1, Received: 2`) is INDEPENDENT — separate later triage, NOT in this scope. Task 1792 NOT covered (independent root: bugMessages empty / bctc_signal_debounce DB) — separate later triage.",
    "needs": "dev-mcp-server applies 3-step 047 stub extension; tsc --noEmit clean; NO new mock.module(); commit own paths explicit pathspec; router pushes + gates.",
    "baseline_pass": 11693,
    "baseline_absolute": "68 (sha 7040cfb6, run 27207225757, job 80326149577)",
    "projection": "1328e 10->0 (primary) + 1352a 2->1 (partial, the notifyTelegramDocument SyntaxError cured). 1352a A-1 + Task 1792 NOT scoped here.",
    "brief": "docs/architecture-briefs/2026-06-09-ci-c1328e-conviction-routing-triage.md (arch-S14, commit fa223773)",
    "reference_precedent": "1352a teardown-describe restore pattern",
    "created_at": "2026-06-09T13:20:00Z",
    "created_by": "po-S41",
    "note": "[po-S41 DJ-GATE-1] CONTAM verdict accepted (brief fa223773). Fix CONTAMINATOR 047, NOT victim 1328e. C5-cure ABSOLUTE: no new module-scope mock.module(). ci_absolute UNCHANGED 68 (no test set change yet; rebaseline only AFTER dev fix + router gate)."
  }]
)
