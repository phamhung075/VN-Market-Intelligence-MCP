/** Shared row shape + deserializer for the chain-query functions in chainQueries.ts. */

import type { SignalPayload, SignalType } from "./types.js";

/** Deserialized chain finding row. */
export interface ChainFinding {
  id: number;
  fromAgent: string;
  signalType: SignalType | string;
  stockCode: string | null;
  payload: SignalPayload;
  findingData: Record<string, unknown>;
  causalRef: number | null;
  chainDepth: number;
  createdAt: string;
}

export interface RawChainRow {
  id: number;
  from_agent: string;
  signal_type: string;
  stock_code: string | null;
  payload_json?: string;
  payload?: string;
  finding_data: string | null;
  causal_ref: number | null;
  chain_depth: number;
  created_at: string;
}

export function deserializeChainRow(row: RawChainRow): ChainFinding {
  let payload: SignalPayload = {};
  let findingData: Record<string, unknown> = {};

  const rawPayload = row.payload_json ?? row.payload ?? "{}";
  try { payload = JSON.parse(rawPayload); } catch {}
  try { findingData = JSON.parse(row.finding_data ?? "{}"); } catch {}

  return {
    id: row.id,
    fromAgent: row.from_agent,
    signalType: row.signal_type as SignalType,
    stockCode: row.stock_code,
    payload,
    findingData,
    causalRef: row.causal_ref,
    chainDepth: row.chain_depth ?? 0,
    createdAt: row.created_at,
  };
}
