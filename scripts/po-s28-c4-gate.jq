# po-S28 — CI-C4-GATE-3663bd12 adjudication (single atomic jq pass).
# 1) Flip SPIKE-CI-C4-KINH-DICH-DIACRITICS REVIEW->DONE (prod-touching isolated round, clean -25).
# 2) Rebaseline sprint ci_absolute 160->135 everywhere (160 SUPERSEDED).
# 3) Re-profile residual 135 long tail by ROOT-CAUSE pattern (not by file) with REWRITE-vs-REMOVE lens:
#    queue cheapest high-confidence cluster (C5 UNMOCKED-HTTP) to TODO; SSOT-drift + assertion-logic
#    + REMOVE-triage as BACKLOG stubs (architect/dev profile full job log for the rest).
# Cluster-6 schema-drift untouched (PARKED). Preserves _schema=v3 _ssot=true.
# Pointer: docs/agents/po/flow/main.md (decision-journal + commit-mutex sub-flows).

def TS: "2026-06-09T08:33:20Z";

(.task_board.active_sprints[] | select(.id=="CI-RED-RECONCILE")) |= (

  # (1) C4 REVIEW -> DONE (prod-touching isolated round; clean -25 exactly as projected)
  (.tasks[] | select(.id=="SPIKE-CI-C4-KINH-DICH-DIACRITICS")) |= (
    .status = "DONE"
    | .closed_at = TS
    | .done_at = TS
    | .done_by = "po-S28"
    | .resolution = "DONE"
    | .actual_result = "PASS — VERIFICATION GATE MET (CI-C4-GATE-3663bd12, ISOLATED prod-touching push f7af6f08 + mutex-release 3663bd12 = one CI run 27193376550, bun job 80278819016): native fail+error 160 -> 135 (-25, -16%), errors stay 0 (11639 pass / 42 skip / 135 fail / Ran 11816 across 1037 files). FIRST prod-touching round of the sprint, isolated push / own CI run. Architect ruling (a) CONFIRMED: PROD was emitting ASCII fallback; the 1414/1416/285/1472/1410 spec family was source-of-truth. FIX = changed PRODUCTION to UTF-8 Vietnamese diacritics + added explain_hexagram sections (Hào từ / Tượng truyện / 6 hào) via QUE_DATA local library (Path A — ZERO Go service change, no new HTTP). CLEAN -25 with NO under-scope shrinkage (architect projected ~25, netted exactly 25 — contrast C1/C3 SUPERSET residuals). tests count 11817->11816 because one obsolete test was REMOVED (1416 'Lỗi khi tính quẻ thị trường' — get_market_hexagram handler deleted TSH-1 2026-05-31). REWRITE-vs-REMOVE lens applied: 1416=REMOVE (prod gone), 1410=REWRITE (formatAccuracyReport returns object, test cast to .text), 1414/285/1472=REWRITE (prod stale, fixed prod not test). Router raw-verified f7af6f08 scope CONTAINED to C4 file-scope (2 prod src kinhDichTools.ts+leadershipTools.ts diff 56 ins/30 del, 2 test, 4 meta), tsc clean, local 258/0 across 5 C4 files. Code RETAINED (gate passed). CI conclusion stays 'failure' (135 != 0) — EXPECTED, CI RED until 0. 160 SUPERSEDED by 135."
  )

  # (2) rebaseline ci_absolute 160 -> 135 (160 SUPERSEDED)
  | .ci_absolute = {
      "native_fail": 135,
      "native_errors": 0,
      "fail_plus_error": 135,
      "tests": 11816,
      "pass": 11639,
      "skip": 42,
      "sha": "3663bd12",
      "run_id": "27193376550",
      "bun_job_id": "80278819016",
      "supersedes": "160 (sha a43dff49, run 27191715572, job 80273289808) — SUPERSEDED",
      "delta_vs_prior": "-25 (-16%) — C4 Kinh Dich diacritics, FIRST prod-touching round; clean (no under-scope; architect projected ~25, netted exactly 25); tests 11817->11816 (1 obsolete test REMOVED, 1416 get_market_hexagram)",
      "updated_at": TS,
      "updated_by": "po-S28"
    }

  # update long-tail triage policy absolute pointer to 135
  | .long_tail_triage_policy.absolute = "135 (sha 3663bd12, run 27193376550, job 80278819016 — SUPERSEDES 160/a43dff49)"
  | .long_tail_triage_policy.applies_to = "C5+ and all remaining ~135 long-tail rounds; re-profile residual by ROOT-CAUSE pattern (unmocked-HTTP / SSOT-drift / assertion-logic) NOT by file, with the REMOVE-if-obsolete lens"
  | .long_tail_triage_policy.under_scope_lesson = "Architect cluster counts are CATEGORY-WIDE SUPERSETS (e.g. C1 '42' netted -12). Dev fixes ONLY the explicitly NAMED files; residual same-pattern files OUT of named scope -> long-tail re-profile, NOT a charge-back to closed task ids. The ONE exception so far: C4 single-file-family count landed EXACTLY (-25) because it was not a category superset."
  | .long_tail_triage_policy.updated_by = "po-S28"
  | .long_tail_triage_policy.updated_at = TS

  # (3) queue NEXT cluster — cheapest high-confidence: C5 UNMOCKED-HTTP (TODO, dispatchable)
  | .tasks += [
      {
        "id": "FIX-CI-C5-UNMOCKED-HTTP-FETCHES",
        "type": "FIX",
        "owner": "dev-mcp-server",
        "status": "TODO",
        "size": "M",
        "zone": "apps/mcp-server/src/__tests__/",
        "priority": "high",
        "sprint": "CI-RED-RECONCILE",
        "depends": [],
        "labels": ["ci-red-reconcile", "unmocked-http", "network-skip-guard", "rewrite-bucket"],
        "root_cause": "unmocked-HTTP",
        "classification": "REWRITE (prod fetcher exists, test makes a real network call -> mock/guard the fetch, do NOT delete the test)",
        "title": "C5 UNMOCKED-HTTP fetches (root-cause cluster, NOT single file): tests that hit live HTTP and assert not.toBeNull -> null when the network is absent in CI. Confirmed seeds from C4 CI annotations (first-10 only): 028-sbv-rates (3 fails, null), 1487-yahoo-finance-extended (3 fails, null). Likely same-pattern backlog members: 1416 source-scan, 1134/MSG-1 foreign_flow, 235 send_telegram, ragHealthCheck, newsHeadlines E2E. Fix pattern = mock the fetcher (mock.module / dependency seam) OR add a network-skip guard so the test runs deterministically offline. ALL REWRITE (the prod fetcher still exists). DEV MUST profile the full job 80278819016 log to enumerate every unmocked-HTTP file before fixing (annotations gave only first-10).",
        "gate": "Cheapest high-confidence cluster (single mechanical pattern). DEV profiles the FULL `gh run view --job=80278819016 --log` to enumerate ALL unmocked-HTTP fails (the 028 + 1487 seeds are first-10 only, treat as partial). Apply network-mock/skip-guard per file. REWRITE only — these prod fetchers exist; do NOT delete (contrast REMOVE bucket C8). Then native fail+error must DROP vs the NEW 135 absolute (sha 3663bd12, run 27193376550, job 80278819016). Test-only round (no prod src) — may bundle with other test-only fixes per router. UNDER-SCOPE NOTE: architect cluster counts are category supersets; size this by the dev's full-log enumeration, not the 6 seed fails.",
        "baseline_pass": "135 native fail+error absolute (135 fail + 0 err / Ran 11816, sha 3663bd12, run 27193376550, bun job 80278819016 — SUPERSEDES 160/a43dff49)",
        "created_at": TS,
        "created_by": "po-S28",
        "note": "[po-S28 DJ-GATE-1 2026-06-09T08:33:20Z] Grouped by ROOT-CAUSE (unmocked-HTTP) NOT by file per the under-scope lesson. The cheapest dispatchable next cluster: one mechanical fix (mock/guard the fetch) repeated across N files, all REWRITE. Dev MUST enumerate the full long tail from the job log — annotations gave first-10 only. NOT in_progress (WIP<=2)."
      },
      {
        "id": "FIX-CI-C6-SSOT-WATCHLIST-SECTOR-DRIFT",
        "type": "FIX",
        "owner": "dev-mcp-server",
        "status": "BACKLOG",
        "size": "S",
        "zone": "apps/mcp-server/",
        "priority": "medium",
        "sprint": "CI-RED-RECONCILE",
        "depends": [],
        "labels": ["ci-red-reconcile", "ssot-drift", "vnh-misclassification", "rewrite-bucket", "needs-grep"],
        "root_cause": "SSOT-drift",
        "classification": "REWRITE (the watchlist SSOT exists; fix the stale hand-typed sector value at source, then the test passes — VNH-misclassification pattern: grep repo for the stale value, do NOT delete the test)",
        "title": "C6-SSOT watchlist sector drift (1 confirmed seed, likely more): 1031-expanded-watchlist-catalog asserts sector 'chemicals' but gets 'other' = a hand-typed sector value drifted from the watchlist SSOT (VNH-misclassification pattern). FIX = grep the repo for the stale hand-typed sector string and align it to the SSOT classification (docs/data/stock-classification.json / system-map watchlist), then the test passes. Likely siblings if other catalog assertions exist.",
        "gate": "Apply the VNH-misclassification recipe (memory project_vnh_sector_misclassification): a SSOT fix does NOT reach hand-typed copies — GREP the whole repo for the stale sector value, align every copy to the SSOT. REWRITE (SSOT/source fix), NOT REMOVE. Then native fail+error must DROP vs the 135 absolute. Cheap single-fix — but distinct root cause from C5 so kept as its own stub. Dev confirms exact stale-value location before fixing.",
        "baseline_pass": "135 native fail+error absolute (sha 3663bd12, run 27193376550, bun job 80278819016)",
        "created_at": TS,
        "created_by": "po-S28",
        "note": "[po-S28 DJ-GATE-1] BACKLOG STUB. SSOT-drift root cause (distinct from C5 unmocked-HTTP). Cheapest single fix but held BACKLOG to keep ONE dispatchable cluster (C5) at a time (WIP discipline). VNH-misclassification pattern — grep for stale hand-typed sector, fix at SSOT. NOT in_progress."
      },
      {
        "id": "FIX-CI-C7-ASSERTION-LOGIC",
        "type": "FIX",
        "owner": "dev-mcp-server",
        "status": "BACKLOG",
        "size": "M",
        "zone": "apps/mcp-server/src/__tests__/",
        "priority": "medium",
        "sprint": "CI-RED-RECONCILE",
        "depends": [],
        "labels": ["ci-red-reconcile", "assertion-logic", "rewrite-bucket", "needs-architect-filescope"],
        "root_cause": "assertion-logic",
        "classification": "REWRITE (prod exists; test assertion logic stale — rewrite the assertion to match correct prod behavior; per-file architect confirm whether prod or test is wrong)",
        "title": "C7 ASSERTION-LOGIC mismatches (root-cause cluster): count/value-logic assertions that disagree with current prod. Confirmed seeds: 1792-conviction-debounce (2 fails, count 1-vs-0 logic), 1352a-scheduler L248 (1 fail, C1 under-scope residual — SAME file as a closed C1 task but a DIFFERENT assertion). Likely same-pattern backlog: 1328e conviction routing, 1407b SLA. Each needs a prod-vs-test ruling (is the assertion stale or is prod wrong?) — mostly REWRITE, but flag any that assert against deleted prod -> REMOVE.",
        "gate": "BLOCKED on architect SHORT file-scope/prod-vs-test confirm per assertion (debounce count semantics, scheduler L248 expected value). 1352a is a C1 under-scope residual (architect cluster counts are category supersets — the named C1 file was closed but this OTHER assertion in the same file remains). REWRITE the assertion to match correct prod behavior; if any assert against deleted prod -> REMOVE. Then native fail+error must DROP vs the 135 absolute. Do NOT dispatch to dev blind.",
        "needs": "architect file-scope + prod-vs-test confirmation before dev",
        "baseline_pass": "135 native fail+error absolute (sha 3663bd12, run 27193376550, bun job 80278819016)",
        "created_at": TS,
        "created_by": "po-S28",
        "note": "[po-S28 DJ-GATE-1] BACKLOG STUB. assertion-logic root cause (distinct from C5/C6). Needs architect prod-vs-test ruling per assertion before dev (avoid the 9454baad mechanical-sweep anti-pattern that cost +219). 1352a documents the under-scope lesson: closed C1 file, different assertion. NOT in_progress."
      },
      {
        "id": "FIX-CI-C8-REMOVE-OBSOLETE-TESTS-TRIAGE",
        "type": "FIX",
        "owner": "architect",
        "status": "BACKLOG",
        "size": "M",
        "zone": "apps/mcp-server/src/__tests__/",
        "priority": "medium",
        "sprint": "CI-RED-RECONCILE",
        "depends": [],
        "labels": ["ci-red-reconcile", "remove-bucket", "obsolete-test", "needs-architect-evidence"],
        "root_cause": "obsolete-test (prod gone/superseded)",
        "classification": "REMOVE (prod gone or superseded -> DELETE the obsolete test with an evidence-commit citation; do NOT patch to pass)",
        "title": "C8 REMOVE-if-obsolete triage (root-cause cluster — the /goal DELETE lens): long-tail members likely asserting against deleted/superseded prod. Candidates to triage each as REMOVE-vs-REWRITE: VCB BCTC parser, FIX-H insider 180d, ttl_seconds:180 cowork, 1839b notebook. Each must be proven REMOVE (prod handler deleted / seam removed / superseded format) with an evidence-commit hash before deletion — mirror the C4 1416 REMOVE (get_market_hexagram deleted TSH-1) precedent.",
        "gate": "BLOCKED on architect evidence triage: for EACH candidate, prove the asserted prod is GONE/superseded (cite the deletion/supersede commit) -> REMOVE; if prod still exists -> reclassify to the matching REWRITE cluster (C5/C6/C7). HARD: no blanket-delete; every removal cites evidence (mirror OBSOLETE-REMOVE-24 + C4 1416 precedent). PROTECT any intentional anti-stub canary (e.g. DWF-is-trading-day AC-P0-3-6 — NEVER touch). Then native fail+error must DROP vs the 135 absolute.",
        "needs": "architect REMOVE-vs-REWRITE evidence triage before dev",
        "baseline_pass": "135 native fail+error absolute (sha 3663bd12, run 27193376550, bun job 80278819016)",
        "created_at": TS,
        "created_by": "po-S28",
        "note": "[po-S28 DJ-GATE-1] BACKLOG STUB. This is the /goal REMOVE-if-obsolete bucket made explicit: tests asserting against deleted/superseded prod must be DELETED (with evidence), not patched. Architect triage required to avoid deleting a still-live assertion. Cluster-6 schema-drift (FU-SCHEMA-DRIFT-*) stays PARKED, distinct from this. NOT in_progress."
      }
    ]

  | ._updated_by = "po-S28"
)
