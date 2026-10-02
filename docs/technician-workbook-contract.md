# Contrato del libro de técnicos y cobro

Versión: `1.1-implemented`, 2026-09-10. Estado: directorio, tarifas, cálculo de snapshots,
persistencia y sincronización del reporte técnico implementados. La validación externa de directorio
y escritura en staging ocurrió históricamente; AWS staging fue eliminado después y no existe
despliegue actual. Las pruebas automatizadas siguen cubriendo los contratos localmente.

## Identidad y configuración

El libro se configura por ambiente; su ID no se incrusta en código ni en fixtures.
El 2026-09-09 el usuario proporcionó el ID del libro y confirmó su uso para
desarrollo/staging. Se verificó el directorio mediante la API con la cuenta de
servicio configurada en la aplicación.
El usuario confirmó los nombres exactos de las pestañas: `DIRECTORIO TECNICO` para
el directorio y `2026` para el reporte del año actual. Los encabezados del directorio
están en la fila 1; los del reporte siguen pendientes de verificación. Debe definirse qué fecha determina la
pestaña anual en publicaciones atrasadas o correcciones de órdenes de años previos.

El usuario confirmó que actualmente no existe una clave externa y autorizó agregar
`ID_TECNICO` al final de `DIRECTORIO TECNICO`, después de todas las columnas
existentes, sin sobrescribirlas ni interferir con ellas. Se acordaron códigos como
`TEC-0001`, asignados una sola vez y nunca reutilizados. Antes de escribir hay que
inspeccionar las columnas existentes, incluidas las que no tengan encabezado o estén
ocultas, y comprobar que `ID_TECNICO` no haya sido agregado entretanto.

El usuario creó `ID_TECNICO` en `W1` y autorizó usar W. La inspección confirmó 88
técnicos en filas 2–89, sin valores ni fórmulas previos en sus celdas W y sin celdas
combinadas o rangos protegidos en el directorio.

El 2026-09-09 se escribieron 88 valores de texto fijos, `TEC-0001` a `TEC-0088`,
únicamente en `W2:W89`. Se releyó el directorio antes de escribir para detectar cambios
y después se comparó el contenido completo contra el resultado esperado. Se
verificaron 88 IDs únicos y la conservación de los valores/fórmulas de todas las
demás celdas. No se modificaron formatos ni estructura del libro.

El usuario autorizó una excepción puntual para usar las credenciales existentes de
la aplicación dentro del proceso para esta inicialización, sin mostrarlas ni
copiarlas. Esa excepción no modifica las instrucciones generales de `AGENTS.md`.
El comando de mantenimiento `apps/api/scripts/assign-technician-ids.mjs` inspecciona
por defecto; la escritura exige `--apply` y la huella del contenido inspeccionado.
Una repetición sobre un directorio completamente inicializado no escribe nada.
Las altas posteriores requieren un asignador persistente que no recicle IDs de
técnicos retirados; el comando rechaza mezclar IDs existentes con nuevas celdas vacías.

El UUID local sigue siendo la referencia de órdenes y usuarios. Las filas movidas
conservan identidad; las retiradas se desactivan sin
eliminar historia; las claves duplicadas abortan la importación completa. Una fila
sin clave o nombre no es seleccionable. No se deriva identidad del número de fila.

La integración usa `GOOGLE_TECHNICIANS_SPREADSHEET_ID`,
`GOOGLE_TECHNICIANS_SHEET_NAME` y `GOOGLE_TECHNICIAN_REPORT_SHEET_NAME`, separadas del
libro de clientes e inventario. Los ejemplos de prueba utilizan identificadores ficticios como
`development-workbook` y `TECH-DEMO-001`.

## Directorio: campos requeridos por la issue #7

Posiciones y encabezados verificados por API en `DIRECTORIO TECNICO`, fila 1:

| Columna | Encabezado exacto            |
| ------- | ---------------------------- |
| A       | TECNICO                      |
| B       | TALLER                       |
| C       | RAZON SOCIAL                 |
| D       | TELEFONO                     |
| E       | CORREO                       |
| F       | DIRECCIÓN                    |
| G       | CIUDAD                       |
| H       | ESTADO                       |
| I       | FACTURA                      |
| J       | DATOS FISCALES               |
| K       | DIRECCION FISCAL             |
| L       | COSTO SALIDA DEL TALLER      |
| M       | CAMBIO DE EQUIPO             |
| N       | INSTALACION                  |
| O       | REVISION                     |
| P       | DESINSTALACION               |
| Q       | CITA FALLIDA                 |
| R       | SENSOR FUEL                  |
| S       | NOTAS ADICIONALES            |
| T       | NOMBRE DE LA CUENTA BANCARIA |
| U       | CUENTA BANCARIA              |
| V       | BANCO                        |
| W       | ID_TECNICO                   |

