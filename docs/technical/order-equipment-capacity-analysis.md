# Análisis técnico: órdenes con muchos equipos

**Conclusión:** el sistema impone límites de **100 unidades** y **500 equipos por orden**, y serializa las altas incrementales para proteger el cupo ante concurrencia. La verificación local confirmó el comportamiento en el máximo y completó benchmarks exploratorios: el detalle administrativo tarda 11–23 ms en una muestra y la creación 580–840 ms, pero esta última emite 904–905 eventos de consulta Prisma. La UI renderizó el máximo en 1.57 s con aproximadamente 7.171 elementos DOM. Son mediciones puntuales de entorno local, no objetivos de producción ni percentiles.

**Fecha:** 2026-10-21
**Alcance:** revisión estática más verificación aislada local en `puk_test` y Chromium desktop. Fixtures temporales limpios al terminar; sin cambios funcionales ni acceso a servicios remotos.

## Resumen ejecutivo

| Área | Comportamiento actual | Evaluación |
|---|---|---|
| Límites de entrada | 100 unidades y 500 equipos agregados por orden; cuerpo JSON de hasta 1 MiB | Control implementado; el tamaño real del payload puede reducir el máximo práctico |
| Altas concurrentes | Bloqueo de la orden y conteo bajo transacción antes de insertar | Protección implementada; existe evidencia previa de integración PostgreSQL |
| Lectura de detalle | Un detalle administrativo anidado, completo y sin paginar | 10 eventos Prisma; 11–23 ms medidos en una muestra local |
| Preparación al crear | Inventario y conflictos verificados por equipo; comprobaciones de disponibilidad seriales | 904–905 eventos Prisma y 580–840 ms en muestras locales de máximo tamaño |
| Auditoría de creación | Eventos acumulados en memoria e insertados en lote dentro de la transacción | 601 eventos confirmados por orden; inserción atómica verificada |
| Interfaz | Acciones de agregar dependen de rol/estado, no del cupo restante | Brecha de UX: el usuario puede llegar al rechazo del servidor sin aviso previo |

## Límites y validaciones actuales

- `MAX_ORDER_UNITS = 100` y `MAX_ORDER_EQUIPMENT = 500` están definidos en `packages/contracts/src/validation-limits.ts`.
- `CreateOrderSchema` limita las unidades y suma el equipo de todas ellas; la suma debe ser como máximo 500. El esquema de unidad también acepta un máximo individual de 500, pero ese valor no reemplaza el máximo agregado de la orden (`packages/contracts/src/orders.ts`).
- `assertCreateOrderItemLimits` vuelve a validar el agregado en el servicio (`apps/api/src/modules/orders/order-item-limits.ts`).
- Las nuevas altas de unidades/equipos verifican el total existente más lo que se quiere agregar. Para ello, `lockAndCheckOrderItemCapacity` bloquea la fila padre con `SELECT ... FOR UPDATE`, cuenta unidades y equipos y rechaza si el total excedería los límites.
- El parser HTTP limita el cuerpo JSON completo a `1mb` (`apps/api/src/app.ts`). Por lo tanto, 500 elementos es el máximo lógico, no una garantía de que cualquier conjunto de 500 objetos quepa en una petición. Snapshots grandes pueden hacer que el límite de bytes se alcance primero.
- La capacidad cuenta equipos asignados a la orden; no se limita solo a los que están activos.

### Casos límite relevantes

1. **Límite exacto:** 100 unidades y 500 equipos deben aceptarse si el resto de las validaciones pasa; 101 unidades o 501 equipos deben rechazarse.
2. **Límite agregado:** varias unidades pueden sumar hasta 500; una petición individual no debe considerarse válida únicamente porque cada unidad esté bajo el límite individual.
3. **Concurrencia:** dos solicitudes que compiten por el último cupo deben serializarse: una puede entrar y la otra debe ser rechazada tras volver a contar.
4. **Payload:** un JSON de menos de 500 equipos puede exceder 1 MiB dependiendo de los datos/snapshots y ser rechazado por el parser.
5. **Reemplazos:** dos equipos ligados a una misma unidad de reemplazo se contabilizan ambos para el total agregado.

## Detalle de orden: lectura y renderizado

### Flujo observado

1. `OrdersQueryService.getOrderById` carga la orden administrativa y devuelve el modelo validado (`apps/api/src/modules/orders/orders-query.service.ts`).
2. `administrationOrderSelect` incluye todas las unidades, equipos, evidencias y checklists; el modelo no tiene límite o paginación en esas colecciones (`apps/api/src/modules/orders/order-read-models.ts`).
3. `mapAdministrationOrder` recorre todas las unidades y `mapAdministrationUnit` cada equipo. Luego se valida el resultado completo con el esquema de lectura.
4. `OrderUnitsTab.vue` recorre todas las unidades y todos los equipos para renderizarlos; no usa paginación ni virtualización (`apps/web/src/modules/orders/components/OrderUnitsTab.vue`).

