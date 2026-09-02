# Matriz de trazabilidad del MVP

La columna de pruebas identifica el nivel mínimo que debe existir antes de cerrar la fase correspondiente.

| Regla o capacidad                   | Endpoints previstos                                           | Evidencia de aceptación                                               |
| ----------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| Sesión y rotación segura            | `POST /auth/login`, `/auth/refresh`, `/auth/logout`           | Integración: login genérico, rotación, reutilización y revocación     |
| Usuarios y técnicos administrativos | `/users`, `/technicians`                                      | Integración: capacidades por rol y auditoría                          |
| Catálogo de clientes                | `GET /external-clients`                                       | Adaptador simulado: normalización, caché y refresco                   |
| Catálogo e identidad de equipos     | `GET /external-equipment`, `POST /external-equipment/refresh` | Duplicados, filas movidas, `PENDIENTE`, `N/A` e incompletos           |
| Borradores, unidades y equipos      | `/orders`, `/orders/:id/units`, `/units/:id/equipment`        | Integración: varias unidades/equipos, serie única y propiedad         |
| Concurrencia optimista              | `PATCH /orders/:id`                                           | Dos ediciones con la misma versión; la segunda recibe `409`           |
| Asignación y Sheets                 | `POST /orders/:id/assign`                                     | Contrato: revalidación, columnas permitidas, conflicto e idempotencia |
| Outbox y reintento                  | `/orders/:id/sync-operations`                                 | Integración: fallo visible, backoff y ausencia de duplicados          |
| Trabajo del técnico                 | `/me/orders`, `/orders/:id/start`                             | Autorización entre dos técnicos y transiciones inválidas              |
| Verificación y discrepancias        | `/order-equipment/:id/verify`, `/orders/:id/discrepancies`    | Discrepancia no bloquea cierre; usuario ajeno recibe denegación       |
| Checklist por unidad                | `/units/:id/checklist`                                        | Cinco categorías; observación obligatoria en `BAD`                    |
| Evidencias privadas                 | `/units/:id/evidence`, `/evidence/:id/complete`               | MIME, tamaño, objeto inexistente, propiedad y URL temporal            |
| Firma de orden                      | `/orders/:id/signature`                                       | Nombre obligatorio, PNG privado y autorización                        |
| Cierre normal                       | `POST /orders/:id/complete`                                   | Integración: todos los requisitos e idempotencia                      |
| Cita fallida                        | `POST /orders/:id/fail-appointment`                           | Solo motivo obligatorio; no exige checklist, fotos ni firma           |
| Corrección y cancelación            | `/orders/:id/request-correction`, `/orders/:id/cancel`        | Matriz de estados, inmutabilidad y auditoría                          |
| Salud y formato HTTP                | `/health/live`, `/health/ready`                               | Supertest y contrato OpenAPI con `requestId`                          |
