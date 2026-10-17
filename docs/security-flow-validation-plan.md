# Validación de seguridad de flujos y prevención de fugas de datos

- **Estado:** plan de validación; no certifica que los controles hayan pasado pruebas.
- **Alcance:** API, cliente web, PostgreSQL, archivos privados e integraciones Google Sheets/Drive/Gmail.
- **Entorno:** ejecutar pruebas dinámicas solo en un ambiente aislado con datos ficticios. La revisión de código no demuestra la configuración de un despliegue.

## Resultado esperado

Cada flujo debe demostrar que solo el actor autorizado puede **ver, modificar o sacar** los datos necesarios para su tarea. Una denegación también debe impedir efectos secundarios: escrituras en base de datos, archivos, hojas y correos. El trabajo se cierra con evidencia reproducible por caso, hallazgos corregidos o aceptados formalmente y una nueva ejecución de las pruebas afectadas.

## Ruta de validación

1. Crear datos ficticios para dos administradores, dos técnicos individuales, la cuenta técnica compartida, dos clientes y dos órdenes asignadas a técnicos distintos. Preparar una orden en cada estado relevante y archivos/reportes de ambas órdenes.
2. Para cada fila de la matriz, probar acceso anónimo, rol incorrecto, actor autorizado y actor del mismo rol pero de **otra** orden o cliente. Alterar IDs de ruta, body, query y referencias anidadas; no confiar en que la interfaz oculte botones.
3. Comparar respuesta HTTP, campos del JSON/binario y efectos persistidos. Revisar también logs, auditoría, métricas y destinos externos con identificadores ficticios trazables.
4. Registrar evidencia y corregir primero cualquier acceso cruzado, dato sobrante en respuestas o salida hacia un destino no autorizado. Repetir la matriz tras cada corrección.

## Matriz de flujos

| Flujo y frontera de datos                                               | Comprobación mínima                                                                                                                                                                                                                                                            | Código de partida                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login, refresh y cierre de sesión → identidad vigente                   | Una sesión revocada o usuario desactivado no accede; el refresh rotado no puede reutilizarse; cookie, token y error no filtran credenciales. Probar cambios de rol durante una sesión.                                                                                         | `apps/api/src/modules/auth/auth.router.ts`, `apps/api/src/modules/auth/auth.service.ts`, `apps/api/src/auth/authenticate.ts`, `apps/api/src/auth/principal-resolver.ts`                                                             |
| Administración de usuarios y acceso compartido → privilegios            | Un técnico no puede invocar funciones administrativas por URL o método alternativo. La cuenta compartida puede acceder a cualquier orden asignada en estado ejecutable; probar rechazo de órdenes sin técnico o en otros estados, incluso después de cambiar la configuración. | `apps/api/src/auth/capabilities.ts`, `apps/api/src/modules/administration/administration.router.ts`, `apps/api/src/modules/shared-technician-access/shared-technician-access.router.ts`, `apps/api/src/auth/order-access-policy.ts` |
| Listado y detalle de órdenes → datos de clientes, equipos y precios     | Un técnico solo recibe órdenes permitidas. Comparar **todas las claves** del listado con un contrato de campos permitido por rol; verificar que el detalle administrativo, el de ejecución y la auditoría no se mezclan.                                                       | `apps/api/src/modules/orders/orders.router.ts`, `apps/api/src/modules/orders/orders-query.service.ts`, `apps/api/src/modules/orders/order-read-models.ts`                                                                           |
| Mutaciones de órdenes, unidades e inventario → integridad entre objetos | Combinar `orderId` de A con `unitId` o `equipmentId` de B; esperar denegación sin escritura, reserva ni sincronización externa. Repetir para alta, edición, asignación, retiro y cierre.                                                                                       | `apps/api/src/modules/orders/orders.router.ts`, `apps/api/src/modules/orders/orders.service.ts`, `apps/api/src/modules/inventory/inventory.service.ts`                                                                              |
| Fotografías y firmas → archivos privados                                | Probar carga, confirmación, lectura y descarga cruzadas. Rechazar tipo/contenido/tamaño inválidos y referencias de otra orden; comprobar autorización antes de obtener bytes, no exponer IDs de Drive y evitar caché compartida de archivos privados.                                           | `apps/api/src/modules/execution/execution-media.service.ts`                                                                                                                                                                         |
| PDF y versiones → información operativa descargable                     | Un técnico solo descarga reportes autorizados; versión de otra orden o ID manipulado no devuelve bytes ni URL. Comprobar que respuestas de metadatos no exponen claves de almacenamiento y que Drive no se sirve desde caché compartida.                                       | `apps/api/src/modules/reports/reports.router.ts`, `apps/api/src/modules/reports/reports.service.ts`                                                                                                                                 |
| Envío de PDF por Gmail → salida irreversible de datos                   | Solo un administrador puede enviar; `recipientIds` deben pertenecer al cliente de la orden y el `reportId` a esa orden. Un rechazo no debe mandar correo. Verificar destinatarios, adjunto, auditoría y reintento ante confirmación incierta.                                  | `apps/api/src/modules/reports/report-email.service.ts`, `packages/contracts/src/report-email.ts`                                                                                                                                    |
| Catálogos, Google Sheets y Drive → terceros                             | Identificar columnas/campos enviados y permisos de la cuenta de integración. Probar que una cuenta compartida no obtiene catálogos ajenos; errores del proveedor no exponen payloads, identificadores privados ni credenciales. Conciliar escrituras fallidas y reintentos.    | `apps/api/src/modules/catalogs/catalogs.router.ts`, `apps/api/src/modules/orders/sync.service.ts`, `apps/api/src/integrations/google-sheets/google-sheets.service.ts`                                                               |
| Logs, métricas y health → canales laterales                             | Revisar requests exitosos y fallidos con datos ficticios: no deben aparecer cookies, tokens, identificadores de Drive, PII innecesaria ni cuerpos completos. Verificar qué permiten ver `/metrics` y `/health/metrics` desde fuera del entorno de operación.                       | `apps/api/src/app.ts`, `apps/api/src/middleware/`                                                                                                                                                                                   |

