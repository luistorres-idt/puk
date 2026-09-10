# API HTTP

## Convenciones

- Base autenticada: `/api/v1`.
- Cuerpo: JSON, excepto las cargas directas a S3.
- Validación: esquemas Valibot de `@puk/contracts`.
- Éxito: `{ "data": ..., "meta": { "requestId": ... } }`.
- Error: `{ "error": { "code": ..., "message": ..., "details"?: ... }, "meta": { "requestId": ... } }`.
- Fechas: ISO 8601 en UTC por HTTP; la presentación local pertenece al cliente/reporte.
- Documentación interactiva: `/docs`.

## Autenticación y autorización

El access token se envía como `Authorization: Bearer <token>`. El refresh token se guarda en la cookie HTTP-only `puk_refresh`. Los roles son `ADMIN` y `TECHNICIAN`; además de capacidades, los servicios verifican que el técnico sea propietario de la orden.

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
| GET      | `/api/v1/external/clients`                | Autenticado   |
| GET      | `/api/v1/external/equipment`              | Autenticado   |
| GET      | `/api/v1/external/equipment/:externalKey` | Autenticado   |
| POST     | `/api/v1/external/refresh`                | Administrador |

### Órdenes, unidades y equipos

`POST /api/v1/orders` requiere `technicianId` con UUID de un técnico activo.
`PATCH` permite sustituirlo por otro técnico activo, pero no enviarlo como `null`.
`GET /api/v1/technicians/selectable` devuelve solo UUID, nombre, taller y ciudad de
técnicos activos locales; la integración del directorio de Sheets está pendiente.

Las altas posteriores de unidades/equipos solo admiten borradores de instalación;
los demás servicios reciben `ORDER_ADDITIONS_NOT_ALLOWED`. La configuración inicial
de revisión y desinstalación se envía anidada en `POST /orders`.
El listado acepta `serviceType` para los seis valores del dominio. La creación y
asignación de `FUEL_SENSOR` y `EQUIPMENT_REPLACEMENT` se rechazan temporalmente con
`SERVICE_CONFIGURATION_UNAVAILABLE` hasta aprobar su flujo funcional.

| Método       | Ruta                                                      | Acceso / propósito                             |
| ------------ | --------------------------------------------------------- | ---------------------------------------------- |
| GET/POST     | `/api/v1/orders`                                          | listar propias/todas; crear como administrador |
| GET/PATCH    | `/api/v1/orders/:id`                                      | consultar; editar como administrador           |
| POST         | `/api/v1/orders/:id/assign`                               | asignar y encolar sincronización               |
| POST         | `/api/v1/orders/:id/cancel`                               | cancelar                                       |
| GET          | `/api/v1/orders/:id/audit`                                | auditoría administrativa                       |
| POST         | `/api/v1/orders/:id/units`                                | agregar unidad                                 |
| PATCH/DELETE | `/api/v1/orders/:id/units/:unitId`                        | modificar/eliminar unidad                      |
| POST         | `/api/v1/orders/:id/units/:unitId/equipment`              | asignar equipo                                 |
| DELETE       | `/api/v1/orders/:id/units/:unitId/equipment/:equipmentId` | retirar equipo                                 |
| GET          | `/api/v1/orders/:id/sync`                                 | estado de sincronización                       |
| POST         | `/api/v1/orders/:id/sync/retry`                           | reintento administrativo                       |

### Ejecución técnica

| Método | Ruta                                                                    | Propósito                 |
| ------ | ----------------------------------------------------------------------- | ------------------------- |
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
| POST   | `/api/v1/orders/:id/complete`                                           | completar orden           |
| POST   | `/api/v1/orders/:id/fail-appointment`                                   | registrar cita fallida    |
| POST   | `/api/v1/orders/:id/require-correction`                                 | solicitar corrección      |

### Reportes

| Método | Ruta                                 | Acceso / propósito                    |
| ------ | ------------------------------------ | ------------------------------------- |
| GET    | `/api/v1/orders/:id/report`          | metadatos de versión vigente          |
| GET    | `/api/v1/orders/:id/reports`         | historial de versiones                |
| POST   | `/api/v1/orders/:id/report/generate` | generar/reintentar como administrador |
| GET    | `/api/v1/orders/:id/report/download` | URL privada temporal                  |

## Contrato y compatibilidad

Los DTOs de escritura deben añadirse primero a `packages/contracts`. Los cambios incompatibles requieren una nueva versión de ruta o una migración coordinada de web y API. OpenAPI se genera/valida con `pnpm docs:build` y `pnpm docs:validate`; actualmente documenta la superficie principal, pero los routers son la lista exhaustiva.
