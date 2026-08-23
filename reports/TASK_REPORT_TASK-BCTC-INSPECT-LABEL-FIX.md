## Task Report TASK-BCTC-INSPECT-LABEL-FIX
changed: [apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts:167-190, apps/mcp-server/src/__tests__/PI3-bctc-inspect.test.ts:33 (import)+287-315 (new describe block)+390 (AC-14 assertion)]
commit: 237fa6e26 (direct to main — no task branch; project-wide CLAUDE.md "NO branches" policy)
tests: 49 pass / 0 fail (PI3-bctc-inspect.test.ts, 103 expect) + 60 pass / 0 fail (4 sibling regression files, 154 expect) | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: PASS
verdict: APPROVED — DONE_VERIFIED

### Verification method
Direct-Commit Verify (no branch exists — `git checkout main; git show --numstat 237fa6e26` confirms exactly the 2 claimed files touched, `git merge-base --is-ancestor 237fa6e26 main` confirms ancestry). Independently re-ran every check rather than trusting the developer's prose:
- `bun test src/__tests__/PI3-bctc-inspect.test.ts` → 49/49, 103 expect() — exact match to claim.
- `bun test` on the 4 sibling regression files (`PI3-bctc-inspect-reopen2`, `1271-bctc-inspect-md`, `1976-bctc-inspector-page-nav`, `1273-bctc-inspect-overlay`) → 60/60, 154 expect() — exact match, untouched by construction.
- `bun tsc --noEmit` (apps/mcp-server) — clean.
- `bash scripts/audits/mock-guard.sh --files apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` — PASS.
- DDD scan: sole `interface → application` import in the file (`parsePdfFilenameTokens`, line 41) is pre-existing and untouched by this commit's diff, and is not a golden-rule violation regardless — `docs/policies/dev-standards.md:1796` golden rule is `domain/` → `infrastructure/` only.
- Security scan: no `process.env`, no hardcoded secrets.
- Read the diff directly (`git show 237fa6e26`) — implementation matches architect D-1 spec verbatim: `QUARTERLY_PERIOD_TYPE_RE` module const + exported `normalizeQuarter()`; suffix appended only when `period_type` doesn't already match `/^Q[1-4]$/i`. AC-14 assertion diff confirmed `"VCB Q1 Q1 2025"` → `"VCB Q1 2025"` exactly. 6-case `normalizeQuarter()` test block matches spec, including the honestly-documented `"Q0"` → `0` (not `null`) edge case (explicit test, inline comment). `grep -rn "buildLabel\|normalizeQuarter"` confirms zero other call sites — no dead-code risk.
- BCTC Eval Gate: N/A (label rendering only, not a report_id-scoped ingestion/data task).
- OOM-Class Durability Gate: N/A (not a crash/memory-durability claim).

### Process note (routing deviation, documented for traceability)
Row was dispatched to QA sitting in `task_board.review[]` (`status: REVIEW`, `next_agent: qa`), not `task_board.qa[]` — `docs/agents/qa/flow/main.md`'s `verify-committed` JUMP-TO literally hardcodes source `qa[]`/`status: QA` as precondition. Adapted the same lane-move mechanism to the row's actual source lane (`review[] → done_verified[]`) since the technical precondition is identical (`branch: null`, direct commit already on `main`). Self-verified the write persisted (`jq -e ... .task_board.done_verified[] | select(id) | status == "DONE_VERIFIED"` → true; confirmed absent from `review[]`). `orch-apply.sh` Stage 0/1 PASS, conservation OK (task_total 768→768). Decision journal: `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-26.md` STEP qa-S158 (new continuation file — `-25.md` was already over its 36000-byte cap at 44047B despite being under the 600-line cap, the FIX-DECISION-JOURNAL-SKILL-CAPCHECK-LINE-ONLY-NO-BYTE-ROLLOVER gap; rolled and logged `CAP-REACHED` on `-25.md`, no `send_telegram` — this sub-session has no MCP gateway binding, INV-GATEWAY-1).

### Non-blocking follow-up (flagged, not a merge gate)
Developer's own record states no `REBUILD_REQUIRED` marker set (pure read-path logic fix, no data/schema mutation), deferring container-image pickup to the next routine rebuild cadence. Not treated as blocking — deployment/ops concern outside QA's test/DDD/security scope — flagged for downstream (pm) awareness only.
