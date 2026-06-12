/**
 * Signal Domain Module Index
 * Task 1293a — exports all signal type interfaces and Zod validators
 * Task 1295a — exports all signal builder classes and factory functions
 */

export {
  ChainCatalystFindingDataSchema,
  PriceConfirmationFindingDataSchema,
  UrgentNewsFindingDataSchema,
  UrgentNewsLooseSchema,
  CrossValidateFindingDataSchema,
  SignalSchemas,
  type ChainCatalystFindingData,
  type PriceConfirmationFindingData,
  type UrgentNewsFindingData,
  type CrossValidateFindingData,
} from "./signalTypes";

export {
  createChainCatalystBuilder,
  createPriceConfirmationBuilder,
  createUrgentNewsBuilder,
  createCrossValidateBuilder,
  type ChainCatalystBuilder,
  type PriceConfirmationBuilder,
  type UrgentNewsBuilder,
  type CrossValidateBuilder,
} from "./signalBuilders";
