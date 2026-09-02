# Ruta de trabajo — Sistema de órdenes de servicio

Ruta de implementación del MVP basada en `SPECS.md`. Cada fase debe terminar con sus criterios de salida cumplidos antes de avanzar a la siguiente.

## 0. Definiciones y preparación

- [x] Confirmar la versión LTS de Node.js y fijar las versiones compatibles mediante `pnpm-lock.yaml`.
- [ ] Obtener una copia de Google Sheets exclusiva para desarrollo y staging.
- [ ] Validar en la hoja los encabezados y permisos de `Clientes` y `SALIDAS`.
- [ ] Revisar duplicados, valores incompletos y casos especiales de ID e IMEI.
- [x] Confirmar si la columna `P` se escribirá y, en su caso, definir su catálogo válido (decisión temporal documentada).
- [x] Acordar qué ocurre en Sheets al cancelar una orden ya sincronizada (decisión temporal documentada).
- [x] Acordar qué ocurre si una unidad cambia después de asignar la orden (decisión temporal documentada).
- [x] Definir la regla de disponibilidad mientras `Estado del Servicio` (columna `K`) no cambie.
- [x] Definir límites finales de cantidad y tamaño de fotografías para desarrollo.
- [x] Documentar variables de entorno, secretos requeridos y responsables de cada credencial.
- [x] Crear una matriz de trazabilidad entre reglas de negocio, endpoints y pruebas de aceptación.

### Criterio de salida

- [ ] Las decisiones que bloquean la integración con Sheets están resueltas o registradas explícitamente con una alternativa temporal para desarrollo.
- [ ] El equipo dispone de credenciales y recursos de desarrollo que no apuntan a producción.

## 1. Base del monorepo

- [x] Crear el workspace de `pnpm` con `apps/web`, `apps/api`, `packages/contracts`, configuraciones compartidas, `prisma` e `infra/docker`.
- [x] Configurar TypeScript estricto para API, web y paquetes compartidos.
- [x] Configurar ESLint, formato, aliases y límites de importación entre módulos.
- [x] Crear la aplicación Express 5 con `app.ts` y `server.ts` separados.
- [x] Crear la aplicación Vue 3 con Vite, Vue Router, Pinia y TanStack Query.
- [x] Integrar Naive UI y Tailwind CSS mediante el plugin de Vite.
- [x] Configurar Docker Compose con PostgreSQL, MinIO, API y web.
- [x] Implementar validación de variables de entorno con Valibot y fallo temprano al iniciar.
- [x] Añadir scripts raíz para desarrollo, build, lint, typecheck, pruebas, documentación y Prisma.
- [x] Crear archivos de ejemplo de configuración sin incluir secretos reales.

### Criterio de salida

- [x] `pnpm dev`, `pnpm build`, `pnpm lint` y `pnpm typecheck` funcionan desde la raíz.
- [x] API, web, PostgreSQL y MinIO pueden levantarse en desarrollo local.

## 2. Fundamentos transversales de la API

- [x] Implementar `requestId`, respuesta estándar de éxito y manejador global de errores.
- [x] Configurar Helmet, CORS con allowlist, límite JSON, cookies y `trust proxy`.
- [x] Configurar rate limiting general y límites particulares para autenticación y operaciones costosas.
- [x] Integrar Winston con logs estructurados y Morgan mediante un stream sanitizado.
- [x] Redactar cookies, tokens, contraseñas, secretos, URLs firmadas y datos privados en logs.
- [x] Implementar middleware Valibot para `params`, `query` y `body`.
- [x] Implementar paginación, filtros y ordenamiento mediante allowlists por endpoint.
- [x] Crear el modelo de capacidades de código y políticas contextuales por recurso.
- [x] Preparar OpenAPI 3.1, Swagger UI y generación de esquemas compatibles desde Valibot.
- [x] Añadir `/health/live` y `/health/ready`.
- [x] Definir puertos para Google Sheets y S3, sin acoplar casos de uso a sus SDK.
- [x] Configurar timeouts, clasificación de errores, reintentos y circuit breakers por integración.

