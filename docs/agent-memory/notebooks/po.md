# PO — Notebook

## 2026-08-06T20:48Z · triage: FACTORY-APIGW-split-capability-prober → ops (CODE-ACCEPTED / CLOSE-GATE-NOT-MET)

### What actually happened
- **Third stale `review[]` row in three ticks, but the FIRST one that must NOT be signed off.** The two before it (`FACTORY-KINHDICH-split-sandbox`, `FACTORY-APIGW-split-sandbox`) went `DONE_VERIFIED`. This one did not, and the difference is real rather than procedural.
- **Code side is clean and was re-derived RAW, not banked.** `git merge-base --is-ancestor 9fad8d4ad HEAD` → yes. Sizes 104/130/191L match the claim exactly. `go build ./...` + `go vet ./...` in `apps/api-gateway` both exit 0 at current HEAD. Decision journal present. Nothing to rework.
- **But the container is 3 weeks stale.** Live image `vn-market-intelligence-mcp-api-gateway:latest` built **2026-07-15 17:05 CEST**; commit is **2026-07-24 14:24 CEST**. Runbook § Close Gate Step 6 lets PO mark DONE only after ops 1–4b + qa 5. Signing would have been a textbook Restart≠Rebuild false-ship.
- **Root cause of the 13-day strand was one null field.** `next_agent` was unset, so no lane owned the row and every Review-Lane sweep correctly found nothing resolvable. Setting `next_agent=ops` is the whole fix — no invented work.

### Decisions worth keeping
- **I nearly inherited the previous cycle's own conclusion and got it backwards.** My 20:33Z entry declared the phantom deploy gate "confirmed as a CLASS, two-for-two" — `rebuild_required:true` on work no image builds, because `Dockerfile:12` compiles `-o gateway ./cmd/server/` only. Applying that class here would have produced a wrong `DONE_VERIFIED`. Ran the discriminator instead: `go list -deps ./cmd/server/` **does** return `pkg/infrastructure`, the package holding all three split files. Gate is REAL here. **A class I established myself one tick earlier is still a hypothesis on the next row — the deps query costs one command and it inverted the verdict.** Wrote it onto the row as `deploy_gate_discriminator` so the next sweep can't re-generalise.
- **Refused the row's own "USER-GATED" framing.** `review_note` said "rebuild-verify PENDING-USER-GATED". Retired by permanent user directive 2026-08-01 (`feedback_po_deploy_rebuild_full_autonomy_no_user_gate`) — that exact belief already cost 7 days of signal spam on an already-fixed bug. Authorised the rebuild myself, set `deploy_gate=PO-AUTHORIZED`, and **stripped the token from the note rather than just contradicting it** — a future reader hitting the stale word would re-strand the row.
- **The `sub()` left a residue and I only caught it by re-reading.** First pass replaced `rebuild-verify PENDING-USER-GATED, code-only.` but left a dangling `USER-GATED - ` earlier in the same sentence. Post-write `grep -c` → 1, not 0. Second pipe cleaned it. **Verify a string surgery by grepping for the token you meant to kill, not by eyeballing the tail of the field.**
- **Caught a false-green on a row I don't own, and stayed additive.** Peer `FACTORY-APIGW-dedup-default-urls` is `review[]`/`next_agent=qa`; its commit `b184dde9f` edits `cmd/server/main.go` — in the shipped binary — against the same stale image. QA would have "verified" code that isn't running. Wrote an additive `qa_precondition` field only; did **not** touch its lane or `next_agent`, no lock held. One `docker compose build api-gateway` ships all 4 undeployed commits and unblocks both rows.

### Evidence (raw, re-runnable)
- 4 `orch-apply.sh` pipes, all Stage 0+1 PASS, conservation `task_total 775=775` / `signal_total 202=202` on every one, head untouched throughout.
- Post-apply re-read from disk: row `next_agent=ops`, `deploy_gate=PO-AUTHORIZED`, `status=REVIEW` (kept in `review[]` deliberately — `scripts/ops-closegate-handoff.jq` expects `from_lane=review`).
- Deploy gap sized: `git log --since="2026-07-15 17:05" -- apps/api-gateway/` → 4 commits (`251cda70e`, `9fad8d4ad`, `868bf8d1d`, `b184dde9f`).
- All timestamps from `date -u`, measured not typed.

### Carry-over
- **Ops owes the rebuild:** `docker compose build --build-arg GIT_SHA="$(git rev-parse HEAD)" api-gateway && docker compose up -d --no-deps api-gateway && bash scripts/verify-deploy-sha.sh api-gateway` (must exit 0), then `scripts/ops-closegate-handoff.jq` `from_lane=review` → qa. Never down/stop/kill/rm/--force-recreate.
- **Zone-wide deploy drift is the real story** — api-gateway has been running 3-week-old code while 4 commits accumulated. Nothing detects "committed but never rebuilt" per-zone; that is a missing guard, not a missing task. Still unminted.
- **Flow-level pass still owed on two confirmed classes** (from 20:33Z, untouched): implementer ships code + journal but leaves the board row noteless; and `rebuild_required:true` set by template regardless of whether an image builds the path. Now sharpened — the template defect is that `rebuild_required` is asserted, never *derived* from the Dockerfile's build target.
- **`scripts/audits/po-mint-orchapply-actuator-verify.sh` still unauthored** (main.md:173) — `scripts/` outside agent-father's commit zone, no owner.
- **Two P1 telegram-ack rows still undispatched** (`FIX-TELEGRAM-REPORT-ACK-STATUS-STOP-RESURFACE`, `FIX-PO-MAINFLOW-ORPHANS-TELEGRAM-REPORTS-RESOLVER-SUBFLOW`).
- **AC-3 self-verification still known-broken** (`FIX-PO-AC3-SELFVERIFY-FALSE-FAILLOUD-WHEN-PEER-SWEEPS-ORCHSTATE`) — greps own commit stat, not HEAD tree. Asserted against HEAD tree again this cycle.
- **Single-row triage, not a full PO tick** — no channel audit, TNB read, signal-dashboard drain, or manual-dispatch/supervised-goahead sweep. Next full tick owes all of those.
