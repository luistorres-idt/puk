import type { Request, Response, NextFunction } from 'express';
import type { PrismaClient } from '../generated/prisma/client.js';

export interface MetricsData {
  httpRequestsTotal: Record<string, number>;
  httpRequestDurationSeconds: Record<string, number>;
  authLoginFailuresTotal: number;
  uploadsFailedTotal: number;
  sheetsOperationsTotal: Record<string, number>;
  circuitBreakerState: Record<string, string>;
  outboxEventsPendingTotal: number;
  outboxOldestEventAgeSeconds: number;
  ordersByStatus: Record<string, number>;
}

export class MetricsService {
  private static instance: MetricsService;

  private httpRequests: Map<string, number> = new Map();
  private httpDurations: Map<string, { totalTime: number; count: number }> = new Map();
  private authLoginFailures = 0;
  private uploadsFailed = 0;
  private sheetsOperations: Map<string, number> = new Map();
  private circuitBreakers: Map<string, string> = new Map();

  public static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  public recordHttpRequest(method: string, path: string, status: number, durationMs: number): void {
    const normalizedPath = this.normalizePath(path);
    const key = `${method.toUpperCase()}:${normalizedPath}:${status}`;
    this.httpRequests.set(key, (this.httpRequests.get(key) ?? 0) + 1);

    const durKey = `${method.toUpperCase()}:${normalizedPath}`;
    const current = this.httpDurations.get(durKey) ?? { totalTime: 0, count: 0 };
    current.totalTime += durationMs / 1000;
    current.count += 1;
    this.httpDurations.set(durKey, current);
  }

  public recordAuthFailure(): void {
    this.authLoginFailures += 1;
  }

  public recordUploadFailure(): void {
    this.uploadsFailed += 1;
  }

  public recordSheetsOperation(status: 'COMPLETED' | 'FAILED' | 'PENDING'): void {
    this.sheetsOperations.set(status, (this.sheetsOperations.get(status) ?? 0) + 1);
  }

  public recordCircuitBreakerState(name: string, state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'): void {
    this.circuitBreakers.set(name, state);
  }

  public async getSnapshot(prisma?: PrismaClient): Promise<MetricsData> {
    const ordersByStatus: Record<string, number> = {};
    let outboxEventsPendingTotal = 0;
    let outboxOldestEventAgeSeconds = 0;

    if (prisma) {
      try {
        const orderCounts = await prisma.order.groupBy({
          by: ['status'],
          _count: { status: true },
        });
        for (const item of orderCounts) {
          ordersByStatus[item.status] = item._count.status;
        }

        const pendingOutbox = await prisma.sheetSyncOperation.findMany({
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        });
        outboxEventsPendingTotal = pendingOutbox.length;
        if (pendingOutbox.length > 0 && pendingOutbox[0]?.createdAt) {
          const oldestAgeMs = Date.now() - new Date(pendingOutbox[0].createdAt).getTime();
          outboxOldestEventAgeSeconds = Math.max(0, Math.floor(oldestAgeMs / 1000));
        }
      } catch {
        // Fallback gracefully if db unreachable
      }
    }

    const httpRequestsTotal: Record<string, number> = {};
    for (const [k, v] of this.httpRequests.entries()) {
      httpRequestsTotal[k] = v;
    }

    const httpRequestDurationSeconds: Record<string, number> = {};
    for (const [k, v] of this.httpDurations.entries()) {
      httpRequestDurationSeconds[k] = v.count > 0 ? Number((v.totalTime / v.count).toFixed(4)) : 0;
    }

    const sheetsOperationsTotal: Record<string, number> = {};
    for (const [k, v] of this.sheetsOperations.entries()) {
      sheetsOperationsTotal[k] = v;
    }

    const circuitBreakerState: Record<string, string> = {};
    for (const [k, v] of this.circuitBreakers.entries()) {
      circuitBreakerState[k] = v;
    }

    return {
      httpRequestsTotal,
      httpRequestDurationSeconds,
      authLoginFailuresTotal: this.authLoginFailures,
      uploadsFailedTotal: this.uploadsFailed,
      sheetsOperationsTotal,
      circuitBreakerState,
      outboxEventsPendingTotal,
      outboxOldestEventAgeSeconds,
      ordersByStatus,
    };
  }

  public async toPrometheusFormat(prisma?: PrismaClient): Promise<string> {
    const snapshot = await this.getSnapshot(prisma);
    const lines: string[] = [];

    lines.push('# HELP http_requests_total Total number of HTTP requests processed');
    lines.push('# TYPE http_requests_total counter');
    for (const [key, count] of Object.entries(snapshot.httpRequestsTotal)) {
      const [method, route, status] = key.split(':');
      lines.push(
        `http_requests_total{method="${method}",path="${route}",status="${status}"} ${count}`,
      );
    }

    lines.push('# HELP http_request_duration_seconds Average latency of HTTP requests in seconds');
    lines.push('# TYPE http_request_duration_seconds gauge');
    for (const [key, avg] of Object.entries(snapshot.httpRequestDurationSeconds)) {
      const [method, route] = key.split(':');
      lines.push(`http_request_duration_seconds{method="${method}",path="${route}"} ${avg}`);
    }

    lines.push('# HELP auth_login_failures_total Total number of failed login attempts');
    lines.push('# TYPE auth_login_failures_total counter');
    lines.push(`auth_login_failures_total ${snapshot.authLoginFailuresTotal}`);

    lines.push('# HELP uploads_failed_total Total number of failed evidence or signature uploads');
    lines.push('# TYPE uploads_failed_total counter');
    lines.push(`uploads_failed_total ${snapshot.uploadsFailedTotal}`);

    lines.push('# HELP sheets_operations_total Total Google Sheets sync operations by status');
    lines.push('# TYPE sheets_operations_total counter');
    for (const [status, count] of Object.entries(snapshot.sheetsOperationsTotal)) {
      lines.push(`sheets_operations_total{status="${status}"} ${count}`);
    }

    lines.push('# HELP outbox_events_pending_total Pending outbox sync events');
    lines.push('# TYPE outbox_events_pending_total gauge');
    lines.push(`outbox_events_pending_total ${snapshot.outboxEventsPendingTotal}`);

    lines.push('# HELP outbox_oldest_event_age_seconds Age of oldest pending outbox event');
    lines.push('# TYPE outbox_oldest_event_age_seconds gauge');
    lines.push(`outbox_oldest_event_age_seconds ${snapshot.outboxOldestEventAgeSeconds}`);

    lines.push('# HELP orders_by_status Current count of orders by status');
    lines.push('# TYPE orders_by_status gauge');
    for (const [status, count] of Object.entries(snapshot.ordersByStatus)) {
      lines.push(`orders_by_status{status="${status}"} ${count}`);
    }

    return lines.join('\n') + '\n';
  }

  private normalizePath(path: string): string {
    // Replace UUIDs and numerical IDs with placeholders
    return path
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      .replace(/\/\d+/g, '/:id');
  }

  public reset(): void {
    this.httpRequests.clear();
    this.httpDurations.clear();
    this.authLoginFailures = 0;
    this.uploadsFailed = 0;
    this.sheetsOperations.clear();
    this.circuitBreakers.clear();
  }
}

export const metrics = MetricsService.getInstance();

export function metricsMiddleware(request: Request, response: Response, next: NextFunction): void {
  const start = Date.now();
  response.on('finish', () => {
    const duration = Date.now() - start;
    metrics.recordHttpRequest(
      request.method,
      request.baseUrl + request.path,
      response.statusCode,
      duration,
    );
  });
  next();
}