S–V ya existían y se preservaron. El catálogo solicitado no requiere importar los
datos bancarios de T–V. La nullabilidad no especificada en la issue se debe acordar,
no inferir; los tipos funcionales previstos se detallan abajo.

| Campo lógico            | Tipo previsto                  | Nullabilidad acordada en la issue |
| ----------------------- | ------------------------------ | --------------------------------- |
| Clave externa           | Texto estable único            | No                                |
| Técnico                 | Texto                          | No                                |
| Taller                  | Texto                          | Pendiente                         |
| Razón social            | Texto                          | Pendiente                         |
| Teléfono                | Texto                          | Pendiente                         |
| Correo                  | Texto                          | Sí                                |
| Dirección               | Texto                          | Pendiente                         |
| Ciudad                  | Texto                          | Pendiente                         |
| Estado                  | Texto                          | Pendiente                         |
| Factura                 | Indicador/dato por confirmar   | Pendiente                         |
| Datos fiscales          | Texto/estructura por confirmar | Sí                                |
| Dirección fiscal        | Texto                          | Sí                                |
| Costo salida del taller | Decimal                        | Pendiente                         |
| Cambio de equipo        | Decimal                        | Pendiente                         |
| Instalación             | Decimal                        | Pendiente                         |
| Revisión                | Decimal                        | Pendiente                         |
| Desinstalación          | Decimal                        | Pendiente                         |
| Cita fallida            | Decimal                        | Sí                                |
| Sensor fuel             | Decimal                        | Pendiente                         |

Una celda monetaria vacía se representa como `null`; cero requiere un valor explícito.
Un importe inválido impide usar esa tarifa para cobro. Moneda, escala, redondeo y
separadores requieren aprobación. No se interpreta `$` como prueba de una moneda.

### Base de cobro confirmada

El usuario confirmó que se toma la tarifa del técnico correspondiente al servicio
y se multiplica por el total de equipos de la orden, no por el número de vehículos:
`costo base = tarifa por equipo × cantidad total de equipos`.
Por ejemplo, dos vehículos con tres equipos cada uno multiplican la tarifa por seis.
El snapshot debe conservar tanto la tarifa por equipo como la cantidad aplicada y
el costo base resultante. El usuario confirmó que una orden `FAILED_APPOINTMENT`
solo es cobrable cuando la tarifa del técnico en `CITA FALLIDA` existe y es válida;
si está vacía o es inválida, no se genera cobro. El tratamiento de equipos
retirados/nuevos en cambios de equipo se definirá al acordar ese flujo. El usuario
confirmó que,
cuando correspondan por servicio a domicilio, los viáticos equivalen al costo de
salida del taller y se suman una sola vez por orden, sin multiplicarlos por la
cantidad de equipos.

La tarifa se congela al completar la orden. Antes de `COMPLETED`, los cambios
permitidos de técnico, servicio o modalidad pueden recalcular el importe. Si una
orden completada se reabre por corrección, se recalcula con la tarifa vigente del
técnico y se conserva una versión/auditoría del ajuste.

La moneda acordada para tarifa, viáticos y total es `MXN` (pesos mexicanos). Los
importes se redondean a 2 decimales (centavos) con redondeo normal.

## Reporte: mapeo solicitado

| Columna | Encabezado propuesto | Fuente / regla                                                                                   |
| ------- | -------------------- | ------------------------------------------------------------------------------------------------ |
| A       | sem                  | Semana ISO provisional (lunes–domingo) desde `scheduledAt` en `America/Hermosillo`; configurable |
| B       | orden                | Folio único de la orden                                                                          |
| C       | tecnico              | Nombre snapshot del técnico                                                                      |
| D       | nombre               | Captura manual; la aplicación no escribe ni modifica                                             |
| E       | rfc                  | Captura manual; la aplicación no escribe ni modifica                                             |
| F       | economico            | Etiquetas de unidades separadas por salto de línea                                               |
| G       | serie                | Series, en el mismo orden que F                                                                  |
| H       | imei/id              | IMEI o ID externo, agrupados en el orden de las unidades                                         |
| I       | **Sin encabezado**   | Nombre snapshot del cliente                                                                      |
| J       | fecha                | Fecha programada (`scheduledAt`) en `America/Hermosillo`                                         |
| K       | servicio             | Etiqueta del tipo de servicio                                                                    |
| L       | costo                | Costo base del snapshot                                                                          |
| M       | viaticos             | Viáticos aplicados del snapshot                                                                  |
| N       | total                | Costo + viáticos, aritmética decimal                                                             |
| O       | envio dhl            | Administración manual: la aplicación jamás escribe esta celda                                    |
| P       | notas                | Notas de la orden y motivo de cita fallida cuando corresponda                                    |

