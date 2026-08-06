# Decision Journal — FACTORY-KINHDICH-split-sandbox · po

**Sprint goal:** sign off (or reject) the stale `review[]` row claimed by dev-team's Review-Lane SECONDARY-Drain
**Agent:** po
**Started:** 2026-08-06T20:10:49Z

---

### STEP po-S1 · po · 2026-08-06T20:37:00Z
**task-id:** FACTORY-KINHDICH-split-sandbox
**what-done:** Re-verified all 6 DoD clauses at source and signed off DONE_VERIFIED; moved the row `review[] -> done[]` via one `orch-apply.sh` pipe (`scripts/po-signoff-20260806-factory-kinhdich-split-sandbox.jq`).
**what-considered:**
- Sign off on the implementer's own claims (commit message asserts "go build, go test, golangci-lint, sandbox -tier=all all GREEN") — REJECTED: the row carries no `status_note`/`review_note` at all, so there was nothing on the board to sign off *against*; accepting a commit-message self-report is exactly `feedback_agent_selfreport_metalayer_confabulation`.
- Request rework for the `179L` header vs `183L` actual drift on `main.go` — REJECTED: ran the real gate, tolerance is +/-10%-or-min-5L, 4L is a genuine PASS not a waiver. Recorded, not escalated.
- Escalate BLOCKED on `rebuild_required: true` / the commit's "PENDING-USER-GATED" note — REJECTED as a phantom gate (below).
**why-decision:** Every DoD clause is independently checkable and all 6 check out RAW: 4 files 183/400/107/109L, size-lint `--check` PASS (0 unjustified, 25 files scanned), pre-vs-post top-level symbol sets identical (18/18, empty diff), `go build`+`go vet` clean, `go test ./...` 8 packages ok, `sandbox -tier=all` 17/17 GREEN exit 0 with the worktree still clean after. Nothing was left to do — the work was finished 2026-07-24; only the *lane position* was stale.
**why-change:** no change from plan.

### STEP po-S2 · po · 2026-08-06T20:37:00Z
**task-id:** FACTORY-KINHDICH-split-sandbox
**what-done:** Dispositioned `rebuild_required: true` as NOT-APPLICABLE rather than inheriting it, and named it as the root cause of the 6-week strand.
**what-considered:**
- Route to ops for a kinh-dich-service rebuild before signing off — REJECTED after reading `apps/kinh-dich-service/Dockerfile` at source.
- Trust the detail row's `rebuild_required` flag — REJECTED; the flag was set by a 2026-06-15 audit generator, not by anyone who read the Dockerfile.
**why-decision:** The builder stage runs `go build -o /app/server ./cmd/server` and the runtime stage copies only `/app/server` + `/app/api`. `cmd/sandbox` never enters the served image, so no rebuild is possible-let-alone-required — same shape as `feedback_factory_testfirst_primitive_tests_copy_not_served_path` (check whether the changed path is the served path). Doubly moot because PO holds full rebuild autonomy with no user gate anyway (`feedback_po_deploy_rebuild_full_autonomy_no_user_gate`). A dev-only CLI split sat in `review[]` for 6 weeks behind a deploy gate that could never apply.
**why-change:** no change from plan.

### STEP po-S3 · po · 2026-08-06T20:37:00Z
**task-id:** FACTORY-KINHDICH-split-sandbox
**what-done:** Declined to mint a follow-on row for the missing-`review_note` class; recorded it for the next flow-level pass instead.
**what-considered:**
- Mint a FIX against dev-kinh-dich for shipping without a board review note.
- Record only.
**why-decision:** The implementer *did* journal (`sprint-FACTORY-KINHDICH-split-sandbox-dev-kinh-dich.md`, 2 STEP blocks) and *did* write an informative commit body — what is missing is the board-row `review_note`, which is what every downstream sweep actually reads. That is a fleet-wide flow-compliance gap, not a kinh-dich defect; a zone-scoped row minted off one instance would be the wrong shape and would churn (`feedback_file_prior_art_check_before_minting_row`). Cost is real and worth naming: the absent note is precisely why the SECONDARY-Drain could not resolve the row itself and had to spend a full PO cycle re-deriving verification from scratch.
**why-change:** no change from plan.
