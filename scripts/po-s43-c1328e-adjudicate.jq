# po-S43 — Adjudicate arch-S15 re-triage verdict for CI Task 1328e (brief 2026-06-09-ci-c1328e-retriage-arch-s15.md)
# Single board write under commit-mutex DJ-GATE-1.
# (A) FIX-CI-C1328E-047-CONTAM-STUB : REVIEW -> DONE-superseded (KEEP e57494d3 on main; cite 1352a 4->2 side-win; 1328e objective reassigned)
# (B) OPEN FIX-CI-C1485-TELEGRAM-MOCK-RESTORE (TODO, dev-mcp-server) carrying arch-S15 fix spec verbatim
# (C) ci_absolute + long_tail.absolute STAY 68 (NOT touched here)
# Scope: ONLY the CI-RED-RECONCILE active_sprints entry's .tasks array.
#
# Inputs via --arg: $now (UTC ISO)
.task_board.active_sprints |= map(
  if (.id? == "CI-RED-RECONCILE") or ([.tasks[]?.id] | index("FIX-CI-C1328E-047-CONTAM-STUB"))
  then
    .tasks |= (
      # (A) terminal state for the prior cure
      ( map(
          if .id == "FIX-CI-C1328E-047-CONTAM-STUB"
          then
            .status = "DONE-SUPERSEDED"
            | .terminal_reason = "GATE-FAIL for the 1328e objective (10 fail -> 10 fail on full-CI ordering, run 27209642428 job 80334814093, gate signal 7f1f48b3). The arch-S14 single-contaminator(047) hypothesis is DISPROVEN for 1328e. KEEP on main: dev commit e57494d3 already pushed -> NO revert. It DID deliver: (1) cured the 1352a-document-notifier contamination (1352a 4->2) and (2) added legitimate 047 afterAll teardown hygiene (C5-cure honored). NET-NEUTRAL on absolute (68->68). The 1328e cure objective is REASSIGNED to FIX-CI-C1485-TELEGRAM-MOCK-RESTORE per arch-S15 (brief 2026-06-09-ci-c1328e-retriage-arch-s15.md)."
            | .superseded_by = "FIX-CI-C1485-TELEGRAM-MOCK-RESTORE"
            | .note = "[po-S43 DJ-GATE-1 " + $now + "] REVIEW->DONE-SUPERSEDED. arch-S15 re-triage: root cause is a SECOND contaminator 1485-telegram-mock-isolation.test.ts (pos 89, no afterAll restore) leaking `{ ok: true }` stub that 047 then froze as _real. 047 change KEPT on main (e57494d3, do NOT revert): side-win 1352a 4->2 + 047 afterAll hygiene. 1328e+235 cure reassigned to FIX-CI-C1485-TELEGRAM-MOCK-RESTORE. ci_absolute UNCHANGED 68 (gate did not improve absolute). | PRIOR: " + (.note // "")
          else .
          end
        )
      )
      # (B) append the new cure task
      + [ {
            "id": "FIX-CI-C1485-TELEGRAM-MOCK-RESTORE",
            "type": "FIX",
            "owner": "dev-mcp-server",
            "status": "TODO",
            "size": "S",
            "zone": "apps/mcp-server/src/__tests__/",
            "priority": "high",
            "sprint": "CI-RED-RECONCILE",
            "depends": [],
            "labels": ["ci-red-reconcile","mock-contam","c5-cure","teardown-restore","1485-second-contaminator","telegram-notify"],
            "root_cause": "SECOND CONTAMINATOR (arch-S15). apps/mcp-server/src/__tests__/1485-telegram-mock-isolation.test.ts (CI pos 89) installs `notifyTelegramAlert: async () => ({ ok: true })` inside TWO it() bodies with NO afterAll restore. The stub leaks into the Bun process-global ESM registry for all 800+ subsequent files. `{ ok: true }` is the EXCLUSIVE fingerprint in 1328e's failures (Expected:false Received:{ok:true}; fetchFn calls.length=0). 047's afterAll (pos 315) captured the already-contaminated module as _real, so its restore reinstalled the 1485 stub -> that is why the arch-S14 047 cure failed. Prod telegram.ts notifyTelegramAlert is UNCHANGED and CORRECT (returns boolean result.ok, never {ok:true}); all 5 it() in 1328e assert correct current prod behavior => NOT REWRITE, NOT REMOVE.",
            "classification": "TEST-HARNESS / MOCK CONTAMINATION (arch-S15 verdict). Fix at the SOURCE (1485 teardown restore). Prod CORRECT -> NO prod fix, NO test REMOVE, NO test REWRITE. NO change to 047, NO change to 1328e.",
            "title": "FIX 1328e+235 CONTAM at SOURCE: add afterAll teardown restore to 1485-telegram-mock-isolation.test.ts so its it()-scoped `notifyTelegramAlert: async () => ({ ok: true })` stub no longer leaks into the Bun ESM registry for the 800+ downstream files (1328e pos 941, 235 pos 775). Edit ONLY 1485.",
            "scope": "Edit ONLY apps/mcp-server/src/__tests__/1485-telegram-mock-isolation.test.ts. (1) add `afterAll` to the bun:test import (line 13) -> `import { describe, it, expect, afterAll } from \"bun:test\";`. (2) at file bottom, AFTER the describe block (after line 83), add an afterAll that restores the real module via mock.module(\"../infrastructure/notifiers/telegram.js\", () => ({ ... })) re-registering ALL 8 exports from _realMod1485 (the cache-busted real module already loaded at file top line 17 via `?isolate=1485`): sendTelegramWork, sendTelegramMarket, sendTelegramBug, sendTelegram, notifyTelegramAlert, notifyTelegramDocument, formatConvictionBlock, deleteTelegramBug. C5-CURE ABSOLUTE: ZERO new file-top/module-scope mock.module(); the restore lives ONLY in afterAll (teardown scope). The two EXISTING mock.module() calls inside the it() bodies stay UNCHANGED (they are the test's intentional proof-of-contamination). NO change to 047, NO change to 1328e.",
            "gate": "Router gates on CI run: Task 1328e native fail 10 -> 0 (PRIMARY) AND Task 235 (235-telegram-send-merge) -3 (co-victim, same root cause) AND Task 1352a 2 -> 1 (1485-sourced contam cured; the A-1 Expected:1/Received:2 fail is INDEPENDENT and remains, separate triage). Net ~ -13 to -14 from baseline 68. tsc --noEmit clean; NO new mock.module(); per-victim exact-prefix tally is authoritative (not the absolute alone).",
            "needs": "dev-mcp-server applies the 2-step 1485 afterAll restore using _realMod1485; tsc --noEmit clean; NO new file-top mock.module(); commit own paths with explicit pathspec; router pushes + gates. REVIEW->DONE + rebaseline ci_absolute only AFTER the router gate confirms the per-victim flip.",
            "baseline_pass": 11693,
            "baseline_absolute": "68 (sha 7040cfb6, run 27207225757, job 80326149577)",
            "projection": "1328e 10->0 (primary) + 235 -3 (co-victim) + 1352a 2->1 (partial; A-1 independent remains). Net ~ -13/-14 from 68.",
            "brief": "docs/architecture-briefs/2026-06-09-ci-c1328e-retriage-arch-s15.md (arch-S15, commit 501a936c)",
            "supersedes_objective_of": "FIX-CI-C1328E-047-CONTAM-STUB (1328e objective only; 047 change KEPT on main)",
            "reference_precedent": "_realMod1485 cache-busted real-module restore (same maintenance burden as 047's frozen captures)",
            "created_at": $now,
            "created_by": "po-S43",
            "note": "[po-S43 DJ-GATE-1 " + $now + "] OPENED from arch-S15 re-triage (gate-fail 7f1f48b3, brief 2026-06-09-ci-c1328e-retriage-arch-s15.md). Carries the SECOND-CONTAMINATOR cure: fix 1485 at the SOURCE via afterAll restore. This task OWNS the 1328e + 235 cure. C5-cure ABSOLUTE: no new module-scope mock.module(). ci_absolute STAYS 68 (NO rebaseline this cycle). Cluster-6 schema-drift stays PARKED. WIP in_progress unchanged (this is TODO, not in_progress)."
          } ]
    )
  else .
  end
)
