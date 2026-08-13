/**
 * FACTORY-INFRA-split-agentSignalStore — memoized column-existence probes.
 *
 * `_postSignalInner` used to re-run 6 (+1 dedup-guard) `SELECT ... LIMIT 0`
 * probes on EVERY call to discover which optional `agent_signals` columns
 * exist on this connection's schema (legacy DBs vs fresh/migrated DBs).
 * Since schema migrations (schema-news.ts) run exactly once at process
 * startup — before any signal is ever posted — the flags are invariant for
 * the lifetime of a given `Database` connection. Cache them in a WeakMap
 * keyed by the connection instance: correct per-connection isolation (each
 * test's fresh `:memory:` DB gets its own entry), zero cross-test bleed, and
 * the entry is garbage-collected automatically when the connection is.
 */

import type { Database } from "bun:sqlite";

/** Which optional `agent_signals` column groups exist on this connection. */
export interface SignalColumnFlags {
  /** cycle_id, finding_data, causal_ref, chain_depth (enrichment chain, Task 242 ext). */
  hasChainColumns: boolean;
  /** causal_root_id, causal_root_label (Task 1105). */
  hasCausalRootColumns: boolean;
  /** signal_class (Task 1106). */
  hasSignalClassColumn: boolean;
  /** confidence_score, validated_at (Task 230). */
  hasValidationColumns: boolean;
  /** news_sentiment, kinh_dich_confidence, agent_signals_majority (Task 1328c). */
  hasContextColumns: boolean;
  /** critic_score, critic_notes, retry_count (TNB critic gate). */
  hasCriticColumns: boolean;
  /** created_at (base schema — always true on any real/test DB; dedup-guard probe folded in here too). */
  hasCreatedAtColumn: boolean;
}

const cache = new WeakMap<Database, SignalColumnFlags>();

function probe(db: Database, sql: string): boolean {
  try {
    db.prepare(sql).all();
    return true;
  } catch {
    return false;
  }
}

/** Detects (and memoizes per-connection) which optional column groups exist. */
export function detectSignalColumns(db: Database): SignalColumnFlags {
  const cached = cache.get(db);
  if (cached) return cached;

  const flags: SignalColumnFlags = {
    hasChainColumns: probe(db, "SELECT cycle_id FROM agent_signals LIMIT 0"),
    hasCausalRootColumns: probe(db, "SELECT causal_root_id FROM agent_signals LIMIT 0"),
    hasSignalClassColumn: probe(db, "SELECT signal_class FROM agent_signals LIMIT 0"),
    hasValidationColumns: probe(db, "SELECT confidence_score, validated_at FROM agent_signals LIMIT 0"),
    hasContextColumns: probe(
      db,
      "SELECT news_sentiment, kinh_dich_confidence, agent_signals_majority FROM agent_signals LIMIT 0",
    ),
    hasCriticColumns: probe(db, "SELECT critic_score, critic_notes, retry_count FROM agent_signals LIMIT 0"),
    hasCreatedAtColumn: probe(db, "SELECT created_at FROM agent_signals LIMIT 0"),
  };

  cache.set(db, flags);
  return flags;
}

/**
 * Test-only escape hatch: drop the memoized entry for `db`. Only needed when
 * a test mutates `agent_signals`' schema (ALTER TABLE) on a Database instance
 * that already has a cached entry — production code never does this (schema
 * migrations run once at startup, before this module is ever called).
 */
export function resetSignalColumnCache(db: Database): void {
  cache.delete(db);
}
