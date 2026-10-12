# Evaluación: migrar el envío de reportes de Gmail a OAuth de usuario

**Estado:** decisión tomada el 2026-10-12: mantener DWD; OAuth no se implementa por ahora.
**Alcance:** reemplazar la autenticación Gmail basada en cuenta de servicio y delegación de dominio por OAuth 2.0 autorizado únicamente por el buzón `reportes@dominio`.

## Resumen ejecutivo

La decisión actual es **continuar con delegación de dominio (DWD)** y proteger el flujo de la aplicación, sin migrar a OAuth por ahora. La alternativa OAuth se conserva aquí como evaluación de referencia, no como trabajo aprobado. Se eligió DWD porque no está disponible hoy un dominio/callback HTTPS para el flujo web propuesto; esta decisión acepta que DWD no restringe en Google la identidad suplantable a un único buzón.

La alternativa OAuth conserva riesgos propios: su refresh token permitiría seguir actuando como el buzón autorizado y tendría que tratarse como una credencial de alto impacto. Esa ruta requeriría un procedimiento de reconexión si la cuenta revocara el acceso o el token dejara de ser válido.

**Riesgo aceptado y límite:** DWD concede autoridad para solicitar acceso como usuarios del dominio dentro de los scopes otorgados. Fijar `GOOGLE_GMAIL_SENDER_EMAIL` protege contra cambios accidentales a través del flujo normal de la app, pero no convierte esa configuración en una restricción de Google; quien obtenga la clave privada puede intentar suplantar otras identidades del dominio. OAuth quedaría como alternativa futura si se requiere que Google limite la identidad autorizada al buzón `reportes@dominio`.

### Controles para operar DWD con menor riesgo

El código ya fija el remitente desde `GmailConfig` y no lo acepta en la solicitud web; además, el envío requiere un administrador y los destinatarios deben pertenecer al cliente de la orden. Esos controles reducen el riesgo de abuso por el flujo normal de la aplicación, pero no restringen una clave de servicio comprometida.

- Mantener únicamente el scope `https://www.googleapis.com/auth/gmail.send` en la autorización de Workspace; no agregar scopes de lectura o administración.
- Usar una cuenta de servicio dedicada a Gmail, separada de las identidades de Sheets y Drive. El código permite reutilizar credenciales, pero eso no es el estándar operativo recomendado.
- Mantener un solo remitente configurado en el backend. El cliente web no envía ni puede elegir `sender`; los destinatarios siguen restringidos a los correos registrados para el cliente de la orden.
- Guardar la clave privada en un gestor de secretos con acceso limitado a la API y operadores autorizados. No copiarla a Git, imágenes, logs o artefactos; definir responsables y procedimiento para rotarla o revocarla.
- Auditar cambios de autorización DWD y configuración del remitente; alertar ante errores o volumen de envío inusual.

Estos controles reducen el riesgo de uso accidental o exposición amplia, pero **no eliminan la capacidad de suplantación de DWD si se compromete la clave**. AWS staging está eliminado/no desplegado y el task definition CDK no mapea las variables de Gmail; habilitar Gmail en AWS requiere cambios explícitos de IaC.

## Situación actual del proyecto

La integración actual (`apps/api/src/integrations/gmail/gmail.client.ts`) crea un `google.auth.JWT`, incluye `GOOGLE_GMAIL_SENDER_EMAIL` como `subject` y llama `users.messages.send` con `userId: 'me'`. La API carga la configuración al iniciar el proceso. El remitente está fijado por entorno y la app no lo elige desde la web.

El envío se inyecta como `ReportMailPort` al servicio de reportes. Esa abstracción permite reemplazar la autenticación del cliente Gmail sin cambiar las reglas de destinatarios, PDF, rutas ni auditoría. No hay hoy un flujo de consentimiento OAuth, almacenamiento de refresh token ni botón de conexión de Workspace.

La documentación de operación indica que CDK todavía no conecta `GOOGLE_GMAIL_*` al task definition. La migración a OAuth no debe asumir que AWS ya puede enviar: además de la autenticación, deberá conectarse de forma explícita el nuevo secreto y la configuración a la tarea de API.

