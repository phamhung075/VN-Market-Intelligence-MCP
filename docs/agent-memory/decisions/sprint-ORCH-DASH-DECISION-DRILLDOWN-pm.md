# Decision Journal — Sprint ORCH-DASH-DECISION-DRILLDOWN · pm

**Sprint goal:** A-20 event-loop starvation deep-dive sequencing (atomic dev task decomposition from architect design)
**Agent:** pm
**Started:** 2026-06-08T08:35:00Z

---

### STEP pm-S1 · pm · 2026-06-08T08:35:00Z · DJ-GATE-1
**task-id:** A20-EVENTLOOP-ASYNC-TO-THREAD
**what-done:** Sequenced architect A-20 event-loop starvation fix into atomic dev implementation task. Created handoff docs/handoffs/A20-EVENTLOOP-ASYNC-TO-THREAD.md (S size, P1 priority, dev-pdf-extractor owner, apps/pdf-extractor/ zone). Decomposed architect design (extract_tables + extract_text_ocr sync logic → _sync helpers + asyncio.to_thread wrappers) into single-file, ~2h task. Updated orch-state.json: (1) A20-EVENTLOOP-STARVATION-ARCHITECT → DONE (architect work 08:20Z complete); (2) A20-WEDGE-CAPTURE-RESTART → DONE-MITIGATION (ops mitigation done, kept open — not terminal until structural fix verified); (3) FIX-AUDITOR-A20-MULTIPROBE → depends_on: A20-EVENTLOOP-ASYNC-TO-THREAD (auditor sensor hardening sequenced after dev fix + ops rebuild succeed).
**what-considered:**
- Single task (A20-EVENTLOOP-ASYNC-TO-THREAD) vs two tasks (extraction_engine refactor + test suite): single atomic task (one file family, one method pair, same class) is tighter scope and clearer AC (multi-probe gate is single acceptance criterion).
- Architect vs dev ownership of the to_thread wrapper: architect designed, dev implements (correct boundary — design in architect brief, implementation in dev code).
- FIX-AUDITOR-A20-MULTIPROBE sequencing: block it on dev task (sensor hardening must NOT run until structural fix proven on multi-probe, not single-probe like c103).
**why-decision:** One atomic task (no split) because (a) both extract_tables + extract_text_ocr are in the same class (PdfplumberExtractionEngine), (b) both use identical asyncio.to_thread pattern, (c) multi-probe gate in AC is singular unifier (all methods under same test harness), (d) reuse TC11 test pattern from extract_tables_usecase.py directly (no new test patterns to learn). Handoff includes all 4 architect-specified ACs: pytest green, in-container probe 200 while /extract in flight, external host probe 200, sustained >=15min multi-probe (single-probe PASS is the c103 false-green trap). FIX-AUDITOR-A20-MULTIPROBE blocked-by A20-EVENTLOOP-ASYNC-TO-THREAD to prevent re-arming c103-style bugs (sensor must be tuned AFTER final topology, not before).
**why-change:** Architect brief said "no split required"; PM honored that (one subtask for single dev-pdf-extractor specialist). Board state updates follow architect decision boundary: architect-done (DONE), ops-mitigation-done (DONE-MITIGATION, kept open per instruction), dev-implementation-blocked-on-async-to-thread (FIX-AUDITOR dependency). Matches the sequence directive from user: "Sequence FIX-AUDITOR-A20-MULTIPROBE AFTER the fix lands".
