/**
 * Intelligence Cycle — Step B default production impl: listSscDocuments
 *
 * FACTORY-SCHEDULER-split-intelligenceCycleJob: extracted verbatim from
 * intelligenceCycleJob.ts. Injected via `deps.listSscDocsFn ?? defaultListSscDocs`
 * in the orchestrator's `_runCycle`.
 */

import type { SscDocument } from "../../../../infrastructure/fetchers/ssc.js";

export async function defaultListSscDocs(code: string): Promise<SscDocument[]> {
  const { listSscDocuments } = await import("../../../../infrastructure/fetchers/ssc.js");
  const year = new Date().getFullYear();
  return listSscDocuments(code, "quarterly", year);
}
