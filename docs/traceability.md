# Matriz de trazabilidad del MVP

La columna de pruebas identifica el nivel mínimo que debe existir antes de cerrar la fase correspondiente.

> Esta matriz es el contrato de aceptación del MVP, no el catálogo vigente de rutas. Las rutas son
> relativas a `/api/v1` y los endpoints de ejecución/archivos evolucionaron para soportar Drive;
> consulta el [catálogo HTTP actual](./technical/api.md). Estado de implementación revisado
> 2026-10-02: las capacidades principales están implementadas, pero staging AWS está eliminado y
> no hay despliegue de producción.

| Regla o capacidad                   | Endpoints previstos                                           | Evidencia de aceptación                                                           |
| ----------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Sesión y rotación segura            | `POST /auth/login`, `/auth/refresh`, `/auth/logout`           | Integración: login genérico, rotación, reutilización y revocación                 |
| Usuarios y técnicos administrativos | `/users`, `/technicians`                                      | Integración: capacidades por rol y auditoría                                      |
| Catálogo de clientes                | `GET /external-clients`                                       | Adaptador simulado: normalización, caché y refresco                               |
| Catálogo e identidad de equipos     | `GET /external-equipment`, `POST /external-equipment/refresh` | Duplicados, filas movidas, `PENDIENTE`, `N/A` e incompletos                       |
| Borradores, unidades y equipos      | `/orders`, `/orders/:id/units`, `/units/:id/equipment`        | Integración: varias unidades/equipos, serie única y propiedad                     |
| Concurrencia optimista              | `PATCH /orders/:id`                                           | Dos ediciones con la misma versión; la segunda recibe `409`                       |
| Asignación y Sheets                 | `POST /orders/:id/assign`                                     | Contrato: revalidación, columnas permitidas, conflicto e idempotencia             |
| Outbox y reintento                  | `/orders/:id/sync`, `/sync`, `/sync/:id/retry`                | Integración: fallo visible, backoff y ausencia de duplicados                      |
| Corte semanal del reporte técnico   | `/sync/schedule`                                              | Unidad: corte, siguiente semana, zona horaria y reprogramación                    |
| Trabajo del técnico                 | `/me/orders`, `/orders/:id/start`                             | Autorización entre dos técnicos y transiciones inválidas                          |
| Verificación y discrepancias        | `/order-equipment/:id/verify`, `/orders/:id/discrepancies`    | Discrepancia no bloquea cierre; usuario ajeno recibe denegación                   |
| Checklist por unidad                | `/units/:id/checklist`                                        | Cinco categorías; observación obligatoria en `BAD`                                |
| Evidencias privadas                 | `POST /orders/:id/units/:unitId/evidence/file`, `GET /evidence/:id/file` | MIME, tamaño, objeto inexistente, propiedad y descarga autenticada                |
| Notas de ejecución                  | `PATCH /orders/:id/execution-notes`                           | Nota general por orden, máximo 5000 caracteres y auditoría                        |
| Firma de orden                      | `/orders/:id/signature`                                       | Nombre obligatorio, PNG privado y autorización                                    |
| Cierre normal                       | `POST /orders/:id/complete`                                   | Integración: todos los requisitos e idempotencia                                  |
| Cita fallida                        | `POST /orders/:id/fail-appointment`                           | Solo motivo obligatorio; no exige checklist, fotos ni firma                       |
| Resolución de cita fallida          | `POST /orders/:id/cancel`, `POST /orders/:id/reschedule`      | Cancelación preserva el cierre; reprogramación crea un borrador único             |
| Reporte PDF de orden de servicio    | `/orders/:id/report`, `/orders/:id/reports`                   | Contrato, autorización, versionado y regresión visual del PDF                     |
| Corrección y cancelación            | `/orders/:id/request-correction`, `/orders/:id/cancel`        | Matriz de estados, inmutabilidad y auditoría                                      |
| Tarifas acordadas y liquidación     | `PATCH /orders/:id/pricing`                                   | Unidad e integración: cálculo decimal puro, auditoría y reporte Sheets multilínea |
| Acceso compartido de técnico        | `/shared-technician-access`, `/me/order-access`               | Cuenta TECHNICIAN designada, una orden habilitada, revisión optimista y auditoría  |
| Administración de cuentas admin    | `GET/POST/PATCH /users`                                       | Capacidad `users:manage`, límites de auto-bloqueo/último admin y auditoría         |
| Salud y formato HTTP                | `/health/live`, `/health/ready`                               | Supertest y contrato OpenAPI con `requestId`                                      |
