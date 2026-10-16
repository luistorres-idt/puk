# Implementación de almacenamiento en Google Drive

Este documento resume la integración con Google Drive y mediciones de rendimiento realizadas durante su implementación. Las pruebas descritas son evidencia histórica acotada a sus entornos; no equivalen a una medición del tiempo total de uso en producción.

> **Estado actual:** Drive es el proveedor exclusivo de archivos; los adaptadores S3/MinIO y sus flujos prefirmados fueron eliminados de la aplicación. Las comparaciones con S3 que aparecen más abajo son resultados históricos, no opciones activas ni instrucciones operativas. No se tocaron recursos u objetos remotos.

## Resumen

- Google Drive compartido es el proveedor único configurado para evidencias, firmas y reportes. El ambiente AWS fue eliminado y no está desplegado. La aplicación requiere credenciales completas de Drive en producción. Producción no tiene IaC propia ni está desplegada.
- En modo Drive, los archivos pasan por la API para mantener autenticación y permisos; el navegador no recibe credenciales de Google ni enlaces públicos.
- Las evidencias pertenecen a la unidad del vehículo, no a una categoría del checklist.
- No se migran los objetos de prueba que quedaron en S3.

## Dónde se guarda cada archivo

```text
Drive compartido/
└── Cliente/
    ├── VIN/
    │   └── Folio de orden/       ← fotografías de evidencia: evidencia-<id>.<ext>
    └── Órdenes/
        └── Folio de orden/       ← firma y versiones del reporte PDF
```

Las carpetas se crean cuando hacen falta. La API conserva un mapeo entre la identidad lógica de cada carpeta y su ID de Drive, de modo que los reintentos reutilicen la misma carpeta y no dependan de que los nombres sean únicos. La carpeta de orden bajo `Órdenes` permite guardar allí la firma y los PDF compartidos por todas las unidades de esa orden.

## Cómo fluye una evidencia en modo Drive

1. El navegador envía la imagen a una ruta autenticada de la API, identificando orden y unidad.
2. La API valida el acceso, que la unidad pertenezca a la orden, el formato y el tamaño de la imagen.
3. Se reserva en la base de datos la evidencia con estado pendiente y una clave de idempotencia; también se reserva un ID de archivo de Drive.
4. La API crea la carpeta que falte y carga el archivo en Drive con un nombre genérico `evidencia-...`, sin asociarlo a BODYWORK.
5. Al completar la carga, la evidencia queda asociada directamente a la unidad. Si una respuesta se pierde, el reintento puede reconciliar la reserva y el archivo en vez de generar otra evidencia.

Las firmas y los reportes PDF también se sirven mediante rutas autenticadas de la API. Para mostrar imágenes privadas, el cliente solicita el archivo y lo presenta usando una URL temporal del navegador; esas URLs se liberan cuando dejan de usarse.

## Checklist y evidencias son conceptos separados

Las secciones del checklist (tablero, ventanas, accesorios, molduras y carrocería) conservan sus requisitos de revisión. Las fotos, en cambio, forman una galería general por unidad: no se pide una foto para cada sección. El mínimo de evidencia configurado se cuenta en el total de fotos de la unidad.

La migración `20260925120000_evidence_unit_owner` conserva las filas de evidencia existentes y las reasigna a su unidad antes de retirar la relación con el elemento del checklist. Ya se aplicó en la base local `puk` de `localhost:5433`; **no copia archivos de S3 a Drive ni borra objetos de S3**.

## Diferencia de velocidad frente a S3

En el flujo S3, el navegador puede subir directamente a una URL prefirmada. En Drive, el flujo actual envía la imagen a la API y la API la carga a Drive; al leerla, la API también obtiene el archivo para entregarlo al cliente. Ese recorrido adicional es una explicación plausible de la lentitud observada, pero no sustituye una medición: latencia de red, tamaño de imagen y respuestas de los proveedores también influyen.

**Impacto conocido:** la experiencia de carga y visualización de imágenes con Drive es significativamente más lenta que con S3. Antes de cambiar el diseño, conviene medir por separado subida y descarga con imágenes comparables y registrar tamaño, tiempo total y percentiles. No hay en este cambio una optimización de rendimiento ni una cifra de benchmark.

### Medición local

Se ejecutaron 10 muestras medidas por tamaño y proveedor, en secuencia alternada, con una precarga por proveedor/tamaño excluida del resultado. Cada muestra subió y descargó los mismos bytes de una imagen JPEG sintética; se comprobó que los bytes recibidos fueran idénticos. Los tiempos cubren el I/O del almacenamiento, no el renderizado en pantalla. Drive usa `getFile` (consulta de metadatos y descarga); S3 usa una URL prefirmada y una petición GET directa.

