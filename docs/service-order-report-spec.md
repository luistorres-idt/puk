# Especificación funcional — Reporte de orden de servicio

**Organización:** Bull Dog Solution

**Documento:** Reporte PDF de orden de servicio

**Fecha:** 2026-09-02

**Versión:** 0.1

**Estado al 2026-10-09:** Reporte PDF privado y versionado; se permite el envío manual por correo desde la vista web. El envío automático no está implementado.

## 1. Objetivo

Generar un reporte PDF formal por cada orden de servicio completada. El documento debe conservar la información que actualmente se presenta en AppSheet, permitir identificar con claridad el servicio realizado y mostrar las evidencias fotográficas con un tamaño suficiente para su revisión.

El reporte funciona como comprobante de atención para Bull Dog Solution y para el cliente. No sustituye los datos transaccionales de la aplicación: es una representación inmutable de la versión de la orden con la que fue generado.

## 2. Alcance

### 2.1 Incluido

- Generación automática al completar una orden de instalación, revisión o desinstalación.
- Descarga y consulta del PDF desde el detalle de la orden.
- Portada con identificación del servicio, datos del cliente, técnico, observaciones generales y firma.
- Una sección por cada unidad de la orden.
- Detalle de todos los equipos relacionados con cada unidad.
- Checklist y observaciones de la unidad.
- Evidencias fotográficas agrupadas por unidad; son una galería general y no se vinculan a una categoría del checklist.
- Regeneración controlada cuando una orden pase por corrección y vuelva a completarse.
- Acceso privado y auditado al documento.
- Envío manual del reporte PDF a las direcciones registradas para el cliente, con resultado por destinatario y auditoría.

### 2.2 Fuera de alcance inicial

- Edición manual del PDF después de generarlo.
- Plantillas diferentes por cliente.
- Envío automático por correo o mensajería; el envío es iniciado manualmente por un usuario desde la web.
- Reportes consolidados de varias órdenes.
- Reporte equivalente para citas fallidas.
- Firma criptográfica o sello fiscal del PDF.

## 3. Disparador y estados

1. El sistema solicita la generación cuando una orden normal cambia a `COMPLETED`.
2. La generación ocurre en segundo plano para que el cierre de la orden no dependa del tiempo de armado del PDF.
3. El reporte pasa por los estados `PENDING`, `PROCESSING`, `READY` o `FAILED`.
4. Si falla la generación, la orden permanece completada y un administrador puede reintentarla.
5. Si la orden entra a `REQUIRES_CORRECTION`, el último PDF deja de ser la versión vigente, pero se conserva para auditoría.
6. Cuando la orden corregida vuelve a `COMPLETED`, se genera una nueva versión.
7. Una versión `READY` nunca se sobrescribe; cada regeneración crea un archivo nuevo.

## 4. Estructura del documento

El documento se genera en tamaño Carta y orientación vertical. Debe respetar márgenes seguros de impresión, usar tipografía legible y presentar numeración de página en el pie, excepto cuando interfiera con la firma o una fotografía.

### 4.1 Portada

La primera página debe contener:

- Logotipo oficial de Bull Dog Solution.
- Título `REPORTE DE ORDEN DE SERVICIO`.
- Folio de la orden como elemento visual principal.
- Nombre del cliente.
- Tipo de servicio: instalación, revisión o desinstalación.
- Fecha programada del servicio.
- Fecha y hora de inicio y conclusión, cuando estén disponibles.
- Nombre del técnico responsable.
- Taller o domicilio del servicio, cuando aplique.
- Observaciones generales de la orden. Si no existen, mostrar `Sin observaciones generales`.
- Nombre de la persona que firma por parte del cliente.
- Imagen de la firma del cliente.
- Fecha y hora de firma.
- Leyenda de conformidad aprobada por el negocio.

El folio, cliente y logotipo deben poder identificarse sin ampliar el documento. La firma se escala conservando su proporción y nunca debe deformarse.

