# Decision Journal — Sprint B-05-FU-SSC-503-RETRY · qa

**Sprint goal:** Independently gate dev-vps-crawls's revert of FIX-BCTC-SSC-503-RETRY's 60s retry — verify honest fast-fail (<5s, strictly under mcp-server's 5s discovery budget), no regression, no fabrication.
**Agent:** qa
**Started:** 2026-07-03T20:07Z (router fire-tick, qa gate)

---

### STEP qa-S1 · qa · 2026-07-03T20:10:00Z
**task-id:** B-05-FU-SSC-503-RETRY
**what-done:** Re-ran both test suites myself (not trusting dev's reported counts): `test_discover_bctc_ssc_fastfail.py` 7/7 PASS, `test_discover_bctc_title_classifier.py` 35/35 PASS, `py_compile` clean, `mock-guard.sh --files` PASS exit 0.
**what-considered:**
- Trust dev's reported pass counts vs re-run independently — chose re-run (standing QA discipline: verify raw, not badges/claims).
- Read only the diff vs also grep the full file for residual `time.`/retry-loop remnants — chose full-file grep (defends against partial-diff blind spots).
**why-decision:** Independent re-run + full-file structural grep is the only way to catch a claim that "removed X" when X might still exist elsewhere untouched by the diff hunk shown.
**why-change:** No change from plan — matches task's explicit re-run mandate.

### STEP qa-S2 · qa · 2026-07-03T20:16:00Z
**task-id:** B-05-FU-SSC-503-RETRY
**what-done:** Cross-checked the claimed 5s mcp-server caller budget directly against source (`bctcQueueEnricherJob.ts:57 DISCOVERY_TIMEOUT_MS=5_000`, `bctcDiscovery.ts:351 timeout ?? 5_000`), confirming the new `_SSC_STEP1_TIMEOUT_SECONDS=4` cap is genuinely strictly under budget, not merely asserted in a comment.
**what-considered:**
- Trust the code comment's claimed budget vs read the actual mcp-server constants — chose read-the-source (comments can drift from the values they describe).
- Also verified no shell-injection surface (grep for subprocess/os.system/shell=True on whole file → 0 hits in code) since the fix touches an external-network fetch path.
**why-decision:** DDD security discipline requires verifying the bounded-fetch claim against ground truth, not the fix's own narrative.
**why-change:** No change from plan.

### STEP qa-S3 · qa · 2026-07-03T20:22:00Z
**task-id:** B-05-FU-SSC-503-RETRY
**what-done:** Verdict PASS. Appended QA Gate section to `reports/TASK_REPORT_B-05-FU-SSC-503-RETRY.md` (kept dev's original report intact, did not overwrite). Flagged non-blocking observation: `discover-bctc-urls-browser.py:1068` step2 download `timeout=60` — different code path, out of scope, recommend follow-up BACKLOG item.
**what-considered:**
- Overwrite dev's task report with a QA-only version vs append a QA section preserving both trails — chose append (precedent risk: overwriting a report that already existed under the same filename would destroy dev's evidence).
- Block the gate on the `timeout=60` step2 observation vs log as non-blocking — chose non-blocking per task's own framing (different path, caller still hard-aborts at 5s regardless).
**why-decision:** All 5 accept criteria independently verified with re-run evidence; no fabrication, no regression, scope matches PO-corrected spec exactly (not the original inverted one).
**why-change:** No change from task mandate.
