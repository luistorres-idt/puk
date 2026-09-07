import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import { extractApiErrorMessage } from './client.js';

describe('extractApiErrorMessage', () => {
  it('extracts error message from API response when available', () => {
    const error = new AxiosError('Request failed with status code 400');
    error.response = {
      data: {
        error: {
          code: 'ORDER_INVALID_TRANSITION',
          message: 'Solo se pueden iniciar órdenes en estado asignada',
        },
      },
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: { headers: new AxiosHeaders() },
    };

    const result = extractApiErrorMessage(error, 'Fallback message');
    expect(result).toBe('Solo se pueden iniciar órdenes en estado asignada');
  });

  it('falls back to Error.message if API error body lacks a message', () => {
    const error = new AxiosError('Network Error');
    const result = extractApiErrorMessage(error, 'Fallback message');
    expect(result).toBe('Network Error');
  });

  it('extracts standard JS Error message', () => {
    const error = new Error('Something went wrong');
    const result = extractApiErrorMessage(error, 'Fallback message');
    expect(result).toBe('Something went wrong');
  });

  it('returns fallback message for unknown or null values', () => {
    expect(extractApiErrorMessage(null, 'Fallback message')).toBe('Fallback message');
    expect(extractApiErrorMessage('string error', 'Fallback message')).toBe('Fallback message');
    expect(extractApiErrorMessage({}, 'Fallback message')).toBe('Fallback message');
  });
});