Solo se autorizan las columnas administradas explícitamente por la aplicación en el
futuro escritor del reporte. `D` (`nombre`), `E` (`rfc`) y `O` (`envio dhl`) son
manuales: no se pueden leer-modificar-escribir ni incluir en `batchUpdate`, aunque
estén vacías. No se puede enviar una fila `A:P`. Esta regla
corresponde al **reporte**: la columna O de `SALIDAS` tiene otra función (serie) y
conserva su política de escritura actual.

El folio identifica el cobro; filas duplicadas abortan la escritura. La clave local
de idempotencia incluye orden y versión. Reintentos y correcciones actualizan el
mismo folio. Antes de escribir se validan encabezados e identidad remota.

## Decisiones funcionales y estado de implementación

| Decisión                     | Regla confirmada e implementada                                                           | Estado                               |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------ |
| Unidad de cobro              | Tarifa del técnico por servicio × total de equipos (1 en cambio de equipo)                | Confirmado e implementado localmente |
| Moneda, decimales y redondeo | Aritmética decimal en MXN, 2 decimales y redondeo normal                                  | Confirmado e implementado localmente |
| Congelación                  | Al completar (`COMPLETED`); congelado en snapshot de la orden                             | Confirmado e implementado localmente |
| Viáticos                     | `isHomeService` activa costo de salida del taller una vez por orden                       | Confirmado e implementado localmente |
| Estados cobrables            | `COMPLETED`; `FAILED_APPOINTMENT` solo con tarifa CITA FALLIDA válida                     | Confirmado e implementado localmente |
| Inclusión en reporte         | Toda `FAILED_APPOINTMENT` aparece en outbox aunque no tenga tarifa                        | Confirmado e implementado localmente |
| Importe sin tarifa           | `0.00` en costo y total cuando CITA FALLIDA no tiene tarifa válida                        | Confirmado e implementado localmente |
| Nombre/RFC                   | Columnas D (`nombre`) y E (`rfc`) son manuales: no se tocan ni escriben                   | Confirmado e implementado localmente |
| Columna DHL                  | Columna O (`envio dhl`) es manual: nunca se escribe ni se sobrescribe                     | Confirmado e implementado localmente |
| Fecha, semana, zona horaria  | `scheduledAt`; semana ISO y zona `America/Hermosillo`                                     | Confirmado e implementado localmente |
| Correcciones                 | Reabrir folio, recalcular con tarifa vigente, actualizar fila y version                   | Confirmado e implementado localmente |
| Permiso de corrección        | Solo el rol `ADMIN` puede reabrir una orden completada                                    | Confirmado e implementado localmente |
| Motivo de corrección         | Comentario opcional al reabrir; no bloquea la operación                                   | Confirmado e implementado localmente |
| Fallo de sincronización      | Outbox pendiente reintentable; no bloquea cierre ni corrección                            | Confirmado e implementado localmente |
| Programación del reporte     | Corte martes; envío miércoles 17:00 en `America/Hermosillo`; configuración administrativa | Confirmado e implementado localmente |
| Reintento de sincronización  | Manual inmediato por administrador o automático con backoff vía worker                    | Confirmado e implementado localmente |
| Fila inexistente             | Inserción automática (rangos A:C, F:N, P); búsqueda por folio                             | Confirmado e implementado localmente |
| Estado final en SALIDAS      | Al completar se reencola por equipo para reparar asignaciones omitidas o desactualizadas  | Confirmado e implementado localmente |
| Instalación                  | Cliente y vehículo en J, L:O; estado `INSTALADO` en K                                     | Flujo implementado localmente        |
| Revisión                     | Conserva cliente, vehículo y estado `INSTALADO`                                           | Flujo implementado localmente        |
| Sensor fuel                  | Equipo de stock; al finalizar escribe cliente, vehículo y estado `INSTALADO`              | Flujo implementado localmente        |
| Desinstalación               | Equipo retirado pasa a `STOCK TECNICO` (K) y se limpian J, L, M, N, O                     | Flujo implementado localmente        |
| Cambio de equipo             | 1 unidad cobrada; anterior -> `STOCK TECNICO` + limpia J y L:O; nuevo -> hereda vehículo  | Flujo implementado localmente        |

## Validación en desarrollo y staging

La lectura del directorio y la escritura de IDs en W se ejecutaron en staging.
Los flujos de cálculo de snapshots de cobro, persistencia en Postgres, outbox,
sincronización con preservación de columnas D, E y O, y control de correcciones
están cubiertos con pruebas unitarias y de integración automáticas.
Las pruebas automatizadas utilizan identificadores ficticios y mocks locales;
nunca tocan producción ni registran información fiscal, contactos o payloads
completos en logs ni métricas.
