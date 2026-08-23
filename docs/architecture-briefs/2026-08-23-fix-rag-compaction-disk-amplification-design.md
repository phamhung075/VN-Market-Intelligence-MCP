# FIX-RAG-COMPACTION-DISK-AMPLIFICATION — Design Brief (plan_only, supervised)

**Written:** 2026-08-23T20:00Z · **Author:** dev-rag-service
**Row:** `task_board` FIX-RAG-COMPACTION-DISK-AMPLIFICATION — `plan_only: true`, `supervised: true`.
This is a design/analysis artifact only. **No code was changed, no table was written to, no file
under `data/live/lancedb/` was deleted or modified.** All measurements below are read-only
(`du`/`find`/`stat` against the host bind-mount) or local package inspection (`lancedb==0.25.3`
installed in this sandbox, matching this repo's own historically-noted host/Docker version drift —
see §6). Docker was not exec'd into, per the row's own constraint.

---

## 1. Summary verdict

The row's 2026-07-29 evidence (733 MB / 785 MB, thousands of small fragments, `_indices` NOT pruned
while `_versions` IS) is **stale and already partially superseded** by two unrelated fixes that
landed since (`LANCEDB_COMPACT_RETENTION_HOURS` shortened 2 days→1h, 2026-08-14; the memory-oscillation
session-cache/vector-index fixes, same date). Fresh measurement today (§2) shows the corpus footprint
has shrunk to **366 MB**, and the `_versions` vs `_indices` retention asymmetry the row's evidence
described no longer explains the majority of what remains.

**The dominant remaining cost (≈285 MB, 84% of `rag_entries.lance/data/`) is orphaned
`.tmp*` staging files from writes that never committed** — almost certainly OOM-kill casualties from
this service's well-documented 2026-07-18→08-14 crash-loop history (`FU-RAG-DEPLOY-MEMORY`,
`FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED`, etc.). These files are **structurally
invisible to `optimize(cleanup_older_than=...)`** — that parameter only prunes *committed, superseded*
dataset versions/fragments. LanceDB has a **separate, distinct parameter for exactly this class of
file — `delete_unverified`** — which this codebase's `compact()` call does not pass (defaults to
`False`, i.e. never reclaimed short of LanceDB's own internal safety floor). This is a genuine,
previously-unidentified root cause, confirmed against the installed `lancedb` package's own docstring
(§4), not inferred.

**A secondary, smaller but actively-growing cost** is empty `_indices/<uuid>/` directory shells —
1,602 of 1,647 index-generation directories are now zero-content, and new empty dirs are still being
created daily under fully healthy, non-crashing operation (§5). This is bytes-cheap today (23 MB) but
unbounded in directory/inode count.

**What this brief explicitly rules out**, correcting the "context worth having" hint in this task's
dispatch: `compact()` does **not** re-fire a full-table rewrite on every container restart. `_insert_count`
is a per-process in-memory counter that resets to 0 on restart (`repositories.py:276`); nothing in
`_get_table()` or the startup path calls `compact()`/`optimize()` unconditionally. That per-restart-
rebuild mechanism is real for the **vector ANN index** (a different, already-fixed defect —
`list_indices()` skip-check landed 2026-08-14, commit `82216e291`) but does not apply to compaction.

---

## 2. Fresh measured evidence (2026-08-23T18:5x-19:4xZ, read-only, host bind-mount)

