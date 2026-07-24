# Decision Journal — Sprint FACTORY-ALERT-shared-vocab-package · dev-alert-engine

**Sprint goal:** Collapse triple-declared severity/channel constants (Fence-aware) — FACTORY-MAINTAINABILITY-2026-06 audit item.
**Agent:** dev-alert-engine
**Started:** 2026-07-24T13:19:32Z

---

### STEP dev-alert-engine-S1 · dev-alert-engine · 2026-07-24T13:19:32Z
**task-id:** FACTORY-ALERT-shared-vocab-package
**what-done:** Collapsed `cooldown-gate`'s hand-copied `severityCritical` literal by importing `pkg/domain` and referencing `domain.SeverityCritical` directly — 3 copies → 2 (domain.go original + signal-classifier's still-separate re-declaration). String value unchanged ("critical").
**what-considered:**
- Dispatcher's suggested path A: reference `signal-classifier`'s constant from `cooldown-gate` — rejected: `signal-classifier` is a sibling primitive, not an established Fence-A import target; `.golangci.yml` fence-a `deny` list has no rule permitting primitive→primitive imports, so this would be an untested/unproven path, and it doesn't match precedent anywhere else in the codebase.
- Dispatcher's suggested path B (keep literal + doc-anchor + architect escalation) — rejected once ground truth checked: read live enforced `.golangci.yml` (frozen since G4-close commit `6c2edc9d9`, `git log` confirms no later touch) line 6: `"Fence-A: primitives → stdlib + pkg/domain only"`; the `deny` list under `fence-a` blocks only `pkg/application`, `pkg/infrastructure`, `pkg/interface`, `mattn/go-sqlite3` — `pkg/domain` is NOT denied. This is the actual enforced gate (AC-4c freeze anchor), overriding the looser prose in the pilot-charter/backlog `approach` note ("stdlib-only") which predates the as-implemented lint config.
- Precedent check: `pkg/module/alert_pipeline` (Fence-B) already imports `pkg/domain` for exactly this "shared leaf vocab" purpose (`ports.go:6` "Fence-B (HARD): this module imports primitives + pkg/domain + stdlib ONLY"). Extending the same, already-approved import target one tier down to Fence-A primitives is not a NEW cross-Fence package — it reuses the existing, frozen-in-CI-approved leaf vocab source. No new package created, so no architect Fence-A sign-off needed (that requirement was specifically for inventing a brand-new shared package).
**why-decision:** `.golangci.yml` is the actual enforced/frozen gate (not the charter prose) and explicitly whitelists `pkg/domain` for Fence-A primitives; verified empirically — `golangci-lint run` returns `0 issues` both before and after the change, and `CGO_ENABLED=0 go build ./pkg/primitive/... ./pkg/module/... ./cmd/sandbox/...` still succeeds (pkg/domain has zero non-stdlib imports: errors, context only — no CGO/mattn leak risk). This achieves the full 3→2 collapse the higher-value path targets, without needing a new package or a sign-off.
**why-change:** Diverges from the dispatcher's literal fallback instructions (which assumed signal-classifier or a bare doc-anchor were the only sign-off-free options) because the dispatcher's premise — "Fence-A primitives are stdlib-only" — was contradicted by the live enforced `.golangci.yml`. No new architect escalation needed since no new package was created; `pkg/domain` was already an established, CI-frozen import target one tier away (module), and the depguard rule already permits primitives to use it too.