### Riesgo y severidad

**Medio, pendiente de medir.** El techo de 100/500 mantiene el volumen acotado, y la consulta selecciona campos explícitos en lugar de serializar filas completas. Aun así, el costo de DB, mapeo, validación de contrato, transferencia JSON y render crece con el número de elementos. No se midieron bytes de respuesta, p95/p99, memoria ni fluidez en navegador.

El endpoint de ejecución también devuelve colecciones anidadas de unidades/equipos y las mapea en memoria. Aunque la pantalla administrativa es el foco del análisis, ese endpoint merece incluirse en la medición si se usa con órdenes de tamaño máximo.

### Recomendaciones

- Medir el detalle en tamaños representativos y máximos antes de cambiar el modelo de lectura.
- Si el render domina, considerar virtualizar la lista de unidades/equipos; si domina la transferencia/DB, evaluar un resumen inicial con carga bajo demanda o paginación de equipos.
- Mantener los esquemas de detalle y ejecución coherentes con cualquier separación de lectura. No aplicar paginación solo en la UI si el endpoint sigue enviando la colección completa.

## Preparación y auditoría al crear

### Flujo observado

1. `OrdersService.createOrder` valida los límites agregados, prepara equipos por unidad y comprueba seriales de unidad repetidos (`apps/api/src/modules/orders/orders.service.ts`).
2. La preparación de las unidades usa `Promise.all`. Cuando hay equipo DB, `InventoryAssignmentPreparer.prepare` resuelve y valida las referencias DB; hace búsquedas por equipo. Si el equipo es solo de Sheets, esa preparación retorna sin consultas de resolución DB.
3. `assertEquipmentAvailable` detecta claves duplicadas y consulta conflictos de asignación activa para cada equipo en un bucle secuencial (`apps/api/src/modules/inventory/order-inventory.ts`). Para una creación nueva se comprueba el conflicto activo; las comprobaciones de pertenencia a una orden existente no aplican porque aún no existe `orderId`.
4. Dentro de `domainTransaction`, la orden se crea y las unidades se insertan en un bucle `for` con `await`; cada alta de unidad incluye la creación anidada de sus equipos. Las unidades, por tanto, se escriben secuencialmente, no mediante un único bulk insert.
5. Las auditorías se acumulan en memoria mediante `effects.audit`; al finalizar el trabajo se insertan con `auditLog.createMany` dentro de la misma transacción (`apps/api/src/database/transaction.ts`). Si falla una escritura, la transacción revierte los datos y las auditorías.

### Magnitud máxima estimada

Una creación en los límites puede producir **hasta 601 eventos de auditoría**: 1 de orden, 100 de unidad y 500 de equipo. Además, realiza las escrituras de orden, unidades y equipos. `createMany` evita una llamada de creación de auditoría por evento desde el código de dominio, pero no asumimos que necesariamente sea una sola sentencia SQL interna.

Para una orden de equipos DB, el preflight añade búsquedas por equipo y el conflicto activo se revisa por cada clave. La carga de Sheets puede variar con el proveedor/catálogo. No se midieron cantidad exacta de round-trips, duración de transacción, locks, throughput ni comportamiento con latencia del proveedor.

La detección de duplicados y la búsqueda del equipo asociado vuelven a recorrer arreglos dentro del bucle de disponibilidad (costo cuadrático en memoria). El tope de 500 acota ese trabajo, que parece secundario frente a las consultas secuenciales, pero puede reemplazarse por `Set`/`Map` si el profiling muestra que importa.

### Riesgo y severidad

**Medio, pendiente de benchmark.** Las comprobaciones por ítem y las escrituras secuenciales pueden hacer lenta una orden grande. La auditoría queda dentro de la transacción, lo cual conserva atomicidad, pero contribuye a su trabajo total. El análisis no demuestra que se excedan timeouts ni que exista bloqueo en producción: eso requeriría mediciones con una base y configuración representativas.

### Recomendaciones

- Benchmark de creación con órdenes pequeñas, medianas y cercanas al máximo; separar casos Sheets, DB y mixtos.
- Instrumentar tiempo de preflight, tiempo dentro de transacción, escrituras/lecturas por tipo y tiempo total; registrar p50/p95/p99 y errores/timeouts.
- Si el costo por ítem resulta dominante, evaluar consultas por lote para resolver equipos/conflictos, preservando las reglas de conflicto e identidad.
- No mover auditorías fuera de la transacción sin una decisión explícita de consistencia: hoy se garantiza rollback conjunto de los datos y sus eventos de auditoría.

