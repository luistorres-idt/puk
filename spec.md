# Especificación: almacenamiento de órdenes en Google Drive

## Objetivo

Guardar las nuevas evidencias fotográficas, firmas y versiones PDF de órdenes de servicio en un Drive compartido de la organización. La aplicación conserva el control de acceso: los navegadores no reciben credenciales de Google ni enlaces públicos de Drive.

Esta especificación define el comportamiento a implementar. El contexto y el flujo actual se describen en [el plan de integración](docs/google-drive-integration-plan.md).

## Alcance y exclusiones

- Los objetos y registros actuales de S3 son datos de prueba descartables. **No se migran** ni se requiere lectura histórica dual S3/Drive.
- Esta feature no autoriza borrar objetos de S3 ni ejecutar `cleanup-orphaned-objects.ts`. El descarte físico requiere una operación posterior, explícita y verificada.
- La aplicación debe funcionar en desarrollo y pruebas sin acceso a un tenant real mediante un adaptador de almacenamiento de prueba.
- No se publican archivos de Drive ni se solicita inicio de sesión de Google a técnicos o administradores.
- La conservación o eliminación de firmas originales y versiones PDF no cambia en esta feature.

## Estructura y referencias

```text
Drive compartido de la aplicación/
  Nombre del cliente/
    Serie o VIN de la unidad/
      Folio de la orden/
        Evidencias de esa unidad
    Órdenes/
      Folio de la orden/
        firma.png
        reporte-v1.pdf
        reporte-v2.pdf
```

1. La carpeta de cliente se identifica en la aplicación por `Order.clientSheetId` y muestra `clientNameSnapshot` como nombre. Si cambia el nombre visible, se conserva su identidad de carpeta.
2. Dentro del cliente, la carpeta de unidad se identifica por la serie/VIN normalizada de `OrderUnit.serialNumber`. `OrderUnit.id` no se usa como identidad entre órdenes. El formato de normalización debe definirse y probarse para evitar que variaciones de escritura creen carpetas distintas de la misma unidad.
3. Las evidencias de una unidad se guardan bajo su serie/VIN y el `Order.folio` correspondiente.
4. La firma única de la orden y cada versión PDF se guardan una sola vez bajo `Órdenes/<folio>`, incluso si hay una sola unidad. El nombre de cada versión debe distinguirla sin sobrescribir otra.
5. La base de datos conserva los IDs de Drive necesarios para localizar carpetas y archivos. Las rutas y nombres visibles no son el mecanismo de autorización ni la única fuente de identidad.
6. La API crea las carpetas faltantes bajo el padre correcto y reutiliza las carpetas cuya identidad lógica ya está registrada en la base de datos. No adopta una carpeta preexistente únicamente porque coincida su nombre visible: ese nombre no prueba a qué cliente o unidad pertenece. La operación debe tolerar reintentos y cargas simultáneas sin asociar un archivo a una carpeta de otro cliente, unidad u orden.

## Requisitos funcionales

### RF-1. Carga de evidencias

- Una persona autorizada adjunta una fotografía a una unidad y categoría de checklist de una orden.
- La web envía el archivo a un endpoint autenticado de la API; deja de hacer `PUT` directo a S3/MinIO mediante URL firmada.
- La API valida acceso, tipo real y tamaño antes de subir a Drive; resuelve `Cliente/Serie-VIN/Folio`, guarda el ID de archivo y confirma la carga solo después de comprobar el éxito de Drive.
- Una falla o interrupción no deja evidencia marcada como completa sin archivo recuperable. Los reintentos no crean registros completos duplicados.
- Cada carga de evidencia usa una clave UUID de idempotencia. La API reserva el ID de Drive y la fila pendiente antes de transferir bytes; repetir la misma clave reconcilia el archivo reservado y no crea otra evidencia.

### RF-2. Firma de la orden