| Tamaño del archivo         | Operación | Drive mediana (p90) |  S3 mediana (p90) | Razón de medianas Drive/S3 |
| -------------------------- | --------- | ------------------: | ----------------: | -------------------------: |
| 0.52 MiB (547,209 bytes)   | Subida    | 1,588 ms (1,706 ms) | 22.7 ms (28.2 ms) |                        70× |
| 0.52 MiB (547,209 bytes)   | Lectura   |     845 ms (951 ms) |   3.4 ms (4.2 ms) |                       249× |
| 2.55 MiB (2,671,488 bytes) | Subida    | 3,151 ms (4,923 ms) | 33.5 ms (40.3 ms) |                        94× |
| 2.55 MiB (2,671,488 bytes) | Lectura   | 1,112 ms (1,185 ms) |   5.5 ms (5.9 ms) |                       202× |

**Límite importante:** el endpoint S3 configurado para esta prueba resuelve a `localhost`; no es un bucket AWS remoto. Por lo tanto, estos números describen la configuración local y no deben interpretarse como comparación entre Google Drive y S3 en producción: el recorrido de red no es equivalente. Sí confirman que, en este entorno, el flujo de Drive tarda mucho más. Para una comparación de producción habría que repetirla contra el bucket S3 real desde la misma región o máquina donde corre la API. Los archivos temporales de ambos proveedores se eliminaron al terminar.

### Prueba contra el bucket S3 remoto

Después se repitió la prueba contra el bucket remoto indicado, en `us-east-2`, usando el endpoint regional estándar de AWS. La prueba corrió desde la misma máquina para ambos proveedores, con los mismos JPEG sintéticos, 10 muestras medidas por proveedor/tamaño, orden alternado y una precarga excluida. AWS documenta el endpoint regional como `s3.us-east-2.amazonaws.com` ([referencia de endpoints](https://docs.aws.amazon.com/general/latest/gr/s3.html)).

| Tamaño del archivo         | Operación | Drive mediana (p90) | S3 remoto mediana (p90) | Razón de medianas Drive/S3 |
| -------------------------- | --------- | ------------------: | ----------------------: | -------------------------: |
| 0.52 MiB (547,209 bytes)   | Subida    | 1,518 ms (1,884 ms) |         410 ms (645 ms) |                      3.70× |
| 0.52 MiB (547,209 bytes)   | Lectura   |   903 ms (1,199 ms) |       512 ms (1,283 ms) |                      1.76× |
| 2.55 MiB (2,671,488 bytes) | Subida    | 1,883 ms (2,238 ms) |         553 ms (893 ms) |                      3.41× |
| 2.55 MiB (2,671,488 bytes) | Lectura   | 1,136 ms (1,211 ms) |       880 ms (1,801 ms) |                      1.29× |

En esta medición, Drive tuvo medianas más altas en ambas operaciones y ambos tamaños. La diferencia de lectura fue menor con el archivo grande; además, el p90 de descarga S3 tuvo variación notable, así que conviene no concluir solo a partir de medianas. La prueba mide I/O de almacenamiento y no incluye interfaz, autenticación de la aplicación, base de datos ni resolución de carpetas; tampoco representa el tiempo total percibido por una persona en producción.

El bucket tiene versionado habilitado. Por eso, el borrado normal deja marcadores y conserva versiones anteriores: se eliminaron de forma explícita las 22 versiones y sus 22 marcadores creados por esta prueba, y se verificó que no quedaran registros para el prefijo temporal. También se retiraron la carpeta y los archivos temporales de Drive.

## Otros cambios relacionados aún sin commit

- Separación de la evidencia del checklist a la unidad, incluyendo API, contratos, vistas, consultas, reportes y pruebas.
- Rutas de evidencia con alcance por unidad y validación de que la unidad pertenezca a la orden.
- Reintentos idempotentes para cargas de Drive y nombre de archivo neutral para las fotos.
- Lectura privada de evidencia, firma y PDF desde Drive; S3/MinIO ya no forman parte del código.
- Ajuste de la respuesta de firma para que la vista previa pueda mostrar el nombre de quien firmó.
- Limpieza de operaciones del cliente de Drive que no tenían uso.
- Actualizaciones de `docs/google-drive-integration-plan.md` y `spec.md`, además de pruebas asociadas.

Estos cambios permanecen sin commit en el árbol de trabajo. La generación del cliente Prisma y la migración local ya se ejecutaron. La última verificación reportada para el código fue: 91 pruebas de API aprobadas, typecheck de API y web aprobados, y `git diff --check` limpio.

## Referencias

- [Plan de integración de Google Drive](./google-drive-integration-plan.md)
- [Especificación de la integración](../spec.md)
- Implementación: `apps/api/src/integrations/google-drive/` y `apps/api/src/modules/execution/`