### Criterio de salida

- [x] Las rutas de ejemplo entregan el formato común, validan entradas y propagan `requestId`.
- [x] Los logs y errores no exponen información sensible.
- [x] El documento OpenAPI se genera y valida sin referencias rotas.

## 3. Persistencia y modelo de dominio

- [x] Modelar en Prisma usuarios, técnicos, órdenes, unidades, equipos asignados, checklist e items.
- [x] Modelar evidencias, firmas, discrepancias, sesiones de refresh, auditoría y operaciones de sincronización.
- [x] Añadir enumeraciones y restricciones de unicidad descritas en la especificación.
- [x] Crear la restricción SQL parcial que impide asignar un equipo a dos órdenes activas.
- [x] Implementar `Order.version` para concurrencia optimista.
- [x] Incorporar tablas de outbox o la persistencia equivalente para efectos externos críticos.
- [x] Crear migraciones iniciales, índices de consulta y un seed mínimo de desarrollo.
- [x] Definir helpers transaccionales para cambios de dominio, auditoría y outbox en una sola transacción.

### Criterio de salida

- [x] La base puede crearse desde cero ejecutando migraciones y seed.
- [x] Las restricciones de unicidad, propiedad y concurrencia cuentan con pruebas automatizadas.

## 4. Autenticación, usuarios y técnicos

- [x] Implementar hash de contraseñas con Argon2id y política configurable de longitud mínima.
- [x] Implementar login con respuesta genérica ante credenciales inválidas.
- [x] Emitir access tokens de corta duración con `sub`, `role`, `iss` y `aud`.
- [x] Emitir refresh tokens en cookie segura y almacenar únicamente su hash.
- [x] Implementar rotación de refresh token, revocación individual y cierre de todas las sesiones.
- [x] Implementar `authenticate`, capacidades por rol y políticas de pertenencia.
- [x] Crear endpoints administrativos de usuarios y técnicos.
- [x] Crear las pantallas de login, sesión y directorio de técnicos.
- [x] Configurar la instancia Axios con token en memoria, refresh único compartido y un solo reintento.
- [x] Añadir auditoría para creación, edición, activación y desactivación de usuarios y técnicos.

### Criterio de salida

- [x] Un administrador y un técnico pueden iniciar y cerrar sesión según su rol.
- [x] La rotación, expiración y revocación de tokens están cubiertas con pruebas.
- [x] El navegador no almacena JWT en `localStorage` ni `sessionStorage`.

## 5. Catálogos de Google Sheets

- [x] Implementar el adaptador autenticado de Google Sheets exclusivamente en la API.
- [x] Leer y validar clientes de la pestaña `Clientes`.
- [x] Leer, normalizar y validar equipos de la pestaña `SALIDAS`.
- [x] Implementar la identidad por ID e IMEI, incluyendo `PENDIENTE`, `N/A` y datos incompletos.
- [x] Implementar caché de corta duración con fecha de obtención e invalidación manual.
- [x] Forzar una lectura fresca antes de cualquier asignación.
- [x] Crear endpoints de búsqueda, detalle/revalidación y refresco de catálogos.
- [x] Crear selectores administrativos de cliente y equipos con estados de carga, error y recarga.
- [x] Simular respuestas de Sheets en pruebas; ninguna prueba automatizada debe escribir en producción.

### Criterio de salida

- [x] La UI permite buscar clientes y equipos y muestra cuándo se obtuvo el catálogo.
- [x] Un equipo sin identidad válida no puede seleccionarse.
- [x] Los casos de filas movidas, duplicadas o modificadas están cubiertos por pruebas.

## 6. Creación administrativa de órdenes