## Interfaz y respuesta ante el límite

`OrderUnitsTab.vue` muestra acciones para agregar unidad/equipo cuando el usuario puede modificar la orden, pero no deriva `canAddItems` del cupo remanente ni presenta un contador. El servidor sigue siendo la autoridad y rechaza excedentes; la interfaz puede terminar mostrando ese error solo después del intento.

**Mejora sugerida:** mostrar `unidades actuales / 100` y `equipos actuales / 500`, deshabilitar la acción correspondiente al alcanzar el límite y conservar la validación del servidor para concurrencia y solicitudes directas. El conteo de equipos debe sumar todas las unidades.

## Verificación ejecutada

Se ejecutó en **PostgreSQL local aislado `puk_test`** con fixtures únicos y limpieza automática. Para cada escenario se creó una orden con 100 unidades y 500 equipos; el escenario mixto incluyó 1 equipo DB y 499 de Sheets. Las lecturas de detalle se realizaron mediante los servicios reales. Los valores son una sola muestra por escenario y no deben compararse como una serie estadística.

| Escenario | Creación: pared / consultas Prisma / suma de duraciones DB | Detalle admin: pared / consultas / bytes JSON | Detalle ejecución: pared / consultas / bytes JSON | Auditorías |
|---|---:|---:|---:|---:|
| Sheets | 840 ms / 904 / 485 ms | 23 ms / 10 / 185.291 B | 12 ms / 9 / 128.823 B | 601 |
| Mixto (1 DB + 499 Sheets) | 580 ms / 905 / 347 ms | 11 ms / 10 / 185.348 B | 8 ms / 9 / 128.860 B | 601 |

La suma de duraciones Prisma no equivale a latencia de pared: varias consultas se ejecutan en paralelo y hay tiempo de aplicación. La diferencia de tiempo entre las dos muestras no demuestra que el escenario mixto sea más rápido; el orden de ejecución, cachés y ruido del entorno afectan el resultado. Sí se confirma **amplificación de consultas** a escala máxima: aproximadamente 900 eventos Prisma por creación. Conviene medirla en una base de configuración representativa antes de decidir si agrupar consultas.

También se corrió el benchmark de interfaz con **Chromium desktop** y respuesta API mockeada con 100 unidades/500 equipos: **1.570 ms** desde navegación hasta contenido visible, **7.171 nodos DOM**, **500 botones de equipo** y **86,4 MB de heap reportado por Chromium**. El heap incluye el baseline de la aplicación y no se debe atribuir íntegramente a la lista. Este ensayo mide render de frontend, no latencia real de red/backend ni dispositivos móviles.

La suite de integración específica de límites se ejecutó sobre el mismo `puk_test`: **4/4 pruebas pasaron**. Esta ejecución confirma concurrencia por el último cupo, rollback de auditoría y casos existentes del archivo; no sustituye pruebas de carga sostenida.

## Evidencia y límites de este análisis

- El plan de robustez de issue #41 registra T09 como terminada y verificada, con evidencia PostgreSQL local para carreras de capacidad y rollback de transacción: [`docs/plans/issue-41-robustez.md`](../plans/issue-41-robustez.md).
- También existe observación de integración previa que documenta dos solicitudes concurrentes compitiendo por el último espacio y rollback ante error FK de auditoría. **No se reejecutaron esas pruebas en esta revisión.**
- Las mediciones fueron una corrida de creación por variante, una lectura por endpoint y una corrida desktop de UI. No son p50/p95/p99 ni representan producción.
- No se midió red real, concurrencia sostenida, límite de CPU/memoria bajo carga, dispositivos móviles ni demora de Google Sheets; el benchmark de API usa solo la DB local y los equipos Sheets son snapshots de fixture.
- El ensayo de navegador usó un prebuild existente de web y API mockeada. Sirve para evaluar el volumen de render, no para validar contrato HTTP extremo a extremo.
- No se consultaron servicios remotos ni se imprimieron credenciales.

## Próxima verificación recomendada

Ejecutar un benchmark aislado con PostgreSQL local/configuración representativa y fixtures identificables, incluyendo: (a) creación de 100 unidades/500 equipos con datos de Sheets, (b) mezcla con equipos DB, (c) lectura de detalle administrativa y de ejecución al máximo, y (d) interfaz con el resultado máximo. Capturar latencia total y por fase, round-trips, duración de transacción, bytes de respuesta y render. Definir umbrales de aceptación antes de decidir si hace falta paginar, virtualizar o agrupar consultas.
