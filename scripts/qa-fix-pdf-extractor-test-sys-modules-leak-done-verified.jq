# Board flip: FIX-PDF-EXTRACTOR-TEST-SYS-MODULES-LEAK qa[] -> done_verified[] (Direct-Commit Verify)
# QA RAW-verified commits 1d8b1374f (fix) + 8ac350161 (memory), both on main ancestry, git show --stat
# matches the claimed single file (apps/pdf-extractor/__tests__/unit/test_low_text_density_ocr_rasterize.py).
# REBUILD_REQUIRED gate explicitly checked (not assumed): pdf-extractor image Created=2026-08-08T11:34:24Z
# (container started 2026-08-08T13:39:55Z), both postdate the fix commit (07-29) and the zone's last code
# commit (07-31, d808a6a11) -- `docker exec grep` on the LIVE container's file confirmed all 4 guard sites
# present verbatim, fix is durably baked into the deployed image, not merely a docker-cp hot-patch.
# Re-ran tests myself inside the container: test_ocr_backends.py+rasterizer file both orderings = 47 passed
# each; +page_rasterizer = 32; +tesseract_retry = 26 -- exact match to claimed evidence, order-independent.
# Full non-slow suite: 1047 passed/5 skipped/7 deselected/0 failed (claimed 1033 passed -- 14-test delta is
# 2 weeks of unrelated suite growth since 07-29, skip/deselect/fail counts identical, not a red flag). mypy
# unrunnable in the runtime image (dev-only tool, not shipped) and blocked on host by a pre-existing
# env-only "pdf-extractor is not a valid Python package name" error -- independently re-derived the 0-new-
# errors claim anyway via isolated before/after mypy runs on the two file versions (identical 23-error set,
# only line numbers shift). DJ-GATE-1: sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-18.md STEP qa-S88 present.
#
# GUARD: refuse unless FIX-PDF-EXTRACTOR-TEST-SYS-MODULES-LEAK is in qa[] with status QA. Board-only move --
# deliberately does NOT touch .head (currently tracks a peer in-flight row, FIX-VPS-SSC-INSIDER-502; refuses
# if that has changed to point at THIS task, since that would mean a different write pattern is expected).
# Usage: jq --arg now "$NOW" --arg note "<qa_review_note text>" \
#          -f scripts/qa-fix-pdf-extractor-test-sys-modules-leak-done-verified.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($ARGS.named.now) as $now
| ($ARGS.named.note) as $note
| (.task_board.qa // []) as $qa
| ([$qa[] | select(type=="object" and .id=="FIX-PDF-EXTRACTOR-TEST-SYS-MODULES-LEAK")][0]) as $t
| if $t == null then error("FIX-PDF-EXTRACTOR-TEST-SYS-MODULES-LEAK not in qa[] — refuse")
  elif ($t.status != "QA") then error("FIX-PDF-EXTRACTOR-TEST-SYS-MODULES-LEAK status != QA (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id == "FIX-PDF-EXTRACTOR-TEST-SYS-MODULES-LEAK") then
    error("head.active_task_id now points at this task — re-check whether a .head write is expected instead of a board-only move")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    next_agent: "pm",
    status_note: ($t.status_note + " | " + $note),
    qa_verdict: "APPROVED",
    qa_verified_at: $now,
    qa_verified_by: "qa",
    updated_at: $now,
    updated_by: "qa",
    verification: {
      raw_probe: {
        tool: "git merge-base --is-ancestor + git show --stat + docker inspect/exec (live pdf-extractor container) + pytest (in-container, 4 file-order permutations + full non-slow suite) + mypy (isolated before/after A/B)",
        args: {
          commits_verified: ["1d8b1374f", "8ac350161"],
          files_verified: ["apps/pdf-extractor/__tests__/unit/test_low_text_density_ocr_rasterize.py"],
          container: "vn-market-intelligence-mcp-pdf-extractor-1",
          image_created: "2026-08-08T11:34:24Z"
        },
        live_value_observed: "ancestor=yes both commits; git show --stat matches the single claimed file; live container image Created=2026-08-08T11:34:24Z (postdates fix commit 07-29 and zone's last code commit 07-31) — docker exec grep confirms all 4 if-not-in-sys.modules guard sites present verbatim in the running container's file, fix durably baked into deployed image not just docker-cp; in-container pytest re-run (not trusted from prose): ocr_backends+rasterizer both orderings 47 passed each, +page_rasterizer 32 passed, +tesseract_retry 26 passed (exact match to claimed evidence, order-independent); full non-slow suite 1047 passed/5 skipped/7 deselected/0 failed (claimed 1033 passed, 14-test delta = 2wk unrelated repo growth, skip/deselect/fail identical); mypy unrunnable in runtime image (tool not shipped) + host-side blocked by pre-existing env-only 'pdf-extractor invalid package name' error — independently re-derived 0-new-errors via isolated before/after mypy run on both file versions, identical 23-error baseline set (5 pre-existing ocr_adapter.py + 4 stub-attr test-file errors, only line numbers shift)",
        observed_at: $now
      }
    }
  }) as $done
| .task_board.qa = [$qa[] | select(.id != "FIX-PDF-EXTRACTOR-TEST-SYS-MODULES-LEAK")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
