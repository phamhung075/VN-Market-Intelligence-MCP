/** Core shared types for the agent_signals bus — used across every agentSignals/ module. */

import { z } from "zod";

/**
 * Zod schema for valid signal types (SSOT — imported by agentSignalTools).
 * Derived TypeScript union below keeps the rest of the file unchanged.
 */
export const SignalTypeSchema = z.enum([
  "urgent_news",
  "price_anomaly",
  "cross_validate",
  "suppress",
  "chain_catalyst",
  "fundamental_validation",
  "price_confirmation",
  "verified_chain",
  "signal_feedback",
  "legal_risk",           // SPIKE-1948e-fix
  "verified_decision",    // Task 1967-02: chain de-dup ack after alert-commander fires/suppresses
]);

/** Valid signal types that agents can exchange (includes enrichment chain types). */
export type SignalType = z.infer<typeof SignalTypeSchema>;

/** Payload carried by an agent signal. */
export interface SignalPayload {
  title?: string;
  detail?: string;
  impact_score?: number;
  [key: string]: unknown;
}

/** A fully hydrated agent signal row returned by getSignals. */
export interface AgentSignal {
  id: number;
  fromAgent: string;
  toAgent: string;
  signalType: SignalType;
  stockCode: string | null;
  payload: SignalPayload;
  status: "unread" | "read";
  createdAt: string;
  expiresAt: string;
  confidence_score?: number | null; // 0–100, null = genuinely absent (Task 230 / FIX-CONF-DEFAULT-50)
  validated_at?: string; // ISO8601, default created_at (Task 230)
}
