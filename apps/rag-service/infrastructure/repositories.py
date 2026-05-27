"""
Infrastructure — LanceDBVectorStore and SQLiteAnalysisRepository.

Implements VectorStorePort and AnalysisRepositoryPort.
Infrastructure layer: may import lancedb, sqlite3, etc.
"""

import json
import logging
import os
import sqlite3
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from domain.models import AnalysisEntry, EmbeddingVector, SearchResult
from domain.repositories import VectorStorePort, AnalysisRepositoryPort

logger = logging.getLogger(__name__)

TABLE_NAME = "rag_entries"
_VALID_LEVELS = {"global", "country", "domain", "action"}
_VALID_ACTION_CODE = re.compile(r"^[A-Z0-9]{1,10}$")

# ── Compaction constants ──────────────────────────────────────────────────────
# Run optimize() every N inserts to prevent write-amplification bloat.
# 100 inserts ≈ one daily intelligence cycle — compaction is cheap and online-safe.
_COMPACT_EVERY = 100
# Keep versions from the last 2 days; the latest version is always preserved.
_COMPACT_RETENTION = timedelta(days=2)


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
    """

    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        self._db = None
        self._table = None
        self._insert_count: int = 0  # inserts since last compaction

    async def _get_table(self):
        """Lazy-initialize LanceDB connection and table."""
        import lancedb

        if self._table is not None:
            return self._table

        os.makedirs(self._db_path, exist_ok=True)
        self._db = await lancedb.connect_async(self._db_path)

        names = await self._db.table_names()
        if TABLE_NAME in names:
            self._table = await self._db.open_table(TABLE_NAME)
            return self._table

        # Create table with a seed row to establish schema
        seed = {
            "id": "__init__",
            "level": "",
            "title": "",
            "summary": "",
            "vector": [0.0] * 384,
            "tags": "[]",
            "action_code": "",
            "created_at": datetime.now(tz=timezone.utc).isoformat(),
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

    async def search(
        self,
        query_vector: EmbeddingVector,
        limit: int,
        level_filter: Optional[str] = None,
        action_code_filter: Optional[str] = None,
    ) -> list[SearchResult]:
        table = await self._get_table()

        # Build filter clauses (validated + sanitized)
        clauses: list[str] = []
        if level_filter:
            if not _validate_level(level_filter):
                raise ValueError(f"Invalid level filter: {level_filter!r}")
            clauses.append(f"level = '{_sanitize(level_filter)}'")
        if action_code_filter:
            if not _validate_action_code(action_code_filter):
                raise ValueError(f"Invalid action_code filter: {action_code_filter!r}")
            clauses.append(f"action_code = '{_sanitize(action_code_filter)}'")

        # Over-fetch for dedup (4x requested, capped at 50)
        wide_limit = min(50, max(limit * 4, limit))
        query = table.vector_search(query_vector.values).limit(wide_limit)
        if clauses:
            query = query.where(" AND ".join(clauses))

        raw_rows = await query.to_list()

        # Dedup by (title, summary) — same article re-indexed multiple times
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

            results.append(
                SearchResult(
                    id=row.get("id", ""),
                    level=row.get("level", ""),
                    title=row.get("title", ""),
                    summary=row.get("summary", ""),
                    tags=tags,
                    action_code=row.get("action_code", ""),
                    created_at=row.get("created_at", ""),
                    distance=float(row.get("_distance", 0.0)),
                )
            )
            if len(results) >= limit:
                break

        return results

    async def count(self) -> int:
        try:
            table = await self._get_table()
            return await table.count_rows()
        except Exception:
            return 0


# ── SQLite Analysis Repository ────────────────────────────────────────────


class SQLiteAnalysisRepository(AnalysisRepositoryPort):
    """
    SQLite-backed metadata store for AnalysisEntry records.

    Used for administrative queries (list all, find by id).
    The canonical store is LanceDB — SQLite is a lightweight index.
    """

    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        self._initialized = False

    def _get_conn(self) -> sqlite3.Connection:
        os.makedirs(os.path.dirname(self._db_path) or ".", exist_ok=True)
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_table(self) -> None:
        if self._initialized:
            return
        with self._get_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS rag_entries (
                    id TEXT PRIMARY KEY,
                    level TEXT NOT NULL,
                    title TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    tags TEXT NOT NULL DEFAULT '[]',
                    action_code TEXT,
                    created_at TEXT NOT NULL
                )
            """)
            conn.commit()
        self._initialized = True

    async def save(self, entry: AnalysisEntry) -> None:
        self._ensure_table()
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO rag_entries (id, level, title, summary, tags, action_code, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    level=excluded.level,
                    title=excluded.title,
                    summary=excluded.summary,
                    tags=excluded.tags,
                    action_code=excluded.action_code,
                    created_at=excluded.created_at
                """,
                (
                    entry.id,
                    entry.level,
                    entry.title,
                    entry.summary,
                    json.dumps(entry.tags),
                    entry.action_code,
                    entry.created_at.isoformat(),
                ),
            )
            conn.commit()

    async def find_by_id(self, entry_id: str) -> Optional[AnalysisEntry]:
        self._ensure_table()
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM rag_entries WHERE id = ?", (entry_id,)
            ).fetchone()
        if row is None:
            return None
        return _row_to_entry(dict(row))

    async def find_all(self) -> list[AnalysisEntry]:
        self._ensure_table()
        with self._get_conn() as conn:
            rows = conn.execute("SELECT * FROM rag_entries").fetchall()
        return [_row_to_entry(dict(row)) for row in rows]


def _row_to_entry(row: dict) -> AnalysisEntry:
    tags: list[str] = []
    raw_tags = row.get("tags", "[]")
    if isinstance(raw_tags, str):
        try:
            tags = json.loads(raw_tags)
        except (json.JSONDecodeError, ValueError):
            tags = []
    else:
        tags = raw_tags

    created_at_str = row.get("created_at", "")
    try:
        created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
    except (ValueError, AttributeError):
        created_at = datetime.now(tz=timezone.utc)

    return AnalysisEntry(
        id=row["id"],
        level=row["level"],
        title=row["title"],
        summary=row["summary"],
        tags=tags,
        created_at=created_at,
        action_code=row.get("action_code"),
    )