- [ ] Implementar los servicios y endpoints para crear y editar órdenes en borrador.
- [ ] Implementar alta, edición y eliminación de unidades mientras la orden esté en borrador.
- [ ] Impedir números de serie duplicados dentro de una orden.
- [ ] Implementar asignación y desasignación de varios equipos por unidad.
- [ ] Guardar snapshots del cliente y de cada equipo externo.
- [ ] Implementar asignación y reasignación de técnico.
- [ ] Implementar cancelación según las reglas acordadas para Sheets.
- [ ] Aplicar control de versión y devolver `409` ante ediciones obsoletas.
- [ ] Crear el flujo administrativo por pasos: cliente, servicio, unidades, equipos, técnico y revisión.
- [ ] Crear lista, filtros y detalle de órdenes según las convenciones de la API.
- [ ] Registrar auditoría de cambios relevantes de la orden.

### Criterio de salida

- [ ] Un administrador crea una orden con varias unidades y varios equipos por unidad.
- [ ] Otro administrador no puede sobrescribir silenciosamente una versión obsoleta.
- [ ] Un técnico no puede crear, editar, asignar ni cancelar órdenes.

## 7. Asignación, sincronización y outbox

- [ ] Revalidar cada equipo por ID/IMEI y comparar su snapshot inmediatamente antes de asignar.
- [ ] Comprobar en PostgreSQL que cada equipo no pertenezca a otra orden activa.
- [ ] Devolver `409 SHEET_ROW_CONFLICT` sin sobrescribir cambios externos.
- [ ] Escribir únicamente `J`, `L`, `M`, `N`, `O` y, si se aprueba, `P` mediante `batchUpdate`.
- [ ] Proteger explícitamente las columnas `A`, `I`, `K` y cualquier rango no autorizado.
- [ ] Crear `SheetSyncOperation` en la misma transacción local que la asignación.
- [ ] Implementar claves de idempotencia para asignación y sincronización.
- [ ] Implementar worker con bloqueo seguro, backoff exponencial, jitter y máximo de intentos.
- [ ] Verificar el estado remoto antes de reintentar escrituras con resultado ambiguo.
- [ ] Añadir estado visible de sincronización y reintento manual para administradores.
- [ ] Registrar métricas y logs del worker, cola y circuit breaker.

### Criterio de salida

- [ ] Una asignación correcta modifica exclusivamente las celdas autorizadas.
- [ ] Una operación fallida permanece visible, se puede reintentar y no se duplica.
- [ ] La orden no aparece como completamente sincronizada mientras existan operaciones fallidas.

## 8. Flujo de trabajo del técnico

- [ ] Implementar consulta de órdenes filtrada por el técnico autenticado.
- [ ] Crear las vistas mobile-first de “Mis órdenes”, detalle, unidades y progreso.
- [ ] Implementar la transición `ASSIGNED -> IN_PROGRESS` solo para el técnico asignado.
- [ ] Implementar verificación de cada equipo como coincidencia.
- [ ] Implementar reporte de discrepancias para IMEI, ID, serie, unidad y otros tipos.
- [ ] Permitir continuar y cerrar aunque existan discrepancias no resueltas.
- [ ] Implementar el checklist único por unidad con sus cinco categorías iniciales.
- [ ] Validar `Bien`, `Mal` o `No aplica` y exigir observación cuando el resultado sea `Mal`.
- [ ] Mostrar el progreso y los requisitos pendientes de cada unidad.
- [ ] Impedir cambios del técnico en órdenes completadas o que no le pertenezcan.

### Criterio de salida

- [ ] Un técnico solo puede consultar y modificar sus órdenes asignadas.
- [ ] Todas las reglas de transición, verificación, discrepancia y checklist tienen pruebas unitarias y de integración.

## 9. Evidencias y firma

