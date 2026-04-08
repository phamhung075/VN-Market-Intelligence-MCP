/**
 * Task 246 — /ask 15-minute response guarantee
 *
 * Tests for the standalone userRequestCheckJob that processes pending user
 * requests every 15 minutes, independent of the intelligence cycle.
 *
 * Acceptance criteria:
 *   1. Pending request is processed and answered
 *   2. Already-processing request is skipped (no double-processing)
 *   3. Already-done request is skipped
 *   4. Empty table returns immediately (no crash)
 *   5. RAG error doesn't crash — marks request with error response
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  insertUserRequest,
  getPendingRequests,
  type UserRequest,
} from "../infrastructure/db/userRequestStore.js";
import { ensureUserRequestsTable } from "./helpers/userRequestsTestDdl.js";
import {
  runUserRequestCheck,
  type UserRequestCheckDeps,
} from "../scheduler/userRequestCheckJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test database factory
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  ensureUserRequestsTable(db);
  return db;
}

function getRow(db: Database, id: number): UserRequest | null {
  return db
    .prepare<UserRequest, [number]>("SELECT * FROM user_requests WHERE id = ?")
    .get(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test deps factory — stubs out RAG and Telegram
// ─────────────────────────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<UserRequestCheckDeps> = {}): UserRequestCheckDeps {
  return {
    searchContextFn: async (_query: string) => [
      {
        id: "r1",
        level: "country",
        title: "VCB Q4 Results",
        summary: "Strong quarter with 15% profit growth",
        tags: ["banking", "vcb"],
        actionCode: "VCB",
        distance: 0.2,
        createdAt: new Date().toISOString(),
      },
    ],
    sendTelegramFn: async (_msg: string) => true,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 246 — userRequestCheckJob", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("processes a pending request and marks it done", async () => {
    const id = insertUserRequest(db, "ask", "VCB giam vi sao?");

    const result = await runUserRequestCheck(db, makeDeps());

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);

    const row = getRow(db, id);
    expect(row!.status).toBe("done");
    expect(row!.response).not.toBeNull();
    expect(row!.answered_at).not.toBeNull();
  });

  it("skips a request already marked as processing (no double-processing)", async () => {
    const id = insertUserRequest(db, "ask", "FPT tang vi sao?");

    // Simulate the intelligence cycle having already claimed this request
    db.prepare(
      "UPDATE user_requests SET status = 'processing' WHERE id = ?",
    ).run(id);

    const result = await runUserRequestCheck(db, makeDeps());

    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(0); // not counted — not visible to the query

    // Row must still be 'processing' (not touched)
    const row = getRow(db, id);
    expect(row!.status).toBe("processing");
  });

  it("skips a request already marked as done", async () => {
    const id = insertUserRequest(db, "ask", "Already answered?");
    db.prepare(
      "UPDATE user_requests SET status = 'done', response = 'prior answer' WHERE id = ?",
    ).run(id);

    const result = await runUserRequestCheck(db, makeDeps());

    expect(result.processed).toBe(0);

    const row = getRow(db, id);
    expect(row!.response).toBe("prior answer"); // unchanged
  });

  it("returns immediately with zero counts when table is empty", async () => {
    const result = await runUserRequestCheck(db, makeDeps());

    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
  });

  it("marks request with error response when RAG throws", async () => {
    const id = insertUserRequest(db, "ask", "Broken query");

    const failingDeps = makeDeps({
      searchContextFn: async (_query: string) => {
        throw new Error("LanceDB unavailable");
      },
    });

    const result = await runUserRequestCheck(db, failingDeps);

    // Error does not crash the job
    expect(result.errors).toBe(1);
    expect(result.processed).toBe(0);

    const row = getRow(db, id);
    // Should be reset to pending or marked with error response
    expect(row!.status).toBe("done");
    expect(row!.response).toContain("Loi");
  });

  it("processes up to 3 pending requests in one run", async () => {
    insertUserRequest(db, "ask", "Q1");
    insertUserRequest(db, "ask", "Q2");
    insertUserRequest(db, "ask", "Q3");
    insertUserRequest(db, "ask", "Q4"); // beyond the limit

    const result = await runUserRequestCheck(db, makeDeps());

    expect(result.processed).toBe(3);

    // Q4 must remain pending
    const remaining = getPendingRequests(db, 10);
    expect(remaining.length).toBe(1);
    expect(remaining[0]!.payload).toBe("Q4");
  });

  it("uses CAS update to claim request atomically before processing", async () => {
    const id = insertUserRequest(db, "ask", "Concurrent test");

    // Simulate a race: between our SELECT and UPDATE, another process claims it
    let claimAttempts = 0;
    const racingDeps = makeDeps({
      // The searchContextFn is called only after a successful claim
      searchContextFn: async (_query: string) => {
        claimAttempts++;
        return [];
      },
    });

    // Claim it manually (simulates intelligence cycle winning the race)
    db.prepare(
      "UPDATE user_requests SET status = 'processing' WHERE id = ? AND status = 'pending'",
    ).run(id);

    await runUserRequestCheck(db, racingDeps);

    // searchContextFn should never have been called since claim failed
    expect(claimAttempts).toBe(0);
  });

  it("sends Telegram message with the answer", async () => {
    insertUserRequest(db, "ask", "VCB giam vi sao?");

    const sentMessages: string[] = [];
    const deps = makeDeps({
      sendTelegramFn: async (msg: string) => {
        sentMessages.push(msg);
        return true;
      },
    });

    await runUserRequestCheck(db, deps);

    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0]).toContain("VCB giam vi sao?");
  });

  it("includes RAG results in the response", async () => {
    const id = insertUserRequest(db, "ask", "Market analysis");

    const deps = makeDeps({
      searchContextFn: async () => [
        {
          id: "r1",
          level: "country",
          title: "VN-Index weekly summary",
          summary: "Market declined 2% on foreign sell pressure",
          tags: ["market", "vnindex"],
          actionCode: "VNM",
          distance: 0.15,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    await runUserRequestCheck(db, deps);

    const row = getRow(db, id);
    expect(row!.response).toContain("VN-Index weekly summary");
  });

  it("handles empty RAG results gracefully with fallback message", async () => {
    const id = insertUserRequest(db, "ask", "Unknown topic xyz");

    const deps = makeDeps({
      searchContextFn: async () => [],
    });

    await runUserRequestCheck(db, deps);

    const row = getRow(db, id);
    expect(row!.status).toBe("done");
    expect(row!.response).not.toBeNull();
    // Should have a meaningful fallback, not an empty string
    expect(row!.response!.length).toBeGreaterThan(0);
  });
});
