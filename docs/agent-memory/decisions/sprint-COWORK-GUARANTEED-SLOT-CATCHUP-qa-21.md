# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa

**Sprint goal:** Make cowork `guaranteed:true` an honored contract — bounded catch-up firing for elapsed guaranteed slots, or a structured (non-silent) miss.
**Agent:** qa
**Started:** 2026-08-14T12:58:53Z
**Continuation of:** sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-20.md (CAP-REACHED 2026-08-14T09:34:30Z, 600L line cap)

---

### STEP qa-S126 · qa · 2026-08-14T12:58:53Z
**task-id:** FIX-COMMITCONVENTION-MANDATES-BARE-COMMIT-CONTRADICTS-LIVE-SWEEPGUARD-HARDBLOCK
**what-done:** Direct-Commit Verify (2nd pass; row stuck in qa[] since 2026-08-11 because 1st QA pass appended review-record prose but never lane-moved). Re-verified commits `e57c4b669` (AC-1/AC-2) + `4fbb3eb0d` (AC-3 docker-runbook + dev-standards fix + persisted script) at source.
**what-considered:**
- Both on main ancestry; `git show --stat` matches all 6 claimed files. Read live text of execute-tier.md:94, developer/main.md:102/104, dev-frontend/main.md:99/101, docker-runbook.md:148-153, commit-convention.md:38/108, dev-standards.md:1586/1598 — all now mandate trailing `-- <paths>`, none states the bare form as INVARIANT (PO's explicit 2026-08-14T04:11Z closure condition, discharged).
- Ran persisted `scripts/verify-fleet-commit-pathspec.sh`: 2 FAIL (dev-standards.md:909,1586) — but content-diffed against the original 4fbb3eb0d allowlist (lines 805/1465) and confirmed byte-identical prose, only line-shifted by unrelated later commits (9647c9c14 CANONICAL-block edit etc). Manually re-grepped full 64-hit corpus: zero unresolved live bare-commit-mandate sites.
**why-decision:** vc-approved, DONE_VERIFIED. Substantive fix (the actual policy/hook contradiction) verified correct at source; the script FAIL is an allowlist line-number fragility bug in the persisted proof, not a regression of this task's contradiction. Holding the row further re-costs throughput PO already flagged 27x (router sessions hard-blocked, prior_warns up to 60).
**why-change:** flagging script fragility (line-number-keyed allowlist drifts on any unrelated doc edit) as a lightweight follow-up in the review record — not in this task's own AC scope, not blocking.

### STEP qa-S127 · qa · 2026-08-14T13:00:00Z
**task-id:** FIX-PDFOCR-PAGECAP-COMPLETENESS-THRESHOLD-MISMATCH
**what-done:** Direct-Commit Verify. Re-verified commit `1b9425d6f` (fix+test) + `b1a05ab56` (notebook/DJ) at source, both on main ancestry, `git show --stat` matches sole claimed file. Own `bun test` on new regression file: 2/2 pass. Targeted 8-file OCR suite (dev's own file list, corrected my own typo'd BPE-DEV-3 filename): 89 pass/1 skip/0 fail, 90 tests — exact match to dev's 89/89 claim. `tsc --noEmit` clean, `mock-guard.sh` PASS on prod file, DDD/secret greps clean.
**what-considered:**
- Read diff at source: threshold now `Math.max(Math.min(expectedPages, OCR_MAX_PAGES)*0.5, 3)` (AC1 correct), blanket upfront DELETE removed in favor of existing per-page UPSERT + a post-loop prune that only deletes `page_number > maxPages` AFTER the write loop (AC2 write-before-delete correct).
- AC4 (live 3-file boot verify) was marked "NOT ATTEMPTED" by dev-mcp-server (honest — no restart in their session). Container `vn-market-intelligence-mcp-mcp-server-1` started 2026-08-13T19:18:35Z (after the fix commit), running fixed source (grep-confirmed `OCR_MAX_PAGES`/`cappedExpectedPages` present in-container). Queried live `market.db` via `bun -e` (bun:sqlite, readonly): all 3 named files stable at exactly 80 rows (maxp=80). Grepped container boot-window logs: all 3 fired only `"[pdfOcr] already extracted"` with `cappedExpected:80`, zero `"starting"`/`"incomplete extraction detected"`/DELETE entries — AC4 independently satisfied, going beyond the dev's own honest non-claim.
**why-decision:** vc-approved, DONE_VERIFIED. All 4 ACs verified true (AC1-3 at source+own test run, AC4 via live container/DB evidence QA obtained directly, not trusted from dev prose).
**why-change:** none — verdict matches expected outcome, no plan deviation.

### STEP qa-S128 · qa · 2026-08-14T12:59:12Z
**task-id:** UNBLOCK-OPS-RAG-REBUILD-DONEVERIFIED-FALSIFIED-BY-KERNEL
**what-done:** Direct-Commit Verify (board-hygiene row, no `.commit`/branch field). Derived write commit via `git log --oneline --all -- docs/data/orch/orch-state.json docs/data/orch/archive/2026-08.json` cross-checked against `completed_at` 2026-08-14T06:58:58Z: commit `3220f31bc` (committer-date 07:02:21Z, ~3min after completed_at). Confirmed on main ancestry; `git show --stat` matches exactly the row's own `files[]` (orch-state.json + archive/2026-08.json), no other production files touched.
**what-considered:**
- Re-ran all 4 checks the row's own status_note prescribed under "QA VERIFY", not trusted at face value: (a) `OPS-RAG-SERVICE-REBUILD-DEPLOY-LANCEDB-FIX` in hot `review[]` status == "BLOCKED" — confirmed; (b) archive `.done_tasks[]` index for that id == null AND `.restored_to_hot[0].id` == same id — confirmed; (c) row carries no un-prefixed `qa_verified_at` (only `_RETRACTED` suffix) — confirmed; (d) both files present in commit 3220f31bc's diff — confirmed, and read the diff at source (not stat alone): full OPS-RAG block deleted from archive `.done_tasks[]`, de-falsified BLOCKED version with FALSIFIED/RETRACTED banners + blocked_reason/verify_note/blocked_by/superseded_by present verbatim in orch-state.json.
- Original DONE_VERIFIED postmortem text retained verbatim below the FALSIFIED banner (no silent deletion); AC-1/AC-2 legs explicitly not disputed, only AC-3 (durability) leg retracted — matches the cited kernel dmesg evidence (3x OOM-kill at +1h00m/+1h14m/+20h34m past the 2026-08-12T12:46:40Z certification close). Pure board-data write (JSON only) — no production source touched, so `bun test`/`tsc`/`mock-guard`/DDD/security are correctly N/A (both files re-validated `jq empty` clean). `.head.active_task_id` is a different row (FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS, same QA-Drain batch) — left untouched.
**why-decision:** vc-approved, DONE_VERIFIED. All 4 row-prescribed checks independently re-verified true at source; commit content matches board state exactly; no ISSUE found.
**why-change:** none — verdict matches expected outcome, no plan deviation.
