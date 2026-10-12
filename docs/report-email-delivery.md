# Enviar manualmente un reporte de orden de servicio por Gmail

Un administrador puede enviar el PDF `READY` de una orden completada a correos registrados para el cliente desde **Enviar reporte**, en la tarjeta del reporte. La acción confirma una versión específica del PDF y crea un mensaje de Gmail separado para cada destinatario, de modo que cada persona ve únicamente su propia dirección.

## Flujo para el usuario

1. Registrá al cliente con su ID existente de Sheets y agregá sus correos destinatarios.
2. Abrí una orden completada cuyo reporte esté `READY`, elegí **Enviar reporte** y seleccioná los destinatarios. Podés agregar un correo del cliente en el momento; eso no envía nada.
3. Confirmá la versión del PDF y las direcciones seleccionadas. Revisá el resultado individual de cada envío.

La API rechaza IDs de destinatarios ajenos a la orden, selecciones vacías o duplicadas, órdenes incompletas, reportes que no estén listos o no correspondan a la orden, archivos faltantes y PDF que superen el límite de seguridad de 20 MiB. Se pueden seleccionar hasta 20 destinatarios por solicitud. Es un límite de la aplicación, no una afirmación sobre las cuotas de Gmail.

## Configuración del remitente de Workspace

La API envía desde el buzón configurado en `GOOGLE_GMAIL_SENDER_EMAIL`. Esa dirección se usa tanto como `subject` del JWT (el usuario de Workspace suplantado) como en el encabezado `From` del mensaje. Queda fija durante la ejecución del proceso de la API; no existe una opción para cambiar el remitente desde la web.

> **Límite de seguridad de DWD:** el remitente fijo es un control de la aplicación, no una restricción de Google. La delegación de dominio autoriza a la cuenta de servicio a solicitar suplantación de usuarios del dominio dentro de los scopes concedidos. Si la clave privada se compromete, alguien podría intentar enviar como otra cuenta del dominio. La decisión vigente es mantener DWD con controles operativos; OAuth por buzón queda como alternativa futura si se requiere que Google limite la identidad autorizada.

- Habilitá Gmail API en el proyecto de Google Cloud de la cuenta de servicio y activá la delegación de dominio para esa cuenta.
- Un **superadministrador** de Google Workspace debe autorizar el ID de cliente OAuth de la cuenta de servicio para el scope `https://www.googleapis.com/auth/gmail.send`. Esta integración no necesita scopes de lectura, modificación ni acceso completo al buzón.
- Se recomienda usar una cuenta de servicio exclusiva para Gmail y autorizar sólo el scope anterior. La aplicación técnicamente permite reutilizar una identidad de Sheets o Drive, pero hacerlo ampliaría el impacto potencial de una clave comprometida.
- Usá como remitente la dirección principal de un usuario activo de Workspace que tenga Gmail habilitado. La dirección de la cuenta de servicio no es el buzón remitente. Con la delegación de dominio, la cuenta de servicio puede suplantar usuarios de Workspace del dominio autorizado dentro de los scopes concedidos; no configures un buzón de otro dominio.

Variables de ejecución:

