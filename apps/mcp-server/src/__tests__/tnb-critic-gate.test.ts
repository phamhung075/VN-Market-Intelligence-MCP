/**
 * TNB Critic Gate — Integration Tests
 *
 * Tests for postSignalWithCriticGate():
 *   - Pass path: score >= 0.6 → signal written, retry_count=0, critic_score set
 *   - Fail+retry path: score < 0.6 → critique returned, second call writes with retry_count=1
 *   - Timeout path: 20s timeout → signal written with critic_score=null
 *   - Fail-soft: gate errors never throw
 *
 * Also verifies:
 *   - Schema migration adds critic_score, critic_notes, retry_count columns
 *   - Columns are persisted correctly in the DB row
 */

import { describe, expect, it, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  postSignalWithCriticGate,
  type PostSignalWithGateOptions,
} from "../infrastructure/db/agentSignalStore.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";

// ── Helper: in-memory DB ──────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  initNewsTables(db);
  return db;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const GOOD_INPUT = {
  fromAgent: "news-scout",
  toAgent: "alert-commander",
  signalType: "urgent_news" as const,
  stockCode: "VCB",
  payload: {
    title: "VCB Q1 2026 NIM expansion on cost of capital decline",
    detail:
      "Vietcombank Q1 2026 net interest margin expanded 30bps as NHNN cut policy rate and money supply M2 increased 14% YoY.",
    impact_score: 4,
  },
  findingData: {},
  ttlMinutes: 120,
};

const BAD_INPUT = {
  fromAgent: "news-scout",
  toAgent: "alert-commander",
  signalType: "urgent_news" as const,
  stockCode: "VCB",
  payload: {
    title: "VCB up",
    detail: "Facebook says VCB up.",
    impact_score: 4,
  },
  findingData: {},
  ttlMinutes: 120,
};

// ── Schema migration tests ────────────────────────────────────────────────────

describe("Schema migration — critic gate columns", () => {
  it("agent_signals table has critic_score column after initNewsSchema", () => {
    const db = makeDb();
    expect(() =>
      db.prepare("SELECT critic_score FROM agent_signals LIMIT 0").all(),
    ).not.toThrow();
  });

  it("agent_signals table has critic_notes column after initNewsSchema", () => {
    const db = makeDb();
    expect(() =>
      db.prepare("SELECT critic_notes FROM agent_signals LIMIT 0").all(),
    ).not.toThrow();
  });

  it("agent_signals table has retry_count column after initNewsSchema", () => {
    const db = makeDb();
    expect(() =>
      db.prepare("SELECT retry_count FROM agent_signals LIMIT 0").all(),
    ).not.toThrow();
  });
});

// ── Pass path ────────────────────────────────────────────────────────────────

describe("postSignalWithCriticGate — pass path (score >= 0.6)", () => {
  let db: Database;
  beforeEach(() => { db = makeDb(); });

  it("returns signalId > 0 when signal passes critic gate", async () => {
    const result = await postSignalWithCriticGate(db, GOOD_INPUT);
    expect(result.signalId).toBeGreaterThan(0);
  });

  it("criticResult.pass = true for good signal", async () => {
    const result = await postSignalWithCriticGate(db, GOOD_INPUT);
    expect(result.criticResult?.pass).toBe(true);
  });

  it("persists critic_score in the DB row", async () => {
    const { signalId } = await postSignalWithCriticGate(db, GOOD_INPUT);
    const row = db
      .prepare("SELECT critic_score FROM agent_signals WHERE id = ?")
      .get(signalId) as { critic_score: number | null } | null;
    expect(row).not.toBeNull();
    expect(typeof row!.critic_score).toBe("number");
    expect(row!.critic_score).toBeGreaterThan(0);
  });

  it("persists retry_count = 0 on first-pass write", async () => {
    const { signalId } = await postSignalWithCriticGate(db, GOOD_INPUT);
    const row = db
      .prepare("SELECT retry_count FROM agent_signals WHERE id = ?")
      .get(signalId) as { retry_count: number } | null;
    expect(row!.retry_count).toBe(0);
  });

  it("persists critic_notes in the DB row", async () => {
    const { signalId } = await postSignalWithCriticGate(db, GOOD_INPUT);
    const row = db
      .prepare("SELECT critic_notes FROM agent_signals WHERE id = ?")
      .get(signalId) as { critic_notes: string | null } | null;
    expect(typeof row!.critic_notes).toBe("string");
    expect(row!.critic_notes!.length).toBeGreaterThan(0);
  });
});

// ── Fail + retry path ────────────────────────────────────────────────────────

