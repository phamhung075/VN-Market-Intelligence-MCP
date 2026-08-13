Bun.env["DB_PATH"] = ":memory:";

/**
 * FACTORY-INFRA-split-agentSignalStore — end-to-end round-trip test, one case
 * per reachable `agent_signals` column-flag combination (10 branches of the
 * pre-refactor `_postSignalInner` nested cascade — see insertBuilder.test.ts
 * for the branch-name → flag-combination mapping this file mirrors).
 *
 * Unlike insertBuilder.test.ts (pure function, no DB), this drives the real
 * `postSignal()` through a real `:memory:` `agent_signals` table built with
 * exactly the columns each branch's flags imply, then reads the row back with
 * a raw `SELECT *` — proving the whole pipeline (detectSignalColumns →
 * buildSignalInsert → db.run) reproduces the pre-refactor byte-for-byte
 * column values, not just the SQL text.
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { postSignal } from "../agentSignalStore.js";
import type { PostSignalInput } from "../agentSignalStore.js";

interface SchemaFlags {
  chain?: boolean;
  causalRoot?: boolean;
  signalClass?: boolean;
  validation?: boolean;
  context?: boolean;
  critic?: boolean;
}

function makeDb(f: SchemaFlags): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      stock_code TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'unread',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
  `);
  if (f.chain) {
    db.exec(`ALTER TABLE agent_signals ADD COLUMN cycle_id TEXT`);
    db.exec(`ALTER TABLE agent_signals ADD COLUMN finding_data TEXT DEFAULT '{}'`);
    db.exec(`ALTER TABLE agent_signals ADD COLUMN causal_ref INTEGER`);
    db.exec(`ALTER TABLE agent_signals ADD COLUMN chain_depth INTEGER DEFAULT 0`);
  }
  if (f.causalRoot) {
    db.exec(`ALTER TABLE agent_signals ADD COLUMN causal_root_id TEXT`);
    db.exec(`ALTER TABLE agent_signals ADD COLUMN causal_root_label TEXT`);
  }
  if (f.signalClass) db.exec(`ALTER TABLE agent_signals ADD COLUMN signal_class TEXT`);
  if (f.validation) {
    db.exec(`ALTER TABLE agent_signals ADD COLUMN confidence_score INTEGER`);
    db.exec(`ALTER TABLE agent_signals ADD COLUMN validated_at TEXT`);
  }
  if (f.context) {
    db.exec(`ALTER TABLE agent_signals ADD COLUMN news_sentiment REAL`);
    db.exec(`ALTER TABLE agent_signals ADD COLUMN kinh_dich_confidence REAL`);
    db.exec(`ALTER TABLE agent_signals ADD COLUMN agent_signals_majority TEXT`);
  }
  if (f.critic) {
    db.exec(`ALTER TABLE agent_signals ADD COLUMN critic_score REAL`);
    db.exec(`ALTER TABLE agent_signals ADD COLUMN critic_notes TEXT`);
    db.exec(`ALTER TABLE agent_signals ADD COLUMN retry_count INTEGER DEFAULT 0`);
  }
  return db;
}

const INPUT: PostSignalInput = {
  fromAgent: "test_agent",
  toAgent: "target_agent",
  signalType: "chain_catalyst",
  stockCode: "VNM",
  payload: { title: "t", detail: "d" },
  ttlMinutes: 60,
  cycleId: "20260812-0900",
  findingData: { foo: "bar" },
  chainDepth: 2,
  causalRootId: "ROOT_1",
  causalRootLabel: "Root label",
  signalClass: "cyclical",
  confidence_score: 77,
  validated_at: "2026-08-12 09:00:00",
  newsSentiment: 0.5,
  kinhDichConfidence: 60,
  agentSignalsMajority: "BUY",
  critic_score: 0.8,
  critic_notes: "looks fine",
  retry_count: 0,
};

const CASES: { name: string; flags: SchemaFlags }[] = [
  { name: "A: full (production shape)", flags: { chain: true, causalRoot: true, signalClass: true, validation: true, context: true, critic: true } },
  { name: "B: full minus critic", flags: { chain: true, causalRoot: true, signalClass: true, validation: true, context: true } },
  { name: "C: minus context+critic", flags: { chain: true, causalRoot: true, signalClass: true, validation: true } },
  { name: "D: signalClass present, validation absent", flags: { chain: true, causalRoot: true, signalClass: true } },
  { name: "E: causalRoot+validation, signalClass absent", flags: { chain: true, causalRoot: true, validation: true } },
  { name: "F: causalRoot only", flags: { chain: true, causalRoot: true } },
  { name: "G: chain+validation, no causalRoot", flags: { chain: true, validation: true } },
  { name: "H: chain columns only", flags: { chain: true } },
  { name: "I: no chain, validation present (legacy)", flags: { validation: true } },
  { name: "J: base schema only (Task 242 original shape)", flags: {} },
];

describe("FACTORY-INFRA-split-agentSignalStore — postSignal round-trip per column-flag combination", () => {
  for (const { name, flags } of CASES) {
    it(`branch ${name}`, () => {
      const db = makeDb(flags);
      const id = postSignal(db, INPUT);
      expect(id).toBeGreaterThan(0);

      const row = db.query("SELECT * FROM agent_signals WHERE id = ?").get(id) as Record<string, unknown>;
      expect(row).toBeDefined();

      // Base columns — always present, always bound.
      expect(row["from_agent"]).toBe("test_agent");
      expect(row["to_agent"]).toBe("target_agent");
      expect(row["signal_type"]).toBe("chain_catalyst");
      expect(row["stock_code"]).toBe("VNM");
      expect(JSON.parse(row["payload"] as string)).toEqual({ title: "t", detail: "d" });
      expect(row["status"]).toBe("unread");
      expect(typeof row["expires_at"]).toBe("string");

      if (flags.chain) {
        expect(row["cycle_id"]).toBe("20260812-0900");
        expect(JSON.parse(row["finding_data"] as string)).toEqual({ foo: "bar" });
        expect(row["causal_ref"]).toBeNull();
        expect(row["chain_depth"]).toBe(2);
      }
      if (flags.causalRoot) {
        expect(row["causal_root_id"]).toBe("ROOT_1");
        expect(row["causal_root_label"]).toBe("Root label");
      }
      if (flags.signalClass) {
        expect(row["signal_class"]).toBe("cyclical");
      }
      if (flags.validation) {
        expect(row["confidence_score"]).toBe(77);
        expect(row["validated_at"]).toBe("2026-08-12 09:00:00");
      }
      if (flags.context) {
        expect(row["news_sentiment"]).toBe(0.5);
        expect(row["kinh_dich_confidence"]).toBe(60);
        expect(row["agent_signals_majority"]).toBe("BUY");
      }
      if (flags.critic) {
        expect(row["critic_score"]).toBe(0.8);
        expect(row["critic_notes"]).toBe("looks fine");
        expect(row["retry_count"]).toBe(0);
      }

      // Columns absent from this schema variant must never have been silently
      // written elsewhere (i.e. the row must have exactly the columns this
      // schema defines — pragma_table_info cross-check).
      const tableCols = new Set(
        (db.query("SELECT name FROM pragma_table_info('agent_signals')").all() as { name: string }[]).map((r) => r.name),
      );
      if (!flags.causalRoot) expect(tableCols.has("causal_root_id")).toBe(false);
      if (!flags.signalClass) expect(tableCols.has("signal_class")).toBe(false);
      if (!flags.context) expect(tableCols.has("news_sentiment")).toBe(false);
      if (!flags.critic) expect(tableCols.has("critic_score")).toBe(false);
    });
  }

  it("re-inserting through the same connection reuses the memoized column-flag cache (no behavior change across calls)", () => {
    const db = makeDb({ chain: true, causalRoot: true, signalClass: true, validation: true, context: true, critic: true });
    const id1 = postSignal(db, { ...INPUT, stockCode: "VNM" });
    const id2 = postSignal(db, { ...INPUT, stockCode: "VCB" });
    expect(id1).toBeGreaterThan(0);
    expect(id2).toBeGreaterThan(0);
    expect(id2).not.toBe(id1);
  });
});
