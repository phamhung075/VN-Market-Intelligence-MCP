# po-triage-20260806-2122-alert-split-sandbox-signoff.jq
#
# PO review-lane SECONDARY-drain sign-off, one tick, two mutations:
#   1. FACTORY-ALERT-split-sandbox : review[] -> done_verified[], status DONE_VERIFIED
#      (all 11 dev_result claims RAW re-verified by execution; rebuild_required
#       ruled FALSE ON THE FACTS -- cmd/sandbox is outside the image build graph)
#   2. FIX-DEVTEAM-REBUILD-REQUIRED-MARKER-NO-CONSUMER : occurrence_count 3 -> 4
#      + AC-1 over-broad-predicate refinement. Row stays in ready[], owner
#      agent-father, no scope/priority/lane change. NOTHING new minted.
#
# Ruling: docs/agent-memory/decisions/ruling-20260806T2122Z-alert-split-sandbox-po.md
# Invoke: jq -f scripts/po-triage-20260806-2122-alert-split-sandbox-signoff.jq \
#           docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def TS: "2026-08-06T21:22:45Z";
def TARGET: "FACTORY-ALERT-split-sandbox";
def FOLLOWUP: "FIX-DEVTEAM-REBUILD-REQUIRED-MARKER-NO-CONSUMER";

def VERIFIED_NOTE:
  "[PO] Sign-off 2026-08-06T21:22Z (direct-commit verify, ruling docs/agent-memory/decisions/ruling-20260806T2122Z-alert-split-sandbox-po.md). "
  + "DoD MET IN FULL. Every one of the 11 dev_result claims RAW re-derived BY EXECUTION, none banked from the self-report: "
  + "commit 0a961e255 ancestor-confirmed on HEAD (git merge-base --is-ancestor); tree clean under apps/alert-engine/cmd/sandbox/; "
  + "wc -l exact 4/4 (discovery.go 96, exec_primitive.go 207, exec_module.go 200, main.go 116); "
  + "go build ./... RC=0; go vet ./... RC=0; go test -count=1 ./... 7 ok + 2 [no test files]; "
  + "golangci-lint run ./... '0 issues.' (binary present, claim was checkable and checked); "
  + "gofmt -l clean; NBSP U+00A0 grep 0/0/0/0; "
  + "sandbox re-run BY ME (-tier=all -module=alert-engine) => total=11 pass=11 fail=0 status=OK. "
  + "STRONGER-THAN-CLAIMED EQUIVALENCE PROOF: rather than trust the dev's per-block diff, I stripped comment/import/package/blank lines from the pre-split 0a961e255^:main.go and from the concatenation of all 4 new files and diffed the SORTED MULTISETS => 374 == 374, IDENTICAL. That is whole-file and order-insensitive, so unlike a per-block diff it cannot be satisfied by compensating edits in two different files. Genuinely mechanical, zero code drift. "
  + "SIZE-LINT VERIFIED NON-VACUOUSLY (a gate that never scanned the files would make 'size-justified' meaningless): confirmed scripts/audits/size-lint-justification.sh carries apps/**/*.go in INCLUDE_PATHSPECS at THRESHOLD=120 and that cmd/sandbox/*.go escapes EXCLUDE_PATTERN, then forced a positive scoped run SIZE_LINT_INCLUDE_OVERRIDE='apps/alert-engine/cmd/sandbox/*.go' --check => 'PASS - 0 unjustified offenders (scanned 4 files, threshold=120L)'. Full-repo --check shows 4 offenders, NONE in alert-engine. "
  + "DEPLOY GATE: NONE OWED -- rebuild_required=true is FALSE ON THE FACTS, not 'user-gate waived'. The 2026-08-01 directive (feedback_po_deploy_rebuild_full_autonomy_no_user_gate) retires the 'PENDING-USER-GATED' clause and I did not block on it, but autonomy to authorise a rebuild is not a reason to perform a needless one. Dockerfile:21 builds exactly one target, `go build -o /out/server ./cmd/server/`; stage 2 copies exactly one artifact (:30 COPY --from=builder /out/server, :40 ENTRYPOINT /app/server); cmd/sandbox is its own package main so cmd/server cannot import it even transitively; grep finds no reference to cmd/sandbox outside the directory. The codebase states the invariant unprompted at codebase-analysis-docs/sections/go-analytics-plane.md:182 ('cmd/sandbox is NOT a server ... don't deploy it or expect a port'), corroborated for this service at go-signal-plane.md:35. Container Up 3 weeks (healthy) is CORRECT to keep serving its existing image; recycling it would buy a functionally identical binary at the documented risk of feedback_rebuild_recreate_destroys_peers. "
  + "MINOR, NOT ACTIONED: row title and dev_result say '565L' but git show 0a961e255^ gives 571L -- drift between task-mint (2026-07-24) and execution (commit 1c45abb1e grew the file in the same window). Cosmetic label only, no bearing on correctness. "
  + "VERDICT: APPROVED / DONE_VERIFIED.";

