# Decision Journal — Sprint FACTORY-ALERT-delete-deprecated-domain · dev-alert-engine

**Sprint goal:** Delete dead `_deprecated` domain package (298L duplicate of primitives) in alert-engine — FACTORY-MAINTAINABILITY-2026-06 audit item.
**Agent:** dev-alert-engine
**Started:** 2026-07-24T01:20:06Z

---

### STEP dev-alert-engine-S1 · dev-alert-engine · 2026-07-24T01:20:06Z
**task-id:** FACTORY-ALERT-delete-deprecated-domain
**what-done:** Verified deadness at source (not trusted from audit brief alone), then `git rm -r apps/alert-engine/pkg/domain/_deprecated/` (services_v1.go 150L + services_v1_test.go 148L = 298L).
**deadness-evidence:**
- `go list ./...` (before deletion) never lists `.../pkg/domain/_deprecated` — Go toolchain convention ignores dirs prefixed `_`/`.` (documented `go help packages` behavior), confirming build-exclusion without needing a `//go:build ignore` tag (none present).
- `grep -rn "_deprecated" --include="*.go" apps/alert-engine` → zero hits: no `.go` file anywhere in the service contains an import of the path. Zero live importers, repo-wide (checked non-Go files too via `grep -rln "domain/_deprecated"` — only doc/report prose, no code).
- Structural: `_deprecated/services_v1.go` declares `package domain` but references `AlertRequest`/`StoredAlert`/`CooldownConfig`/`SeverityCritical` etc. that are NOT defined anywhere in that directory (only 2 files, neither declares them) — the live definitions are in the sibling `pkg/domain/models.go`. Since Go compiles per-directory, this sub-package would not even compile if forced into the build; it only "works" because it's never compiled.
- Live equivalents confirmed: `pkg/primitive/cooldown-gate/gate.go` (doc comment: "the key change from the brownfield domain.ShouldSuppressAlert") and `pkg/primitive/dedup-key-builder/builder.go` (doc comment: "mirrors brownfield domain.ComputeFingerprint exactly") are the real, tested, imported successors.
- Independent corroboration found in `docs/architecture/microservice/alert-engine/domain-model.md` (written 2026-07-04 in commit 1c45abb1e, `FACTORY-ALERT-consolidate-dual-engines`, which ALSO already landed and rewired `cmd/server/main.go` off any domain.* path onto `pkg/module/alert_pipeline`) — that commit's own doc update already asserted "zero non-test imports across the repo" pre-dating this task.
**what-considered:**
- Delete only `services_v1.go`, keep the test file (rejected — test file has zero value once its subject is gone, and it's equally dead/uncompiled; backlog `files` list includes both).
- Also scrub `apps/alert-engine/dashboard/index.html` prose mentions of the `_deprecated` path (4 hits) — rejected: those are historical/informational HTML text describing the deprecation event itself, not code, not in doc-review's `docs/architecture/microservice/<service>/` scope, and backlog `files:` list is exactly the 2 `_deprecated/*.go` files. Left untouched to stay surgical.
**why-decision:** Directory-name toolchain exclusion + zero grep hits (code and non-code) + self-referential undefined-symbol proof + independently-dated doc corroboration together prove deadness beyond the audit brief alone (brief was verified independently per NO-FABRICATION gate, not trusted blind).
**why-change:** No change from plan — matches backlog `approach`/`dod` exactly (delete both files, build-excluded, zero live importer, primitives supersede).
