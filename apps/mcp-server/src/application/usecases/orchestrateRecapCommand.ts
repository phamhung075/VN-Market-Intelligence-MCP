/**
 * Orchestrate Recap Command — Application Usecase (FACTORY-INFRA-split-telegramCommands)
 *
 * Owns the /recap, /recapw, /recapm ORCHESTRATION step (deciding which
 * lower-level usecase to call and with what arguments) so that the
 * infrastructure/notifiers/telegramCommands.ts Telegram router no longer
 * imports application/usecases directly (was reaching UP from infra into
 * application to both fetch AND render — see recapRenderer.ts's layering-fix
 * note for the render half of this split).
 *
 * Invoked by the INTERFACE layer (interface/mcp/routes/webhookHandler.ts),
 * which passes the resolved summary down into telegramCommands.ts's
 * RecapResolvers DI contract for pure rendering.
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 *
 * @module application/usecases/orchestrateRecapCommand
 */

import type { Database } from "bun:sqlite";
import { assembleEveningSummary } from "./assembleEveningSummary.js";
import type { EveningSummary } from "./assembleEveningSummary.js";
import { generatePeriodicSummary } from "./generatePeriodicSummary.js";
import type { PeriodicSummary } from "./generatePeriodicSummary.js";

/** /recap — resolve today's evening synthesis. */
export async function orchestrateEveningRecap(db: Database): Promise<EveningSummary> {
  return assembleEveningSummary({ db });
}

/** /recapw — resolve this week's periodic synthesis. */
export async function orchestrateWeeklyRecap(db: Database): Promise<PeriodicSummary> {
  return generatePeriodicSummary("weekly", undefined, db);
}

/** /recapm — resolve this month's periodic synthesis. */
export async function orchestrateMonthlyRecap(db: Database): Promise<PeriodicSummary> {
  return generatePeriodicSummary("monthly", undefined, db);
}
