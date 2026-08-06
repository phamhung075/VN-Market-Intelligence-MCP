# Decision Journal — PO ruling · FACTORY-APIGW-split-capability-prober

**Context:** dev-team Review-Lane SECONDARY-Drain handed this stale `review[]` row (status=REVIEW, `branch:null`, direct-commit) to PO for sign-off/triage. Row had sat since 2026-07-24.
**Agent:** po
**Timestamp:** 2026-08-06T20:48Z

---

### RULING po-R1 · po · 2026-08-06T20:48Z
**task-id:** FACTORY-APIGW-split-capability-prober

**what-done:** Verdict = **CODE-ACCEPTED / CLOSE-GATE-NOT-MET → `next_agent=ops`**. Not signed `DONE_VERIFIED`; not sent back for rework. Row stays in `review[]` (correct lane for `scripts/ops-closegate-handoff.jq`, which expects `from_lane=review`). `deploy_gate` set to `PO-AUTHORIZED`. Retired `USER-GATED` wording stripped from `review_note`.

**what-considered:**
- **Sign `DONE_VERIFIED` now.** Rejected. `docs/protocols/docker-deployment-runbook.md` § Microservice Code-Change Close Gate Step 6 permits PO to mark DONE *only* after ops Steps 1–4b and qa Step 5 pass. They have not. The live image `vn-market-intelligence-mcp-api-gateway:latest` was built **2026-07-15 17:05 CEST**; the commit is **2026-07-24 14:24 CEST**. Signing off would have been the textbook Restart≠Rebuild false-ship.
- **Send back for rework.** Rejected — nothing is wrong with the code. Every implementer claim was re-derived RAW rather than banked from the self-report: `git merge-base --is-ancestor 9fad8d4ad HEAD` → yes; file sizes 104/130/191L match exactly; `go build ./...` and `go vet ./...` in `apps/api-gateway` both exit 0 at current HEAD; decision journal present and substantive.
- **Escalate BLOCKED as user-gated.** Rejected, and this is the load-bearing call. The row's own `review_note` said "USER-GATED — rebuild-verify PENDING-USER-GATED". That belief is **retired by permanent user directive 2026-08-01** (`feedback_po_deploy_rebuild_full_autonomy_no_user_gate`): PO dispatches ops for a single-service rebuild directly, never waits, and the words "user-gated"/"PO cannot authorize" are not to be written on a board row. That exact belief previously cost 7 days of pure signal spam on an already-fixed bug. Honouring it here would have re-run the same failure.
- **Inherit the peer row's "phantom deploy gate" finding.** Rejected after a RAW discriminator. The prior PO cycle (2026-08-06T20:33Z, `FACTORY-APIGW-split-sandbox`) correctly found `rebuild_required:true` was *phantom* there, because `apps/api-gateway/Dockerfile:12` builds `-o gateway ./cmd/server/` only and `cmd/sandbox` never enters the image — and explicitly called it a "CLASS", two-for-two. Pattern-matching that onto this row would have produced a wrong `DONE_VERIFIED`. Ran `go list -deps ./cmd/server/`: it **does** return `pkg/infrastructure`, the package holding all three split files. This code ships in the gateway binary; the gate is real. Recorded as `deploy_gate_discriminator` on the row so the next sweep cannot re-generalise.

**why-decision:** The only thing actually wrong with this row was that `next_agent` was **null** — no lane owned it, which is why 13 days of Review-Lane sweeps found nothing resolvable. Naming an owner (`ops`) plus a copy-paste-safe close-gate command converts a stranded row into a dispatchable one without inventing work.

**why-change:** Deviation from the incoming brief, which stated "rebuild-verify PENDING-USER-GATED". PO overrode that per the 2026-08-01 directive and authorised the rebuild.

**side-finding (peer row, advisory only):** `FACTORY-APIGW-dedup-default-urls` sits in `review[]` with `next_agent=qa`; its commit `b184dde9f` edits `cmd/server/main.go` — squarely in the shipped binary — against the same 3-week-stale image. QA verifying it now would be a **false green**. Wrote an additive `qa_precondition` field only; did **not** touch its lane or `next_agent` (no lock held on it). The single `docker compose build api-gateway` dispatched here also ships that commit plus `251cda70e` and `868bf8d1d` — 4 undeployed api-gateway commits, one rebuild.
