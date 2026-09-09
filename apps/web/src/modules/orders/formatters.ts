export function formatOrderStatus(status?: string | null): string {
  switch (status) {
    case 'DRAFT':
      return 'Borrador';
    case 'ASSIGNED':
      return 'Asignada';
    case 'IN_PROGRESS':
      return 'En Progreso';
    case 'REQUIRES_CORRECTION':
      return 'Requiere Corrección';
    case 'COMPLETED':
      return 'Completada';
    case 'FAILED_APPOINTMENT':
      return 'Cita Fallida';
    case 'CANCELLED':
      return 'Cancelada';
    default:
      return status || '';
  }
}

export function orderStatusTagType(
  status?: string | null,
): 'default' | 'info' | 'warning' | 'success' | 'error' {
  switch (status) {
    case 'DRAFT':
      return 'default';
    case 'ASSIGNED':
      return 'info';
    case 'IN_PROGRESS':
    case 'REQUIRES_CORRECTION':
      return 'warning';
    case 'COMPLETED':
      return 'success';
    case 'FAILED_APPOINTMENT':
    case 'CANCELLED':
      return 'error';
    default:
      return 'default';
  }
}

export function formatUnitStatus(status?: string | null): string {
  switch (status) {
    case 'PENDING':
      return 'Pendiente';
    case 'IN_PROGRESS':
      return 'En Progreso';
    case 'COMPLETED':
      return 'Completada';
    default:
      return status || '';
  }
}

export function unitStatusTagType(
  status?: string | null,
): 'default' | 'info' | 'warning' | 'success' | 'error' {
  switch (status) {
    case 'PENDING':
      return 'default';
    case 'IN_PROGRESS':
      return 'warning';
    case 'COMPLETED':
      return 'success';
    default:
      return 'default';
  }
}

export function formatEquipmentStatus(status?: string | null): string {
  switch (status) {
    case 'MATCHED':
      return 'Coincidente';
    case 'DISCREPANCY_REPORTED':
      return 'Discrepancia';
    case 'PENDING':
    default:
      return 'Pendiente';
  }
}

export function equipmentStatusTagType(
  status?: string | null,
): 'default' | 'info' | 'warning' | 'success' | 'error' {
  switch (status) {
    case 'MATCHED':
      return 'success';
    case 'DISCREPANCY_REPORTED':
      return 'warning';
    case 'PENDING':
    default:
      return 'default';
  }
}

export const CATEGORY_NAMES: Record<string, string> = {
  DASHBOARD: 'Tablero e Instrumentos',
  WINDOWS: 'Vidrios y Cristales',
  ACCESSORIES: 'Accesorios y Conectores',
  TRIMS: 'Molduras y Tapicería',
  BODYWORK: 'Carrocería y Exteriores',
};
export { formatOrderServiceType as formatServiceType } from '@puk/contracts';
