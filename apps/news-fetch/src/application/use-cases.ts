/**
 * Application Use Cases — news-fetch microservice
 *
 * Pure orchestration: imports only from domain layer (inward).
 * No business logic, no filtering, no calculations.
 * Port interfaces injected via constructor — enables unit testing with mocks.
 */

import { FetchResult } from '../domain/models.js';
import { ReutersNewsPort, BloombergNewsPort } from '../domain/repositories.js';

/**
 * Fetches the latest Reuters headlines via the injected port.
 * Thin wrapper — delegates directly to ReutersNewsPort.fetchHeadlines.
 */
export class FetchReutersHeadlinesUseCase {
  constructor(private readonly repo: ReutersNewsPort) {}

  async execute(maxItems: number = 15): Promise<FetchResult> {
    return this.repo.fetchHeadlines(maxItems);
  }
}

/**
 * Fetches the latest Bloomberg headlines via the injected port.
 * Thin wrapper — delegates directly to BloombergNewsPort.fetchHeadlines.
 */
export class FetchBloombergHeadlinesUseCase {
  constructor(private readonly repo: BloombergNewsPort) {}

  async execute(maxItems: number = 10): Promise<FetchResult> {
    return this.repo.fetchHeadlines(maxItems);
  }
}