- [ ] Implementar el adaptador S3 y configuración local con MinIO.
- [ ] Crear el flujo de evidencia `PENDING -> COMPLETED` con URL prefirmada.
- [ ] Generar las claves de objeto en el servidor según la estructura definida.
- [ ] Validar existencia, tipo MIME, tamaño y metadatos antes de confirmar una subida.
- [ ] Permitir JPEG, PNG y WebP dentro de los límites configurados.
- [ ] Implementar eliminación lógica autorizada y limpieza de subidas huérfanas.
- [ ] Crear captura móvil desde cámara/galería y compresión previa en Vue.
- [ ] Exigir al menos una foto completada por categoría, incluso para `No aplica`.
- [ ] Implementar captura del nombre y una firma PNG por orden.
- [ ] Servir evidencias y firma mediante URLs temporales autorizadas o proxy seguro.
- [ ] Auditar reemplazos o eliminaciones sin guardar binarios ni URLs firmadas en logs.

### Criterio de salida

- [ ] Los bytes de fotografías y firma existen solo en almacenamiento privado, no en PostgreSQL.
- [ ] No se puede confirmar una subida inexistente, demasiado grande o con tipo no permitido.
- [ ] Un usuario sin acceso a la orden no puede obtener URLs de sus objetos.

## 10. Cierre, cita fallida y correcciones

- [ ] Implementar el cálculo de completitud de todas las unidades en el backend.
- [ ] Exigir equipos verificados, checklist completo, fotos por categoría, nombre y firma para el cierre normal.
- [ ] Implementar cierre idempotente y transición a `COMPLETED`.
- [ ] Implementar cita fallida exigiendo únicamente un motivo no vacío.
- [ ] Implementar solicitud administrativa de corrección y retorno a trabajo técnico.
- [ ] Conservar evidencias y firmas anteriores al reabrir y auditar cualquier reemplazo.
- [ ] Implementar cancelación y reglas de inmutabilidad por estado.
- [ ] Crear resumen previo al cierre y mensajes claros sobre requisitos faltantes.

### Criterio de salida

- [ ] Una orden normal incompleta no puede cerrarse aunque la UI sea omitida.
- [ ] Una discrepancia no bloquea el cierre si se satisfacen los demás requisitos.
- [ ] Una cita fallida no solicita checklist, fotografías ni firma.

## 11. Frontend completo y PWA básica

- [ ] Completar dashboard, listado, filtros, detalle, auditoría y sincronización para administrador.
- [ ] Completar navegación, checklist, evidencias, firma, cierre y cita fallida para técnico.
- [ ] Cargar rutas de módulos de forma diferida y exponer cada módulo desde su `index.ts`.
- [ ] Mantener datos remotos en TanStack Query y reservar Pinia para sesión y UI global.
- [ ] Guardar en la URL los filtros que deban sobrevivir a recargas o enlaces compartidos.
- [ ] Normalizar estados de carga, vacío, error, confirmaciones y notificaciones.
- [ ] Aplicar diseño responsivo y accesible, priorizando el uso móvil del técnico.
- [ ] Crear manifest e instalación PWA.
- [ ] Cachear solo assets estáticos seguros y excluir respuestas autenticadas del service worker.
- [ ] Verificar que la interfaz no prometa funcionamiento offline.

### Criterio de salida

- [ ] Los flujos principales funcionan en viewport móvil y de escritorio.
- [ ] Una recarga de la aplicación conserva la sesión mediante refresh seguro, no mediante almacenamiento del JWT.
- [ ] Ningún dato autenticado sensible queda cacheado por el service worker.

## 12. Calidad, seguridad y observabilidad

