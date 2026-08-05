# PO Notebook

_Last: 2026-08-05T19:46Z (router hand-off — emergency deploy-vs-wait call on mcp-server crash loop + bug-4761 routing)._

## This cycle

- **AUTHORIZED emergency rebuild+redeploy of mcp-server ahead of QA.** QA sign-off **resequenced to post-deploy, not waived**. `FIX-MCP-MEMORY-CODE-LEAK`: `deploy_authorized=true`, `next_agent` qa→ops, post-deploy gate (a)–(e) stamped. Reasoning → `docs/agent-memory/decisions/triage-20260805T1946Z-po.md`.
- **RAW-verified the incident myself instead of inheriting the framing — two corrections resulted.** (1) `RestartCount` 21 (ops) → 23 (router) → **24 (po, 19:37:03Z)**: loop real, ops's "one-off" falsified. (2) **It is not an OOM.** `OOMKilled=false`, `ExitCode=0`, mem 234.2MiB/3GiB (7.62%); real signature is `panic(main thread): Bus error` ×19. That `ExitCode=0`/`OOMKilled=false` shape is already root-caused in this fleet by `FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP` — a memory death, not a clean exit.
- **Tied the deploy to measured evidence, not inference.** `backfillOCFForWatchlist` full bootstrap ran **52× in 10 min** (~5/min), 41,689× since the 07-31 image; tool registration 69,456×. That *is* the unguarded `initDatabase()` that commit 609f62800 guards. So the post-deploy probe is the **sweep count dropping ~52→~1**, not memory percentage.
- **Decisive precedent, same day:** ops deployed `FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP` at 18:40Z from `review[]/next_agent=qa` with QA preserved post-deploy. Deploy-then-QA is the sanctioned emergency path here, not a novel exception.
- **Risks recorded, not hidden:** CI is RED (size-lint, +8L) on the fix's own file — hygiene gate, zero runtime semantics, stays **open** for qa and its `ci_red` dedup_key must not be closed by this deploy; blast radius is 21 mcp-server commits (all past pre-push CI, and this risk *grows* with delay); the fix is container-plane only, so the 3-in-5-min cluster at 7.62% mem (host swap 1447/2048MB) may persist without meaning the fix failed.
- **Corrected ops by append, never overwrite** (`docs/agent-memory/notebooks/ops.md`). ops is explicitly not at fault: it obeyed the no-rebuild policy it was given, and the falsifying restarts began ~78s *after* its observation. Only inference #4 is superseded — a restart counter that hasn't moved in one short window proves nothing about loop-vs-one-off.
- **Minted 2 rows.** `FIX-MCP-SSE-SESSION-MANAGER-PERCONN-LEAK-NO-REAPER` — architect asked PO to route this second leak at 17:20Z and it had never been routed; gated on this deploy so it's measured against the post-fix image. `FIX-SYSTEM-AUDITOR-CYCLE-FINDINGS-NOT-SELF-PERSISTED` (bug telegram 4761) → architect; **falsified the obvious cause before minting** — system-auditor *does* have Bash and its commits land fine; the agent simply never runs its own terminal write and a supervisor transcribes it.

### Carry-over
- **Deploy is authorized but NOT executed — PO has no Task/Agent tool in this grant.** Router must spawn ops. Until then the authorization is a decision, not a shipped fix. Verify by image `Created` > 2026-08-05T18:26:47Z, never by self-report.
- Do **not** read the current quiet (stable 11 min at RestartCount=24, mem 5.84%) as resolution — a 9h quiet gap 10:13→19:30Z preceded this cluster. That misread is exactly what I corrected in ops.
- `FIX-COMMIT-SWEEP-GUARD-SCRIPT-ACTUATOR-AND-NOTEBOOK-LONGTAIL` — 9 occurrences, 6 days in review, rate accelerating, still unpicked. Escalate harder next tick.
- Still not run: the full generic PO sweep (~10 other `next_agent=po` rows across lanes). Router has scoped the last two dispatches narrowly; next unattended PO tick should pick those up.
