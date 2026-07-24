"""
Infrastructure — LanceDBVectorStore.

Implements VectorStorePort.
Infrastructure layer: may import lancedb, sqlite3, etc.
"""

import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from domain.models import AnalysisEntry, EmbeddingVector, SearchResult
from domain.repositories import VectorStorePort

logger = logging.getLogger(__name__)

TABLE_NAME = "rag_entries"
_VALID_LEVELS = {"global", "country", "domain", "action"}
_VALID_ACTION_CODE = re.compile(r"^[A-Z0-9]{1,10}$")
_VALID_TICKER = re.compile(r"^[A-Z0-9]{1,10}$")
_VALID_DEPTH_TIERS = {"shallow", "deep"}
_VALID_DOC_TYPES = {"news", "filing", "macro", "analysis"}

# FR-1: Phase 1 migration — 8 new metadata columns added via add_columns()
# SQL expressions evaluated against existing rows to supply default values.
# Idempotent: guarded by try/except in _get_table() (column-already-exists is a no-op).
_PHASE1_ADD_COLUMNS = {
    "ticker":        "CAST(NULL AS STRING)",
    "sector":        "CAST(NULL AS STRING)",
    "source_domain": "CAST(NULL AS STRING)",
    "depth_tier":    "'shallow'",
    "doc_type":      "'news'",
    "published_at":  "CAST(NULL AS STRING)",
    "confidence":    "CAST(0.0 AS DOUBLE)",
    "impact_score":  "CAST(0.0 AS DOUBLE)",
}

# ── Compaction constants ──────────────────────────────────────────────────────
# Run optimize() every N inserts to prevent write-amplification bloat.
# 100 inserts ≈ one daily intelligence cycle — compaction is cheap and online-safe.
_COMPACT_EVERY = 100
# Keep versions from the last 2 days; the latest version is always preserved.
_COMPACT_RETENTION = timedelta(days=2)

# ── RAG-FTS-BUILD-MEMORY-BOUND: bounded native FTS index build ───────────────
# ROOT CAUSE (qa-verified, commit 2af76decc): `_build_fts_index()` calls LanceDB's
# NATIVE inverted-index FTS builder (`table.create_index(field, config=FTS())`).
# That builder is implemented in the Rust crate `lance-index` (rust/lance-index/
# src/scalar/inverted/builder.rs). It fans the corpus scan out across
# `LANCE_FTS_NUM_SHARDS` parallel workers (default: max(1, num_cpus/2) — resolved
# from the HOST's visible CPU count, NOT the container's `cpus:` cgroup quota),
# and each worker independently buffers its share of tokens/postings in memory
# until it accumulates `LANCE_FTS_PARTITION_SIZE` MiB (default: 2048 MiB — see
# `resolve_worker_memory_limit_bytes()` / the `if self.memory_size >=
# self.worker_memory_limit_bytes { flush }` backpressure check in builder.rs),
# ONLY THEN flushing its buffer to disk and freeing it.
#
# Neither knob is exposed by lancedb's Python `FTS()` config dataclass (tokenizer
# options only — confirmed via inspect.signature) or by `AsyncTable.create_index()`
# — they are process-global Rust `LazyLock` statics read from the OS environment
# on FIRST use and then cached for the process lifetime. On a multi-core host,
# DEFAULT worst-case in-flight build memory is `(num_cpus/2) * 2048 MiB` — many
# GB, ~10x the rag-service 768m container ceiling (docker-compose.yml `rag-service
# .deploy.resources.limits.memory`) — regardless of corpus size. This is why the
# build pins 90-99.9% of the ceiling for 250s+ then OOM-restarts at ~56k rows
# (RestartCount 258->260): the default worker-memory ceiling was never sized for
# this container, not something that scales cleanly with row count.
#
# FIX: pin these two Rust-level env vars to small, container-safe values BEFORE
# any FTS index is ever built in this process (must be set at or before module
# import time — LazyLock caches on first read, so setting them later in the
# process lifetime would be a no-op). `setdefault()` lets ops override via
# docker-compose.yml without a code change if the default ever needs retuning.
#   - LANCE_FTS_NUM_SHARDS=1     — single worker; the container is capped at
#     `cpus: 1.0` anyway, so extra parallel workers buy no real speedup, only
#     proportionally more peak memory.
#   - LANCE_FTS_PARTITION_SIZE=32 (MiB) — hard per-worker flush threshold. This
#     bounds build memory to a small, CORPUS-SIZE-INDEPENDENT ceiling: growth in
#     `rag_entries` row count (the exact growth ALPHA-S2's nightly cron exists to
#     track) changes how many times the worker flushes, not how much memory any
#     single flush cycle holds — so the fix holds at 56k rows today and will
#     continue to hold at 80k/100k+ as ragIndex() keeps writing.
#
# Verified empirically (local, lancedb 0.25.3 == same lance-index FTS builder as
# the Docker-pinned lancedb 0.33.0 — the legacy python-tantivy path invoked via
# `writer_heap_size`/`use_tantivy=True` was investigated FIRST per this task's
# brief but is a dead end: it is hard-removed in the pinned 0.33.0, raising
# `ValueError("Tantivy-based FTS has been removed")` unconditionally):
# a 60k-row / high-cardinality-vocabulary stress corpus dropped from
# 3.28 GB max RSS / 1.55 GB peak footprint (unbounded default) to 1.37 GB max RSS
# / 640 MB peak footprint at NUM_SHARDS=1 + PARTITION_SIZE=8 MiB — the ceiling
# drops further still on realistic (non-pathological-vocabulary) financial-news
# text, where the flush-bounded posting buffer (not an ever-growing term
# dictionary) dominates build memory. See
# docs/architecture/microservice/rag-service/infrastructure.md for the full
# investigation trail and the live-container number pending ops verification.
os.environ.setdefault("LANCE_FTS_NUM_SHARDS", "1")
os.environ.setdefault("LANCE_FTS_PARTITION_SIZE", "32")


