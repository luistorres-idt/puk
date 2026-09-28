# API HTTP

## Convenciones

- Base autenticada: `/api/v1`.
- Cuerpo: JSON, excepto las cargas de archivos del proveedor configurado.
- Validación: esquemas Valibot de `@puk/contracts`.
- Éxito: `{ "data": ..., "meta": { "requestId": ... } }`.
- Error: `{ "error": { "code": ..., "message": ..., "details"?: ... }, "meta": { "requestId": ... } }`.
- Fechas: ISO 8601 en UTC por HTTP; la presentación local pertenece al cliente/reporte.
- Documentación interactiva: `/docs`.

## Autenticación y autorización

El access token se envía como `Authorization: Bearer <token>`. El refresh token se guarda en la cookie HTTP-only `puk_refresh`. El JWT prueba la identidad, pero cada request protegido resuelve desde PostgreSQL que el usuario siga activo y cuál es su rol vigente. Un usuario inexistente o inactivo recibe `401 SESSION_REVOKED`; si no puede consultarse la autoridad vigente, la API falla cerrada con `503 AUTHORITY_UNAVAILABLE`. Los roles son `ADMIN` y `TECHNICIAN`; además de capacidades, los servicios verifican que el técnico sea propietario de la orden.

## Endpoints

### Salud y observabilidad

| Método | Ruta              | Acceso          | Uso                   |
| ------ | ----------------- | --------------- | --------------------- |
| GET    | `/health/live`    | Público         | proceso disponible    |
| GET    | `/health/ready`   | Público         | conexión a PostgreSQL |
| GET    | `/metrics`        | Infraestructura | formato Prometheus    |
| GET    | `/health/metrics` | Infraestructura | snapshot JSON         |

### Sesión

| Método | Ruta                      | Acceso           | Uso                        |
| ------ | ------------------------- | ---------------- | -------------------------- |
| POST   | `/api/v1/auth/login`      | Público limitado | iniciar sesión             |
| POST   | `/api/v1/auth/refresh`    | Cookie           | rotar tokens               |
| POST   | `/api/v1/auth/logout`     | Cookie           | cerrar sesión actual       |
| POST   | `/api/v1/auth/logout-all` | Autenticado      | revocar todas las sesiones |
| GET    | `/api/v1/auth/me`         | Autenticado      | usuario actual             |

### Administración y catálogos

| Método   | Ruta                                      | Acceso        |
| -------- | ----------------------------------------- | ------------- |
| GET/POST | `/api/v1/users`                           | Administrador |
| PATCH    | `/api/v1/users/:id`                       | Administrador |
| GET/POST | `/api/v1/technicians`                     | Administrador |
| PATCH    | `/api/v1/technicians/:id`                 | Administrador |
| GET      | `/api/v1/technicians/selectable`          | Administrador |
| POST     | `/api/v1/technicians/sync`                | Administrador |
| GET      | `/api/v1/external/clients`                | Autenticado   |
| GET      | `/api/v1/external/equipment`              | Autenticado   |
| GET      | `/api/v1/external/equipment/:externalKey` | Autenticado   |
| POST     | `/api/v1/external/refresh`                | Administrador |

### Órdenes, unidades y equipos

`POST /api/v1/orders` requiere `technicianId` con UUID de un técnico activo.
`PATCH` permite sustituirlo por otro técnico activo, pero no enviarlo como `null`.
`GET /api/v1/technicians/selectable` sincroniza periódicamente `DIRECTORIO TECNICO`,
devuelve técnicos activos con UUID, clave externa, nombre, taller, ciudad, estado y teléfono,
y acepta `?fresh=true` para forzar una recarga. Si Sheets falla, utiliza el último directorio
local disponible. `POST /api/v1/technicians/sync` permite la sincronización administrativa.

Las altas de unidades y equipos se permiten en cualquier orden `DRAFT`. Cada unidad puede declarar
su propio `serviceType`, por lo que una orden puede combinar instalación, revisión, desinstalación,
sensor fuel y cambio de equipo. `FAILED_APPOINTMENT` es un resultado de ejecución y no un bloque
configurable en el asistente. El listado acepta los seis valores del dominio como filtro.