## Comparación para decidir

| Criterio                                | Actual: service account + DWD                                                     | Propuesta: OAuth de `reportes@dominio`                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Límite de identidad impuesto por Google | El cliente autorizado puede actuar como usuarios del dominio dentro de los scopes | El grant pertenece a la cuenta que autorizó la app; no se usa `sub` para suplantar otros usuarios           |
| Setup                                   | Más simple tras la autorización inicial de Super Admin                            | Requiere consentimiento inicial de la cuenta `reportes@` y guardar un refresh token                         |
| Continuidad tras reinicios              | Depende de conservar la clave privada                                             | Depende de conservar el refresh token y client credentials; no requiere mantener un access token en memoria |
| Dependencia de una cuenta humana        | No para renovar credenciales                                                      | Sí: la cuenta debe seguir activa y su grant debe seguir vigente                                             |
| Recuperación                            | Rotar/reemplazar clave o retirar DWD                                              | Reautorizar la cuenta cuando el refresh token deje de ser válido                                            |
| Riesgo principal                        | Clave filtrada con capacidad de suplantación dentro del dominio                   | Refresh token filtrado con capacidad de envío desde el buzón autorizado                                     |
| Alcance Gmail                           | `gmail.send`                                                                      | El mismo scope mínimo: `https://www.googleapis.com/auth/gmail.send`                                         |

OAuth limita la **cuenta autenticada**. Para fijar además el encabezado `From` a la dirección primaria `reportes@dominio`, el backend debe construirlo desde configuración confiable, ignorar cualquier remitente del navegador y no habilitar alias en el flujo. Si el buzón tiene alias de envío configurados, hay que revisarlos y decidir si se eliminan; OAuth no sustituye esa regla de la aplicación.

## Flujo de autorización y refresco propuesto

### Conexión inicial o reconexión

1. Un administrador con permiso específico inicia **Conectar Gmail** desde una pantalla administrativa. No debe existir un endpoint público ni habilitarse para técnicos.
2. La API genera un `state` aleatorio, de un solo uso y con vencimiento corto; guarda su hash, el administrador que inició el flujo y el vencimiento. Vincula el callback a esa misma sesión administrativa.
3. La API redirige el navegador al endpoint de Google con el scope `gmail.send`, `access_type=offline`, `response_type=code`, el `state` y un `redirect_uri` HTTPS exacto. Solicita `prompt=consent` en la primera conexión o reconexión cuando haga falta recuperar el refresh token, no en cada envío.
4. La cuenta `reportes@dominio` inicia sesión y autoriza el acceso. `login_hint` puede sugerir esa cuenta, pero no demuestra su identidad.
5. Google redirige a un callback de la API. La API valida `state` y su uso único, intercambia el código en el servidor (nunca en el navegador) y verifica la identidad autorizada. Se recomienda incluir `openid email` para validar el `email` verificado contra el valor esperado `GOOGLE_GMAIL_SENDER_EMAIL`; el dominio (`hd`) por sí solo no reemplaza la comparación exacta del buzón.
6. La API guarda el refresh token cifrado y sólo entonces marca Gmail como conectado. Nunca devuelve tokens al frontend, logs o respuestas HTTP. Registra actor, fecha, buzón conectado y resultado de la operación, pero no el token.
7. El administrador prueba el envío con un destinatario de prueba autorizado y confirma en Gmail que el mensaje salió del buzón esperado.

