# PO — Notebook

## 2026-08-06T20:37Z · sign-off: FACTORY-KINHDICH-split-sandbox → DONE_VERIFIED (single stale review[] row)

### What actually happened
- **The row had no `status_note` and no `review_note` — nothing to sign off *against*.** Implementer (dev-kinh-dich) shipped `fa3c51f3a` on 2026-07-24, journalled 2 STEP blocks, wrote a rich commit body — and left the board row bare. That is why every Review-Lane sweep for 6 weeks found it unresolvable and re-deferred. Verified the DoD from scratch instead of banking the commit message.
- **All 6 DoD clauses re-checked RAW, all pass.** 752L `cmd/sandbox/main.go` → 183/400/107/109L across 4 files, all `package main`. Ran the real CI gate (`size-lint-justification.sh --check`, zone-scoped): PASS, 0 unjustified. `go build`+`go vet` clean; `go test ./...` 8 packages ok; `go run ./cmd/sandbox -tier=all` → 17/17 GREEN, exit 0, worktree clean after (both emit flags default false).
- **The decisive check was the symbol-set diff, not the test run.** Sorted top-level decls of the pre-split blob (`git show fa3c51f3a^:…/main.go`) vs the concatenated 4 files: 18 vs 18, diff EMPTY. That is what proves "behaviour identical" for a pure code-movement refactor — a green test suite alone would not have.
- **Root cause of the 6-week strand: a phantom deploy gate.** `rebuild_required: true` + the commit's "PENDING-USER-GATED". Read `apps/kinh-dich-service/Dockerfile`: builder runs `go build -o /app/server ./cmd/server`, runtime copies only `/app/server` + `/app/api`. `cmd/sandbox` never enters the image — no rebuild is *possible*, let alone required. Dispositioned NOT-APPLICABLE on the row rather than inherited.

### Decisions worth keeping
- **A 4L header drift is a PASS, not a rework request.** `main.go` declares `179L`, actual 183L. Ran the gate rather than eyeballing the number: tolerance is ±10%-or-min-5L. Recorded on the row so it is not silently absorbed, but requesting rework would have been churn against a gate I had not read.
- **Declined to mint a follow-on for the missing-`review_note` class.** It is fleet-wide flow compliance, not a kinh-dich defect; a zone-scoped row off one instance is the wrong shape. Named the real cost instead: the absent note is exactly why SECONDARY-Drain could not self-resolve and had to spend a whole PO cycle re-deriving verification.
- **Lane choice was schema-checked, not guessed.** `done_verified[]` is empty repo-wide; `LANE_ALLOWED_STATUSES` permits `done → {DONE, DONE_VERIFIED}`. Used `done[]` with status `DONE_VERIFIED` — live convention *and* coherent.

### Evidence (raw, re-runnable)
- 1 `orch-apply.sh` pipe via `scripts/po-signoff-20260806-factory-kinhdich-split-sandbox.jq`: Stage 0+1 PASS, conservation `task_total 786=786` / `signal_total 200=200`, 1 row stamped. `review 244→243`, `done 10→11`. All 17 Stage-1g dangling refs pre-existing, none mine.
- Live board moved under me mid-cycle (peer write, `review 243→244`, `in_progress 2→1`) — regenerated the candidate from live at pipe time, CAS guard held.
- Post-apply re-read from disk: 0 rows matching the id in `review[]`, 1 in `done[]` at `DONE_VERIFIED`.

### Carry-over
- **`scripts/` has no owner for the regression verifier my own flow specs** (`scripts/audits/po-mint-orchapply-actuator-verify.sh`, main.md line 173) — still unauthored, still outside agent-father's commit zone.
- **The two P1 telegram-ack rows remain undispatched** (`FIX-TELEGRAM-REPORT-ACK-STATUS-STOP-RESURFACE`, `FIX-PO-MAINFLOW-ORPHANS-TELEGRAM-REPORTS-RESOLVER-SUBFLOW`). Not touched this cycle — single-row dispatch, no channel audit run.
- **My AC-3 self-verification is still known-broken** (`FIX-PO-AC3-SELFVERIFY-FALSE-FAILLOUD-WHEN-PEER-SWEEPS-ORCHSTATE`): it greps my own commit's stat instead of the HEAD tree, so it false-FAILs when a peer sweeps `orch-state.json` first. Asserted against HEAD tree content this cycle, per that row's own guidance.
- **This cycle was a single-row triage, not a full PO tick** — no channel audit, no TNB read, no signal-dashboard drain, no manual-dispatch/supervised-goahead sweep. Next full tick still owes all of those.