def _validate_level(value: str) -> bool:
    return value in _VALID_LEVELS


def _validate_action_code(value: str) -> bool:
    return bool(_VALID_ACTION_CODE.match(value))


def _sanitize(value: str) -> str:
    """SQL-standard single-quote doubling for defence-in-depth."""
    return value.replace("'", "''")


# ── LanceDB Vector Store ──────────────────────────────────────────────────


class LanceDBVectorStore(VectorStorePort):
    """
    LanceDB-backed implementation of VectorStorePort.

    Stores 384-dim vectors in a local LanceDB table named 'rag_entries'.
    Deduplicates results by (title, summary) before returning.
    Supports hybrid BM25+vector search via LanceDB FTS index + RRFReranker (DFR-P3).
    """

    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        self._db = None
        self._table = None
        self._insert_count: int = 0  # inserts since last compaction
        # DFR-P3: per-process flag for lazy FTS index build.
        # Set to True after first successful _build_fts_index() call.
        # Never reset to False in normal operation (index persists in LanceDB).
        self._fts_index_built: bool = False

    async def _get_table(self):
        """Lazy-initialize LanceDB connection and table.

        FR-1: On an existing table, runs idempotent add_columns() migration to add
        the 8 Phase 1 metadata columns.  If add_columns() is not available (pre-0.8
        lancedb), logs a loud warning and continues with the existing schema.
        On a fresh table, the seed schema already includes all 16 columns so no
        migration step is required.
        """
        import lancedb

        if self._table is not None:
            return self._table

        os.makedirs(self._db_path, exist_ok=True)
        self._db = await lancedb.connect_async(self._db_path)

        names = await self._db.table_names()
        if TABLE_NAME in names:
            self._table = await self._db.open_table(TABLE_NAME)
            # FR-1: Idempotent migration — add 8 new metadata columns if not present.
            # Each column-already-exists error is silently swallowed (idempotent).
            # If add_columns() is absent entirely (old lancedb), degrade gracefully.
            if not hasattr(self._table, "add_columns"):
                logger.warning(
                    "[LanceDBVectorStore] add_columns() not supported in this lancedb "
                    "version — Phase 1 migration SKIPPED; upgrade lancedb to >= 0.8"
                )
            else:
                for col_name, sql_expr in _PHASE1_ADD_COLUMNS.items():
                    try:
                        await self._table.add_columns({col_name: sql_expr})
                    except Exception as exc:
                        # Column already exists → expected on idempotent re-run.
                        # Any other error is also swallowed: migration is additive only;
                        # service must not crash on startup if migration partially applied.
                        logger.debug(
                            "[LanceDBVectorStore] add_columns(%s) skipped: %s",
                            col_name,
                            exc,
                        )
            return self._table

        # FR-1: Create fresh table with full 16-column seed schema so new deployments
        # never need to run add_columns() at all.
        seed = {
            "id": "__init__",
            "level": "",
            "title": "",
            "summary": "",
            "vector": [0.0] * 384,
            "tags": "[]",
            "action_code": "",
            "created_at": datetime.now(tz=timezone.utc).isoformat(),
            # Phase 1 metadata columns
            "ticker": "",
            "sector": "",
            "source_domain": "",
            "depth_tier": "shallow",
            "doc_type": "news",
            "published_at": "",
            "confidence": 0.0,
            "impact_score": 0.0,
        }
        self._table = await self._db.create_table(TABLE_NAME, [seed])
        await self._table.delete("id = '__init__'")
        return self._table

    async def insert(self, entry: AnalysisEntry, vector: EmbeddingVector) -> None:
        table = await self._get_table()
        row = {
            "id": entry.id,
            "level": entry.level,
            "title": entry.title,
            "summary": entry.summary,
            "vector": vector.values,
            "tags": json.dumps(entry.tags),
            "action_code": entry.action_code or "",
            "created_at": entry.created_at.isoformat(),
            # FR-2: Phase 1 metadata fields (all have safe defaults via AnalysisEntry)
            "ticker": entry.ticker,
            "sector": entry.sector,
            "source_domain": entry.source_domain,
            "depth_tier": entry.depth_tier,
            "doc_type": entry.doc_type,
            "published_at": entry.published_at,
            "confidence": entry.confidence,
            "impact_score": entry.impact_score,
        }
        await table.add([row])
        self._insert_count += 1
        if self._insert_count >= _COMPACT_EVERY:
            try:
                await self.compact()
            except Exception as exc:  # noqa: BLE001
                logger.warning("LanceDB compaction raised unexpectedly (non-fatal): %s", exc)
                self._insert_count = 0  # reset to avoid tight retry loop

    async def compact(self) -> None:
        """
        Run LanceDB optimize() to compact fragments and prune old version manifests.

        Called automatically every _COMPACT_EVERY inserts, and can be invoked
        directly (e.g. from a maintenance endpoint or daily cron).

        Compaction is online-safe: reads and writes continue during compaction.
        The latest version is always preserved — no data loss is possible.
        Temporal-decay logic is unaffected (stored created_at timestamps are not changed).
        """
        try:
            table = await self._get_table()
            stats = await table.optimize(cleanup_older_than=_COMPACT_RETENTION)
            self._insert_count = 0
            logger.info(
                "LanceDB compaction complete: compaction=%s prune=%s",
                stats.compaction,
                stats.prune,
            )
        except Exception as exc:  # noqa: BLE001
            # Non-fatal: log and continue — compaction failure must not block indexing.
            logger.warning("LanceDB compaction failed (non-fatal): %s", exc)

    # ── Private helpers (shared by search() and hybrid_search()) ─────────────

    def _build_filter_clauses(
        self,
        level_filter: Optional[str] = None,
        action_code_filter: Optional[str] = None,
        ticker_filter: Optional[str] = None,
        sector_filter: Optional[str] = None,
        source_domain_filter: Optional[str] = None,
        depth_tier_filter: Optional[str] = None,
        doc_type_filter: Optional[str] = None,
    ) -> list[str]:
        """Build validated + sanitized SQL WHERE clauses from filter kwargs.

        Raises ValueError for invalid filter values (propagates to HTTP 400).
        Returns list of SQL clause strings (joined with AND by caller).
        """
        clauses: list[str] = []
        if level_filter:
            if not _validate_level(level_filter):
                raise ValueError(f"Invalid level filter: {level_filter!r}")
            clauses.append(f"level = '{_sanitize(level_filter)}'")
        if action_code_filter:
            if not _validate_action_code(action_code_filter):
                raise ValueError(f"Invalid action_code filter: {action_code_filter!r}")
            clauses.append(f"action_code = '{_sanitize(action_code_filter)}'")
        # FR-3: Phase 1 pre-filters
        if ticker_filter is not None:
            if not _VALID_TICKER.match(ticker_filter):
                raise ValueError(
                    f"Invalid ticker filter: {ticker_filter!r} — must match [A-Z0-9]{{1,10}}"
                )
            clauses.append(f"ticker = '{_sanitize(ticker_filter)}'")
        if depth_tier_filter is not None:
            if depth_tier_filter not in _VALID_DEPTH_TIERS:
                raise ValueError(
                    f"Invalid depth_tier filter: {depth_tier_filter!r} — must be one of {sorted(_VALID_DEPTH_TIERS)}"
                )
            clauses.append(f"depth_tier = '{_sanitize(depth_tier_filter)}'")
        if doc_type_filter is not None:
            if doc_type_filter not in _VALID_DOC_TYPES:
                raise ValueError(
                    f"Invalid doc_type filter: {doc_type_filter!r} — must be one of {sorted(_VALID_DOC_TYPES)}"
                )
            clauses.append(f"doc_type = '{_sanitize(doc_type_filter)}'")
        if sector_filter is not None:
            # Free-text: sanitize only, no enum check
            clauses.append(f"sector = '{_sanitize(sector_filter)}'")
        if source_domain_filter is not None:
            # Free-text: sanitize only, no enum check
            clauses.append(f"source_domain = '{_sanitize(source_domain_filter)}'")
        return clauses

    def _dedup_and_trim(self, raw_rows: list[dict], limit: int) -> list[SearchResult]:
        """Dedup rows by (title, summary) and trim to limit.

        Accepts raw LanceDB row dicts (from to_list()). Returns list[SearchResult].
        """
        seen: set[str] = set()
        results: list[SearchResult] = []
        for row in raw_rows:
            key = f"{row.get('title', '')}\x00{row.get('summary', '')}"
            if key in seen:
                continue
            seen.add(key)

            tags = row.get("tags", "[]")
            if isinstance(tags, str):
                try:
                    tags = json.loads(tags)
                except (json.JSONDecodeError, ValueError):
                    tags = []

            # Resolve distance signal using ABSENT-KEY-aware logic.
            # MUST NOT use truthiness `or` — Python `0.0 or X` evaluates to X,
            # which silently discards a LEGITIMATE _distance==0.0 (true identical-
            # vector match) and pushes it down the fallback chain.
            #
            # Fail-SAFE default: 1.0 (→ similarity 0.5 via 1/(1+d)) — aligns with
            # sibling at domain/module/retrieval/module.py:102 which uses
            # `float(result.get("distance", 1.0))`.  A missing signal MUST yield a
            # NEUTRAL/low score, never 1.0 (which would be a fabricated perfect match).
            #
            # _distance is set on vector/FTS results; _relevance_score on hybrid RRF results.
            if "_distance" in row and row["_distance"] is not None:
                distance = float(row["_distance"])
            elif "_relevance_score" in row and row["_relevance_score"] is not None:
                distance = float(row["_relevance_score"])
            else:
                distance = 1.0  # fail-safe: absent signal → low similarity (0.5), not perfect match

            # Resolve confidence / impact_score with an explicit None-guard — same
            # truthiness-mask family as the _distance fix above. `row.get(k) or 0.0`
            # would coalesce a LEGITIMATE 0.0 score down the SAME path as a missing
            # key; only the field's own None/absence should trigger the 0.0 default.
            _confidence_raw = row.get("confidence")
            _impact_score_raw = row.get("impact_score")
            confidence = float(_confidence_raw) if _confidence_raw is not None else 0.0
            impact_score = float(_impact_score_raw) if _impact_score_raw is not None else 0.0

            results.append(
                SearchResult(
                    id=row.get("id", ""),
                    level=row.get("level", ""),
                    title=row.get("title", ""),
                    summary=row.get("summary", ""),
                    tags=tags,
                    action_code=row.get("action_code", ""),
                    created_at=row.get("created_at", ""),
                    distance=distance,
                    # FR-3: propagate Phase 1 metadata fields from LanceDB row
                    ticker=row.get("ticker") or "",
                    sector=row.get("sector") or "",
                    source_domain=row.get("source_domain") or "",
                    depth_tier=row.get("depth_tier") or "shallow",
                    doc_type=row.get("doc_type") or "news",
                    published_at=row.get("published_at") or "",
                    confidence=confidence,
                    impact_score=impact_score,
                )
            )
            if len(results) >= limit:
                break

        return results

    # ── DFR-P3: FTS index management ──────────────────────────────────────

    async def _build_fts_index(self) -> None:
        """Build FTS indexes for 'title' and 'summary' columns separately.

        DFR-P3 AC-P3R-7: Two separate index calls — NOT a multi-field list.
        In native mode (confirmed spike DFR-Q3), each field needs its own index.

        API compatibility:
        - lancedb >= 0.28 (incl. 0.30.2 / 0.33.0): create_index(field, config=FTS(), replace=True)
        - lancedb 0.30.2 also has create_fts_index() convenience method with replace=True.
        We use create_index(config=FTS()) as the universally available form across
        0.25.3 (local test) and 0.33.0 (Docker production).

        replace=True on both calls allows idempotent daily scheduled rebuilds
        without raising if the index already exists.

        RAG-FTS-BUILD-MEMORY-BOUND: build memory is bounded corpus-size-
        independently via the LANCE_FTS_NUM_SHARDS / LANCE_FTS_PARTITION_SIZE
        env vars pinned at module import time (see top of this file) — the
        call pattern here is otherwise unchanged.
        """
        from lancedb.index import FTS
        table = await self._get_table()
        # AC-P3R-7: Two separate calls — title first, then summary.
        await table.create_index("title", config=FTS(), replace=True)
        await table.create_index("summary", config=FTS(), replace=True)
        logger.info("[LanceDBVectorStore] FTS indexes (title + summary) built successfully.")

    # ── Search methods ─────────────────────────────────────────────────────

    async def search(
        self,
        query_vector: EmbeddingVector,
        limit: int,
        level_filter: Optional[str] = None,
        action_code_filter: Optional[str] = None,
        ticker_filter: Optional[str] = None,
        sector_filter: Optional[str] = None,
        source_domain_filter: Optional[str] = None,
        depth_tier_filter: Optional[str] = None,
        doc_type_filter: Optional[str] = None,
    ) -> list[SearchResult]:
        table = await self._get_table()

        clauses = self._build_filter_clauses(
            level_filter=level_filter,
            action_code_filter=action_code_filter,
            ticker_filter=ticker_filter,
            sector_filter=sector_filter,
            source_domain_filter=source_domain_filter,
            depth_tier_filter=depth_tier_filter,
            doc_type_filter=doc_type_filter,
        )

        # Over-fetch for dedup (4x requested, capped at 50)
        wide_limit = min(50, max(limit * 4, limit))
        query = table.vector_search(query_vector.values).limit(wide_limit)
        if clauses:
            query = query.where(" AND ".join(clauses))

        raw_rows = await query.to_list()
        return self._dedup_and_trim(raw_rows, limit)

    async def hybrid_search(
        self,
        query_vector: EmbeddingVector,
        query_text: str,
        limit: int,
        level_filter: Optional[str] = None,
        action_code_filter: Optional[str] = None,
        ticker_filter: Optional[str] = None,
        sector_filter: Optional[str] = None,
        source_domain_filter: Optional[str] = None,
        depth_tier_filter: Optional[str] = None,
        doc_type_filter: Optional[str] = None,
    ) -> list[SearchResult]:
        """FTS + vector hybrid search using RRF reranking (DFR-P3).

        DFR-P3 AC-P3R-4: FTS index is built lazily on first call (not at startup).
        DFR-P3 AC-P3R-8: Uses .vector().text() pattern — NOT tbl.search('text', query_type='hybrid').

        Confirmed in spike DFR-Q3: passing a string directly to tbl.search() with
        query_type='hybrid' raises an error. Explicit .vector().text() chaining is required.
        """
        table = await self._get_table()

        # DFR-P3: Lazy FTS index build on first hybrid request.
        # Per-process flag (_fts_index_built) prevents repeated builds within a container lifetime.
        # First hybrid request takes ~30s at 14k rows; subsequent calls are instant.
        if not self._fts_index_built:
            await self._build_fts_index()
            self._fts_index_built = True

        from lancedb.rerankers import RRFReranker  # noqa: PLC0415 — imported lazily (optional dep)
        reranker = RRFReranker()

        clauses = self._build_filter_clauses(
            level_filter=level_filter,
            action_code_filter=action_code_filter,
            ticker_filter=ticker_filter,
            sector_filter=sector_filter,
            source_domain_filter=source_domain_filter,
            depth_tier_filter=depth_tier_filter,
            doc_type_filter=doc_type_filter,
        )

        # DFR-P3 AC-P3R-8: Use tbl.query().nearest_to(vec).nearest_to_text(text) pattern.
        # This is the version-stable hybrid API (works in lancedb 0.25.3 + 0.33.0+).
        # DO NOT use tbl.search('text_string', query_type='hybrid') — requires an
        # embedding function registration which we do not have (we pass raw vectors).
        q = (
            table.query()
            .nearest_to(query_vector.values)
            .column("vector")
            .nearest_to_text(query_text)
            .rerank(reranker)
            .limit(limit * 4)  # over-fetch for dedup
        )
        if clauses:
            q = q.where(" AND ".join(clauses))

        raw_rows = await q.to_list()
        return self._dedup_and_trim(raw_rows, limit)

    async def count(self) -> int:
        try:
            table = await self._get_table()
            return await table.count_rows()
        except Exception:
            return 0