describe("postSignalWithCriticGate — fail+retry path", () => {
  let db: Database;
  beforeEach(() => { db = makeDb(); });

  it("on first call with bad signal: signalId = -1 (not written), criticResult.pass = false", async () => {
    const result = await postSignalWithCriticGate(db, BAD_INPUT);
    expect(result.signalId).toBe(-1);
    expect(result.criticResult?.pass).toBe(false);
  });

  it("on first call failure: returns critique text in criticResult", async () => {
    const result = await postSignalWithCriticGate(db, BAD_INPUT);
    expect(result.criticResult?.critique).toBeDefined();
    expect((result.criticResult?.critique ?? "").length).toBeGreaterThan(0);
  });

  it("on second call (retry_count=1): signal is written even if still failing", async () => {
    // First call — fails
    await postSignalWithCriticGate(db, BAD_INPUT);
    // Second call — should write regardless
    const result = await postSignalWithCriticGate(db, BAD_INPUT, { retryCount: 1 });
    expect(result.signalId).toBeGreaterThan(0);
  });

  it("on second call write: retry_count column = 1", async () => {
    await postSignalWithCriticGate(db, BAD_INPUT);
    const { signalId } = await postSignalWithCriticGate(db, BAD_INPUT, { retryCount: 1 });
    const row = db
      .prepare("SELECT retry_count FROM agent_signals WHERE id = ?")
      .get(signalId) as { retry_count: number } | null;
    expect(row!.retry_count).toBe(1);
  });

  it("on second call that now passes: retry_count = 1, signal written", async () => {
    // First call — fails (bad input)
    await postSignalWithCriticGate(db, BAD_INPUT);
    // Second call — use good payload but still mark as retry
    const { signalId } = await postSignalWithCriticGate(db, GOOD_INPUT, { retryCount: 1 });
    expect(signalId).toBeGreaterThan(0);
    const row = db
      .prepare("SELECT retry_count, critic_score FROM agent_signals WHERE id = ?")
      .get(signalId) as { retry_count: number; critic_score: number | null } | null;
    expect(row!.retry_count).toBe(1);
    expect(row!.critic_score).toBe(1.0);
  });
});

// ── Timeout / fail-soft path ──────────────────────────────────────────────────

describe("postSignalWithCriticGate — timeout / fail-soft path", () => {
  let db: Database;
  beforeEach(() => { db = makeDb(); });

  it("writes signal with critic_score=null on simulated timeout", async () => {
    // Inject a scoreFn that simulates timeout (never resolves within timeout ms)
    const neverResolves = (): Promise<never> => new Promise(() => { /* never */ });
    const opts: PostSignalWithGateOptions = {
      _scoreFn: neverResolves,
      _timeoutMs: 10, // 10ms so test finishes fast
    };
    const { signalId } = await postSignalWithCriticGate(db, GOOD_INPUT, opts);
    expect(signalId).toBeGreaterThan(0);

    const row = db
      .prepare("SELECT critic_score FROM agent_signals WHERE id = ?")
      .get(signalId) as { critic_score: number | null } | null;
    expect(row!.critic_score).toBeNull();
  });

  it("writes signal with critic_notes on timeout", async () => {
    const neverResolves = (): Promise<never> => new Promise(() => { /* never */ });
    const { signalId } = await postSignalWithCriticGate(db, GOOD_INPUT, {
      _scoreFn: neverResolves,
      _timeoutMs: 10,
    });
    const row = db
      .prepare("SELECT critic_notes FROM agent_signals WHERE id = ?")
      .get(signalId) as { critic_notes: string | null } | null;
    expect(typeof row!.critic_notes).toBe("string");
    expect(row!.critic_notes).toContain("timeout");
  });

  it("fail-soft: gate throwing an error writes signal with critic_score=null", async () => {
    const throwingFn = (): Promise<never> => Promise.reject(new Error("Unexpected gate error"));
    const { signalId } = await postSignalWithCriticGate(db, GOOD_INPUT, {
      _scoreFn: throwingFn,
      _timeoutMs: 1000,
    });
    expect(signalId).toBeGreaterThan(0);

    const row = db
      .prepare("SELECT critic_score FROM agent_signals WHERE id = ?")
      .get(signalId) as { critic_score: number | null } | null;
    expect(row!.critic_score).toBeNull();
  });

  it("fail-soft: postSignalWithCriticGate never throws even on gate error", async () => {
    const throwingFn = (): Promise<never> => Promise.reject(new Error("boom"));
    await expect(
      postSignalWithCriticGate(db, GOOD_INPUT, {
        _scoreFn: throwingFn,
        _timeoutMs: 1000,
      }),
    ).resolves.toBeDefined();
  });
});
