# Modelo de datos

## Diagrama entidad-relación

```mermaid
erDiagram
    USER ||--o| TECHNICIAN : "perfil opcional"
    USER ||--o{ ORDER : crea
    TECHNICIAN ||--o{ ORDER : atiende
    ORDER ||--|{ ORDER_UNIT : contiene
    ORDER ||--o| SIGNATURE : recibe
    ORDER ||--o{ DISCREPANCY : registra
    ORDER ||--o{ SHEET_SYNC_OPERATION : sincroniza
    ORDER ||--o{ SERVICE_ORDER_REPORT : genera
    ORDER_UNIT ||--o{ ORDER_EQUIPMENT : equipa
    ORDER_UNIT ||--o| CHECKLIST : inspecciona
    ORDER_UNIT ||--o{ DISCREPANCY : agrupa
    CHECKLIST ||--|{ CHECKLIST_ITEM : contiene
    CHECKLIST_ITEM ||--o{ EVIDENCE : documenta
    ORDER_EQUIPMENT ||--o{ DISCREPANCY : presenta
    USER ||--o{ REFRESH_SESSION : mantiene
    USER ||--o{ AUDIT_LOG : ejecuta
    USER ||--o{ EVIDENCE : carga
    USER ||--o{ SIGNATURE : captura
    USER ||--o{ ORDER : "resuelve cita fallida"
    ORDER o|--o| ORDER : "reprograma como"

    USER {
        uuid id PK
        string email UK
        string passwordHash
        string name
        UserRole role
        uuid technicianId FK, UK
        boolean active
    }
    TECHNICIAN {
        uuid id PK
        string name
        string workshop
        string address
        string city
        string state
        string phone
        boolean active
    }
    ORDER {
        uuid id PK
        string folio UK
        OrderServiceType serviceType
        OrderStatus status
        string clientSheetId
        string clientNameSnapshot
        uuid technicianId FK
        timestamp scheduledAt
        boolean isHomeService
        string serviceAddress
        string generalNotes
        string failedReason
        FailedAppointmentResolution failedAppointmentResolution
        timestamp failedAppointmentResolvedAt
        uuid failedAppointmentResolvedById FK
        string failedAppointmentResolutionReason
        uuid rescheduledFromOrderId FK, UK
        json pricingBreakdown
        int version
        timestamp startedAt
        timestamp completedAt
    }
    ORDER_UNIT {
        uuid id PK
        uuid orderId FK
        OrderServiceType serviceType
        string label
        string makeModel
        int year
        string serialNumber
        UnitStatus status
    }
    ORDER_EQUIPMENT {
        uuid id PK
        uuid orderUnitId FK
        string externalKey
        string externalId
        string imei
        json rawSnapshot
        boolean activeAssignment
        EquipmentVerificationStatus verificationStatus
    }
    CHECKLIST {
        uuid id PK
        uuid orderUnitId FK, UK
        uuid completedById FK
        timestamp completedAt
    }
    CHECKLIST_ITEM {
        uuid id PK
        uuid checklistId FK
        ChecklistCategory category
        ChecklistCondition condition
        string notes
    }
    EVIDENCE {
        uuid id PK
        uuid checklistItemId FK
        string objectKey UK
        string mimeType
        int sizeBytes
        UploadStatus status
        timestamp deletedAt
    }
    SIGNATURE {
        uuid id PK
        uuid orderId FK, UK
        string signerName
        string objectKey UK
        timestamp signedAt
    }
    DISCREPANCY {
        uuid id PK
        uuid orderId FK
        uuid orderUnitId FK
        uuid orderEquipmentId FK
        string type
        string description
        json expectedSnapshot
        json observedSnapshot
        timestamp resolvedAt
    }
    SERVICE_ORDER_REPORT {
        uuid id PK
        uuid orderId FK
        int version
        ReportStatus status
        string objectKey UK
        int sizeBytes
        string checksum
        timestamp generatedAt
    }
    SHEET_SYNC_OPERATION {
        uuid id PK
        uuid orderId FK
        string operationType
        string idempotencyKey UK
        json payload
        SyncStatus status
        int attempts
        timestamp nextAttemptAt
    }
    REFRESH_SESSION {
        uuid id PK
        uuid userId FK
        uuid jti UK
        string tokenHash
        timestamp expiresAt
        timestamp revokedAt
    }
    AUDIT_LOG {
        uuid id PK
        uuid actorUserId FK
        string action
        string entityType
        string entityId
        json before
        json after
        timestamp createdAt
    }
```

## Agregado principal

`Order` es la raíz del agregado operativo. Conserva el cliente como snapshot y contiene unidades.
La API exige un técnico activo desde la creación; la relación en base de datos permanece nullable
para conservar órdenes históricas sin técnico. Cada unidad tiene su propio tipo de servicio y agrupa
equipos, checklist, fotografías y discrepancias, lo que permite órdenes multiservicio. La orden
conserva el precio congelado y un desglose por servicio en `pricingBreakdown`. La firma se captura
una vez por orden. Sincronizaciones y reportes son efectos versionados relacionados con la orden.

Una cita fallida permanece como resultado histórico y facturable. Su resolución administrativa se
registra mediante `FailedAppointmentResolution`: `CANCELLED` cierra el servicio y `RESCHEDULED`
crea una nueva orden enlazada mediante `rescheduledFromOrderId`. La nueva orden comienza en
`DRAFT`, copia cliente, servicio, técnico, unidades y snapshots de equipos, y reinicia todos los
datos de ejecución.

## Enumeraciones de estado

| Entidad                    | Estados                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| Orden                      | `DRAFT`, `ASSIGNED`, `IN_PROGRESS`, `REQUIRES_CORRECTION`, `COMPLETED`, `FAILED_APPOINTMENT`, `CANCELLED` |
| Unidad                     | `PENDING`, `IN_PROGRESS`, `COMPLETED`                                                                     |
| Verificación               | `PENDING`, `MATCHED`, `DISCREPANCY_REPORTED`                                                              |
| Evidencia                  | `PENDING`, `COMPLETED`, `REJECTED`, `DELETED`                                                             |
| Sincronización             | `PENDING`, `PROCESSING`, `SYNCED`, `FAILED`                                                               |
| Reporte                    | `PENDING`, `PROCESSING`, `READY`, `FAILED`                                                                |
| Resolución de cita fallida | `CANCELLED`, `RESCHEDULED`                                                                                |

## Restricciones relevantes

- `Order.folio` es único.
- Un usuario solo puede vincularse con un técnico.
- El número de serie de una unidad es único dentro de su orden.
- Solo existe un checklist y una firma por unidad/orden respectivamente.
- Cada categoría aparece una sola vez en cada checklist.
- Las claves de evidencia, firma y reporte son únicas en almacenamiento.
- El par `(orderId, version)` identifica una versión de reporte.
- `idempotencyKey` impide duplicar operaciones de sincronización.
- Una restricción parcial de migración impide asignar simultáneamente el mismo `externalKey` a más de una orden activa.
- `Order.version` implementa concurrencia optimista para edición administrativa.
- `Order.rescheduledFromOrderId` es único, por lo que una cita fallida solo puede originar una
  reprogramación.
- La base restringe las resoluciones administrativas a órdenes cuyo estado es
  `FAILED_APPOINTMENT`.

## Eliminación y retención

Unidades, checklist, items, evidencias, firmas y reportes usan cascada al eliminar su padre. Usuarios y técnicos usan restricciones o `SET NULL` para conservar trazabilidad. La aplicación normalmente cancela o elimina lógicamente evidencias; no expone eliminación física de órdenes como operación habitual.
