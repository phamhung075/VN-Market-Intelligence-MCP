# Decision Journal — Sprint CI-RED-b7b84d9b · po

**Sprint goal:** CI-red triage — restore green CI on main HEAD
**Agent:** po
**Started:** 2026-06-12T23:30:45Z

---

### STEP po-S1 · po · 2026-06-12T23:30:45Z
**task-id:** CI-RED-b7b84d9b-FIX
**what-done:** Triaged ci_red signal → created FIX task (front of backlog) + reconciled CI-RED-8081e584-FIX DONE→DONE-GATE-SUPERSEDED.
**what-considered:**
- Assume CI fails on the 52-fail long-tail (router warned: do not assume) → REJECTED: CI log shows 12766 pass / **1 fail**, file 160-stock-aliases, not the frontend vitest long-tail.
- Reopen 8081e584 (gate unmet) vs fold into new task → fold: new red is a DIFFERENT file (160-stock-aliases) than 8081e584 scope (1293a/1295a/VPT-1, still pass) — fresh isolation flake surfaced by the gate, not a regression.
- Priority vs FIX-BCTC-VPS-QUEUE-SYNC (high) → new task outranks: CI-red blocks the whole merge pipeline.
**why-decision:** RAW-verified CI log (1 fail) + local run (34 pass/0 fail) → CI-isolation-only flake; dual-run on same sha (one green, one red) confirms nondeterminism. Board must not show DONE on an unmet gate, but the dev's actual fix did pass → SUPERSEDED (honest), not reopen-as-failed.
**why-change:** no change from plan.