```
$ du -sh data/live/lancedb                                    → 366M   (was 733M/785M, 2026-07-29)
$ du -sh data/live/lancedb/rag_entries.lance/*
   340M  data/                (was 555-596M / 2878-3137 files)
   2.6M  _versions/           (was 30-32M / 2878-3091 files)   — retention-hours fix clearly working
   364K  _transactions/
    23M  _indices/            (was 136-145M / 735-745 dirs)    — also much smaller now
$ find .../data -type f -not -name '.tmp*' | wc -l              → 171 files,  56 112 KB total  (real committed fragments — SMALL)
$ find .../data -type f -name '.tmp*'      | wc -l              → 44 files,  292 164 KB total  (orphaned staging files — DOMINANT)
$ find .../_versions -type f               | wc -l              → 90 manifests, spanning 2026-08-11 → 2026-08-23 (12.7d, ~7/day — consistent w/ 1h retention pruning most per-insert versions)
$ find .../_indices -mindepth 1 -maxdepth 1 -type d | wc -l      → 1,647 dirs; 44 non-empty (23M), 1,602 EMPTY
```

**The 44 orphaned `.tmp*` files' mtimes cluster tightly around this service's documented OOM-kill
dates** (2026-07-22, 23, 24, 28, 31 (x7), 08-01, 02, 06, 07, 12 — the last one 2026-08-12T11:29 local,
matching the final pre-fix restart cycle documented in
`project_ragservice_memory_oscillation_contradicts_staleack_20260813.md`). **Zero new `.tmp*` orphans
have appeared since 2026-08-12** — corroborating that the memory-fix (2026-08-14, commit `82216e291`)
stopped the crash-loop that was creating them. This is a closed, static backlog today, not an actively
growing one — but it will grow again on any future OOM-kill/hard-restart, because nothing currently
reclaims it (§4).

`_indices/` empty-dir creation, by contrast, is **ongoing and not crash-correlated** — a `find -printf`
by date shows non-trivial counts (14-226/day) through every day in the range including 2026-08-22 and
2026-08-23 (today, no known incidents). New non-empty (live) index generations are also created daily
(08-22, 08-23 UUIDs present) — consistent with routine `optimize()`'s "Index: adds new data to existing
indices" step (§5 mechanism) firing on the normal ~100-insert compaction cadence, not a fault.

---

## 3. What is NOT the mechanism (ruled out, evidence-based)

- **Compaction re-firing on every restart** — ruled out. `_insert_count` is process-local; nothing
  calls `compact()` at startup. (This mirrors, but is distinct from, the ANN-vector-index rebuild
  mechanism that *was* real and *was* already fixed — see summary.)
- **`_COMPACT_EVERY=100` being miscalibrated for current traffic** — not supported by current evidence.
  With `cleanup_older_than=1h` (already tuned 2026-08-14) and ~90 manifests spanning 12.7 real days,
  the retention window and compaction cadence are already reasonably matched; `_versions/` bytes are
  small (2.6 MB) and non-`.tmp` `data/` bytes are small (56 MB / 171 files for an ~11-17k-row corpus).
  Retuning cadence further would not move the two mechanisms below. **Not recommended as part of this
  fix** — revisit only if insert-rate materially changes from the ~3,000/day baseline this constant was
  last checked against.

---

## 4. Root cause A (dominant): `delete_unverified` gap — orphaned staging files never reclaimed

