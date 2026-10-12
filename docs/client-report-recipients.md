# Administrar destinatarios de reportes por cliente

Los administradores pueden registrar un cliente existente de Google Sheets y gestionar sus correos destinatarios en **Administración > Clientes** (`/admin/clients`). El envío manual se describe en [Enviar un reporte de orden de servicio por Gmail](report-email-delivery.md).

## Pasos rápidos

1. Seleccioná un cliente existente de Sheets y registrá su nombre local.
2. Seleccioná el cliente registrado para editar su nombre local o agregar, editar y eliminar correos.
3. Confirmá los cambios en la lista de destinatarios. El registro valida el ID contra Sheets desde el servidor; las ediciones de clientes y correos existentes siguen disponibles si Sheets no responde.

## Compatibilidad y validación

- `Client.clientSheetId` es único e inmutable. Coincide con el identificador de la columna A de Sheets, no con la posición de la fila.
- Los nombres locales de clientes y los correos destinatarios se guardan únicamente en PostgreSQL. No se escriben datos en Sheets ni se modifican las copias de datos de las órdenes o las respuestas del catálogo.
- Los correos se recortan y convierten a minúsculas, se validan por formato y son únicos dentro de cada cliente. Una misma dirección puede pertenecer a varios clientes. La validación no comprueba el DNS ni que la dirección pueda recibir correo.
- `/api/v1/clients` y sus rutas anidadas de correos requieren una cuenta de administrador activa. El catálogo `/api/v1/external/clients`, disponible para técnicos, nunca incluye correos destinatarios.
- Las mutaciones exitosas y sus registros de auditoría se confirman en una misma transacción. Las identidades inválidas, la falta de disponibilidad de Sheets, los registros duplicados y los correos inexistentes o pertenecientes a otro cliente producen errores de dominio.

## Verificación local y reversión

Aplicá la migración aditiva `20261007140000_client_report_recipients` antes de usar esta funcionalidad. La prueba específica de persistencia requiere una base PostgreSQL local configurada explícitamente con el nombre `puk_test`; nunca la apuntes a una base de datos compartida.

Antes de revertir los cambios, preservá los datos de destinatarios que deban conservarse. Eliminá en conjunto las rutas, el servicio, la interfaz, los contratos y las dos tablas nuevas. Las órdenes existentes, la generación de reportes, el inventario y los flujos de Sheets no requieren cambios para la reversión.

## Próximo paso

Configurá el remitente de Workspace en el entorno de la API según la [guía de envío por Gmail](report-email-delivery.md) y luego usá la acción explícita de envío del reporte. Administrar clientes y correos no envía mensajes ni modifica Sheets.