Las observaciones generales incluyen las notas capturadas durante la creación o ejecución de la
orden. Se trata de un único campo por orden; las notas específicas por unidad quedan fuera de este
alcance.

### 4.2 Detalle por unidad

Después de la portada se crea una sección independiente por cada unidad, en el mismo orden en que aparecen en la orden. Cada sección debe comenzar con un encabezado que repita el folio e identifique la unidad.

Datos requeridos:

- Nombre o etiqueta de la unidad (`label`).
- Marca y modelo (`makeModel`).
- Año, o `No registrado` cuando no exista.
- VIN o número de serie (`serialNumber`).
- Estado final de la unidad.

### 4.3 Equipos de la unidad

Cada unidad debe incluir todos sus equipos, aun cuando alguno tenga una discrepancia. Por cada equipo se presentan, cuando existan:

- Marca.
- Modelo.
- IMEI.
- Resultado de verificación: coincidente o discrepancia reportada.
- Descripción de la discrepancia y valores observados, cuando aplique.

El reporte omite expresamente el ID externo, ICCID, línea telefónica, operador, condición del equipo y estado del servicio del equipo.

Los campos opcionales sin información se muestran como `No registrado`; no se deben imprimir valores técnicos como `null`, `undefined` o claves internas.

### 4.4 Checklist de la unidad

Se incluye el resultado de las cinco categorías:

- Tablero.
- Cristales.
- Accesorios.
- Molduras.
- Carrocería.

Para cada categoría se muestra la condición en español (`Bien`, `Mal` o `No aplica`) y su observación. Cuando no exista observación, se muestra `Sin observaciones`.

### 4.5 Evidencias fotográficas

Las fotografías aparecen inmediatamente después de la información de la unidad a la que pertenecen. La categoría del checklist no se imprime en la página de evidencia, porque la fotografía puede documentar un elemento distinto a la categoría usada durante su captura.

Reglas de presentación:

- Una fotografía por página siempre que sea técnicamente posible.
- La imagen ocupa el área útil máxima de la página, conservando su proporción y sin recortarse.
- No se estira ni se deforma la imagen.
- Se permite rotarla automáticamente para aprovechar mejor la hoja según su orientación y metadatos EXIF.
- Una imagen de baja resolución no se amplía más allá de un límite que la vuelva ilegible; se centra sobre fondo blanco.
- Cada página muestra folio, unidad, número consecutivo de evidencia y fecha/hora de captura o carga disponible.
- Las evidencias se numeran consecutivamente dentro de la unidad.
- Solo se incluyen evidencias con estado `COMPLETED` y no eliminadas.
- Si una imagen no puede leerse, la generación falla de forma visible; el PDF no debe omitirla silenciosamente.

El objetivo visual es que la evidencia abarque casi toda la hoja para facilitar la inspección de detalles. No se usa un mosaico de miniaturas en esta primera versión.

## 5. Correspondencia con el modelo actual

| Contenido del reporte           | Fuente actual                                                     |
| ------------------------------- | ----------------------------------------------------------------- |
| Folio                           | `Order.folio`                                                     |
| Cliente                         | `Order.clientNameSnapshot`                                        |
| Tipo de servicio                | `Order.serviceType`                                               |
| Fecha programada                | `Order.scheduledAt`                                               |
| Inicio y conclusión             | `Order.startedAt`, `Order.completedAt`                            |
| Técnico                         | `Order.technician.name`                                           |
| Ubicación                       | `Order.serviceAddress` o datos del taller del técnico             |
| Observaciones generales         | `Order.generalNotes`                                              |
| Nombre y firma del cliente      | `Signature.signerName`, imagen en `Signature.objectKey`           |
| Fecha de firma                  | `Signature.signedAt`                                              |
| Nombre/modelo/año/VIN de unidad | `OrderUnit.label`, `makeModel`, `year`, `serialNumber`            |
| Datos de equipos                | Snapshots de `OrderEquipment`                                     |
| Checklist                       | `ChecklistItem.category`, `condition`, `notes`                    |
| Fotografías                     | `Evidence.objectKey`, `createdAt`, dimensiones y tipo MIME        |
| Discrepancias                   | `Discrepancy.description`, `expectedSnapshot`, `observedSnapshot` |

