/** Input/output types for buildSignalInsert() — split out of insertBuilder.ts for size. */

/** Fully-resolved values for one `agent_signals` INSERT (already JSON-stringified where needed). */
export interface SignalInsertValues {
  fromAgent: string;
  toAgent: string;
  signalType: string;
  stockCode: string | null;
  payloadJson: string;
  createdAt: string;
  expiresAt: string;
  cycleId: string | null;
  findingDataJson: string;
  causalRef: number | null;
  chainDepth: number;
  causalRootId: string | null;
  causalRootLabel: string | null;
  signalClass: string | null;
  confidenceScore: number | null;
  validatedAt: string;
  newsSentiment: number | null;
  kinhDichConfidence: number | null;
  agentSignalsMajority: string | null;
  criticScore: number | null;
  criticNotes: string | null;
  retryCount: number;
}

/** Every value ever bound by buildSignalInsert() is a plain SQLite scalar. */
export type SqlBindValue = string | number | null;

/** A ready-to-`.prepare()` INSERT statement + its positional binds, in matching order. */
export interface BuiltSignalInsert {
  sql: string;
  binds: SqlBindValue[];
}
