# po-s50-pdfx-triage-groom.jq
# Pointer: docs/agents/po/flow/main.md (PO triage groom-to-READY + stale-resolve)
# Invoked: jq --arg ts "<UTC>" -f scripts/po-s50-pdfx-triage-groom.jq orch-state.json
#
# Action A: FIX-PDFX-ALERT-ADAPTER-BLOCKING is already shipped (commit 473f7cd2,
#   test test_alert_adapter_nonblocking.py, all urlopen sites to_thread-wrapped).
#   Stale backlog row -> move to .task_board.done with resolution evidence.
# Action B: FIX-PDFX-TEST-LOOP-POLLUTION groomed to READY (test_only, no_rebuild),
#   owner dev-pdf-extractor, blocked_by=[], crisp root-cause AC.

def alert_id: "FIX-PDFX-ALERT-ADAPTER-BLOCKING";
def test_id: "FIX-PDFX-TEST-LOOP-POLLUTION";

# pull the stale alert task object, enriched as a done record
(.task_board.backlog[] | select(.id == alert_id)) as $alert
| ($alert
   + {
       status: "DONE",
       closed_at: $ts,
       note: ($alert.note + " | PO-S50 2026-06-13: RESOLVED-ALREADY-SHIPPED — RAW-verified: commit 473f7cd2 (fix(pdf-extractor/infra): FIX-PDFX-ALERT-ADAPTER-BLOCKING offload urllib to thread); alert_adapter.py:71 async def send_work_alert, :136 await asyncio.to_thread(_do_request) wraps the blocking urlopen; unit test __tests__/unit/test_alert_adapter_nonblocking.py present; grep-proof AC met (no sync urllib reachable from async context in apps/pdf-extractor). Event-loop-starvation A-13 class now FULLY closed across pdf-extractor (extract_tables_usecase 48a64056, table_push_client f0999cff, 3 push-clients FIX-PDFX-PUSH-CLIENTS-ASYNC-URLOPEN, engine A20-EVENTLOOP-ASYNC-TO-THREAD, alert_adapter 473f7cd2). Backlog row was drift — never marked DONE.")
     }) as $alert_done
| .task_board.backlog |= map(select(.id != alert_id))
| .task_board.done += [$alert_done]
# Action B: groom the test task to READY in-place
| .task_board.backlog |= map(
    if .id == test_id then
      . + {
        status: "READY",
        owner: "dev-pdf-extractor",
        zone: "apps/pdf-extractor/",
        type: "FIX",
        size: "S",
        priority: "medium",
        blocked_by: [],
        test_only: true,
        no_rebuild: true,
        files: [
          "apps/pdf-extractor/__tests__/unit/test_extract_tables_cross_check.py",
          "apps/pdf-extractor/__tests__/unit/test_eval_detectors.py",
          "apps/pdf-extractor/__tests__/unit/test_bt7_path_a_section_filter.py",
          "apps/pdf-extractor/__tests__/unit/test_extract_tables_usecase.py",
          "apps/pdf-extractor/__tests__/unit/test_extract_md_tables_usecase.py",
          "apps/pdf-extractor/__tests__/integration/test_bt3_fix2_full_pipeline.py",
          "apps/pdf-extractor/__tests__/integration/test_extract_tables_bt3d_real_ocr.py",
          "apps/pdf-extractor/__tests__/integration/test_bt3_fix3_row_fidelity.py",
          "apps/pdf-extractor/__tests__/integration/test_extract_tables_fpt.py",
          "apps/pdf-extractor/__tests__/integration/test_extract_md_tables_fpt.py"
        ],
        acceptance_criteria: [
          "pdf-extractor unit+integration suite green in DEFAULT order AND under pytest -p no:randomly AND under -p randomly with a fixed seed (no order-dependent failures).",
          "ROOT CAUSE (not symptom): the ~36 failures stem from deprecated asyncio.get_event_loop() test helpers clashing with pyproject.toml asyncio_mode='auto'. Migrate every get_event_loop() call site (10 files, see files[]) to pytest-asyncio AUTO idiom (async def test + await) or asyncio.run()/fresh-loop-per-test. NO leftover get_event_loop() in apps/pdf-extractor/__tests__ — grep proof in handoff.",
          "No shared/global event loop leaks across tests (each async test gets its own loop; no 'attached to a different loop' / 'event loop is closed' errors).",
          "Production src under apps/pdf-extractor/{infrastructure,application,domain}/ UNCHANGED — git diff shows test-files-only. No compose/Dockerfile edit, no rebuild required (test_only, no_rebuild)."
        ],
        groomed_by: "po",
        groomed_at: $ts,
        status_note: ((.status_note // "") + " || PO-S50 2026-06-13T10:19Z: GROOMED READY. RAW-verified still genuine — asyncio_mode='auto' set (pyproject.toml:30), 10 test files still call deprecated get_event_loop(); no commit has addressed it. Zone freeze (ARCH-A20-CPU-CGROUP-REVIEW) long since lifted (acb48383); scope is test-files-only so even a frozen src-zone would not block. apps/mcp-server zone untouched. Root-cause mandate: kill the get_event_loop/AUTO-mode conflict class so the suite is green in ANY order, not just patch the 36 reds.")
      }
    else . end
  )
| .task_board._updated_at = $ts
| .task_board._updated_by = "po"
