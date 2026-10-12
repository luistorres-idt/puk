# Variables, secretos y responsables

Los valores locales no sensibles se documentan en `.env.example`. Los secretos reales viven en el gestor de secretos de cada ambiente y nunca se registran en Git ni en logs.

| Grupo       | Variables                                                                                                                        | Sensible               | Responsable propuesto  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------- |
| Aplicación  | `NODE_ENV`, `PORT`, `APP_ORIGIN`, `API_ORIGIN`, `TRUST_PROXY`                                                                    | No                     | Plataforma             |
| PostgreSQL  | `DATABASE_URL`, `DIRECT_URL`                                                                                                     | Sí                     | Plataforma             |
| JWT         | `JWT_*_PRIVATE_KEY`, `JWT_*_PUBLIC_KEY`, issuer, audience y TTL                                                                  | Claves privadas        | Seguridad/Plataforma   |
| Cookies     | `COOKIE_DOMAIN`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`                                                                             | No                     | Backend                |
| Archivos    | Drive: `GOOGLE_DRIVE_CLIENT_EMAIL`, `GOOGLE_DRIVE_PRIVATE_KEY`, `GOOGLE_DRIVE_SHARED_DRIVE_ID`; adaptador S3 opcional con `S3_*` | Credenciales e IDs     | Plataforma / Workspace |
| Sheets      | spreadsheet ID, cuenta de servicio, clave privada y pestañas                                                                     | Credenciales e ID      | Operaciones/Plataforma |
| Gmail       | `GOOGLE_GMAIL_CLIENT_EMAIL`, `GOOGLE_GMAIL_PRIVATE_KEY`, `GOOGLE_GMAIL_SENDER_EMAIL`                                             | Clave privada y correo | Plataforma / Workspace |
| Límites     | tamaños, TTL de URLs y caché                                                                                                     | No                     | Backend/Producto       |
| Resiliencia | timeouts, reintentos, breaker y outbox                                                                                           | No                     | Backend/SRE            |
| Logs        | `LOG_LEVEL`                                                                                                                      | No                     | SRE                    |

Desarrollo puede usar PostgreSQL y MinIO locales con las credenciales ficticias de `.env.example`. Google Drive es el proveedor elegido en IaC de staging, pero el ambiente AWS está eliminado y sus secretos deben recrearse; producción no está desplegada. La integración de Sheets puede usar el adaptador simulado local o credenciales específicas del entorno.

Gmail habilita el envío manual de reportes cuando las tres variables `GOOGLE_GMAIL_*` están configuradas. La decisión vigente es mantener la delegación de dominio (DWD) con únicamente el scope `https://www.googleapis.com/auth/gmail.send`; el superadministrador de Workspace concede esa autorización. Se recomienda una cuenta de servicio exclusiva para Gmail. Plataforma custodia la clave y el remitente efectivo. La API usa `GOOGLE_GMAIL_SENDER_EMAIL` como asunto de suplantación y encabezado `From`; cambiarlo requiere reiniciar la API y el navegador no puede elegirlo.

El remitente fijo limita el flujo normal de la aplicación, no la autoridad concedida por DWD: si se filtra la clave, se podría intentar suplantar otra cuenta del dominio dentro del scope. Se debe restringir el acceso a la clave al runtime y los operadores necesarios, excluirla de Git, imágenes y logs, y mantener un procedimiento de rotación/revocación y revisión de la autorización DWD. OAuth por buzón queda como alternativa no implementada si luego se requiere una restricción de identidad impuesta por Google. La integración no está conectada al task definition CDK: agregar variables al secreto AWS por sí solo no habilita Gmail en un despliegue.