El reporte usa los snapshots guardados en la orden y no vuelve a consultar Google Sheets al generarse. Esto evita que una modificación posterior del catálogo cambie un acta ya emitida.

## 6. Reglas funcionales

- Solo se genera para órdenes normales en estado `COMPLETED`.
- Debe existir una firma válida antes de generar el reporte.
- Todas las unidades y todos los equipos de la orden deben aparecer.
- Una unidad sin equipos conserva su sección e indica `Sin equipos registrados`.
- No existe un límite funcional de páginas; el número depende de unidades, equipos y fotografías.
- Todas las fechas se presentan en la zona horaria configurada para la operación y con formato legible en español.
- Los textos largos deben continuar en la página siguiente, sin superponerse ni quedar cortados.
- El PDF debe representar caracteres en español correctamente.
- Los datos sensibles incluidos se limitan a los requeridos por el acta; no se muestran IDs UUID, claves S3, filas de Sheets ni información de auditoría interna.

## 7. Acceso y experiencia de usuario

- El administrador puede consultar y descargar cualquier reporte.
- El técnico puede consultar y descargar reportes de sus propias órdenes.
- El detalle de la orden muestra el estado de generación y las acciones `Descargar reporte` o `Reintentar generación`, según permisos.
- La descarga usa una URL temporal o un proxy autenticado; el objeto no es público.
- El nombre sugerido del archivo es `orden-servicio-{folio}-v{version}.pdf`, normalizando caracteres no seguros.
- Cada consulta, descarga, reintento y generación queda registrada en auditoría.

### Envío manual por correo

- Un usuario autorizado puede seleccionar destinatarios entre los correos registrados para el cliente y enviarles el PDF desde el detalle de la orden. No se envían correos automáticamente al completar una orden.
- Gmail usa `GOOGLE_GMAIL_CLIENT_EMAIL` y `GOOGLE_GMAIL_PRIVATE_KEY` para autenticarse, y suplanta el buzón configurado en `GOOGLE_GMAIL_SENDER_EMAIL`; esa dirección también aparece como `From`. Cambiarla requiere actualizar la configuración de la API y reiniciar el proceso. No hay selector web de remitente ni configuración independiente de alias.
- Un superadministrador de Workspace debe autorizar la delegación de todo el dominio para el scope `https://www.googleapis.com/auth/gmail.send`. Puede suplantarse cualquier usuario activo del dominio autorizado. Una identidad Gmail separada es recomendable, aunque la aplicación permite reutilizar la cuenta de servicio de Sheets o Drive.
- Auditoría: `SERVICE_ORDER_REPORT_EMAIL_ATTEMPTED`, `SERVICE_ORDER_REPORT_EMAIL_SENT` y `SERVICE_ORDER_REPORT_EMAIL_FAILED`. `SENT` confirma que Gmail aceptó el mensaje y devolvió un ID, no que llegó al buzón. Un fallo es no confirmado: antes de reintentar, revisar Enviados para evitar duplicados. Véase [entrega de reportes por correo](./report-email-delivery.md).

## 8. Persistencia propuesta

Se requiere una entidad de reporte versionado con, al menos:

- `id`.
- `orderId`.
- `orderVersion`.
- `status`.
- `objectKey` opcional hasta completar la generación.
- `mimeType` con valor `application/pdf`.
- `sizeBytes`.
- `checksum`.
- `generatedAt`.
- `failureReason` sanitizado.
- `createdAt` y `updatedAt`.

La clave sugerida en almacenamiento es:

```text
orders/{orderId}/reports/{reportId}.pdf
```

La restricción de unicidad debe evitar dos reportes vigentes para la misma combinación de orden y versión. Los reintentos deben ser idempotentes.

## 9. API propuesta