## Hipótesis prioritarias, aún no confirmadas

- **Proyección del listado:** `OrdersQueryService.listOrders` ahora usa una selección explícita de los campos requeridos por el resumen web. Verificar la respuesta HTTP real para cada rol y conservar una prueba de regresión que impida agregar precios u otros campos internos accidentalmente.
- **Superficie de métricas:** `createApp` mantiene `/metrics` y `/health/metrics` disponibles para observación interna, mientras el Nginx del repositorio devuelve `404` en la entrada pública. Verificar ese aislamiento en cada despliegue; la configuración local no demuestra el estado de un entorno activo.
- **Configuración efectiva de transporte:** `createApp` configura Helmet, CORS y límite JSON (`apps/api/src/app.ts:62-80`). Validar por separado HTTPS, orígenes, atributos de cookie, cabeceras y reglas del proxy. No inferir seguridad de producción a partir de defaults locales o de IaC no desplegada.

## Evidencia y criterio de aceptación

Por cada caso registrar: ID, commit, entorno, actor/rol, recurso propio y ajeno, petición **sin secretos**, respuesta esperada y observada, campos devueltos, efectos en BD/Drive/Sheets/Gmail, prueba automatizada, responsable y estado (`pendiente`, `pasa`, `falla`, `no aplica`). Conservar solo datos ficticios y redactar tokens, cookies, identificadores de Drive, correos reales y contenido de archivos.

La validación queda aprobada únicamente si:

- [ ] Todas las filas tienen pruebas positivas y negativas, incluidos cambios de ID anidados y acceso horizontal entre técnicos.
- [ ] Existe una lista permitida de campos por respuesta sensible y no aparecen campos adicionales en la evidencia.
- [ ] Cada rechazo demuestra ausencia de escritura, archivo creado o mensaje enviado.
- [ ] Logs, métricas, errores, cachés y destinos externos fueron revisados como posibles vías de fuga.
- [ ] Las condiciones dependientes del despliegue se verificaron en ese entorno; lo no ejecutado permanece marcado `pendiente`, no `pasa`.
- [ ] Cada hallazgo tiene severidad, propietario, corrección o aceptación documentada, y prueba de regresión.

## Referencias

- [OWASP API Security Top 10 (2023)](https://api-security.owasp.org/editions/2023/en/0x11-t10/): autorización por objeto, propiedad y función.
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html): controles de carga y almacenamiento.
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html): eventos útiles sin datos sensibles.
- Controles actuales declarados: [`docs/technical/security-and-quality.md`](technical/security-and-quality.md). El documento actual es el **plan para verificarlos**, no evidencia de que estén activos o sean suficientes.
