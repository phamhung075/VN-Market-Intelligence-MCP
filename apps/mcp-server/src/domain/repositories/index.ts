/**
 * Domain Repository Interfaces — barrel export (Ports)
 *
 * Defines the interfaces (ports) that infrastructure adapters must implement.
 * The domain layer depends only on these interfaces — never on concrete adapters.
 *
 * Task 1838b: Phase 1 repository pattern — 5 interfaces added.
 */

export * from "./IWatchlistRepository.js";
export * from "./IMarketPriceRepository.js";
export * from "./IVnstockRepository.js";
export * from "./IKinhDichScoreRepository.js";
export * from "./IHexagramRepository.js";
export * from "./IJobRunRepository.js";