| Método | Ruta                          | Propósito                                      |
| ------ | ----------------------------- | ---------------------------------------------- |
| `GET`  | `/orders/:id/report`          | Obtener estado y metadatos del reporte vigente |
| `GET`  | `/orders/:id/reports`         | Consultar versiones anteriores permitidas      |
| `POST` | `/orders/:id/report/generate` | Solicitar generación o reintento idempotente   |
| `GET`  | `/orders/:id/report/download` | Obtener descarga autenticada o URL temporal    |

La generación automática reutiliza el mismo caso de uso que el endpoint manual. La respuesta de generación debe ser asíncrona (`202 Accepted`) cuando el archivo todavía no esté listo.

## 10. Requisitos no funcionales

- El PDF debe abrir correctamente en navegadores actuales, visores móviles y lectores estándar.
- La generación no debe cargar las imágenes completas en memoria simultáneamente.
- El proceso debe tolerar órdenes extensas mediante lectura y composición por flujo o por lotes.
- El acceso a fotografías, firma y reporte debe respetar el almacenamiento privado.
- Los errores no deben exponer claves de objetos, rutas internas ni URLs firmadas en logs.
- El checksum permite verificar que el archivo descargado corresponde a la versión generada.
- La salida debe ser determinista para una misma versión de orden, plantilla y recursos de marca.

## 11. Criterios de aceptación

1. Al completar una orden normal se crea automáticamente una solicitud de reporte.
2. La portada muestra logotipo, folio, cliente, fechas, técnico, observaciones generales, nombre y firma del cliente.
3. El PDF contiene una sección por cada unidad con nombre, marca/modelo, año y VIN o número de serie.
4. Cada sección contiene todos los equipos de la unidad y sus datos disponibles.
5. Las discrepancias se muestran junto al equipo correspondiente y no sustituyen los valores esperados.
6. El checklist muestra las cinco categorías, su condición traducida y sus observaciones.
7. Cada fotografía válida aparece una sola vez, asociada a su unidad; la categoría del checklist no se imprime en la página de evidencia.
8. Las fotografías se presentan, por defecto, una por página, grandes, sin recorte y sin deformación.
9. Una orden con varias unidades y varios equipos conserva correctamente la agrupación de datos y evidencias.
10. Los campos opcionales vacíos usan textos legibles y nunca muestran valores técnicos.
11. Un técnico sin acceso individual o compartido a la orden no puede consultar ni descargar el reporte.
12. El archivo se almacena de forma privada y la URL de descarga expira.
13. Un fallo de generación es visible y permite reintento sin duplicar la versión vigente.
14. Después de una corrección se genera una versión nueva y la anterior se conserva para auditoría.
15. Una prueba de regresión visual compara portada, detalle y páginas fotográficas contra documentos de referencia aprobados.

## 12. Casos mínimos de prueba

- Una unidad, un equipo y cinco fotografías verticales.
- Varias unidades y varios equipos por unidad.
- Fotografías verticales, horizontales y con orientación EXIF.
- Varias fotografías dentro de la misma categoría.
- Equipo con campos opcionales vacíos.
- Equipo con discrepancia y valores observados.
- Observaciones generales y de checklist de varias líneas.
- Imagen dañada o faltante.
- Reintento después de un fallo temporal de almacenamiento.
- Corrección y generación de una segunda versión.
- Intento de descarga por administrador, técnico asignado, técnico con acceso compartido a la orden y técnico sin acceso.

## 13. Definiciones pendientes de negocio y diseño

Antes de aprobar la plantilla final se deben confirmar:

1. Archivo oficial del logotipo, variantes permitidas y colores de marca.
2. Texto exacto de la leyenda de conformidad junto a la firma.
3. Si la fecha principal de portada será la programada, la de inicio o la de conclusión.
4. Si `serialNumber` siempre representa el VIN o si se requiere un campo separado.
5. Nombre comercial de cada dato proveniente de `rawSnapshot` que también deba mostrarse.
6. Política de retención y visibilidad de versiones anteriores.
7. Si el cliente tendrá posteriormente un canal directo de descarga o envío.
8. Si se requiere simultáneamente una variante A4 además del formato Carta.
