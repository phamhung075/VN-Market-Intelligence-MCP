Bun.env["DB_PATH"] = ":memory:";

/**
 * FACTORY-INFRA-split-agentSignalStore — buildSignalInsert() per-flag-combination
 * round-trip test.
 *
 * Each case below reproduces one of the 10 reachable branches of the
 * PRE-REFACTOR `_postSignalInner` 6-deep nested cascade (verified by direct
 * line-by-line reading of the pre-refactor `agentSignalStore.ts` git history —
 * `git show <pre-refactor-sha>:apps/mcp-server/src/infrastructure/db/agentSignalStore.ts`).
 * Column list + bind order (asserted exactly, including the literal 'unread'
 * placeholder position) must match that pre-refactor source byte-for-byte.
 */

import { describe, it, expect } from "bun:test";
import { buildSignalInsert, type SignalInsertValues } from "../insertBuilder.js";
import type { SignalColumnFlags } from "../columnDetect.js";

const V: SignalInsertValues = {
  fromAgent: "agent_a",
  toAgent: "agent_b",
  signalType: "chain_catalyst",
  stockCode: "VNM",
  payloadJson: '{"title":"t"}',
  createdAt: "2026-08-12 09:00:00",
  expiresAt: "2026-08-12 11:00:00",
  cycleId: "20260812-0900",
  findingDataJson: '{"foo":"bar"}',
  causalRef: 42,
  chainDepth: 2,
  causalRootId: "ROOT_1",
  causalRootLabel: "Root label",
  signalClass: "cyclical",
  confidenceScore: 77,
  validatedAt: "2026-08-12 09:00:00",
  newsSentiment: 0.5,
  kinhDichConfidence: 60,
  agentSignalsMajority: "BUY",
  criticScore: 0.8,
  criticNotes: "looks fine",
  retryCount: 0,
};

function flags(overrides: Partial<SignalColumnFlags>): SignalColumnFlags {
  return {
    hasChainColumns: false,
    hasCausalRootColumns: false,
    hasSignalClassColumn: false,
    hasValidationColumns: false,
    hasContextColumns: false,
    hasCriticColumns: false,
    hasCreatedAtColumn: true,
    ...overrides,
  };
}

const BASE = ["from_agent", "to_agent", "signal_type", "stock_code", "payload", "status"];
const CHAIN = ["created_at", "expires_at", "cycle_id", "finding_data", "causal_ref", "chain_depth"];

