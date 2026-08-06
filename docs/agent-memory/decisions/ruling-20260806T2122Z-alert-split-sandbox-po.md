# Decision Journal — PO ruling · FACTORY-ALERT-split-sandbox

**Context:** dev-team Review-Lane SECONDARY-Drain handed this stale `review[]` row (status=REVIEW, `branch:null`, direct-commit, no task branch/handoff, `secondary_dispatch_target=po`) to PO for sign-off/triage. Row entered `review[]` 2026-07-24T13:52:26Z — 13 days.
**Agent:** po
**Timestamp:** 2026-08-06T21:22Z

---

### RULING po-R1 · po · 2026-08-06T21:22Z
**task-id:** FACTORY-ALERT-split-sandbox

**what-done:** Verdict = **DONE_VERIFIED**, moved `review[]` → `done_verified[]`. Every implementer claim re-derived RAW by execution, none banked from the self-report. Separately, the row's `rebuild_required=true` is ruled **factually false** (not "user-gated", not "waived") — see po-R2.

**what-considered:**

- **Rubber-stamp the self-report.** Rejected on principle (`feedback_agent_selfreport_metalayer_confabulation`, `feedback_router_verify_raw_not_badges`). Every claim was re-executed. All 11 hold:

  | Claim in `dev_result` | How I verified | Result |
  |---|---|---|
  | split into 96 / 207 / 200 / 116 L | `wc -l` | **exact match**, 4/4 |
  | `package main` unchanged, no API change | `head -1` ×4 + no external importer | confirmed |
  | byte-exact extraction, 0 diff lines | stripped comment/import/package/blank from pre-split `0a961e255^:main.go` vs concat of all 4 new files, sorted-multiset `diff` | **374 == 374, IDENTICAL** |
  | `go build ./...` clean | re-ran | RC=0 |
  | `go vet ./...` clean | re-ran | RC=0 |
  | `go test -count=1 ./...` 7/7 GREEN | re-ran | 7 `ok` + 2 `[no test files]` (cmd/sandbox, cmd/server) |
  | `golangci-lint run ./...` 0 issues | re-ran (binary present at `/usr/local/bin/golangci-lint`) | `0 issues.` |
  | sandbox `-tier=all` 11/11 GREEN | re-ran (`-tier=all -module=alert-engine`) | `total=11 pass=11 fail=0 status=OK` |
  | NBSP U+00A0 0 hits | `grep -c` ×4 | 0/0/0/0 |
  | `gofmt -l` clean | re-ran | clean |
  | 207L/200L files "size-justified" | see below | **PASS, non-vacuously** |
  | commit landed on main | `git merge-base --is-ancestor 0a961e255 HEAD` | ancestor-confirmed |

- **Accept "size-justified" as written.** Rejected as-stated; verified instead. A gate that never scanned the files would make the claim vacuous (`feedback_fleetwide_gate_validated_on_one_file_optout_allowlist`, `feedback_wrong_arg_type_silently_disables_a_verification_predicate`). Confirmed `scripts/audits/size-lint-justification.sh` carries `apps/**/*.go` in `INCLUDE_PATHSPECS` at `THRESHOLD=120`, and that `cmd/sandbox/*.go` is not caught by `EXCLUDE_PATTERN` (not `_test.go`). Then forced a **positive** scoped run: `SIZE_LINT_INCLUDE_OVERRIDE='apps/alert-engine/cmd/sandbox/*.go' … --check` → `PASS — 0 unjustified offenders (scanned 4 files, threshold=120L)`. The scanner genuinely evaluated all four. Full-repo `--check` reports 4 offenders, **none in alert-engine** (they are pre-existing `schema.ts`, `getBctcRefinedTool.ts`, `app_factory.py`, `embedder.py` — separate rows).

- **Rework for the `565L` → actual `571L` discrepancy.** Rejected as immaterial. `git show 0a961e255^:…/main.go | wc -l` = 571, while the row title and `dev_result` both say 565. Explained by drift between task-mint (2026-07-24 promotion) and execution: commit `1c45abb1e` ("consolidate dual eval engines") landed in the same window and grew the file. Cosmetic label drift on a task title, zero bearing on the split's correctness. Noted, not actioned.

- **Hold in `review[]` pending a docker rebuild.** Rejected — the premise is false, see po-R2. Holding would repeat the exact 13-day strand the sibling row `FIX-DEVTEAM-REBUILD-REQUIRED-MARKER-NO-CONSUMER` already documents.

**why-decision:** This is the cleanest refactor evidence class available: a **sorted-multiset identity** on stripped code lines (374 ≡ 374) is a stronger proof than the dev's own claimed per-block `diff`, because it is whole-file and order-insensitive — it cannot be satisfied by a compensating pair of edits in two different files, which a per-block diff could miss. Combined with an independently re-run behavioral harness at 11/11 and four independent static gates green, there is nothing left for QA to add. DoD fully met.

**why-change:** No change from plan — DONE_VERIFIED was one of the four dispositions the incoming brief offered.

---

### RULING po-R2 · po · 2026-08-06T21:22Z
**task-id:** FACTORY-ALERT-split-sandbox (deploy gate)

**what-done:** Ruled `rebuild_required=true` **FALSE ON THE FACTS** — not "authorised by PO", not "user gate waived". No rebuild performed, and none is owed. The alert-engine container (`Up 3 weeks (healthy)`) correctly continues to serve its existing image.

**what-considered:**

