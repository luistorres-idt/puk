import { describe, expect, it, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  CircuitBreakerSheetsPort,
} from './circuit-breaker.js';
import type { SheetsPort } from '../integrations/ports.js';

describe('CircuitBreaker', () => {
  it('starts in CLOSED state and executes successful calls', async () => {
    const breaker = new CircuitBreaker({
      name: 'test-service',
      failureThreshold: 3,
      resetTimeoutMs: 1000,
    });

    expect(breaker.getState()).toBe('CLOSED');
    const result = await breaker.execute(async () => 'ok');
    expect(result).toBe('ok');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('trips to OPEN state after reaching the failure threshold', async () => {
    const stateChanges: Array<{ name: string; from: string; to: string }> = [];
    const breaker = new CircuitBreaker({
      name: 'flaky-service',
      failureThreshold: 2,
      resetTimeoutMs: 500,
      onStateChange: (name, from, to) => stateChanges.push({ name, from, to }),
    });

    const failingAction = async () => {
      throw new Error('connection refused');
    };

    // First failure
    await expect(breaker.execute(failingAction)).rejects.toThrow('connection refused');
    expect(breaker.getState()).toBe('CLOSED');

    // Second failure: reaches threshold -> trips to OPEN
    await expect(breaker.execute(failingAction)).rejects.toThrow('connection refused');
    expect(breaker.getState()).toBe('OPEN');
    expect(stateChanges).toEqual([{ name: 'flaky-service', from: 'CLOSED', to: 'OPEN' }]);

    // Subsequent calls immediately fail fast with CircuitBreakerOpenError
    await expect(breaker.execute(async () => 'fast fail')).rejects.toThrow(CircuitBreakerOpenError);
  });

  it('transitions to HALF_OPEN after resetTimeout and resets to CLOSED on recovery', async () => {
    vi.useFakeTimers();

    const breaker = new CircuitBreaker({
      name: 'recovering-service',
      failureThreshold: 2,
      resetTimeoutMs: 1000,
    });

    const failingAction = async () => {
      throw new Error('timeout');
    };

    await expect(breaker.execute(failingAction)).rejects.toThrow('timeout');
    await expect(breaker.execute(failingAction)).rejects.toThrow('timeout');
    expect(breaker.getState()).toBe('OPEN');

    // Advance time past reset timeout
    vi.advanceTimersByTime(1001);

    // State should now be HALF_OPEN
    expect(breaker.getState()).toBe('HALF_OPEN');

    // Successful trial call closes the breaker
    const result = await breaker.execute(async () => 'recovered');
    expect(result).toBe('recovered');
    expect(breaker.getState()).toBe('CLOSED');

    vi.useRealTimers();
  });

  it('trips back to OPEN if trial call in HALF_OPEN fails', async () => {
    vi.useFakeTimers();

    const breaker = new CircuitBreaker({
      name: 'stubborn-service',
      failureThreshold: 1,
      resetTimeoutMs: 500,
    });

    await expect(
      breaker.execute(async () => {
        throw new Error('fail 1');
      }),
    ).rejects.toThrow('fail 1');
    expect(breaker.getState()).toBe('OPEN');

    vi.advanceTimersByTime(501);
    expect(breaker.getState()).toBe('HALF_OPEN');

    // Trial call fails -> trips back to OPEN
    await expect(
      breaker.execute(async () => {
        throw new Error('fail 2');
      }),
    ).rejects.toThrow('fail 2');
    expect(breaker.getState()).toBe('OPEN');

    vi.useRealTimers();
  });
});

describe('CircuitBreaker Decorators', () => {
  it('protects SheetsPort through CircuitBreakerSheetsPort', async () => {
    const mockSheetsPort: SheetsPort = {
      findEquipment: vi.fn().mockResolvedValue(null),
      listClients: vi.fn().mockRejectedValue(new Error('sheets quota exceeded')),
      listEquipment: vi.fn().mockResolvedValue([]),
      updateAssignment: vi.fn().mockResolvedValue(undefined),
      listTechniciansDirectory: vi.fn().mockResolvedValue([]),
      syncTechnicalReportRow: vi.fn().mockResolvedValue({ row: 2, created: true }),
    };

    const breaker = new CircuitBreaker({
      name: 'sheets-test',
      failureThreshold: 2,
      resetTimeoutMs: 1000,
    });

    const decorated = new CircuitBreakerSheetsPort(mockSheetsPort, breaker);

    await expect(decorated.listClients()).rejects.toThrow('sheets quota exceeded');
    await expect(decorated.listClients()).rejects.toThrow('sheets quota exceeded');

    // Now breaker is OPEN, subsequent call to findEquipment is fast-failed without calling inner
    await expect(decorated.findEquipment({ externalId: 'X', imei: 'Y' })).rejects.toThrow(
      CircuitBreakerOpenError,
    );
    expect(mockSheetsPort.findEquipment).not.toHaveBeenCalled();
  });

});