| Variable                    | Uso                                                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_GMAIL_CLIENT_EMAIL` | Correo de la cuenta de servicio que firma las solicitudes a Gmail API.                                                                 |
| `GOOGLE_GMAIL_PRIVATE_KEY`  | Clave privada de esa cuenta, provista de forma segura en tiempo de ejecución. Los `\n` literales se convierten en saltos de línea PEM. |
| `GOOGLE_GMAIL_SENDER_EMAIL` | Buzón principal de Workspace suplantado mediante `subject` del JWT y usado como `From`.                                                |

Las tres variables deben estar configuradas para habilitar el envío. Por defecto, la API carga el `.env` de la raíz del repositorio; `DOTENV_CONFIG_PATH` permite indicar otro archivo. Reiniciá la API después de cambiar el remitente. Si la configuración falta o está incompleta, las operaciones habituales de órdenes, reportes y descargas siguen disponibles, pero los envíos devuelven `503 REPORT_EMAIL_UNAVAILABLE`. Los valores de los buzones deben tener formato de correo. Se permite reutilizar una cuenta de servicio configurada para Sheets o Drive, aunque se recomienda una cuenta dedicada.

Para cambiar a otro buzón principal del dominio autorizado, alcanza con actualizar `GOOGLE_GMAIL_SENDER_EMAIL` en el entorno de la API y reiniciar el proceso; el superadministrador no necesita autorizar un scope adicional por cada buzón. La interfaz web no permite que un administrador de la aplicación elija el remitente. Los alias de envío no se pueden configurar de forma independiente: la implementación usa la misma dirección como buzón suplantado y como encabezado `From`.

No subas claves al repositorio, no imprimas valores de configuración ni recuperes secretos en texto plano dentro de una sesión de agente. Si un operador autorizado usa AWS Secrets Manager, debe inyectar referencias dinámicas mediante el mecanismo de ejecución `asm-exec`; este cambio no aprovisiona secretos ni concede permisos. No se modifica ningún archivo `.env`. Las pruebas pueden usar explícitamente `DOTENV_CONFIG_PATH=/dev/null` para evitar cargar un archivo dotenv local.

Referencias de configuración del proveedor: [guía de envío de Gmail](https://developers.google.com/workspace/gmail/api/guides/sending), [delegación de dominio para cuentas de servicio](https://developers.google.com/identity/protocols/oauth2/service-account#delegatingauthority) y [administración de la delegación en Workspace](https://support.google.com/a/answer/162106). Antes del despliegue, un administrador autorizado debe verificar la configuración de su organización y proyecto.

## Resultados, auditoría y reintentos

`POST /api/v1/orders/{id}/report/send` recibe `reportId` y `recipientIds`; nunca acepta direcciones arbitrarias como destino. `GET /api/v1/orders/{id}/report/recipients` devuelve únicamente el cliente asociado a esa orden y la disponibilidad del remitente. Ambas rutas requieren una cuenta de administrador activa.

Se registra una intención de envío en auditoría antes de llamar al proveedor y, después, un resultado sanitizado por destinatario. La vista de auditoría de la orden traduce estas acciones:

| Acción de auditoría                    | Significado                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `SERVICE_ORDER_REPORT_EMAIL_ATTEMPTED` | Se registró el intento antes de llamar a Gmail.                                                 |
| `SERVICE_ORDER_REPORT_EMAIL_SENT`      | Gmail aceptó el mensaje y devolvió un ID; esto no confirma su entrega en la bandeja de entrada. |
| `SERVICE_ORDER_REPORT_EMAIL_FAILED`    | No se pudo confirmar el resultado del envío.                                                    |

Los resultados generales son `SUCCESS`, `PARTIAL_FAILURE` o `FAILURE`, con estado `SENT` o `FAILED` por destinatario. La validación del correo comprueba únicamente el formato.

**No hay envíos ni reintentos automáticos.** Un timeout o una respuesta fallida pueden ocurrir después de que Gmail haya aceptado el mensaje. Por eso, los resultados inciertos se marcan como `DELIVERY_UNCONFIRMED`. La interfaz no muestra errores sin procesar del proveedor. Antes de reenviar manualmente, revisá la carpeta **Enviados** del buzón configurado; la interfaz quita de la selección de reintento a los destinatarios cuyo envío fue exitoso. La integración no lee esa carpeta porque solo tiene el scope `gmail.send`.

Gmail y PostgreSQL no comparten una transacción. Si falla la respuesta HTTP o el guardado del resultado de auditoría después de la aceptación, el resultado es incierto aunque exista un registro de intención. No reenvíes a ciegas. Los objetos de error del proveedor, los detalles de autenticación, el MIME sin procesar y las claves privadas nunca se incluyen en los resultados de entrega ni en los logs de errores del proveedor.

El envío lee los bytes almacenados del reporte seleccionado mediante Drive o el almacenamiento de objetos, sin invocar métodos de descarga ni generar registros de auditoría de descarga incorrectos. La visualización, descarga y generación de PDF existentes no cambian.

## Verificación y reversión

Las pruebas unitarias simulan Gmail y el almacenamiento; las pruebas de navegador interceptan todas las solicitudes a la API. No autorizan la cuenta de servicio, no llaman a Google ni a AWS, no inspeccionan credenciales reales ni demuestran la entrega efectiva. La verificación real del remitente y el despliegue requieren autorización explícita por separado.

Para deshabilitar el envío, omití las variables de Gmail. Para revertir este conjunto de cambios, quitá el adaptador de Gmail, la conexión del servicio y las rutas, los contratos, la interfaz, las pruebas y los campos opcionales de configuración de Gmail. Conservá la persistencia de clientes y correos destinatarios, además de los flujos existentes de reportes y descargas.