- **Exercise PO rebuild autonomy and order the rebuild anyway.** Rejected as a *category error*. The 2026-08-01 directive (`feedback_po_deploy_rebuild_full_autonomy_no_user_gate`) removes the user gate, so the "PENDING-USER-GATED" clause in `dev_result` is retired framing and I did not block on it. But autonomy to authorise a rebuild is not a reason to *perform a needless one*. The correct finding is that the shipped artifact is provably untouched:
  1. `apps/alert-engine/Dockerfile:21` builds exactly one target — `go build -o /out/server ./cmd/server/`. `cmd/sandbox` is never a build target.
  2. Stage 2 copies exactly one artifact — `COPY --from=builder /out/server /app/server` (`:30`); `ENTRYPOINT ["/app/server"]` (`:40`).
  3. `cmd/sandbox` is its own `package main`. Go cannot import a `main` package, so `cmd/server` cannot reach this code even transitively. Confirmed by grep: no reference to `cmd/sandbox` anywhere outside the directory itself.
  4. The codebase states it as an architectural invariant, unprompted: `codebase-analysis-docs/sections/go-analytics-plane.md:182` — *"`cmd/sandbox` is NOT a server — it's the credential-free scenario runner …; don't deploy it or expect a port."* Corroborated for this service specifically at `go-signal-plane.md:35`.

  A rebuild would regenerate a functionally identical `/app/server` and pointlessly recycle a healthy 3-week-old container — carrying the real, documented risk class in `feedback_rebuild_recreate_destroys_peers` for zero benefit.

- **Say nothing and just close the row.** Rejected. Silence here would leave the false marker in the record and let the next reader re-derive the same 13-day stall.

**why-decision:** `rebuild_required` must track *"does this diff reach the shipped binary"*, not *"did this diff touch `apps/<svc>/`"*. Here it touched `apps/alert-engine/` and reached nothing. Deciding this on the Dockerfile's actual build graph rather than on the path prefix is what makes the answer checkable (`feedback_host_cli_integrity_check_false_ok_verify_through_runtime` — assert from the artifact, never from an agent's claim). Same disposition and same reasoning as my `FACTORY-STOCK-vndirect-mapper-tests` ruling earlier today ("mapper.go has zero importers so it is linked into no binary; `rebuild_required:false` is correct here").

**why-change:** Deviates from the row's own `dev_result` assertion. The deviation is evidence-backed and recorded on the row.

---

### RULING po-R3 · po · 2026-08-06T21:22Z
**task-id:** FIX-DEVTEAM-REBUILD-REQUIRED-MARKER-NO-CONSUMER

**what-done:** Appended this as **occurrence 4** (`occurrence_count` 3 → 4) with a **new AC-1 refinement**, on the existing P1 `ready[]` row. Minted **nothing** new.

**what-considered:**

- **Mint a new FIX row for the "7 rows stranded on retired USER-GATED framing" class.** Rejected — prior art exists and a duplicate would be the `feedback_pm_step2_boardmint_duplicate_insertion_no_id_check` / `feedback_bounded1_spawns_health_recheck_stale_duplicate_fix_rows` failure. Checked the board first (`feedback_file_prior_art_check_before_minting_row`): `FIX-DEVTEAM-REBUILD-REQUIRED-MARKER-NO-CONSUMER` (P1, READY, owner `agent-father`) already owns exactly this class, and its `po_lane_fix_20260806` field already records the near-identical `FACTORY-MACRO-split-or-justify-over-cap` strand.

- **Append as a bare 4th tally and move on.** Rejected — this occurrence is **not** the same shape as occurrences 1–3 and folding it in silently would lose the distinction. In occurrences 1–3 the marker was *true but unread* (a real rebuild was owed and never happened → false-green QA). Here the marker is *unread **and** false*: no rebuild was ever owed, because the diff never reaches the image's build graph. That is the **opposite** error, and it matters for the fix's design.

**why-decision:** The existing AC-1 says the marker is written *"whenever the diff touches `apps/<service>/` non-test source."* Implemented literally, that predicate is **over-broad** and would have fired `true` on this very row — demanding a rebuild for a change to a documented never-deployed scenario runner. An always-on gate that regularly demands needless rebuilds is the classic path to agents learning to wave it through, which would reintroduce the false-green class 1–3 exist to close. Recorded refinement: the marker must be computed from **intersection with the image's actual build graph** (the Dockerfile's build targets and the artifacts stage 2 copies), not from the `apps/<svc>/` path prefix — with `cmd/sandbox` and peer never-deployed harnesses as the standing negative control for AC-3's regression verifier.

**why-change:** Additive refinement to a row owned by `agent-father`; no scope, priority, owner, or lane change. Left in `ready[]` for its owner.

---

### Surfaced, deliberately NOT actioned this tick

6 further `review[]` rows carry the same retired `USER-GATED` / `PENDING-USER` framing and are candidates for the same treatment — but each needs its own RAW verification, and batch-approving them on the strength of one verified sibling would be precisely the rubber-stamp failure po-R1 refused:

`FACTORY-FRONTEND-split-market-summaries`, `FACTORY-FRONTEND-split-orchestration`, `FACTORY-APIGW-split-capability-prober` (already PO-triaged today → `next_agent=ops`, ruling `ruling-20260806T2048Z-apigw-prober-triage-po.md`), `FACTORY-ALERT-router-cleanups`, `FACTORY-NEWS-fix-source-logging`, `FACTORY-NEWS-go-server-tier-split`.

Note the discriminator that decides each: a *frontend* or *server-tier* split very likely **does** sit in the shipped build graph, so those are the inverse of this row and may owe a genuine rebuild. Do not generalise po-R2's `false` verdict to them — re-run the Dockerfile build-graph check per row.