Confirmed directly from the installed `lancedb==0.25.3` package (`lancedb/table.py:4306-4358`,
`AsyncTable.optimize()` docstring — this codebase's own Docker image has drifted to a newer pinned
version per prior in-repo comments (0.33.0→0.37.1), but `requirements.txt` only floors `>=0.6.0` and
this parameter's presence/shape is stable across that range per the `.pyi` stub, `_lancedb.pyi:113-122`):

> `delete_unverified: bool, default False` — **Files leftover from a failed transaction may appear to
> be part of an in-progress operation** (e.g. appending new data) **and these files will not be
> deleted unless they are at least 7 days old.** If `delete_unverified` is `True` then these files
> will be deleted regardless of their age.

`infrastructure/repositories.py:523` calls `table.optimize(cleanup_older_than=self._compact_retention)`
— **`delete_unverified` is never passed, so it defaults to `False`.** `cleanup_older_than` (the only
knob this codebase currently tunes) governs *committed, superseded* version/fragment pruning — a
structurally different code path from "unverified leftover from a failed transaction." The two knobs
are independent; tightening one does nothing for the other, which is exactly why the 2026-08-14
retention-hours fix visibly reclaimed `_versions/`/most of `data/` but left the 44 `.tmp*` files
(some now 30+ days old, well past the docstring's own 7-day floor) completely untouched.

**Residual open question, explicitly not resolved by docstring inspection alone:** whether the 7-day
floor described is a true floor under the *default* (`False`) path, or whether (as empirically observed
here — files are untouched at 30+ days under the current `False` default) unverified files are in
practice never sweept without explicitly opting in. Either reading converges on the same fix (§7): pass
`delete_unverified=True` from *somewhere* in this codebase's compaction path. `OptimizeStats.prune` is
a `RemovalStats { bytes_removed: int, old_versions_removed: int }` (`_lancedb.pyi:283-292`) — a
`delete_unverified=True` run's `bytes_removed` figure is the direct, already-instrumented (see
`compact()`'s existing `logger.info(... prune=%s ...)` call) way to *measure* whether this theory is
correct, before committing to wiring it into the automatic cycle.

---

## 5. Root cause B (secondary, growing): empty `_indices/<uuid>/` directory litter

`optimize()`'s own docstring names three operations: *Compaction* (merge small files), *Prune* (remove
old versions), *Index* (optimize/extend existing indices with new data). The `Index` step almost
certainly writes each incremental update as a **new index-generation directory** (matches the observed
UUID-per-dir layout under `_indices/`); a later prune cycle, once that generation is superseded by a
newer one, deletes the *files inside* the old UUID dir (consistent with `_indices/` bytes shrinking from
136-145 MB→23 MB after the retention-hours fix) **but does not remove the now-empty directory itself**.
`cleanup_older_than` operates on files/fragments, not directory entries — this is a directory-vs-file
scoping gap, not a bug in the byte-level retention logic, and it is orthogonal to Root Cause A (it
happens under fully healthy operation, no crash required — confirmed by non-empty AND empty dirs both
dated through 2026-08-22/23 today).

This does not move the disk-amplification headline number materially at current scale (23 MB / 1,647
dirs), but item/inode count growing ~15-100/day unbounded has real, if slower-burning, cost: `readdir()`
cost on every table open, container filesystem-layer overhead (bind-mount, likely APFS-on-macOS-via-VM
per this repo's known Docker Desktop VM boundary), and backup/rsync-style operations that scale with
file/dir *count*, not just bytes. Treated as **lower priority, opportunistic** (§7 Phase 3) — not the
critical path.

---

## 6. Version-pin risk this brief surfaces but does not fix (flag only)

`requirements.txt` floors `lancedb>=0.6.0` with no ceiling. Prior in-repo evidence (`repositories.py`
module comments, `strings`-scanned against the deployed image) shows the production container has
drifted 0.33.0→0.36.0→0.37.1 across rebuilds with zero code change forcing it, while this local sandbox
resolves 0.25.3. `delete_unverified`'s exact semantics (the "7 days" floor, and whether unverified-file
detection depends on transaction-log entries that may themselves already be pruned by `_transactions/`
retention — 92 files present vs 44 orphaned `.tmp*`, so some orphans' originating transaction record may
already be gone) could differ across that version range in ways this brief cannot verify without
either network access to LanceDB's changelog/source (not available in this sandbox) or an isolated
throwaway repro against the *exact deployed* image (same precedent as
`docs/architecture-briefs/2026-08-12-fix-rag-embedder-idle-unload-second-growth-source.md §3` — a
snapshot-copy repro, never the live bind-mount). **Recommended as the first concrete step of the
follow-up implementation task**, not asserted as already-validated here.

---

## 7. Recommended design — staged, risk-aware (for the follow-up, non-`plan_only` implementation row)

**Do not wire `delete_unverified=True` directly into the automatic 100-insert `compact()` cycle as a
first move.** The residual, unverifiable-from-here risk: `delete_unverified=True` is documented to
delete "files that **may appear to be part of an in-progress operation**... regardless of age" — the
existing `_compact_lock` (`asyncio.Lock`) only serializes concurrent `compact()`/`optimize()` calls
against each other; it does **not** serialize against `insert()`'s own `table.add()` step, which can be
actively writing a legitimate in-flight staging file at the exact instant an unrelated `compact()` call
(triggered by a different concurrent `insert()`) runs `optimize(delete_unverified=True)`. Whether
LanceDB's own transaction-log bookkeeping makes this provably safe is exactly the open question in §6.

**Phase 1 — isolated repro + one-off manual reclaim, not wired to any cron:**
1. Snapshot-copy repro against the **exact deployed image** (mirrors the 2026-08-12 brief's precedent):
   drive concurrent `insert()` + a `delete_unverified=True` `optimize()` call against a copy of this
   corpus, confirm no in-flight write is ever corrupted/lost. This resolves §6's open question with
   evidence instead of docstring inference.
2. Only after (1) passes: add a **new, separate, manually-triggered** admin endpoint —
   `POST /admin/compact-reclaim-unverified` — mirroring the existing `/admin/rebuild-fts` /
   `/admin/rebuild-vector-index` pattern (`interface/handlers.py:174-226`) exactly (same "deliberately
   NOT wired onto any cron" precedent as the vector-index endpoint). It calls
   `table.optimize(cleanup_older_than=self._compact_retention, delete_unverified=True)` once, serialized
   behind the existing `_compact_lock`, and logs the returned `OptimizeStats.prune.bytes_removed` /
   `.old_versions_removed`.
3. Trigger it once, manually, during a low-traffic window, against the live container. Expected result
   if Root Cause A (§4) is correctly diagnosed: `bytes_removed` on the order of the measured ~285 MB
   backlog (allow for drift — some `.tmp*` orphans may already be gone once the deployed lancedb version's
   actual behavior is known from Phase 1's repro). **Verify via the SAME read-only `du`/`find` measurement
   commands used in §2, before and after** — do not trust the log line alone (same
   `feedback_ac3_durability_certified_on_window_that_ended_before_metric_settled` lesson this row's own
   dispatch flagged: an agent's own single self-reported number is provisional until independently
   re-checked).

**Phase 2 — decide automatic wiring, evidence-gated:**
Only if Phase 1's manual sweep shows zero insert failures/exceptions in the surrounding window (a
concrete, checkable signal — `docker logs` grep for any new `ERROR`/`optimize` exception class in the
minutes bracketing the sweep) AND the repro in Phase 1 step 1 independently confirmed no corruption
risk: add `lancedb_compact_delete_unverified: bool` to `Config` (env var
`LANCEDB_COMPACT_DELETE_UNVERIFIED`, default `False` — same "constructor param, `None`/default-safe,
zero behavior change for any caller that doesn't opt in" shape `compact_retention` already established,
`infrastructure/config.py:75-77` + `repositories.py:258` / `:273`), and thread it into the routine
`compact()` call. Default stays `False` in `Config.from_env()` until Phase 1 evidence justifies flipping
the deployed env var — this is a two-step "land the capability, then separately decide to flip the
default" pattern, not a single commit that changes both.

**Phase 3 — opportunistic, lower priority:** an empty-directory sweep for `_indices/<uuid>/` shells
(§5) — `os.rmdir()` on directories confirmed empty (`os.listdir() == []`) immediately before removal
(TOCTOU-safe only in the sense that an empty dir becoming non-empty in that instant is not a plausible
race for this write pattern — new content always lands via a fresh `create_index()` call producing its
own new UUID, never backfilling an old one). Zero risk to corpus bytes (these dirs contain nothing).
Can ship independently of Phases 1-2, on its own schedule, since it does not touch `delete_unverified`
at all.

---

## 8. Explicit durability/soak criterion for the follow-up implementation row (per this task's mandate)

Any AC certifying Phase 1's manual sweep — or a later Phase 2 automatic-wiring durability check — as
DONE must state its observation window explicitly and end it **after** the metric can plausibly settle,
per `feedback_ac3_durability_certified_on_window_that_ended_before_metric_settled` (a 26-minute window
on this exact service was previously certified "durable" and was wrong; the true settle point needed
>2h). For THIS fix the relevant metric is disk bytes reclaimed, which settles in a single `optimize()`
call (seconds-to-low-minutes, not a gradual multi-hour climb like the memory metric that prior lesson
was about) — so the applicable window is **not** "wait N hours," it is: **re-measure
`du -sh data/live/lancedb` and the `.tmp*` file count/bytes at minimum twice, ≥15 minutes apart, after
the Phase 1 sweep completes**, to confirm the reclaimed bytes stay reclaimed (no immediate re-growth
from a broken cleanup loop) rather than certifying on the single post-sweep reading. If Phase 2 (automatic
wiring) ships, its own durability check should span **≥24h wall-clock with zero new `oom_memcg` events**
(dmesg-in-VM, never `docker inspect .State.OOMKilled` — the same source-blindness this codebase's own
memory-oscillation saga already documented) to confirm the automatic `delete_unverified=True` path is not
itself a new instability source under real concurrent write load.

---

## 9. Non-goals — explicitly not recommended by this brief

- Retuning `_COMPACT_EVERY` (§3) — no current evidence it is miscalibrated.
- Flipping `delete_unverified=True` into the automatic cycle in the same change that adds the capability
  (§7 Phase 1 vs Phase 2 are deliberately separate commits/decisions).
- Any `docker exec` into the live container, or hand-deletion of `data/live/lancedb/` contents — this
  row's own constraint, respected throughout this investigation.
- Pinning/upgrading the `lancedb` version (§6) — flagged as a risk surface, not in scope to fix here.

---

## 10. References

- Row evidence (07-29, 07-29T11:40/11:41/11:48): `docs/data/orch/orch-state.json` →
  `task_board.in_progress[]` FIX-RAG-COMPACTION-DISK-AMPLIFICATION (all fields, including the
  `po_UNCOUPLE_disk_from_memory_20260729T1148` retraction — the memory-ceiling causal link was already
  retracted before this brief; this brief does not reintroduce it).
- Memory-oscillation root-cause history (context, not this row's mechanism):
  `project_ragservice_memory_oscillation_contradicts_staleack_20260813` (agent memory).
- Durability-window lesson applied in §8:
  `feedback_ac3_durability_certified_on_window_that_ended_before_metric_settled` (agent memory).
- Precedent brief format/rigor: `docs/architecture-briefs/2026-08-12-fix-rag-embedder-idle-unload-second-growth-source.md`.
- `_COMPACT_RETENTION` / `lancedb_compact_retention_hours` prior fix this brief builds on:
  `apps/rag-service/infrastructure/repositories.py:63-96`, `apps/rag-service/infrastructure/config.py:70-77`.
- Admin-endpoint pattern to mirror for Phase 1's new endpoint: `apps/rag-service/interface/handlers.py:174-226`.
- `lancedb` package inspection (installed, this sandbox): `lancedb==0.25.3`,
  `lancedb/table.py:4306-4358` (`optimize()` docstring), `lancedb/_lancedb.pyi:113-122,279-292`
  (`delete_unverified` param shape, `OptimizeStats`/`RemovalStats`/`CompactionStats` dataclasses).
- Existing test coverage to extend in the follow-up implementation row:
  `apps/rag-service/__tests__/unit/test_lancedb_compaction.py` (currently covers threshold-firing,
  counter-reset, failure-non-fatal, concurrent-single-optimize — has no coverage yet for
  `delete_unverified` or the new admin endpoint).
