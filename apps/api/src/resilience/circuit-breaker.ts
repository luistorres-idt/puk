import type {
  ExternalClientRecord,
  ExternalEquipmentRecord,
  SheetsPort,
  TechnicalReportRowInput,
} from '../integrations/ports.js';
import { MetricsService } from '../observability/metrics.js';
import { AppError } from '../shared/errors.js';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;
  resetTimeoutMs?: number;
  onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void;
}

export class CircuitBreakerOpenError extends AppError {
  public constructor(public readonly breakerName: string) {
    super(
      503,
      'CIRCUIT_BREAKER_OPEN',
      `El servicio externo (${breakerName}) no está disponible temporalmente por protección del sistema.`,
      { breakerName },
    );
    this.name = 'CircuitBreakerOpenError';
  }
}

export class CircuitBreaker {
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly onStateChange?:
    ((name: string, from: CircuitState, to: CircuitState) => void) | undefined;

  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private lastFailureTime = 0;

  public constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = Math.max(1, options.failureThreshold ?? 5);
    this.resetTimeoutMs = Math.max(100, options.resetTimeoutMs ?? 30_000);
    this.onStateChange = options.onStateChange;

    MetricsService.getInstance().recordCircuitBreakerState(this.name, 'CLOSED');
  }

  public getName(): string {
    return this.name;
  }

  public getState(): CircuitState {
    if (this.state === 'OPEN' && Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
      this.transitionTo('HALF_OPEN');
    }
    return this.state;
  }

  public async execute<T>(action: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === 'OPEN') {
      throw new CircuitBreakerOpenError(this.name);
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  public reset(): void {
    this.consecutiveFailures = 0;
    this.lastFailureTime = 0;
    this.transitionTo('CLOSED');
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.consecutiveFailures = 0;
      this.transitionTo('CLOSED');
    } else if (this.state === 'CLOSED') {
      this.consecutiveFailures = 0;
    }
  }

  private onFailure(): void {
    this.lastFailureTime = Date.now();
    this.consecutiveFailures += 1;

    if (this.state === 'HALF_OPEN' || this.consecutiveFailures >= this.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;
    const oldState = this.state;
    this.state = newState;
    MetricsService.getInstance().recordCircuitBreakerState(this.name, newState);
    this.onStateChange?.(this.name, oldState, newState);
  }
}

/**
 * Decorator pattern: wraps any SheetsPort implementation with circuit breaker protection.
 */
export class CircuitBreakerSheetsPort implements SheetsPort {
  public constructor(
    private readonly inner: SheetsPort,
    private readonly breaker: CircuitBreaker,
  ) {}

  public getCircuitBreaker(): CircuitBreaker {
    return this.breaker;
  }

  public listClients(): Promise<readonly ExternalClientRecord[]> {
    return this.breaker.execute(() => this.inner.listClients());
  }

  public listEquipment(): Promise<readonly ExternalEquipmentRecord[]> {
    return this.breaker.execute(() => this.inner.listEquipment());
  }

  public findEquipment(identity: {
    externalId: string;
    imei: string;
  }): Promise<ExternalEquipmentRecord | null> {
    return this.breaker.execute(() => this.inner.findEquipment(identity));
  }

  public updateAssignment(input: {
    row: number;
    values: Readonly<Partial<Record<'J' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P', string>>>;
  }): Promise<void> {
    return this.breaker.execute(() => this.inner.updateAssignment(input));
  }

  public listTechniciansDirectory(): Promise<readonly (readonly string[])[]> {
    return this.breaker.execute(() => this.inner.listTechniciansDirectory());
  }

  public syncTechnicalReportRow(
    input: TechnicalReportRowInput,
  ): Promise<{ row: number; created: boolean }> {
    return this.breaker.execute(() => this.inner.syncTechnicalReportRow(input));
  }
}