def AC1_REFINEMENT:
  "[po 2026-08-06T21:22Z] OCCURRENCE 4 -- AND IT IS THE INVERSE SHAPE OF 1-3, WHICH CHANGES THE FIX'S DESIGN. "
  + "Row: FACTORY-ALERT-split-sandbox (review[] 13 days, 2026-07-24 -> 2026-08-06, cleared this tick, ruling ruling-20260806T2122Z-alert-split-sandbox-po.md). "
  + "In occurrences 1-3 the marker was TRUE BUT UNREAD: a rebuild was genuinely owed, never happened, and QA was about to live-verify against a stale image (false-green). "
  + "Here the marker was UNREAD **AND FALSE**: no rebuild was ever owed. dev-alert-engine stamped rebuild_required=true then fell back to prose 'PENDING-USER-GATED' for a change confined to apps/alert-engine/cmd/sandbox/ -- a documented NEVER-DEPLOYED scenario runner. Dockerfile:21 builds only ./cmd/server/; stage 2 copies only /out/server; cmd/sandbox is a separate package main and is therefore unreachable from the server binary even transitively; codebase-analysis-docs/sections/go-analytics-plane.md:182 states 'cmd/sandbox is NOT a server ... don't deploy it or expect a port'. "
  + "AC-1 REFINEMENT (this is the actionable part): AC-1 as currently written says the marker is set 'whenever the diff touches apps/<service>/ non-test source'. Implemented literally that predicate is OVER-BROAD and would have fired true on this very row. An always-on gate that routinely demands needless rebuilds is the standard path to agents learning to wave it through -- which would reintroduce exactly the false-green class occurrences 1-3 exist to close. The marker MUST be computed from INTERSECTION WITH THE IMAGE'S ACTUAL BUILD GRAPH (the Dockerfile's build targets plus the artifacts the runtime stage copies), NOT from the apps/<svc>/ path prefix. "
  + "AC-3 NEGATIVE CONTROL (concrete, reusable): apps/alert-engine/cmd/sandbox/ and its peer never-deployed harnesses (api-gateway, stock-price, kinh-dich-service, macro-indicators all ship a cmd/sandbox) are the standing negative-control fixture -- a diff confined to cmd/sandbox MUST yield rebuild_required=false, while a diff in pkg/ or cmd/server/ MUST yield true. "
  + "SCOPE UNCHANGED: still P1, still ready[], still owner/next_agent agent-father. Nothing minted; this is an append to the row that already owns the class (prior-art check per feedback_file_prior_art_check_before_minting_row).";

def SURFACED:
  "[po 2026-08-06T21:22Z] 6 further review[] rows still carry the retired USER-GATED / PENDING-USER framing and are candidates for the same treatment, deliberately NOT batch-approved this tick (each needs its own RAW verification; approving them on the strength of one verified sibling is the rubber-stamp failure): "
  + "FACTORY-FRONTEND-split-market-summaries, FACTORY-FRONTEND-split-orchestration, FACTORY-APIGW-split-capability-prober (already PO-triaged today -> next_agent=ops), FACTORY-ALERT-router-cleanups, FACTORY-NEWS-fix-source-logging, FACTORY-NEWS-go-server-tier-split. "
  + "DISCRIMINATOR: a frontend or server-tier split very likely DOES sit inside the shipped build graph, so those are the inverse of FACTORY-ALERT-split-sandbox and may owe a genuine rebuild. Do NOT generalise that row's rebuild_required=false verdict to them -- re-run the Dockerfile build-graph check per row.";

# ---- capture the target row before removing it ----
(.task_board.review[] | select(.id == TARGET)) as $row

# 1. append the signed-off row to done_verified[]
| .task_board.done_verified += [
    $row
    + {
        status:              "DONE_VERIFIED",
        updated_at:          TS,
        updated_by:          "po (review-lane secondary-drain triage)",
        verified_at:         TS,
        verified_by:         "po",
        verified_note:       VERIFIED_NOTE,
        rebuild_required:    false,
        rebuild_ruling:      "FALSE ON THE FACTS -- cmd/sandbox is outside the alert-engine image build graph (Dockerfile:21 builds only ./cmd/server/; stage 2 copies only /out/server). No rebuild owed, none performed. Not a waived user gate.",
        related:             [FOLLOWUP]
      }
  ]

# 2. drop it from review[]
| .task_board.review |= map(select(.id != TARGET))

# 3. append occurrence-4 evidence + AC-1 refinement to the follow-up row
| .task_board.ready |= map(
    if .id == FOLLOWUP then
      . + {
        occurrence_count:               4,
        po_occurrence4_20260806T2122:   AC1_REFINEMENT,
        po_surfaced_usergated_20260806: SURFACED,
        updated_at:                     TS,
        updated_by:                     "po"
      }
    else . end
  )

# 4. board + doc provenance
| .task_board._updated_at = TS
| .task_board._updated_by = "po (review-lane secondary-drain triage — FACTORY-ALERT-split-sandbox DONE_VERIFIED)"
| ._updated_at            = TS
| ._updated_by            = "po (review-lane secondary-drain triage — FACTORY-ALERT-split-sandbox DONE_VERIFIED)"