describe("FACTORY-INFRA-split-agentSignalStore — buildSignalInsert per-flag-combination", () => {
  it("branch A: chain+causalRoot+signalClass+validation+context+critic (full/production)", () => {
    const { sql, binds } = buildSignalInsert(
      flags({ hasChainColumns: true, hasCausalRootColumns: true, hasSignalClassColumn: true, hasValidationColumns: true, hasContextColumns: true, hasCriticColumns: true }),
      V,
    );
    const cols = [...BASE, ...CHAIN, "causal_root_id", "causal_root_label", "signal_class", "confidence_score", "validated_at", "news_sentiment", "kinh_dich_confidence", "agent_signals_majority", "critic_score", "critic_notes", "retry_count"];
    expect(sql).toBe(`INSERT OR IGNORE INTO agent_signals (${cols.join(", ")}) VALUES (?, ?, ?, ?, ?, 'unread', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    expect(binds).toEqual([
      V.fromAgent, V.toAgent, V.signalType, V.stockCode, V.payloadJson,
      V.createdAt, V.expiresAt, V.cycleId, V.findingDataJson, V.causalRef, V.chainDepth,
      V.causalRootId, V.causalRootLabel, V.signalClass, V.confidenceScore, V.validatedAt,
      V.newsSentiment, V.kinhDichConfidence, V.agentSignalsMajority,
      V.criticScore, V.criticNotes, V.retryCount,
    ]);
  });

  it("branch B: full minus critic", () => {
    const { sql, binds } = buildSignalInsert(
      flags({ hasChainColumns: true, hasCausalRootColumns: true, hasSignalClassColumn: true, hasValidationColumns: true, hasContextColumns: true }),
      V,
    );
    expect(sql).toContain("news_sentiment, kinh_dich_confidence, agent_signals_majority)");
    expect(sql).not.toContain("critic_score");
    expect(binds).toEqual([
      V.fromAgent, V.toAgent, V.signalType, V.stockCode, V.payloadJson,
      V.createdAt, V.expiresAt, V.cycleId, V.findingDataJson, V.causalRef, V.chainDepth,
      V.causalRootId, V.causalRootLabel, V.signalClass, V.confidenceScore, V.validatedAt,
      V.newsSentiment, V.kinhDichConfidence, V.agentSignalsMajority,
    ]);
  });

  it("branch C: minus context+critic (signalClass+validation only)", () => {
    const { sql, binds } = buildSignalInsert(
      flags({ hasChainColumns: true, hasCausalRootColumns: true, hasSignalClassColumn: true, hasValidationColumns: true }),
      V,
    );
    expect(sql).not.toContain("news_sentiment");
    expect(sql).toContain("signal_class, confidence_score, validated_at)");
    expect(binds).toEqual([
      V.fromAgent, V.toAgent, V.signalType, V.stockCode, V.payloadJson,
      V.createdAt, V.expiresAt, V.cycleId, V.findingDataJson, V.causalRef, V.chainDepth,
      V.causalRootId, V.causalRootLabel, V.signalClass, V.confidenceScore, V.validatedAt,
    ]);
  });

  it("branch D: signalClass present, validation absent", () => {
    const { sql, binds } = buildSignalInsert(
      flags({ hasChainColumns: true, hasCausalRootColumns: true, hasSignalClassColumn: true }),
      V,
    );
    expect(sql).not.toContain("confidence_score");
    expect(sql).toContain("causal_root_label, signal_class)");
    expect(binds).toEqual([
      V.fromAgent, V.toAgent, V.signalType, V.stockCode, V.payloadJson,
      V.createdAt, V.expiresAt, V.cycleId, V.findingDataJson, V.causalRef, V.chainDepth,
      V.causalRootId, V.causalRootLabel, V.signalClass,
    ]);
  });

  it("branch E: causalRoot+validation, signalClass ABSENT (non-monotonic — code still supports it)", () => {
    const { sql, binds } = buildSignalInsert(
      flags({ hasChainColumns: true, hasCausalRootColumns: true, hasValidationColumns: true }),
      V,
    );
    expect(sql).not.toContain("signal_class");
    expect(sql).toContain("causal_root_label, confidence_score, validated_at)");
    expect(binds).toEqual([
      V.fromAgent, V.toAgent, V.signalType, V.stockCode, V.payloadJson,
      V.createdAt, V.expiresAt, V.cycleId, V.findingDataJson, V.causalRef, V.chainDepth,
      V.causalRootId, V.causalRootLabel, V.confidenceScore, V.validatedAt,
    ]);
  });

  it("branch F: causalRoot only (no signalClass, no validation)", () => {
    const { sql, binds } = buildSignalInsert(flags({ hasChainColumns: true, hasCausalRootColumns: true }), V);
    expect(sql).toBe(`INSERT OR IGNORE INTO agent_signals (${[...BASE, ...CHAIN, "causal_root_id", "causal_root_label"].join(", ")}) VALUES (?, ?, ?, ?, ?, 'unread', ?, ?, ?, ?, ?, ?, ?, ?)`);
    expect(binds).toEqual([
      V.fromAgent, V.toAgent, V.signalType, V.stockCode, V.payloadJson,
      V.createdAt, V.expiresAt, V.cycleId, V.findingDataJson, V.causalRef, V.chainDepth,
      V.causalRootId, V.causalRootLabel,
    ]);
  });

  it("branch G: chain + validation, no causalRoot", () => {
    const { sql, binds } = buildSignalInsert(flags({ hasChainColumns: true, hasValidationColumns: true }), V);
    expect(sql).not.toContain("causal_root");
    expect(sql).toContain("chain_depth, confidence_score, validated_at)");
    expect(binds).toEqual([
      V.fromAgent, V.toAgent, V.signalType, V.stockCode, V.payloadJson,
      V.createdAt, V.expiresAt, V.cycleId, V.findingDataJson, V.causalRef, V.chainDepth,
      V.confidenceScore, V.validatedAt,
    ]);
  });

  it("branch H: chain columns only (no causalRoot, no validation)", () => {
    const { sql, binds } = buildSignalInsert(flags({ hasChainColumns: true }), V);
    expect(sql).toBe(`INSERT OR IGNORE INTO agent_signals (${[...BASE, ...CHAIN].join(", ")}) VALUES (?, ?, ?, ?, ?, 'unread', ?, ?, ?, ?, ?, ?)`);
    expect(binds).toEqual([
      V.fromAgent, V.toAgent, V.signalType, V.stockCode, V.payloadJson,
      V.createdAt, V.expiresAt, V.cycleId, V.findingDataJson, V.causalRef, V.chainDepth,
    ]);
  });

  it("branch I: no chain columns, validation present (legacy DB, Task 230 only)", () => {
    const { sql, binds } = buildSignalInsert(flags({ hasValidationColumns: true }), V);
    expect(sql).toBe(`INSERT OR IGNORE INTO agent_signals (${[...BASE, "expires_at", "confidence_score", "validated_at"].join(", ")}) VALUES (?, ?, ?, ?, ?, 'unread', ?, ?, ?)`);
    expect(sql).not.toContain("created_at");
    expect(binds).toEqual([V.fromAgent, V.toAgent, V.signalType, V.stockCode, V.payloadJson, V.expiresAt, V.confidenceScore, V.validatedAt]);
  });

  it("branch J: base schema only (no chain, no validation — original Task 242 shape)", () => {
    const { sql, binds } = buildSignalInsert(flags({}), V);
    expect(sql).toBe(`INSERT OR IGNORE INTO agent_signals (${[...BASE, "expires_at"].join(", ")}) VALUES (?, ?, ?, ?, ?, 'unread', ?)`);
    expect(binds).toEqual([V.fromAgent, V.toAgent, V.signalType, V.stockCode, V.payloadJson, V.expiresAt]);
  });
});
