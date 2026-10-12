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

// Al agregar una acción de auditoría, agrega también aquí su título en español.
const AUDIT_ACTION_LABELS: Record<string, string> = {
  AUTH_LOGIN: 'Inicio de sesión',
  CHECKLIST_SAVED: 'Lista de verificación guardada',
  DISCREPANCY_REPORTED: 'Discrepancia reportada',
  EQUIPMENT_ASSIGNED: 'Equipo asignado',
  EQUIPMENT_REMOVED: 'Equipo retirado',
  EQUIPMENT_VERIFIED: 'Equipo verificado',
  EXECUTION_NOTES_UPDATED: 'Notas de ejecución actualizadas',
  FAILED_APPOINTMENT_CANCELLED: 'Cita fallida cancelada',
  FAILED_APPOINTMENT_RESCHEDULED: 'Cita fallida reprogramada',
  ORDER_ASSIGNED: 'Orden asignada',
  ORDER_CANCELLED: 'Orden cancelada',
  ORDER_COMPLETED: 'Orden completada',
  ORDER_CORRECTION_REQUESTED: 'Corrección solicitada',
  ORDER_CREATED: 'Orden creada',
  ORDER_CREATED_FROM_FAILED_APPOINTMENT: 'Orden creada por cita fallida',
  ORDER_FAILED_APPOINTMENT: 'Orden marcada como cita fallida',
  ORDER_PRICING_ADJUSTED: 'Precio de la orden ajustado',
  ORDER_PRICING_CONFIGURED: 'Precio de la orden configurado',
  ORDER_STARTED: 'Orden iniciada',
  ORDER_UPDATED: 'Orden actualizada',
  SERVICE_ORDER_REPORT_DOWNLOADED: 'Reporte de servicio descargado',
  SERVICE_ORDER_REPORT_EMAIL_ATTEMPTED: 'Intento de envío del reporte por correo',
  SERVICE_ORDER_REPORT_EMAIL_FAILED: 'Gmail no confirmó el envío del reporte',
  SERVICE_ORDER_REPORT_EMAIL_SENT: 'Reporte de servicio aceptado por Gmail',
  SERVICE_ORDER_REPORT_FAILED: 'Error al generar el reporte de servicio',
  SERVICE_ORDER_REPORT_GENERATED: 'Reporte de servicio generado',
  SERVICE_ORDER_REPORT_REQUESTED: 'Reporte de servicio solicitado',
  SERVICE_ORDER_REPORT_RETRIED: 'Generación del reporte reintentada',
  SHARED_TECHNICIAN_ACCOUNT_CHANGED: 'Cuenta de técnico compartida actualizada',
  SHARED_TECHNICIAN_ORDER_ENABLED: 'Acceso compartido a la orden habilitado',
  TECHNICIAN_CREATED: 'Técnico creado',
  TECHNICIANS_SYNCED_FROM_SHEETS: 'Técnicos sincronizados desde la hoja de cálculo',
  TECHNICIAN_UPDATED: 'Técnico actualizado',
  TECHNICAL_REPORT_SYNC_SCHEDULE_UPDATED: 'Horario de sincronización del reporte actualizado',
  UNIT_ADDED: 'Unidad agregada',
  UNIT_CREATED: 'Unidad creada',
  UNIT_DELETED: 'Unidad eliminada',
  UNIT_UPDATED: 'Unidad actualizada',
  USER_CREATED: 'Usuario creado',
  USER_UPDATED: 'Usuario actualizado',
};

export function formatAuditAction(action?: string | null): string {
  if (!action) return 'Evento de auditoría';
  return AUDIT_ACTION_LABELS[action] ?? action.replaceAll('_', ' ').toLocaleLowerCase('es-MX');
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
