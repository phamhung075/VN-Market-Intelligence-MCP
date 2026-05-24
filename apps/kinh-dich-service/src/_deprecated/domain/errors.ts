/**
 * Kinh Dich Service — Domain Errors
 */

export class KinhDichError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KinhDichError';
  }
}

export class InsufficientDataError extends KinhDichError {
  constructor(stockCode: string, daysRequired: number) {
    super(`Insufficient price data for ${stockCode}: need at least ${daysRequired} days`);
    this.name = 'InsufficientDataError';
  }
}

export class HexagramNotFoundError extends KinhDichError {
  constructor(stockCode: string) {
    super(`No stored hexagram reading found for ${stockCode}`);
    this.name = 'HexagramNotFoundError';
  }
}
