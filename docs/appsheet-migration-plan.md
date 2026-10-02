# Plan de Piloto y Migración desde AppSheet

Este plan establece la estrategia de transición gradual desde la aplicación legacy en AppSheet hacia el nuevo sistema web y PWA de Bull Dog Solution conforme a la Fase 14 del roadmap.

> **Estado (2026-10-02):** este archivo conserva el plan propuesto, no evidencia de que el piloto,
> cutover o retiro de AppSheet hayan ocurrido. El código del producto está implementado, pero AWS
> staging está eliminado y producción no está desplegada. Cualquier cambio operativo debe planificarse
> y verificarse de nuevo con Operaciones antes de tratar una etapa como completada.

## 1. Inventario del Sistema Legacy

- **Usuarios y Roles:**
  - Administradores de operaciones (creación de órdenes, asignación de técnicos, validación de evidencia y sincronización).
  - Técnicos de campo (ejecución de servicio, verificación de equipos, captura de checklist, fotografías y firmas).
- **Catálogos y Hojas de Cálculo:**
  - Pestaña `Clientes`: catálogo maestro de clientes (`IDCliente`, `Cliente`).
  - Pestaña `SALIDAS`: registro de equipos instalados, retirados o revisados con columnas `(ID, IMEI)`.
- **Estados Operativos Mapeados:**
  - `Borrador` -> `DRAFT`
  - `Asignada` -> `ASSIGNED`
  - `En Progreso` -> `IN_PROGRESS`
  - `Completada / Para Revisión` -> `COMPLETED`
  - `Corrección Requerida` -> `REQUIRES_CORRECTION`
  - `Cancelada` -> `CANCELLED`
  - `Cita Fallida` -> `FAILED_APPOINTMENT`

## 2. Carga Inicial de Datos y Técnicos

1. **Usuarios Administradores:** Creación inicial de cuentas con contraseñas seguras y verificación de perfil `ADMIN`.
2. **Directorio de Técnicos:** Registro de técnicos en la tabla `Technician` y vinculación uno a uno con sus correspondientes registros de usuario `User` con rol `TECHNICIAN`.
3. **Cuentas de Acceso:** Entrega segura de credenciales temporales solicitando cambio en primer inicio.

## 3. Propuesta de políticas de retención (requiere aprobación)

- **Fotografías de Servicio:** Se propuso una retención mínima operativa de 12 meses en el proveedor privado de archivos. No está aprobada; archivado y borrado deben ajustarse a los requisitos legales y contractuales.
- **Firmas Digitales y Nombres de Receptores:** Se propuso conservación indefinida asociada a la orden y auditoría. No está aprobada ni configurada como política automática.

## 4. Ejecución del Piloto en Paralelo

1. **Grupo Piloto:** Selección de 2 administradores y un subconjunto de 3 a 5 técnicos de campo.
2. **Operación en Paralelo:**
   - Durante 2 semanas, el grupo piloto registrará órdenes reales en el nuevo sistema mientras se mantiene la continuidad operativa.
   - Verificación de consistencia entre las actualizaciones reflejadas en Google Sheets y los registros locales.
3. **Puntos de Validación Diaria:**
   - Comprobación de errores de sincronización en la pestaña de `Sincronización Sheets`.
   - Validación de la calidad de fotografías tomadas en campo desde dispositivos móviles.
   - Detección de posibles desconexiones o dificultades de captura de firma.

## 5. Procedimiento de Corte Operativo (Cutover)

1. **Congelamiento de Altas en AppSheet:**
   - Fecha y hora pactadas con la dirección de operaciones.
   - Restricción de permisos en AppSheet a modo solo lectura (`read-only`).
2. **Conmutación Operativa:**
   - Todas las nuevas órdenes de servicio se crean y gestionan exclusivamente a través de Bull Dog Solution.
   - Monitoreo activo de la cola outbox y métricas operativas (`/metrics`).
3. **Estabilización:**
   - Periodo de hiper-cuidado de 10 días hábiles con soporte directo a técnicos y administradores.
   - Retiro formal y desmantelamiento de la aplicación AppSheet tras cumplir satisfactoriamente los criterios de salida del MVP.
