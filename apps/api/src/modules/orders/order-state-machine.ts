import { canAddOrderItems, isServiceConfigurationSupported } from '@puk/contracts';
import { OrderStatus, type OrderServiceType } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors.js';

/**
 * Valid order status transitions according to product specifications:
 *
 * DRAFT -> ASSIGNED -> IN_PROGRESS -> COMPLETED
 *                   -> REQUIRES_CORRECTION -> IN_PROGRESS | ASSIGNED
 *        -> CANCELLED
 *
 * ASSIGNED -> FAILED_APPOINTMENT
 * IN_PROGRESS -> FAILED_APPOINTMENT
 * IN_PROGRESS / COMPLETED -> REQUIRES_CORRECTION
 */
const ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  [OrderStatus.DRAFT]: [OrderStatus.ASSIGNED, OrderStatus.CANCELLED],
  [OrderStatus.ASSIGNED]: [
    OrderStatus.IN_PROGRESS,
    OrderStatus.FAILED_APPOINTMENT,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.IN_PROGRESS]: [
    OrderStatus.COMPLETED,
    OrderStatus.REQUIRES_CORRECTION,
    OrderStatus.FAILED_APPOINTMENT,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.REQUIRES_CORRECTION]: [
    OrderStatus.IN_PROGRESS,
    OrderStatus.ASSIGNED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.COMPLETED]: [OrderStatus.REQUIRES_CORRECTION],
  [OrderStatus.FAILED_APPOINTMENT]: [],
  [OrderStatus.CANCELLED]: [],
};

export function canTransitionOrder(currentStatus: OrderStatus, targetStatus: OrderStatus): boolean {
  if (currentStatus === targetStatus) {
    return true;
  }
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  return allowed.includes(targetStatus);
}

export function assertValidOrderTransition(
  currentStatus: OrderStatus,
  targetStatus: OrderStatus,
  customMessage?: string,
): void {
  if (!canTransitionOrder(currentStatus, targetStatus)) {
    throw new AppError(
      400,
      'INVALID_ORDER_STATE',
      customMessage ??
        `No se puede cambiar el estado de la orden de ${currentStatus} a ${targetStatus}`,
      { currentStatus, targetStatus },
    );
  }
}

export function assertCanEditOrder(status: OrderStatus): void {
  if (status !== OrderStatus.DRAFT && status !== OrderStatus.REQUIRES_CORRECTION) {
    throw new AppError(
      400,
      'INVALID_ORDER_STATE',
      'Solo se pueden editar órdenes en borrador o en corrección',
    );
  }
}

export function assertCanModifyUnits(
  status: OrderStatus,
  actionDescription = 'modificar unidades',
): void {
  if (status !== OrderStatus.DRAFT) {
    throw new AppError(
      400,
      'INVALID_ORDER_STATE',
      `Solo se pueden ${actionDescription} en órdenes en borrador`,
    );
  }
}

export function assertCanExecuteWork(
  status: OrderStatus,
  actionDescription = 'realizar esta acción',
): void {
  if (status !== OrderStatus.IN_PROGRESS) {
    throw new AppError(
      400,
      'INVALID_ORDER_STATE',
      `La orden debe estar en progreso para ${actionDescription}`,
    );
  }
}

export function assertCanAddOrderItems(order: {
  status: OrderStatus;
  serviceType?: OrderServiceType | null;
}): void {
  assertCanModifyUnits(order.status, 'agregar unidades o equipos');
  if (!canAddOrderItems(order)) {
    throw new AppError(
      400,
      'ORDER_ADDITIONS_NOT_ALLOWED',
      'Solo se pueden agregar unidades o equipos a órdenes en borrador.',
    );
  }
}

export function assertServiceConfigurationSupported(serviceType: OrderServiceType): void {
  if (!isServiceConfigurationSupported(serviceType)) {
    throw new AppError(
      400,
      'SERVICE_CONFIGURATION_UNAVAILABLE',
      'Este servicio aún no está disponible para crear o asignar órdenes.',
    );
  }
}
