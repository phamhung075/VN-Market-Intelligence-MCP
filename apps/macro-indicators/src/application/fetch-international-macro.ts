/**
 * Application Use Case — FetchInternationalMacroUseCase
 *
 * Orchestrates ADB KIDB + IMF WEO scrapers:
 *   1. adb-kidb   (spa-xhr-intercept Phase 2, direct API, ~15MB)
 *   2. imf-weo    (open-api-key, api.imf.org SDMX 3.0, ~5MB)
 *
 * Both run in parallel — no rate-limit conflict between different domains.
 * Total estimated RAM: ~20MB (no headless browser — Phase 2 only).
 *
 * Split from fetch-external-macro.ts to respect 120-line split policy.
 * The existing FetchExternalMacroUseCase covers 6 lightweight sources.
 * This use-case covers the two international institutional data sources.
 */

import type { AdbKidbPort, ImfWeoPort } from '../domain/repositories.js';

export interface InternationalMacroResult {
  adbKidb: Awaited<ReturnType<AdbKidbPort['fetchVnMacroBatch']>> | null;
  imfWeo: Awaited<ReturnType<ImfWeoPort['fetchVnWeoMacroBatch']>> | null;
  fetchedAt: string;
}

export class FetchInternationalMacroUseCase {
  constructor(
    private readonly adbKidb: AdbKidbPort,
    private readonly imfWeo: ImfWeoPort,
  ) {}

  async execute(): Promise<InternationalMacroResult> {
    const fetchedAt = new Date().toISOString();

    const [adbResult, imfResult] = await Promise.allSettled([
      this.adbKidb.fetchVnMacroBatch(),
      this.imfWeo.fetchVnWeoMacroBatch(),
    ]);

    return {
      adbKidb: adbResult.status === 'fulfilled' ? adbResult.value : null,
      imfWeo:  imfResult.status === 'fulfilled'  ? imfResult.value  : null,
      fetchedAt,
    };
  }
}
