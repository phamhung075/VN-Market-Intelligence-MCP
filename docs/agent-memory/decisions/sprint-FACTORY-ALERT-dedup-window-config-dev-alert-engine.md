# Decision Journal — Sprint FACTORY-ALERT-dedup-window-config · dev-alert-engine

**Sprint goal:** Replace hardcoded 60-min dedup window with a config-sourced DedupWindowMinutes (BOUNDED-1 auto-pickup backlog item).
**Agent:** dev-alert-engine
**Started:** 2026-07-28T21:26:03Z

---

### STEP dev-alert-engine-S1 · dev-alert-engine · 2026-07-28T21:26:03Z
**task-id:** FACTORY-ALERT-dedup-window-config
**what-done:** Added `domain.CooldownConfig.DedupWindowMinutes` (default 60), wired it into `pipeline.go`'s `HasDuplicateFingerprint(fingerprint, p.cfg.DedupWindowMinutes)` call (was reusing `p.cfg.CooldownMinutes`=30), and rebuilt the dedup reason string via `fmt.Sprintf("duplicate: fingerprint seen within %dmin", ...)`.
**what-considered:**
- Confirming the real default: evaluate.go's pre-consolidation history literally used `GetRecentAlerts(stock, 60)` for dedup (separate from `cfg.CooldownMinutes`=30); confirmed live via `mcp.config.json` `alertQuality.dedupWindowMinutes: 60` (also `apps/mcp-server/.../config.ts` `numVal(aq, "dedupWindowMinutes", 60)`) — 60 is the real TS-mirrored default, not invented.
- Left `pkg/primitive/cooldown-gate`'s own `CooldownMinutes` untouched — that gate answers a different question (cooldown suppression), separate from exact-fingerprint dedup; only the pipeline's dedup call-site was the defect (task file scope: evaluate.go/models.go successors only).
**why-decision:** Task's own file pointer (`evaluate.go:73`) was stale post FACTORY-ALERT-consolidate-dual-engines — traced the live call site to `pipeline.go:91` and confirmed it still reused `CooldownMinutes`, exactly the residual risk the task flagged ("ensure the module uses a named DedupWindowMinutes, not CooldownMinutes reuse").
**why-change:** No change from plan. RED test added first (mockRepo captures `withinMinutes`; domain test pins `DedupWindowMinutes==60`) — both failed to compile pre-fix, confirming the RED step; GREEN after the field+wiring change. go build/vet/test + golangci-lint + sandbox 11/11 all green. Doc-review updated domain-model.md/usecases.md/api-reference.md/testing.md. Commit 43f4e3add.

### STEP qa-S1 · qa · 2026-08-06T17:45:28Z
**task-id:** FACTORY-ALERT-dedup-window-config
**what-done:** Verify-committed re-check: code+tests independently re-verified correct (go build/vet/test/golangci-lint/mock-guard all green, matches claim exactly incl. 60/70 test count); but live `alert-engine` container image (created 2026-07-15T15:13:50Z) predates commit 43f4e3add (2026-07-28T21:25:42Z) by 13 days — `docker exec ... grep -a` on `/app/server` finds the OLD "seen recently" reason string, zero hits for the new "seen within".
**what-considered:**
- Approve anyway (code correct, tests pin it) — rejected: DoD's own "RAW-verify served suppression decision after rebuild" clause explicit, unmet; live system still serves pre-fix behavior.
- CHANGES_REQUESTED → developer for a new commit — rejected: no code defect exists, would misdirect.
- CHANGES_REQUESTED → ops for rebuild+redeploy, then re-verify — chosen.
**why-decision:** Matches fresh (today) PO precedent: 3 live occurrences of the identical class already escalated P1 (`FIX-DEVTEAM-REBUILD-REQUIRED-MARKER-NO-CONSUMER`), whose own AC-2 states routing goes ops-first-then-qa when rebuild_required is unsatisfied.
**why-change:** Deviates from flow template's literal "route to owner field" — owner `dev-alert-engine` cannot rebuild containers; substance over literal text.
