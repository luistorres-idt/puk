# Frontend

## Tecnologías y organización

La aplicación web usa Vue 3, Composition API, Vite, Vue Router, TanStack Query, Pinia, Axios, Naive UI y Tailwind CSS. Las rutas se cargan de forma diferida por módulo.

```text
apps/web/src/
├── app/                  tema global
├── modules/
│   ├── auth/             inicio de sesión
│   ├── home/             tablero inicial
│   ├── external-catalogs/selectores de Sheets
│   ├── orders/           lista, alta y detalle administrativo
│   ├── service-execution/flujo móvil, cámara y firma
│   ├── technicians/      directorio y cuentas técnicas
│   └── technical-accounts/ APIs de cuentas compartidas y usuarios técnicos
├── router/               composición y guardas
├── shared/               HTTP y layout
└── stores/               sesión
```

## Flujo de datos

```mermaid
flowchart LR
    View[Vista Vue] --> Composable[Query / mutación]
    Composable --> ModuleApi[Módulo API]
    ModuleApi --> Axios[Axios compartido]
    Axios --> Backend[Express]
    Backend --> Axios
    Axios --> Cache[Caché TanStack Query]
    Cache --> View
    Session[Pinia: sesión] --> Axios
    Router[Vue Router] --> Session
```

- TanStack Query mantiene datos remotos, caché, polling e invalidación.
- Pinia conserva usuario, access token en memoria e inicialización de sesión. La identidad se
  reconcilia con `/auth/me` mediante una promesa deduplicada y TTL de 30 segundos.
- Axios adjunta el access token y coordina un único refresh ante respuestas `401`.
- Los módulos de frontend (`orders`, `service-execution`, `technicians`) encapsulan sus peticiones en archivos `api.ts` dedicados que comparten la interfaz `ApiResponse<T>`.
- El manejo de errores de interfaz utiliza la utilidad `extractApiErrorMessage` (`@/shared/http/client.ts`) para presentar transparentemente al usuario los mensajes de error originados en el backend en lugar de códigos genéricos de Axios.
- Formularios y modales usan estado local del componente.
- Tras mutaciones se invalidan órdenes, auditoría, sincronización o reporte según corresponda.

## Rutas

| Ruta                  | Vista                                    | Perfil                              |
| --------------------- | ---------------------------------------- | ----------------------------------- |
| `/login`              | inicio de sesión                         | público                             |
| `/`                   | dashboard / órdenes recientes            | autenticado                         |
| `/orders`             | listado y filtros                        | autenticado; datos filtrados en API |
| `/orders/new`         | asistente de creación                    | administrador                       |
| `/orders/:id`         | detalle, evidencias, reporte y auditoría | administrador                       |
| `/orders/:id/execute` | ejecución mobile-first                   | técnico autorizado o administrador  |
| `/technicians`        | administración de técnicos               | administrador                       |

La guarda de navegación inicializa la sesión, revalida la identidad cuando vence el TTL, redirige
según `orderAccessMode` y aplica `requiresRole`. Recuperar el foco y actualizar manualmente el
tablero compartido fuerzan la misma reconciliación y reutilizan una única política de redirección.
La autorización real siempre se repite en backend.

La administración de cuentas técnicas se compone desde `technicians/views/TechnicalAccountsView.vue`:
`useTechnicalAccounts` concentra estado y mutaciones, mientras `SharedAccountPanel`,
`TechnicalAccountTable` y `TechnicalAccountModals` mantienen la presentación separada. Las llamadas
de usuarios y acceso compartido pertenecen a `modules/technical-accounts`.
La vista de ejecución carga `/orders/:id/execution`, cuyo contrato omite información administrativa,
fiscal y de sincronización. Los técnicos navegan a esa vista también para consultar su historial.

## Asistente de creación de órdenes y catálogo de equipos

El asistente (`/orders/new`) guía al administrador en un flujo estructurado de 5 pasos:

1. **Cliente**: Selección del cliente desde Sheets. Los servicios se agregan por bloque en el paso siguiente.
2. **Unidades y Equipos**:
   - **Revisiones y Desinstalaciones**: El componente `EquipmentSelect` filtra automáticamente los equipos con estatus `INSTALADO` del cliente. Al seleccionar un hardware, la función `extractUnitFromEquipment` autocompleta la unidad (`unit`, `unitMakeModel`, `unitYear`, `unitSerialNumber`) reduciendo la captura manual.
   - **Instalaciones y Sensor fuel**: `EquipmentSelect` filtra exclusivamente hardware en stock/almacén (`STOCK TECNICO`, `DISPONIBLE`, etc.) y solicita los datos de la nueva unidad física.
   - **Cambio de equipo**: exige seleccionar el equipo instalado que se retira y uno disponible de almacén; ambos quedan asociados a la misma unidad.
   - **Órdenes mixtas**: cada unidad conserva su propio `serviceType` y el resumen agrupa unidades por servicio.
   - **Normalización**: Las comparaciones de clientes aplican `normalizeString` (case-insensitive, diacríticos removidos vía NFD y eliminación de sufijos legales tipo `S.A. de C.V.`).
3. **Programación**: Fecha, hora, tipo de servicio (en sitio o taller) y notas operativas.
4. **Técnico**: Selección obligatoria desde `DIRECTORIO TECNICO`, con filtros de ciudad y taller, búsqueda, ficha de contacto, marca de última sincronización y recarga explícita. La carga, el catálogo vacío y los errores bloquean el avance.
5. **Resumen y Creación**: Validación integral y envío atómico de la orden con sus unidades y equipos a la API.

En el detalle, las acciones Agregar Unidad, Registrar Primera Unidad y Asignar
Equipo aparecen para administradores mientras la orden está en borrador y respetan el servicio
seleccionado. La API valida la misma regla. La carga inicial anidada del wizard y las acciones de
quitar/eliminar conservan sus reglas existentes. Los botones interactivos personalizados responden
tanto a clic como a teclado.

## Evidencias y reportes

El navegador comprime fotografías a JPEG antes de solicitar/subir una URL prefirmada, con rechazo explícito de promesas ante imágenes no decodificables para evitar bloqueos en la interfaz. La firma se captura con canvas y se sube como PNG. El detalle de la orden consulta el estado del reporte cada tres segundos mientras está pendiente o procesándose y obtiene una URL temporal cuando queda listo.

## PWA

El proyecto incluye manifest e iconos instalables. Solo se cachean assets estáticos; no se promete operación offline ni se cachean respuestas autenticadas.
