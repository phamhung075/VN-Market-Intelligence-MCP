# Decision Journal — Sprint cron-audit-batch-push-gate · qa

**Sprint goal:** QA gate for dev-mcp-server cron-audit batch `ac621f648..752d76477` (PUSH-AUTONOMY-1 condition (a) missing leg) + adjudicate the sshExec accept-new security relaxation.
**Agent:** qa
**Started:** 2026-07-22T17:35:15Z

---

### STEP qa-S1 · qa · 2026-07-22T17:35:15Z
**task-id:** BLOCK-PUSH-CRON-AUDIT-BATCH-NO-QA
**what-done:** RAW-verified the 5-commit batch independently of PO's numbers: targeted tests for all 4 audit items (Sunday-catchup, watchdog-widen, ssh-exec/known-hosts/fail-loud) = 110/110 pass; wider debug-trigger/vps-registration zone (FIX-BCTC-DEBUG-TRIGGER, FIX-VPS-DEBUG-TRIGGERS, FACTORY-INTERFACE-debug-trigger-routes-smoke, 1779-vps-service-restart) = 79/79 pass; `bun tsc --noEmit` re-run rc=0 zero diagnostics; DDD grep (no `/domain/` file touched, no domain→infra import); secrets/`process.env` grep clean; `mock-guard.sh` rc=2 CAUTION only (one pre-existing TODO comment marker, non-blocking); independently re-ran `gen-project-stats.ts` and reproduced `cronJobCount=88` byte-idempotent against the committed `project-stats.json`.
**what-considered:**
- Trust PO's full-suite A/B numbers as sufficient. Rejected as the sole basis — re-ran my own targeted+cluster subset rather than rubber-stamp, per PUSH-AUTONOMY-1 cond.(a)'s actual ask (an independent QA leg, not a re-statement of PO's).
- Treat the standing 42-fail full-suite baseline as blocking. Rejected — gate text is "targeted/merge-gate suite", pinned that reading in `docs/policies/dev-standards.md` (agreed with PO's ask) so it stops being re-litigated.
**why-decision:** Zero net new regressions on every subset I independently ran, tsc clean, DDD/security clean, mock-guard non-blocking → all 3 PUSH-AUTONOMY-1 legs now RAW-satisfied (a: this QA APPROVE + PO sign-off already on record; b: targeted suite 0 fail; c: tsc rc=0).
**why-change:** none — this is the missing leg the dispatch asked me to supply.

### STEP qa-S2 · qa · 2026-07-22T17:35:15Z
**task-id:** FIX-MCP-DOCKERFILE-ENTRYPOINT-KNOWNHOSTS-REGRESSION
**what-done:** Independently re-derived PO's disproof against git rather than accepting it verbatim: `git show 6165aa3b4 -- apps/mcp-server/Dockerfile` (message: "rebase Dockerfiles from Debian to Ubuntu to unblock builds") shows the `openssh-client` apt line AND `ENTRYPOINT ["/entrypoint.sh"]` both silently dropped, unmentioned. `apps/mcp-server/entrypoint.sh` confirmed still `git ls-files`-tracked, byte-identical to `b741c5634` (task-1779c, QA-APPROVED 2026-04-30), and confirmed `set -e` + `exit 1` on empty `ssh-keyscan` output — restoring it verbatim today (VPS dark) would hard-crash the container on every boot.
**what-considered:**
- Overturn PO's ruling and require the security relaxation be reverted now. Rejected — reverting `accept-new` today just re-breaks the tool with nothing to gain (VPS unreachable, cannot verify either state), same reasoning PO already reached.
- Require a comment-precision fix (the code comment overstates persistence: `known_hosts` is ephemeral per container since nothing mounts `/root/.ssh`, so it's TOFU-per-recreate not TOFU-once). Considered as CHANGES_REQUESTED but rejected — it's a doc-accuracy nuance not a functional defect, already captured verbatim in `FIX-MCP-DOCKERFILE-ENTRYPOINT-KNOWNHOSTS-REGRESSION`'s own `why_accept_new_is_weaker_than_claimed` field; blocking the push over a comment wording gap when the underlying MITM-reject-on-changed-key behavior is correct would be disproportionate.
**why-decision:** UPHOLD PO's ruling. `accept-new` ships as a stopgap only; durable fix = un-revert the already-QA-approved `entrypoint.sh` wiring (with the mandatory non-fatal-degrade change PO already specified) once the VPS is reachable to verify against. Tracked, not re-opened.
**why-change:** none.
