/**
 * Morning Briefing — persist step: writes the assembled briefing to
 * `briefingsDir/YYYY-MM-DD.json` (overwrites on re-run).
 *
 * Extracted from assembleBriefing.ts _assembleBriefingImpl (FACTORY-APP-split-assembleBriefing).
 *
 * Layer: application/usecases/briefing — infrastructure fs access, best-effort.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../../../infrastructure/logger.js";

/**
 * Generic over the caller's briefing shape (kept decoupled from
 * assembleBriefing.ts's DailyBriefing to avoid a reverse import — this
 * module only needs a `date` field to name the output file).
 */
export interface PersistableBriefing {
  date: string;
}

/** Persist `briefing` to `briefingsDir/<briefing.date>.json`. Failure is logged, never thrown. */
export function persistBriefing<T extends PersistableBriefing>(briefing: T, briefingsDir: string): void {
  try {
    mkdirSync(briefingsDir, { recursive: true });
    const filePath = join(briefingsDir, `${briefing.date}.json`);
    writeFileSync(filePath, JSON.stringify(briefing, null, 2), "utf-8");
    logger.info("[assembleBriefing] briefing persisted", { filePath });
  } catch (err) {
    logger.warn("[assembleBriefing] failed to persist briefing", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
