/**
 * FACTORY-INFRA-split-agentSignalStore — single dynamic INSERT builder.
 *
 * Replaces the 10 hand-written `INSERT OR IGNORE INTO agent_signals` variants
 * that used to be nested 6-deep inside `_postSignalInner` (one per reachable
 * combination of `SignalColumnFlags`). Column/bind order below is a MECHANICAL
 * reproduction of that nesting — verified branch-by-branch against the
 * pre-refactor source in `insertBuilder.test.ts` (10 cases, one per reachable
 * flag combination), not a re-derivation from scratch:
 *
 *   - `causal_root_id/label`      only when hasChainColumns && hasCausalRootColumns
 *   - `signal_class`              only when the above && hasSignalClassColumn
 *   - `confidence_score/validated_at` whenever hasValidationColumns (independent
 *     of causal_root/signal_class — the original code re-checked this same flag
 *     at 4 different nesting depths with identical effect every time)
 *   - `news_sentiment/kinh_dich_confidence/agent_signals_majority` only when
 *     hasChainColumns && hasCausalRootColumns && hasSignalClassColumn &&
 *     hasValidationColumns && hasContextColumns (the deepest reachable nesting)
 *   - `critic_score/critic_notes/retry_count` only when all of the above && hasCriticColumns
 *
 * When `hasChainColumns` is false, none of the chain/causalRoot/signalClass/
 * context/critic columns are ever included (unreachable in the original
 * nesting) — only the base columns, `expires_at`, and (independently)
 * `confidence_score/validated_at`.
 */

import type { SignalColumnFlags } from "./columnDetect.js";
import type { BuiltSignalInsert, SignalInsertValues, SqlBindValue } from "./insertBuilderTypes.js";

export type { SignalInsertValues, BuiltSignalInsert } from "./insertBuilderTypes.js";

/** Builds the `agent_signals` INSERT reproducing the exact column/bind order for `flags`. */
export function buildSignalInsert(flags: SignalColumnFlags, v: SignalInsertValues): BuiltSignalInsert {
  const cols = ["from_agent", "to_agent", "signal_type", "stock_code", "payload", "status"];
  const placeholders = ["?", "?", "?", "?", "?", "'unread'"];
  const binds: SqlBindValue[] = [v.fromAgent, v.toAgent, v.signalType, v.stockCode, v.payloadJson];

  const push = (col: string, bind: SqlBindValue) => {
    cols.push(col);
    placeholders.push("?");
    binds.push(bind);
  };

  if (flags.hasChainColumns) {
    push("created_at", v.createdAt);
    push("expires_at", v.expiresAt);
    push("cycle_id", v.cycleId);
    push("finding_data", v.findingDataJson);
    push("causal_ref", v.causalRef);
    push("chain_depth", v.chainDepth);

    if (flags.hasCausalRootColumns) {
      push("causal_root_id", v.causalRootId);
      push("causal_root_label", v.causalRootLabel);
      if (flags.hasSignalClassColumn) push("signal_class", v.signalClass);
    }

    if (flags.hasValidationColumns) {
      push("confidence_score", v.confidenceScore);
      push("validated_at", v.validatedAt);
    }

    if (
      flags.hasCausalRootColumns &&
      flags.hasSignalClassColumn &&
      flags.hasValidationColumns &&
      flags.hasContextColumns
    ) {
      push("news_sentiment", v.newsSentiment);
      push("kinh_dich_confidence", v.kinhDichConfidence);
      push("agent_signals_majority", v.agentSignalsMajority);

      if (flags.hasCriticColumns) {
        push("critic_score", v.criticScore);
        push("critic_notes", v.criticNotes);
        push("retry_count", v.retryCount);
      }
    }
  } else {
    push("expires_at", v.expiresAt);
    if (flags.hasValidationColumns) {
      push("confidence_score", v.confidenceScore);
      push("validated_at", v.validatedAt);
    }
  }

  const sql = `INSERT OR IGNORE INTO agent_signals (${cols.join(", ")}) VALUES (${placeholders.join(", ")})`;
  return { sql, binds };
}