- [ ] Completar pruebas unitarias de reglas de negocio, estados, autorización, filtros, tokens y resiliencia.
- [ ] Completar pruebas de integración de API, PostgreSQL, S3 simulado, Sheets simulado, outbox e idempotencia.
- [ ] Añadir pruebas de contrato entre OpenAPI y respuestas reales de Supertest.
- [ ] Automatizar escenarios E2E de administrador, técnico, varias unidades, discrepancia, firma, cierre y cita fallida.
- [ ] Probar restricciones de acceso entre dos técnicos diferentes.
- [ ] Exponer métricas de HTTP, autenticación, subidas, Sheets, outbox, breakers y órdenes por estado.
- [ ] Revisar TLS, CORS, cookies, claves, permisos de Google y bloqueo público del bucket.
- [ ] Revisar SQL crudo parametrizado, límites de entrada y redacción central de secretos.
- [ ] Ejecutar escaneo de dependencias y contenedores.
- [ ] Realizar pruebas de restauración de PostgreSQL y definir limpieza de objetos abandonados.

### Criterio de salida

- [ ] Los criterios técnicos de aceptación de `SPECS.md` están automatizados o documentados como verificación manual.
- [ ] No quedan vulnerabilidades críticas conocidas ni datos sensibles visibles en logs o respuestas.

## 13. CI/CD y staging

- [ ] Crear pipeline reproducible: instalación, lint, typecheck, pruebas, OpenAPI, build y escaneos.
- [ ] Ejecutar migraciones una sola vez por despliegue antes de activar la nueva versión.
- [ ] Preparar rollback y respaldo para migraciones destructivas.
- [ ] Seleccionar proveedores de PostgreSQL, almacenamiento S3 y hosting.
- [ ] Configurar desarrollo, staging y producción con secretos separados.
- [ ] Usar un documento de Google Sheets exclusivo para staging.
- [ ] Desplegar frontend, API, base de datos, bucket privado, reverse proxy y TLS.
- [ ] Preferir `/api` en el mismo sitio público para simplificar cookies y CORS.
- [ ] Ejecutar smoke tests automáticos contra los health checks después del despliegue.

### Criterio de salida

- [ ] Staging se despliega de manera repetible desde CI y supera smoke tests y E2E críticos.
- [ ] Los respaldos, restauración y rollback cuentan con procedimientos probados.

## 14. Piloto y migración desde AppSheet

- [ ] Inventariar usuarios, técnicos, estados y automatizaciones existentes en AppSheet.
- [ ] Cargar y validar usuarios y técnicos iniciales.
- [ ] Definir la retención operativa o legal de evidencias y firmas.
- [ ] Definir dominio productivo, recuperación de contraseña y canal de notificación.
- [ ] Ejecutar un piloto en paralelo con un grupo pequeño de administradores y técnicos.
- [ ] Comparar órdenes, asignaciones y evidencias entre ambos sistemas.
- [ ] Corregir hallazgos del piloto y repetir los escenarios críticos.
- [ ] Preparar capacitación, soporte y procedimiento de contingencia.
- [ ] Congelar nuevas altas en AppSheet en la fecha acordada.
- [ ] Cambiar la operación al sistema nuevo y conservar AppSheet temporalmente en modo consulta.
- [ ] Supervisar errores, sincronizaciones pendientes, tiempos de respuesta y adopción durante la estabilización.

### Criterio de salida del MVP

- [ ] Todos los criterios técnicos de aceptación de `SPECS.md` están cumplidos.
- [ ] El flujo completo de administrador y técnico funciona con datos y almacenamiento productivos.
- [ ] No existen sincronizaciones fallidas sin procedimiento de recuperación.
- [ ] El negocio aprueba el piloto y autoriza el retiro operativo de AppSheet.

## Trabajo posterior al MVP

- [ ] Evaluar modo offline completo solo con una estrategia explícita de conflictos y sincronización.
- [ ] Evaluar una columna protegida `SISTEMA_ID` en Sheets para identidad estable.
- [ ] Evaluar RBAC persistido cuando aparezcan más perfiles configurables.
- [ ] Incorporar recuperación de contraseña según el canal aprobado.
- [ ] Añadir exportación o reportes de auditoría si el negocio los requiere.
- [ ] Evaluar aplicaciones nativas, facturación, cuentas bancarias y tarifas como iniciativas separadas.
