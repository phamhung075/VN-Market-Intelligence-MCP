# Decision Journal — Sprint FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP · dev-rag-service

**Sprint goal:** P1 live incident — stop the compaction failure-path burst multiplier crashing rag-service inside its 768MiB cap.
**Agent:** dev-rag-service
**Started:** 2026-08-05T11:00Z

---

### STEP dev-rag-service-S1 · dev-rag-service · 2026-08-05T11:15Z
**task-id:** FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP
**what-done:** Moved `self._insert_count = 0` in `compact()` from the try success-path into a `finally:` block; added `self._compact_lock` (`asyncio.Lock`, per-instance) guarding actual `optimize()` execution.
**what-considered:**
- Reset in `finally:` only, no lock — fixes AC1 but leaves AC2 (two concurrent inserts both calling `table.optimize()`) unaddressed.
- Reset in `finally:` + guard `compact()` body with `if self._insert_count < _COMPACT_EVERY: return` re-check under the lock — rejected: silently changes the documented direct-invocation contract ("can be invoked directly, e.g. from a maintenance endpoint or daily cron") so a below-threshold direct call becomes a no-op; not requested by fix_spec.
- Reset in `finally:` + `if self._compact_lock.locked(): return` skip-guard before acquiring, second caller's finally never runs but is unneeded (first caller's finally already reset the shared counter) ← CHOSEN. Preserves direct-invocation semantics (lock never held on a solo call) and produces exactly ONE `optimize()` call under concurrent threshold-crossing.
**why-decision:** Chosen option satisfies AC1 (reset always fires) and AC2 (exactly one optimize() call under concurrency) with zero behaviour change to the already-documented direct-call contract for `compact()`, verified by both new unit tests plus the 4 pre-existing compaction tests unchanged.
**why-change:** No change from PO's fix_spec plan — this is the concrete mechanism for "add an asyncio.Lock so concurrent insert() coroutines cannot both launch optimize()".

### STEP dev-rag-service-S2 · dev-rag-service · 2026-08-05T11:25Z
**task-id:** FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP
**what-done:** Wrote AC1 test injecting a raising `table.optimize()` (AsyncMock on the real LanceDB table object) and AC2 test using `asyncio.gather()` of two `insert()` coroutines with a tracking wrapper around the real `table.optimize()`.
**what-considered:**
- Monkeypatch `store.compact` directly (like the 2 pre-existing failure tests) — rejected for AC1: that bypasses the actual finally/lock logic under test, would pass even on the unfixed code.
- Manually interleave two `asyncio.Task`s with explicit yields to force a race — rejected as over-engineered; `asyncio.gather()` on two real-I/O `insert()` calls already yields at `table.add()`, giving a realistic race deterministically (verified stable across 5 random pytest-randomly seeds).
**why-decision:** Tests must exercise the real defect mechanism, not a shortcut — matches PO's "AC1/AC2 are unit tests (inject a raising table.optimize) and are the DoD" instruction literally.
**why-change:** No change from plan.
