# Backend y flujos

## Módulos de la API

| Módulo                  | Responsabilidad                                                            |
| ----------------------- | -------------------------------------------------------------------------- |
| `auth`                  | login, refresh, revocación y consulta de sesión                            |
| `users` / `technicians` | administración local y auditoría                                           |
| `catalogs`              | consulta y caché de clientes/equipos de Sheets                             |
| `orders`                | borradores, unidades, equipos, asignación, cancelación y outbox            |
| `execution`             | inicio, verificación, discrepancias, checklist, evidencias, firma y cierre |
| `reports`               | generación, versionado y descarga privada del PDF                          |
| `health`                | liveness y readiness                                                       |
| `observability`         | logs estructurados y métricas                                              |

## Ciclo de una orden

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> ASSIGNED: asignar y sincronizar
    ASSIGNED --> IN_PROGRESS: iniciar servicio
    IN_PROGRESS --> COMPLETED: validación integral
    IN_PROGRESS --> FAILED_APPOINTMENT: registrar motivo
    IN_PROGRESS --> REQUIRES_CORRECTION: solicitud administrativa
    COMPLETED --> REQUIRES_CORRECTION: solicitud administrativa
    REQUIRES_CORRECTION --> IN_PROGRESS: reiniciar trabajo
    REQUIRES_CORRECTION --> COMPLETED: completar corrección
    DRAFT --> CANCELLED: cancelar
    ASSIGNED --> CANCELLED: cancelar
    IN_PROGRESS --> CANCELLED: cancelar
```

Para completar normalmente se validan equipos, cinco categorías de checklist, un mínimo de tres fotografías por unidad y firma con nombre. Una discrepancia documentada no bloquea el cierre. La cita fallida omite checklist, fotos y firma.

## Asignación y sincronización con Sheets

```mermaid
sequenceDiagram
    participant A as Administrador
    participant API
    participant DB as PostgreSQL
    participant W as SyncService
    participant G as Google Sheets

    A->>API: POST /orders/:id/assign
    API->>G: revalidar equipos
    API->>DB: transacción: estado + auditoría + outbox
    API-->>A: orden asignada
    loop cada OUTBOX_POLL_INTERVAL_MS
        W->>DB: tomar operaciones pendientes
        W->>G: localizar fila y actualizar columnas permitidas
        W->>DB: SYNCED o reintento con backoff
    end
```

Las operaciones fallidas almacenan intentos, código/mensaje y siguiente fecha. El administrador puede devolverlas a `PENDING`. Google Sheets no se consulta para reconstruir órdenes cerradas: los equipos conservan snapshots.

### Creación atómica y validación de conflictos

- `POST /orders` permite la creación atómica de la cabecera de la orden junto con sus unidades iniciales y equipos vinculados dentro de una misma transacción de dominio (`domainTransaction`).
- Antes de confirmar la asignación (`POST /orders/:id/assign`), el backend ejecuta una revalidación fresca contra Google Sheets.
- Para evitar falsos positivos de conflicto (`409 SHEET_ROW_CONFLICT`), la coincidencia de cliente entre la hoja y la orden aplica `isMatchingClient` y `normalizeString`. Esto asegura que diferencias de mayúsculas/minúsculas, acentos, espacios múltiples o sufijos corporativos (como `S.A. de C.V.`) no bloqueen la asignación de hardware que legítimamente pertenece al cliente. Solo se emite conflicto si el equipo en Sheets está asignado a una empresa completamente ajena.

## Carga de fotografías y firma

```mermaid
sequenceDiagram
    participant W as Web
    participant API
    participant S3 as S3 / MinIO
    participant DB as PostgreSQL

    W->>API: solicitar URL de subida
    API->>DB: crear metadato PENDING
    API-->>W: URL prefirmada + objectKey/id
    W->>S3: PUT directo del archivo
    W->>API: confirmar subida
    API->>S3: HEAD y validar MIME/tamaño
    API->>DB: marcar COMPLETED
```

Las claves siguen los prefijos `orders/{orderId}/units/...`, `orders/{orderId}/signature/...` y `orders/{orderId}/reports/...`. La base nunca almacena bytes ni Base64.

## Generación de reporte PDF

```mermaid
sequenceDiagram
    participant T as Técnico/API
    participant DB as PostgreSQL
    participant RW as ReportsService
    participant S3 as S3 / MinIO

    T->>DB: completar orden
    T->>RW: solicitar versión de reporte
    RW->>DB: crear PENDING
    loop worker periódico
        RW->>DB: reclamar como PROCESSING
        RW->>S3: leer firma y evidencias secuencialmente
        RW->>RW: normalizar imágenes y componer PDF
        RW->>S3: guardar PDF privado
        RW->>DB: READY + checksum + auditoría
    end
```

PDFKit compone páginas Carta; Sharp corrige orientación y normaliza imágenes. Una evidencia por página ocupa el área útil sin mostrar la categoría del checklist. Un proceso `PROCESSING` abandonado por más de diez minutos vuelve a `PENDING`. Los errores públicos se sanitizan y un reintento no duplica la versión vigente.

## Transacciones y auditoría

`domainTransaction` reúne mutaciones del dominio, auditorías y registros de outbox en una transacción Prisma. Acciones como creación, asignación, cierre, captura de evidencia, generación y descarga de reporte dejan eventos identificables. Los controladores no escriben directamente salvo consultas administrativas puntuales.