- La web envía el PNG de firma a la API bajo una sesión autorizada para esa orden.
- La API la guarda en `Cliente/Órdenes/Folio`, conserva su ID de Drive y la vincula a la orden, sin aceptar una referencia a un archivo ajeno proporcionada por el cliente.
- Cada intento usa una clave UUID de idempotencia y un ID de Drive reservado por el servidor. Una firma sustituida conserva su referencia anterior para respetar la política actual de retención; esta feature no ejecuta limpieza física.
- La firma original sigue disponible para vista previa y regeneración de reportes conforme a la política vigente.

### RF-3. Reportes PDF

- El generador lee las evidencias y la firma desde Drive, incorpora todas las unidades de la orden y guarda cada versión del PDF en `Cliente/Órdenes/Folio`.
- Cada versión mantiene su propio ID de archivo, estado y metadatos. El estado `READY` solo se establece cuando el PDF es recuperable.
- El ID de Drive de cada versión se reserva antes de generar o subir el PDF; si el proceso se interrumpe, el siguiente intento reutiliza esa identidad y verifica el contenido remoto antes de marcar `READY`.
- Una regeneración no sobrescribe ni pierde una versión anterior que deba conservarse.

### RF-4. Lectura y descarga privadas

- Para fotografía, firma o PDF, la API verifica autorización sobre la orden y transmite el contenido desde Drive al cliente.
- La web usa endpoints de la aplicación, no URLs públicas ni tokens de Google; conserva las vistas previas y la descarga de PDF.
- Los errores de acceso o ausencia de archivo no revelan contenido a personas no autorizadas.

### RF-5. Configuración y puesta en marcha

- La identidad de la integración tiene acceso acotado al Drive compartido de la aplicación; no se requiere delegación de todo el dominio por defecto.
- ID de Drive y mecanismo de autenticación se configuran por entorno. Ninguna credencial ni contenido sensible se almacena en código, en el spec o en registros.
- Sin configuración válida de Drive en el entorno de producción, la aplicación falla de forma explícita o impide activar nuevas escrituras; no guarda silenciosamente archivos reales en S3.
- Antes de activar Drive con datos reales se invalidan de forma controlada las referencias de prueba a S3 que ya no serán accesibles. Esto no implica borrar físicamente el bucket.

## Criterios de aceptación

1. Una orden con dos unidades de distinto VIN crea/reutiliza un cliente, dos carpetas de unidad y una carpeta común de orden; sus fotos no se mezclan, y solo hay una firma y una copia de cada versión PDF.
2. Dos órdenes del mismo cliente y VIN reutilizan la carpeta de unidad, pero mantienen carpetas de folio distintas.
3. Nombres iguales entre clientes no mezclan carpetas; cambios de nombre visible del cliente no rompen referencias existentes.
4. Cargas repetidas o concurrentes con la misma clave no dejan carpetas, archivos o registros activos duplicados para la misma identidad lógica.
5. Fallas de Drive antes de finalizar una carga no producen evidencia `COMPLETED` ni reporte `READY` sin archivo; los reintentos pueden recuperarse.
6. Personas no autorizadas no pueden cargar, consultar ni descargar archivos; los archivos no quedan públicos.
7. Fotografías, firmas y todas las versiones PDF nuevas pueden verse o descargarse desde la aplicación, sin depender de URLs firmadas de S3.
8. Pruebas automáticas cubren resolución de carpetas, autorización, errores de Drive, tamaños y tipos de archivo, subida, lectura y regeneración de reportes.
9. El corte no exige migración histórica y no ejecuta la limpieza de S3.

## Dependencias y decisiones externas

- TI debe confirmar un Drive compartido, su capacidad, permisos de la identidad de aplicación y políticas del tenant.
- El mecanismo exacto de autenticación desde AWS y el alcance OAuth mínimo se validan en un piloto; no se incluyen secretos reales en esta especificación.
- El descarte de registros de prueba y el borrado físico de S3 se planifican como operaciones separadas, con autorización y verificación específicas.

## Trazabilidad

- Plan de integración: [`docs/google-drive-integration-plan.md`](docs/google-drive-integration-plan.md).
- Issue de GitHub: [#28 — Google Drive storage](https://github.com/luistorres-idt/puk/issues/28).