Los callbacks de OAuth para aplicaciones web deben usar HTTPS y coincidir exactamente con una URI registrada. Google exceptúa `localhost` del requisito HTTPS para desarrollo local; para ambientes remotos se necesita un dominio propio y TLS. Ver [reglas de redirect URI](https://developers.google.com/identity/protocols/oauth2/web-server#redirect-uri-validation-rules) y [protección del parámetro `state`](https://developers.google.com/identity/protocols/oauth2/resources/best-practices).

### Envío normal y renovación

1. El backend carga el refresh token desde almacenamiento seguro y construye el cliente OAuth2; el usuario final no participa en cada envío.
2. La librería obtiene un access token y lo renueva cuando sea necesario. El access token es temporal; no hay que pedir consentimiento cada hora ni mantener la API ejecutándose para que el refresh token siga existiendo.
3. El envío continúa usando `ReportMailPort`, el destinatario validado del cliente y el PDF seleccionado. El `From` se fija en backend al buzón autorizado.
4. Si Google responde `invalid_grant`, `admin_policy_enforced` u otro error que indique token revocado/expirado, la API deja Gmail como no disponible, emite una alerta y pide reconexión administrativa. No debe entrar en un ciclo de reintentos de consentimiento.

Al persistir credenciales nuevas, el backend debe conservar el refresh token anterior si una respuesta de Google no incluye uno nuevo. La documentación de Google advierte que los refresh tokens pueden revocarse, dejar de usarse por seis meses, invalidarse tras un cambio de contraseña cuando contienen scopes de Gmail, o dejar de funcionar por políticas administrativas. Debe existir un procedimiento de reconexión y no asumirse que un refresh token es perpetuo. [Reglas de expiración e invalidación](https://developers.google.com/identity/protocols/oauth2#expiration).

## ¿Cuánto uptime hace falta?

**No se necesita uptime continuo de 24/7 para conservar la autorización.** Sí hace falta que la API esté accesible durante la conexión inicial y el callback, que normalmente es una operación interactiva de pocos minutos. El código de autorización es de un solo uso: si el callback o el intercambio fallan, se inicia una nueva conexión.

Después de guardar el refresh token de forma durable, la API puede reiniciarse o quedar fuera de servicio sin perder la autorización. Al volver, carga el token y pide un access token nuevo cuando necesite enviar. El servicio necesita estar operativo cuando un usuario vaya a enviar el reporte, pero ésa es disponibilidad de la funcionalidad, no una exigencia de OAuth para mantener el token.

| Periodo sin uso/servicio                                          | Efecto esperado y acción                                                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Reinicios o despliegues rutinarios                                | No requieren reconsentimiento si el refresh token está persistido y se restaura correctamente.                                        |
| Días o semanas sin envíos                                         | No requieren mantener una instancia siempre activa. Puede hacerse una verificación periódica de renovación desde una tarea operativa. |
| Seis meses sin usar el refresh token                              | Google indica que puede caducar por inactividad; no dejarlo sin uso por ese periodo.                                                  |
| Revocación, cambio de contraseña o bloqueo del scope por política | El refresco puede fallar antes; alertar y reconectar explícitamente.                                                                  |

**Recomendación operativa:** habilitar una comprobación de credenciales al inicio de la API (sin enviar correo) y una alerta inmediata ante fallo; además programar una verificación de renovación al menos mensual si no hubo envíos. Una alerta mensual es una medida preventiva, no garantía de validez. Si se necesita un SLO de envío, definirlo aparte; OAuth por sí mismo no prescribe un porcentaje de uptime.

## Configuración por ambiente

Usar un OAuth Client de tipo **Web application** por ambiente, redirect URI distinta y credenciales/tokens separados. No reutilizar el refresh token entre entornos ni permitir que pruebas envíen a destinatarios reales.

| Ambiente         | OAuth Client / redirect URI                                                  | Cuenta que autoriza                                                                            | Custodia                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Desarrollo local | Cliente dev; callback `http://localhost:<puerto>/...` registrado exactamente | Buzón de prueba, por ejemplo `reportes-dev@dominio`                                            | Secret manager local aprobado o archivo `.env` ignorado por Git con permisos del usuario; nunca copiar el token de producción |
| Test/CI          | Cliente y callback de test aislados; usar mocks en pruebas automáticas       | Preferentemente sin buzón real para CI; si hace falta integración real, buzón de test dedicado | Secretos de CI protegidos; no exponer en logs ni en artefactos                                                                |
| Staging          | Cliente staging y callback HTTPS propio                                      | `reportes-staging@dominio` o buzón explícitamente designado                                    | Secret Manager del ambiente; actualmente staging AWS está eliminado/no desplegado según la documentación del repositorio      |
| Producción       | Cliente prod y callback HTTPS del dominio productivo                         | Sólo `reportes@dominio`                                                                        | AWS Secrets Manager/KMS o mecanismo de producción aprobado, con lectura limitada a la tarea API                               |

Crear los clientes y registrar las URIs en Google Cloud Console; el archivo del repositorio no debe contener client secrets ni tokens. Configurar la pantalla de consentimiento como **Internal** si la app sólo será usada por cuentas de la organización y esa opción está disponible para el proyecto. Google indica que las apps internas de Workspace no requieren verificación adicional de los scopes sensibles/restringidos, aunque las políticas del tenant pueden bloquear o limitar el acceso. Confirmarlo con el administrador del Workspace antes del desarrollo. [Configuración del consentimiento](https://developers.google.com/workspace/guides/configure-oauth-consent).

Variables candidatas (nombres a confirmar en el diseño de implementación):

| Variable                                                   | Propósito                                                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_GMAIL_OAUTH_CLIENT_ID`                             | Identifica el cliente OAuth del ambiente.                                                                                 |
| `GOOGLE_GMAIL_OAUTH_CLIENT_SECRET`                         | Secreto de cliente, sólo backend.                                                                                         |
| `GOOGLE_GMAIL_OAUTH_REDIRECT_URI`                          | Callback exacto del ambiente.                                                                                             |
| `GOOGLE_GMAIL_SENDER_EMAIL`                                | Buzón esperado y `From` fijo; validar contra la identidad OAuth autorizada.                                               |
| `GOOGLE_GMAIL_REFRESH_TOKEN` o referencia a almacenamiento | Credencial duradera de la cuenta autorizada; preferir almacenamiento cifrado fuera de variables/artefactos de despliegue. |

En producción no se recomienda inyectar el refresh token como texto plano en una variable normal si el entorno permite leerlo desde Secrets Manager o una tabla cifrada mediante KMS. Si hay varias réplicas, todas deben leer la misma credencial durable; los refreshes concurrentes deben manejarse sin sobrescribir una actualización válida. El IAM del task role debe limitarse al secreto/clave necesarios, y sólo la tarea de API debería poder leerlo.

## Almacenamiento y controles de seguridad

- Cifrar refresh token en reposo con KMS/Secrets Manager o cifrado de campo con una clave protegida por KMS; restringir la lectura a la identidad de ejecución de API y a operadores de seguridad autorizados.
- Guardar el client secret en el gestor de secretos; no persistir access tokens salvo que exista una razón operativa. Mantener el refresh token durable y separado por ambiente.
- No colocar tokens en logs, trazas, URLs, auditoría, errores, frontend, source maps, backups sin cifrar ni variables compartidas de CI.
- Usar `state` impredecible de un solo uso, vencimiento corto y vinculado a sesión; validar callback y `email_verified`/dirección exacta. Proteger el callback contra CSRF y replay.
- Exigir autenticación administrativa reforzada para conectar, desconectar o reemplazar la cuenta; auditar quién y cuándo realizó el cambio sin guardar credenciales.
- Limitar scope a `gmail.send`; mantener la lógica actual de API que restringe destinatarios al cliente de la orden y tamaño del PDF.
- Restringir `From` a `reportes@dominio` del lado servidor. No confiar en el `From`, dirección destino o buzón esperado enviados por el navegador.
- Al desconectar, revocar el grant/token en Google cuando sea posible y borrar la copia almacenada. Definir rotación/reautorización y respuesta ante filtración.
- Evitar enviar correo en health checks; comprobar disponibilidad de credenciales sin exponerlas. Alertar sobre `invalid_grant`, revocaciones y errores sostenidos de Gmail.

## Impacto esperado de implementación

El diseño aprovecha `ReportMailPort`, pero incorpora persistencia de OAuth, endpoints administrativos de conexión/callback/desconexión, protección de `state`, validación exacta del buzón, almacenamiento seguro, estado de disponibilidad, pruebas de ciclo de vida y configuración de callbacks/secretos por ambiente. No basta con cambiar `JWT` por `OAuth2Client` y mantener el token sólo en memoria: eso haría que despliegues/reinicios rompan el envío.

### Alcance mínimo para una primera entrega

1. Añadir configuración OAuth y un almacenamiento cifrado/durable de la cuenta autorizada.
2. Implementar inicio/callback/desconexión sólo para administradores, con `state` de un solo uso.
3. Validar que el email OAuth verificado coincida exactamente con `GOOGLE_GMAIL_SENDER_EMAIL`.
4. Reemplazar el constructor JWT por OAuth2 con refresh automático y conservar tokens nuevos sin borrar el refresh token existente.
5. Exponer estado conectado/no conectado sin filtrar secretos; mapear errores de revocación a `REPORT_EMAIL_UNAVAILABLE` y una alerta accionable.
6. Probar autorización, callback inválido/replay, tokens ausentes, refresh, reinicio, revocación, identidad incorrecta y destinatarios restringidos.
7. Configurar y verificar cada ambiente; probar en buzón de test antes de activar producción.

## Plan de migración sin cortar el envío

1. Crear y configurar clientes OAuth separados para dev/test y producción; verificar políticas del Workspace y acceso de `reportes@`.
2. Implementar OAuth detrás de configuración desactivada, sin retirar todavía DWD.
3. Desplegar la persistencia y el callback productivo con HTTPS. Mientras se autoriza la nueva identidad, mantener el método actual disponible para rollback.
4. Conectar `reportes@dominio`, persistir el refresh token y probar un envío controlado. Confirmar remitente, auditoría y recuperación tras reinicio.
5. Cambiar el proveedor activo a OAuth en producción. Monitorear errores y mantener rollback corto y controlado; evitar dos caminos de credenciales indefinidos.
6. Cuando OAuth esté estable, revocar la autorización DWD en Admin Console, retirar la clave de servicio Gmail del runtime y destruirla conforme a la política de retención. No reutilizarla para Sheets/Drive.

## Riesgos y criterios de aceptación

**Riesgo residual:** quien robe el refresh token puede enviar correo desde `reportes@dominio` hasta que el grant sea revocado o el token deje de ser válido. OAuth no restringe destinatarios ni evita abuso si la credencial o el backend se comprometen; para eso siguen siendo necesarios controles de aplicación, gestión de secretos, monitoreo y respuesta a incidentes.

La migración se considera aceptable cuando:

- no existe DWD Gmail autorizado para la integración de reportes;
- el callback sólo guarda credenciales para el buzón esperado, verificado y autorizado;
- no se puede cambiar el remitente desde el cliente web;
- reiniciar o desplegar la API no requiere volver a consentir;
- una revocación falla cerrada, se alerta y hay una reconexión administrativa documentada;
- test/staging/prod no comparten token, callback ni buzón accidentalmente;
- las pruebas automáticas no requieren credenciales reales ni llaman a Gmail.

## Preguntas para cerrar antes de implementar

- ¿`reportes@dominio` será una cuenta Workspace con licencia Gmail activa y administrada, o un alias? Para este diseño se recomienda una cuenta primaria real.
- ¿Quién será responsable de completar la autorización inicial y reconectar si se revoca?
- ¿El administrador de Workspace permite una app OAuth interna con `gmail.send` y la política de sesión del buzón no exige reautenticación frecuente?
- ¿Cuál será el host HTTPS productivo del callback y dónde se almacenará el refresh token en cada ambiente?
- ¿Se necesita un buzón separado de test/staging y un destinatario de prueba controlado?

## Fuentes oficiales

- [OAuth 2.0 para aplicaciones web de servidor](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Reglas de expiración de refresh tokens](https://developers.google.com/identity/protocols/oauth2#expiration)
- [Buenas prácticas OAuth: `state` y manejo de refresh tokens](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
- [Configuración de consentimiento y scopes de Google Workspace](https://developers.google.com/workspace/guides/configure-oauth-consent)
- [Validación de URI de redirección](https://developers.google.com/identity/protocols/oauth2/web-server#redirect-uri-validation-rules)
- [Scope Gmail `gmail.send`](https://developers.google.com/workspace/gmail/api/auth/scopes)
