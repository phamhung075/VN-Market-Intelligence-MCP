# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · architect (continuation 7)

**Sprint goal:** COWORK-GUARANTEED-SLOT-CATCHUP
**Agent:** architect
**Started:** 2026-08-26T01:00Z (rolled from -6.md, which sat at 154L/34919B against a 600L/36000B cap)

---

### STEP architect-S47 · architect · 2026-08-26T01:00Z
**task-id:** FIX-SQLITE-DOCKER-VIRT-CORRUPTION-ROOT-CAUSE-INVESTIGATION
**what-done:** Read-only forensics against the 4 preserved `.corrupt-*` snapshots (07-19, 07-30, 08-06, 08-26) plus live read-only `docker inspect`/`docker exec` probes. Wrote `docs/architecture-briefs/2026-08-26-sqlite-marketdb-corruption-6th-recurrence-crossboundary-engine-skew.md`. Lane-moved the row `backlog[]`→`ready[]`, `next_agent: developer`, `zone: multi`, `files` populated, via `orch-apply.sh`.
**what-considered:**
- Trusting ops' "Docker Desktop advisory-lock defect" as an established finding — REJECTED per dispatch instruction; treated as hypothesis, independently re-tested via header-byte forensics (file-format writer/reader version byte) rather than re-asserted.
- Treating tonight as "recurrence #6 of the same known issue" — REJECTED: header bytes show 07-19/07-30/08-06 are WAL-format (2/2) with a scattered multi-tree `btreeInitPage()` signature; 08-26 is rollback-journal format (1/1) — the first of the four to be so — with a narrow, structural signature instead (freelist off-by-1, one cross-tree stray pointer, 7788 rowid-disorder cells in one tree). Different failure class, not a continuation.
- Chasing the ~62.8M rowid magnitude as a corruption signal — REJECTED after reconciling against the live restored backup (`MAX(rowid)=61,330,052` at 04:30Z vs 62,841,915 at corruption, ~1.51M/20h): fully explained by ordinary `INSERT OR REPLACE` churn on `intraday_foreign_flow_5m` (non-AUTOINCREMENT rowid table, unconditional per-bucket REPLACE every 5 min per its own docstring). Flagged as a red herring so the implementer doesn't chase it.
- Recommending immediate named-volume migration (ops' option 1) — REJECTED, costed explicitly: already tried once (`ffa045e81` 04-25) and reverted after a VM-rebuild wiped it (`5ba622eca` 07-15); would ALSO require rewriting all 86 host-invoked script call-sites (52+34, grown from 25 four weeks ago) to `docker exec` — identical migration cost to the cheaper fix, for a strictly worse durability tradeoff while the backup hardening prerequisite (§5.4 of the 07-30 brief) is still unfixed.
**why-decision:** New, verified, previously-unrecorded finding tipped the recommendation: host bun (1.3.13 macOS) and container bun (1.3.13 oven/bun:1.3.13-debian) embed DIFFERENT SQLite engines (3.43.2 vs 3.51.2) against the identical bind-mounted file — confirmed live, twice, both directions. This and the refined advisory-lock/cache-coherency hypothesis (rollback-journal locking path, not the excluded WAL/SHM one) are both closed by one fix: route every host-invoked market.db script through a new `scripts/run-against-market-db.sh` `docker exec` wrapper (mirrors `orch-apply.sh`'s own SSOT-wrapper convention) instead of migrating the mount type.
**why-change:** Widened past the row's own framing (which asserted the lock-defect as fact) to independently re-derive the mechanism from evidence, per the dispatch's explicit instruction to match the originating signal's epistemics rather than the ops row's. Re-flagged (not re-fixed) the still-open 07-30 brief backup-integrity-gate gap as an unrelated but real, growing-risk finding.
