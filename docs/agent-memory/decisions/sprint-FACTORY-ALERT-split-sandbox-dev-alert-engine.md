# Decision Journal — Sprint FACTORY-ALERT-split-sandbox · dev-alert-engine

**Sprint goal:** FACTORY-MAINTAINABILITY-2026-06 — split the 565L alert-engine sandbox by concern (mechanical move, no API change).
**Agent:** dev-alert-engine
**Started:** 2026-07-24T13:50:09Z

---

### STEP dev-alert-engine-S1 · dev-alert-engine · 2026-07-24T13:50:09Z
**task-id:** FACTORY-ALERT-split-sandbox
**what-done:** Split `apps/alert-engine/cmd/sandbox/main.go` (565L, package main) into `discovery.go` (96L), `exec_primitive.go` (207L, justified), `exec_module.go` (200L, justified), `main.go` (116L, entry point only) via byte-exact `sed` line-range extraction (no manual retype) to eliminate NBSP/drift risk.
**what-considered:**
- Manual copy-paste per seam vs `sed -n 'START,ENDp'` extraction — chose sed to guarantee byte-identical move (precedent: api-gateway sibling split hit silent NBSP normalization on manual copy).
- One file per primitive executor (finer split) vs keeping the 3 primitive executors + dispatcher together — kept together: dispatcher switch references all 3 by name and each executor's scenario-shape doc comment is load-bearing; finer split would triple import boilerplate for ~30L each.
**why-decision:** Diff of each new file's code tail against the original sed-extracted block returned 0 diff lines (4/4 files) — proves pure mechanical move, zero drift.
**why-change:** No change from plan (task's own seam list followed exactly); exec_primitive.go and exec_module.go exceed 120L so both carry honest size-justification headers per the task's own carve-out clause.
