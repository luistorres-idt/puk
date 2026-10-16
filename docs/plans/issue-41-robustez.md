# Plan ejecutable — robustez de órdenes (#41)

**Resultado esperado:** corregir las rutas concretas de autorización y validación enumeradas abajo, con regresiones permanentes y evidencia por tarea. Ejecutar **una tarea por vez**; no implementar toda la issue en una sola pasada.

- Fuente: [issue #41](https://github.com/luistorres-idt/puk/issues/41).
- Revisión del plan: 2026-10-16. La revisión inicial del alcance se hizo contra `eec85d3332b9f389f7df20a976046c02139f5ee1`; el avance se actualizó con la evidencia local registrada en la sección 7.
- Estado actual: **T01–T11 verificadas; T12 parcial**. B01 está definido e implementado; NET-02 está verificado a nivel de persistencia. Quedan NET-01 parcial, NET-04 y el resto de la matriz de escenarios. T05 (B03) y T09 tienen evidencia PostgreSQL local detallada en la sección 7.
- Ambiente: cliente Prisma generado localmente el 2026-10-14 con configuración ficticia aislada, tras autorización del usuario. B03 usó `puk_test` en solo lectura; T09 usó esa misma DB únicamente con fixtures de prueba identificables y limpieza posterior. Sin migraciones ni seeds en estas tareas.
- Hay tareas listas y tareas con bloqueos explícitos. Un bloqueo no autoriza al implementador a elegir otra regla ni impide ejecutar tareas independientes.

## 1. Instrucciones para el implementador

1. Leer este documento, `AGENTS.md` y solo las superficies de la tarea seleccionada. Confirmar que los símbolos siguen existiendo; los números de línea no son una API estable.
2. Confirmar el estado inicial con `git status --short`. No tocar archivos ajenos, configuración de ambientes ni secretos. Si falta el cliente Prisma generado u otra dependencia, registrar **BLOQUEADO_ENTORNO**; no solucionar eso con migraciones, seeds o acceso a una DB desconocida.
3. Agregar primero la regresión específica y comprobar que falla **por el defecto esperado**. Un fixture incompleto, import roto o rechazo por otra política no demuestra reproducción.
4. Implementar el cambio mínimo de esa tarea. No reescribir políticas, transacciones, inventario ni almacenamiento completos.
5. Ejecutar su grupo de pruebas de la sección 6, revisar el diff y registrar el resultado real en la sección 7.
6. Detenerse si cambió el código de referencia, falta una decisión, falla una prueba previa por causa desconocida o la corrección necesita ampliar el alcance. Documentar la causa; no improvisar una solución.

**Fuera de la autorización de este documento:** commit, push, PR, actualización remota de la issue, despliegue, acceso a producción, lectura de credenciales y cambio del modo de review. Este plan tampoco selecciona SDD. Las reglas actuales del repositorio siguen siendo obligatorias.

### Invariantes que no se deben romper

- Reutilizar `loadAccessibleExecutionOrder` / `assertOrderAccess` y las reglas de estado existentes. No reemplazarlas por comparaciones de rol hechas a mano.
- La cuenta técnica compartida conserva su acceso existente a órdenes asignadas en estados elegibles. **No restringirla a `shared.orderId`**: esa no es la política actual.
- Mantener auditoría y outbox dentro de `domainTransaction`; no modificar globalmente ese helper para una sola tarea.
- Un rechazo de pertenencia o validación no produce escritura de dominio, auditoría, outbox ni mutación de almacenamiento. Una lectura de autorización no es una escritura.
- Aplicar nuevas restricciones a entradas; no volver inválida la lectura histórica ni normalizar registros antiguos en masa.
- Mantener defaults, `optional`/`nullable`, reintentos, borradores y protección de doble envío salvo donde esta guía indique expresamente un cambio.
- Tests, comentarios e identificadores nuevos siguen el idioma y convenciones del código existente; esta documentación mantiene español profesional.

## 2. Políticas aprobadas y detalles técnicos

Los valores fueron aprobados por el usuario como política inicial. [OWASP API4](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/) recomienda límites por campo, colección y carga, pero no prescribe estas cifras universales.

| Área              | Regla aprobada                                              | Interpretación para implementar                                                                                                                                                                             |
| ----------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSON              | Máximo **1 MiB**                                            | 1.048.576 **bytes UTF-8 del cuerpo completo**, no caracteres ni longitud de una propiedad. Conservar `express.json({ limit: '1mb' })`.                                                                      |
| Notas             | Máximo **5.000**                                            | Conservar el criterio actual de `v.maxLength`: unidades UTF-16 (`string.length`). No introducir un contador diferente solo en UI. Campo inválido se rechaza, nunca se trunca.                               |
| Unidades          | Máximo **100 por orden**                                    | Contar filas de unidades existentes más las nuevas; no solo el tamaño de la solicitud actual.                                                                                                               |
| Equipos           | Máximo **500 por orden**                                    | Sumar equipos de todas sus unidades, incluso los dos equipos de un reemplazo. No es un límite de 500 por unidad ni solo de asignaciones activas.                                                            |
| Importes          | MXN **0 a 99.999.999,99**, hasta 2 decimales                | API recibe cadenas decimales con punto: `99999999.99`. Cero es válido; negativos, exponentes, comas, infinito y más de dos decimales no. Validar también totales calculados antes de persistir.             |
| Evidencia         | Dimensiones enteras positivas, hasta **40.000.000 píxeles** | Comparar `width × height`; obtener dimensiones del archivo real. Conservar límite configurado de bytes, cuyo default actual es 10 MiB; no eliminar la opción `maxEvidenceBytes`.                            |
| Año               | **1900 a año actual + 1**; desconocido permite `null`       | Regla evaluada al validar, no congelada al importar el módulo. Usar año de `America/Hermosillo`, zona de negocio ya documentada en `docs/technician-workbook-contract.md`; no depender de la zona del host. |
| Paginación        | `page >= 1`; `pageSize` 1–100; defaults 1 y 25              | Son defaults del API. El listado web envía actualmente `pageSize=15`: no cambiarlo a 25. No corregir entradas inválidas con clamp.                                                                          |
| Fechas            | Fechas reales; `from <= to`; sin máximo global de intervalo | Preservar filtros inclusivos `gte`/`lte` y comparar instantes, no cadenas. Gramática y compatibilidad se especifican en T05.                                                                                |
| Texto obligatorio | Trim exterior; vacío efectivo se rechaza                    | Guardar el valor normalizado en los campos humanos de T06. Preservar puntuación, Unicode y espacios interiores. No transformar identidades externas ni inventar reglas de VIN.                              |

La precisión de los campos monetarios actuales es `Decimal(10,2)` en `prisma/schema.prisma`: ocho dígitos enteros y dos decimales. Es un límite de almacenamiento de la aplicación, no una cifra elegida por OWASP. Referencia: [PostgreSQL numeric](https://www.postgresql.org/docs/current/datatype-numeric.html).

### Decisiones todavía abiertas

| ID  | Qué falta                                                                                                                                                                                                                                                                                                        | Regla mientras no se resuelva                                                                                                                                                                                                                                                                                                                                                           | Tareas afectadas                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| B01 | **RESUELTO (política):** `clientNameSnapshot` 200, `serviceAddress` 500, `OrderUnit.label` 100, `makeModel` 200, `serialNumber` 100, descripción de discrepancia 1.500 y cada valor `observedSnapshot` 500 unidades UTF-16. Snapshots importados/raw no reciben límites nuevos. No imponer longitud/formato VIN. | No inventar otros máximos ni truncar. Aplicar campos acotados solo a escrituras nuevas y preservar lecturas históricas. Mantener intactos snapshots de origen (incluidos los de Sheets); el cuerpo JSON conserva el límite general de 1 MiB. En direcciones, serie y valores observados, respetar la normalización/casing aprobados por campo.                                          | T12; matriz de escenarios pendiente.          |
| B02 | **RESUELTO y verificado (2026-10-14):** reprogramar una orden histórica sobre límites nuevos                                                                                                                                                                                                                     | Permitir la excepción histórica: copiar unidades, equipos, año, notas y demás snapshots exactamente como existen; no truncar ni rechazar la reprogramación por los nuevos límites. La excepción aplica solo a la clonación de una orden histórica; entradas nuevas siguen los límites.                                                                                                  | T09: prueba sobre 101 unidades y 501 equipos. |
| B03 | **RESUELTO y verificado (2026-10-16):** Prisma 7.10.0 trunca offsets mayores que `4.294.967.295` a uint32 antes de enviarlos al adaptador PostgreSQL.                                                                                                                                                            | Contrato y servicio rechazan offsets superiores a `MAX_ORDER_QUERY_OFFSET=4.294.967.295`; prueba local de solo lectura confirma que valores adyacentes se envían intactos. No sustituir por un límite Int32.                                                                                                                                                                            | T05 verificada.                               |
| B04 | **RESUELTO y verificado (2026-10-14):** contrato de lectura legacy acotada                                                                                                                                                                                                                                       | Añadir lectura limitada por máximo positivo en bytes, usando el límite efectivo de carga de evidencia de la instancia (`getEvidenceUploadLimit()`, predeterminado 10 MiB y configurable). S3 corta la lectura al excederlo y libera/cancela el stream. El objeto sobredimensionado genera error tipado de entrada inválida y no cuenta como falla de proveedor para el circuit breaker. | T11 verificada con storage simulado.          |

Un límite bloqueado debe figurar como **PENDIENTE**, no como aprobado ni implementado. La issue no se cierra con estos puntos sin resolver.

## 3. Orden y estado de las tareas

| ID   | Entrega concreta                                                           | Estado del plan                     | Dependencia          |
| ---- | -------------------------------------------------------------------------- | ----------------------------------- | -------------------- |
| T01  | Pertenencia orden–unidad–equipo en verificar, discrepancia y desasignación | Terminada y verificada (2026-10-14) | Ninguna              |
| T02  | Autorización de completeness en router, fachada y servicio                 | Terminada y verificada (2026-10-14) | Ninguna              |
| T03  | JSON malformado/grande con 400/413 públicos                                | Terminada y verificada (2026-10-14) | Ninguna              |
| T04  | UUID de idempotencia y params en cargas binarias de evidencia **y firma**  | Terminada y verificada (2026-10-14) | Ninguna              |
| T05  | Gramática de paginación/fechas, calendario, rango y offset máximo          | Terminada y verificada (2026-10-16) | Ninguna              |
| T06  | Normalización de texto obligatorio y límite de notas                       | Terminada y verificada (2026-10-14) | Ninguna              |
| T07  | Año compartido/dinámico y coherencia de wizard/modal                       | Terminada y verificada (2026-10-14) | Ninguna              |
| T08a | Importes de entrada y overflow de precios calculados                       | Terminada y verificada (2026-10-14) | Ninguna              |
| T08b | Entrada monetaria textual sin redondeo silencioso en UI                    | Terminada y verificada (2026-10-14) | Ninguna              |
| T09  | Límites de colecciones y cupos concurrentes                                | Terminada y verificada (2026-10-16) | Ninguna              |
| T10  | Checklist con categorías únicas y dimensiones declaradas válidas           | Terminada y verificada (2026-10-14) | Ninguna              |
| T11  | Contenido real en finalización legacy de evidencia                         | Terminada y verificada (2026-10-14) | Ninguna              |
| T12  | Límites restantes de texto y matriz ampliada                               | Parcial: límites B01 implementados  | Matriz de escenarios |

Ejecutar T01 → T02 → T03 → T04 primero. Continuar con las demás tareas listas, sin ampliar una tarea por conveniencia. Cada unidad incluye código, pruebas y su evidencia; no separar entregas por tipo de archivo. No hay obligación de crear commits en esta fase.

## 4. Tareas listas: cambios y pruebas

### T01 — comprobar la cadena completa de pertenencia

- [x] **Terminada y verificada el 2026-10-14.** Evidencia y rollback en la sección 7.

**Modificar:** `apps/api/src/modules/execution/execution.service.ts` (`verifyEquipment`, `reportDiscrepancy`) y `apps/api/src/modules/orders/orders.service.ts` (`removeEquipment`). **Pruebas:** `execution.test.ts`, `orders.test.ts`, `orders.router.test.ts`; crear `apps/api/src/modules/execution/execution.router.test.ts` para HTTP de ejecución y reutilizarlo después.

1. Preservar el orden inicial: cargar orden accesible o administrativa y comprobar estado según el método actual.
2. Buscar `orderUnit` por `unitId`; si no existe o `unit.orderId !== orderId`, lanzar `404 UNIT_NOT_FOUND`.
3. Solo después buscar el equipo; si no existe o `eq.orderUnitId !== unitId`, lanzar `404 EQUIPMENT_NOT_FOUND`.
4. Solo después abrir la transacción y ejecutar la mutación existente. Se permite un helper pequeño compartido por los dos métodos de ejecución; no crear un framework de autorización ni cambiar contratos de respuesta.

**Fixture de reproducción:** técnico individual activo (`active: true`) asignado a A; A en `IN_PROGRESS`; unidad/equipo existentes en B. Probar verify y discrepancy con URL A y referencias B. En `removeEquipment`, usar administrador y orden A editable con unidad/equipo B.

**Matriz mínima:** unidad ausente/ajena → 404 de unidad; equipo ausente/de otra unidad → 404 de equipo; orden ajena al técnico → 403 de la política existente; cadena válida para admin y técnico activo → éxito. Cubrir cuenta compartida con la política actual, sin endurecerla.

**Cierre:** en rechazos previos a escritura, `$transaction` no llamado. Los mocks transaccionales se crean dentro del callback en las pruebas existentes: no afirmar contra un mock externo que nunca se usa. En éxito, exactamente la mutación y auditoría actuales. Agregar pruebas HTTP que reproduzcan los params válidos de la cadena ajena.

### T02 — transmitir el actor a completeness

**Modificar:** `execution.router.ts`, `ExecutionService.validateCompleteness`, `OrderFinalizationService.validateCompleteness` y el caller interno `OrderFinalizationService.completeOrder`. **Pruebas:** `execution.test.ts`, `execution.router.drive.test.ts`, nueva `execution.router.test.ts`.

1. Adoptar en toda la cadena la firma `(userId, role, orderId)`, igual que los métodos de ejecución actuales; no dejar una sobrecarga pública sin actor.
2. El GET `/orders/:id/completeness` toma actor de `request.auth`, nunca del body/query.
3. Antes de consultar `units/equipment/evidence/checklist/signature`, usar `loadAccessibleExecutionOrder` con el actor.
4. Propagar actor también desde `completeOrder`; conservar su autorización y transición inicial. No introducir reglas de estado de ejecución nuevas en el GET y no alterar `evaluateOrderCompleteness`.

**Pruebas:** técnico ajeno 403, orden ausente 404, admin permitido, técnico asignado activo permitido y cuenta compartida permitida/denegada según estado existente. En rechazo no se ejecuta la consulta que incluye requisitos. El cierre válido de una orden sigue funcionando y la forma pública de completeness permanece igual.

### T03 — clasificar errores del parser JSON

**Modificar:** `apps/api/src/middleware/error-handler.ts`. Referencia de montaje: `apps/api/src/app.ts`, `requestId` se instala antes de `express.json`. **Crear pruebas:** `apps/api/src/middleware/error-handler.test.ts`.

- `entity.parse.failed` del parser JSON → `400 INVALID_JSON`.
- `entity.too.large` del parser JSON → `413 PAYLOAD_TOO_LARGE`.
- Conservar `AppError` y el fallback genérico 500 para errores inesperados. No convertir cualquier `SyntaxError` o cualquier objeto con `status=400` en error de cliente.
- Conservar envelope público `{ error: { code, message }, meta: { requestId } }`; no exponer body recibido, stack ni propiedades internas del parser.
- No cambiar `binaryParser`: su exceso binario ya usa `413 FILE_TOO_LARGE`.

**Pruebas Supertest:** montar Express con `requestId`, el mismo parser JSON y `errorHandler`, más handler controlado. Usar JSON válido con padding ASCII y medir `Buffer.byteLength(payload, 'utf8')`: 1.048.576 bytes permitidos, 1.048.577 → 413; JSON inválido → 400. El handler no se ejecuta en rechazos. Probar también error inesperado → 500 sanitizado y `AppError` existente sin cambios. Añadir una integración con `createApp` real e inyección de servicios/principal simulados para confirmar el montaje, sin DB ni servidor remoto.

### T04 — validar idempotencia y params de cargas binarias

**Modificar:** `apps/api/src/modules/execution/execution.router.ts`. **Pruebas:** ampliar `execution.router.test.ts` creado en T01 para HTTP real; conservar `execution.router.drive.test.ts` para verificar argumentos.

1. Extraer helper local para el encabezado UUID usando `v.safeParse`, sin `v.parse` sin capturar. Ausente, vacío o inválido → `400 INVALID_IDEMPOTENCY_KEY`.
2. Usarlo en POST de evidencia `/orders/:id/units/:unitId/evidence/file` **y** PUT de firma `/orders/:id/signature/file`.
3. Aplicar `validate({ params: UnitParamsSchema })` / `IdParamsSchema` según la ruta. Mantener actor, parser binario y límites configurados.
4. No generar otra clave en el servidor ni modificar el mecanismo de reintento del cliente.

Orden requerido en ambas rutas: autenticación existente → validación de params → validación del encabezado → parser binario → handler. El UUID inválido debe rechazarse antes de procesar el archivo. No añadir propiedades globales nuevas a `Request` para transportar la clave; mantener el cambio local al router.

**Pruebas:** ambos endpoints con UUID válido y ausente/vacío/inválido; params malformados; exceso binario; body válido. En rechazo no se llama a `uploadEvidenceFile` / `uploadSignatureFile`. En éxito la clave se transmite sin modificar. Ejecutar regresiones web de idempotencia y reutilización de clave.

**Advertencia:** `execution.router.drive.test.ts` ejecuta solo `.stack.at(-1)`; no atraviesa parser/middleware. No usarlo como única prueba de status, límite o validación HTTP.

### T05 — validar la query antes de usar Prisma

**Modificar:** `packages/contracts/src/orders.ts` (`OrderListQuerySchema`), `apps/api/src/modules/orders/orders-query.service.ts`. Helper puro nuevo si hace falta: `packages/contracts/src/order-query-validation.ts`, exportado desde `index.ts`. **Pruebas:** contratos `orders.test.ts`, API `orders-query.service.test.ts`, `orders.router.test.ts`.

1. `page` / `pageSize`: admitir solo cadenas de dígitos decimales antes de `Number`; luego exigir `Number.isSafeInteger`, mínimo 1 y tamaño máximo 100. Rechazar vacío, espacios, signos, exponentes, hexadecimal, infinito y fracciones. Conservar tipos de salida numéricos.
2. Conservar defaults del servicio `page ?? 1`, `pageSize ?? 25`; quitar clamps que reparan solicitudes inválidas. Antes de Prisma, comprobar offset `(page - 1) * pageSize` entero seguro no negativo y no mayor que `MAX_ORDER_QUERY_OFFSET` (B03).
3. Conservar formatos útiles: fecha `YYYY-MM-DD` o timestamp `YYYY-MM-DDTHH:mm:ss[.SSS]` con `Z` o offset `±HH:mm` explícito. Fracción opcional de 1–3 dígitos. No aceptar texto libre, timestamp sin zona ni fecha imposible.
4. Comprobar calendario real: `2026-02-30` debe fallar aunque `Date` lo normalice. Validar componentes antes de convertir; no confiar únicamente en regex o timestamp finito.
5. Fecha sin hora equivale a medianoche UTC, como hoy. `to` sigue siendo inclusivo **a ese instante**, no a fin del día. No convertir el filtro en día completo sin nueva decisión de producto.
6. Mantener `from`/`to` como strings en el contrato público; usar el mismo parser puro para comprobarlos y construir las fechas del filtro. Comparar sus timestamps para rechazar rango invertido con `400 VALIDATION_ERROR`.

**Pruebas:** defaults; página/tamaño válidos; `abc`, `Infinity`, `1.5`, `0`, `-1`, vacío, espacios, `1e3`, `0x10`, entero inseguro y overflow de offset; fechas inexistentes, año bisiesto, offset distinto, un solo extremo, rango igual/invertido. Para una fecha sola comprobar `gte/lte` a medianoche UTC. En rechazo HTTP cero `order.count` / `order.findMany`.

### T06 — normalización y notas, sin elegir otros máximos

**Modificar:** `packages/contracts/src/orders.ts`, `execution.ts`, exportaciones; crear/extender `packages/contracts/src/validation-limits.ts` con `MAX_ORDER_NOTES_LENGTH=5000`. UI: `apps/web/src/modules/orders/composables/useOrderCreationSubmission.ts`, `modules/orders/views/OrderCreateWizardView.vue`, `modules/service-execution/composables/useExecutionNotes.ts`, `useUnitChecklists.ts` y formularios de corrección si envían los campos afectados. **Pruebas:** contratos `orders.test.ts`, nueva `execution.test.ts`; web composables correspondientes. Compartir la constante en contrato y UI, no copiar el literal por componente.

1. En crear/actualizar orden y unidad: aplicar `trim` antes de `nonEmpty` a `clientNameSnapshot`, `label`, `makeModel`, `serialNumber`. Persistir ese valor y comprobar duplicados sobre el valor normalizado. No convertir serie a mayúsculas/minúsculas ni exigir 17 caracteres de VIN.
2. No modificar `externalKey`, `clientSheetId` ni raw snapshots como efecto colateral de normalizar nombres. Su longitud/formato restante está en B01.
3. Aplicar máximo 5.000 a `CreateOrderSchema.generalNotes`, `UpdateOrderSchema.generalNotes`, `UpdateExecutionNotesSchema.notes`, `SaveChecklistItemSchema.notes` y `RequireCorrectionSchema.notes`. Mantener `optional`/`nullable` y el trim que ya existe; no añadir trim a notas que hoy conservan saltos/espacios de formato.
4. No ampliar topes más estrictos existentes: por ejemplo, motivo de ajuste de precio conserva 500. Otros campos no listados no reciben por inferencia un máximo nuevo.
5. Mostrar error antes de enviar en UI, sin truncar el texto. Ante rechazo del API conservar contenido y habilitar reintento; no limpiar formulario antes de éxito.

**Pruebas:** vacío efectivo rechazado y valor normalizado almacenado; edición parcial no borra omitidos; duplicado después de trim; notas null/omitidas/vacías según contrato actual; 5.000 unidades UTF-16 permitidas y 5.001 rechazadas, incluido emoji; Unicode/puntuación/espacios interiores conservados. Error del API mantiene el borrador y doble click no produce doble POST.

### T07 — compartir el año válido

**Modificar:** crear/extender `packages/contracts/src/validation-limits.ts`, `index.ts`, `orders.ts`; UI `useManualUnitConfiguration.ts`, `useAddOrderUnit.ts`, `OrderCreateWizardView.vue`, `AddOrderUnitModal.vue`. **Pruebas:** contratos de crear/agregar/actualizar unidad y composables correspondientes.

1. Centralizar `MIN_UNIT_YEAR=1900` y `getMaxUnitYear(now?: Date)`: año de `America/Hermosillo` + 1. Probar helper con reloj inyectado; usarlo también en validación evaluada por request.
2. Exigir entero finito en crear, agregar y actualizar unidad; permitir null/omitido como hoy. No endurecer el schema de lectura histórica.
3. Usar la misma regla/rango en UI; un año inválido informa error y no agrega ni envía la unidad. Eliminar la conversión silenciosa a null de `useManualUnitConfiguration`.
4. No capturar el máximo en una constante calculada una sola vez al importar el módulo. Mantener rango vigente al cruzar cambio de año.

**Pruebas:** 1900, 1899, máximo dinámico y máximo + 1, fracción, NaN/infinito, null/omitido y rollover de año según zona de negocio. Probar wizard y modal mediante sus composables; mantener el formulario tras error.

### T08a — importes exactos y totales persistibles

**Modificar:** `packages/contracts/src/orders.ts` (`PricingRateOverrideSchema`), `order-read-models.ts` si requiere separar lectura; API `modules/orders/pricing.ts`, `order-pricing.service.ts` y callers de `calculateOrderPricing` en finalización. **Pruebas:** `orders.test.ts` de contratos, `pricing.test.ts`, `order-pricing.service.test.ts`, `execution.test.ts`.

1. Para entrada HTTP de overrides: antes de convertir a decimal exigir cadena de longitud acotada y forma `^\d{1,8}(\.\d{1,2})?$`. Punto decimal, cero válido, sin conversión mediante `Number`/`parseFloat`. No alterar redondeo financiero existente de los cálculos (`ROUND_HALF_UP`).
2. `OrderPricingOverridesSchema` también se usa dentro de `OrderAdministrationDetailSchema`: antes de endurecerlo, crear `OrderPricingOverridesReadSchema` en `orders.ts` con la estructura y validaciones previas de lectura, y usarlo únicamente en `order-read-models.ts`. Mantener el schema público de entrada con los límites nuevos; no introducir 500 al consultar JSON histórico fuera de esos límites. Los tipos y la forma de las respuestas no cambian.
3. Agregar guard común para campos Decimal calculados que se persistirán: unitRate cuando exista, baseCost, departureCost, travelExpenses y total. Exigir finitos, no negativos y <= `99999999.99` usando `Prisma.Decimal`.
4. Aplicar guard a todos los caminos de cálculo/callers antes de cambios, auditoría, outbox o generación de reportes. Overflow → `400 PRICING_AMOUNT_OUT_OF_RANGE`; no saturar al máximo ni convertir el exceso en tarifa cero.
5. Un override almacenado en borrador no garantiza que su total futuro sea persistible. No cambiar el momento del cálculo del cierre como parte de esta tarea.

**Pruebas:** `0`, `0.00`, máximo válido, más de ocho dígitos, tres decimales, 4.000 dígitos, negativo, exponente y coma. Dos equipos con tarifa máxima producen overflow controlado aunque la tarifa individual sea válida. Cubrir suma de viáticos, cero, tarifas faltantes según semántica actual y rollback/sin efectos del cierre y recálculo. Lectura histórica permanece accesible.

### T08b — conservar la entrada decimal en UI

**Modificar:** `apps/web/src/modules/orders/composables/useOrderPricingModal.ts`, `components/OrderPricingModal.vue` y `useOrderPricingModal.test.ts`. Ejecutar después de T08a.

1. Mantener las entradas de tarifas/viáticos como `string | null`, no `number | null`. Inicializar desde las cadenas recibidas, sin `parseFloat`; conservar botones de restablecer, null y herencia de tarifas actuales.
2. Sustituir los controles monetarios `NInputNumber` (que hoy tienen `precision=2`) por entrada textual con modo decimal. Conservar labels, prefijo monetario y distribución del modal; no rediseñar otros componentes.
3. Al enviar, validar cada cadena con el schema monetario compartido de T08a. Vacío equivale a ausencia/null según el payload actual; cero no equivale a vacío. No convertir con `Number`, usar `toFixed` ni redondear un tercer decimal silenciosamente.
4. Payload válido transmite la cadena exacta aceptada. Entrada inválida muestra error local, conserva el modal y no invoca `updatePricing`. No cambiar formato de moneda de solo lectura como efecto colateral.

**Pruebas:** máximo, máximo + 0.01, `1.234`, `Infinity`, negativo, coma, cero, vacío, reset a tarifa heredada, error de API y doble envío. `1.234` permanece disponible para corregir después del rechazo; no se convierte en `1.23`. Adaptar fixtures numéricos existentes a las nuevas entradas textuales sin eliminar sus escenarios.

### T09 — cupos de orden, incluido acceso concurrente

**Modificar:** constantes en `validation-limits.ts`, esquemas `CreateOrderSchema` / `CreateUnitSchema`; API nuevo `modules/orders/order-item-limits.ts`, `orders.service.ts` (`createOrder`, `addUnit`, `assignEquipment`). **Pruebas:** contratos, `orders.test.ts`, nueva `modules/orders/order-item-limits.database.integration.test.ts`.

1. En creación: validar <=100 unidades y suma de equipos <=500 antes de preparar inventario o escribir. En agregar una unidad, acotar equipos entrantes pero no confundir ese límite con el total actual de la orden.
2. Para `addUnit` y `assignEquipment`, dentro de la transacción del método: bloquear la fila padre de `Order`, releer estado/pertenencia necesarios, contar unidades y equipos, comprobar total posterior y escribir. Todas las rutas que aumentan conteos deben usar la misma estrategia.
3. Diseño fijado: lock de fila `SELECT ... FOR UPDATE` sobre `Order`, por ID UUID parametrizado con `Prisma.sql`/tag seguro, antes de contar. No interpolar cadenas SQL ni usar `queryRawUnsafe`; no cambiar globalmente aislamiento/versionado ni añadir contadores persistidos/migraciones.
4. Mantener resolución de catálogo fuera del lock. Mantener creación, auditoría y rollback dentro de `domainTransaction`. El lock común serializa altas sobre una misma orden; un count seguido de create en cualquier transacción **sin lock común** no cumple esta tarea. Referencia: [PostgreSQL row-level locks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS).
5. Schema inválido → `400 VALIDATION_ERROR`; cupo actual excedido en servicio → `400 ORDER_UNIT_LIMIT_EXCEEDED` / `ORDER_EQUIPMENT_LIMIT_EXCEEDED`. Lectura y eliminación de registros históricos no quedan bloqueadas por un cupo excedido.
6. La reprogramación es una excepción histórica explícita: clona los datos origen sin truncar ni aplicar retroactivamente topes de nuevas entradas. No cambia límites de `createOrder`, `addUnit` o `assignEquipment`; agregar nuevo contenido se valida contra el total resultante. Probar la copia exacta de registros por encima del límite.

**Pruebas:** 100/101 unidades; 500/501 equipos distribuidos en varias unidades; agregar a orden con 99/100 unidades y 499/500 equipos; unidad con equipos que excede el total; rollback tras error. En PostgreSQL aislado, dos altas concurrentes con un cupo restante producen un éxito y un rechazo; el conteo final no excede el máximo y la petición rechazada no persiste auditoría. No usar `sleep` como sincronización ni mocks como prueba de exclusión real.

**Condición de cierre:** evidencia de concurrencia con DB válida, no suite omitida. Sin ambiente aislado, tarea queda PARCIAL aunque unitarias pasen.

### T10 — checklist y dimensiones declaradas

**Modificar:** `packages/contracts/src/execution.ts`, límites compartidos e imports del validador de imágenes. **Pruebas:** nueva `packages/contracts/src/execution.test.ts`, API `execution.test.ts`, `execution.drive.test.ts` y router HTTP.

- Checklist: admitir 0–5 categorías **únicas**, derivando máximo del enum existente. Conservar updates parciales: no exigir cinco, no borrar categorías omitidas. Hoy un duplicado no crea dos filas por el índice único; hace dos upserts y gana el último valor. Rechazar la solicitud contradictoria antes de mutar.
- Conservar regla `BAD` → notas no vacías. `[]` mantiene su comportamiento actual; no cambiarlo por inferencia.
- `CompleteEvidenceSchema`: dimensiones omitidas siguen permitidas; cada dimensión enviada debe ser entero positivo finito. Si llegan ambas, comprobar producto <=40.000.000. Esto valida la declaración, **no prueba el contenido**.
- Drive binario: conservar verificación mediante Sharp y comparar headers enviados con dimensiones reales; probar ambas cabeceras inválidas y discrepancia. Persistir medidas reales.

**Pruebas:** checklist vacío/parcial/cinco únicas, duplicado/seis rechazado sin escrituras; parcial conserva categorías no enviadas. Dimensiones 0/negativa/fraccionaria/NaN/infinita, producto exacto/excedido, omitidas y mismatch real. No fabricar imágenes de 40 MP en cada unitaria: probar aritmética con fixtures de metadatos y reservar decodificación grande para pruebas acotadas de recursos.

**Cierre parcial de evidencia:** T10 no resuelve que el flujo legacy confíe en metadatos. T11 es obligatoria para declarar verificado el archivo real en ambos proveedores.

## 5. Tareas condicionadas y cobertura restante

### T11 — verificación real de evidencia legacy (diseño B04 resuelto)

**Superficies verificadas:** `ExecutionMediaService.completeEvidence`, `ObjectStoragePort` en `integrations/ports.ts`, `object-storage/s3.client.ts`, `dev-mock-storage.client.ts`, `disabled.client.ts`, `resilience/circuit-breaker.ts` y mocks de ejecución/reportes.

Extender `ObjectStoragePort` con una operación explícita de lectura limitada (no reutilizar ciegamente `getObject` ilimitado), implementada por S3, mock de desarrollo y adapter deshabilitado. La API recibe el límite efectivo en bytes; un tamaño conocido por `HEAD` sobre el máximo permite rechazo temprano, pero la lectura stream mantiene su propio contador y corta al primer byte excedente. Definir `ObjectTooLargeError` tipado y excluirlo de los fallos del circuit breaker, propagándolo con el contrato de error ya existente `400 FILE_TOO_LARGE`. El almacenamiento ausente conserva `null`; errores reales del proveedor continúan por la ruta actual.

Secuencia requerida: cargar evidencia → autorizar actor/orden → comprobar existencia/tamaño permitido → leer bytes de forma acotada con el límite efectivo de instancia → validar MIME real, decodificación y máximo de píxeles → comparar medidas opcionales declaradas → persistir `COMPLETED` y dimensiones reales. Toda validación fallida deja la evidencia sin finalizar. Conservar el modo legacy deshabilitado cuando Drive está seleccionado.

**Pruebas necesarias:** objeto ausente, cuerpo corrupto/MIME discordante, tamaño real mayor que HEAD, límite de bytes durante lectura, píxeles excedidos, medidas declaradas distintas y dimensiones omitidas. Probar que el contenido inválido no finaliza evidencia ni abre circuit breaker como si el proveedor estuviera caído. Usar adaptadores simulados; ninguna operación AWS real está autorizada por el plan.

### T12 — campos restantes y matriz ampliada

- B01 está decidido e implementado según la tabla de políticas. Completar su evidencia de fronteras en la matriz: **campo → máximo → normalización → null/omitido → schema/UI → límite y límite +1**. No agrupar strings sin criterio.
- Alinear OpenAPI generado y mensajes/UI de las tareas anteriores; revisar el wizard, modal de agregar unidad y precios sin pérdida de borrador. Los errores de `validate` son 400; un 422 simulado es solo una regresión de manejo genérico de errores, no un nuevo contrato HTTP.
- La matriz pendiente de issue #41 requiere escenarios individuales: estados/roles, sesión vencida, red caída, rollback/concurrencia, fallas de integraciones, exportaciones/HTML/fórmulas y memoria de archivos en móvil. Por cada escenario registrar fixture, ambiente, pasos, esperado y prueba automatizada/manual.
- No convertir esa matriz en una instrucción abierta de “hacer auditoría completa”. Un escenario no ejecutado queda PENDIENTE y la cobertura no se afirma exhaustiva.

### T12 — matriz parcial: autorización, roles, estados y sesión

| ID      | Fixture y pasos                                                                                                                                                                                          | Resultado esperado                                                                                                                                                                    | Evidencia automatizada                                                                                                                                                                | Estado                                             |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| AUTH-01 | Actor técnico autenticado ejecuta una acción sobre unidad/equipo existentes que pertenecen a otra orden; repetir con unidad ausente.                                                                     | `404 UNIT_NOT_FOUND` antes de mutación; cadena válida en la orden propia continúa.                                                                                                    | T01: Supertest sobre router y servicios/política reales con principal inyectado; rechazos sin `$transaction`; API 119 focalizadas y 198 ampliadas PASS.                               | VERIFICADO (mock)                                  |
| AUTH-02 | Comparar ADMIN, técnico individual asignado y técnico individual no asignado al consultar completeness; intentar falsificar actor en query/body.                                                         | ADMIN y asignado acceden; ajeno recibe `403 FORBIDDEN` antes de leer requisitos; query/body no sustituyen al principal autenticado.                                                   | T02: router/servicio reales y Prisma mock; API 72 focalizadas y 99 ampliadas PASS.                                                                                                    | VERIFICADO (mock)                                  |
| AUTH-03 | Actor de cuenta compartida activa y orden asignada a técnico; evaluar `assertOrderAccess` en `DRAFT`, `ASSIGNED`, `IN_PROGRESS`, `REQUIRES_CORRECTION`, `COMPLETED`, `FAILED_APPOINTMENT` y `CANCELLED`. | Solo `ASSIGNED`, `IN_PROGRESS` y `REQUIRES_CORRECTION` permiten acceso compartido. Estado no elegible o falta de técnico asignado → `403 FORBIDDEN`. No limitar por `shared.orderId`. | `apps/api/src/auth/order-access-policy.test.ts`: matriz explícita de siete estados con mocks. Ejecución conjunta con auth: 21 PASS / 2 archivos. Capa de política, no integración DB. | VERIFICADO (unitario)                              |
| AUTH-04 | Emitir access token firmado con clave efímera de desarrollo y TTL pasado; solicitar `/protected` con `authenticate` real.                                                                                | `401 UNAUTHENTICATED`; no consultar resolver de principal ni ejecutar handler protegido.                                                                                              | `apps/api/src/auth/authenticate.test.ts`: JWT real con TTL `-1m`; 8 PASS en archivo. Sin secretos ni servicios externos.                                                              | VERIFICADO (HTTP local)                            |
| AUTH-05 | Token válido con principal inexistente/inactivo, token inválido y falla del resolver.                                                                                                                    | Principal revocado → `401 SESSION_REVOKED`; token inválido → `401 UNAUTHENTICATED`; autoridad indisponible → `503 AUTHORITY_UNAVAILABLE`; no ejecutar handler.                        | Casos existentes de `authenticate.test.ts`; mismo comando focalizado de AUTH-04.                                                                                                      | VERIFICADO (HTTP local con dependencias simuladas) |

**Verificación de esta ampliación (2026-10-14):** `TEST_DATABASE_URL='' DOTENV_CONFIG_PATH=/dev/null pnpm --filter @puk/api test src/auth/order-access-policy.test.ts src/auth/authenticate.test.ts` → **21 PASS / 2 archivos**, exit 0. La clave de pruebas se genera dentro del test; no hubo DB, secretos ni servicios remotos.

**Límites:** los casos de órdenes usan principal autenticado inyectado y Prisma simulado; solo expiración ejercita `TokenService` y `authenticate` mediante HTTP local. No se prueba PostgreSQL, navegador, rotación de refresh token ni revocación distribuida. AUTH-03 cubre elegibilidad de acceso compartido; los estados permitidos para cada mutación permanecen en las pruebas específicas T01–T12. La matriz total sigue parcial.

### T12 — matriz parcial: red, reintentos e idempotencia

| ID     | Fixture y pasos                                                                                                                         | Resultado esperado                                                                                                                                                   | Evidencia automatizada                                                                                                                                                                                                                                 | Estado                                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| NET-01 | Iniciar la creación de orden en wizard; mantener request pendiente, intentar doble click y luego rechazar la promesa como error de red. | No lanzar dos requests mientras la primera está pendiente. Tras fallo, conservar borrador/campos y permitir corregir o reintentar; no navegar como si hubiera éxito. | `useOrderCreationSubmission.test.ts`: rejection con mensaje genérico, draft preservado y single-flight mientras está pending. Está mockeado el API, no el transporte real. Suite junto a NET-03: 21 PASS / 3 archivos.                                 | PARCIAL (composable)                     |
| NET-02 | Servidor confirma `POST /orders`, pero cliente pierde la respuesta y reintenta el mismo payload.                                        | Una sola orden lógica: replay devuelve el mismo resultado; misma clave con payload distinto debe rechazarse sin segunda mutación.                                    | `order-item-limits.database.integration.test.ts`: solicitudes concurrentes reales en PostgreSQL `puk_test` crean una fila y auditoría; replay tras commit devuelve el mismo ID; payload diferente produce 409. Combinado con 14 pruebas web y 111 API. | VERIFICADO (PostgreSQL local + unit/API) |
| NET-03 | Reintentar carga de la misma evidencia/firma tras timeout/error y volver a enviar el mismo archivo.                                     | Reutilizar la misma clave idempotente; solo limpiar clave tras éxito. Evitar nueva identidad de carga durante retry.                                                 | `evidence-upload-retry.test.ts` y `api.idempotency.test.ts`: claves reusadas/persistidas y envío del header; grupos web focalizados **21 PASS / 3 archivos**. Almacenamiento browser simulado.                                                         | VERIFICADO (unitario cliente)            |
| NET-04 | Rechazar por error de red una mutación de notas/checklist/discrepancia y observar la UI/modal antes del reintento.                      | No borrar borrador ni indicar éxito; permitir nuevo intento explícito. No afirmar que un retry después de commit sea seguro sin idempotencia server-side.            | Manejo de errores está en los callers, pero no se ejecutó una matriz UI para todos estos flujos en esta pasada.                                                                                                                                        | PENDIENTE (UI por flujo)                 |

**Comando y resultado (2026-10-14):** `pnpm --filter @puk/web exec vitest run src/modules/orders/composables/useOrderCreationSubmission.test.ts src/modules/service-execution/evidence-upload-retry.test.ts src/modules/service-execution/api.idempotency.test.ts` → **21 PASS / 3 archivos**, exit 0. Tests Vue/composable y storage mockeados; no browser real, proxy que corta la conexión ni PostgreSQL. El test de submit verifica promesa rechazada y draft, pero no demuestra que un timeout ocurra después de que el servidor haya confirmado la transacción.

**Decisión aprobada e implementada parcialmente:** `POST /orders` exige un `Idempotency-Key` UUID. El wizard conserva en `sessionStorage` la clave asociada al payload serializado y la limpia tras éxito; cambios en el borrador generan una clave nueva. El API guarda clave y huella SHA-256 en la fila de la orden, con unicidad por creador. Mismo creador/clave/huella devuelve la orden existente; misma clave con otra huella produce `409 IDEMPOTENCY_KEY_REUSED`. La restricción única resuelve solicitudes simultáneas mediante recuperación del ganador tras `P2002`. Falta ejecutar y probar esta carrera en PostgreSQL aislado; no aplicar la migración ni usar una base sin autorización y aislamiento confirmados.

## 6. Comandos de verificación

Ejecutar desde la raíz. Estos comandos son instrucciones futuras; **no son resultados de esta revisión del plan**.

### Preparación

```bash
# API/web consumen dist de contratos: reconstruir antes de sus pruebas.
pnpm --filter @puk/contracts build
```

Los scripts API cargan dotenv; además alguna integración DB carga `.env` explícitamente. No existe una barrera global de red en la suite. Para pruebas unitarias focalizadas, usar los mocks actuales y `TEST_DATABASE_URL='' DOTENV_CONFIG_PATH=/dev/null`. Eso evita activar suites DB por dotenv, pero **no sustituye** inyectar puertos simulados ni autoriza leer archivos de secretos.

### Grupos por tarea

```bash
# T01–T02: autorización/pertenencia y propagación del actor.
TEST_DATABASE_URL='' DOTENV_CONFIG_PATH=/dev/null pnpm --filter @puk/api test \
  src/modules/execution/execution.test.ts \
  src/modules/execution/execution.router.drive.test.ts \
  src/modules/execution/execution.router.test.ts \
  src/auth/order-access-policy.test.ts \
  src/modules/orders/orders.test.ts \
  src/modules/orders/orders.router.test.ts

# T03–T04: parser y middleware HTTP, además de argumentos/reintentos.
TEST_DATABASE_URL='' DOTENV_CONFIG_PATH=/dev/null pnpm --filter @puk/api test \
  src/middleware/error-handler.test.ts \
  src/modules/execution/execution.router.test.ts \
  src/modules/execution/execution.router.drive.test.ts
pnpm --filter @puk/web exec vitest run \
  src/modules/service-execution/api.idempotency.test.ts \
  src/modules/service-execution/evidence-upload-retry.test.ts

# T05–T10: seleccionar el archivo relevante, no una suite vacía.
pnpm --filter @puk/contracts exec vitest run src/orders.test.ts src/execution.test.ts
TEST_DATABASE_URL='' DOTENV_CONFIG_PATH=/dev/null pnpm --filter @puk/api test \
  src/modules/orders/orders-query.service.test.ts \
  src/modules/orders/orders.router.test.ts \
  src/modules/orders/pricing.test.ts \
  src/modules/orders/order-pricing.service.test.ts \
  src/modules/orders/orders.test.ts \
  src/modules/execution/execution.test.ts \
  src/modules/execution/execution.drive.test.ts
pnpm --filter @puk/web exec vitest run \
  src/modules/orders/composables/useManualUnitConfiguration.test.ts \
  src/modules/orders/composables/useAddOrderUnit.test.ts \
  src/modules/orders/composables/useOrderCreationSubmission.test.ts \
  src/modules/orders/composables/useOrderPricingModal.test.ts \
  src/modules/service-execution/composables/useUnitChecklists.test.ts
```

`error-handler.test.ts`, `execution.router.test.ts`, contratos `execution.test.ts` y el test DB de cupos son **archivos nuevos propuestos**, no pruebas ya existentes. Crearlos en su tarea; si un filtro no descubre pruebas, registrar error de verificación, no éxito.

### DB y cierre del conjunto

- Para la nueva integración DB, copiar el guard estricto de `inventory.database.integration.test.ts`: hostname `localhost`/`127.0.0.1`/`[::1]` y pathname **exacto** `/puk_test`. No copiar el guard más débil que solo usa `includes('/puk_test')`.
- Ejecutar solo con URL local de prueba explícitamente proporcionada/autorizada. No obtenerla de configuración remota ni ambiente desconocido; no incluirla en la evidencia. Setup/migraciones de esa DB requieren su propio alcance autorizado.
- `pnpm --filter @puk/api test src/modules/orders/order-item-limits.database.integration.test.ts` es el comando de T09 una vez preparado ese ambiente. Ausencia de DB → **SKIPPED**, nunca PASS.
- Antes de cierre integral: suites afectadas completas, `pnpm typecheck`, `pnpm docs:validate`, `pnpm build`, lint/formato de archivos modificados. Registrar baseline y fallas ajenas; no resolverlas con cambios fuera de alcance.
- No ejecutar `test:e2e:opaque`, scripts de staging ni AWS/Drive/Sheets reales. Para navegador, definir un fixture local totalmente simulado y un escenario explícito antes de correrlo.

## 7. Registro de avance y evidencia

Actualizar este registro por tarea. El prompt del siguiente modelo debe señalar **un único ID** y su estado. No completar checkboxes por haber escrito código sin ejecutar sus pruebas.

| Tarea | Estado de ejecución | Evidencia                                                                                                                                 | Pendiente                               |
| ----- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| T01   | VERIFICADA          | 9 fallos esperados antes; 119 focalizadas y 198 ampliadas PASS después                                                                    | Ninguno para T01; T02 sigue sin iniciar |
| T02   | VERIFICADA          | 15 fallos esperados antes; 72 focalizadas y 99 ampliadas PASS después                                                                     | Ninguno para T02                        |
| T03   | VERIFICADA          | 4 fallos esperados antes; 13 focalizadas y 43 ampliadas PASS después                                                                      | Ninguno para T03                        |
| T04   | VERIFICADA          | 15 fallos esperados antes; 43 HTTP y 127 ampliadas PASS después                                                                           | Ninguno para T04                        |
| T05   | VERIFICADA          | 129 contratos; 91 API query/router; 4 probes PostgreSQL read-only PASS; typechecks, ESLint, Prettier y diff-check PASS                    | Ninguno para T05                        |
| T06   | VERIFICADA          | 6 fallos esperados antes; 128 contratos/web focalizadas PASS después                                                                      | Ninguno para T06                        |
| T07   | VERIFICADA          | Contratos 111, UI 13, API 103 PASS; typechecks PASS                                                                                       | Ninguno para T07                        |
| T08a  | VERIFICADA          | Contratos 146, API 579 PASS; root repitió focalizadas 119 + 83 PASS                                                                       | Ninguna para T08a                       |
| T08b  | VERIFICADA          | Regresión 10 FAIL/7 PASS; final 17 PASS; typecheck y formato PASS                                                                         | Ninguna para T08b                       |
| T09   | VERIFICADA          | Contratos 120; API 50 límites/reprogramación PASS; PostgreSQL 4 PASS (concurrencia unidades/equipos, rollback e idempotencia)             | Ninguno para T09                        |
| T10   | VERIFICADA          | Contratos 4, API 117 PASS; T11 valida contenido legacy                                                                                    | Ninguna para T10                        |
| T11   | VERIFICADA          | 7 archivos, 131 PASS; typecheck/build/lint/format PASS                                                                                    | Ninguna; sin proveedor AWS real         |
| T12   | PARCIAL             | B01: contratos 136 + UI 46 PASS. Auth/roles/estados/sesión: 21 API PASS. NET-02 API/web: 125 focalizadas PASS + 2 pruebas PostgreSQL PASS | NET-01/NET-04 y resto de la matriz      |

Estados válidos: NO INICIADA, EN CURSO, VERIFICADA, PARCIAL, BLOQUEADA. Las pruebas se reportan PASS/FAIL/SKIPPED con conteo real cuando lo produzca la herramienta.

### T01 — preflight de implementación (2026-10-14)

- Base: `eec85d3332b9f389f7df20a976046c02139f5ee1`.
- Verificación inicial: `test -f apps/api/src/generated/prisma/client.ts` confirmó ausencia del cliente; se registró **BLOQUEADO_ENTORNO** antes de empezar.
- Resolución autorizada: generación local con `DOTENV_CONFIG_PATH=/dev/null`, `TEST_DATABASE_URL=''` y `DIRECT_URL`/`DATABASE_URL` ficticias en loopback (puerto 1). `pnpm exec prisma generate`: PASS, Prisma Client 7.10.0. `pnpm --filter @puk/contracts build`: PASS. Sin lectura de secretos, conexión a DB, migraciones ni seeds.
- Baseline antes de editar código: grupo de cinco archivos existente de ejecución, router Drive, política de acceso y órdenes; **89 pruebas PASS**, exit 0. `pnpm --filter @puk/api typecheck`: PASS, exit 0.
- Estado actual: **VERIFICADA — TERMINADA**; el bloqueo de ambiente quedó resuelto y se completaron las comprobaciones de T01.

### T01 — evidencia de implementación (2026-10-14)

**Causa confirmada:** los tres métodos comprobaban equipo→unidad, pero no unidad→orden. Con la orden A accesible/editable y la unidad/equipo existentes de B, la operación podía escribir sobre B usando el contexto de A.

**Cambio:** después de autorización/estado existentes, `orderUnit.findUnique` comprueba existencia y `unit.orderId === orderId`. Ausencia o pertenencia ajena produce `404 UNIT_NOT_FOUND` antes de consultar equipo o abrir la transacción. Después se mantiene la comprobación equipo→unidad, mutación y auditoría actuales. No se modificaron políticas de acceso ni estados.

**Archivos modificados:**

- `apps/api/src/modules/execution/execution.service.ts` — guards de verificar y discrepancia.
- `apps/api/src/modules/orders/orders.service.ts` — guard de desasignación.
- `apps/api/src/modules/execution/execution.test.ts` — matriz de pertenencia, actor activo, precedencia de acceso/estado y éxitos admin/individual/compartido; dos fixtures válidos existentes completados con su unidad.
- `apps/api/src/modules/execution/execution.router.test.ts` — nuevo harness HTTP de verificación/discrepancia con router, servicios y política reales.
- `apps/api/src/modules/orders/orders.test.ts` — matriz de desasignación y auditoría.
- `apps/api/src/modules/orders/orders.router.test.ts` — rechazo HTTP de cadena ajena y éxito de cadena válida; formato mecánico de una aserción anterior, sin cambio de comportamiento.

**Regresión antes de corregir servicios:**

```bash
TEST_DATABASE_URL='' DOTENV_CONFIG_PATH=/dev/null pnpm --filter @puk/api test \
  src/modules/execution/execution.test.ts \
  src/modules/execution/execution.router.test.ts \
  src/modules/orders/orders.test.ts \
  src/modules/orders/orders.router.test.ts
```

Exit **1**: **9 FAIL / 98 PASS**, 4 archivos. Seis pruebas de unidad ausente/ajena resolvían la operación en vez de rechazar. Tres reproducciones HTTP de cadena ajena respondían verify **200**, discrepancy **201** y removal **200** en vez de **404 UNIT_NOT_FOUND**. Son fallos funcionales esperados, no errores de imports ni fixtures inactivos.

**Verificación después de corregir:**

```bash
TEST_DATABASE_URL='' DOTENV_CONFIG_PATH=/dev/null pnpm --filter @puk/api test \
  src/modules/execution/execution.test.ts \
  src/modules/execution/execution.router.test.ts \
  src/modules/execution/execution.router.drive.test.ts \
  src/auth/order-access-policy.test.ts \
  src/modules/orders/orders.test.ts \
  src/modules/orders/orders.router.test.ts

# Verificación ampliada repetida por el coordinador.
TEST_DATABASE_URL='' DOTENV_CONFIG_PATH=/dev/null pnpm --filter @puk/api test \
  src/modules/execution src/modules/orders src/auth/order-access-policy.test.ts

DOTENV_CONFIG_PATH=/dev/null pnpm --filter @puk/api typecheck
```

Resultados: focalizadas **119 PASS / 6 archivos**, exit **0**; ampliadas **198 PASS / 14 archivos**, exit **0**; typecheck API **PASS**, exit **0**. ESLint y `prettier --check` sobre los seis archivos de aplicación indicados arriba: **PASS**, exit **0**; `git diff --check`: **PASS**, exit **0**. Formato del plan también verificado.

**Frontera y efectos:** Express/Supertest atraviesa routers y validadores reales con principal autenticado inyectado, Prisma simulado y almacenamiento de desarrollo simulado. En los rechazos se comprueba que `$transaction` no se ejecuta; no hay mutación, auditoría ni outbox transaccionales. En éxitos se comprueban las escrituras y auditoría del mock **dentro** del callback, incluidas las identidades correctas de orden/unidad/equipo. La desasignación conserva autorización administrativa en el router; el acceso de técnico compartido no se endurece.

**Rollback:** retirar únicamente los tres guards de pertenencia, los nuevos bloques de pruebas de ownership, el nuevo `execution.router.test.ts` y las dos adiciones de fixture de unidad válida. Revertir la evidencia/estado de T01 en este documento. No retirar políticas, transacciones, inventario ni cambios anteriores.

**Limitaciones:** pruebas con persistencia/puertos simulados, sin conexión a DB real ni prueba de concurrencia PostgreSQL. No se ejecutaron despliegues, migraciones, seeds, operaciones remotas ni pruebas de producción. No hubo commit. Esta verificación cierra **solo T01**; completeness y los demás hallazgos continúan pendientes en T02–T12.

### T02 — autorización de completeness (2026-10-14)

**Causa confirmada:** `GET /orders/:id/completeness` aceptaba una orden sin transmitir el actor. `OrderFinalizationService.validateCompleteness` consultaba la orden y sus requisitos directamente, por lo que un técnico no asignado podía leer información de ejecución. El cierre ya autorizaba y validaba estado antes de completar; esa precedencia se conserva.

**Cambio:** la firma interna de `validateCompleteness` ahora requiere `(userId, role, orderId)`, sin sobrecarga actorless. El router transmite exclusivamente `request.auth`; el servicio valida acceso con `loadAccessibleExecutionOrder` antes de cargar unidades, equipos, evidencia, checklist y firma. `completeOrder` propaga el actor a esa misma comprobación tras conservar su autorización/transición inicial. No se añadieron restricciones de estado al GET ni se cambió `evaluateOrderCompleteness` o su respuesta.

**Archivos de T02:**

- `apps/api/src/modules/execution/execution.router.ts` — pasa identidad autenticada al servicio.
- `apps/api/src/modules/execution/execution.service.ts` — exige actor en fachada y lo propaga.
- `apps/api/src/modules/execution/order-finalization.service.ts` — autoriza antes de leer requisitos y transmite actor desde el cierre.
- `apps/api/src/modules/execution/execution.test.ts` — regresiones service: técnico ajeno, orden ausente, admin/asignado permitidos y política compartida por estado; rechazo previo a lectura completa.
- `apps/api/src/modules/execution/execution.router.test.ts` — solicitudes HTTP reales con actor autorizado/ajeno, intentos de falsificar actor mediante query/body y forma de respuesta sin cambios.
- `apps/api/src/modules/execution/execution.router.drive.test.ts` — aserción de forwarding de actor y UUID de orden; ajuste mecánico de formato Prettier en una prueba existente, sin cambio conductual.

**Regresión antes de implementar:**

```bash
TEST_DATABASE_URL='' DOTENV_CONFIG_PATH=/dev/null pnpm --filter @puk/api test \
  src/modules/execution/execution.test.ts \
  src/modules/execution/execution.router.test.ts \
  src/modules/execution/execution.router.drive.test.ts
```

Exit **1**: **15 FAIL / 57 PASS**, tres archivos. Las rutas y servicios no autorizaban antes de leer requisitos; el acceso compartido en estados no elegibles también resolvía; y fallaban las comprobaciones de transmisión del actor. El cierre previo y regresiones de T01 pasaban. No fueron errores de fixture/importación. Log de la fase roja: `/tmp/t02-red.log`.

**Verificación después:** el mismo grupo focalizado: **72 PASS**, tres archivos, exit **0**. Suite de ejecución y política:

```bash
TEST_DATABASE_URL='' DOTENV_CONFIG_PATH=/dev/null pnpm --filter @puk/api test \
  src/modules/execution src/auth/order-access-policy.test.ts
```

Resultado: **99 PASS**, seis archivos, exit **0**. API typecheck, ESLint en los seis archivos de T02, Prettier `--check` y `git diff --check`: **PASS**, exit **0**.

**Frontera/efectos:** Supertest atraviesa el router real con principal simulado y Prisma inyectado. Rechazos de autorización/orden inexistente no consultan requisitos ni abren transacciones; el actor de query/body no sustituye al principal. No hubo conexión a DB ni cambios remotos.

**Rollback:** revertir la exigencia/propagación de actor en `execution.router.ts`, `execution.service.ts` y `order-finalization.service.ts`; retirar únicamente los nuevos escenarios completeness de `execution.test.ts`, `execution.router.test.ts` y `execution.router.drive.test.ts`. Mantener intactos los cambios previos de T01 en archivos compartidos.

**Limitaciones:** verificación con mocks, sin conexión a PostgreSQL real; no se probaron otros métodos de lectura de orden porque no pertenecen a T02. Sin commit, despliegue, migración ni operación remota. Estado final: **VERIFICADA**; las tareas T03–T12 continúan pendientes.

### T03 — errores del parser JSON (2026-10-14)

**Causa confirmada:** `express.json` entrega errores tipados para cuerpo malformado y límite excedido, pero el middleware los trataba como inesperados y respondía 500. El parser ya estaba configurado a 1 MiB y el envelope/respuesta genérica existentes deben conservarse.

**Cambio:** clasificar solo errores `Error` del parser con pares exactos `entity.parse.failed`/400 → `400 INVALID_JSON` y `entity.too.large`/413 → `413 PAYLOAD_TOO_LARGE`. `AppError` conserva prioridad; errores genéricos (incluidos `SyntaxError` o status 400 sin tipo exacto) siguen como 500 sanitizado. No se cambia límite ni middleware binario.

**Archivos:** `apps/api/src/middleware/error-handler.ts` y nuevo `apps/api/src/middleware/error-handler.test.ts`.

**Regresión previa:**

```bash
TEST_DATABASE_URL='' DOTENV_CONFIG_PATH=/dev/null pnpm --filter @puk/api test \
  src/middleware/error-handler.test.ts
```

Exit **1**: **4 FAIL / 9 PASS**, un archivo. JSON malformado y cuerpo de 1.048.577 bytes devolvían 500 en parser aislado y `createApp`; el límite de 1.048.576 bytes, error genérico con `SyntaxError`/status 400, detalles de `AppError` y error binario existente ya pasaban. Fallos esperados, no fixtures inactivos. Log: `/tmp/t03-red.log`.

**Verificación:** prueba focalizada: **13 PASS**, un archivo, exit **0**. Middleware/auth/routers reales: **43 PASS**, cinco archivos, exit **0**. Typecheck API, ESLint, Prettier `--check` y `git diff --check`: **PASS**, exit **0**.

**Frontera/efectos:** pruebas HTTP incluyen montaje real de `createApp` con dependencias simuladas y parser de producción. Cuerpos válidos de 1.048.576 bytes permitidos; 1.048.577 rechazado con 413; JSON inválido con 400. El handler de negocio/auth/servicio no se ejecuta en los rechazos. Se confirma envelope público y ausencia de detalles internos. Sin acceso a DB o integraciones remotas.

**Rollback:** retirar la clasificación específica de parser en `error-handler.ts` y borrar `error-handler.test.ts`; no tocar `express.json`, handlers binarios ni las pruebas de otras tareas.

**Limitaciones:** el test de `createApp` inyecta servicios y principal simulados; no valida una DB real. Sin cambio de límite, commit, despliegue ni operación remota. Estado final: **VERIFICADA**; T04–T12 pendientes.

### T04 — validación de idempotencia en cargas binarias (2026-10-14)

**Causa confirmada:** ambos handlers llamaban `v.parse` sin captura para `Idempotency-Key`, convirtiendo ausencia/invalidez en 500. Las rutas no validaban params con sus contratos antes de parsear el binario, así que una carga grande podía responder 413 antes de informar el error de ID de ruta. Cliente web y reintentos ya conservan la clave UUID.

**Cambio:** helper local con `v.safeParse` devuelve UUID validado o `400 INVALID_IDEMPOTENCY_KEY`. Middleware local valida antes del parser binario en evidencia y firma; handler reutiliza el helper para transmitir la misma cadena al servicio. Se aplican `UnitParamsSchema` en evidencia y `IdParamsSchema` en firma. Orden: `router.use(requireAccess)` existente → validación de params → header → parser → handler. No se agregó estado global a `Request` ni se modificó la web.

**Archivos:** `apps/api/src/modules/execution/execution.router.ts` y `apps/api/src/modules/execution/execution.router.test.ts`. Regresión de cliente: `apps/web/src/modules/service-execution/api.idempotency.test.ts`.

**Regresión previa:**

```bash
TEST_DATABASE_URL='' DOTENV_CONFIG_PATH=/dev/null pnpm --filter @puk/api test \
  src/modules/execution/execution.router.test.ts \
  src/modules/execution/execution.router.drive.test.ts
```

Exit **1**: **15 FAIL / 28 PASS**, dos archivos (una suite aprobada, una fallida). Claves ausentes/vacías/inválidas devolvían 500 en archivos pequeños; en archivos mayores, 413 llegaba antes de validar la clave/params. Los casos existentes de actor, cadena válida y argumentos continuaban pasando. Log: `/tmp/t04-red.log`.

**Verificación:** el grupo HTTP después: **43 PASS**, dos archivos, exit **0**; API idempotency client: **4 PASS**, un archivo; ejecución y parser: **127 PASS**, seis archivos. Typecheck API, ESLint y Prettier `--check` en los dos archivos de T04, y `git diff --check`: **PASS**, exit **0**.

**Frontera/efectos:** HTTP real en Express/Supertest atraviesa autenticación simulada, params, header, parser y handler. Matriz de endpoints de evidencia y firma cubre key ausente/vacía/malformada, params inválidos, precedencia frente a payload grande, límite binario configurado y UUID válido sin alterar. Servicio no se invoca en rechazo; middleware de autenticación precede validaciones. No se hicieron uploads remotos.

**Rollback:** retirar helper/middleware de header y validadores de params únicamente de estas dos rutas; eliminar los casos T04 agregados a `execution.router.test.ts`. Mantener tests y cambios T01/T02 en ese archivo y la lógica cliente.

**Limitaciones:** almacenamiento simulado; no hubo carga a S3/Drive real, DB, commit ni operación remota. Estado final: **VERIFICADA**; T05–T12 pendientes.

### T05 — gramática y rango de filtros (2026-10-14)

**Causa confirmada:** el contrato convertía directamente `page`/`pageSize` con `Number`, aceptando formas como exponentes, hexadecimal, espacios, infinitos/fracciones y valores inseguros. El servicio reparaba/clampaba entradas en vez de rechazarlas. Fechas se entregaban a `new Date` sin validar calendario ni rango, permitiendo normalización silenciosa y filtros incoherentes.

**Cambio:** contrato compartido valida dígitos decimales ASCII, enteros seguros, mínimo 1, tamaño máximo 100 y offset calculado seguro. Helper puro parsea fecha `YYYY-MM-DD` a medianoche UTC o timestamp con zona explícita y fracción de 1–3 dígitos; comprueba calendario/horas/offsets reales. Contrato exige `from <= to` como instantes. Servicio valida de nuevo datos directos antes de Prisma y usa las fechas parseadas; elimina clamps. `gte/lte` siguen inclusivos al instante (fecha sola conserva medianoche UTC). No se altera la salida numérica del contrato.

**Archivos:** `packages/contracts/src/orders.ts`, nuevo `packages/contracts/src/order-query-validation.ts`, `packages/contracts/src/index.ts`, `packages/contracts/src/orders.test.ts`, `apps/api/src/modules/orders/orders-query.service.ts`, `apps/api/src/modules/orders/orders-query.service.test.ts`, `apps/api/src/modules/orders/orders.router.test.ts`.

**Regresión previa:**

```bash
pnpm --filter @puk/contracts exec vitest run src/orders.test.ts
TEST_DATABASE_URL='' DOTENV_CONFIG_PATH=/dev/null pnpm --filter @puk/api test \
  src/modules/orders/orders-query.service.test.ts \
  src/modules/orders/orders.router.test.ts
```

Exit **1** en ambas fases: contratos **65 FAIL / 34 PASS**, API **45 FAIL / 30 PASS**. Capturaron formas numéricas inválidas, fechas calendario/rango inválidas, servicio que corregía entradas y offsets inseguros que llegaban a Prisma. No eran errores de carga. Logs: `/tmp/t05-contract-red.log`, `/tmp/t05-api-red.log`.

**Verificación:** build de contracts PASS; suite contractual **107 PASS**, un archivo; servicio/router API **83 PASS**, dos archivos; typecheck API, ESLint en los siete archivos listados, Prettier `--check` y `git diff --check`: **PASS**.

**Frontera/efectos:** pruebas de contrato y del servicio cubren parseo/calendario/rango/offset. Supertest confirma que queries inválidas responden `400 VALIDATION_ERROR` antes de `order.count`/`order.findMany`; fechas válidas producen `gte/lte` exactos, incluyendo medianoche UTC. Sin DB real.

**B03 / cierre (2026-10-16):** con Prisma Client/PrismaPg 7.10.0 y PostgreSQL local `puk_test` en modo de solo lectura, se inspeccionó el argumento `OFFSET` que el adaptador recibe. El compilador de Prisma trunca silenciosamente a uint32: `4.294.967.295` se conserva; `4.294.967.296` se convierte en `0`; `4.294.967.297` en `1`; `Number.MAX_SAFE_INTEGER` en `4.294.967.295`. Una consulta raw directa confirmó que PostgreSQL acepta esos offsets grandes, aislando la truncación en el camino cliente/adapter. Se añadió `MAX_ORDER_QUERY_OFFSET=4_294_967_295`, rechazado por contrato y servicio antes de consultar Prisma. El test DB no inserta fixtures ni escanea tablas: compara los parámetros OFFSET emitidos con filtros vacíos y confirma `transaction_read_only=on` y DB exacta `puk_test`.

**Verificación B03:** contratos `orders.test.ts` **129 PASS**; API `orders-query.service.test.ts` + `orders.router.test.ts` **91 PASS**; nueva prueba `orders-pagination.database.integration.test.ts` **4 PASS** en PostgreSQL local; typecheck contracts/API, ESLint focalizado, Prettier y `git diff --check` **PASS**. No se ejecutaron migraciones ni seeds en esta tarea.

**Rollback:** retirar schema/helper/exports de query, los guards/parser del servicio y los casos T05 de contratos, servicio y router; conservar bloques preexistentes de T01/T02/T04 en `orders.router.test.ts`.

**Limitaciones:** la observación está acotada a Prisma Client/PrismaPg 7.10.0; reevaluar el límite al actualizar estas versiones. No se ejecutaron migraciones, seeds, commits ni operaciones remotas. Estado final T05: **VERIFICADA**.

### T09 — registro previo de concurrencia (evidencia supersedida, 2026-10-16)

Este registro fue correcto antes de completar la verificación siguiente: en ese momento la integración tenía **2 PASS** (cupo de unidades e idempotencia), pero faltaban carrera del cupo de equipos y rollback. La actualización posterior de abajo reemplaza su estado parcial: T09 quedó **VERIFICADA** con cuatro pruebas PostgreSQL.

### T06 — normalización de texto y máximo de notas (2026-10-14)

**Causa confirmada:** los nombres/identificadores humanos obligatorios aceptaban espacios exteriores; notas aceptaban tamaño sin límite en varios esquemas. La UI podía enviar notas que el API ahora debe rechazar, sin conservar adecuadamente el borrador si se arreglara truncando.

**Cambio:** se agregó `MAX_ORDER_NOTES_LENGTH=5000` en contracts y se exportó para consumo web. `clientNameSnapshot`, `label`, `makeModel` y `serialNumber` hacen trim y rechazan vacío efectivo en create/update schemas. Notas tienen máximo compartido en orden create/update, ejecución, checklist y solicitud de corrección, manteniendo los `optional`/`nullable` y el trim ya existente de execution notes. UI comprueba tamaño antes de enviar, sin truncar y sin limpiar formularios/notas ante error; comparte el límite para creación, ejecución, checklist y ambos formularios de corrección. No se tocaron IDs externos ni snapshots raw.

**Archivos:** `packages/contracts/src/validation-limits.ts` (nuevo), `orders.ts`, `execution.ts`, `index.ts`, tests nuevos/extendidos `orders.test.ts`, `execution.test.ts`; web `useOrderCreationSubmission.ts/.test.ts`, `useExecutionNotes.ts/.test.ts`, `useUnitChecklists.ts/.test.ts`, `OrderExecutionView.vue`, `OrderDetailView.vue`.

**Regresión previa:** contracts mostró **3 fallos conductuales esperados / 132 PASS** más el suite nuevo que no importaba antes de crear el módulo de límite; web mostró **3 fallos / 173 PASS** porque creación, execution notes y checklist aún enviaban datos sobre límite. Sin logs persistentes; el resultado fue observado en terminal antes de editar.

**Verificación:** contracts build PASS; contracts **112 PASS / 2 archivos**; composables web **16 PASS / 3 archivos**; API órdenes **103 PASS / 2 archivos**; API módulos ejecución + órdenes modificados **217 PASS / 7 archivos**. API y web typecheck PASS; web production build PASS con advertencia de chunk `heic2any` (1,352.14 kB >500 kB); ESLint, Prettier `--check` en todos los archivos T06, `git diff --check`: PASS.

**Frontera/efectos:** pruebas de contrato/composables cubren límite 5.000 permitido/5.001 rechazado (incluyendo UTF-16), espacios de texto, rechazo local sin llamada API y preservación de borrador. API regresiones cubren schemas/servicios/rutas relevantes; sin DB. Los formularios de corrección quedaron validados por typecheck/build y revisión del guard en componente, no por prueba de componente dedicada.

**Rollback:** retirar módulo compartido/límites/esquemas/tests y guardas T06 de los tres composables y dos vistas. En los archivos con trabajo T05 compartido (`orders.ts`, `index.ts`, `orders.test.ts`), retirar solo los hunks de T06 y preservar schema/helper/export/query tests de T05.

**Limitaciones:** test del componente no montado para los dos formularios de corrección; validación cubierta por guard inspeccionado más typecheck y build web. No DB real ni cambio de datos históricos. Sin commit ni operación remota. Estado final: **VERIFICADA**.

### T07 — rango dinámico del año de unidad (2026-10-14)

**Causa confirmada:** los schemas de escritura permitían años hasta 2100, y `useManualUnitConfiguration` convertía silenciosamente años fuera de rango en `null`. El wizard/modal no compartían una regla dinámica de año negocio y podían aceptar valores que el contrato/API rechazara.

**Cambio:** se agregó `MIN_UNIT_YEAR=1900`, `getMaxUnitYear(now?)` y `isValidUnitYear` en `validation-limits.ts`, calculando el año de negocio en `America/Hermosillo` al momento de validar. CreateOrderUnit/CreateUnit/UpdateUnit usan entero seguro con límites compartidos y conservan null/omitido. UI wizard/modal usa min/max vigente, valida antes de agregar/enviar y no convierte entradas inválidas a null; el formulario se retiene ante rechazo.

**Archivos:** `packages/contracts/src/validation-limits.ts`, `index.ts`, `orders.ts`, `orders.test.ts`; web `useManualUnitConfiguration.ts/.test.ts`, `useAddOrderUnit.ts/.test.ts`, `OrderCreateWizardView.vue`, `AddOrderUnitModal.vue`. Los archivos compartidos contienen cambios previos T05/T06; rollback debe ser por hunk.

**Regresión previa:** suite de contracts: **1 FAIL / 137 PASS** en ocho archivos; la regresión esperaba `getMaxUnitYear` aún no exportado. Web suite: **177 PASS / 33 archivos** con regresiones esperadas adicionales en formularios/composables antes del cambio. API pre-cambio baseline informado por el implementador; root verificó posterior.

**Verificación independiente posterior:** contracts build PASS; contratos orders **111 PASS / 1 archivo**; web composables año **13 PASS / 2 archivos**; API orders **103 PASS / 2 archivos**. API y web typecheck PASS. Implementador además ejecutó builds API y web, ESLint, Prettier `--check` y `git diff --check`: PASS. Build web finalizó con advertencia de chunk `heic2any` (1.35 MB >500 kB), sin fallo. Suite API ampliada tuvo skips; no se usó DB real.

**Frontera/efectos:** tests cubren mínimo 1900, año previo, máximo calculado y +1, fracción/NaN/infinito, null/omitido y rollover de negocio según `America/Hermosillo`; composables prueban no envío y preservación del formulario con año inválido. Sin DB.

**Rollback:** retirar helper/límites de año (preservando `MAX_ORDER_NOTES_LENGTH` de T06), schemas/tests T07 y cambios de validación/UI en cuatro superficies web indicadas. No revertir archivos completos compartidos con T05/T06.

**Limitaciones:** validación por build/typecheck, no browser E2E; DB no utilizada. Sin commit, migración ni operación remota. Estado final: **VERIFICADA**.

### T08a — evidencia de implementación (2026-10-14)

**Causa confirmada:** además del formato de entrada monetaria, una combinación de tarifas válidas puede generar importes calculados mayores al rango persistible de `Decimal(10,2)`. La validación solo de overrides no protege los recálculos ni el cierre.

**Cambio:** el schema de escritura limita overrides a `0..99999999.99` con hasta dos decimales; se conserva schema de lectura compatible con datos históricos. Un guard compartido con `Prisma.Decimal` valida `unitRate` (si existe), `baseCost`, `departureCost`, `travelExpenses` y `total` antes de escrituras/efectos en recálculo, finalización, falla de cita y solicitud de corrección. Overflow retorna `400 PRICING_AMOUNT_OUT_OF_RANGE`; se mantiene `ROUND_HALF_UP`.

**Archivos:** contracts `orders.ts`, `orders.test.ts`, `order-read-models.ts`, `index.ts`; API `pricing.ts/.test.ts`, `order-pricing.service.ts/.test.ts`, `index.ts`, `order-finalization.service.ts`, `execution.test.ts`.

**Regresión previa informada por implementador:** contratos 2 FAIL / 143 PASS; API focalizada 2 FAIL / 574 PASS / 26 SKIPPED. **Verificación independiente root:** `pnpm --filter @puk/contracts build` PASS; `pnpm --filter @puk/contracts exec vitest run src/orders.test.ts` **119 PASS / 1 archivo**; `TEST_DATABASE_URL='' DOTENV_CONFIG_PATH=/dev/null pnpm --filter @puk/api test src/modules/orders/pricing.test.ts src/modules/orders/order-pricing.service.test.ts src/modules/execution/execution.test.ts` **83 PASS / 3 archivos**; typecheck API y contracts PASS; Prettier `--check` en archivos de la tarea y `git diff --check` PASS. Implementador reportó suites completas: contracts 146 PASS / 8 archivos; API 579 PASS / 26 SKIPPED / 57 archivos; lint y formato PASS.

**Límites y efectos:** cubiertos cero, máximo, overflow por combinación, importes inválidos y ausencia de efectos transaccionales conforme a tests añadidos. Sin DB real ni cambios históricos.

**Rollback:** retirar guard compartido, schemas de escritura/lectura separados y pruebas/callers T08a. Los archivos `execution.test.ts`, `orders.ts`, `index.ts` y `order-read-models.ts` contienen cambios de tareas previas; retirar únicamente hunks T08a.

**Limitaciones:** root repitió pruebas focalizadas, no las suites completas ni lint completo; se conserva como evidencia el reporte del implementador para estas verificaciones. Sin commit, migración ni operación remota. Estado final: **VERIFICADA**.

### T08b — evidencia de implementación (2026-10-14)

**Causa confirmada:** `NInputNumber` con precisión de dos decimales convertía la entrada a número y redondeaba/rechazaba tipos antes de que el usuario pudiera corregir el valor original; el composable también convertía strings con `parseFloat`.

**Cambio:** tarifas y viáticos se mantienen como `string | null`; el modal usa `NInput` textual con prefijo monetario. `handleSave` valida cada valor con `PricingRateOverrideSchema` compartido y solo transmite cadenas válidas intactas. Vacío sigue significando ausencia; `0` sigue siendo un valor. Una cadena inválida conserva el modal y borrador y no llama a `updatePricing`.

**Archivos:** `apps/web/src/modules/orders/composables/useOrderPricingModal.ts`, `useOrderPricingModal.test.ts`, `components/OrderPricingModal.vue`.

**Regresión previa informada por implementador:** `pnpm --filter @puk/web exec vitest run src/modules/orders/composables/useOrderPricingModal.test.ts` → 10 FAIL / 7 PASS, con conversiones indebidas/`toFixed` sobre valor string. **Verificación independiente root:** mismo comando → **17 PASS / 1 archivo**; `pnpm --filter @puk/web typecheck` PASS; Prettier `--check` en los tres archivos y `git diff --check` PASS. Implementador reportó además build web y ESLint PASS; build con advertencia de chunk `heic2any` de 1,352.14 kB.

**Cobertura:** máximo y máximo+0.01, 1.234 intacto tras rechazo local, Infinity, negativo, coma, cero, vacío, restablecer/heredar, error de API y doble envío. No DB ni E2E visual. Sin commit ni operación remota.

**Rollback:** retirar cambios de los tres archivos indicados; no afecta lectura monetaria ni precios de solo lectura. Estado final: **VERIFICADA**.

### T09 — evidencia de implementación (2026-10-14)

**Cambio realizado:** contratos limitan órdenes a 100 unidades y cada unidad entrante a 500 equipos; API verifica el total de `createOrder` antes de preparar inventario. Para `addUnit` y `assignEquipment`, un helper dentro de la transacción bloquea la fila padre `Order` con `SELECT ... FOR UPDATE` parametrizado mediante `Prisma.sql`, cuenta estado actual y valida el total posterior. Se añadió prueba de integración concurrente para PostgreSQL, pero no se ejecutó. La regla B02 aprobada permite que `rescheduleFailedAppointment` copie una orden histórica por encima de los límites; el flujo ya omitía las validaciones de nueva entrada, por lo que se fijó ese comportamiento con regresiones, sin cambio de producción.

**Archivos:** `packages/contracts/src/validation-limits.ts`, `orders.ts`, `orders.test.ts`; API `order-item-limits.ts`, `order-item-limits.test.ts`, `order-item-limits.database.integration.test.ts`, `orders.service.ts`, `orders.test.ts` (incluye regresiones B02 para 101 unidades y 501 equipos).

**Verificación independiente root:** `pnpm --filter @puk/contracts build` PASS; `pnpm --filter @puk/contracts exec vitest run src/orders.test.ts` **120 PASS**; `DOTENV_CONFIG_PATH=/dev/null pnpm --filter @puk/api exec vitest run src/modules/orders/order-item-limits.test.ts src/modules/orders/orders.test.ts` **49 PASS**; `DOTENV_CONFIG_PATH=/dev/null pnpm --filter @puk/api typecheck` PASS; ESLint focalizado, Prettier `--check` y `git diff --check` PASS. La prueba unitaria usa mocks y solo acredita orden de lock/count y manejo de límites, no exclusión real concurrente.

**Bloqueos y condición:** B02 quedó resuelto por producto y verificado: `TEST_DATABASE_URL='' DOTENV_CONFIG_PATH=/dev/null pnpm --filter @puk/api test src/modules/orders/orders.test.ts` → **47 PASS**; API typecheck, ESLint, Prettier y `git diff --check` PASS. Las regresiones prueban copia completa de 101 unidades y 501 equipos, conservando snapshots/claves y estados previstos. T09 permanece **PARCIAL** únicamente porque la prueba PostgreSQL concurrente no se ejecutó: no hay DB aislada autorizada en esta sesión. No se leyó `,env` ni credenciales, ni se intentó conexión. Para cerrar, ejecutar integración en PostgreSQL desechable autorizado y verificar un éxito/un rechazo, conteo final y ausencia de auditoría persistida para el rechazo.

**Actualización T09 (2026-10-16):** con autorización del usuario, se ejecutó exclusivamente el archivo de integración contra el `puk_test` local validado. Se añadieron pruebas reales para dos asignaciones concurrentes de equipo en el último cupo (una gana y una recibe `ORDER_EQUIPMENT_LIMIT_EXCEEDED`; quedan 500 equipos y una sola auditoría adicional) y para rollback: una violación FK al persistir la auditoría deja intactos los conteos de equipos y auditorías. Resultado de integración: **4 PASS**, incluyendo las pruebas existentes de carrera de unidades e idempotencia. Unitarias de órdenes: **50 PASS**; typecheck API, ESLint focalizado, Prettier y `git diff --check` **PASS**. No hubo migraciones, seeds ni cambios a la lógica productiva; fixtures de las pruebas se eliminan al finalizar.

**Rollback:** retirar validaciones contractuales, helper/límites y wiring de `createOrder`/`addUnit`/`assignEquipment`, tests unitarios e integración T09. Archivos `orders.ts`, `orders.test.ts`, `validation-limits.ts`, `orders.service.ts` también contienen cambios previos; revertir solo hunks T09. Sin commit, migración ni operación remota.

### T10 — evidencia de implementación (2026-10-14)

**Cambio:** el contrato rechaza checklist con categorías duplicadas o más de cinco categorías, mantiene actualizaciones parciales y validación BAD→notas. Dimensiones enviadas deben ser enteros positivos finitos; si se declaran ambas, su producto no excede 40.000.000. Router aplica el límite antes del servicio; Drive conserva validación Sharp, compara dimensiones declaradas con reales y persiste dimensiones reales. Se agregó regresión HTTP de unidad ajena para checklist: 404 antes de transacción/escritura.

**Archivos:** contracts `execution.ts`, `execution.test.ts`, `validation-limits.ts`; API `execution.router.ts/.test.ts`, `execution-media.service.ts`, `execution.router.drive.test.ts`, `execution.drive.test.ts`, `execution.test.ts`.

**Regresión previa reportada:** 2 FAIL/2 PASS en contracts por duplicado y 8,001×5,000 aceptados. **Verificación independiente root:** `pnpm --filter @puk/contracts build` PASS; contratos `src/execution.test.ts` **4 PASS**; `TEST_DATABASE_URL='' DOTENV_CONFIG_PATH=/dev/null pnpm --filter @puk/api test src/modules/execution/execution.router.test.ts src/modules/execution/execution.router.drive.test.ts src/modules/execution/execution.drive.test.ts src/modules/execution/execution.test.ts` **117 PASS / 4 archivos**; API typecheck PASS; ESLint focalizado, Prettier `--check` y `git diff --check` PASS.

**Cierre:** el flujo legacy de finalización queda cubierto por T11: contenido real validado con storage simulado, incluyendo MIME, píxeles y dimensiones. T10 se declara **VERIFICADA** con sus límites documentados; no se usó AWS real, DB ni se alteraron datos. Sin commit ni operación remota.

**Rollback:** retirar validación de categorías/dimensiones, uso del límite compartido en router/Drive y regresiones T10. `execution.ts`, `execution.test.ts`, `validation-limits.ts`, `execution.router.ts` y tests compartidos contienen cambios previos; retirar solo hunks T10.

### T11 — evidencia de implementación (2026-10-14)

**Decisión B04:** lectura limitada usa el límite efectivo de carga de la instancia (`getEvidenceUploadLimit()`; predeterminado 10 MiB, configurable por `MAX_EVIDENCE_BYTES`). El puerto tiene `getObjectLimited(key,maxBytes)`. S3 lee el stream por chunks, cancela/destruye al exceder y lanza `ObjectTooLargeError`; el circuit breaker propaga ese error sin contarlo como falla del proveedor. El servicio conserva pre-check HEAD y también impone el límite al contenido real. El exceso usa el contrato ya existente `400 FILE_TOO_LARGE`.

**Cambio:** `completeEvidence` autoriza antes de leer, rechaza ausencia/tamaño excedido, lee limitado, verifica MIME declarado contra formato Sharp real, decodifica con el máximo de píxeles, coteja dimensiones opcionales y checksum; solo entonces persiste `COMPLETED`, bytes, checksum y dimensiones reales. Errores dejan el registro sin finalizar. El modo legacy sigue deshabilitado cuando Drive está activo. Los adapters S3, mock de desarrollo y disabled implementan el nuevo método.

**Archivos:** `apps/api/src/integrations/ports.ts`; `object-storage/dev-mock-storage.client.ts`, `disabled.client.ts`, `s3.client.ts`, nuevo `object-too-large.error.ts` y `s3.client.test.ts`; `apps/api/src/resilience/circuit-breaker.ts/.test.ts`; `apps/api/src/modules/execution/execution-media.service.ts`, `execution.test.ts`.

**Regresión previa informada:** mismatch entre dimensiones declaradas y PNG real era aceptado (1 FAIL / 52 PASS). **Verificación independiente root:** `TEST_DATABASE_URL='' DOTENV_CONFIG_PATH=/dev/null pnpm --filter @puk/api test src/integrations/object-storage/s3.client.test.ts src/resilience/circuit-breaker.test.ts src/modules/execution/execution.test.ts src/modules/execution/execution.drive.test.ts src/modules/execution/execution.router.drive.test.ts src/modules/execution/execution.router.test.ts src/modules/reports/report-email.storage.test.ts` → **131 PASS / 7 archivos**; API typecheck y build PASS; ESLint focalizado, Prettier `--check` y `git diff --check` PASS.

**Límites:** storage/S3 stream fue simulado; no hubo AWS real, DB real ni lectura de credenciales. Sin commit ni operación remota. T11 queda **VERIFICADA**.

**Rollback:** retirar método limitado/error y wiring de adapters, breaker y finalización, además de pruebas T11. Archivos `execution-media.service.ts`, `execution.test.ts`, `circuit-breaker.ts/.test.ts` contienen cambios anteriores; revertir solo hunks T11.

### T12 — B01 parcial: nombre, dirección y etiqueta de unidad (2026-10-14)

**Decisión de producto:** `clientNameSnapshot` admite máximo **200 unidades UTF-16** en escrituras nuevas, aplicando `trim` antes de validar. No cambia schemas de lectura ni históricos; no se limita el catálogo externo de Sheets. El servicio muestra error local cuando el cliente seleccionado supera el máximo, no envía la orden y conserva la selección.

**Cambio:** constante compartida `MAX_CLIENT_NAME_SNAPSHOT_LENGTH=200`; aplicada a `CreateOrderSchema` y `UpdateOrderSchema`, además de preflight en `useOrderCreationSubmission`. El schema del catálogo queda sin restricción porque sus datos existentes pueden exceder el máximo de la snapshot.

**Archivos:** `packages/contracts/src/validation-limits.ts`, `index.ts`, `orders.ts`, `orders.test.ts`; `apps/web/src/modules/orders/composables/useOrderCreationSubmission.ts/.test.ts`.

**Regresión previa:** contratos 1 FAIL / 120 PASS; web 1 FAIL / 7 PASS. **Verificación independiente root:** `pnpm --filter @puk/contracts build` PASS; `pnpm --filter @puk/contracts exec vitest run src/orders.test.ts` **121 PASS**; `pnpm --filter @puk/web exec vitest run src/modules/orders/composables/useOrderCreationSubmission.test.ts` **8 PASS**; typechecks contracts/web, ESLint focalizado, Prettier `--check` y `git diff --check` PASS. Cobertura incluye 200/201 ASCII, 198 caracteres ASCII + emoji (200 unidades UTF-16) y +1 que excede; valida que el valor límite no depende del conteo de puntos Unicode de Valibot.

**Estado:** T12 **PARCIAL**. Falta acordar máximos para los campos restantes de B01 y completar los escenarios de matriz indicados en el plan. No DB, commit ni operación remota.

**Rollback:** retirar constante/export, validadores de snapshot, preflight y los tests de esta decisión; preservar cambios previos T05–T09 en los archivos compartidos.

**Decisión adicional aprobada:** `serviceAddress` máximo **500 unidades UTF-16** para escrituras nuevas; `trim` solo de whitespace externo, preservando whitespace y saltos internos, así como `optional`/`null`. Las respuestas históricas no se endurecen. La UI impide enviar valor sobre límite y conserva el borrador.

**Cambio y evidencia adicional:** constante `MAX_SERVICE_ADDRESS_LENGTH=500` compartida entre Create/UpdateOrder y preflight UI. Rojo informado: contrato 1 FAIL/121 PASS; web 1 FAIL/8 PASS. Root repitió después del cambio ambos grupos: `pnpm --filter @puk/contracts exec vitest run src/orders.test.ts` **122 PASS**; `pnpm --filter @puk/web exec vitest run src/modules/orders/composables/useOrderCreationSubmission.test.ts` **9 PASS**; build contracts, typechecks contracts/web, ESLint focalizado, Prettier `--check` y `git diff --check` PASS. Casos: 500/501 unidades UTF-16, trim externo, preservación de espacios/saltos internos y valores nullable/optional.

**Rollback adicional:** retirar solo `MAX_SERVICE_ADDRESS_LENGTH`, validación de `serviceAddress` y preflight UI con sus tests; mantener intacta la decisión anterior de `clientNameSnapshot`.

**Decisión adicional aprobada:** `OrderUnit.label` máximo **100 unidades UTF-16** en escrituras nuevas, recortando solo whitespace externo y conservando el contenido interno. Los schemas de lectura histórica siguen sin el nuevo límite.

**Cambio:** constante compartida `MAX_ORDER_UNIT_LABEL_LENGTH=100` aplicada a `CreateOrderUnitSchema`, `CreateUnitSchema` y `UpdateUnitSchema`. Wizard, configuración manual, unidades derivadas del catálogo y modal add-unit validan antes de enviar/agregar; mantienen selección/formulario/configuración ante rechazo.

**Regresión y verificación:** contracts antes del cambio 1 FAIL / 122 PASS para label de 101; UI tuvo que ajustar aserciones sobre proxies reactivos antes de quedar verdes (la primera ejecución no se considera evidencia de fallo funcional). Root ejecutó `pnpm --filter @puk/contracts build` PASS; `pnpm --filter @puk/contracts exec vitest run src/orders.test.ts` **123 PASS**; `pnpm --filter @puk/web exec vitest run src/modules/orders/composables/useManualUnitConfiguration.test.ts src/modules/orders/composables/useExistingEquipmentUnitConfiguration.test.ts src/modules/orders/composables/useEquipmentReplacementConfiguration.test.ts src/modules/orders/composables/useAddOrderUnit.test.ts src/modules/orders/composables/useOrderCreationSubmission.test.ts` **38 PASS / 5 archivos**; typechecks contracts/web/API, ESLint focalizado, Prettier `--check` y `git diff --check` PASS. Incluye límites exactos/excedidos, trim e interior preservado, emoji/UTF-16, labels de catálogo largos y preservación de borradores.

**Rollback adicional:** retirar solo constante/export, límites de los tres schemas, guards/preflight de wizard, configuración manual, existentes/reemplazos y modal de agregar unidad, junto con sus pruebas. No revertir archivos completos compartidos con tareas anteriores.

**Decisión adicional aprobada:** `OrderUnit.makeModel` admite máximo **200 unidades UTF-16** en escrituras nuevas, con trim externo y contenido interno intacto. Las lecturas históricas no se endurecen.

**Cambio y verificación:** `MAX_ORDER_UNIT_MAKE_MODEL_LENGTH=200` aplicada a CreateOrderUnit/CreateUnit/UpdateUnit. Configuración manual, selección de equipo, modal add-unit y preflight del wizard rechazan datos largos sin perder selección/borrador. Root verificó build contracts; `src/orders.test.ts` **124 PASS**; composables manual/existing/replacement/add-unit/order-submit **41 PASS / 5 archivos**; typechecks contracts/web/API; ESLint focalizado, Prettier `--check` y `git diff --check` PASS. La regresión de contrato detectó ausencia de la constante/límite; pruebas UI confirmaron no enviar y conservar estado tras rechazo. Sin DB, E2E de navegador, commit ni operación remota.

**Rollback adicional:** retirar solo `MAX_ORDER_UNIT_MAKE_MODEL_LENGTH`, sus tres validaciones, preflights UI y tests asociados. Mantener intactos límites anteriores de label, dirección y nombre.

**Decisión adicional aprobada:** `OrderUnit.serialNumber` admite máximo **100 unidades UTF-16** en escrituras nuevas, con trim exterior. Se preservan mayúsculas y contenido interno; no se impone formato ni longitud VIN ni se cambia la deduplicación. Las lecturas históricas no se endurecen.

**Cambio y verificación:** `MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH=100` aplicada a CreateOrderUnit/CreateUnit/UpdateUnit. Las rutas UI manual, equipo existente, reemplazo, modal add-unit y wizard preflight rechazan entradas mayores sin perder selección/borrador. Root verificó contracts build; `src/orders.test.ts` **125 PASS**; composables manual/existing/replacement/add-unit/order-submit **46 PASS / 5 archivos**; typechecks contracts/web/API PASS. Sin DB ni E2E de navegador.

**Rollback adicional:** retirar solo la constante/límites de `serialNumber`, sus guards UI y pruebas relacionadas. No revertir archivos compartidos completos ni alterar las reglas aprobadas de otros campos.

**Decisión adicional aprobada:** la descripción de discrepancia admite máximo **1.500 unidades UTF-16** en escrituras nuevas. Se recortan únicamente espacios exteriores; se preservan saltos de línea y espacios internos. Vacío efectivo se rechaza. No se limita ni normaliza la lectura histórica.

**Cambio y verificación:** `MAX_DISCREPANCY_DESCRIPTION_LENGTH=1500` centralizado y exportado. `ReportDiscrepancySchema` normaliza/valida; la UI impide enviar descripciones largas con error local, conservando el texto. Regresión previa observó **1 FAIL / 4 PASS**: 1.501 unidades UTF-16 eran aceptadas. Después, contracts `execution.test.ts` **5 PASS**, API `execution.router.test.ts` + `execution.test.ts` **96 PASS / 2 archivos**, typechecks contracts/web/API PASS. Se verificó UI por typecheck, sin prueba de navegador/componente.

**Rollback adicional:** retirar solo el límite/trim del schema de discrepancia, constante/export, guard UI y prueba contractual. No revertir otros cambios T12 ni datos históricos.

**Decisión adicional aprobada:** cada valor string de `observedSnapshot` admite máximo **500 unidades UTF-16**. Se mide sin trim ni otra normalización; se conserva exactamente el contenido dentro del límite. El campo sigue opcional. No se endurecen lecturas ni snapshots almacenados históricamente.

**Cambio y verificación:** `MAX_OBSERVED_SNAPSHOT_VALUE_LENGTH=500` centralizado/exportado y aplicado a valores del record en `ReportDiscrepancySchema`; no se limitan claves ni se modifica el formato general del objeto. Regresión previa: **1 FAIL / 5 PASS**, 501 unidades UTF-16 eran aceptadas. Luego contracts `execution.test.ts` **6 PASS**; typechecks/lint/formato y `git diff --check` PASS. Este endpoint no tiene control de edición para `observedSnapshot` en la UI actual; se valida en contrato API. Sin DB ni prueba de navegador.

**Rollback adicional:** retirar solo constante/export, `maxLength` de valores observedSnapshot y prueba específica. No revertir el límite separado de descripción ni tocar snapshots persistidos.

### T12 — NET-02: idempotencia durable de creación de órdenes (2026-10-14)

- **Decisión aprobada:** clave UUID persistida; misma clave y mismo contenido devuelve la orden original; misma clave y contenido distinto responde 409. La clave se almacena junto a la orden y queda aislada por `createdById`.
- **Cambio:** `POST /orders` valida `Idempotency-Key`; `OrdersService` calcula SHA-256 sobre JSON con claves de objeto ordenadas, guarda clave y huella en la misma transacción que orden/auditoría y recupera el resultado original ante conflicto de unicidad. La restricción SQL asegura paridad entre ambas columnas. Los metadatos idempotentes no se incluyen en la respuesta ni en el snapshot de auditoría. El wizard conserva solo `{payloadHash,key}` (no el payload ni sus datos personales) en `sessionStorage`, reutiliza la clave después de error ambiguo y la elimina solo al completar creación; payload editado obtiene una clave nueva.
- **Migración generada y aplicada:** `prisma/migrations/20261014120000_order_create_idempotency/migration.sql`, aplicada en `puk_test` y `puk`.
- **Intento de aplicación (2026-10-14):** el usuario autorizó los destinos `test` y `dev`; el mapeo sanitizado de `.env` es `TEST_DATABASE_URL → localhost:5433/puk_test` y `DIRECT_URL`/`DATABASE_URL → localhost:5433/puk`. `prisma migrate status` falló para ambos con `P1001` (servidor PostgreSQL no accesible en `localhost:5433`), por lo que no se aplicó ninguna migración. No se imprimieron ni copiaron credenciales.
- **Reintento y verificación (2026-10-14):** `prisma migrate deploy` aplicó `20261014120000_order_create_idempotency` correctamente en ambos destinos; el status posterior reportó `Database schema is up to date!` en los dos. Prisma Client 7.10.0 regenerado y typechecks API/web PASS. Sin seeds ni cambios de datos existentes.
- **Regresiones:** API `orders.test.ts` + `orders.router.test.ts`: **111 PASS / 2 archivos** (replay, huella conflictiva, recuperación mockeada de carrera con P2002, header requerido/inválido y rutas conservadas). Web `api.idempotency.test.ts` + `useOrderCreationSubmission.test.ts`: **14 PASS / 2 archivos** (envío del header, reintento con misma clave y limpieza tras éxito). Una ejecución inicial falló por fixtures transaccionales incompletos para el bloqueo/cupo de unidad-equipo; el harness se completó y las pruebas finales pasaron.
- **Integración PostgreSQL real:** `pnpm --filter @puk/api exec vitest run src/modules/orders/order-item-limits.database.integration.test.ts`, ejecutado con `TEST_DATABASE_URL` leído desde `.env` en memoria y validado antes de lanzar Vitest para permitir únicamente loopback `/puk_test`; `DOTENV_CONFIG_PATH=/dev/null` evitó cargar otras variables. Resultado: **2 PASS**. Para NET-02, dos llamadas concurrentes con la misma clave dejaron una orden y una auditoría; un replay posterior devolvió el mismo ID y contenido distinto fue rechazado con 409. El test limpia la orden y auditoría creadas. No se tocó `puk` (dev) durante esta prueba.
- **Límite restante:** no se cortó una conexión HTTP real después del commit. La combinación de retry del wizard probado con API mockeada y persistencia/replay/concurrencia reales de `OrdersService` valida el mecanismo, pero no el transporte completo. NET-02 se considera verificada a nivel persistencia; ese escenario sigue siendo una cobertura adicional.
- **Rollback:** retirar campos e índice/check de Prisma/migración, helper y wiring API, envío de header y almacenamiento/reintento del wizard, además de estas pruebas. No revertir archivos completos compartidos con issue #41.
- **Estado:** NET-02 VERIFICADO para `puk_test`; T12 continúa PARCIAL por NET-01/NET-04 y el resto de su matriz.

### Plantilla de evidencia

```text
Tarea: Txx
Fecha / commit base / archivos modificados:
Síntoma y causa confirmada:
Regresión antes del cambio: comando + fallo esperado observado
Cambio aplicado:
Verificación después: comando + código de salida + conteos/resultados reales
Prueba de frontera: HTTP/DB/UI; o N/A explicado para helper puro
Sin efectos en rechazo: qué mocks/filas/auditoría/outbox se comprobaron
Rollback: archivos y comportamiento de esta tarea que se pueden retirar
Limitaciones / pruebas omitidas / bloqueos:
Estado final: VERIFICADA | PARCIAL | BLOQUEADA
```

### Prompt de entrega al siguiente modelo

```text
Implementa SOLO T01 de docs/plans/issue-41-robustez.md.
Lee AGENTS.md y las superficies enumeradas en T01.
No implementes otras tareas, no cambies reglas aprobadas ni resuelvas bloqueos.
Primero agrega la regresión y confirma que falla por la causa indicada.
Luego corrige el mínimo, ejecuta el grupo de pruebas correspondiente y registra
resultados reales, límites y rollback en la sección 7.
No hagas commit, push, operación remota, migración ni prueba contra datos reales.
Si necesitas salir del alcance, detente y explica la evidencia.
```

Sustituir `T01` por el ID elegido al avanzar. **Este documento es la guía; no constituye por sí mismo una orden de comenzar a modificar código.**
