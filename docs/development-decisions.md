# Decisiones temporales para desarrollo

Estas reglas desbloquean el desarrollo sin conceder acceso a datos productivos. Deben validarse con el negocio antes del piloto.

## Google Sheets

- Desarrollo y staging usan documentos separados, nunca el documento productivo.
- La pestaña `Clientes` debe exponer `IDCliente` y `Cliente`; `SALIDAS` debe conservar los encabezados y posiciones descritos en `SPECS.md`.
- La identidad estable usa `ID` cuando es válido y, en su ausencia, IMEI como respaldo temporal. Valores `PENDIENTE`, `N/A`, vacíos o identidades duplicadas/incompletas no son seleccionables.
- La columna `P` queda deshabilitada por defecto. Si el negocio la habilita, solo acepta `INSTALACION`, `REVISION` o `DESINSTALACION`.
- Cancelar una orden sincronizada no revierte Sheets ni crea una compensación automática; el caso requiere revisión administrativa.
- Las unidades y equipos solo se modifican mientras la orden permanece en `DRAFT`; una corrección reabre la ejecución, no la configuración de unidades.
- La columna `K` se actualiza a `INSTALADO` o `STOCK TECNICO` según el resultado. La base local también evita asignaciones concurrentes mientras la orden está activa.
- Antes de asignar se fuerza una lectura fresca y se compara la fila actual con el snapshot. Para la columna J (`Cliente`), la comparación aplica `isMatchingClient` y `normalizeString` (insensible a mayúsculas, acentos, espacios y sufijos legales como `S.A. de C.V.`) contra el nombre y el ID del cliente de la orden. Una diferencia de cliente con una empresa ajena produce `409 SHEET_ROW_CONFLICT`.

## Evidencias

- Cada fotografía admite JPEG, PNG o WebP, con máximo de 10 MiB.
- Se exigen al menos diez fotografías completadas por unidad, distribuidas entre las categorías. No existe un máximo funcional por categoría.
- La firma PNG tiene un máximo de 1 MiB.
- Los límites se configuran por entorno y el backend siempre los vuelve a validar.

## Revisión previa a integración

Antes de conectar un documento real se debe registrar, sin copiar datos sensibles al repositorio:

1. propietario y ambiente del documento;
2. cuenta de servicio con acceso mínimo;
3. encabezados observados y fecha de validación;
4. conteos de duplicados, vacíos, `PENDIENTE`, `N/A` e identidades incompletas;
5. aprobación o reemplazo explícito de las decisiones temporales anteriores.
