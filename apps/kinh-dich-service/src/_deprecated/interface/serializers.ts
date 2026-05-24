/**
 * Kinh Dich Service — Interface Serializers
 *
 * Convert domain errors to HTTP responses.
 */

import { HexagramNotFoundError, InsufficientDataError } from '../domain/errors.js';

export function errorToStatus(err: unknown): { status: 404 | 422 | 500; body: { error: string } } {
  if (err instanceof HexagramNotFoundError) {
    return { status: 404, body: { error: err.message } };
  }
  if (err instanceof InsufficientDataError) {
    return { status: 422, body: { error: err.message } };
  }
  return { status: 500, body: { error: String(err) } };
}
