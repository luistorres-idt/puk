# Modelo de datos

**Estado:** esquema relacional documentado según `prisma/schema.prisma` (revisado 2026-10-02).
Las referencias de almacenamiento son opacas y dependen del proveedor; Drive usa IDs de archivo y
una tabla de mapeo de carpetas. La base conserva metadatos, no bytes.

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
    ORDER ||--o| SHARED_TECHNICIAN_ACCESS : "puede habilitarse para"
    ORDER_UNIT ||--o{ ORDER_EQUIPMENT : equipa
    ORDER_UNIT ||--o| CHECKLIST : inspecciona
    ORDER_UNIT ||--o{ EVIDENCE : documenta
    ORDER_UNIT ||--o{ DISCREPANCY : agrupa
    CHECKLIST ||--|{ CHECKLIST_ITEM : contiene
    ORDER_EQUIPMENT ||--o{ DISCREPANCY : presenta
    USER ||--o{ REFRESH_SESSION : mantiene
    USER ||--o{ AUDIT_LOG : ejecuta
    USER ||--o{ EVIDENCE : carga
    USER ||--o{ SIGNATURE : captura
    USER ||--o{ ORDER : "resuelve cita fallida"
    USER ||--o| SHARED_TECHNICIAN_ACCESS : "cuenta compartida designada"
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
        Decimal pricingUnitRate
        int pricingAppliedQuantity
        Decimal pricingBaseCost
        Decimal pricingDepartureCost
        Decimal pricingTravelExpenses
        Decimal pricingTotal
        string pricingCurrency
        timestamp pricingSnapshotAt
        int pricingVersion
        json pricingBreakdown
        json pricingOverrides
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
        uuid orderUnitId FK
        string objectKey UK
        uuid idempotencyKey UK
        string mimeType
        int sizeBytes
        string checksum
        uuid uploadedById FK
        UploadStatus status
        timestamp completedAt
        timestamp deletedAt
    }
    SIGNATURE {
        uuid id PK
        uuid orderId FK, UK
        string signerName
        string objectKey UK
        string mimeType
        int sizeBytes
        uuid capturedById FK
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
    SHARED_TECHNICIAN_ACCESS {
        int id PK
        uuid userId FK, UK
        uuid orderId FK, UK
        int revision
        timestamp updatedAt
    }
    DRIVE_FOLDER {
        string logicalKey PK
        string driveFileId UK
        string parentDriveFileId
        string name
    }
    DRIVE_SIGNATURE_UPLOAD {
        uuid idempotencyKey PK
        uuid orderId FK
        string objectKey UK
        string signerName
        string checksum
        int sizeBytes
        timestamp completedAt
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

`Order` es la raíz del agregado operativo. Conserva el cliente y el técnico como snapshots, y contiene
unidades. La API exige un técnico activo para crear/asignar, pero la relación puede ser nullable por
compatibilidad con registros históricos. Cada unidad tiene su tipo de servicio, equipos, checklist,
fotografías (`Evidence`) y discrepancias. Las evidencias pertenecen directamente a la unidad, no a los
items del checklist; las cinco categorías del checklist se almacenan independientemente. La orden
conserva los importes y el desglose congelados (`pricing*`, `pricingBreakdown`), así como los overrides
acordados (`pricingOverrides`). El servicio administrativo puede reajustar una orden cerrada,
incrementar `pricingVersion`, auditar y encolar una nueva publicación. La firma se captura una vez por
orden. Sincronizaciones y reportes son efectos versionados relacionados con la orden.

`SharedTechnicianAccess` es una configuración de control de acceso singleton (ID 1), con una cuenta
TECHNICIAN designada y, opcionalmente, una orden ejecutable habilitada. `revision` evita actualizaciones
obsoletas; cambiar la cuenta también limpia la orden habilitada. La cuenta y la orden son relaciones
opcionales para poder revocar el acceso.

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
- Solo existe un checklist por unidad y una firma por orden.
- La configuración singleton de acceso compartido mantiene a lo sumo una cuenta y una orden activas;
  su elegibilidad y sincronización con el estado de la orden también se valida en el dominio.
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

Unidades, checklist, items, evidencias, firmas y reportes usan cascada al eliminar su padre. Usuarios y técnicos usan restricciones o `SET NULL` para conservar trazabilidad. La aplicación normalmente cancela órdenes o elimina lógicamente evidencias; no expone eliminación física de órdenes como operación habitual. `DriveFolder` persiste IDs de carpetas para resolver claves lógicas de forma idempotente; no representa una ruta física local ni almacena el contenido de archivos.