| Método       | Ruta                                                      | Acceso / propósito                               |
| ------------ | --------------------------------------------------------- | ------------------------------------------------ |
| GET/POST     | `/api/v1/orders`                                          | listar propias/todas; crear como administrador   |
| GET/PATCH    | `/api/v1/orders/:id`                                      | detalle administrativo explícito; editar         |
| GET          | `/api/v1/orders/:id/execution`                            | detalle operativo mínimo para ejecutar           |
| POST         | `/api/v1/orders/:id/assign`                               | asignar y encolar sincronización inicial         |
| POST         | `/api/v1/orders/:id/cancel`                               | cancelar                                         |
| POST         | `/api/v1/orders/:id/reschedule`                           | reprogramar una cita fallida como nuevo borrador |
| GET          | `/api/v1/orders/:id/audit`                                | auditoría administrativa                         |
| POST         | `/api/v1/orders/:id/units`                                | agregar unidad                                   |
| PATCH/DELETE | `/api/v1/orders/:id/units/:unitId`                        | modificar/eliminar unidad                        |
| POST         | `/api/v1/orders/:id/units/:unitId/equipment`              | asignar equipo                                   |
| DELETE       | `/api/v1/orders/:id/units/:unitId/equipment/:equipmentId` | retirar equipo                                   |
| GET          | `/api/v1/orders/:id/sync`                                 | estado de sincronización                         |
| POST         | `/api/v1/orders/:id/sync/retry`                           | reintento administrativo                         |

### Ejecución técnica

`GET /api/v1/orders/:id/execution` es el único detalle consumido por la vista técnica. Su respuesta
omite datos fiscales y de contacto del técnico, tarifas, creador, auditoría y operaciones de
sincronización. `GET /api/v1/orders/:id` queda reservado al administrador y también usa una
proyección de respuesta explícita.

| Método | Ruta                                                                    | Propósito                 |
| ------ | ----------------------------------------------------------------------- | ------------------------- |
| GET    | `/api/v1/orders/:id/execution`                                          | cargar detalle operativo  |
| POST   | `/api/v1/orders/:id/start`                                              | iniciar trabajo           |
| POST   | `/api/v1/orders/:id/units/:unitId/equipment/:equipmentId/verify`        | verificar equipo          |
| POST   | `/api/v1/orders/:id/units/:unitId/equipment/:equipmentId/discrepancy`   | reportar diferencia       |
| PUT    | `/api/v1/orders/:id/units/:unitId/checklist`                            | guardar checklist         |
| POST   | `/api/v1/orders/:id/units/:unitId/checklist/:category/evidence/presign` | preparar foto             |
| POST   | `/api/v1/evidence/:id/complete`                                         | confirmar foto            |
| DELETE | `/api/v1/evidence/:id`                                                  | eliminar lógicamente foto |
| GET    | `/api/v1/evidence/:id/url`                                              | URL temporal de foto      |
| POST   | `/api/v1/orders/:id/signature/presign`                                  | preparar firma            |
| POST   | `/api/v1/orders/:id/signature/complete?objectKey=...`                   | confirmar firma           |
| GET    | `/api/v1/orders/:id/signature/url`                                      | URL temporal de firma     |
| GET    | `/api/v1/orders/:id/completeness`                                       | requisitos pendientes     |
| PATCH  | `/api/v1/orders/:id/execution-notes`                                   | guardar nota general de ejecución |
| POST   | `/api/v1/orders/:id/complete`                                           | completar orden           |
| POST   | `/api/v1/orders/:id/fail-appointment`                                   | registrar cita fallida    |
| POST   | `/api/v1/orders/:id/require-correction`                                 | solicitar corrección      |

La nota de ejecución pertenece a la orden completa, no a una unidad individual. El endpoint permite
guardarla durante `IN_PROGRESS`; la vista también la guarda automáticamente antes de solicitar el
cierre cuando existen cambios pendientes.

Al completar una orden se congelan el precio y su desglose por servicio, se encola nuevamente el
estado final de cada equipo en `SALIDAS` y se publica el renglón del reporte técnico. Estas tareas
remotas son idempotentes y no revierten el cierre si Google Sheets está temporalmente indisponible.

### Reportes

| Método | Ruta                                 | Acceso / propósito                    |
| ------ | ------------------------------------ | ------------------------------------- |
| GET    | `/api/v1/orders/:id/report`          | metadatos de versión vigente          |
| GET    | `/api/v1/orders/:id/reports`         | historial de versiones                |
| POST   | `/api/v1/orders/:id/report/generate` | generar/reintentar como administrador |
| GET    | `/api/v1/orders/:id/report/download` | URL privada temporal                  |

### Monitoreo de sincronización

Los siguientes endpoints requieren rol administrador:

| Método | Ruta                     | Propósito                                      |
| ------ | ------------------------ | ---------------------------------------------- |
| GET    | `/api/v1/sync`           | Listar y filtrar operaciones globales          |
| GET    | `/api/v1/sync/schedule`  | Consultar corte, horario y siguiente ejecución |
| PUT    | `/api/v1/sync/schedule`  | Actualizar la programación semanal             |
| POST   | `/api/v1/sync/:id/retry` | Sincronizar inmediatamente una operación       |

## Contrato y compatibilidad

Los DTOs de escritura deben añadirse primero a `packages/contracts`. Los cambios incompatibles requieren una nueva versión de ruta o una migración coordinada de web y API. OpenAPI se genera/valida con `pnpm docs:build` y `pnpm docs:validate`; actualmente documenta la superficie principal, pero los routers son la lista exhaustiva.
